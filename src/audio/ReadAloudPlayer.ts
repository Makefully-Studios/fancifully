import type { Cue } from '../schema/story.js';
import { applyCueSpans } from '../sync/applyCueSpans.js';
import { CueTimeline } from '../sync/CueTimeline.js';
import type { AudioBus } from './AudioBus.js';

export type ReadAloudClip = {
  url: string;
  channel: 'vo' | 'sfx' | 'music';
  /** Word/phrase cues for in-page highlight when `root` is set. */
  cues: Cue[];
  /**
   * Line cues for `.fc-captions`. Prefer embedded MP3 SYLT (`captionCues` on
   * audio meta). When omitted, falls back to `cues`.
   */
  captionCues?: Cue[];
  root: ParentNode | null;
  /** Text-block id when this clip belongs to a VO textbox. */
  blockId?: string;
};

export class ReadAloudPlayer {
  private bus: AudioBus;
  private audio: HTMLAudioElement;
  /** Drives in-page `.fc-cue` highlight. */
  private timeline = new CueTimeline();
  /** Drives `.fc-captions` independently of highlight. */
  private captionTimeline = new CueTimeline();
  private queue: ReadAloudClip[] = [];
  private raf = 0;
  private captionsMuted = false;
  private onCaptionLine: ((text: string | null) => void) | null = null;
  private onSequenceComplete: (() => void) | null = null;
  private playing = false;
  private currentBlockId: string | null = null;

  constructor(bus: AudioBus) {
    this.bus = bus;
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.bus.register(this.audio, 'vo');
    this.audio.addEventListener('ended', () => this.playNext());
  }

  setCaptionsMuted(muted: boolean): void {
    this.captionsMuted = muted;
    if (muted) {
      this.onCaptionLine?.(null);
    }
  }

  /** Soft-highlight already-spoken cues (`.is-read`). Default true. */
  setCueReadHighlight(enabled: boolean): void {
    this.timeline.setRetainReadHighlight(enabled);
  }

  onCaption(handler: (text: string | null) => void): void {
    this.onCaptionLine = handler;
  }

  /** Fires when a playSequence queue drains naturally (not after stop()). */
  onComplete(handler: (() => void) | null): void {
    this.onSequenceComplete = handler;
  }

  getPlayingBlockId(): string | null {
    return this.playing ? this.currentBlockId : null;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  async playSequence(clips: ReadAloudClip[]): Promise<void> {
    this.stop();
    this.queue = clips.filter((c) => Boolean(c.url));
    if (this.queue.length === 0) return;
    this.playing = true;
    await this.playNext();
  }

  pause(): void {
    this.audio.pause();
    this.cancelTick();
  }

  resume(): void {
    if (!this.playing || this.bus.isPaused) return;
    void this.audio.play().catch(() => undefined);
    this.startTick();
  }

  stop(): void {
    this.playing = false;
    this.currentBlockId = null;
    this.queue = [];
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.timeline.reset();
    this.captionTimeline.reset();
    this.cancelTick();
    this.onCaptionLine?.(null);
  }

  destroy(): void {
    this.stop();
    this.bus.unregister(this.audio);
  }

  private async playNext(): Promise<void> {
    this.cancelTick();
    const next = this.queue.shift();
    if (!next) {
      const finished = this.playing;
      this.playing = false;
      this.currentBlockId = null;
      this.timeline.reset();
      this.captionTimeline.reset();
      this.onCaptionLine?.(null);
      if (finished) this.onSequenceComplete?.();
      return;
    }

    this.currentBlockId = next.blockId ?? null;
    this.timeline.setCues(next.cues);
    this.captionTimeline.setCues(next.captionCues ?? next.cues);
    if (next.root) {
      applyCueSpans(next.root, next.cues);
    }
    this.timeline.attach(next.root);
    this.captionTimeline.attach(null);
    this.bus.register(this.audio, next.channel);
    this.audio.src = next.url;
    this.bus.applyTo(this.audio, next.channel);

    try {
      await this.audio.play();
      this.startTick();
    } catch {
      // Autoplay may fail until user gesture; leave ready
      this.startTick();
    }
  }

  private startTick(): void {
    this.cancelTick();
    const tick = () => {
      if (!this.playing) return;
      if (!this.bus.isPaused && !this.audio.paused) {
        const time = this.audio.currentTime;
        this.timeline.update(time);
        const caption = this.captionTimeline.update(time);
        if (!this.captionsMuted) {
          this.onCaptionLine?.(caption?.text ?? caption?.id ?? null);
        }
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private cancelTick(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }
}
