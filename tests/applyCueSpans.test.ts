import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Window } from 'happy-dom';
import { applyCueSpans } from '../src/sync/applyCueSpans.ts';
import { CueTimeline } from '../src/sync/CueTimeline.ts';

function mount(html: string): { document: Document; root: HTMLElement } {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = `<article class="fc-page">${html}</article>`;
  return { document: document as unknown as Document, root: document.body.firstElementChild as HTMLElement };
}

describe('applyCueSpans', () => {
  it('wraps word cues sequentially with data-cue-id', () => {
    const { root } = mount(
      `<div class="fc-block-text"><p>Once upon a time, there was a family.</p></div>`,
    );
    applyCueSpans(root, [
      { id: '1', start: 0, end: 0.2, text: 'Once' },
      { id: '2', start: 0.2, end: 0.4, text: 'upon' },
      { id: '3', start: 0.4, end: 0.6, text: 'a' },
      { id: '4', start: 0.6, end: 0.9, text: 'time,' },
    ]);
    const spans = [...root.querySelectorAll('[data-cue-id]')];
    assert.equal(spans.length, 4);
    assert.equal(spans[0]?.getAttribute('data-cue-id'), '1');
    assert.equal(spans[0]?.textContent, 'Once');
    assert.equal(spans[3]?.textContent, 'time,');
    assert.ok(spans[0]?.classList.contains('fc-cue'));
  });

  it('wraps phrase cues as a single span', () => {
    const { root } = mount(
      `<div class="fc-block-text"><p>Once upon a time, there was a family with three children.</p></div>`,
    );
    applyCueSpans(root, [
      {
        id: '1',
        start: 0,
        end: 1.5,
        text: 'Once upon a time, there was a family',
      },
    ]);
    const span = root.querySelector('[data-cue-id="1"]');
    assert.ok(span);
    assert.equal(span?.textContent, 'Once upon a time, there was a family');
  });

  it('is idempotent when spans already exist', () => {
    const { root } = mount(
      `<div class="fc-block-text"><p><span data-cue-id="1" class="fc-cue">Once</span> upon</p></div>`,
    );
    applyCueSpans(root, [
      { id: '1', start: 0, end: 0.2, text: 'Once' },
      { id: '2', start: 0.2, end: 0.4, text: 'upon' },
    ]);
    assert.equal(root.querySelectorAll('[data-cue-id="1"]').length, 1);
    assert.equal(root.querySelector('[data-cue-id="2"]')?.textContent, 'upon');
  });

  it('matches flexible whitespace between cue words', () => {
    const { root } = mount(
      `<div class="fc-block-text"><p>Once  upon\na time</p></div>`,
    );
    applyCueSpans(root, [
      { id: 'p1', start: 0, end: 1, text: 'Once upon a time' },
    ]);
    assert.equal(root.querySelector('[data-cue-id="p1"]')?.textContent?.replace(/\s+/g, ' '), 'Once upon a time');
  });

  it('highlights wrapped spans via CueTimeline', () => {
    const { root } = mount(
      `<div class="fc-block-text"><p>Hello world</p></div>`,
    );
    const cues = [
      { id: '1', start: 0, end: 0.5, text: 'Hello' },
      { id: '2', start: 0.5, end: 1, text: 'world' },
    ];
    applyCueSpans(root, cues);
    const timeline = new CueTimeline(cues);
    timeline.attach(root);
    timeline.update(0.1);
    assert.ok(root.querySelector('[data-cue-id="1"]')?.classList.contains('is-active'));
    timeline.update(0.7);
    assert.ok(root.querySelector('[data-cue-id="2"]')?.classList.contains('is-active'));
    assert.ok(root.querySelector('[data-cue-id="1"]')?.classList.contains('is-read'));
  });
});
