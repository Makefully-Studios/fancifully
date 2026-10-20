import type { Cue } from '../schema/story.js';
import { CueTimeline } from '../sync/CueTimeline.js';
import type { AudioBus } from './AudioBus.js';

export type ReadAloudClip = {
  url: string;
  channel: 'vo' | 'sfx' | 'music';
  cues: Cue[];
  root: ParentNode | null;
};

export class ReadAloudPlayer {
  private bus: AudioBus;
  private audio: HTMLAudioElement;
  private timeline = new CueTimeline();
  private queue: ReadAloudClip[] = [];
  private raf = 0;
  private captionsMuted = false;
  private onCaptionLine: ((text: string | null) => void) | null = null;
  private playing = false;

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

  onCaption(handler: (text: string | null) => void): void {
    this.onCaptionLine = handler;
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
    this.queue = [];
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.timeline.reset();
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
      this.playing = false;
      this.timeline.reset();
      this.onCaptionLine?.(null);
      return;
    }

    this.timeline.setCues(next.cues);
    this.timeline.attach(next.root);
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
        const cue = this.timeline.update(this.audio.currentTime);
        if (!this.captionsMuted) {
          this.onCaptionLine?.(cue?.text ?? cue?.id ?? null);
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
