import type { StoryBlock, StoryPage, TapAction } from '../schema/story.js';
import {
  boxToPixels,
  htmlToPlainText,
  plainTextToHtml,
  resolveCssLineHeight,
  serializeLayoutBox,
  toPx,
  type PageSize,
} from '../layout/layoutUnits.js';

/**
 * Plain-object subset of Fabric object fields used to round-trip story blocks.
 * Not Fabric's canvas.toJSON() — a documented interop shape without a Fabric runtime.
 */
export type FabricLikeObject = {
  blockId?: string;
  blockType?: 'text' | 'image' | 'hotspot' | 'area' | string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fill?: string;
  textAlign?: string;
  lineHeight?: number;
  fontWeight?: string;
  fontStyle?: string;
  assetId?: string;
  /** Image fit, stored on the story layout box. */
  fit?: 'contain' | 'cover' | 'fill' | 'none';
  ariaLabel?: string;
  onTap?: TapAction[];
  onComplete?: TapAction[];
  requiredTaps?: number;
  game?: string;
  requireComplete?: boolean;
  params?: Record<string, unknown>;
};

export type FabricLikePage = {
  backgroundColor?: string;
  objects: FabricLikeObject[];
};

export type FabricLikeTextDescriptor = {
  kind: 'text';
  blockId: string;
  text: string;
  left: number;
  top: number;
  width: number;
  fontFamily?: string;
  fontSize: number;
  fill?: string;
  textAlign?: 'left' | 'center' | 'right';
  lineHeight: number;
  fontWeight?: string;
  fontStyle?: string;
};

export type FabricLikeImageDescriptor = {
  kind: 'image';
  blockId: string;
  assetId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Resolved image URL when available (editor loads via Fabric). */
  src?: string;
  fit?: 'contain' | 'cover' | 'fill' | 'none';
};

export type FabricLikeHotspotDescriptor = {
  kind: 'hotspot';
  blockId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  ariaLabel?: string;
  onTap?: TapAction[];
  onComplete?: TapAction[];
  requiredTaps?: number;
};

export type FabricLikeAreaDescriptor = {
  kind: 'area';
  blockId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  game: string;
  ariaLabel?: string;
  requireComplete?: boolean;
  params?: Record<string, unknown>;
};

export type FabricLikeContentDescriptor =
  | FabricLikeTextDescriptor
  | FabricLikeImageDescriptor
  | FabricLikeHotspotDescriptor
  | FabricLikeAreaDescriptor;

export type FabricLikeBackground = {
  color: string;
  /** Background image asset id + URL when present. */
  imageAssetId?: string;
  imageSrc?: string;
};

export type FabricLikePageDescriptors = {
  background: FabricLikeBackground;
  objects: FabricLikeContentDescriptor[];
};

type EditableBlock = Extract<StoryBlock, { type: 'text' | 'image' | 'hotspot' | 'area' }>;

function isEditable(block: StoryBlock): block is EditableBlock {
  return (
    block.type === 'text' ||
    block.type === 'image' ||
    block.type === 'hotspot' ||
    block.type === 'area'
  );
}

/**
 * Convert fabric-like objects (+ optional background color) into a StoryPage.
 * Hotspot/area blocks from `previousPage` are preserved unless sync flags say otherwise.
 */
export function fabricLikeToPage(
  objects: FabricLikeObject[],
  previousPage: StoryPage,
  pageSize: PageSize,
  backgroundColor?: string,
  options?: { syncHotspots?: boolean; syncAreas?: boolean },
): StoryPage {
  const syncHotspots = options?.syncHotspots === true;
  const syncAreas = options?.syncAreas === true;
  const byId = new Map<string, StoryBlock>();
  for (const block of previousPage.blocks) {
    if (block.type !== 'hotspot' && block.type !== 'area') byId.set(block.id, { ...block });
  }

  const nextEditable: StoryBlock[] = [];

  for (const obj of objects) {
    const blockId = obj.blockId;
    const blockType = obj.blockType;
    if (!blockId || !blockType) continue;

    const prev = byId.get(blockId);
    const left = Math.round(obj.left ?? 0);
    const top = Math.round(obj.top ?? 0);

    if (blockType === 'text') {
      const width = Math.round(obj.width ?? 0);
      const height = Math.round(obj.height ?? 0);
      const text = obj.text ?? '';
      const prevText = prev && prev.type === 'text' ? prev : undefined;
      const prevPlain = prevText ? htmlToPlainText(prevText.html ?? '') : '';
      const html =
        prevText && prevPlain === text && prevText.html
          ? prevText.html
          : plainTextToHtml(text);
      const prevStyle = prevText?.style;
      const style = {
        fontFamily: obj.fontFamily || prevStyle?.fontFamily,
        fontSize: obj.fontSize != null ? `${Math.round(obj.fontSize)}px` : prevStyle?.fontSize,
        color: typeof obj.fill === 'string' ? obj.fill : prevStyle?.color,
        textAlign:
          (obj.textAlign as 'left' | 'center' | 'right' | undefined) ?? prevStyle?.textAlign,
        lineHeight: obj.lineHeight ?? prevStyle?.lineHeight,
        fontWeight: obj.fontWeight || prevStyle?.fontWeight,
        fontStyle: obj.fontStyle || prevStyle?.fontStyle,
      };
      nextEditable.push({
        id: blockId,
        type: 'text',
        layout: serializeLayoutBox(left, top, width, height, prevText?.layout, pageSize, {
          preserveHeight: true,
        }),
        html,
        style,
        htmlSrc: prevText?.htmlSrc,
      });
    } else if (blockType === 'image') {
      const width = Math.round((obj.width ?? 0) * (obj.scaleX ?? 1));
      const height = Math.round((obj.height ?? 0) * (obj.scaleY ?? 1));
      const assetId =
        obj.assetId ?? (prev && prev.type === 'image' ? prev.asset : undefined);
      if (!assetId) continue;
      const prevImage = prev && prev.type === 'image' ? prev : undefined;
      const layout = serializeLayoutBox(left, top, width, height, prevImage?.layout, pageSize);
      const fit = obj.fit ?? prevImage?.layout?.fit;
      if (fit) layout.fit = fit;
      nextEditable.push({
        id: blockId,
        type: 'image',
        asset: assetId,
        layout,
        className: prevImage?.className,
      });
    } else if (blockType === 'hotspot') {
      const width = Math.round((obj.width ?? 0) * (obj.scaleX ?? 1));
      const height = Math.round((obj.height ?? 0) * (obj.scaleY ?? 1));
      const prevHotspot = prev && prev.type === 'hotspot' ? prev : undefined;
      nextEditable.push({
        id: blockId,
        type: 'hotspot',
        layout: serializeLayoutBox(left, top, width, height, prevHotspot?.layout, pageSize),
        onTap: obj.onTap ?? prevHotspot?.onTap ?? [],
        onComplete: obj.onComplete ?? prevHotspot?.onComplete ?? [],
        requiredTaps: obj.requiredTaps ?? prevHotspot?.requiredTaps,
        ariaLabel: obj.ariaLabel ?? prevHotspot?.ariaLabel,
      });
    } else if (blockType === 'area') {
      const width = Math.round((obj.width ?? 0) * (obj.scaleX ?? 1));
      const height = Math.round((obj.height ?? 0) * (obj.scaleY ?? 1));
      const prevArea = prev && prev.type === 'area' ? prev : undefined;
      const game = obj.game ?? prevArea?.game;
      if (!game) continue;
      nextEditable.push({
        id: blockId,
        type: 'area',
        layout: serializeLayoutBox(left, top, width, height, prevArea?.layout, pageSize),
        game,
        params: obj.params ?? prevArea?.params,
        ariaLabel: obj.ariaLabel ?? prevArea?.ariaLabel,
        requireComplete: obj.requireComplete ?? prevArea?.requireComplete ?? false,
      });
    }
  }

  for (const block of previousPage.blocks) {
    if (!isEditable(block)) continue;
    if (block.type === 'hotspot' && syncHotspots) continue;
    if (block.type === 'area' && syncAreas) continue;
    if (!nextEditable.some((b) => b.id === block.id)) {
      nextEditable.push(block);
    }
  }

  let background = previousPage.background ? { ...previousPage.background } : undefined;
  if (typeof backgroundColor === 'string' && backgroundColor) {
    background = { ...background, color: backgroundColor };
  }

  return {
    ...previousPage,
    background,
    blocks: nextEditable,
  };
}

export type PageToFabricLikeAssets = {
  images: Map<string, { src?: string }>;
  html: Map<string, string>;
};

/** Build fabric-like descriptors from a story page (editor materializes Fabric objects). */
export function pageToFabricLike(
  page: StoryPage,
  assets: PageToFabricLikeAssets,
  pageSize: PageSize,
): FabricLikePageDescriptors {
  const background: FabricLikeBackground = {
    color: page.background?.color ?? '#faf6ef',
  };
  if (page.background?.asset) {
    background.imageAssetId = page.background.asset;
    background.imageSrc = assets.images.get(page.background.asset)?.src;
  }

  const objects: FabricLikeContentDescriptor[] = [];

  for (const block of page.blocks) {
    if (!isEditable(block)) continue;

    if (block.type === 'text') {
      const html =
        block.html ??
        assets.html.get(`htmlSrc:${block.id}`) ??
        (block.htmlSrc ? assets.html.get(block.htmlSrc) : undefined) ??
        '';
      const box = boxToPixels(block.layout, pageSize);
      const fontSize = toPx(block.style?.fontSize, 18) || 18;
      objects.push({
        kind: 'text',
        blockId: block.id,
        text: htmlToPlainText(html),
        left: box.x,
        top: box.y,
        width: Math.max(20, box.width),
        fontFamily: block.style?.fontFamily ?? 'Georgia, serif',
        fontSize,
        fill: block.style?.color ?? '#1f1a14',
        textAlign: block.style?.textAlign ?? 'left',
        lineHeight: resolveCssLineHeight(block.style?.lineHeight, fontSize, 1.35),
        fontWeight: block.style?.fontWeight,
        fontStyle: block.style?.fontStyle,
      });
    } else if (block.type === 'image') {
      const imgEl = assets.images.get(block.asset);
      if (!imgEl?.src) continue;
      const box = boxToPixels(block.layout, pageSize);
      objects.push({
        kind: 'image',
        blockId: block.id,
        assetId: block.asset,
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        src: imgEl.src,
        fit: block.layout?.fit,
      });
    } else if (block.type === 'hotspot') {
      const box = boxToPixels(block.layout, pageSize);
      objects.push({
        kind: 'hotspot',
        blockId: block.id,
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        ariaLabel: block.ariaLabel,
        onTap: block.onTap,
        onComplete: block.onComplete,
        requiredTaps: block.requiredTaps,
      });
    } else if (block.type === 'area') {
      const box = boxToPixels(block.layout, pageSize);
      objects.push({
        kind: 'area',
        blockId: block.id,
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        game: block.game,
        ariaLabel: block.ariaLabel,
        requireComplete: block.requireComplete,
        params: block.params,
      });
    }
  }

  return { background, objects };
}

export type FabricLikeSpreadDescriptors = {
  /** Spread canvas size: width = 2 * pageW, height = pageH. */
  pageSize: PageSize;
  spreadWidth: number;
  leftBackground: FabricLikeBackground | null;
  rightBackground: FabricLikeBackground | null;
  objects: FabricLikeContentDescriptor[];
};

export type SpreadPagesResult = {
  left: StoryPage | null;
  right: StoryPage | null;
};

function objectWidth(obj: FabricLikeObject): number {
  if (obj.blockType === 'image' || obj.blockType === 'hotspot' || obj.blockType === 'area') {
    return Math.round((obj.width ?? 0) * (obj.scaleX ?? 1));
  }
  return Math.round(obj.width ?? 0);
}

function objectHeight(obj: FabricLikeObject): number {
  if (obj.blockType === 'image' || obj.blockType === 'hotspot' || obj.blockType === 'area') {
    return Math.round((obj.height ?? 0) * (obj.scaleY ?? 1));
  }
  return Math.round(obj.height ?? 0);
}

function newBlockId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function offsetDescriptor<T extends FabricLikeContentDescriptor>(
  desc: T,
  dx: number,
): T {
  return { ...desc, left: desc.left + dx };
}

/**
 * Merge left/right story pages into one spread-space fabric-like descriptor list.
 * Right-page objects are offset by +pageWidth.
 */
export function pagesToSpreadFabricLike(
  leftPage: StoryPage | null,
  rightPage: StoryPage | null,
  assets: PageToFabricLikeAssets,
  pageSize: PageSize,
): FabricLikeSpreadDescriptors {
  const objects: FabricLikeContentDescriptor[] = [];
  let leftBackground: FabricLikeBackground | null = null;
  let rightBackground: FabricLikeBackground | null = null;

  if (leftPage) {
    const left = pageToFabricLike(leftPage, assets, pageSize);
    leftBackground = left.background;
    objects.push(...left.objects);
  }
  if (rightPage) {
    const right = pageToFabricLike(rightPage, assets, pageSize);
    rightBackground = right.background;
    for (const obj of right.objects) {
      objects.push(offsetDescriptor(obj, pageSize.width));
    }
  }

  return {
    pageSize,
    spreadWidth: pageSize.width * 2,
    leftBackground,
    rightBackground,
    objects,
  };
}

/**
 * Split spread-space fabric-like objects into left/right StoryPages.
 * Objects that straddle the gutter (x = pageW) are clipped and duplicated.
 */
export function spreadFabricLikeToPages(
  objects: FabricLikeObject[],
  leftPrev: StoryPage | null,
  rightPrev: StoryPage | null,
  pageSize: PageSize,
  backgroundColors?: { left?: string; right?: string },
  options?: { syncHotspots?: boolean; syncAreas?: boolean },
): SpreadPagesResult {
  const gutter = pageSize.width;
  const leftObjects: FabricLikeObject[] = [];
  const rightObjects: FabricLikeObject[] = [];

  for (const obj of objects) {
    if (!obj.blockId || !obj.blockType) continue;
    const left = obj.left ?? 0;
    const width = objectWidth(obj);
    const right = left + width;

    const whollyLeft = right <= gutter + 0.5;
    const whollyRight = left >= gutter - 0.5;

    if (whollyLeft) {
      leftObjects.push({ ...obj });
      continue;
    }
    if (whollyRight) {
      rightObjects.push({
        ...obj,
        left: left - gutter,
      });
      continue;
    }

    // Straddle: clip into two pieces (duplicate blockId on the right half).
    const leftWidth = Math.max(1, Math.round(gutter - left));
    const rightWidth = Math.max(1, Math.round(right - gutter));
    leftObjects.push({
      ...obj,
      width: leftWidth,
      scaleX: 1,
      scaleY: 1,
      height: objectHeight(obj),
    });
    rightObjects.push({
      ...obj,
      blockId: newBlockId(obj.blockId),
      left: 0,
      width: rightWidth,
      scaleX: 1,
      scaleY: 1,
      height: objectHeight(obj),
    });
  }

  const left =
    leftPrev != null
      ? fabricLikeToPage(leftObjects, leftPrev, pageSize, backgroundColors?.left, options)
      : null;
  const right =
    rightPrev != null
      ? fabricLikeToPage(rightObjects, rightPrev, pageSize, backgroundColors?.right, options)
      : null;

  return { left, right };
}
