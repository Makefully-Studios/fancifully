import type { SpringrollLike } from './bindApplication.js';

export type LoadStage = 'fetch' | 'unpack' | 'parse' | 'assets' | 'complete';

/** Overall load progress reported to hosts and SpringRoll Container. */
export type LoadProgress = {
  stage: LoadStage;
  /** Fraction complete, 0–1 */
  progress: number;
  count?: number;
  total?: number;
  detail?: string;
};

export type SpringrollContainer = {
  send?: (event: string, data?: unknown) => void;
};

export type SpringrollWithContainer = SpringrollLike & {
  container?: SpringrollContainer;
};

/**
 * Report load progress the way SpringRoll Container / Platypus hosts expect:
 * - `progress` — numeric 0–1 (classic loading bar)
 * - `loading` — structured payload `{ stage, progress, count?, total?, detail? }`
 */
export function reportSpringrollProgress(
  app: SpringrollWithContainer | null | undefined,
  progress: LoadProgress,
): void {
  const container = app?.container;
  if (!container?.send) return;

  const clamped = clamp01(progress.progress);
  container.send('progress', clamped);
  container.send('loading', {
    stage: progress.stage,
    progress: clamped,
    count: progress.count,
    total: progress.total,
    detail: progress.detail,
  });
}

export function reportSpringrollLoaded(app: SpringrollWithContainer | null | undefined): void {
  app?.container?.send?.('loaded');
}

export type LoadGate = {
  promise: Promise<void>;
  resolve: () => void;
};

/** Deferred gate used by an ApplicationPlugin preload() to delay SpringRoll `loaded` / ready. */
export function createLoadGate(): LoadGate {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
