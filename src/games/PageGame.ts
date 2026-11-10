import type { LoadedAssets } from '../load/loadStory.js';
import type { Story, StoryBlock, StoryPage } from '../schema/story.js';

export type AreaBlock = Extract<StoryBlock, { type: 'area' }>;

/** Context passed to a host page game while it is mounted in an area. */
export type PageGameContext = {
  el: HTMLElement;
  page: StoryPage;
  block: AreaBlock;
  story: Story;
  assets: LoadedAssets;
  /** Mark this area complete (unlocks nav when `requireComplete` is set). */
  onComplete: () => void;
  /** Aborted when the area is torn down (page leave / destroy). */
  signal: AbortSignal;
};

export type PageGameHandle = {
  destroy(): void;
};

export type PageGameFactory = (
  ctx: PageGameContext,
) => PageGameHandle | void | Promise<PageGameHandle | void>;

const registry = new Map<string, PageGameFactory>();

/** Register a named page game for `area.game` lookup. */
export function registerPageGame(id: string, factory: PageGameFactory): void {
  registry.set(id, factory);
}

export function getRegisteredPageGame(id: string): PageGameFactory | undefined {
  return registry.get(id);
}

export function listRegisteredPageGames(): string[] {
  return [...registry.keys()];
}

export function unregisterPageGame(id: string): void {
  registry.delete(id);
}

/** Clear all registrations (tests). */
export function clearPageGameRegistry(): void {
  registry.clear();
}

/** True when any mounted area with `requireComplete` has not called `onComplete`. */
export function isAreaNavGated(
  sessions: ReadonlyArray<{ requireComplete: boolean; complete: boolean }>,
): boolean {
  return sessions.some((s) => s.requireComplete && !s.complete);
}
