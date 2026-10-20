import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CueTimeline } from '../src/sync/CueTimeline.ts';

describe('CueTimeline', () => {
  it('returns active cue by time without DOM', () => {
    const timeline = new CueTimeline([
      { id: 'a', start: 0, end: 1 },
      { id: 'b', start: 1, end: 2 },
    ]);
    assert.equal(timeline.update(0.5)?.id, 'a');
    assert.equal(timeline.update(1.2)?.id, 'b');
    assert.equal(timeline.update(2.5), null);
  });
});
