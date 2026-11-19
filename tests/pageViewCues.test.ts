import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Window } from 'happy-dom';
import type { LoadedAssets } from '../src/load/loadStory.ts';
import { PageView } from '../src/render/PageView.ts';
import type { StoryPage } from '../src/schema/story.ts';

describe('PageView cue prep', () => {
  it('wraps readAloud cues when the page mounts', () => {
    const window = new Window();
    // PageView uses document.createElement via happy-dom global if we patch.
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
        },
      ],
      readAloud: {
        audio: 'vo1',
        cues: [
          { id: '1', start: 0, end: 0.2, text: 'Once' },
          { id: '2', start: 0.2, end: 0.4, text: 'upon' },
        ],
      },
    };

    const assets: LoadedAssets = {
      images: new Map(),
      audioUrls: new Map([['vo1', { url: 'blob:vo', channel: 'vo' }]]),
      cues: new Map(),
      html: new Map(),
    };

    const view = new PageView(page, assets, { onTapActions: () => undefined });
    const spans = [...view.element.querySelectorAll('[data-cue-id]')];
    assert.equal(spans.length, 2);
    assert.equal(spans[0]?.textContent, 'Once');
    assert.equal(spans[1]?.textContent, 'upon');
  });
});
