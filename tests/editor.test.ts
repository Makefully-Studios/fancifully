import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import type { Canvas } from 'fabric';
import { packFanci } from '../src/editor/packFanci.ts';
import { fabricToStory, reflowTextboxScale } from '../src/editor/storyFabricMap.ts';
import {
  boxToPixels,
  htmlToPlainText,
  plainTextToHtml,
  resolveCssLineHeight,
  serializeLayoutBox,
  toPx,
} from '../src/editor/layoutUnits.ts';
import type { Story, StoryPage } from '../src/schema/story.ts';
import type { Textbox } from 'fabric';

describe('editor layoutUnits', () => {
  it('parses px lengths', () => {
    assert.equal(toPx(12), 12);
    assert.equal(toPx('24'), 24);
    assert.equal(toPx('18px'), 18);
    assert.equal(toPx(undefined, 5), 5);
  });

  it('resolves percentages against page size', () => {
    assert.equal(toPx('8%', 0, 600), 48);
    assert.equal(toPx('10%', 0, 800), 80);
    assert.equal(toPx('84%', 0, 600), 504);
    const box = boxToPixels(
      { x: '8%', y: '10%', width: '84%', height: '55%' },
      { width: 600, height: 800 },
    );
    assert.equal(box.x, 48);
    assert.equal(box.y, 80);
    assert.equal(box.width, 504);
    assert.equal(box.height, 440);
  });

  it('preserves percent layout when fabric geometry matches', () => {
    const prev = { x: '8%', y: '10%', width: '84%', height: '55%' };
    const pageSize = { width: 600, height: 800 };
    const kept = serializeLayoutBox(48, 80, 504, 120, prev, pageSize, {
      preserveHeight: true,
    });
    assert.deepEqual(kept, prev);

    const moved = serializeLayoutBox(60, 80, 504, 120, prev, pageSize, {
      preserveHeight: true,
    });
    assert.equal(moved.x, '10%');
    assert.equal(moved.height, '55%');
  });

  it('resolves CSS line-height to a unitless multiplier', () => {
    assert.equal(resolveCssLineHeight(1.4, 22), 1.4);
    assert.equal(resolveCssLineHeight('1.4', 22), 1.4);
    assert.equal(resolveCssLineHeight('140%', 22), 1.4);
    assert.equal(resolveCssLineHeight('28px', 20), 1.4);
    assert.equal(resolveCssLineHeight(undefined, 22), 1.35);
  });

  it('round-trips plain text through html helpers', () => {
    const html = plainTextToHtml('Hello\nWorld');
    assert.match(html, /Hello/);
    assert.equal(htmlToPlainText(html).replace(/\s+/g, ' ').trim(), 'Hello World');
  });
});

describe('packFanci', () => {
  it('zips story.json and relative assets', async () => {
    const story: Story = {
      id: 'pack-me',
      pageSize: { width: 100, height: 200 },
      frontCover: false,
      backCover: false,
      layout: { mode: 'auto', singleBreakpoint: 900 },
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

describe('reflowTextboxScale', () => {
  it('bakes scaleX into width and resets scale', () => {
    const calls: unknown[] = [];
    const textbox = {
      width: 100,
      scaleX: 2,
      scaleY: 1.5,
      set(opts: Record<string, number>) {
        calls.push(opts);
        Object.assign(this, opts);
      },
      setCoords() {},
    } as unknown as Textbox;

    reflowTextboxScale(textbox);
    assert.deepEqual(calls[0], { width: 200, scaleX: 1, scaleY: 1 });
  });
});

describe('fabricToStory', () => {
  it('writes text geometry back and preserves hotspot blocks', () => {
    const page: StoryPage = {
      id: 'p1',
      background: { color: '#fff8ee' },
      blocks: [
        {
          id: 't1',
          type: 'text',
          layout: { x: 40, y: 60, width: 200, height: 80 },
          html: '<p>Hello</p>',
          style: { fontSize: '20px', color: '#111' },
        },
        {
          id: 'h1',
          type: 'hotspot',
          layout: { x: 10, y: 10, width: 50, height: 50 },
          onTap: [{ play: 'sfx1' }],
        },
      ],
    };

    const canvas = {
      backgroundColor: '#fff8ee',
      getObjects: () => [
        {
          blockId: 't1',
          blockType: 'text',
          left: 55,
          top: 70,
          width: 200,
          height: 80,
          scaleX: 1,
          scaleY: 1,
          text: 'Hello',
          fontFamily: 'Georgia',
          fontSize: 20,
          fill: '#111',
          textAlign: 'left',
        },
      ],
    } as unknown as Canvas;

    const next = fabricToStory(canvas, page, { width: 600, height: 800 });
    assert.equal(next.background?.color, '#fff8ee');
    const text = next.blocks.find((b) => b.id === 't1');
    assert.ok(text && text.type === 'text');
    assert.equal(text.layout.x, 55);
    assert.equal(text.layout.y, 70);
    assert.equal(text.layout.height, 80); // authored height preserved
    assert.equal(text.html, '<p>Hello</p>'); // unchanged html preserved

    const hotspot = next.blocks.find((b) => b.id === 'h1');
    assert.ok(hotspot && hotspot.type === 'hotspot');
    assert.equal(
      hotspot.onTap?.[0] && 'play' in hotspot.onTap[0] ? hotspot.onTap[0].play : '',
      'sfx1',
    );
  });
});
