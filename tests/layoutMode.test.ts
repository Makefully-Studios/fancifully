import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSpreads,
  buildSingleSpreads,
  buildTwoPageSpreads,
  buildFrontCoverSpread,
  buildBackCoverSpread,
  contentPageIds,
  findSpreadIndexForPage,
  primaryPageId,
  resolveLayoutMode,
} from '../src/nav/layoutMode.ts';

describe('layoutMode', () => {
  it('resolves auto by width breakpoint', () => {
    assert.equal(resolveLayoutMode('auto', 899, 1200, 900), 'single');
    assert.equal(resolveLayoutMode('auto', 900, 400, 900), 'two-page');
    assert.equal(resolveLayoutMode('single', 1200, 400, 900), 'single');
  });

  it('resolves responsive by orientation (width vs height)', () => {
    assert.equal(resolveLayoutMode('responsive', 800, 1200, 900), 'single');
    assert.equal(resolveLayoutMode('responsive', 1200, 800, 900), 'two-page');
    assert.equal(resolveLayoutMode('responsive', 900, 900, 900), 'two-page');
  });

  it('builds two-page cover + pairs with blank mates when covers unset', () => {
    const spreads = buildSpreads([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], 'two-page');
    assert.equal(spreads.length, 3);
    assert.equal(spreads[0].left.kind, 'blank');
    assert.equal(spreads[0].right.kind, 'page');
    if (spreads[0].right.kind === 'page') assert.equal(spreads[0].right.pageId, 'a');
    assert.deepEqual(contentPageIds(spreads[1]), ['b', 'c']);
    assert.equal(spreads[2].right.kind, 'blank');
    assert.equal(findSpreadIndexForPage(spreads, 'c'), 1);
  });

  it('frontCover excludes cover from open spreads; first open has content on left', () => {
    const pages = [{ id: 'cover' }, { id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
    const spreads = buildTwoPageSpreads(pages, { frontCover: true });
    assert.deepEqual(contentPageIds(spreads[0]), ['p1', 'p2']);
    assert.equal(spreads[0].left.kind, 'page');
    assert.ok(!contentPageIds(spreads[0]).includes('cover'));
    const closed = buildFrontCoverSpread(pages);
    assert.deepEqual(contentPageIds(closed), ['cover']);
  });

  it('backCover excludes back from open spreads', () => {
    const pages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'back' }];
    const spreads = buildTwoPageSpreads(pages, { backCover: true });
    for (const s of spreads) {
      assert.ok(!contentPageIds(s).includes('back'));
    }
    // [blank,a], [b,c] — back omitted
    assert.deepEqual(contentPageIds(spreads[0]), ['a']);
    assert.deepEqual(contentPageIds(spreads[1]), ['b', 'c']);
    const closed = buildBackCoverSpread(pages);
    assert.deepEqual(contentPageIds(closed), ['back']);
  });

  it('frontCover + backCover open spreads are interior only', () => {
    const pages = [
      { id: 'cover' },
      { id: 'p1' },
      { id: 'p2' },
      { id: 'p3' },
      { id: 'p4' },
      { id: 'back' },
    ];
    const spreads = buildTwoPageSpreads(pages, { frontCover: true, backCover: true });
    assert.equal(spreads.length, 2);
    assert.deepEqual(contentPageIds(spreads[0]), ['p1', 'p2']);
    assert.deepEqual(contentPageIds(spreads[1]), ['p3', 'p4']);
  });

  it('builds one-page spreads with cover sides when flagged', () => {
    const pages = [{ id: 'cover' }, { id: 'b' }, { id: 'back' }];
    const spreads = buildSingleSpreads(pages, { frontCover: true, backCover: true });
    assert.equal(spreads[0].left.kind, 'page');
    assert.equal(spreads[0].right.kind, 'blank');
    assert.equal(spreads[2].left.kind, 'blank');
    assert.equal(spreads[2].right.kind, 'page');
  });

  it('remaps the same page id across single and two-page spread lists', () => {
    const pages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const two = buildSpreads(pages, 'two-page');
    const one = buildSpreads(pages, 'single');
    assert.equal(primaryPageId(two[1]), 'b');
    assert.equal(findSpreadIndexForPage(one, 'b'), 1);
    assert.equal(findSpreadIndexForPage(two, 'c'), 1);
  });

  it('gives orphan a blank mate in two-page mode without backCover', () => {
    const spreads = buildSpreads([{ id: 'a' }, { id: 'b' }], 'two-page');
    assert.equal(spreads.length, 2);
    assert.equal(spreads[1].left.kind, 'page');
    assert.equal(spreads[1].right.kind, 'blank');
  });
});
