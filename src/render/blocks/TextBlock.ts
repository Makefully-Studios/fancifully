import type { StoryBlock } from '../../schema/story.js';
import { applyLayout } from '../layout.js';

export function renderTextBlock(
  block: Extract<StoryBlock, { type: 'text' }>,
  htmlContent: string,
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'fc-block fc-block-text';
  el.dataset.blockId = block.id;
  applyLayout(el, block.layout);
  el.innerHTML = htmlContent;

  // Mark cue spans
  el.querySelectorAll('[id]').forEach((node) => {
    node.classList.add('fc-cue');
  });

  if (block.style) {
    if (block.style.fontFamily) el.style.fontFamily = block.style.fontFamily;
    if (block.style.fontSize) el.style.fontSize = block.style.fontSize;
    if (block.style.color) el.style.color = block.style.color;
    if (block.style.textAlign) el.style.textAlign = block.style.textAlign;
    if (block.style.lineHeight != null) el.style.lineHeight = String(block.style.lineHeight);
  }

  return el;
}
