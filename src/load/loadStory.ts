import type { LoadProgress } from '../springroll/loading.js';
import { parseStory, type Cue, type Story, type StoryAsset } from '../schema/story.js';
import { parseVtt } from '../sync/parseVtt.js';
import { loadFonts } from './loadFonts.js';
import { isEpubZip, loadEpubFromZip } from './loadEpub.js';
import { isFanciZip, loadFanciFromZip } from './loadFanci.js';
import {
  detectPackageKind,
  extensionOf,
  FANCI_EXTENSION,
  toArrayBuffer,
  type PackageKind,
  type StorySource,
} from './packageTypes.js';
import { baseUrlFromStoryUrl, resolveUrl } from './resolveUrl.js';
import {
  fetchAsArrayBuffer,
  isZipBytes,
  unpackZip,
} from './zipArchive.js';

export type LoadedAssets = {
  images: Map<string, HTMLImageElement>;
  audioUrls: Map<string, { url: string; channel: 'vo' | 'sfx' | 'music' }>;
  cues: Map<string, Cue[]>;
  html: Map<string, string>;
};

export type LoadedStory = {
  story: Story;
  baseUrl: string;
  assets: LoadedAssets;
  /** blob: URLs to revoke on destroy (from .fanci / .epub) */
  blobUrls: string[];
  kind: PackageKind;
};

export type LoadStoryOptions = {
  baseUrl?: string;
  /** Optional filename hint when source is raw bytes (e.g. File.name) */
  name?: string;
  /** Called as the package unpacks and assets load (0–1 overall). */
  onProgress?: (progress: LoadProgress) => void;
};

type ProgressFn = (progress: LoadProgress) => void;

/**
 * Load a story from:
 * - Fancifully JSON object or `.json` URL
 * - `.fanci` ZIP (story.json + relative assets)
 * - `.epub` (subset → Story; no hotspots)
 * - Blob / File / ArrayBuffer of the above
 */
export async function loadStory(
  source: StorySource | Story,
  baseUrlOrOptions?: string | LoadStoryOptions,
): Promise<LoadedStory> {
  const options: LoadStoryOptions =
    typeof baseUrlOrOptions === 'string'
      ? { baseUrl: baseUrlOrOptions }
      : baseUrlOrOptions ?? {};
  const report = options.onProgress ?? (() => undefined);

  // Plain story object
  if (isStoryObject(source)) {
    report({ stage: 'parse', progress: 0.1, detail: 'story object' });
    const story = parseStory(source);
    const resolvedBase =
      options.baseUrl ?? (typeof location !== 'undefined' ? location.href : '');
    report({ stage: 'assets', progress: 0.2, detail: 'fonts' });
    await loadFonts(story, resolvedBase);
    const assets = await preloadAssets(story, resolvedBase, report, 0.25, 1);
    report({ stage: 'complete', progress: 1 });
    return { story, baseUrl: resolvedBase, assets, blobUrls: [], kind: 'object' };
  }

  if (typeof source === 'object' && source !== null && 'story' in source && !isBinary(source)) {
    const wrapped = source as { story: unknown; baseUrl?: string };
    return loadStory(wrapped.story as Story, {
      baseUrl: options.baseUrl ?? wrapped.baseUrl,
      name: options.name,
      onProgress: options.onProgress,
    });
  }

  if (typeof source === 'string') {
    return loadFromUrl(source, options, report);
  }

  if (isBinary(source)) {
    report({ stage: 'fetch', progress: 0.05, detail: 'bytes' });
    const buffer = await toArrayBuffer(source);
    const name =
      options.name
      ?? (source instanceof File ? source.name : undefined)
      ?? '';
    return loadFromBytes(buffer, name, options.baseUrl, report);
  }

  throw new Error('Unsupported story source');
}

async function loadFromUrl(
  url: string,
  options: LoadStoryOptions,
  report: ProgressFn,
): Promise<LoadedStory> {
  const ext = extensionOf(url);
  const kindHint = detectPackageKind(url, options.name ?? url);

  report({ stage: 'fetch', progress: 0.02, detail: url });

  if (ext === FANCI_EXTENSION || ext === '.epub' || kindHint === 'fanci' || kindHint === 'epub') {
    const buffer = await fetchAsArrayBuffer(url);
    report({ stage: 'fetch', progress: 0.15, detail: 'package downloaded' });
    return loadFromBytes(buffer, options.name ?? url, options.baseUrl, report);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load story: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (isZipBytes(bytes)) {
    report({ stage: 'fetch', progress: 0.15, detail: 'zip downloaded' });
    return loadFromBytes(buffer, options.name ?? url, options.baseUrl, report);
  }

  report({ stage: 'parse', progress: 0.2, detail: 'json' });
  const text = new TextDecoder().decode(bytes);
  const story = parseStory(JSON.parse(text));
  const resolvedBase = options.baseUrl ?? baseUrlFromStoryUrl(new URL(url, location.href).href);
  await loadFonts(story, resolvedBase);
  const assets = await preloadAssets(story, resolvedBase, report, 0.3, 1);
  report({ stage: 'complete', progress: 1 });
  return { story, baseUrl: resolvedBase, assets, blobUrls: [], kind: 'json' };
}

async function loadFromBytes(
  buffer: ArrayBuffer,
  name: string,
  baseUrl: string | undefined,
  report: ProgressFn,
): Promise<LoadedStory> {
  const bytes = new Uint8Array(buffer);
  const ext = extensionOf(name);

  if (isZipBytes(bytes)) {
    report({ stage: 'unpack', progress: 0.2, detail: 'unzip' });
    const entries = unpackZip(bytes);
    report({ stage: 'unpack', progress: 0.35, detail: `${entries.size} entries` });

    if (ext === '.epub' || isEpubZip(entries)) {
      report({ stage: 'parse', progress: 0.4, detail: 'epub' });
      const { story, blobUrls } = loadEpubFromZip(entries);
      await loadFonts(story, baseUrl ?? '');
      const assets = await preloadAssets(story, baseUrl ?? '', report, 0.5, 1);
      report({ stage: 'complete', progress: 1 });
      return { story, baseUrl: baseUrl ?? '', assets, blobUrls, kind: 'epub' };
    }
    if (ext === FANCI_EXTENSION || isFanciZip(entries)) {
      report({ stage: 'parse', progress: 0.4, detail: 'fanci' });
      const { story, blobUrls } = loadFanciFromZip(entries);
      await loadFonts(story, baseUrl ?? '');
      const assets = await preloadAssets(story, baseUrl ?? '', report, 0.5, 1);
      report({ stage: 'complete', progress: 1 });
      return { story, baseUrl: baseUrl ?? '', assets, blobUrls, kind: 'fanci' };
    }
    throw new Error(
      'ZIP archive is neither a .fanci package (story.json) nor an EPUB (META-INF/container.xml)',
    );
  }

  report({ stage: 'parse', progress: 0.25, detail: 'json bytes' });
  const story = parseStory(JSON.parse(new TextDecoder().decode(bytes)));
  const resolvedBase = baseUrl ?? (typeof location !== 'undefined' ? location.href : '');
  await loadFonts(story, resolvedBase);
  const assets = await preloadAssets(story, resolvedBase, report, 0.35, 1);
  report({ stage: 'complete', progress: 1 });
  return { story, baseUrl: resolvedBase, assets, blobUrls: [], kind: 'json' };
}

function isStoryObject(source: unknown): source is Story {
  return (
    typeof source === 'object'
    && source !== null
    && !Array.isArray(source)
    && !(source instanceof Blob)
    && !(source instanceof ArrayBuffer)
    && !(source instanceof Uint8Array)
    && 'id' in source
    && 'pages' in source
    && 'pageSize' in source
  );
}

function isBinary(source: unknown): source is ArrayBuffer | Uint8Array | Blob | File {
  return (
    source instanceof ArrayBuffer
    || source instanceof Uint8Array
    || source instanceof Blob
    || (typeof File !== 'undefined' && source instanceof File)
  );
}

async function preloadAssets(
  story: Story,
  baseUrl: string,
  report: ProgressFn,
  progressStart: number,
  progressEnd: number,
): Promise<LoadedAssets> {
  const images = new Map<string, HTMLImageElement>();
  const audioUrls = new Map<string, { url: string; channel: 'vo' | 'sfx' | 'music' }>();
  const cues = new Map<string, Cue[]>();
  const html = new Map<string, string>();

  const entries = Object.entries(story.assets) as [string, StoryAsset][];
  const extraHtmlJobs: Array<() => Promise<void>> = [];

  for (const page of story.pages) {
    for (const block of page.blocks) {
      if (block.type === 'text' && block.htmlSrc && !block.html) {
        extraHtmlJobs.push(async () => {
          const url = resolveUrl(baseUrl, block.htmlSrc!);
          html.set(`htmlSrc:${block.id}`, await fetchText(url));
        });
      }
      if (page.readAloud?.cues && typeof page.readAloud.cues === 'string') {
        const cueId = page.readAloud.cues;
        if (!story.assets[cueId]) {
          extraHtmlJobs.push(async () => {
            const url = resolveUrl(baseUrl, cueId);
            try {
              cues.set(cueId, parseVtt(await fetchText(url)));
            } catch {
              // optional
            }
          });
        }
      }
    }
  }

  const total = entries.length + extraHtmlJobs.length || 1;
  let count = 0;
  const tick = (detail: string) => {
    count += 1;
    const t = count / total;
    const progress = progressStart + (progressEnd - progressStart) * Math.min(1, t);
    report({
      stage: 'assets',
      progress,
      count,
      total,
      detail,
    });
  };

  await Promise.all(
    entries.map(async ([id, asset]) => {
      const url = resolveUrl(baseUrl, asset.src);
      if (asset.type === 'image') {
        images.set(id, await loadImage(url));
      } else if (asset.type === 'audio') {
        audioUrls.set(id, { url, channel: asset.channel ?? 'vo' });
      } else if (asset.type === 'vtt') {
        cues.set(id, parseVtt(await fetchText(url)));
      } else if (asset.type === 'html') {
        html.set(id, await fetchText(url));
      }
      tick(id);
    }),
  );

  await Promise.all(
    extraHtmlJobs.map(async (job) => {
      await job();
      tick('fragment');
    }),
  );

  if (entries.length === 0 && extraHtmlJobs.length === 0) {
    report({ stage: 'assets', progress: progressEnd, count: 0, total: 0, detail: 'none' });
  }

  return { images, audioUrls, cues, html };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.text();
}

export function revokeLoadedStory(loaded: LoadedStory): void {
  for (const url of loaded.blobUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
  loaded.blobUrls.length = 0;
}

export { FANCI_EXTENSION };
