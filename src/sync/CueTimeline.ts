import type { Cue } from '../schema/story.js';

export class CueTimeline {
  private cues: Cue[];
  private root: ParentNode | null = null;
  private lastActiveId: string | null = null;
  private readIds = new Set<string>();
  /** Soft-highlight already-spoken cues with `.is-read` (default true). */
  private retainReadHighlight = true;

  constructor(cues: Cue[] = []) {
    this.cues = [...cues].sort((a, b) => a.start - b.start);
  }

  setRetainReadHighlight(retain: boolean): void {
    this.retainReadHighlight = retain;
    if (!retain) {
      this.root?.querySelectorAll('.fc-cue.is-read').forEach((el) => el.classList.remove('is-read'));
      this.readIds.clear();
    }
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
      if (this.retainReadHighlight) this.readIds.add(active.id);
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
    const target = findCueTarget(this.root, id);
    if (target) {
      target.classList.add('fc-cue', 'is-active');
      if (this.retainReadHighlight) target.classList.add('is-read');
    }
    if (!this.retainReadHighlight) return;
    for (const readId of this.readIds) {
      if (readId === id) continue;
      findCueTarget(this.root, readId)?.classList.add('fc-cue', 'is-read');
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

function findCueTarget(root: ParentNode, id: string): Element | null {
  const el = root as Element;
  if (typeof el.querySelector !== 'function') return null;
  const attr = cssEscapeAttr(id);
  const byAttr = el.querySelector(`[data-cue-id="${attr}"]`);
  if (byAttr) return byAttr;
  if (!/^[A-Za-z_][\w-]*$/.test(id)) return null;
  return el.querySelector(`#${cssEscape(id)}`);
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
