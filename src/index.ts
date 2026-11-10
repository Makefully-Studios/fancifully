import './styles/fancifully.css';

export {
  Storybook,
  findFanciFile,
  type StorybookOptions,
  type StorybookChromeOptions,
  type EditableLeaf,
} from './Storybook.js';
export { type StageZoom } from './render/SpreadView.js';
export {
  parseStory,
  storySchema,
  type Story,
  type StoryPage,
  type BookGuides,
  type StoryBlock,
  type StoryAsset,
  type TapAction,
  type Cue,
} from './schema/story.js';
export { packFanci, downloadBlob, type PackFanciOptions } from './pack/packFanci.js';
export {
  fabricLikeToPage,
  pageToFabricLike,
  pagesToSpreadFabricLike,
  spreadFabricLikeToPages,
  type FabricLikeObject,
  type FabricLikePage,
  type FabricLikePageDescriptors,
  type FabricLikeSpreadDescriptors,
  type FabricLikeTextDescriptor,
  type FabricLikeImageDescriptor,
  type FabricLikeHotspotDescriptor,
  type FabricLikeAreaDescriptor,
  type FabricLikeContentDescriptor,
  type FabricLikeBackground,
  type PageToFabricLikeAssets,
  type SpreadPagesResult,
} from './interop/fabricLike.js';
export {
  boxToPixels,
  htmlToPlainText,
  plainTextToHtml,
  serializeLayoutBox,
  scaleBlocksToPageSize,
  toPx,
  resolveCssLineHeight,
  FABRIC_CSS_FONT_SIZE_MULT,
  type PageSize,
} from './layout/layoutUnits.js';
export {
  FlipStyle,
  DefaultFlipStyle,
  createFlipStyle,
  registerFlipStyle,
  getRegisteredFlipStyle,
  listRegisteredFlipStyles,
  resolveFlipSpeedMs,
  DEFAULT_FLIP_SPEED_MS,
  type FlipContext,
  type FlipDirection,
  type FlipStyleConstructor,
  type FlipStyleInput,
} from './flip/index.js';
export {
  registerPageGame,
  getRegisteredPageGame,
  listRegisteredPageGames,
  unregisterPageGame,
  clearPageGameRegistry,
  isAreaNavGated,
  type AreaBlock,
  type PageGameContext,
  type PageGameFactory,
  type PageGameHandle,
} from './games/PageGame.js';
export {
  loadStory,
  revokeLoadedStory,
  FANCI_EXTENSION,
  type LoadedStory,
  type LoadedAssets,
  type LoadStoryOptions,
} from './load/loadStory.js';
export { isFanciFile, extensionOf } from './load/fanciFile.js';
export type { StorySource, PackageKind } from './load/packageTypes.js';
export { loadFanciFromBytes, loadFanciFromZip, findStoryJsonPath } from './load/loadFanci.js';
export { loadEpubFromBytes, loadEpubFromZip } from './load/loadEpub.js';
export { parseVtt } from './sync/parseVtt.js';
export { CueTimeline } from './sync/CueTimeline.js';
export {
  buildSpreads,
  buildSingleSpreads,
  buildTwoPageSpreads,
  buildFrontCoverSpread,
  buildBackCoverSpread,
  resolveLayoutMode,
  contentPageIds,
  primaryPageId,
  findSpreadIndexForPage,
  DEFAULT_LAYOUT_MODE,
  DEFAULT_SINGLE_BREAKPOINT,
  type CoverOptions,
  type BookState,
  type LayoutMode,
  type ResolvedLayoutMode,
} from './nav/layoutMode.js';
export {
  HARDBACK_EDGE_RATIO,
  hardbackEnabled,
  hardbackOverhang,
  type HardbackOverhang,
} from './nav/hardback.js';
export {
  bindApplication,
  createSpringrollApplication,
  waitForSpringrollReady,
} from './springroll/bindApplication.js';
export {
  reportSpringrollProgress,
  reportSpringrollLoaded,
  type LoadProgress,
  type LoadStage,
} from './springroll/loading.js';
