import type { StoryBlock } from '../../schema/story.js';
import { applyLayout } from '../layout.js';

export function renderAreaBlock(
  block: Extract<StoryBlock, { type: 'area' }>,
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'fc-block fc-block-area';
  el.dataset.blockId = block.id;
  el.dataset.game = block.game;
  if (block.requireComplete) el.dataset.requireComplete = 'true';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', block.ariaLabel ?? block.game);
  applyLayout(el, block.layout);
  return el;
}
