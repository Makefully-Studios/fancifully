import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSpreads,
  contentPageIds,
  findSpreadIndexForPage,
  resolveLayoutMode,
} from '../src/nav/layoutMode.ts';

describe('layoutMode', () => {
  it('resolves auto by breakpoint', () => {
    assert.equal(resolveLayoutMode('auto', 899, 900), 'single');
    assert.equal(resolveLayoutMode('auto', 900, 900), 'two-page');
    assert.equal(resolveLayoutMode('single', 1200, 900), 'single');
  });

  it('builds cover + pairs with blank mates', () => {
    const spreads = buildSpreads([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
    assert.equal(spreads.length, 3);
    assert.equal(spreads[0].left.kind, 'blank');
    assert.equal(spreads[0].right.kind, 'page');
    if (spreads[0].right.kind === 'page') assert.equal(spreads[0].right.pageId, 'a');
    assert.deepEqual(contentPageIds(spreads[1]), ['b', 'c']);
    assert.equal(spreads[2].right.kind, 'blank');
    assert.equal(findSpreadIndexForPage(spreads, 'c'), 1);
  });

  it('gives orphan a blank mate', () => {
    const spreads = buildSpreads([{ id: 'a' }, { id: 'b' }]);
    assert.equal(spreads.length, 2);
    assert.equal(spreads[1].left.kind, 'page');
    assert.equal(spreads[1].right.kind, 'blank');
  });
});
