import {
  createFlipStyle,
  resolveFlipSpeedMs,
  type FlipStyle,
  type FlipStyleInput,
} from '../flip/index.js';
import type { LoadedAssets } from '../load/loadStory.js';
import { hardbackEnabled, hardbackOverhang } from '../nav/hardback.js';
import type { BookState, ResolvedLayoutMode, Spread, SpreadLeaf } from '../nav/layoutMode.js';
import type { Story, TapAction } from '../schema/story.js';
import { PageView } from './PageView.js';

export type SpreadViewFlipOptions = {
  flipStyle?: FlipStyleInput;
  flipSpeed?: number;
};

/** Editor stage zoom. Independent of single vs two-page layout. */
export type StageZoom =
  | { mode: 'fit-spread' }
  | { mode: 'fit-page' }
  | { mode: 'percent'; percent: number };

export class SpreadView {
  readonly element: HTMLElement;
  readonly bookEl: HTMLElement;
  private hardbackEl: HTMLElement;
  private hardbackLeft: HTMLElement;
  private hardbackRight: HTMLElement;
  private hardbackLeftPage: PageView | null = null;
  private hardbackRightPage: PageView | null = null;
  private leftSlot: HTMLElement;
  private rightSlot: HTMLElement;
  private leftPage: PageView | null = null;
  private rightPage: PageView | null = null;
  private story: Story;
  private assets: LoadedAssets;
  private onTapActions: (actions: TapAction[], pageEl: HTMLElement) => void;
  private turning = false;
  private bookState: BookState = 'open';
  private layoutMode: ResolvedLayoutMode = 'two-page';
  private lastSize = { width: 0, height: 0 };
  private stageZoom: StageZoom = { mode: 'fit-spread' };
  private currentSpread: Spread | null = null;
  private flipStyle: FlipStyle;
  private flipSpeedMs: number;

  constructor(
    story: Story,
    assets: LoadedAssets,
    onTapActions: (actions: TapAction[], pageEl: HTMLElement) => void,
    flipOptions: SpreadViewFlipOptions = {},
  ) {
    this.story = story;
    this.assets = assets;
    this.onTapActions = onTapActions;
    this.flipStyle = createFlipStyle(flipOptions.flipStyle);
    this.flipSpeedMs = resolveFlipSpeedMs(flipOptions.flipSpeed);

    this.element = document.createElement('div');
    this.element.className = 'fc-spread-viewport';

    this.hardbackEl = document.createElement('div');
    this.hardbackEl.className = 'fc-hardback';
    this.hardbackEl.setAttribute('aria-hidden', 'true');

    this.hardbackLeft = document.createElement('div');
    this.hardbackLeft.className = 'fc-hardback-board fc-hardback-board-left';
    this.hardbackRight = document.createElement('div');
    this.hardbackRight.className = 'fc-hardback-board fc-hardback-board-right';
    this.hardbackEl.append(this.hardbackLeft, this.hardbackRight);

    this.bookEl = document.createElement('div');
    this.bookEl.className = 'fc-spread';

    this.leftSlot = document.createElement('div');
    this.leftSlot.className = 'fc-leaf fc-leaf-left';
    this.rightSlot = document.createElement('div');
    this.rightSlot.className = 'fc-leaf fc-leaf-right';

    this.bookEl.append(this.leftSlot, this.rightSlot);
    this.element.append(this.hardbackEl, this.bookEl);
  }

  get currentBookState(): BookState {
    return this.bookState;
  }

  setFlipStyle(style: FlipStyleInput): void {
    this.flipStyle = createFlipStyle(style);
  }

  setFlipSpeed(speedMs: number): void {
    this.flipSpeedMs = resolveFlipSpeedMs(speedMs);
  }

  setStageZoom(zoom: StageZoom): void {
    this.stageZoom = zoom;
    if (this.lastSize.width > 0 && this.lastSize.height > 0) {
      this.applyStageTransform(
        this.lastSize.width,
        this.lastSize.height,
        this.currentSpread ?? undefined,
      );
    }
  }

  setLayoutMode(mode: ResolvedLayoutMode): void {
    this.layoutMode = mode;
    this.element.dataset.layoutMode = mode;
    this.element.classList.toggle('fc-spread-viewport-single', mode === 'single');
    this.element.classList.toggle('fc-spread-viewport-two', mode === 'two-page');
  }

  /** Update closed/open presentation geometry (use page flips to change content). */
  setBookState(state: BookState): void {
    this.bookState = state;
    this.element.dataset.bookState = state;
    this.syncHardbackBoards();
    this.applyStageTransform(
      this.lastSize.width,
      this.lastSize.height,
      this.currentSpread ?? undefined,
    );
  }

  showSpread(spread: Spread, animate: 'none' | 'next' | 'prev' = 'none'): Promise<void> {
    if (animate === 'none' || this.turning) {
      this.flipStyle.cancel?.({
        bookEl: this.bookEl,
        viewportEl: this.element,
        leftLeaf: this.leftSlot,
        rightLeaf: this.rightSlot,
      });
      this.turning = false;
      this.mountSpread(spread);
      return Promise.resolve();
    }

    this.turning = true;

    return this.flipStyle
      .play({
        bookEl: this.bookEl,
        viewportEl: this.element,
        leftLeaf: this.leftSlot,
        rightLeaf: this.rightSlot,
        direction: animate,
        durationMs: this.flipSpeedMs,
      })
      .then(() => {
        this.mountSpread(spread);
        this.turning = false;
      })
      .catch(() => {
        this.mountSpread(spread);
        this.turning = false;
      });
  }

  getPageElement(pageId: string): HTMLElement | null {
    if (this.leftPage?.page?.id === pageId) return this.leftPage.element;
    if (this.rightPage?.page?.id === pageId) return this.rightPage.element;
    return null;
  }

  /** Leaf slot elements (left / right) for editor overlays. */
  getLeafSlots(): { left: HTMLElement; right: HTMLElement } {
    return { left: this.leftSlot, right: this.rightSlot };
  }

  /**
   * Visible content leaves for the current spread (skips blank / dimmed cover mate).
   * Used by the editor to mount Fabric canvases.
   */
  getEditableLeaves(
    mode: ResolvedLayoutMode,
    spread: Spread,
  ): Array<{ side: 'left' | 'right'; pageIndex: number; slot: HTMLElement }> {
    const out: Array<{ side: 'left' | 'right'; pageIndex: number; slot: HTMLElement }> = [];
    const push = (side: 'left' | 'right', leaf: SpreadLeaf, slot: HTMLElement) => {
      if (leaf.kind !== 'page') return;
      out.push({ side, pageIndex: leaf.pageIndex, slot });
    };

    if (this.bookState === 'closed-front' || this.bookState === 'closed-back') {
      push('right', spread.right, this.rightSlot);
      return out;
    }

    if (mode === 'two-page') {
      push('left', spread.left, this.leftSlot);
      push('right', spread.right, this.rightSlot);
      return out;
    }

    // single: only the non-blank leaf
    if (spread.left.kind === 'blank' && spread.right.kind === 'page') {
      push('right', spread.right, this.rightSlot);
    } else if (spread.right.kind === 'blank' && spread.left.kind === 'page') {
      push('left', spread.left, this.leftSlot);
    } else if (spread.left.kind === 'page') {
      push('left', spread.left, this.leftSlot);
    } else if (spread.right.kind === 'page') {
      push('right', spread.right, this.rightSlot);
    }
    return out;
  }

  /** Hide or show PageView DOM inside leaf slots (editor overlays sit on top). */
  setPageViewsHidden(hidden: boolean): void {
    if (this.leftPage) this.leftPage.element.hidden = hidden;
    if (this.rightPage) this.rightPage.element.hidden = hidden;
  }

  /** Remount the current spread from story data (after in-place story mutations). */
  remountCurrent(): void {
    if (this.currentSpread) {
      this.mountSpread(this.currentSpread);
    }
  }

  /** Keep SpreadView's story reference in sync when the host mutates covers/pages. */
  setStory(story: Story): void {
    this.story = story;
    this.syncHardbackBoards();
    this.applyStageTransform(
      this.lastSize.width,
      this.lastSize.height,
      this.currentSpread ?? undefined,
    );
  }

  /** Replace story + assets after opening a new package. */
  setLoaded(story: Story, assets: LoadedAssets): void {
    this.story = story;
    this.assets = assets;
    this.syncHardbackBoards();
    this.applyStageTransform(
      this.lastSize.width,
      this.lastSize.height,
      this.currentSpread ?? undefined,
    );
  }

  getVisiblePageElements(mode: ResolvedLayoutMode, spread: Spread): HTMLElement[] {
    if (this.bookState === 'closed-front' || this.bookState === 'closed-back') {
      return this.rightPage && spread.right.kind === 'page' ? [this.rightPage.element] : [];
    }

    const els: HTMLElement[] = [];
    if (mode === 'two-page') {
      if (spread.left.kind === 'page' && this.leftPage) els.push(this.leftPage.element);
      if (spread.right.kind === 'page' && this.rightPage) els.push(this.rightPage.element);
    } else if (spread.left.kind === 'blank' && spread.right.kind === 'page' && this.rightPage) {
      els.push(this.rightPage.element);
    } else if (spread.right.kind === 'blank' && spread.left.kind === 'page' && this.leftPage) {
      els.push(this.leftPage.element);
    } else if (spread.left.kind === 'page' && this.leftPage) {
      els.push(this.leftPage.element);
    } else if (spread.right.kind === 'page' && this.rightPage) {
      els.push(this.rightPage.element);
    }
    return els;
  }

  updateStageSize(
    containerWidth: number,
    containerHeight: number,
    mode: ResolvedLayoutMode,
    spread?: { left: { kind: string }; right: { kind: string } },
  ): void {
    this.layoutMode = mode;
    this.lastSize = { width: containerWidth, height: containerHeight };
    this.applyStageTransform(containerWidth, containerHeight, spread);
  }

  destroy(): void {
    this.flipStyle.cancel?.({
      bookEl: this.bookEl,
      viewportEl: this.element,
      leftLeaf: this.leftSlot,
      rightLeaf: this.rightSlot,
    });
    this.clearHardbackBoards();
    this.leftPage?.destroy();
    this.rightPage?.destroy();
    this.element.remove();
  }

  private applyStageTransform(
    containerWidth: number,
    containerHeight: number,
    spread?: { left: { kind: string }; right: { kind: string } },
  ): void {
    if (containerWidth <= 0 || containerHeight <= 0) return;

    const { width: pageW, height: pageH } = this.story.pageSize;
    const mode = this.layoutMode;
    const state = this.bookState;
    const useHardback = hardbackEnabled(this.story);
    const oh = useHardback
      ? hardbackOverhang(this.story.pageSize, this.story.coverSize)
      : { x: 0, y: 0 };

    const closed =
      mode === 'two-page' && (state === 'closed-front' || state === 'closed-back');
    const openHardback = useHardback && state === 'open';
    const soloCover = this.isSoloCover();

    this.element.classList.toggle('fc-hardback-active', useHardback);
    this.element.classList.toggle('fc-hardback-open', openHardback);
    this.element.classList.toggle('fc-hardback-closed', useHardback && closed);

    let scale: number;
    let caseW: number;
    let caseH: number;
    let offsetX = 0;
    let spreadLeft = 0;
    let spreadTop = 0;

    if (useHardback && closed) {
      // Closed cover board is larger than pageSize; cover leaf fills the board.
      caseW = pageW + 2 * oh.x;
      caseH = pageH + 2 * oh.y;
      scale = this.sizedScale(
        Math.min(containerWidth / caseW, containerHeight / caseH),
        pageW,
        pageH,
        containerWidth,
        containerHeight,
      );
      this.bookEl.style.setProperty('--fc-page-width', `${caseW}px`);
      this.bookEl.style.setProperty('--fc-page-height', `${caseH}px`);
      this.bookEl.style.width = `${soloCover ? caseW : caseW * 2}px`;
      this.bookEl.style.height = `${caseH}px`;
      offsetX = soloCover ? 0 : -caseW * scale;
      spreadLeft = 0;
      spreadTop = 0;
      this.hardbackEl.hidden = true;
    } else if (openHardback) {
      const contentW = mode === 'single' ? pageW : pageW * 2;
      caseW = contentW + 2 * oh.x;
      caseH = pageH + 2 * oh.y;
      scale = this.sizedScale(
        Math.min(containerWidth / caseW, containerHeight / caseH),
        pageW,
        pageH,
        containerWidth,
        containerHeight,
      );

      this.bookEl.style.setProperty('--fc-page-width', `${pageW}px`);
      this.bookEl.style.setProperty('--fc-page-height', `${pageH}px`);
      this.bookEl.style.width = `${pageW * 2}px`;
      this.bookEl.style.height = `${pageH}px`;

      this.hardbackEl.hidden = false;
      this.hardbackEl.style.width = `${caseW}px`;
      this.hardbackEl.style.height = `${caseH}px`;
      const visibleSide =
        mode === 'single' ? (spread?.left.kind === 'blank' ? 'right' : 'left') : 'both';
      this.sizeHardbackBoards(visibleSide, pageW, pageH, oh.x, oh.y);

      spreadLeft = oh.x;
      spreadTop = oh.y;

      if (mode === 'single' && spread?.left.kind === 'blank') {
        offsetX = -pageW * scale;
      } else {
        offsetX = 0;
      }
    } else {
      caseW = pageW * 2;
      caseH = pageH;
      if (mode === 'single' || closed) {
        scale = this.sizedScale(
          Math.min(containerWidth / pageW, containerHeight / pageH),
          pageW,
          pageH,
          containerWidth,
          containerHeight,
        );
      } else {
        scale = this.sizedScale(
          Math.min(containerWidth / caseW, containerHeight / caseH),
          pageW,
          pageH,
          containerWidth,
          containerHeight,
        );
      }
      this.bookEl.style.setProperty('--fc-page-width', `${pageW}px`);
      this.bookEl.style.setProperty('--fc-page-height', `${pageH}px`);
      this.bookEl.style.width = `${soloCover ? pageW : caseW}px`;
      this.bookEl.style.height = `${caseH}px`;
      this.hardbackEl.hidden = true;

      if (soloCover) {
        offsetX = 0;
      } else if (closed) {
        offsetX = -pageW * scale;
      } else if (mode === 'single' && spread) {
        if (spread.left.kind === 'blank') {
          offsetX = -pageW * scale;
        }
      }
    }

    this.element.style.setProperty('--fc-hardback-overhang-x', `${oh.x}px`);
    this.element.style.setProperty('--fc-hardback-overhang-y', `${oh.y}px`);

    this.hardbackEl.style.transform = `scale(${scale})`;
    this.hardbackEl.style.transformOrigin = 'left top';

    this.bookEl.style.transform = `translateX(${offsetX}px) scale(${scale})`;
    this.bookEl.style.transformOrigin = 'left top';

    let viewW =
      useHardback && closed
        ? (pageW + 2 * oh.x) * scale
        : openHardback
          ? (mode === 'single' ? pageW + 2 * oh.x : pageW * 2 + 2 * oh.x) * scale
          : mode === 'single' || closed
            ? pageW * scale
            : pageW * 2 * scale;
    let viewH =
      useHardback && (closed || openHardback)
        ? (pageH + 2 * oh.y) * scale
        : pageH * scale;

    // Fit page sizes to the page. A larger cover would make that box taller than
    // the stage, which scrolls and pins the page under the top margin. Crop the
    // overflow equally so the page stays centered and the stage does not scroll.
    let shiftX = 0;
    let shiftY = 0;
    if (this.stageZoom.mode === 'fit-page') {
      if (viewH > containerHeight) {
        shiftY = (viewH - containerHeight) / 2;
        viewH = containerHeight;
      }
      const pagesW = (mode === 'single' || closed || soloCover ? pageW : pageW * 2) * scale;
      if (pagesW <= containerWidth && viewW > containerWidth) {
        shiftX = (viewW - containerWidth) / 2;
        viewW = containerWidth;
      }
    }

    const bookLeft = (openHardback ? spreadLeft * scale : 0) - shiftX;
    const bookTop = (openHardback ? spreadTop * scale : 0) - shiftY;
    this.hardbackEl.style.left = `${-shiftX}px`;
    this.hardbackEl.style.top = `${-shiftY}px`;
    this.bookEl.style.left = `${bookLeft}px`;
    this.bookEl.style.top = `${bookTop}px`;

    this.element.style.width = `${viewW}px`;
    this.element.style.height = `${viewH}px`;

    this.leftSlot.classList.toggle('fc-leaf-dimmed', closed && !soloCover);
    this.rightSlot.classList.remove('fc-leaf-dimmed');
    this.applySoloCover(soloCover);
  }

  /** Fit-spread keeps the fitted scale. Fit-page fits one page. Percent is CSS pixels. */
  private sizedScale(
    fitScale: number,
    pageW: number,
    pageH: number,
    containerWidth: number,
    containerHeight: number,
  ): number {
    if (this.stageZoom.mode === 'percent') {
      return Math.max(0.1, this.stageZoom.percent / 100);
    }
    if (this.stageZoom.mode === 'fit-page') {
      return Math.min(containerWidth / pageW, containerHeight / pageH);
    }
    return fitScale;
  }

  /** A front or back cover shown by itself, not as one half of an open spread. */
  private isSoloCover(): boolean {
    if (this.bookState === 'closed-front' || this.bookState === 'closed-back') return true;
    const spread = this.currentSpread;
    if (!spread) return false;
    const leftPage = spread.left.kind === 'page';
    const rightPage = spread.right.kind === 'page';
    if (leftPage === rightPage) return false;
    const pageId = leftPage && spread.left.kind === 'page'
      ? spread.left.pageId
      : spread.right.kind === 'page'
        ? spread.right.pageId
        : null;
    if (!pageId) return false;
    const pages = this.story.pages;
    const isFront = Boolean(this.story.frontCover) && pages[0]?.id === pageId;
    const isBack = Boolean(this.story.backCover) && pages[pages.length - 1]?.id === pageId;
    return isFront || isBack;
  }

  private applySoloCover(active: boolean): void {
    this.bookEl.classList.toggle('is-solo-cover', active);
    if (!active || !this.currentSpread) {
      this.leftSlot.classList.remove('is-cover-hidden');
      this.rightSlot.classList.remove('is-cover-hidden');
      return;
    }
    const coverOnLeft = this.currentSpread.left.kind === 'page';
    this.leftSlot.classList.toggle('is-cover-hidden', !coverOnLeft);
    this.rightSlot.classList.toggle('is-cover-hidden', coverOnLeft);
  }

  private sizeHardbackBoards(
    visibleSide: 'left' | 'right' | 'both',
    pageW: number,
    pageH: number,
    ohX: number,
    ohY: number,
  ): void {
    const boardH = pageH + 2 * ohY;
    if (visibleSide !== 'both') {
      // One board behind the visible leaf, full hardback footprint.
      // Left board is the front cover's inside; right board is the back cover's.
      const showLeft = visibleSide === 'left';
      this.hardbackLeft.style.display = showLeft ? '' : 'none';
      this.hardbackRight.style.display = showLeft ? 'none' : '';
      const board = showLeft ? this.hardbackLeft : this.hardbackRight;
      board.style.width = `${pageW + 2 * ohX}px`;
      board.style.height = `${boardH}px`;
      return;
    }
    this.hardbackLeft.style.display = '';
    this.hardbackRight.style.display = '';
    this.hardbackLeft.style.width = `${pageW + ohX}px`;
    this.hardbackLeft.style.height = `${boardH}px`;
    this.hardbackRight.style.width = `${pageW + ohX}px`;
    this.hardbackRight.style.height = `${boardH}px`;
  }

  private syncHardbackBoards(): void {
    if (!hardbackEnabled(this.story) || this.bookState !== 'open') {
      this.clearHardbackBoards();
      return;
    }

    const pages = this.story.pages;
    const front = this.story.frontCover ? pages[0] : null;
    const back = this.story.backCover ? pages[pages.length - 1] : null;
    const leftPage = front ?? back;
    const rightPage = back ?? front;

    this.mountHardbackBoard('left', leftPage);
    this.mountHardbackBoard('right', rightPage);
  }

  private mountHardbackBoard(side: 'left' | 'right', page: Story['pages'][number] | null | undefined): void {
    const slot = side === 'left' ? this.hardbackLeft : this.hardbackRight;
    const prev = side === 'left' ? this.hardbackLeftPage : this.hardbackRightPage;
    prev?.destroy();

    if (!page) {
      slot.replaceChildren();
      slot.style.background = '';
      if (side === 'left') this.hardbackLeftPage = null;
      else this.hardbackRightPage = null;
      return;
    }

    const innerColor = page.background?.innerColor;
    if (innerColor) {
      slot.style.background = innerColor;
      slot.replaceChildren();
      if (side === 'left') this.hardbackLeftPage = null;
      else this.hardbackRightPage = null;
      return;
    }
    slot.style.background = '';

    const view = new PageView(page, this.assets, { onTapActions: () => {} });
    view.element.classList.add('fc-hardback-page');
    slot.replaceChildren(view.element);
    if (side === 'left') this.hardbackLeftPage = view;
    else this.hardbackRightPage = view;
  }

  private clearHardbackBoards(): void {
    this.hardbackLeftPage?.destroy();
    this.hardbackRightPage?.destroy();
    this.hardbackLeftPage = null;
    this.hardbackRightPage = null;
    this.hardbackLeft.replaceChildren();
    this.hardbackRight.replaceChildren();
    this.hardbackLeft.style.background = '';
    this.hardbackRight.style.background = '';
  }

  private mountSpread(spread: Spread): void {
    this.currentSpread = spread;
    this.leftPage?.destroy();
    this.rightPage?.destroy();
    this.leftSlot.replaceChildren();
    this.rightSlot.replaceChildren();

    this.leftPage = this.createLeaf(spread.left);
    this.rightPage = this.createLeaf(spread.right);
    this.leftSlot.appendChild(this.leftPage.element);
    this.rightSlot.appendChild(this.rightPage.element);

    this.syncHardbackBoards();
    this.applyStageTransform(
      this.lastSize.width,
      this.lastSize.height,
      spread,
    );
  }

  private createLeaf(leaf: SpreadLeaf): PageView {
    if (leaf.kind === 'blank') {
      return new PageView(null, this.assets, { onTapActions: this.onTapActions });
    }
    const page = this.story.pages[leaf.pageIndex];
    return new PageView(page, this.assets, { onTapActions: this.onTapActions });
  }
}
