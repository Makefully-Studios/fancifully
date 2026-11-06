import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HARDBACK_EDGE_RATIO,
  hardbackEnabled,
  hardbackOverhang,
} from '../src/nav/hardback.ts';
import { parseStory } from '../src/schema/story.ts';

describe('hardback', () => {
  it('computes overhang from pageSize', () => {
    const oh = hardbackOverhang({ width: 600, height: 800 });
    assert.equal(oh.x, Math.round(600 * HARDBACK_EDGE_RATIO));
    assert.equal(oh.y, Math.round(800 * HARDBACK_EDGE_RATIO));
    assert.ok(oh.x >= 1);
    assert.ok(oh.y >= 1);
  });

  it('uses an explicit cover board when coverSize is set', () => {
    const oh = hardbackOverhang({ width: 600, height: 800 }, { width: 660, height: 880 });
    assert.equal(oh.x, 30);
    assert.equal(oh.y, 40);
  });

  it('requires hardback flag plus a cover', () => {
    assert.equal(hardbackEnabled({ hardback: true }), false);
    assert.equal(hardbackEnabled({ hardback: true, frontCover: true }), true);
    assert.equal(hardbackEnabled({ hardback: true, backCover: true }), true);
    assert.equal(hardbackEnabled({ frontCover: true }), false);
  });

  it('parses hardback on story JSON', () => {
    const story = parseStory({
      id: 'hb',
      pageSize: { width: 100, height: 100 },
      frontCover: true,
      hardback: true,
      pages: [{ id: 'c', blocks: [] }],
    });
    assert.equal(story.hardback, true);
  });
});
