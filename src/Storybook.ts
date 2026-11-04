import { AudioBus } from './audio/AudioBus.js';
import { ReadAloudPlayer, type ReadAloudClip } from './audio/ReadAloudPlayer.js';
import { EditorChrome } from './editor/EditorChrome.js';
import { downloadBlob, packFanci } from './editor/packFanci.js';
import { PageCanvas } from './editor/PageCanvas.js';
import type { FlipStyleInput } from './flip/index.js';
import { bindSwipe } from './interaction/Pointer.js';
import { loadStory, revokeLoadedStory, type LoadedStory } from './load/loadStory.js';
import type { StorySource } from './load/packageTypes.js';
import { Pager, type PagerEvents } from './nav/Pager.js';
import { SpreadView } from './render/SpreadView.js';
import type { Cue, LayoutMode, Story, StoryPage, TapAction } from './schema/story.js';
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
   * When true, mount editor chrome (Edit toggle, page CRUD, cover flags, Download .fanci).
   * Does not start in edit mode. Hosts should gate with their prod flag (e.g. `import.meta.env.DEV`).
   */
  editor?: boolean;
};

type StorybookEvents = PagerEvents & {
  ready: { story: Story };
  loading: LoadProgress;
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
  private editorEnabled: boolean;
  private editing = false;
  private chromeHiddenByOptions = false;
  private editorChrome: EditorChrome | null = null;
  private pageCanvases = new Map<'left' | 'right', PageCanvas>();
  private editorMounting = false;
  /** Zip-relative paths → bytes for assets/fonts added during edit (for packFanci). */
  private editorFiles: Record<string, Uint8Array> = {};
  /** Default font family for new textboxes (set by dropping a font on empty canvas). */
  private editorDefaultFontFamily: string | null = null;

  private constructor(
    container: HTMLElement,
    loaded: LoadedStory,
    springroll: SpringrollLike | null,
    autoPlayReadAloud: boolean,
    chromeOptions: StorybookChromeOptions = {},
    flipStyle?: FlipStyleInput,
    flipSpeed?: number,
    editorEnabled = false,
  ) {
    this.root = container;
    this.loaded = loaded;
    this.springroll = springroll;
    this.editorEnabled = editorEnabled;
    this.chromeHiddenByOptions = Boolean(chromeOptions.hidden);

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
    this.btnPrev.textContent = labels.prev;

    this.btnRead = document.createElement('button');
    this.btnRead.type = 'button';
    this.btnRead.className = 'fc-btn fc-btn-read';
    this.btnRead.setAttribute('aria-label', ariaLabels.read);
    this.btnRead.textContent = labels.read;

    this.btnNext = document.createElement('button');
    this.btnNext.type = 'button';
    this.btnNext.className = 'fc-btn fc-btn-next';
    this.btnNext.setAttribute('aria-label', ariaLabels.next);
    this.btnNext.textContent = labels.next;

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
    this.pager = new Pager(loaded.story, this.spreadView);
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
        if (!this.editing) void this.next();
      },
      onSwipeRight: () => {
        if (!this.editing) void this.prev();
      },
    });

    this.element.addEventListener('keydown', (event) => {
      if (this.editing) return;
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

    if (this.editorEnabled) {
      this.mountEditorChrome();
    }
  }

  static async create(container: HTMLElement, options: StorybookOptions): Promise<Storybook> {
    const features = { ...DEFAULT_FEATURES, ...options.features };
    let springroll = options.springroll ?? null;
    let loadGate: { resolve: () => void } | null = null;

    // Create SpringRoll first so Container can show a loading bar while we unpack/load.
    // An ApplicationPlugin holds `loaded` / ready until the story gate resolves.
    if (!springroll) {
      const created = await createSpringrollApplication(features);
      if (created) {
        springroll = created.app;
        loadGate = created.loadGate;
        // Satisfy validateListeners before the plugin preload finishes
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

    // Release SpringRoll ApplicationPlugin → container.send('loaded') + state.ready
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
      Boolean(options.editor),
    );

    book.pager.updateLayout(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
      false,
    );
    book.layoutStage();
    await book.pager.showInitial();
    book.syncChromeNavState();
    book.syncEditorChromeState();
    book.emit('ready', { story: loaded.story });
    return book;
  }

  get story(): Story {
    return this.loaded.story;
  }

  get layoutMode() {
    return this.pager.layoutMode;
  }

  get pageIds(): string[] {
    return this.pager.currentPageIds;
  }

  get spreadIndex(): number {
    return this.pager.currentSpread.index;
  }

  get isEditing(): boolean {
    return this.editing;
  }

  on<K extends keyof StorybookEvents>(event: K, fn: Listener<K>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn as Listener<keyof StorybookEvents>);
    return () => this.listeners.get(event)?.delete(fn as Listener<keyof StorybookEvents>);
  }

  next(): Promise<void> {
    if (this.editing) return Promise.resolve();
    return this.navigate(() => this.pager.next());
  }

  prev(): Promise<void> {
    if (this.editing) return Promise.resolve();
    return this.navigate(() => this.pager.prev());
  }

  goTo(pageId: string): Promise<void> {
    if (this.editing) return Promise.resolve();
    return this.navigate(() => this.pager.goTo(pageId));
  }

  setLayoutMode(mode: LayoutMode): void {
    if (this.editing) {
      this.commitEditorCanvases();
    }
    this.pager.setLayoutMode(
      mode,
      this.root.clientWidth || window.innerWidth,
      this.root.clientHeight || window.innerHeight,
    );
    this.layoutStage();
    this.syncChromeNavState();
    this.emit('layoutchange', { layoutMode: this.pager.layoutMode });
    if (this.editing) {
      void this.mountEditorCanvases();
    }
  }

  /** Swap page-flip implementation at runtime (id, subclass, or instance). */
  setFlipStyle(style: FlipStyleInput): void {
    this.spreadView.setFlipStyle(style);
  }

  /** Set flip duration in milliseconds. */
  setFlipSpeed(speedMs: number): void {
    this.spreadView.setFlipSpeed(speedMs);
  }

  playReadAloud(): Promise<void> {
    if (this.editing) return Promise.resolve();
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

  /** Enter Fabric edit mode (requires `editor: true` in options). */
  async enterEditor(): Promise<void> {
    if (!this.editorEnabled || this.editing) return;
    this.readAloud.stop();
    this.editing = true;
    this.element.classList.add('fc-editing');
    // Hide book nav so clicks/swipes on the page cannot turn spreads while editing.
    this.chrome.hidden = true;
    await this.mountEditorCanvases();
    this.syncEditorChromeState();
  }

  /** Commit canvases and restore normal PageView rendering. */
  async exitEditor(): Promise<void> {
    if (!this.editing) return;
    const dirty = [...this.pageCanvases.values()].some((c) => c.isDirty);
    if (dirty) {
      this.commitEditorCanvases();
      this.destroyEditorCanvases();
      this.spreadView.setPageViewsHidden(false);
      // Remount so PageViews pick up committed story changes.
      this.spreadView.remountCurrent();
      this.layoutStage();
    } else {
      // No edits: drop overlays and reveal the original PageViews (no remount / no layout rewrite).
      this.destroyEditorCanvases();
      this.spreadView.setPageViewsHidden(false);
    }
    this.editing = false;
    this.element.classList.remove('fc-editing');
    this.chrome.hidden = this.chromeHiddenByOptions;
    this.syncChromeNavState();
    this.syncEditorChromeState();
  }

  /** Commit current edits, pack `.fanci`, and trigger a browser download. */
  async downloadFanci(filename?: string): Promise<void> {
    if (this.editing) {
      this.commitEditorCanvases();
    }
    const name = filename ?? `${this.loaded.story.id || 'story'}.fanci`;
    const blob = await packFanci(this.loaded.story, {
      baseUrl: this.loaded.baseUrl,
      files: { ...this.editorFiles },
    });
    downloadBlob(blob, name.endsWith('.fanci') ? name : `${name}.fanci`);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.destroyEditorCanvases();
    this.editorChrome?.destroy();
    this.editorChrome = null;
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
    if (this.editing) {
      this.commitEditorCanvases();
      this.destroyEditorCanvases();
    }
    await action();
    this.layoutStage();
    if (this.editing) {
      await this.mountEditorCanvases();
    }
  }

  private mountEditorChrome(): void {
    this.editorChrome = new EditorChrome({
      onToggleEdit: () => {
        if (this.editing) void this.exitEditor();
        else void this.enterEditor();
      },
      onAddPage: () => void this.editorAddPage(),
      onRemovePage: () => void this.editorRemovePage(),
      onFrontCoverChange: (enabled) => void this.editorSetFrontCover(enabled),
      onBackCoverChange: (enabled) => void this.editorSetBackCover(enabled),
      onHardbackChange: (enabled) => void this.editorSetHardback(enabled),
      onDownload: () => void this.downloadFanci(),
    });
    this.element.appendChild(this.editorChrome.element);
    this.syncEditorChromeState();
  }

  private syncEditorChromeState(): void {
    this.editorChrome?.setState({
      editing: this.editing,
      frontCover: Boolean(this.loaded.story.frontCover),
      backCover: Boolean(this.loaded.story.backCover),
      hardback: Boolean(this.loaded.story.hardback),
      canRemovePage: this.loaded.story.pages.length > 1,
    });
  }

  private editorHost() {
    return {
      story: this.loaded.story,
      assets: this.loaded.assets,
      editorFiles: this.editorFiles,
      blobUrls: this.loaded.blobUrls,
      getDefaultFontFamily: () => this.editorDefaultFontFamily,
      setDefaultFontFamily: (family: string) => {
        this.editorDefaultFontFamily = family;
      },
      applyFontToAllTextboxes: (family: string) => {
        this.editorDefaultFontFamily = family;
        for (const page of this.loaded.story.pages) {
          for (const block of page.blocks) {
            if (block.type === 'text') {
              block.style = { ...block.style, fontFamily: family };
            }
          }
        }
        for (const canvas of this.pageCanvases.values()) {
          canvas.applyFontToAllText(family);
        }
      },
    };
  }

  private async mountEditorCanvases(): Promise<void> {
    if (!this.editing || this.editorMounting) return;
    this.editorMounting = true;
    try {
      this.destroyEditorCanvases();
      this.spreadView.setPageViewsHidden(true);

      const spread = this.pager.currentSpread;
      const leaves = this.spreadView.getEditableLeaves(this.pager.layoutMode, spread);
      const { width, height } = this.loaded.story.pageSize;
      const host = this.editorHost();

      for (const leaf of leaves) {
        const page = this.loaded.story.pages[leaf.pageIndex];
        if (!page) continue;
        const canvas = await PageCanvas.create(page, { width, height }, host);
        leaf.slot.appendChild(canvas.element);
        canvas.syncLayout();
        this.pageCanvases.set(leaf.side, canvas);
      }
    } finally {
      this.editorMounting = false;
    }
  }

  private commitEditorCanvases(): void {
    for (const canvas of this.pageCanvases.values()) {
      const next = canvas.commit();
      const index = this.loaded.story.pages.findIndex((p) => p.id === next.id);
      if (index >= 0) {
        this.loaded.story.pages[index] = next;
      }
    }
  }

  private destroyEditorCanvases(): void {
    for (const canvas of this.pageCanvases.values()) {
      canvas.destroy();
    }
    this.pageCanvases.clear();
  }

  private async editorAddPage(): Promise<void> {
    if (!this.editing) return;
    this.commitEditorCanvases();
    const page = createBlankPage(this.loaded.story);
    this.loaded.story.pages.push(page);
    this.spreadView.setStory(this.loaded.story);
    this.destroyEditorCanvases();
    this.pager.rebuildFromStory(page.id);
    this.layoutStage();
    await this.mountEditorCanvases();
    this.syncChromeNavState();
    this.syncEditorChromeState();
  }

  private async editorRemovePage(): Promise<void> {
    if (!this.editing || this.loaded.story.pages.length <= 1) return;
    this.commitEditorCanvases();
    const removeId = this.pager.currentPageIds[0] ?? this.loaded.story.pages[0]?.id;
    if (!removeId) return;
    const idx = this.loaded.story.pages.findIndex((p) => p.id === removeId);
    if (idx < 0) return;
    this.loaded.story.pages.splice(idx, 1);
    const prefer =
      this.loaded.story.pages[Math.min(idx, this.loaded.story.pages.length - 1)]?.id ?? null;
    this.spreadView.setStory(this.loaded.story);
    this.destroyEditorCanvases();
    this.pager.rebuildFromStory(prefer);
    this.layoutStage();
    await this.mountEditorCanvases();
    this.syncChromeNavState();
    this.syncEditorChromeState();
  }

  private async editorSetFrontCover(enabled: boolean): Promise<void> {
    if (!this.editing) return;
    this.commitEditorCanvases();
    this.loaded.story.frontCover = enabled;
    this.spreadView.setStory(this.loaded.story);
    this.destroyEditorCanvases();
    this.pager.rebuildFromStory(this.pager.currentPageIds[0] ?? null);
    this.layoutStage();
    await this.mountEditorCanvases();
    this.syncChromeNavState();
    this.syncEditorChromeState();
  }

  private async editorSetBackCover(enabled: boolean): Promise<void> {
    if (!this.editing) return;
    this.commitEditorCanvases();
    this.loaded.story.backCover = enabled;
    this.spreadView.setStory(this.loaded.story);
    this.destroyEditorCanvases();
    this.pager.rebuildFromStory(this.pager.currentPageIds[0] ?? null);
    this.layoutStage();
    await this.mountEditorCanvases();
    this.syncChromeNavState();
    this.syncEditorChromeState();
  }

  private async editorSetHardback(enabled: boolean): Promise<void> {
    if (!this.editing) return;
    this.commitEditorCanvases();
    this.loaded.story.hardback = enabled;
    this.spreadView.setStory(this.loaded.story);
    this.destroyEditorCanvases();
    this.layoutStage();
    await this.mountEditorCanvases();
    this.syncEditorChromeState();
  }

  private wireChrome(): void {
    this.btnPrev.addEventListener('click', () => void this.prev());
    this.btnNext.addEventListener('click', () => void this.next());
    this.btnRead.addEventListener('click', () => void this.playReadAloud());
  }

  private syncChromeNavState(): void {
    const canPrev = this.pager.canPrev;
    const canNext = this.pager.canNext;
    this.btnPrev.disabled = !canPrev;
    this.btnNext.disabled = !canNext;
    this.btnPrev.classList.toggle('is-disabled', !canPrev);
    this.btnNext.classList.toggle('is-disabled', !canNext);
    this.btnPrev.setAttribute('aria-disabled', String(!canPrev));
    this.btnNext.setAttribute('aria-disabled', String(!canNext));
  }

  private wirePager(autoPlay: boolean): void {
    this.pager.on('pagechange', (payload) => {
      this.syncChromeNavState();
      this.emit('pagechange', payload);
      if (autoPlay && !this.editing) void this.playReadAloud();
    });
    this.pager.on('layoutchange', (payload) => {
      // Orientation / mode flips remount spreads; stop VO mid-sentence.
      this.readAloud.stop();
      if (this.editing) {
        this.commitEditorCanvases();
        this.destroyEditorCanvases();
      }
      this.layoutStage();
      this.syncChromeNavState();
      this.emit('layoutchange', payload);
      if (this.editing) {
        void this.mountEditorCanvases();
      }
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
    const height = this.stage.clientHeight || Math.max(320, this.root.clientHeight - 64);
    this.spreadView.updateStageSize(
      width,
      height,
      this.pager.layoutMode,
      this.pager.currentSpread,
    );
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
    if (this.editing) return;
    for (const action of actions) {
      if ('play' in action) {
        const meta = this.loaded.assets.audioUrls.get(action.play);
        if (!meta) continue;
        this.sfxAudio.src = meta.url;
        this.bus.applyTo(this.sfxAudio, meta.channel);
        void this.sfxAudio.play().catch(() => undefined);
      } else if ('toggleClass' in action) {
        const target = pageEl.querySelector(`[data-block-id="${action.toggleClass.target}"]`);
        target?.classList.toggle(action.toggleClass.className);
      }
    }
  }

  private emit<K extends keyof StorybookEvents>(event: K, payload: StorybookEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) (fn as Listener<K>)(payload);
  }
}

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

/** No-op subscribers so SpringRoll validateListeners passes while story assets load. */
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
