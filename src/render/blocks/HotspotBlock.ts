import type { StoryBlock, TapAction } from '../../schema/story.js';
import { applyLayout } from '../layout.js';

/** Advance tap count; `fireComplete` is true only on the first crossing of `required`. */
export function advanceHotspotTaps(
  taps: number,
  completed: boolean,
  required: number | undefined,
): { taps: number; completed: boolean; fireComplete: boolean } {
  const nextTaps = taps + 1;
  if (required != null && !completed && nextTaps >= required) {
    return { taps: nextTaps, completed: true, fireComplete: true };
  }
  return { taps: nextTaps, completed, fireComplete: false };
}

export function renderHotspotBlock(
  block: Extract<StoryBlock, { type: 'hotspot' }>,
  onActions: (actions: TapAction[]) => void,
): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'fc-block fc-block-hotspot';
  el.dataset.blockId = block.id;
  el.setAttribute('aria-label', block.ariaLabel ?? block.id);
  applyLayout(el, block.layout);

  let taps = 0;
  let completed = false;

  el.addEventListener('click', (event) => {
    event.stopPropagation();
    onActions(block.onTap ?? []);
    const next = advanceHotspotTaps(taps, completed, block.requiredTaps);
    taps = next.taps;
    completed = next.completed;
    if (next.fireComplete) {
      onActions(block.onComplete ?? []);
    }
  });

  return el;
}
