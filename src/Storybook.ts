import { AudioBus } from './audio/AudioBus.js';
import { ReadAloudPlayer, type ReadAloudClip } from './audio/ReadAloudPlayer.js';
import type { FlipStyleInput } from './flip/index.js';
import {
  getRegisteredPageGame,
  isAreaNavGated,
  type AreaBlock,
  type PageGameFactory,
  type PageGameHandle,
} from './games/PageGame.js';
import { bindSwipe } from './interaction/Pointer.js';
import { findFanciFile, isFanciFile } from './load/fanciFile.js';
import { loadStory, revokeLoadedStory, type LoadedAssets, type LoadedStory } from './load/loadStory.js';
import type { StorySource } from './load/packageTypes.js';
import type { LayoutMode } from './nav/layoutMode.js';
import { Pager, type PagerEvents } from './nav/Pager.js';
import { downloadBlob, packFanci } from './pack/packFanci.js';
import { SpreadView, type StageZoom } from './render/SpreadView.js';
import type { Cue, Story, StoryPage, TapAction } from './schema/story.js';
import {
  bindApplication,
  createSpringrollApplication,
  waitForSpringrollReady,
  type SpringrollLike,
} from './springroll/bindApplication.js';
import {
  reportSpringrollProgress,
  type LoadProgress,
} from './springroll/loading.js';
import { setButtonIconContent } from './ui/iconifyIcon.js';

export type StorybookChromeOptions = {
  /** Hide built-in chrome (host can call next/prev/playReadAloud). */
  hidden?: boolean;
  /** Extra class(es) on `.fc-chrome` (e.g. `goldipup-chrome fc-chrome--images`). */
  className?: string;
  labels?: { prev?: string; read?: string; next?: string };
  ariaLabels?: { prev?: string; read?: string; next?: string };
};

export type StorybookOptions = {
  /** JSON URL/object, `.fanci` / `.epub` URL, or File/Blob/ArrayBuffer */
  story: StorySource | Story;
  baseUrl?: string;
  /** Filename hint when `story` is raw bytes */
  storyName?: string;
  springroll?: SpringrollLike | null;
  features?: Record<string, boolean>;
  autoPlayReadAloud?: boolean;
  /** Extra progress listener (SpringRoll Container also receives progress/loading). */
  onProgress?: (progress: LoadProgress) => void;
  /** Built-in Prev / Read / Next chrome labels and visibility. */
  chrome?: StorybookChromeOptions;
  /**
   * Page-flip style: registered id (`"default"`), a {@link FlipStyle} subclass,
   * or an instance. Host setting (not part of story JSON).
   */
  flipStyle?: FlipStyleInput;
  /** Flip duration in milliseconds. Host setting (not part of story JSON). */
  flipSpeed?: number;
  /**
   * How pages are presented: one at a time, facing pairs, by orientation, or
   * by stage width. Host setting (not part of story JSON). Default `auto`.
   */
  layoutMode?: LayoutMode;
  /** Stage width in px where `auto` switches to two-page. Default 900. */
  singleBreakpoint?: number;
  /**
   * Host page games keyed by `area.game` id. Overrides global
   * {@link registerPageGame} registrations for this instance.
   */
  pageGames?: Record<string, PageGameFactory>;
};

export type EditableLeaf = {
  side: 'left' | 'right';
  pageIndex: number;
  pageId: string;
  slot: HTMLElement;
};

type StorybookEvents = PagerEvents & {
  ready: { story: Story };
  loading: LoadProgress;
  areacomplete: { pageId: string; blockId: string; game: string };
};

type Listener<K extends keyof StorybookEvents> = (payload: StorybookEvents[K]) => void;

const DEFAULT_FEATURES = {
  sound: true,
  soundVolume: true,
  vo: true,
  voVolume: true,
  sfx: true,
  sfxVolume: true,
  music: true,
  musicVolume: true,
  captions: true,
};

export class Storybook {
  readonly element: HTMLElement;
  private root: HTMLElement;
  private stage: HTMLElement;
  private chrome: HTMLElement;
  private captionsEl: HTMLElement;
  private loaded: LoadedStory;
  private spreadView: SpreadView;
  private pager: Pager;
  private bus = new AudioBus();
  private readAloud: ReadAloudPlayer;
  private springroll: SpringrollLike | null;
  private bindings: ReturnType<typeof bindApplication> | null = null;
  private sfxAudio: HTMLAudioElement;
  private unbindSwipe: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private listeners = new Map<string, Set<Listener<keyof StorybookEvents>>>();
  private destroyed = false;
  private btnPrev: HTMLButtonElement;
  private btnRead: HTMLButtonElement;
  private btnNext: HTMLButtonElement;
  private chromeHiddenByOptions = false;
  /** Extra zip paths → bytes (fonts/images added by hosts/editors) for packFanci. */
  private extraFiles: Record<string, Uint8Array> = {};
  private defaultFontFamily: string | null = null;
  /** When true, swipe/keyboard/chrome nav and read-aloud are locked (editor overlay). */
  private navLocked = false;
  /** Instance page-game factories (override the global registry). */
  private pageGames = new Map<string, PageGameFactory>();
  private areaSessions: Array<{
    blockId: string;
    pageId: string;
    game: string;
    requireComplete: boolean;
    complete: boolean;
    abort: AbortController;
    handle: PageGameHandle | null;
  }> = [];

  private constructor(
    container: HTMLElement,
    loaded: LoadedStory,
    springroll: SpringrollLike | null,
    autoPlayReadAloud: boolean,
    chromeOptions: StorybookChromeOptions = {},
    flipStyle?: FlipStyleInput,
    flipSpeed?: number,
    layoutMode?: LayoutMode,
    singleBreakpoint?: number,
    pageGames?: Record<string, PageGameFactory>,
  ) {
    this.root = container;
    this.loaded = loaded;
    this.springroll = springroll;
    this.chromeHiddenByOptions = Boolean(chromeOptions.hidden);
    if (pageGames) {
      for (const [id, factory] of Object.entries(pageGames)) {
        this.pageGames.set(id, factory);
      }
    }

    this.element = document.createElement('div');
    this.element.className = 'fc-root';
    this.element.tabIndex = 0;

    this.stage = document.createElement('div');
    this.stage.className = 'fc-stage';

    this.captionsEl = document.createElement('div');
    this.captionsEl.className = 'fc-captions';
    this.captionsEl.setAttribute('aria-live', 'polite');

    const labels = {
      prev: chromeOptions.labels?.prev ?? 'Prev',
      read: chromeOptions.labels?.read ?? 'Read',
      next: chromeOptions.labels?.next ?? 'Next',
    };
    const ariaLabels = {
      prev: chromeOptions.ariaLabels?.prev ?? 'Previous page',
      read: chromeOptions.ariaLabels?.read ?? 'Read aloud',
      next: chromeOptions.ariaLabels?.next ?? 'Next page',
    };

    this.chrome = document.createElement('div');
    this.chrome.className = ['fc-chrome', chromeOptions.className].filter(Boolean).join(' ');
    this.chrome.hidden = Boolean(chromeOptions.hidden);

    this.btnPrev = document.createElement('button');
    this.btnPrev.type = 'button';
    this.btnPrev.className = 'fc-btn fc-btn-prev';
    this.btnPrev.setAttribute('aria-label', ariaLabels.prev);
    setButtonIconContent(this.btnPrev, {
      icon: 'chevron-left',
      label: labels.prev,
      iconOnly: true,
    });

    this.btnRead = document.createElement('button');
    this.btnRead.type = 'button';
    this.btnRead.className = 'fc-btn fc-btn-read';
    this.btnRead.setAttribute('aria-label', ariaLabels.read);
    setButtonIconContent(this.btnRead, {
      icon: 'book-open-page-variant',
      label: labels.read,
      iconOnly: true,
    });

    this.btnNext = document.createElement('button');
    this.btnNext.type = 'button';
    this.btnNext.className = 'fc-btn fc-btn-next';
    this.btnNext.setAttribute('aria-label', ariaLabels.next);
    setButtonIconContent(this.btnNext, {
      icon: 'chevron-right',
      label: labels.next,
      iconOnly: true,
    });

    this.chrome.append(this.btnPrev, this.btnRead, this.btnNext);

    this.spreadView = new SpreadView(
      loaded.story,
      loaded.assets,
      (actions, pageEl) => this.handleTapActions(actions, pageEl),
      {
        flipStyle: flipStyle ?? 'default',
        flipSpeed,
      },
    );
    this.pager = new Pager(loaded.story, this.spreadView, {
      mode: layoutMode,
      singleBreakpoint,
    });
    this.readAloud = new ReadAloudPlayer(this.bus);
    this.sfxAudio = new Audio();
    this.bus.register(this.sfxAudio, 'sfx');

    this.stage.appendChild(this.spreadView.element);
    this.element.append(this.stage, this.captionsEl, this.chrome);
    this.root.appendChild(this.element);

    this.wireChrome();
    this.wirePager(autoPlayReadAloud);
    this.wireSpringroll();
    this.wireResize();
    this.unbindSwipe = bindSwipe(this.stage, {
      onSwipeLeft: () => {
        if (!this.isReaderNavBlocked()) void this.next();
      },
      onSwipeRight: () => {
        if (!this.isReaderNavBlocked()) void this.prev();
      },
    });

    this.element.addEventListener('keydown', (event) => {
      if (this.isReaderNavBlocked()) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        void this.next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        void this.prev();
      } else if (event.key === ' ') {
        event.preventDefault();
        void this.playReadAloud();
      }
    });

    this.readAloud.onCaption((text) => {
      this.captionsEl.textContent = text ?? '';
      this.captionsEl.hidden = !text;
    });
  }

  static async create(container: HTMLElement, options: StorybookOptions): Promise<Storybook> {
    const features = { ...DEFAULT_FEATURES, ...options.features };
    let springroll = options.springroll ?? null;
    let loadGate: { resolve: () => void } | null = null;

    if (!springroll) {
      const created = await createSpringrollApplication(features);
      if (created) {
        springroll = created.app;
        loadGate = created.loadGate;
        primeSpringrollListeners(springroll);
      }
    }

    const progressListeners: Array<(p: LoadProgress) => void> = [];
    if (options.onProgress) progressListeners.push(options.onProgress);

    const reportProgress = (progress: LoadProgress) => {
      reportSpringrollProgress(springroll, progress);
      for (const fn of progressListeners) fn(progress);
    };

    reportProgress({ stage: 'fetch', progress: 0, detail: 'start' });

    const loaded = await loadStory(options.story, {
      baseUrl: options.baseUrl,
      name: options.storyName,
      onProgress: reportProgress,
    });

    loadGate?.resolve();
    await waitForSpringrollReady(springroll);

    const book = new Storybook(
      container,
      loaded,
      springroll,
      options.autoPlayReadAloud ?? false,
      options.chrome ?? {},
      options.flipStyle,
      options.flipSpeed,
      options.layoutMode,
      options.singleBreakpoint,
      options.pageGames,
    );

    book.pager.updateLayout(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
      false,
    );
    book.layoutStage();
    await book.pager.showInitial();
    await book.syncPageGames();
    book.syncChromeNavState();
    book.emit('ready', { story: loaded.story });
    return book;
  }

  get story(): Story {
    return this.loaded.story;
  }

  get assets(): LoadedAssets {
    return this.loaded.assets;
  }

  get baseUrl(): string {
    return this.loaded.baseUrl;
  }

  /** Mutable list of blob URLs owned by the loaded package (hosts may push). */
  get blobUrls(): string[] {
    return this.loaded.blobUrls;
  }

  get layoutMode() {
    return this.pager.layoutMode;
  }

  /** Host preference (`auto`, `responsive`, …) before it resolves to single or two-page. */
  get layoutPreference(): LayoutMode {
    return this.pager.layoutPreference;
  }

  get pageIds(): string[] {
    return this.pager.currentPageIds;
  }

  get spreadIndex(): number {
    return this.pager.currentSpread.index;
  }

  get isNavLocked(): boolean {
    return this.navLocked;
  }

  /** True when editor lock or an incomplete `requireComplete` area blocks turning. */
  private isReaderNavBlocked(): boolean {
    return this.navLocked || this.hasIncompleteAreaGate();
  }

  private hasIncompleteAreaGate(): boolean {
    return isAreaNavGated(this.areaSessions);
  }

  getDefaultFontFamily(): string | null {
    return this.defaultFontFamily;
  }

  setDefaultFontFamily(family: string | null): void {
    this.defaultFontFamily = family;
  }

  getExtraFiles(): Record<string, Uint8Array> {
    return this.extraFiles;
  }

  putExtraFile(path: string, bytes: Uint8Array): void {
    this.extraFiles[path] = bytes;
  }

  /**
   * Lock player navigation (swipe/keys/chrome) for overlay editors.
   * When locked, also hides book chrome unless the host already hid it.
   */
  setNavLocked(locked: boolean): void {
    this.navLocked = locked;
    if (locked) {
      this.readAloud.stop();
      this.chrome.hidden = true;
    } else {
      this.chrome.hidden = this.chromeHiddenByOptions;
      this.syncChromeNavState();
    }
  }

  /** Visible content leaves for overlay editors (Fabric, etc.). */
  getEditableLeaves(): EditableLeaf[] {
    const spread = this.pager.currentSpread;
    return this.spreadView.getEditableLeaves(this.pager.layoutMode, spread).map((leaf) => ({
      side: leaf.side,
      pageIndex: leaf.pageIndex,
      pageId: this.loaded.story.pages[leaf.pageIndex]?.id ?? '',
      slot: leaf.slot,
    }));
  }

  /** The `.fc-spread` book element — host for a spread-wide editor overlay. */
  getSpreadElement(): HTMLElement {
    return this.spreadView.bookEl;
  }

  get bookState() {
    return this.pager.currentBookState;
  }

  /** Left/right content pages for the current spread (`null` = blank leaf). */
  getSpreadPages(): { left: StoryPage | null; right: StoryPage | null } {
    const spread = this.pager.currentSpread;
    const pages = this.loaded.story.pages;
    return {
      left: spread.left.kind === 'page' ? (pages[spread.left.pageIndex] ?? null) : null,
      right: spread.right.kind === 'page' ? (pages[spread.right.pageIndex] ?? null) : null,
    };
  }

  setPageViewsHidden(hidden: boolean): void {
    this.spreadView.setPageViewsHidden(hidden);
  }

  remountCurrent(): void {
    this.spreadView.remountCurrent();
    this.layoutStage();
    void this.syncPageGames();
  }

  on<K extends keyof StorybookEvents>(event: K, fn: Listener<K>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn as Listener<keyof StorybookEvents>);
    return () => this.listeners.get(event)?.delete(fn as Listener<keyof StorybookEvents>);
  }

  next(): Promise<void> {
    if (this.isReaderNavBlocked()) return Promise.resolve();
    return this.navigate(() => this.pager.next());
  }

  prev(): Promise<void> {
    if (this.isReaderNavBlocked()) return Promise.resolve();
    return this.navigate(() => this.pager.prev());
  }

  goTo(pageId: string): Promise<void> {
    if (this.isReaderNavBlocked()) return Promise.resolve();
    return this.navigate(() => this.pager.goTo(pageId));
  }

  /** Editor-only. Does not change single vs two-page layout. */
  setStageZoom(zoom: StageZoom): void {
    this.spreadView.setStageZoom(zoom);
    this.stage.classList.toggle('fc-stage-scroll', zoom.mode === 'percent');
    this.stage.classList.toggle('fc-stage-fit-page', zoom.mode === 'fit-page');
    this.layoutStage();
  }

  setLayoutMode(mode: LayoutMode): void {
    this.pager.setLayoutMode(
      mode,
      this.root.clientWidth || window.innerWidth,
      this.root.clientHeight || window.innerHeight,
    );
    this.layoutStage();
    this.syncChromeNavState();
    this.emit('layoutchange', { layoutMode: this.pager.layoutMode });
  }

  setFlipStyle(style: FlipStyleInput): void {
    this.spreadView.setFlipStyle(style);
  }

  setFlipSpeed(speedMs: number): void {
    this.spreadView.setFlipSpeed(speedMs);
  }

  playReadAloud(): Promise<void> {
    if (this.navLocked) return Promise.resolve();
    const clips = this.buildReadAloudClips();
    return this.readAloud.playSequence(clips);
  }

  pause(): void {
    this.readAloud.pause();
    this.bus.setPaused(true);
  }

  resume(): void {
    this.bus.setPaused(false);
    this.readAloud.resume();
  }

  /** Replace the loaded story from a File / URL / Story object. */
  async replaceStory(source: StorySource | Story, storyName?: string): Promise<void> {
    this.readAloud.stop();
    const previous = this.loaded;
    const loaded = await loadStory(source, {
      name: storyName ?? (source instanceof File ? source.name : undefined),
    });
    revokeLoadedStory(previous);

    this.loaded = loaded;
    this.extraFiles = {};
    this.defaultFontFamily = null;

    this.spreadView.setLoaded(loaded.story, loaded.assets);
    this.pager.replaceStory(loaded.story, loaded.story.pages[0]?.id ?? null);
    this.layoutStage();
    await this.syncPageGames();
    this.syncChromeNavState();
    this.emit('ready', { story: loaded.story });
  }

  /** Open a `.fanci` File (validates extension/MIME). */
  async openFanciFile(file: File): Promise<void> {
    if (!isFanciFile(file)) {
      throw new Error(`Expected a .fanci file, got ${file.name}`);
    }
    await this.replaceStory(file, file.name);
  }

  /** Replace a page in-place and remount the current spread. */
  async updatePage(page: StoryPage): Promise<void> {
    const index = this.loaded.story.pages.findIndex((p) => p.id === page.id);
    if (index < 0) return;
    this.loaded.story.pages[index] = page;
    this.spreadView.setStory(this.loaded.story);
    this.spreadView.remountCurrent();
    this.layoutStage();
  }

  async setPages(pages: StoryPage[], preferPageId?: string | null): Promise<void> {
    this.loaded.story.pages = pages;
    this.spreadView.setStory(this.loaded.story);
    this.pager.rebuildFromStory(preferPageId ?? this.pager.currentPageIds[0] ?? null);
    this.layoutStage();
    this.syncChromeNavState();
  }

  async addPage(): Promise<StoryPage> {
    const page = createBlankPage(this.loaded.story);
    this.loaded.story.pages.push(page);
    this.spreadView.setStory(this.loaded.story);
    this.pager.rebuildFromStory(page.id);
    this.layoutStage();
    this.syncChromeNavState();
    return page;
  }

  async removePage(pageId: string): Promise<void> {
    if (this.loaded.story.pages.length <= 1) return;
    const idx = this.loaded.story.pages.findIndex((p) => p.id === pageId);
    if (idx < 0) return;
    this.loaded.story.pages.splice(idx, 1);
    const prefer =
      this.loaded.story.pages[Math.min(idx, this.loaded.story.pages.length - 1)]?.id ?? null;
    this.spreadView.setStory(this.loaded.story);
    this.pager.rebuildFromStory(prefer);
    this.layoutStage();
    this.syncChromeNavState();
  }

  async reorderPages(fromIndex: number, toIndex: number): Promise<void> {
    const pages = this.loaded.story.pages;
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= pages.length ||
      toIndex >= pages.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const [moved] = pages.splice(fromIndex, 1);
    if (!moved) return;
    pages.splice(toIndex, 0, moved);
    this.spreadView.setStory(this.loaded.story);
    this.pager.rebuildFromStory(moved.id);
    this.layoutStage();
    this.syncChromeNavState();
  }

  async setFrontCover(enabled: boolean): Promise<void> {
    this.loaded.story.frontCover = enabled;
    this.spreadView.setStory(this.loaded.story);
    this.pager.rebuildFromStory(this.pager.currentPageIds[0] ?? null);
    this.layoutStage();
    this.syncChromeNavState();
  }

  async setBackCover(enabled: boolean): Promise<void> {
    this.loaded.story.backCover = enabled;
    this.spreadView.setStory(this.loaded.story);
    this.pager.rebuildFromStory(this.pager.currentPageIds[0] ?? null);
    this.layoutStage();
    this.syncChromeNavState();
  }

  async setHardback(enabled: boolean): Promise<void> {
    this.loaded.story.hardback = enabled;
    this.spreadView.setStory(this.loaded.story);
    this.layoutStage();
  }

  /** Apply a font family to every text block in the story. */
  applyFontToAllText(family: string): void {
    this.defaultFontFamily = family;
    for (const page of this.loaded.story.pages) {
      for (const block of page.blocks) {
        if (block.type === 'text') {
          block.style = { ...block.style, fontFamily: family };
        }
      }
    }
  }

  async packToBlob(): Promise<Blob> {
    return packFanci(this.loaded.story, {
      baseUrl: this.loaded.baseUrl,
      files: { ...this.extraFiles },
    });
  }

  async downloadFanci(filename?: string): Promise<void> {
    const name = filename ?? `${this.loaded.story.id || 'story'}.fanci`;
    const blob = await this.packToBlob();
    downloadBlob(blob, name.endsWith('.fanci') ? name : `${name}.fanci`);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.teardownPageGames();
    this.readAloud.destroy();
    this.bus.unregister(this.sfxAudio);
    this.bindings?.destroy();
    this.unbindSwipe?.();
    this.resizeObserver?.disconnect();
    this.spreadView.destroy();
    this.element.remove();
    this.listeners.clear();
    revokeLoadedStory(this.loaded);
  }

  private async navigate(action: () => Promise<void>): Promise<void> {
    this.readAloud.stop();
    await action();
    this.layoutStage();
  }

  private wireChrome(): void {
    this.btnPrev.addEventListener('click', () => void this.prev());
    this.btnNext.addEventListener('click', () => void this.next());
    this.btnRead.addEventListener('click', () => void this.playReadAloud());
  }

  private syncChromeNavState(): void {
    const gated = this.hasIncompleteAreaGate();
    const canPrev = this.pager.canPrev && !gated && !this.navLocked;
    const canNext = this.pager.canNext && !gated && !this.navLocked;
    this.btnPrev.disabled = !canPrev;
    this.btnNext.disabled = !canNext;
    this.btnPrev.classList.toggle('is-disabled', !canPrev);
    this.btnNext.classList.toggle('is-disabled', !canNext);
    this.btnPrev.setAttribute('aria-disabled', String(!canPrev));
    this.btnNext.setAttribute('aria-disabled', String(!canNext));
  }

  private wirePager(autoPlay: boolean): void {
    this.pager.on('pagechange', (payload) => {
      void this.syncPageGames().then(() => {
        this.syncChromeNavState();
        this.emit('pagechange', payload);
        if (autoPlay && !this.navLocked) void this.playReadAloud();
      });
    });
    this.pager.on('layoutchange', (payload) => {
      this.readAloud.stop();
      this.layoutStage();
      void this.syncPageGames().then(() => {
        this.syncChromeNavState();
        this.emit('layoutchange', payload);
      });
    });
  }

  private wireSpringroll(): void {
    this.bindings = bindApplication(this.springroll, this.bus, {
      onCaptionsMuted: (muted) => this.readAloud.setCaptionsMuted(muted),
      onPause: (paused) => {
        if (paused) this.readAloud.pause();
        else this.readAloud.resume();
      },
    });
  }

  private wireResize(): void {
    const onResize = () => {
      this.pager.updateLayout(
        this.root.clientWidth || window.innerWidth,
        this.root.clientHeight || window.innerHeight,
      );
      this.layoutStage();
    };
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(onResize);
      this.resizeObserver.observe(this.root);
    } else {
      window.addEventListener('resize', onResize);
    }
  }

  private layoutStage(): void {
    const width = this.stage.clientWidth || this.root.clientWidth || window.innerWidth;
    let height = this.stage.clientHeight || Math.max(320, this.root.clientHeight - 64);
    this.spreadView.updateStageSize(
      width,
      height,
      this.pager.layoutMode,
      this.pager.currentSpread,
    );
    // Fit page can be wider than the stage. The horizontal scrollbar then
    // shrinks the content box, so measure once more and center in that height.
    if (this.stage.classList.contains('fc-stage-fit-page')) {
      const fitted = this.stage.clientHeight;
      if (fitted > 0 && fitted !== height) {
        height = fitted;
        this.spreadView.updateStageSize(
          width,
          height,
          this.pager.layoutMode,
          this.pager.currentSpread,
        );
      }
    }
  }

  private buildReadAloudClips(): ReadAloudClip[] {
    const mode = this.pager.layoutMode;
    const spread = this.pager.currentSpread;
    const bookState = this.pager.currentBookState;

    let leaves = [spread.left, spread.right];
    if (bookState === 'closed-front') {
      leaves = [spread.left];
    } else if (bookState === 'closed-back') {
      leaves = [spread.right];
    } else if (mode === 'single') {
      leaves =
        spread.left.kind === 'blank'
          ? [spread.right]
          : spread.right.kind === 'blank'
            ? [spread.left]
            : [spread.left];
    }

    const clips: ReadAloudClip[] = [];
    for (const leaf of leaves) {
      if (leaf.kind !== 'page') continue;
      const page = this.loaded.story.pages[leaf.pageIndex];
      if (!page.readAloud) continue;
      const audioMeta = this.loaded.assets.audioUrls.get(page.readAloud.audio);
      if (!audioMeta) continue;
      const cues = this.resolveCues(page.readAloud.cues);
      const root = this.spreadView.getPageElement(page.id);
      clips.push({
        url: audioMeta.url,
        channel: audioMeta.channel,
        cues,
        root,
      });
    }
    return clips;
  }

  private resolveCues(cues: string | Cue[] | undefined): Cue[] {
    if (!cues) return [];
    if (Array.isArray(cues)) return cues;
    return this.loaded.assets.cues.get(cues) ?? [];
  }

  private handleTapActions(actions: TapAction[], pageEl: HTMLElement): void {
    if (this.navLocked) return;
    for (const action of actions) {
      if ('play' in action) {
        const meta = this.loaded.assets.audioUrls.get(action.play);
        if (!meta) continue;
        this.sfxAudio.src = meta.url;
        this.bus.applyTo(this.sfxAudio, meta.channel);
        void this.sfxAudio.play().catch(() => undefined);
      } else if ('toggleClass' in action) {
        this.applyClassAction(pageEl, action.toggleClass, 'toggle');
      } else if ('addClass' in action) {
        this.applyClassAction(pageEl, action.addClass, 'add');
      } else if ('removeClass' in action) {
        this.applyClassAction(pageEl, action.removeClass, 'remove');
      } else if ('replayClass' in action) {
        this.applyClassAction(pageEl, action.replayClass, 'replay');
      }
    }
  }

  private applyClassAction(
    pageEl: HTMLElement,
    spec: { target: string; className: string },
    mode: 'toggle' | 'add' | 'remove' | 'replay',
  ): void {
    const target = pageEl.querySelector(`[data-block-id="${spec.target}"]`);
    if (!target) return;
    if (mode === 'toggle') {
      target.classList.toggle(spec.className);
      return;
    }
    if (mode === 'add') {
      target.classList.add(spec.className);
      return;
    }
    if (mode === 'remove') {
      target.classList.remove(spec.className);
      return;
    }
    target.classList.remove(spec.className);
    requestAnimationFrame(() => {
      target.classList.add(spec.className);
    });
  }

  private resolvePageGame(id: string): PageGameFactory | undefined {
    return this.pageGames.get(id) ?? getRegisteredPageGame(id);
  }

  private teardownPageGames(): void {
    for (const session of this.areaSessions) {
      session.abort.abort();
      try {
        session.handle?.destroy();
      } catch {
        /* host cleanup errors should not break navigation */
      }
    }
    this.areaSessions = [];
  }

  /** Destroy prior area games and mount factories for visible area hosts. */
  private async syncPageGames(): Promise<void> {
    this.teardownPageGames();
    if (this.destroyed) return;

    const pages = this.loaded.story.pages;
    const visibleIds = this.pager.currentPageIds;
    for (const pageId of visibleIds) {
      const page = pages.find((p) => p.id === pageId);
      const pageEl = this.spreadView.getPageElement(pageId);
      if (!page || !pageEl) continue;

      for (const block of page.blocks) {
        if (block.type !== 'area') continue;
        const host = [...pageEl.querySelectorAll<HTMLElement>('.fc-block-area')].find(
          (node) => node.dataset.blockId === block.id,
        );
        if (!host) continue;

        const factory = this.resolvePageGame(block.game);
        const abort = new AbortController();
        const session = {
          blockId: block.id,
          pageId: page.id,
          game: block.game,
          requireComplete: Boolean(block.requireComplete),
          complete: !block.requireComplete,
          abort,
          handle: null as PageGameHandle | null,
        };
        this.areaSessions.push(session);

        if (!factory) {
          host.replaceChildren();
          const missing = document.createElement('p');
          missing.className = 'fc-area-missing';
          missing.textContent = `Missing page game: ${block.game}`;
          host.append(missing);
          continue;
        }

        const areaBlock = block as AreaBlock;
        try {
          const handle = await factory({
            el: host,
            page,
            block: areaBlock,
            story: this.loaded.story,
            assets: this.loaded.assets,
            signal: abort.signal,
            onComplete: () => {
              if (session.complete) return;
              session.complete = true;
              this.syncChromeNavState();
              this.emit('areacomplete', {
                pageId: session.pageId,
                blockId: session.blockId,
                game: session.game,
              });
            },
          });
          if (abort.signal.aborted) {
            handle?.destroy();
          } else if (handle) {
            session.handle = handle;
          }
        } catch (error) {
          console.error(`Page game "${block.game}" failed to mount`, error);
        }
      }
    }

    this.syncChromeNavState();
  }

  private emit<K extends keyof StorybookEvents>(event: K, payload: StorybookEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) (fn as Listener<K>)(payload);
  }
}

export { findFanciFile };

function createBlankPage(story: Story): StoryPage {
  let n = story.pages.length + 1;
  let id = `page-${n}`;
  const existing = new Set(story.pages.map((p) => p.id));
  while (existing.has(id)) {
    n += 1;
    id = `page-${n}`;
  }
  return {
    id,
    background: { color: '#faf6ef' },
    blocks: [],
  };
}

function primeSpringrollListeners(app: SpringrollLike): void {
  const state = app.state;
  if (!state) return;
  state.pause?.subscribe(() => undefined);
  state.soundVolume?.subscribe(() => undefined);
  state.voVolume?.subscribe(() => undefined);
  state.sfxVolume?.subscribe(() => undefined);
  state.musicVolume?.subscribe(() => undefined);
  state.captionsMuted?.subscribe(() => undefined);
}
