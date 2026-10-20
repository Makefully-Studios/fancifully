import type { StoryBlock } from '../../schema/story.js';
import { applyLayout } from '../layout.js';

export function renderImageBlock(
  block: Extract<StoryBlock, { type: 'image' }>,
  image: HTMLImageElement | undefined,
): HTMLElement {
  const el = document.createElement('div');
  el.className = `fc-block fc-block-image${block.className ? ` ${block.className}` : ''}`;
  el.dataset.blockId = block.id;
  applyLayout(el, block.layout);

  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  if (image) {
    img.src = image.src;
  }
  const fit = block.layout?.fit ?? 'contain';
  img.style.objectFit = fit;
  el.appendChild(img);
  return el;
}
