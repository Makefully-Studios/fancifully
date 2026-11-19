import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Window } from 'happy-dom';
import type { LoadedAssets } from '../src/load/loadStory.ts';
import { PageView } from '../src/render/PageView.ts';
import type { StoryPage } from '../src/schema/story.ts';

describe('PageView text-block VO', () => {
  it('wraps cues on the text block and marks it tappable', () => {
    const window = new Window();
    const { document } = window;
    (globalThis as { document?: Document }).document = document as unknown as Document;

    const page: StoryPage = {
      id: 'p1',
      blocks: [
        {
          id: 't1',
          type: 'text',
          html: '<p>Once upon a time</p>',
          layout: { x: 0, y: 0, width: 100, height: 40 },
          readAloud: {
            audio: 'vo1',
            cues: [
              { id: '1', start: 0, end: 0.2, text: 'Once' },
              { id: '2', start: 0.2, end: 0.4, text: 'upon' },
            ],
          },
        },
      ],
    };

    const assets: LoadedAssets = {
      images: new Map(),
      audioUrls: new Map([['vo1', { url: 'blob:vo', channel: 'vo' }]]),
      cues: new Map(),
      html: new Map(),
    };

    let tapped: string | null = null;
    const view = new PageView(page, assets, {
      onTapActions: () => undefined,
      textTapReadAloud: true,
      onTextTapReadAloud: (id) => {
        tapped = id;
      },
    });

    const text = view.element.querySelector('[data-block-id="t1"]');
    assert.ok(text?.classList.contains('fc-block-text--tappable'));
    assert.equal(view.element.querySelectorAll('[data-cue-id]').length, 2);
    text?.dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.equal(tapped, 't1');
  });
});
