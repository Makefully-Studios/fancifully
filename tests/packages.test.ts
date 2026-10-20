import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import { findStoryJsonPath, isFanciZip, loadFanciFromZip } from '../src/load/loadFanci.ts';
import { isEpubZip, loadEpubFromZip } from '../src/load/loadEpub.ts';
import { unpackZip } from '../src/load/zipArchive.ts';
import { FANCI_EXTENSION } from '../src/load/packageTypes.ts';

describe('package formats', () => {
  const blobUrls: string[] = [];

  before(() => {
    if (typeof URL.createObjectURL !== 'function') {
      URL.createObjectURL = () => {
        const url = `blob:test/${blobUrls.length}`;
        blobUrls.push(url);
        return url;
      };
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      URL.revokeObjectURL = () => undefined;
    }
  });

  after(() => {
    blobUrls.length = 0;
  });

  it('uses .fanci extension (not .fan)', () => {
    assert.equal(FANCI_EXTENSION, '.fanci');
  });

  it('loads a .fanci zip with story.json and rewrites asset paths', () => {
    const zipped = zipSync({
      'story.json': strToU8(
        JSON.stringify({
          id: 'pack',
          pageSize: { width: 100, height: 200 },
          assets: {
            cover: { type: 'image', src: 'images/cover.png' },
          },
          pages: [
            {
              id: 'p1',
              blocks: [{ id: 't', type: 'text', html: '<p>Hi</p>' }],
            },
          ],
        }),
      ),
      'images/cover.png': new Uint8Array([137, 80, 78, 71]),
    });

    const entries = unpackZip(zipped);
    assert.equal(isFanciZip(entries), true);
    assert.equal(isEpubZip(entries), false);
    assert.equal(findStoryJsonPath(entries), 'story.json');

    const pack = loadFanciFromZip(entries);
    assert.equal(pack.story.id, 'pack');
    assert.match(pack.story.assets.cover.src, /^blob:/);
    assert.ok(pack.blobUrls.length >= 1);
  });

  it('imports a minimal EPUB spine into a Story', () => {
    const zipped = zipSync({
      'META-INF/container.xml': strToU8(`<?xml version="1.0"?>
        <container>
          <rootfiles>
            <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
          </rootfiles>
        </container>`),
      'OEBPS/content.opf': strToU8(`<?xml version="1.0"?>
        <package>
          <metadata>
            <dc:title>Tiny EPUB</dc:title>
            <meta name="viewport" content="width=600, height=800"/>
          </metadata>
          <manifest>
            <item id="p1" href="page1.xhtml" media-type="application/xhtml+xml"/>
            <item id="img1" href="images/a.png" media-type="image/png"/>
          </manifest>
          <spine>
            <itemref idref="p1"/>
          </spine>
        </package>`),
      'OEBPS/page1.xhtml': strToU8(`<?xml version="1.0"?>
        <html xmlns="http://www.w3.org/1999/xhtml">
          <body><p id="w1">Hello</p><img src="images/a.png" alt=""/></body>
        </html>`),
      'OEBPS/images/a.png': new Uint8Array([137, 80, 78, 71]),
    });

    const entries = unpackZip(zipped);
    assert.equal(isEpubZip(entries), true);
    assert.equal(isFanciZip(entries), false);

    const pack = loadEpubFromZip(entries);
    assert.equal(pack.story.title, 'Tiny EPUB');
    assert.equal(pack.story.pageSize.width, 600);
    assert.equal(pack.story.pages.length, 1);
    assert.equal(pack.story.pages[0].blocks[0].type, 'text');
    assert.match(String((pack.story.pages[0].blocks[0] as { html?: string }).html), /Hello/);
  });
});
