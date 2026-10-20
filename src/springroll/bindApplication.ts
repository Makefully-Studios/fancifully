import type { AudioBus } from '../audio/AudioBus.js';
import { createLoadGate, type LoadGate } from './loading.js';

export type SpringrollLike = {
  state?: {
    ready?: { subscribe: (fn: (v: boolean) => void) => unknown; value?: boolean };
    soundVolume?: { subscribe: (fn: (v: number) => void) => unknown };
    voVolume?: { subscribe: (fn: (v: number) => void) => unknown };
    sfxVolume?: { subscribe: (fn: (v: number) => void) => unknown };
    musicVolume?: { subscribe: (fn: (v: number) => void) => unknown };
    captionsMuted?: { subscribe: (fn: (v: boolean) => void) => unknown };
    pause?: { subscribe: (fn: (v: boolean) => void) => unknown };
  };
  container?: {
    send?: (event: string, data?: unknown) => void;
  };
};

export type SpringrollBindings = {
  captionsMuted: boolean;
  destroy: () => void;
};

export function bindApplication(
  app: SpringrollLike | null | undefined,
  bus: AudioBus,
  handlers: {
    onCaptionsMuted?: (muted: boolean) => void;
    onPause?: (paused: boolean) => void;
  } = {},
): SpringrollBindings {
  const unsubs: Array<() => void> = [];
  let captionsMuted = false;

  const sub = <T>(prop: { subscribe: (fn: (v: T) => void) => unknown } | undefined, fn: (v: T) => void) => {
    if (!prop?.subscribe) return;
    const result = prop.subscribe(fn) as { unsubscribe?: () => void } | (() => void) | void;
    if (typeof result === 'function') {
      unsubs.push(result);
    } else if (result && typeof result.unsubscribe === 'function') {
      unsubs.push(() => result.unsubscribe?.());
    }
  };

  if (app?.state) {
    // Satisfy SpringRoll validateListeners for enabled features / pause
    sub(app.state.pause, (v) => {
      const paused = Boolean(v);
      bus.setPaused(paused);
      handlers.onPause?.(paused);
    });
    sub(app.state.soundVolume, (v) => bus.setVolume('sound', Number(v)));
    sub(app.state.voVolume, (v) => bus.setVolume('vo', Number(v)));
    sub(app.state.sfxVolume, (v) => bus.setVolume('sfx', Number(v)));
    sub(app.state.musicVolume, (v) => bus.setVolume('music', Number(v)));
    sub(app.state.captionsMuted, (v) => {
      captionsMuted = Boolean(v);
      handlers.onCaptionsMuted?.(captionsMuted);
    });
  }

  return {
    get captionsMuted() {
      return captionsMuted;
    },
    destroy() {
      for (const u of unsubs) u();
    },
  };
}

export type CreateSpringrollResult = {
  app: SpringrollLike;
  /** Resolve after story assets are ready so Application can send `loaded` */
  loadGate: LoadGate;
  owned: true;
};

/**
 * Create a SpringRoll Application whose `loaded` / `state.ready` wait until
 * `loadGate.resolve()` — i.e. until Fancifully finishes unpacking + asset load.
 */
export async function createSpringrollApplication(
  features: Record<string, boolean>,
): Promise<CreateSpringrollResult | null> {
  try {
    const mod = (await import('springroll')) as unknown as {
      Application?: {
        new (opts: unknown): SpringrollLike;
        uses: (plugin: unknown) => void;
      };
      ApplicationPlugin?: new (opts: { name: string }) => {
        name: string;
        preload: (app: unknown) => Promise<unknown>;
      };
      default?: {
        Application?: {
          new (opts: unknown): SpringrollLike;
          uses: (plugin: unknown) => void;
        };
        ApplicationPlugin?: new (opts: { name: string }) => {
          name: string;
          preload: (app: unknown) => Promise<unknown>;
        };
      };
    };

    const Application = mod.Application ?? mod.default?.Application;
    const ApplicationPlugin = mod.ApplicationPlugin ?? mod.default?.ApplicationPlugin;

    if (!Application) return null;

    const loadGate = createLoadGate();
    const pluginName = `fancifully-story-load-${Math.random().toString(36).slice(2, 9)}`;

    if (ApplicationPlugin && typeof Application.uses === 'function') {
      const plugin = new ApplicationPlugin({ name: pluginName });
      plugin.preload = () => loadGate.promise;
      Application.uses(plugin);
    } else {
      // No plugin API — resolve immediately; progress events still fire during load
      loadGate.resolve();
    }

    const app = new Application({ features });
    return { app, loadGate, owned: true };
  } catch {
    return null;
  }
}

export function waitForSpringrollReady(app: SpringrollLike | null | undefined): Promise<void> {
  if (!app?.state?.ready) return Promise.resolve();
  if (app.state.ready.value === true) return Promise.resolve();
  return new Promise((resolve) => {
    const sub = app.state!.ready!.subscribe((ready) => {
      if (ready) {
        if (typeof sub === 'function') (sub as () => void)();
        resolve();
      }
    });
  });
}
