import type { LoadedAssets } from '../load/loadStory.js';
import type { Cue, StoryPage, TapAction } from '../schema/story.js';
import { applyCueSpans } from '../sync/applyCueSpans.js';
import { renderAreaBlock } from './blocks/AreaBlock.js';
import { renderHotspotBlock } from './blocks/HotspotBlock.js';
import { renderImageBlock } from './blocks/ImageBlock.js';
import { renderTextBlock, type TextBlockTapHandler } from './blocks/TextBlock.js';

export type PageViewHandlers = {
  onTapActions: (actions: TapAction[], pageEl: HTMLElement) => void;
  onTextTapReadAloud?: TextBlockTapHandler;
  textTapReadAloud?: boolean;
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

    const textEls = new Map<string, HTMLElement>();

    for (const block of page.blocks) {
      if (block.type === 'text') {
        const html =
          block.html ??
          assets.html.get(`htmlSrc:${block.id}`) ??
          (block.htmlSrc ? assets.html.get(block.htmlSrc) : undefined) ??
          '';
        const tapEnabled = Boolean(handlers.textTapReadAloud && block.readAloud);
        const el = renderTextBlock(block, html, {
          tapReadAloud: tapEnabled,
          onTapReadAloud: handlers.onTextTapReadAloud,
        });
        textEls.set(block.id, el);
        this.element.appendChild(el);
      } else if (block.type === 'image') {
        this.element.appendChild(renderImageBlock(block, assets.images.get(block.asset)));
      } else if (block.type === 'hotspot') {
        this.element.appendChild(
          renderHotspotBlock(block, (actions) => handlers.onTapActions(actions, this.element)),
        );
      } else if (block.type === 'area') {
        this.element.appendChild(renderAreaBlock(block));
      }
    }

    // Prefer per-textbox cue wraps; fall back to page-level cues on the page root.
    let anyBlockCues = false;
    for (const block of page.blocks) {
      if (block.type !== 'text' || !block.readAloud) continue;
      const cues = resolveCues(block.readAloud.cues, assets);
      if (cues.length === 0) continue;
      anyBlockCues = true;
      const el = textEls.get(block.id);
      if (el) applyCueSpans(el, cues);
    }
    if (!anyBlockCues) {
      const pageCues = resolveCues(page.readAloud?.cues, assets);
      if (pageCues.length > 0) {
        applyCueSpans(this.element, pageCues);
      }
    }
  }

  destroy(): void {
    this.element.remove();
  }
}

function resolveCues(
  cues: string | Cue[] | undefined,
  assets: LoadedAssets,
): Cue[] {
  if (!cues) return [];
  if (Array.isArray(cues)) return cues;
  return assets.cues.get(cues) ?? [];
}
