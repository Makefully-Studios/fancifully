import type { Canvas, FabricImage, FabricObject, Textbox } from 'fabric';
import type { LoadedAssets } from '../load/loadStory.js';
import type { StoryBlock, StoryPage } from '../schema/story.js';
import {
  boxToPixels,
  FABRIC_CSS_FONT_SIZE_MULT,
  htmlToPlainText,
  plainTextToHtml,
  resolveCssLineHeight,
  serializeLayoutBox,
  toPx,
  type PageSize,
} from './layoutUnits.js';

export type FabricModule = typeof import('fabric');

type EditableBlock = Extract<StoryBlock, { type: 'text' | 'image' }>;

function isEditable(block: StoryBlock): block is EditableBlock {
  return block.type === 'text' || block.type === 'image';
}

/**
 * If anything applies scale to a Textbox (e.g. shift+corner), bake scaleX into
 * width and reset scale so glyphs stay the same size and lines reflow.
 */
export function reflowTextboxScale(textbox: Textbox): void {
  const scaleX = textbox.scaleX ?? 1;
  const scaleY = textbox.scaleY ?? 1;
  if (scaleX === 1 && scaleY === 1) return;
  textbox.set({
    width: Math.max(20, (textbox.width ?? 0) * scaleX),
    scaleX: 1,
    scaleY: 1,
  });
  textbox.setCoords();
}

function bindTextboxReflow(textbox: Textbox): void {
  textbox.on('scaling', () => {
    reflowTextboxScale(textbox);
  });
  textbox.on('modified', () => {
    reflowTextboxScale(textbox);
  });
}

export type EditorTextboxOptions = {
  blockId: string;
  text: string;
  left: number;
  top: number;
  width: number;
  fontFamily?: string;
  fontSize?: number;
  fill?: string;
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number;
};

/** Create a Fabric Textbox configured for editor use (wrap resize, CSS-matched LH). */
export function createEditorTextbox(
  fabric: FabricModule,
  options: EditorTextboxOptions,
): Textbox {
  const { Textbox } = fabric;
  const fontSize = options.fontSize ?? 18;
  const lineHeight = options.lineHeight ?? 1.35;
  const text = new Textbox(options.text, {
    left: options.left,
    top: options.top,
    width: Math.max(20, options.width),
    originX: 'left',
    originY: 'top',
    padding: 0,
    fontFamily: options.fontFamily ?? 'Georgia, serif',
    fontSize,
    fill: options.fill ?? '#1f1a14',
    textAlign: options.textAlign ?? 'left',
    lineHeight,
    editable: true,
    lockScalingY: true,
    lockScalingFlip: true,
  });
  text._fontSizeMult = FABRIC_CSS_FONT_SIZE_MULT;
  text.initDimensions();
  text.setCoords();
  text.set({
    blockId: options.blockId,
    blockType: 'text',
  });
  text.setControlsVisibility({
    mt: false,
    mb: false,
    tl: false,
    tr: false,
    bl: false,
    br: false,
  });
  bindTextboxReflow(text);
  return text;
}

/** Load page background + text/image blocks onto a Fabric canvas. Hotspots are skipped. */
export async function storyToFabric(
  canvas: Canvas,
  page: StoryPage,
  assets: LoadedAssets,
  fabric: FabricModule,
): Promise<void> {
  const { Textbox, FabricImage, FabricObject } = fabric;
  FabricObject.customProperties = ['blockId', 'blockType', 'assetId'];

  canvas.clear();

  if (page.background?.color) {
    canvas.backgroundColor = page.background.color;
  } else {
    canvas.backgroundColor = '#faf6ef';
  }

  if (page.background?.asset) {
    const imgEl = assets.images.get(page.background.asset);
    if (imgEl?.src) {
      try {
        const bg = await FabricImage.fromURL(imgEl.src, { crossOrigin: 'anonymous' });
        bg.set({
          selectable: false,
          evented: false,
          excludeFromExport: false,
        });
        const scaleX = canvas.getWidth() / (bg.width || 1);
        const scaleY = canvas.getHeight() / (bg.height || 1);
        const scale = Math.max(scaleX, scaleY);
        bg.set({
          left: 0,
          top: 0,
          scaleX: scale,
          scaleY: scale,
          originX: 'left',
          originY: 'top',
        });
        canvas.backgroundImage = bg;
      } catch {
        // keep solid background
      }
    }
  }

  const pageSize = { width: canvas.getWidth(), height: canvas.getHeight() };

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
      const cssLineHeight = resolveCssLineHeight(block.style?.lineHeight, fontSize, 1.35);
      const text = createEditorTextbox(fabric, {
        blockId: block.id,
        text: htmlToPlainText(html),
        left: box.x,
        top: box.y,
        width: Math.max(20, box.width),
        fontFamily: block.style?.fontFamily ?? 'Georgia, serif',
        fontSize,
        fill: block.style?.color ?? '#1f1a14',
        textAlign: block.style?.textAlign ?? 'left',
        lineHeight: cssLineHeight,
      });
      canvas.add(text);
    } else if (block.type === 'image') {
      const imgEl = assets.images.get(block.asset);
      if (!imgEl?.src) continue;
      const box = boxToPixels(block.layout, pageSize);
      try {
        const img = await FabricImage.fromURL(imgEl.src, { crossOrigin: 'anonymous' });
        const iw = img.width || 1;
        const ih = img.height || 1;
        img.set({
          left: box.x,
          top: box.y,
          scaleX: box.width / iw,
          scaleY: box.height / ih,
          originX: 'left',
          originY: 'top',
          blockId: block.id,
          blockType: 'image',
          assetId: block.asset,
        });
        canvas.add(img);
      } catch {
        // skip broken image
      }
    }
  }

  canvas.requestRenderAll();
}

/** Write Fabric object geometry/text back into the page. Hotspot blocks are preserved. */
export function fabricToStory(
  canvas: Canvas,
  page: StoryPage,
  pageSize?: PageSize,
): StoryPage {
  const size: PageSize = pageSize ?? {
    width: canvas.getWidth(),
    height: canvas.getHeight(),
  };
  const hotspots = page.blocks.filter((b) => b.type === 'hotspot');
  const byId = new Map<string, StoryBlock>();
  for (const block of page.blocks) {
    if (block.type !== 'hotspot') byId.set(block.id, { ...block });
  }

  const nextEditable: StoryBlock[] = [];
  const objects = canvas.getObjects() as FabricObject[];

  for (const obj of objects) {
    const blockId = (obj as FabricObject & { blockId?: string }).blockId;
    const blockType = (obj as FabricObject & { blockType?: string }).blockType;
    if (!blockId || !blockType) continue;

    const prev = byId.get(blockId);
    const left = Math.round(obj.left ?? 0);
    const top = Math.round(obj.top ?? 0);

    if (blockType === 'text') {
      const textbox = obj as Textbox;
      // Textboxes keep scale at 1; width drives wrap. Height is content-driven in Fabric.
      const width = Math.round(textbox.width ?? 0);
      const height = Math.round(textbox.height ?? 0);
      const text = textbox.text ?? '';
      const prevText = prev && prev.type === 'text' ? prev : undefined;
      const prevPlain = prevText ? htmlToPlainText(prevText.html ?? '') : '';
      const html =
        prevText && prevPlain === text && prevText.html
          ? prevText.html
          : plainTextToHtml(text);
      const style = prevText?.style
        ? { ...prevText.style }
        : {
            fontFamily: textbox.fontFamily || undefined,
            fontSize: `${textbox.fontSize ?? 18}px`,
            color: typeof textbox.fill === 'string' ? textbox.fill : undefined,
            textAlign: (textbox.textAlign as 'left' | 'center' | 'right' | undefined) ?? undefined,
          };
      nextEditable.push({
        id: blockId,
        type: 'text',
        layout: serializeLayoutBox(left, top, width, height, prevText?.layout, size, {
          // Y scaling is locked — never replace authored box height with content height.
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
        (obj as FabricImage & { assetId?: string }).assetId ??
        (prev && prev.type === 'image' ? prev.asset : undefined);
      if (!assetId) continue;
      const prevImage = prev && prev.type === 'image' ? prev : undefined;
      nextEditable.push({
        id: blockId,
        type: 'image',
        asset: assetId,
        layout: serializeLayoutBox(left, top, width, height, prevImage?.layout, size),
        className: prevImage?.className,
      });
    }
  }

  // Preserve editable blocks that somehow lacked fabric objects (e.g. failed image load).
  for (const block of page.blocks) {
    if (!isEditable(block)) continue;
    if (!nextEditable.some((b) => b.id === block.id)) {
      nextEditable.push(block);
    }
  }

  let background = page.background ? { ...page.background } : undefined;
  if (typeof canvas.backgroundColor === 'string' && canvas.backgroundColor) {
    background = { ...background, color: canvas.backgroundColor };
  }

  return {
    ...page,
    background,
    blocks: [...nextEditable, ...hotspots],
  };
}
