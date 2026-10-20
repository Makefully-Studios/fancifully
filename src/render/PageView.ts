import type { LoadedAssets } from '../load/loadStory.js';
import type { StoryPage, TapAction } from '../schema/story.js';
import { renderHotspotBlock } from './blocks/HotspotBlock.js';
import { renderImageBlock } from './blocks/ImageBlock.js';
import { renderTextBlock } from './blocks/TextBlock.js';

export type PageViewHandlers = {
  onTapActions: (actions: TapAction[], pageEl: HTMLElement) => void;
};

export class PageView {
  readonly element: HTMLElement;
  readonly page: StoryPage | null;
  readonly blank: boolean;

  constructor(
    page: StoryPage | null,
    assets: LoadedAssets,
    handlers: PageViewHandlers,
  ) {
    this.page = page;
    this.blank = !page;
    this.element = document.createElement('article');
    this.element.className = `fc-page${this.blank ? ' fc-page-blank' : ''}`;
    this.element.setAttribute('role', this.blank ? 'presentation' : 'document');

    if (!page) {
      this.element.dataset.blank = 'true';
      return;
    }

    this.element.dataset.pageId = page.id;

    if (page.background?.color) {
      this.element.style.backgroundColor = page.background.color;
    }
    if (page.background?.asset) {
      const img = assets.images.get(page.background.asset);
      if (img) {
        this.element.style.backgroundImage = `url(${JSON.stringify(img.src)})`;
        this.element.style.backgroundSize = 'cover';
        this.element.style.backgroundPosition = 'center';
      }
    }

    for (const block of page.blocks) {
      if (block.type === 'text') {
        const html =
          block.html ??
          assets.html.get(`htmlSrc:${block.id}`) ??
          (block.htmlSrc ? assets.html.get(block.htmlSrc) : undefined) ??
          '';
        this.element.appendChild(renderTextBlock(block, html));
      } else if (block.type === 'image') {
        this.element.appendChild(renderImageBlock(block, assets.images.get(block.asset)));
      } else if (block.type === 'hotspot') {
        this.element.appendChild(
          renderHotspotBlock(block, (actions) => handlers.onTapActions(actions, this.element)),
        );
      }
    }
  }

  destroy(): void {
    this.element.remove();
  }
}
