export type FlipDirection = 'next' | 'prev';

/** Context passed to a flip style while animating a turn. */
export type FlipContext = {
  bookEl: HTMLElement;
  viewportEl: HTMLElement;
  leftLeaf: HTMLElement;
  rightLeaf: HTMLElement;
  direction: FlipDirection;
  /** Duration in milliseconds */
  durationMs: number;
};

/**
 * Base class for page-flip animations.
 *
 * Built-in styles (e.g. {@link DefaultFlipStyle}) extend this class.
 * Hosts can subclass it and pass the constructor or an instance via
 * `StorybookOptions.flipStyle`, or {@link registerFlipStyle} a named id
 * for string lookup (`flipStyle: "my-style"`).
 */
export abstract class FlipStyle {
  /** Registry id when registered via {@link registerFlipStyle}. */
  static readonly id: string = 'base';

  /**
   * Play the flip. Resolve when the outgoing leaf animation is done and
   * the engine may mount the next spread.
   */
  abstract play(ctx: FlipContext): Promise<void>;

  /** Clear classes/styles if a flip is interrupted. */
  cancel(ctx: Pick<FlipContext, 'bookEl' | 'viewportEl' | 'leftLeaf' | 'rightLeaf'>): void {
    void ctx;
  }
}

export type FlipStyleConstructor = (new () => FlipStyle) & { readonly id?: string };

export type FlipStyleInput = string | FlipStyle | FlipStyleConstructor;

const registry = new Map<string, FlipStyleConstructor>();

/** Register a named flip style for string lookup (`flipStyle: "id"`). */
export function registerFlipStyle(id: string, ctor: FlipStyleConstructor): void {
  registry.set(id, ctor);
}

export function getRegisteredFlipStyle(id: string): FlipStyleConstructor | undefined {
  return registry.get(id);
}

export function listRegisteredFlipStyles(): string[] {
  return [...registry.keys()];
}

function isFlipStyleConstructor(value: unknown): value is FlipStyleConstructor {
  return (
    typeof value === 'function' &&
    value.prototype instanceof FlipStyle
  );
}

/**
 * Resolve a string id, constructor, or instance into a {@link FlipStyle}.
 * Unknown string ids throw. Omitting input yields {@link DefaultFlipStyle}.
 */
export function createFlipStyle(input?: FlipStyleInput | null): FlipStyle {
  if (input == null || input === '') {
    const Default = registry.get('default');
    if (!Default) {
      throw new Error('FlipStyle "default" is not registered');
    }
    return new Default();
  }

  if (typeof input === 'string') {
    const Ctor = registry.get(input);
    if (!Ctor) {
      const known = listRegisteredFlipStyles().join(', ') || '(none)';
      throw new Error(`Unknown flipStyle "${input}". Registered: ${known}`);
    }
    return new Ctor();
  }

  if (input instanceof FlipStyle) {
    return input;
  }

  if (isFlipStyleConstructor(input)) {
    return new input();
  }

  throw new Error('flipStyle must be a string id, FlipStyle instance, or FlipStyle subclass');
}

/** Default flip duration in ms (matches legacy 0.4s CSS). */
export const DEFAULT_FLIP_SPEED_MS = 400;

export function resolveFlipSpeedMs(speed?: number | null): number {
  if (speed == null || !Number.isFinite(speed) || speed <= 0) {
    return DEFAULT_FLIP_SPEED_MS;
  }
  return speed;
}
