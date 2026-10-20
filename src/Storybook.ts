import { AudioBus } from './audio/AudioBus.js';
import { ReadAloudPlayer, type ReadAloudClip } from './audio/ReadAloudPlayer.js';
import { bindSwipe } from './interaction/Pointer.js';
import { loadStory, revokeLoadedStory, type LoadedStory } from './load/loadStory.js';
import type { StorySource } from './load/packageTypes.js';
import { Pager, type PagerEvents } from './nav/Pager.js';
import { SpreadView } from './render/SpreadView.js';
import type { Cue, LayoutMode, Story, TapAction } from './schema/story.js';
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

  private constructor(
    container: HTMLElement,
    loaded: LoadedStory,
    springroll: SpringrollLike | null,
    autoPlayReadAloud: boolean,
  ) {
    this.root = container;
    this.loaded = loaded;
    this.springroll = springroll;

    this.element = document.createElement('div');
    this.element.className = 'fc-root';
    this.element.tabIndex = 0;

    this.stage = document.createElement('div');
    this.stage.className = 'fc-stage';

    this.captionsEl = document.createElement('div');
    this.captionsEl.className = 'fc-captions';
    this.captionsEl.setAttribute('aria-live', 'polite');

    this.chrome = document.createElement('div');
    this.chrome.className = 'fc-chrome';
    this.chrome.innerHTML = `
      <button type="button" class="fc-btn fc-btn-prev" aria-label="Previous page">Prev</button>
      <button type="button" class="fc-btn fc-btn-read" aria-label="Read aloud">Read</button>
      <button type="button" class="fc-btn fc-btn-next" aria-label="Next page">Next</button>
    `;

    this.spreadView = new SpreadView(loaded.story, loaded.assets, (actions, pageEl) =>
      this.handleTapActions(actions, pageEl),
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
      onSwipeLeft: () => void this.next(),
      onSwipeRight: () => void this.prev(),
    });

    this.element.addEventListener('keydown', (event) => {
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
    );

    book.pager.updateLayout(container.clientWidth || window.innerWidth, false);
    book.layoutStage();
    await book.pager.showInitial();
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

  on<K extends keyof StorybookEvents>(event: K, fn: Listener<K>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn as Listener<keyof StorybookEvents>);
    return () => this.listeners.get(event)?.delete(fn as Listener<keyof StorybookEvents>);
  }

  next(): Promise<void> {
    this.readAloud.stop();
    return this.pager.next().then(() => this.layoutStage());
  }

  prev(): Promise<void> {
    this.readAloud.stop();
    return this.pager.prev().then(() => this.layoutStage());
  }

  goTo(pageId: string): Promise<void> {
    this.readAloud.stop();
    return this.pager.goTo(pageId).then(() => this.layoutStage());
  }

  setLayoutMode(mode: LayoutMode): void {
    this.pager.setLayoutMode(mode, this.root.clientWidth || window.innerWidth);
    this.layoutStage();
    this.emit('layoutchange', { layoutMode: this.pager.layoutMode });
  }

  playReadAloud(): Promise<void> {
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

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
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

  private wireChrome(): void {
    this.chrome.querySelector('.fc-btn-prev')?.addEventListener('click', () => void this.prev());
    this.chrome.querySelector('.fc-btn-next')?.addEventListener('click', () => void this.next());
    this.chrome.querySelector('.fc-btn-read')?.addEventListener('click', () => void this.playReadAloud());
  }

  private wirePager(autoPlay: boolean): void {
    this.pager.on('pagechange', (payload) => {
      this.emit('pagechange', payload);
      if (autoPlay) void this.playReadAloud();
    });
    this.pager.on('layoutchange', (payload) => {
      this.layoutStage();
      this.emit('layoutchange', payload);
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
      this.pager.updateLayout(this.root.clientWidth || window.innerWidth);
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
    const leaves =
      mode === 'two-page'
        ? [spread.left, spread.right]
        : spread.left.kind === 'blank'
          ? [spread.right]
          : spread.right.kind === 'blank'
            ? [spread.left]
            : [spread.left];

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
