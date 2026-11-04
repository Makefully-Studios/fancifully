import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseStory } from '../src/schema/story.ts';

describe('parseStory', () => {
  it('accepts a minimal valid story', () => {
    const story = parseStory({
      id: 't',
      pageSize: { width: 100, height: 200 },
      pages: [
        {
          id: 'p1',
          blocks: [
            {
              id: 't1',
              type: 'text',
              html: '<p>Hi</p>',
            },
          ],
        },
      ],
    });
    assert.equal(story.id, 't');
    assert.equal(story.layout.mode, 'auto');
    assert.equal(story.frontCover, false);
    assert.equal(story.backCover, false);
    assert.equal(story.hardback, false);
    assert.equal('flip' in story, false);
    assert.equal(story.pages[0].blocks[0].type, 'text');
  });

  it('strips legacy story.flip from JSON', () => {
    const story = parseStory({
      id: 't',
      pageSize: { width: 100, height: 200 },
      flip: { style: 'instant', speed: 100 },
      pages: [{ id: 'p1', blocks: [] }],
    });
    assert.equal('flip' in story, false);
  });

  it('rejects empty pages', () => {
    assert.throws(() =>
      parseStory({
        id: 't',
        pageSize: { width: 1, height: 1 },
        pages: [],
      }),
    );
  });
});
