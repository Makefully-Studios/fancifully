import {
  FlipStyle,
  type FlipContext,
  registerFlipStyle,
} from './FlipStyle.js';

/**
 * Built-in CSS 3D page turn (perspective rotateY on the turning leaf).
 * Registered as `"default"`.
 */
export class DefaultFlipStyle extends FlipStyle {
  static override readonly id = 'default';

  override play(ctx: FlipContext): Promise<void> {
    const { bookEl, direction, durationMs } = ctx;
    const turnClass = direction === 'next' ? 'fc-turn-next' : 'fc-turn-prev';

    bookEl.style.setProperty('--fc-flip-duration', `${durationMs}ms`);
    bookEl.classList.remove('fc-turn-next', 'fc-turn-prev');
    void bookEl.offsetWidth;
    bookEl.classList.add(turnClass);

    return new Promise((resolve) => {
      const done = () => {
        bookEl.removeEventListener('animationend', onEnd);
        bookEl.classList.remove('fc-turn-next', 'fc-turn-prev');
        resolve();
      };
      const onEnd = (event: AnimationEvent) => {
        // Only finish on the leaf animation, not nested ones.
        if (event.target !== ctx.rightLeaf && event.target !== ctx.leftLeaf) {
          return;
        }
        done();
      };
      bookEl.addEventListener('animationend', onEnd);
      window.setTimeout(done, durationMs + 50);
    });
  }

  override cancel(ctx: Pick<FlipContext, 'bookEl'>): void {
    ctx.bookEl.classList.remove('fc-turn-next', 'fc-turn-prev');
  }
}

registerFlipStyle(DefaultFlipStyle.id, DefaultFlipStyle);
