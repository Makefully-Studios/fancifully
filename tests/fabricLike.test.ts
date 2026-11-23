import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fabricLikeToPage,
  pagesToSpreadFabricLike,
  spreadFabricLikeToPages,
} from '../src/interop/fabricLike.ts';
import type { StoryPage } from '../src/schema/story.ts';

describe('fabricLikeToPage', () => {
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

    const next = fabricLikeToPage(
      [
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
      page,
      { width: 600, height: 800 },
      '#fff8ee',
    );

    assert.equal(next.background?.color, '#fff8ee');
    const text = next.blocks.find((b) => b.id === 't1');
    assert.ok(text && text.type === 'text');
    assert.equal(text.layout.x, 55);
    assert.equal(text.layout.y, 70);
    assert.equal(text.layout.height, 80);
    assert.equal(text.html, '<p>Hello</p>');

    const hotspot = next.blocks.find((b) => b.id === 'h1');
    assert.ok(hotspot && hotspot.type === 'hotspot');
    assert.equal(
      hotspot.onTap?.[0] && 'play' in hotspot.onTap[0] ? hotspot.onTap[0].play : '',
      'sfx1',
    );
  });

  it('preserves text readAloud/voOrder and hotspot/image className when syncing', () => {
    const page: StoryPage = {
      id: 'p1',
      blocks: [
        {
          id: 't1',
          type: 'text',
          layout: { x: 10, y: 10, width: 100, height: 40 },
          html: '<p>VO</p>',
          readAloud: { audio: 'page-01Vo', cues: 'page-01Vtt' },
          voOrder: 2,
        },
        {
          id: 'img1',
          type: 'image',
          asset: 'art1',
          layout: { x: 0, y: 0, width: 50, height: 50 },
          className: 'fc-effect-reveal',
        },
        {
          id: 'h1',
          type: 'hotspot',
          layout: { x: 20, y: 20, width: 40, height: 40 },
          className: 'goldipup-autoplay-toggle',
          onTap: [{ toggleReadAloudAutoPlay: ['page', 'off'] }],
        },
      ],
    };

    const next = fabricLikeToPage(
      [
        {
          blockId: 't1',
          blockType: 'text',
          left: 12,
          top: 14,
          width: 100,
          height: 40,
          text: 'VO',
        },
        {
          blockId: 'img1',
          blockType: 'image',
          left: 0,
          top: 0,
          width: 50,
          height: 50,
          scaleX: 1,
          scaleY: 1,
          assetId: 'art1',
        },
        {
          blockId: 'h1',
          blockType: 'hotspot',
          left: 22,
          top: 24,
          width: 40,
          height: 40,
          scaleX: 1,
          scaleY: 1,
          onTap: [{ toggleReadAloudAutoPlay: ['page', 'off'] }],
        },
      ],
      page,
      { width: 600, height: 800 },
      undefined,
      { syncHotspots: true },
    );

    const text = next.blocks.find((b) => b.id === 't1');
    assert.ok(text && text.type === 'text');
    assert.equal(text.layout.x, 12);
    assert.deepEqual(text.readAloud, { audio: 'page-01Vo', cues: 'page-01Vtt' });
    assert.equal(text.voOrder, 2);

    const image = next.blocks.find((b) => b.id === 'img1');
    assert.ok(image && image.type === 'image');
    assert.equal(image.className, 'fc-effect-reveal');

    const hotspot = next.blocks.find((b) => b.id === 'h1');
    assert.ok(hotspot && hotspot.type === 'hotspot');
    assert.equal(hotspot.className, 'goldipup-autoplay-toggle');
    assert.equal(hotspot.layout.x, 22);
  });
});

describe('pagesToSpreadFabricLike / spreadFabricLikeToPages', () => {
  const pageSize = { width: 600, height: 800 };
  const assets = { images: new Map(), html: new Map() };

  const leftPage: StoryPage = {
    id: 'left',
    background: { color: '#ffeecc' },
    blocks: [
      {
        id: 'L1',
        type: 'text',
        layout: { x: 40, y: 50, width: 100, height: 40 },
        html: '<p>Left</p>',
        style: { fontSize: '18px' },
      },
    ],
  };

  const rightPage: StoryPage = {
    id: 'right',
    background: { color: '#ccffee' },
    blocks: [
      {
        id: 'R1',
        type: 'text',
        layout: { x: 20, y: 60, width: 80, height: 40 },
        html: '<p>Right</p>',
        style: { fontSize: '18px' },
      },
    ],
  };

  it('offsets right-page objects by page width on merge', () => {
    const spread = pagesToSpreadFabricLike(leftPage, rightPage, assets, pageSize);
    assert.equal(spread.spreadWidth, 1200);
    assert.equal(spread.objects.length, 2);
    const left = spread.objects.find((o) => o.blockId === 'L1');
    const right = spread.objects.find((o) => o.blockId === 'R1');
    assert.ok(left && right);
    assert.equal(left.left, 40);
    assert.equal(right.left, 620);
  });

  it('splits wholly-left and wholly-right objects back to their pages', () => {
    const { left, right } = spreadFabricLikeToPages(
      [
        {
          blockId: 'L1',
          blockType: 'text',
          left: 40,
          top: 50,
          width: 100,
          height: 40,
          text: 'Left',
        },
        {
          blockId: 'R1',
          blockType: 'text',
          left: 620,
          top: 60,
          width: 80,
          height: 40,
          text: 'Right',
        },
      ],
      leftPage,
      rightPage,
      pageSize,
    );
    assert.ok(left && right);
    assert.ok(left.blocks.some((b) => b.id === 'L1'));
    assert.ok(right.blocks.some((b) => b.id === 'R1'));
    const r = right.blocks.find((b) => b.id === 'R1');
    assert.ok(r && r.type === 'text');
    assert.equal(r.layout.x, 20);
  });

  it('clips and duplicates straddling objects onto both pages', () => {
    const { left, right } = spreadFabricLikeToPages(
      [
        {
          blockId: 'span',
          blockType: 'text',
          left: 500,
          top: 10,
          width: 200,
          height: 50,
          text: 'Span',
        },
      ],
      leftPage,
      rightPage,
      pageSize,
    );
    assert.ok(left && right);
    const leftSpan = left.blocks.find((b) => b.id === 'span');
    assert.ok(leftSpan && leftSpan.type === 'text');
    assert.equal(leftSpan.layout.x, 500);
    assert.equal(leftSpan.layout.width, 100);

    const rightSpan = right.blocks.find(
      (b) => b.type === 'text' && b.id !== 'R1' && (b.html?.includes('Span') || b.id.startsWith('span-')),
    );
    assert.ok(rightSpan && rightSpan.type === 'text');
    assert.equal(rightSpan.layout.x, 0);
    assert.equal(rightSpan.layout.width, 100);
    assert.notEqual(rightSpan.id, 'span');
  });
});
