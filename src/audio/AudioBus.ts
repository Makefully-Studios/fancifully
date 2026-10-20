import type { AudioChannel } from '../schema/story.js';

export type VolumeState = {
  sound: number;
  vo: number;
  sfx: number;
  music: number;
};

export class AudioBus {
  private volumes: VolumeState = {
    sound: 1,
    vo: 1,
    sfx: 1,
    music: 1,
  };
  private elements = new Set<HTMLAudioElement>();
  private paused = false;

  setVolume(channel: keyof VolumeState, value: number): void {
    this.volumes[channel] = clamp01(value);
    this.applyAll();
  }

  getVolume(channel: AudioChannel): number {
    return clamp01(this.volumes.sound) * clamp01(this.volumes[channel]);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    for (const el of this.elements) {
      if (paused) {
        el.pause();
      }
    }
  }

  get isPaused(): boolean {
    return this.paused;
  }

  register(el: HTMLAudioElement, channel: AudioChannel): void {
    this.elements.add(el);
    el.volume = this.getVolume(channel);
    el.dataset.fcChannel = channel;
  }

  unregister(el: HTMLAudioElement): void {
    this.elements.delete(el);
  }

  applyTo(el: HTMLAudioElement, channel: AudioChannel): void {
    el.volume = this.getVolume(channel);
  }

  private applyAll(): void {
    for (const el of this.elements) {
      const channel = (el.dataset.fcChannel as AudioChannel) || 'vo';
      el.volume = this.getVolume(channel);
    }
  }
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
