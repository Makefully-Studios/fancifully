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
    assert.equal('layout' in story, false);
    assert.equal(story.frontCover, false);
    assert.equal(story.backCover, false);
    assert.equal(story.hardback, false);
    assert.equal('flip' in story, false);
    assert.equal(story.pages[0].blocks[0].type, 'text');
  });

  it('strips legacy story.layout from JSON', () => {
    const story = parseStory({
      id: 't',
      pageSize: { width: 100, height: 200 },
      layout: { mode: 'single', singleBreakpoint: 400 },
      pages: [{ id: 'p1', blocks: [] }],
    });
    assert.equal('layout' in story, false);
    assert.equal(story.pages.length, 1);
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

  it('accepts area blocks and richer hotspot actions', () => {
    const story = parseStory({
      id: 't',
      pageSize: { width: 100, height: 200 },
      pages: [
        {
          id: 'p1',
          blocks: [
            {
              id: 'h1',
              type: 'hotspot',
              requiredTaps: 3,
              onTap: [
                { play: 'sfx' },
                { toggleClass: { target: 'img1', className: 'on' } },
                { addClass: { target: 'img1', className: 'revealed' } },
                { removeClass: { target: 'img1', className: 'hidden' } },
                { replayClass: { target: 'hearts', className: 'burst' } },
              ],
              onComplete: [{ play: 'done' }],
            },
            {
              id: 'a1',
              type: 'area',
              game: 'demo.sort',
              requireComplete: true,
              params: { difficulty: 1 },
              ariaLabel: 'Sort toys',
            },
          ],
        },
      ],
    });
    const hotspot = story.pages[0].blocks[0];
    assert.ok(hotspot && hotspot.type === 'hotspot');
    assert.equal(hotspot.requiredTaps, 3);
    assert.equal(hotspot.onTap?.length, 5);
    assert.equal(hotspot.onComplete?.length, 1);
    const area = story.pages[0].blocks[1];
    assert.ok(area && area.type === 'area');
    assert.equal(area.game, 'demo.sort');
    assert.equal(area.requireComplete, true);
    assert.deepEqual(area.params, { difficulty: 1 });
  });

  it('rejects unknown tap action keys', () => {
    assert.throws(() =>
      parseStory({
        id: 't',
        pageSize: { width: 1, height: 1 },
        pages: [
          {
            id: 'p1',
            blocks: [
              {
                id: 'h1',
                type: 'hotspot',
                onTap: [{ explode: true }],
              },
            ],
          },
        ],
      }),
    );
  });
});
