import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DefaultFlipStyle,
  FlipStyle,
  createFlipStyle,
  flipTurnClass,
  listRegisteredFlipStyles,
  registerFlipStyle,
  resolveFlipSpeedMs,
  type FlipContext,
} from '../src/flip/index.ts';

class InstantFlipStyle extends FlipStyle {
  static override readonly id = 'instant-test';
  plays = 0;

  override play(_ctx: FlipContext): Promise<void> {
    this.plays += 1;
    return Promise.resolve();
  }
}

describe('FlipStyle', () => {
  it('registers default style', () => {
    assert.ok(listRegisteredFlipStyles().includes('default'));
    const style = createFlipStyle('default');
    assert.ok(style instanceof DefaultFlipStyle);
  });

  it('creates from subclass constructor', () => {
    const style = createFlipStyle(InstantFlipStyle);
    assert.ok(style instanceof InstantFlipStyle);
  });

  it('creates from instance', () => {
    const instance = new InstantFlipStyle();
    assert.equal(createFlipStyle(instance), instance);
  });

  it('registers and resolves custom named styles', () => {
    registerFlipStyle('instant-test', InstantFlipStyle);
    const style = createFlipStyle('instant-test');
    assert.ok(style instanceof InstantFlipStyle);
  });

  it('throws on unknown string id', () => {
    assert.throws(() => createFlipStyle('nope-not-real'), /Unknown flipStyle/);
  });

  it('resolves flip speed with defaults', () => {
    assert.equal(resolveFlipSpeedMs(undefined), 400);
    assert.equal(resolveFlipSpeedMs(250), 250);
    assert.equal(resolveFlipSpeedMs(0), 400);
    assert.equal(resolveFlipSpeedMs(-1), 400);
  });

  it('picks classic vs fixed-side turn classes from contentSide', () => {
    assert.equal(flipTurnClass('next', 'both'), 'fc-turn-next');
    assert.equal(flipTurnClass('prev', 'both'), 'fc-turn-prev');
    assert.equal(flipTurnClass('next', 'right'), 'fc-turn-next-right');
    assert.equal(flipTurnClass('prev', 'right'), 'fc-turn-prev-right');
    assert.equal(flipTurnClass('next', 'left'), 'fc-turn-next-left');
    assert.equal(flipTurnClass('prev', 'left'), 'fc-turn-prev-left');
  });
});
