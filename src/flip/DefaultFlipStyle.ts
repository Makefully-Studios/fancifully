import {
  FlipStyle,
  type FlipContext,
  registerFlipStyle,
} from './FlipStyle.js';

const TURN_CLASSES = [
  'fc-turn-next',
  'fc-turn-prev',
  'fc-turn-next-right',
  'fc-turn-prev-right',
  'fc-turn-next-left',
  'fc-turn-prev-left',
] as const;

/** Resolve the CSS turn class for a direction + content side. */
export function flipTurnClass(
  direction: FlipContext['direction'],
  contentSide: FlipContext['contentSide'] = 'both',
): string {
  const side = contentSide ?? 'both';
  if (side === 'right') {
    return direction === 'next' ? 'fc-turn-next-right' : 'fc-turn-prev-right';
  }
  if (side === 'left') {
    return direction === 'next' ? 'fc-turn-next-left' : 'fc-turn-prev-left';
  }
  return direction === 'next' ? 'fc-turn-next' : 'fc-turn-prev';
}

function turnClassFor(ctx: FlipContext): string {
  return flipTurnClass(ctx.direction, ctx.contentSide);
}

function clearTurnClasses(bookEl: HTMLElement): void {
  bookEl.classList.remove(...TURN_CLASSES);
}

/**
 * Built-in CSS 3D page turn (perspective rotateY on the turning leaf).
 * Registered as `"default"`.
 */
export class DefaultFlipStyle extends FlipStyle {
  static override readonly id = 'default';

  override play(ctx: FlipContext): Promise<void> {
    const { bookEl, durationMs } = ctx;
    const turnClass = turnClassFor(ctx);

    bookEl.style.setProperty('--fc-flip-duration', `${durationMs}ms`);
    clearTurnClasses(bookEl);
    void bookEl.offsetWidth;
    bookEl.classList.add(turnClass);

    return new Promise((resolve) => {
      const done = () => {
        bookEl.removeEventListener('animationend', onEnd);
        clearTurnClasses(bookEl);
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
    clearTurnClasses(ctx.bookEl);
  }
}

registerFlipStyle(DefaultFlipStyle.id, DefaultFlipStyle);
