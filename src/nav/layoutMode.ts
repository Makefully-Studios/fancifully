import type { LayoutMode, ResolvedLayoutMode } from '../schema/story.js';

export function resolveLayoutMode(
  mode: LayoutMode,
  containerWidth: number,
  singleBreakpoint: number,
): ResolvedLayoutMode {
  if (mode === 'auto') {
    return containerWidth >= singleBreakpoint ? 'two-page' : 'single';
  }
  return mode;
}

/** Build spread index pairs. Cover is [blank, page0]; then [1,2], [3,4], … orphan gets blank mate. */
export type SpreadLeaf =
  | { kind: 'blank' }
  | { kind: 'page'; pageIndex: number; pageId: string };

export type Spread = {
  index: number;
  left: SpreadLeaf;
  right: SpreadLeaf;
};

export function buildSpreads(pages: { id: string }[]): Spread[] {
  if (pages.length === 0) return [];

  const spreads: Spread[] = [];

  // Cover alone: blank left + cover right
  spreads.push({
    index: 0,
    left: { kind: 'blank' },
    right: { kind: 'page', pageIndex: 0, pageId: pages[0].id },
  });

  let i = 1;
  while (i < pages.length) {
    const left: SpreadLeaf = { kind: 'page', pageIndex: i, pageId: pages[i].id };
    const right: SpreadLeaf =
      i + 1 < pages.length
        ? { kind: 'page', pageIndex: i + 1, pageId: pages[i + 1].id }
        : { kind: 'blank' };
    spreads.push({
      index: spreads.length,
      left,
      right,
    });
    i += 2;
  }

  return spreads;
}

export function contentPageIds(spread: Spread): string[] {
  const ids: string[] = [];
  if (spread.left.kind === 'page') ids.push(spread.left.pageId);
  if (spread.right.kind === 'page') ids.push(spread.right.pageId);
  return ids;
}

export function findSpreadIndexForPage(spreads: Spread[], pageId: string): number {
  const idx = spreads.findIndex(
    (s) =>
      (s.left.kind === 'page' && s.left.pageId === pageId) ||
      (s.right.kind === 'page' && s.right.pageId === pageId),
  );
  return idx < 0 ? 0 : idx;
}
