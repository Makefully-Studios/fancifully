import type { StoryBlock } from '../../schema/story.js';
import { applyLayout } from '../layout.js';

export type TextBlockTapHandler = (blockId: string) => void;

export function renderTextBlock(
  block: Extract<StoryBlock, { type: 'text' }>,
  htmlContent: string,
  options?: { tapReadAloud?: boolean; onTapReadAloud?: TextBlockTapHandler },
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'fc-block fc-block-text';
  el.dataset.blockId = block.id;
  applyLayout(el, block.layout);
  el.innerHTML = htmlContent;

  // Mark author-supplied cue spans (id and/or data-cue-id).
  el.querySelectorAll('[id], [data-cue-id]').forEach((node) => {
    node.classList.add('fc-cue');
  });

  if (block.style) {
    if (block.style.fontFamily) el.style.fontFamily = block.style.fontFamily;
    if (block.style.fontSize) el.style.fontSize = block.style.fontSize;
    if (block.style.color) el.style.color = block.style.color;
    if (block.style.textAlign) el.style.textAlign = block.style.textAlign;
    if (block.style.lineHeight != null) el.style.lineHeight = String(block.style.lineHeight);
    if (block.style.fontWeight) el.style.fontWeight = block.style.fontWeight;
    if (block.style.fontStyle) el.style.fontStyle = block.style.fontStyle;
  }

  if (options?.tapReadAloud && block.readAloud && options.onTapReadAloud) {
    el.classList.add('fc-block-text--tappable');
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.setAttribute('aria-label', `Read aloud: ${block.id}`);
    const fire = (event: Event) => {
      event.stopPropagation();
      options.onTapReadAloud?.(block.id);
    };
    el.addEventListener('click', fire);
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fire(event);
      }
    });
  }

  return el;
}
