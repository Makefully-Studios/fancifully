import type { Cue } from '../schema/story.js';

export class CueTimeline {
  private cues: Cue[];
  private root: ParentNode | null = null;
  private lastActiveId: string | null = null;
  private readIds = new Set<string>();

  constructor(cues: Cue[] = []) {
    this.cues = [...cues].sort((a, b) => a.start - b.start);
  }

  setCues(cues: Cue[]): void {
    this.cues = [...cues].sort((a, b) => a.start - b.start);
    this.reset();
  }

  attach(root: ParentNode | null): void {
    this.root = root;
    this.resetHighlight();
  }

  reset(): void {
    this.lastActiveId = null;
    this.readIds.clear();
    this.resetHighlight();
  }

  update(timeSeconds: number): Cue | null {
    const active = this.cues.find((c) => timeSeconds >= c.start && timeSeconds < c.end) ?? null;

    if (!this.root) {
      return active;
    }

    if (active) {
      this.readIds.add(active.id);
      if (active.id !== this.lastActiveId) {
        this.applyHighlight(active.id);
        this.lastActiveId = active.id;
      }
    } else if (this.lastActiveId) {
      this.clearActive();
      this.lastActiveId = null;
    }

    return active;
  }

  private applyHighlight(id: string): void {
    if (!this.root) return;
    this.root.querySelectorAll('.fc-cue.is-active').forEach((el) => el.classList.remove('is-active'));
    const target = this.root.querySelector(`#${cssEscape(id)}, [data-cue-id="${cssEscapeAttr(id)}"]`);
    if (target) {
      target.classList.add('fc-cue', 'is-active', 'is-read');
    }
    for (const readId of this.readIds) {
      if (readId === id) continue;
      const el = this.root.querySelector(`#${cssEscape(readId)}, [data-cue-id="${cssEscapeAttr(readId)}"]`);
      el?.classList.add('fc-cue', 'is-read');
    }
  }

  private clearActive(): void {
    this.root?.querySelectorAll('.fc-cue.is-active').forEach((el) => el.classList.remove('is-active'));
  }

  private resetHighlight(): void {
    this.root?.querySelectorAll('.fc-cue').forEach((el) => {
      el.classList.remove('is-active', 'is-read');
    });
  }
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function cssEscapeAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
