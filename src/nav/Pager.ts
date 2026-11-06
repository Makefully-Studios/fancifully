import {
  buildBackCoverSpread,
  buildFrontCoverSpread,
  buildSpreads,
  contentPageIds,
  DEFAULT_LAYOUT_MODE,
  DEFAULT_SINGLE_BREAKPOINT,
  findSpreadIndexForPage,
  primaryPageId,
  resolveLayoutMode,
  type BookState,
  type CoverOptions,
  type LayoutMode,
  type ResolvedLayoutMode,
  type Spread,
} from './layoutMode.js';
import type { Story } from '../schema/story.js';
import type { SpreadView } from '../render/SpreadView.js';

export type PagerEvents = {
  pagechange: {
    pageIds: string[];
    index: number;
    layoutMode: ResolvedLayoutMode;
    bookState: BookState;
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
  private resolvedMode: ResolvedLayoutMode = 'two-page';
  private breakpoint: number;
  private listeners = new Map<keyof PagerEvents, Set<Listener<keyof PagerEvents>>>();
  private busy = false;
  private hasResolvedLayout = false;
  private bookState: BookState;
  private covers: CoverOptions;
  private frontCoverSpread: Spread | null = null;
  private backCoverSpread: Spread | null = null;

  constructor(
    story: Story,
    spreadView: SpreadView,
    layout: { mode?: LayoutMode; singleBreakpoint?: number } = {},
  ) {
    this.story = story;
    this.spreadView = spreadView;
    this.preferredMode = layout.mode ?? DEFAULT_LAYOUT_MODE;
    this.breakpoint = layout.singleBreakpoint ?? DEFAULT_SINGLE_BREAKPOINT;
    this.covers = {
      frontCover: Boolean(story.frontCover),
      backCover: Boolean(story.backCover),
    };
    this.bookState = this.covers.frontCover ? 'closed-front' : 'open';
    this.rebuildCoverSpreads();
    this.spreads = buildSpreads(story.pages, 'two-page', this.covers);
  }

  get layoutMode(): ResolvedLayoutMode {
    return this.resolvedMode;
  }

  /** Host preference before width/orientation resolution. */
  get layoutPreference(): LayoutMode {
    return this.preferredMode;
  }

  get currentBookState(): BookState {
    return this.bookState;
  }

  get currentSpread(): Spread {
    if (this.bookState === 'closed-front' && this.frontCoverSpread) {
      return this.frontCoverSpread;
    }
    if (this.bookState === 'closed-back' && this.backCoverSpread) {
      return this.backCoverSpread;
    }
    return this.spreads[this.spreadIndex] ?? this.spreads[0];
  }

  get currentPageIds(): string[] {
    if (this.bookState === 'closed-front') {
      const id = this.story.pages[0]?.id;
      return id ? [id] : [];
    }
    if (this.bookState === 'closed-back') {
      const id = this.story.pages[this.story.pages.length - 1]?.id;
      return id ? [id] : [];
    }
    return contentPageIds(this.currentSpread);
  }

  get canPrev(): boolean {
    if (this.bookState === 'closed-front') return false;
    if (this.bookState === 'closed-back') return true;
    if (this.spreadIndex > 0) return true;
    return Boolean(this.covers.frontCover) && this.resolvedMode === 'two-page';
  }

  get canNext(): boolean {
    if (this.bookState === 'closed-back') return false;
    if (this.bookState === 'closed-front') return this.spreads.length > 0 || Boolean(this.covers.backCover);
    if (this.spreadIndex < this.spreads.length - 1) return true;
    return Boolean(this.covers.backCover) && this.resolvedMode === 'two-page';
  }

  on<K extends keyof PagerEvents>(event: K, fn: Listener<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(fn as Listener<keyof PagerEvents>);
    return () => this.listeners.get(event)?.delete(fn as Listener<keyof PagerEvents>);
  }

  setLayoutMode(mode: LayoutMode, containerWidth: number, containerHeight: number): void {
    this.preferredMode = mode;
    this.updateLayout(containerWidth, containerHeight, false);
  }

  updateLayout(
    containerWidth: number,
    containerHeight: number,
    emitIfChanged = true,
  ): void {
    const next = resolveLayoutMode(
      this.preferredMode,
      containerWidth,
      containerHeight,
      this.breakpoint,
    );
    const modeChanged = !this.hasResolvedLayout || next !== this.resolvedMode;
    if (!modeChanged) {
      this.spreadView.setLayoutMode(next);
      return;
    }

    const anchorId =
      this.currentPageIds[0] ??
      primaryPageId(this.spreads[this.spreadIndex]) ??
      this.story.pages[0]?.id ??
      null;

    this.resolvedMode = next;
    this.hasResolvedLayout = true;
    this.rebuildCoverSpreads();
    this.spreads = buildSpreads(this.story.pages, next, this.covers);

    const isCoverPage =
      (this.covers.frontCover && anchorId === this.story.pages[0]?.id) ||
      (this.covers.backCover &&
        anchorId === this.story.pages[this.story.pages.length - 1]?.id);

    if (next === 'single') {
      // Single mode: covers are normal pages in the one-page list.
      this.bookState = 'open';
      this.spreadIndex = anchorId
        ? findSpreadIndexForPage(this.spreads, anchorId)
        : 0;
    } else if (
      this.covers.frontCover &&
      (this.bookState === 'closed-front' ||
        (isCoverPage && anchorId === this.story.pages[0]?.id))
    ) {
      this.bookState = 'closed-front';
      this.spreadIndex = 0;
    } else if (
      this.covers.backCover &&
      (this.bookState === 'closed-back' ||
        (isCoverPage && anchorId === this.story.pages[this.story.pages.length - 1]?.id))
    ) {
      this.bookState = 'closed-back';
      this.spreadIndex = Math.max(0, this.spreads.length - 1);
    } else {
      this.bookState = 'open';
      this.spreadIndex = anchorId
        ? findSpreadIndexForPage(this.spreads, anchorId)
        : 0;
    }

    if (this.spreadIndex >= this.spreads.length) {
      this.spreadIndex = Math.max(0, this.spreads.length - 1);
    }

    this.busy = false;
    this.spreadView.setLayoutMode(next);
    this.spreadView.setBookState(this.bookState);
    void this.spreadView.showSpread(this.currentSpread, 'none');

    if (emitIfChanged) {
      this.emit('layoutchange', { layoutMode: next });
      this.emitPageChange();
    }
  }

  async showInitial(): Promise<void> {
    if (this.covers.frontCover && this.resolvedMode === 'two-page') {
      this.bookState = 'closed-front';
      this.spreadIndex = 0;
    } else {
      this.bookState = 'open';
    }
    await this.spreadView.showSpread(this.currentSpread, 'none');
    this.spreadView.setBookState(this.bookState);
    this.emitPageChange();
  }

  async next(): Promise<void> {
    if (this.busy || !this.canNext) return;
    this.busy = true;

    if (this.bookState === 'closed-front') {
      if (this.spreads.length === 0 && this.covers.backCover && this.backCoverSpread) {
        // Cover-only book: flip straight to back cover.
        this.bookState = 'closed-back';
        await this.spreadView.showSpread(this.backCoverSpread, 'next');
        this.spreadView.setBookState('closed-back');
      } else {
        // Page-flip from cover to first interior spread (cover leaves the view).
        this.bookState = 'open';
        this.spreadIndex = 0;
        await this.spreadView.showSpread(this.currentSpread, 'next');
        this.spreadView.setBookState('open');
      }
      this.emitPageChange();
      this.busy = false;
      return;
    }

    if (
      this.bookState === 'open' &&
      this.covers.backCover &&
      this.backCoverSpread &&
      this.resolvedMode === 'two-page' &&
      this.spreadIndex >= this.spreads.length - 1
    ) {
      // Page-flip from last interior to closed back cover.
      this.bookState = 'closed-back';
      await this.spreadView.showSpread(this.backCoverSpread, 'next');
      this.spreadView.setBookState('closed-back');
      this.emitPageChange();
      this.busy = false;
      return;
    }

    this.spreadIndex += 1;
    await this.spreadView.showSpread(this.currentSpread, 'next');
    this.emitPageChange();
    this.busy = false;
  }

  async prev(): Promise<void> {
    if (this.busy || !this.canPrev) return;
    this.busy = true;

    if (this.bookState === 'closed-back') {
      if (this.spreads.length === 0 && this.covers.frontCover && this.frontCoverSpread) {
        this.bookState = 'closed-front';
        await this.spreadView.showSpread(this.frontCoverSpread, 'prev');
        this.spreadView.setBookState('closed-front');
      } else {
        // Page-flip from back cover to last interior spread.
        this.bookState = 'open';
        this.spreadIndex = Math.max(0, this.spreads.length - 1);
        await this.spreadView.showSpread(this.currentSpread, 'prev');
        this.spreadView.setBookState('open');
      }
      this.emitPageChange();
      this.busy = false;
      return;
    }

    if (
      this.bookState === 'open' &&
      this.covers.frontCover &&
      this.frontCoverSpread &&
      this.resolvedMode === 'two-page' &&
      this.spreadIndex <= 0
    ) {
      // Page-flip from first interior back to closed front cover.
      this.bookState = 'closed-front';
      await this.spreadView.showSpread(this.frontCoverSpread, 'prev');
      this.spreadView.setBookState('closed-front');
      this.emitPageChange();
      this.busy = false;
      return;
    }

    this.spreadIndex -= 1;
    await this.spreadView.showSpread(this.currentSpread, 'prev');
    this.emitPageChange();
    this.busy = false;
  }

  /** Swap the story reference (e.g. after opening a `.fanci`) and rebuild. */
  replaceStory(story: Story, preferPageId?: string | null): void {
    this.story = story;
    this.bookState = story.frontCover ? 'closed-front' : 'open';
    this.rebuildFromStory(preferPageId);
  }

  /**
   * Rebuild spreads/covers from the current story object after page CRUD or
   * cover-flag changes. Remounts the current spread without animation.
   */
  rebuildFromStory(preferPageId?: string | null): void {
    this.covers = {
      frontCover: Boolean(this.story.frontCover),
      backCover: Boolean(this.story.backCover),
    };
    this.rebuildCoverSpreads();
    this.spreads = buildSpreads(this.story.pages, this.resolvedMode, this.covers);

    const anchorId =
      preferPageId ??
      this.currentPageIds[0] ??
      this.story.pages[0]?.id ??
      null;

    if (this.resolvedMode === 'single') {
      this.bookState = 'open';
      this.spreadIndex = anchorId
        ? findSpreadIndexForPage(this.spreads, anchorId)
        : 0;
    } else if (
      this.covers.frontCover &&
      anchorId === this.story.pages[0]?.id &&
      this.bookState === 'closed-front'
    ) {
      this.bookState = 'closed-front';
      this.spreadIndex = 0;
    } else if (
      this.covers.backCover &&
      anchorId === this.story.pages[this.story.pages.length - 1]?.id &&
      this.bookState === 'closed-back'
    ) {
      this.bookState = 'closed-back';
      this.spreadIndex = Math.max(0, this.spreads.length - 1);
    } else {
      this.bookState = 'open';
      this.spreadIndex = anchorId
        ? findSpreadIndexForPage(this.spreads, anchorId)
        : 0;
      // If preferred page is a cover in two-page mode, open the nearest interior.
      if (this.spreadIndex < 0) this.spreadIndex = 0;
    }

    if (this.spreads.length === 0) {
      this.spreadIndex = 0;
      if (this.covers.frontCover) this.bookState = 'closed-front';
      else if (this.covers.backCover) this.bookState = 'closed-back';
    } else if (this.spreadIndex >= this.spreads.length) {
      this.spreadIndex = Math.max(0, this.spreads.length - 1);
    }

    this.busy = false;
    this.spreadView.setLayoutMode(this.resolvedMode);
    this.spreadView.setBookState(this.bookState);
    void this.spreadView.showSpread(this.currentSpread, 'none');
    this.emitPageChange();
  }

  async goTo(pageId: string): Promise<void> {
    const isFront = this.covers.frontCover && this.story.pages[0]?.id === pageId;
    const isBack =
      this.covers.backCover &&
      this.story.pages[this.story.pages.length - 1]?.id === pageId;

    this.busy = true;

    if (isFront && this.resolvedMode === 'two-page' && this.frontCoverSpread) {
      this.bookState = 'closed-front';
      this.spreadIndex = 0;
      await this.spreadView.showSpread(this.frontCoverSpread, 'none');
      this.spreadView.setBookState('closed-front');
      this.emitPageChange();
      this.busy = false;
      return;
    }

    if (isBack && this.resolvedMode === 'two-page' && this.backCoverSpread) {
      this.bookState = 'closed-back';
      this.spreadIndex = Math.max(0, this.spreads.length - 1);
      await this.spreadView.showSpread(this.backCoverSpread, 'none');
      this.spreadView.setBookState('closed-back');
      this.emitPageChange();
      this.busy = false;
      return;
    }

    const index = findSpreadIndexForPage(this.spreads, pageId);
    if (index === this.spreadIndex && this.bookState === 'open') {
      this.busy = false;
      return;
    }

    const dir = index > this.spreadIndex ? 'next' : 'prev';
    this.bookState = 'open';
    this.spreadIndex = index;
    this.spreadView.setBookState('open');
    await this.spreadView.showSpread(this.currentSpread, dir);
    this.emitPageChange();
    this.busy = false;
  }

  private rebuildCoverSpreads(): void {
    this.frontCoverSpread = this.covers.frontCover
      ? buildFrontCoverSpread(this.story.pages)
      : null;
    this.backCoverSpread = this.covers.backCover
      ? buildBackCoverSpread(this.story.pages)
      : null;
  }

  private emitPageChange(): void {
    this.emit('pagechange', {
      pageIds: this.currentPageIds,
      index: this.spreadIndex,
      layoutMode: this.resolvedMode,
      bookState: this.bookState,
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
