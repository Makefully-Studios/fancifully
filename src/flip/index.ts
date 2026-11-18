export {
  FlipStyle,
  createFlipStyle,
  registerFlipStyle,
  getRegisteredFlipStyle,
  listRegisteredFlipStyles,
  resolveFlipSpeedMs,
  DEFAULT_FLIP_SPEED_MS,
  type FlipContentSide,
  type FlipContext,
  type FlipDirection,
  type FlipStyleConstructor,
  type FlipStyleInput,
} from './FlipStyle.js';
export { DefaultFlipStyle, flipTurnClass } from './DefaultFlipStyle.js';

// Ensure built-in styles register on import.
import './DefaultFlipStyle.js';
