import type { LoadedAssets } from '../load/loadStory.js';
import type { Spread, SpreadLeaf } from '../nav/layoutMode.js';
import type { ResolvedLayoutMode, Story, TapAction } from '../schema/story.js';
import { PageView } from './PageView.js';

export class SpreadView {
  readonly element: HTMLElement;
  readonly bookEl: HTMLElement;
  private leftSlot: HTMLElement;
  private rightSlot: HTMLElement;
  private leftPage: PageView | null = null;
  private rightPage: PageView | null = null;
  private story: Story;
  private assets: LoadedAssets;
  private onTapActions: (actions: TapAction[], pageEl: HTMLElement) => void;
  private turning = false;

  constructor(
    story: Story,
    assets: LoadedAssets,
    onTapActions: (actions: TapAction[], pageEl: HTMLElement) => void,
  ) {
    this.story = story;
    this.assets = assets;
    this.onTapActions = onTapActions;

    this.element = document.createElement('div');
    this.element.className = 'fc-spread-viewport';

    this.bookEl = document.createElement('div');
    this.bookEl.className = 'fc-spread';

    this.leftSlot = document.createElement('div');
    this.leftSlot.className = 'fc-leaf fc-leaf-left';
    this.rightSlot = document.createElement('div');
    this.rightSlot.className = 'fc-leaf fc-leaf-right';

    this.bookEl.append(this.leftSlot, this.rightSlot);
    this.element.appendChild(this.bookEl);
  }

  setLayoutMode(mode: ResolvedLayoutMode): void {
    this.element.dataset.layoutMode = mode;
    this.element.classList.toggle('fc-spread-viewport-single', mode === 'single');
    this.element.classList.toggle('fc-spread-viewport-two', mode === 'two-page');
  }

  showSpread(spread: Spread, animate: 'none' | 'next' | 'prev' = 'none'): Promise<void> {
    if (animate === 'none' || this.turning) {
      this.mountSpread(spread);
      return Promise.resolve();
    }

    this.turning = true;
    this.bookEl.classList.remove('fc-turn-next', 'fc-turn-prev');
    // force reflow
    void this.bookEl.offsetWidth;
    this.bookEl.classList.add(animate === 'next' ? 'fc-turn-next' : 'fc-turn-prev');

    return new Promise((resolve) => {
      const done = () => {
        this.bookEl.removeEventListener('animationend', done);
        this.bookEl.classList.remove('fc-turn-next', 'fc-turn-prev');
        this.mountSpread(spread);
        this.turning = false;
        resolve();
      };
      this.bookEl.addEventListener('animationend', done);
      // fallback
      window.setTimeout(done, 450);
    });
  }

  getPageElement(pageId: string): HTMLElement | null {
    if (this.leftPage?.page?.id === pageId) return this.leftPage.element;
    if (this.rightPage?.page?.id === pageId) return this.rightPage.element;
    return null;
  }

  getVisiblePageElements(mode: ResolvedLayoutMode, spread: Spread): HTMLElement[] {
    const els: HTMLElement[] = [];
    if (mode === 'two-page') {
      if (spread.left.kind === 'page' && this.leftPage) els.push(this.leftPage.element);
      if (spread.right.kind === 'page' && this.rightPage) els.push(this.rightPage.element);
    } else {
      // single: content is the non-blank leaf (prefer right on cover, else whichever has content)
      if (spread.left.kind === 'blank' && spread.right.kind === 'page' && this.rightPage) {
        els.push(this.rightPage.element);
      } else if (spread.right.kind === 'blank' && spread.left.kind === 'page' && this.leftPage) {
        els.push(this.leftPage.element);
      } else {
        if (spread.left.kind === 'page' && this.leftPage) els.push(this.leftPage.element);
        else if (spread.right.kind === 'page' && this.rightPage) els.push(this.rightPage.element);
      }
    }
    return els;
  }

  updateStageSize(
    containerWidth: number,
    containerHeight: number,
    mode: ResolvedLayoutMode,
    spread?: { left: { kind: string }; right: { kind: string } },
  ): void {
    const { width: pageW, height: pageH } = this.story.pageSize;
    const spreadW = pageW * 2;
    const spreadH = pageH;

    let scale: number;
    if (mode === 'single') {
      scale = Math.min(containerWidth / pageW, containerHeight / pageH);
    } else {
      scale = Math.min(containerWidth / spreadW, containerHeight / spreadH);
    }

    this.bookEl.style.width = `${spreadW}px`;
    this.bookEl.style.height = `${spreadH}px`;
    this.bookEl.style.setProperty('--fc-page-width', `${pageW}px`);
    this.bookEl.style.setProperty('--fc-page-height', `${pageH}px`);

    // In single mode the viewport is one page wide; shift so the content leaf is visible
    // and the blank leading leaf stays offscreen (still present for flip geometry).
    let offsetX = 0;
    if (mode === 'single' && spread) {
      if (spread.left.kind === 'blank') {
        offsetX = -pageW * scale;
      }
      // orphan on left with blank right: offset 0 (left leaf visible)
    }

    this.bookEl.style.transform = `translateX(${offsetX}px) scale(${scale})`;
    this.bookEl.style.transformOrigin = 'left top';

    this.element.style.width = mode === 'single' ? `${pageW * scale}px` : `${spreadW * scale}px`;
    this.element.style.height = `${spreadH * scale}px`;
  }

  destroy(): void {
    this.leftPage?.destroy();
    this.rightPage?.destroy();
    this.element.remove();
  }

  private mountSpread(spread: Spread): void {
    this.leftPage?.destroy();
    this.rightPage?.destroy();
    this.leftSlot.replaceChildren();
    this.rightSlot.replaceChildren();

    this.leftPage = this.createLeaf(spread.left);
    this.rightPage = this.createLeaf(spread.right);
    this.leftSlot.appendChild(this.leftPage.element);
    this.rightSlot.appendChild(this.rightPage.element);
  }

  private createLeaf(leaf: SpreadLeaf): PageView {
    if (leaf.kind === 'blank') {
      return new PageView(null, this.assets, { onTapActions: this.onTapActions });
    }
    const page = this.story.pages[leaf.pageIndex];
    return new PageView(page, this.assets, { onTapActions: this.onTapActions });
  }
}
