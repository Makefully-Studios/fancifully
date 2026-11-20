import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { StoryPage } from '../src/schema/story.ts';
import {
  defaultHighlightTargets,
  resolveHighlightClassName,
  resolveHighlightTargets,
  triggerMatchesAutoPlay,
} from '../src/sync/pageTriggers.ts';

const page: StoryPage = {
  id: 'p1',
  triggers: [],
  blocks: [
    { id: 't1', type: 'text', html: '<p>Hi</p>', layout: {} },
    { id: 'h1', type: 'hotspot', layout: {}, onTap: [], onComplete: [] },
    { id: 'a1', type: 'area', layout: {}, game: 'demo', requireComplete: false },
  ],
};

describe('pageTriggers helpers', () => {
  it('matches whenAutoPlay filters', () => {
    assert.equal(triggerMatchesAutoPlay({}, 'off'), true);
    assert.equal(triggerMatchesAutoPlay({ whenAutoPlay: ['off'] }, 'off'), true);
    assert.equal(triggerMatchesAutoPlay({ whenAutoPlay: ['off'] }, 'page'), false);
    assert.equal(
      triggerMatchesAutoPlay({ whenAutoPlay: ['page', 'book'] }, 'book'),
      true,
    );
  });

  it('defaults highlight targets to hotspots and areas', () => {
    assert.deepEqual(defaultHighlightTargets(page), ['h1', 'a1']);
    assert.deepEqual(
      resolveHighlightTargets(page, {
        when: 'pageEnter',
        delayMs: 0,
        highlight: { mode: 'rect', className: 'fc-attention' },
      }),
      ['h1', 'a1'],
    );
    assert.deepEqual(
      resolveHighlightTargets(page, {
        when: 'pageEnter',
        delayMs: 0,
        highlight: {
          mode: 'rect',
          className: 'fc-attention',
          targets: ['h1'],
        },
      }),
      ['h1'],
    );
  });

  it('resolves highlight class name', () => {
    assert.equal(
      resolveHighlightClassName({
        when: 'pageEnter',
        delayMs: 0,
        highlight: { mode: 'rect', className: 'fc-attention' },
      }),
      'fc-attention',
    );
    assert.equal(
      resolveHighlightClassName({
        when: 'pageEnter',
        delayMs: 0,
        highlight: { mode: 'rect', className: 'my-pulse' },
      }),
      'my-pulse',
    );
  });
});
