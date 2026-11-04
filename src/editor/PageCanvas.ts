import type { Canvas, FabricObject, Textbox } from 'fabric';
import type { LoadedAssets } from '../load/loadStory.js';
import type { Story, StoryPage } from '../schema/story.js';
import {
  classifyFile,
  extensionOf,
  extractDroppedText,
  familyFromFilename,
  loadImageElement,
  readFileBytes,
  registerFontFace,
  uniqueFamily,
  uniqueId,
} from './dropImport.js';
import {
  createEditorTextbox,
  fabricToStory,
  reflowTextboxScale,
  storyToFabric,
  type FabricModule,
} from './storyFabricMap.js';

export type PageCanvasHost = {
  story: Story;
  assets: LoadedAssets;
  /** Zip-relative path → bytes for packFanci (dropped fonts/images). */
  editorFiles: Record<string, Uint8Array>;
  blobUrls: string[];
  getDefaultFontFamily: () => string | null;
  setDefaultFontFamily: (family: string) => void;
  /** Apply font to every textbox on every open editor canvas + story text styles. */
  applyFontToAllTextboxes: (family: string) => void;
};

/**
 * Fabric canvas overlay for one story page leaf.
 * Sized to `pageSize` (unscaled); the leaf / book transform scales it with the page.
 */
export class PageCanvas {
  readonly element: HTMLElement;
  private canvasEl: HTMLCanvasElement;
  private fabricCanvas: Canvas | null = null;
  private page: StoryPage;
  private assets: LoadedAssets;
  private pageSize: { width: number; height: number };
  private fabricMod: FabricModule | null = null;
  private dirty = false;
  private host: PageCanvasHost;

  private constructor(
    page: StoryPage,
    pageSize: { width: number; height: number },
    host: PageCanvasHost,
  ) {
    this.page = page;
    this.assets = host.assets;
    this.pageSize = pageSize;
    this.host = host;

    this.element = document.createElement('div');
    this.element.className = 'fc-page-canvas';
    this.element.dataset.pageId = page.id;

    this.canvasEl = document.createElement('canvas');
    this.canvasEl.width = pageSize.width;
    this.canvasEl.height = pageSize.height;
    this.element.appendChild(this.canvasEl);
  }

  static async create(
    page: StoryPage,
    pageSize: { width: number; height: number },
    host: PageCanvasHost,
  ): Promise<PageCanvas> {
    const instance = new PageCanvas(page, pageSize, host);
    await instance.mount();
    return instance;
  }

  private async mount(): Promise<void> {
    const fabric = await import('fabric');
    this.fabricMod = fabric;
    const { Canvas } = fabric;
    this.fabricCanvas = new Canvas(this.canvasEl, {
      width: this.pageSize.width,
      height: this.pageSize.height,
      preserveObjectStacking: true,
      selection: true,
      uniformScaling: false,
    });
    this.fabricCanvas.on('object:scaling', (e) => {
      const target = e.target as (Textbox & { blockType?: string }) | undefined;
      if (target?.blockType === 'text') {
        reflowTextboxScale(target);
      }
    });
    const markDirty = () => {
      this.dirty = true;
    };
    this.fabricCanvas.on('object:modified', markDirty);
    this.fabricCanvas.on('text:changed', markDirty);
    this.fabricCanvas.on('dragover', (opt) => {
      opt.e.preventDefault();
    });
    this.fabricCanvas.on('drop', (opt) => {
      opt.e.preventDefault();
      void this.handleDrop(opt);
    });
    await storyToFabric(this.fabricCanvas, this.page, this.assets, fabric);
    this.dirty = false;
  }

  /** Sync Fabric's CSS/backing store after the overlay is attached to a leaf. */
  syncLayout(): void {
    if (!this.fabricCanvas) return;
    this.fabricCanvas.setDimensions({
      width: this.pageSize.width,
      height: this.pageSize.height,
    });
    this.fabricCanvas.calcOffset();
    this.fabricCanvas.requestRenderAll();
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Apply a font family to every text object on this canvas. */
  applyFontToAllText(family: string): void {
    if (!this.fabricCanvas) return;
    for (const obj of this.fabricCanvas.getObjects()) {
      if ((obj as FabricObject & { blockType?: string }).blockType === 'text') {
        (obj as Textbox).set({ fontFamily: family });
      }
    }
    this.fabricCanvas.requestRenderAll();
    this.dirty = true;
  }

  /** Commit canvas state into a StoryPage (does not mutate the original). */
  commit(): StoryPage {
    if (!this.fabricCanvas) return this.page;
    const next = fabricToStory(this.fabricCanvas, this.page, this.pageSize);
    this.page = next;
    this.dirty = false;
    return next;
  }

  get pageId(): string {
    return this.page.id;
  }

  async reload(page: StoryPage): Promise<void> {
    this.page = page;
    this.element.dataset.pageId = page.id;
    if (!this.fabricCanvas || !this.fabricMod) return;
    await storyToFabric(this.fabricCanvas, this.page, this.assets, this.fabricMod);
    this.syncLayout();
    this.dirty = false;
  }

  destroy(): void {
    this.fabricCanvas?.dispose();
    this.fabricCanvas = null;
    this.element.remove();
  }

  private async handleDrop(opt: {
    e: Event;
    target?: FabricObject;
  }): Promise<void> {
    if (!this.fabricCanvas || !this.fabricMod) return;
    const e = opt.e as DragEvent;
    const dt = e.dataTransfer;
    if (!dt) return;

    const point = this.fabricCanvas.getScenePoint(e);
    const target = opt.target as (FabricObject & { blockType?: string }) | undefined;
    const files = Array.from(dt.files ?? []);

    let handled = false;
    for (const file of files) {
      const kind = classifyFile(file);
      if (kind === 'font') {
        await this.dropFont(file, target);
        handled = true;
      } else if (kind === 'image') {
        await this.dropImage(file, point.x, point.y);
        handled = true;
      } else if (kind === 'text') {
        const text = (await file.text()).trim();
        if (text) {
          this.dropText(text, point.x, point.y);
          handled = true;
        }
      }
    }

    if (!handled) {
      const text = await extractDroppedText(dt);
      if (text) {
        this.dropText(text, point.x, point.y);
      }
    }
  }

  private async dropFont(
    file: File,
    target: (FabricObject & { blockType?: string }) | undefined,
  ): Promise<void> {
    const ext = extensionOf(file.name) || 'woff2';
    const base = familyFromFilename(file.name);
    const family = uniqueFamily(
      base,
      this.host.story.fonts.map((f) => f.family),
    );
    const bytes = await readFileBytes(file);
    const relPath = `fonts/${uniqueId('font')}.${ext}`;
    const blobUrl = URL.createObjectURL(file);
    this.host.blobUrls.push(blobUrl);
    this.host.editorFiles[relPath] = bytes;

    await registerFontFace(family, blobUrl);
    this.host.story.fonts.push({ family, src: relPath });

    if (target?.blockType === 'text') {
      (target as Textbox).set({ fontFamily: family });
      this.fabricCanvas?.requestRenderAll();
      this.dirty = true;
    } else {
      this.host.setDefaultFontFamily(family);
      this.host.applyFontToAllTextboxes(family);
    }
  }

  private async dropImage(file: File, x: number, y: number): Promise<void> {
    if (!this.fabricCanvas || !this.fabricMod) return;
    const ext = extensionOf(file.name) || 'png';
    const assetId = uniqueId('img');
    const relPath = `assets/${assetId}.${ext}`;
    const bytes = await readFileBytes(file);
    const blobUrl = URL.createObjectURL(file);
    this.host.blobUrls.push(blobUrl);
    this.host.editorFiles[relPath] = bytes;

    this.host.story.assets[assetId] = { type: 'image', src: relPath };
    const imgEl = await loadImageElement(blobUrl);
    this.host.assets.images.set(assetId, imgEl);

    const { FabricImage } = this.fabricMod;
    const img = await FabricImage.fromURL(blobUrl, { crossOrigin: 'anonymous' });
    const maxW = this.pageSize.width * 0.5;
    const maxH = this.pageSize.height * 0.5;
    const iw = img.width || 1;
    const ih = img.height || 1;
    const scale = Math.min(1, maxW / iw, maxH / ih);
    const width = iw * scale;
    const height = ih * scale;
    img.set({
      left: Math.max(0, Math.min(x - width / 2, this.pageSize.width - width)),
      top: Math.max(0, Math.min(y - height / 2, this.pageSize.height - height)),
      scaleX: scale,
      scaleY: scale,
      originX: 'left',
      originY: 'top',
      blockId: uniqueId('block'),
      blockType: 'image',
      assetId,
    });
    this.fabricCanvas.add(img);
    this.fabricCanvas.setActiveObject(img);
    this.fabricCanvas.requestRenderAll();
    this.dirty = true;
  }

  private dropText(text: string, x: number, y: number): void {
    if (!this.fabricCanvas || !this.fabricMod) return;
    const width = Math.min(280, this.pageSize.width * 0.7);
    const fontFamily =
      this.host.getDefaultFontFamily() ?? 'Georgia, serif';
    const textbox = createEditorTextbox(this.fabricMod, {
      blockId: uniqueId('block'),
      text,
      left: Math.max(0, Math.min(x, this.pageSize.width - 40)),
      top: Math.max(0, Math.min(y, this.pageSize.height - 40)),
      width,
      fontFamily,
      fontSize: 22,
      fill: '#2a2440',
      lineHeight: 1.4,
    });
    this.fabricCanvas.add(textbox);
    this.fabricCanvas.setActiveObject(textbox);
    this.fabricCanvas.requestRenderAll();
    this.dirty = true;
  }
}
