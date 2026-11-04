/**
 * Hardback covers are larger than interior leaves so open pages sit on top
 * with a visible cover rim on each edge.
 */

/** Extra size on each edge as a fraction of the matching page dimension. */
export const HARDBACK_EDGE_RATIO = 0.035;

export type HardbackOverhang = {
  x: number;
  y: number;
};

export function hardbackOverhang(pageSize: {
  width: number;
  height: number;
}): HardbackOverhang {
  return {
    x: Math.max(1, Math.round(pageSize.width * HARDBACK_EDGE_RATIO)),
    y: Math.max(1, Math.round(pageSize.height * HARDBACK_EDGE_RATIO)),
  };
}

/** Whether hardback presentation applies (flag on + at least one cover). */
export function hardbackEnabled(story: {
  hardback?: boolean;
  frontCover?: boolean;
  backCover?: boolean;
}): boolean {
  return Boolean(story.hardback && (story.frontCover || story.backCover));
}
