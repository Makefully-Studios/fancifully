import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  boxToPixels,
  htmlToPlainText,
  plainTextToHtml,
  resolveCssLineHeight,
  serializeLayoutBox,
  toPx,
} from '../src/layout/layoutUnits.ts';

describe('layoutUnits', () => {
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
