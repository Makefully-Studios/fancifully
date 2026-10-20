import { parseStory, type Story } from '../schema/story.js';
import {
  createBlobUrl,
  findZipEntry,
  listZipPaths,
  normalizeZipPath,
  readZipText,
  unpackZip,
  type ZipEntries,
} from './zipArchive.js';

export type FanciPackage = {
  story: Story;
  /** Map relative asset path → blob: URL */
  pathUrls: Map<string, string>;
  blobUrls: string[];
  storyDir: string;
};

/** Locate story.json in a .fanci zip (root preferred, else first match). */
export function findStoryJsonPath(entries: ZipEntries): string {
  const paths = listZipPaths(entries);
  const exact = paths.find((p) => p === 'story.json' || p.toLowerCase() === 'story.json');
  if (exact) return exact;
  const nested = paths
    .filter((p) => p.toLowerCase().endsWith('/story.json') || p.toLowerCase() === 'story.json')
    .sort((a, b) => a.length - b.length);
  if (nested[0]) return nested[0];
  throw new Error('Invalid .fanci package: missing story.json');
}

export function loadFanciFromZip(entries: ZipEntries): FanciPackage {
  const storyPath = findStoryJsonPath(entries);
  const storyDir = storyPath.includes('/') ? storyPath.replace(/\/[^/]+$/, '/') : '';
  const story = parseStory(JSON.parse(readZipText(entries, storyPath)));

  const pathUrls = new Map<string, string>();
  const blobUrls: string[] = [];

  for (const [path, data] of entries) {
    if (path === storyPath) continue;
    const url = createBlobUrl(data, path);
    blobUrls.push(url);
    pathUrls.set(path, url);
    // Also index relative to story.json directory
    if (storyDir && path.startsWith(storyDir)) {
      pathUrls.set(path.slice(storyDir.length), url);
    }
  }

  // Rewrite asset src / htmlSrc / font src to blob URLs when present in the zip
  rewriteStoryPaths(story, (rel) => resolvePackagePath(pathUrls, storyDir, rel));

  return { story, pathUrls, blobUrls, storyDir };
}

export function loadFanciFromBytes(data: ArrayBuffer | Uint8Array): FanciPackage {
  return loadFanciFromZip(unpackZip(data));
}

function resolvePackagePath(
  pathUrls: Map<string, string>,
  storyDir: string,
  rel: string,
): string | undefined {
  const normalized = normalizeZipPath(rel);
  if (pathUrls.has(normalized)) return pathUrls.get(normalized);
  const withDir = normalizeZipPath(`${storyDir}${normalized}`);
  if (pathUrls.has(withDir)) return pathUrls.get(withDir);
  // try case-insensitive
  const lower = normalized.toLowerCase();
  for (const [key, url] of pathUrls) {
    if (key.toLowerCase() === lower || key.toLowerCase().endsWith(`/${lower}`)) {
      return url;
    }
  }
  return undefined;
}

function rewriteStoryPaths(story: Story, resolve: (rel: string) => string | undefined): void {
  for (const font of story.fonts) {
    const url = resolve(font.src);
    if (url) font.src = url;
  }
  for (const asset of Object.values(story.assets)) {
    const url = resolve(asset.src);
    if (url) asset.src = url;
  }
  for (const page of story.pages) {
    for (const block of page.blocks) {
      if (block.type === 'text' && block.htmlSrc) {
        const url = resolve(block.htmlSrc);
        if (url) block.htmlSrc = url;
      }
    }
  }
}

/** True if zip looks like a Fancifully package (has story.json, not an EPUB). */
export function isFanciZip(entries: ZipEntries): boolean {
  if (findZipEntry(entries, 'META-INF/container.xml')) return false;
  try {
    findStoryJsonPath(entries);
    return true;
  } catch {
    return false;
  }
}
