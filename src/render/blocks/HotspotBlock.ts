import type { StoryBlock, TapAction } from '../../schema/story.js';
import { applyLayout } from '../layout.js';

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

  el.addEventListener('click', (event) => {
    event.stopPropagation();
    onActions(block.onTap ?? []);
  });

  return el;
}
