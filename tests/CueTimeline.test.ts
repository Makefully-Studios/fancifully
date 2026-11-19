import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Window } from 'happy-dom';
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

  it('can disable the soft is-read trail', () => {
    const window = new Window();
    const { document } = window;
    document.body.innerHTML = `
      <article>
        <span data-cue-id="a" class="fc-cue">A</span>
        <span data-cue-id="b" class="fc-cue">B</span>
      </article>`;
    const root = document.body.firstElementChild as HTMLElement;
    const timeline = new CueTimeline([
      { id: 'a', start: 0, end: 1 },
      { id: 'b', start: 1, end: 2 },
    ]);
    timeline.setRetainReadHighlight(false);
    timeline.attach(root);
    timeline.update(0.5);
    timeline.update(1.2);
    assert.equal(root.querySelector('[data-cue-id="a"]')?.classList.contains('is-read'), false);
    assert.equal(root.querySelector('[data-cue-id="b"]')?.classList.contains('is-active'), true);
    assert.equal(root.querySelector('[data-cue-id="b"]')?.classList.contains('is-read'), false);
  });
});
