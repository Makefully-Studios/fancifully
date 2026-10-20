import {
  buildSpreads,
  contentPageIds,
  findSpreadIndexForPage,
  resolveLayoutMode,
  type Spread,
} from './layoutMode.js';
import type { LayoutMode, ResolvedLayoutMode, Story } from '../schema/story.js';
import type { SpreadView } from '../render/SpreadView.js';

export type PagerEvents = {
  pagechange: {
    pageIds: string[];
    index: number;
    layoutMode: ResolvedLayoutMode;
  };
  layoutchange: {
    layoutMode: ResolvedLayoutMode;
  };
};

type Listener<K extends keyof PagerEvents> = (payload: PagerEvents[K]) => void;

export class Pager {
  private story: Story;
  private spreadView: SpreadView;
  private spreads: Spread[];
  private spreadIndex = 0;
  private preferredMode: LayoutMode;
  private resolvedMode: ResolvedLayoutMode = 'single';
  private breakpoint: number;
  private listeners = new Map<keyof PagerEvents, Set<Listener<keyof PagerEvents>>>();
  private busy = false;

  constructor(story: Story, spreadView: SpreadView) {
    this.story = story;
    this.spreadView = spreadView;
    this.spreads = buildSpreads(story.pages);
    this.preferredMode = story.layout.mode;
    this.breakpoint = story.layout.singleBreakpoint;
  }

  get layoutMode(): ResolvedLayoutMode {
    return this.resolvedMode;
  }

  get currentSpread(): Spread {
    return this.spreads[this.spreadIndex];
  }

  get currentPageIds(): string[] {
    return contentPageIds(this.currentSpread);
  }

  on<K extends keyof PagerEvents>(event: K, fn: Listener<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(fn as Listener<keyof PagerEvents>);
    return () => this.listeners.get(event)?.delete(fn as Listener<keyof PagerEvents>);
  }

  setLayoutMode(mode: LayoutMode, containerWidth: number): void {
    this.preferredMode = mode;
    this.updateLayout(containerWidth, false);
  }

  updateLayout(containerWidth: number, emitIfChanged = true): void {
    const next = resolveLayoutMode(this.preferredMode, containerWidth, this.breakpoint);
    const changed = next !== this.resolvedMode;
    this.resolvedMode = next;
    this.spreadView.setLayoutMode(next);
    if (changed && emitIfChanged) {
      this.emit('layoutchange', { layoutMode: next });
    }
  }

  async showInitial(): Promise<void> {
    await this.spreadView.showSpread(this.currentSpread, 'none');
    this.emitPageChange();
  }

  async next(): Promise<void> {
    if (this.busy || this.spreadIndex >= this.spreads.length - 1) return;
    this.busy = true;
    this.spreadIndex += 1;
    await this.spreadView.showSpread(this.currentSpread, 'next');
    this.emitPageChange();
    this.busy = false;
  }

  async prev(): Promise<void> {
    if (this.busy || this.spreadIndex <= 0) return;
    this.busy = true;
    this.spreadIndex -= 1;
    await this.spreadView.showSpread(this.currentSpread, 'prev');
    this.emitPageChange();
    this.busy = false;
  }

  async goTo(pageId: string): Promise<void> {
    const index = findSpreadIndexForPage(this.spreads, pageId);
    if (index === this.spreadIndex) return;
    const dir = index > this.spreadIndex ? 'next' : 'prev';
    this.busy = true;
    this.spreadIndex = index;
    await this.spreadView.showSpread(this.currentSpread, dir);
    this.emitPageChange();
    this.busy = false;
  }

  private emitPageChange(): void {
    this.emit('pagechange', {
      pageIds: this.currentPageIds,
      index: this.spreadIndex,
      layoutMode: this.resolvedMode,
    });
  }

  private emit<K extends keyof PagerEvents>(event: K, payload: PagerEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      (fn as Listener<K>)(payload);
    }
  }
}
