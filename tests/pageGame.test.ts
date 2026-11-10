import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';
import {
  clearPageGameRegistry,
  getRegisteredPageGame,
  isAreaNavGated,
  listRegisteredPageGames,
  registerPageGame,
  unregisterPageGame,
  type PageGameHandle,
} from '../src/games/PageGame.ts';
import { advanceHotspotTaps } from '../src/render/blocks/HotspotBlock.ts';

afterEach(() => {
  clearPageGameRegistry();
});

describe('page game registry', () => {
  it('registers, resolves, and clears factories', () => {
    const handle: PageGameHandle = { destroy() {} };
    registerPageGame('demo.game', () => handle);
    assert.ok(listRegisteredPageGames().includes('demo.game'));
    assert.equal(getRegisteredPageGame('demo.game')?.({} as never), handle);
    unregisterPageGame('demo.game');
    assert.equal(getRegisteredPageGame('demo.game'), undefined);
  });

  it('mounts and destroys via factory handle', async () => {
    let destroyed = 0;
    registerPageGame('demo.lifecycle', () => ({
      destroy() {
        destroyed += 1;
      },
    }));
    const factory = getRegisteredPageGame('demo.lifecycle');
    assert.ok(factory);
    const handle = await factory({
      el: {} as HTMLElement,
      page: { id: 'p1', blocks: [] },
      block: {
        id: 'a1',
        type: 'area',
        layout: {},
        game: 'demo.lifecycle',
        requireComplete: false,
      },
      story: {
        id: 't',
        pageSize: { width: 1, height: 1 },
        pages: [],
        assets: {},
        frontCover: false,
        backCover: false,
        hardback: false,
      },
      assets: {
        images: new Map(),
        audioUrls: new Map(),
        cues: new Map(),
        html: new Map(),
      },
      signal: new AbortController().signal,
      onComplete: () => undefined,
    });
    handle?.destroy();
    assert.equal(destroyed, 1);
  });
});

describe('isAreaNavGated', () => {
  it('blocks canNext until requireComplete areas finish', () => {
    assert.equal(isAreaNavGated([]), false);
    assert.equal(
      isAreaNavGated([{ requireComplete: true, complete: false }]),
      true,
    );
    assert.equal(
      isAreaNavGated([{ requireComplete: true, complete: true }]),
      false,
    );
    assert.equal(
      isAreaNavGated([
        { requireComplete: false, complete: false },
        { requireComplete: true, complete: true },
      ]),
      false,
    );
  });
});

describe('advanceHotspotTaps', () => {
  it('fires onComplete once when required taps are met', () => {
    let state = { taps: 0, completed: false };
    const step = () => {
      const next = advanceHotspotTaps(state.taps, state.completed, 3);
      state = { taps: next.taps, completed: next.completed };
      return next.fireComplete;
    };
    assert.equal(step(), false);
    assert.equal(step(), false);
    assert.equal(step(), true);
    assert.equal(step(), false);
    assert.equal(state.taps, 4);
    assert.equal(state.completed, true);
  });

  it('never fires complete when requiredTaps is unset', () => {
    const next = advanceHotspotTaps(0, false, undefined);
    assert.equal(next.fireComplete, false);
    assert.equal(next.completed, false);
  });
});
