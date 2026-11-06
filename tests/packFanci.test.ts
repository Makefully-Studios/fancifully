import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import { packFanci } from '../src/pack/packFanci.ts';
import type { Story } from '../src/schema/story.ts';

describe('packFanci', () => {
  it('zips story.json and relative assets', async () => {
    const story: Story = {
      id: 'pack-me',
      pageSize: { width: 100, height: 200 },
      frontCover: false,
      backCover: false,
      fonts: [],
      assets: {
        cover: { type: 'image', src: 'images/cover.png' },
      },
      pages: [{ id: 'p1', blocks: [] }],
    };

    const png = new Uint8Array([137, 80, 78, 71, 0, 0, 0, 0]);
    const blob = await packFanci(story, {
      files: { 'images/cover.png': png },
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const entries = unzipSync(bytes);
    assert.ok(entries['story.json']);
    const parsed = JSON.parse(strFromU8(entries['story.json'])) as Story;
    assert.equal(parsed.id, 'pack-me');
    assert.equal(parsed.assets.cover.src, 'images/cover.png');
    assert.ok(entries['images/cover.png']);
  });
});
