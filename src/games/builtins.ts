import { mountCountUnits, COUNT_UNITS_GAME_ID } from './countUnits.js';
import { mountDragMatch, DRAG_MATCH_GAME_ID } from './dragMatch.js';
import { registerPageGame } from './PageGame.js';

export { COUNT_UNITS_GAME_ID, DRAG_MATCH_GAME_ID };
export type { CountUnitsParams } from './countUnits.js';
export type { DragMatchParams, DragMatchPiece, DragMatchZone } from './dragMatch.js';

/** Built-in area game ids shipped with fancifully (book-stored composables). */
export const BUILTIN_PAGE_GAME_IDS = [DRAG_MATCH_GAME_ID, COUNT_UNITS_GAME_ID] as const;

/**
 * Register stock area games (`fc.drag-match`, `fc.count-units`).
 * Safe to call multiple times; host `pageGames` / custom ids still win when passed to Storybook.
 */
export function registerBuiltInPageGames(): void {
  registerPageGame(DRAG_MATCH_GAME_ID, mountDragMatch);
  registerPageGame(COUNT_UNITS_GAME_ID, mountCountUnits);
}
