/** How a reader presents pages. Not stored on the story. */
export type LayoutMode = 'single' | 'two-page' | 'responsive' | 'auto';
/** Concrete presentation after resolving `responsive` / `auto`. */
export type ResolvedLayoutMode = 'single' | 'two-page';

/** Reader default when the host does not pass a layout mode. */
export const DEFAULT_LAYOUT_MODE: LayoutMode = 'auto';
/** Width where `auto` switches to two-page, in CSS pixels. */
export const DEFAULT_SINGLE_BREAKPOINT = 900;

/**
 * Resolve a reader layout mode to a concrete single / two-page presentation.
 *
 * - `single` / `two-page`: fixed
 * - `responsive`: landscape (width ≥ height) → two-page; portrait → single
 * - `auto`: width ≥ singleBreakpoint → two-page
 */
export function resolveLayoutMode(
  mode: LayoutMode,
  containerWidth: number,
  containerHeight: number,
  singleBreakpoint: number,
): ResolvedLayoutMode {
  if (mode === 'responsive') {
    return containerWidth >= containerHeight ? 'two-page' : 'single';
  }
  if (mode === 'auto') {
    return containerWidth >= singleBreakpoint ? 'two-page' : 'single';
  }
  return mode;
}

export type CoverOptions = {
  frontCover?: boolean;
  backCover?: boolean;
};

/** Closed cover presentation vs open spreads. */
export type BookState = 'closed-front' | 'open' | 'closed-back';

export type SpreadLeaf =
  | { kind: 'blank' }
  | { kind: 'page'; pageIndex: number; pageId: string };

export type Spread = {
  index: number;
  left: SpreadLeaf;
  right: SpreadLeaf;
};

function pageLeaf(pages: { id: string }[], index: number): SpreadLeaf {
  return { kind: 'page', pageIndex: index, pageId: pages[index].id };
}

const BLANK: SpreadLeaf = { kind: 'blank' };

/** Closed front cover: cover on the right (recto), blank left — flips away on open. */
export function buildFrontCoverSpread(pages: { id: string }[]): Spread {
  return {
    index: -1,
    left: BLANK,
    right: pageLeaf(pages, 0),
  };
}

/** Closed back cover: back on the right, blank left. */
export function buildBackCoverSpread(pages: { id: string }[]): Spread {
  const last = pages.length - 1;
  return {
    index: -2,
    left: BLANK,
    right: pageLeaf(pages, last),
  };
}

/**
 * Two-page open spreads.
 *
 * Default (no covers): `[blank, p0]`, then pairs, orphan `[last, blank]`.
 * `frontCover`: page 0 is only shown closed; open spreads start at page 1 with
 *   content on the left (no leading blank).
 * `backCover`: last page is only shown closed; open spreads omit it (no trailing blank).
 */
export function buildTwoPageSpreads(
  pages: { id: string }[],
  covers: CoverOptions = {},
): Spread[] {
  if (pages.length === 0) return [];

  const frontCover = Boolean(covers.frontCover);
  const backCover = Boolean(covers.backCover);
  const spreads: Spread[] = [];

  // Open content range (exclusive end). Covers are not part of open spreads.
  let i = frontCover ? 1 : 0;
  const end = backCover ? Math.max(i, pages.length - 1) : pages.length;

  if (!frontCover && i < end) {
    spreads.push({
      index: 0,
      left: BLANK,
      right: pageLeaf(pages, 0),
    });
    i = 1;
  }

  while (i < end) {
    if (i + 1 < end) {
      spreads.push({
        index: spreads.length,
        left: pageLeaf(pages, i),
        right: pageLeaf(pages, i + 1),
      });
      i += 2;
      continue;
    }

    // Orphan interior page — blank on the right (not a back cover).
    spreads.push({
      index: spreads.length,
      left: pageLeaf(pages, i),
      right: BLANK,
    });
    i += 1;
  }

  return spreads;
}

/**
 * One-page spreads: every story page (including covers) is its own spread.
 * Front cover on the left; back cover on the right; others alternate.
 */
export function buildSingleSpreads(
  pages: { id: string }[],
  covers: CoverOptions = {},
): Spread[] {
  if (pages.length === 0) return [];

  const frontCover = Boolean(covers.frontCover);
  const backCover = Boolean(covers.backCover);
  const last = pages.length - 1;

  return pages.map((page, i) => {
    const leaf = pageLeaf(pages, i);
    if (frontCover && i === 0) {
      return { index: i, left: leaf, right: BLANK };
    }
    if (backCover && i === last) {
      return { index: i, left: BLANK, right: leaf };
    }
    if (i % 2 === 0) {
      return { index: i, left: BLANK, right: leaf };
    }
    return { index: i, left: leaf, right: BLANK };
  });
}

export function buildSpreads(
  pages: { id: string }[],
  mode: ResolvedLayoutMode = 'two-page',
  covers: CoverOptions = {},
): Spread[] {
  return mode === 'single'
    ? buildSingleSpreads(pages, covers)
    : buildTwoPageSpreads(pages, covers);
}

export function contentPageIds(spread: Spread): string[] {
  const ids: string[] = [];
  if (spread.left.kind === 'page') ids.push(spread.left.pageId);
  if (spread.right.kind === 'page') ids.push(spread.right.pageId);
  return ids;
}

/** Prefer left content page, else right — stable anchor when remapping layouts. */
export function primaryPageId(spread: Spread | undefined): string | null {
  if (!spread) return null;
  if (spread.left.kind === 'page') return spread.left.pageId;
  if (spread.right.kind === 'page') return spread.right.pageId;
  return null;
}

export function findSpreadIndexForPage(spreads: Spread[], pageId: string): number {
  const idx = spreads.findIndex(
    (s) =>
      (s.left.kind === 'page' && s.left.pageId === pageId) ||
      (s.right.kind === 'page' && s.right.pageId === pageId),
  );
  return idx < 0 ? 0 : idx;
}
