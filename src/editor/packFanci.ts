import { strToU8, zipSync } from 'fflate';
import { resolveUrl } from '../load/resolveUrl.js';
import type { Story } from '../schema/story.js';

export type PackFanciOptions = {
  /** Already-fetched files keyed by zip path (POSIX). */
  files?: Record<string, Uint8Array>;
  /** Base URL for resolving relative asset `src` values. */
  baseUrl?: string;
};

function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function extensionFromUrl(url: string, fallback: string): string {
  try {
    const path = new URL(url, 'http://local/').pathname;
    const ext = path.split('.').pop()?.toLowerCase();
    if (ext && /^[a-z0-9]{1,8}$/.test(ext)) return ext;
  } catch {
    // ignore
  }
  return fallback;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch asset ${url}: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Pack a story + assets into a `.fanci` ZIP blob (`story.json` at the root).
 * Relative asset paths are preserved; absolute/blob URLs are fetched and rewritten
 * to `assets/{id}.{ext}` inside the archive.
 */
export async function packFanci(story: Story, options: PackFanciOptions = {}): Promise<Blob> {
  const files: Record<string, Uint8Array> = { ...(options.files ?? {}) };
  const packed: Story = structuredClone(story);
  const baseUrl = options.baseUrl ?? '';

  for (const [id, asset] of Object.entries(packed.assets)) {
    const src = asset.src;
    const isRemote =
      /^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith('blob:') || src.startsWith('data:');

    if (isRemote) {
      const ext =
        asset.type === 'image'
          ? extensionFromUrl(src, 'png')
          : asset.type === 'audio'
            ? extensionFromUrl(src, 'mp3')
            : asset.type === 'vtt'
              ? 'vtt'
              : extensionFromUrl(src, 'bin');
      const zipPath = normalizeZipPath(`assets/${id}.${ext}`);
      if (!files[zipPath]) {
        files[zipPath] = await fetchBytes(src);
      }
      asset.src = zipPath;
      continue;
    }

    const zipPath = normalizeZipPath(src);
    if (!files[zipPath]) {
      const url = resolveUrl(baseUrl, src);
      files[zipPath] = await fetchBytes(url);
    }
    asset.src = zipPath;
  }

  for (const font of packed.fonts) {
    const src = font.src;
    const isRemote =
      /^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith('blob:') || src.startsWith('data:');
    if (isRemote) {
      const zipPath = normalizeZipPath(`fonts/${font.family.replace(/\s+/g, '-')}.${extensionFromUrl(src, 'woff2')}`);
      if (!files[zipPath]) {
        files[zipPath] = await fetchBytes(src);
      }
      font.src = zipPath;
    } else {
      const zipPath = normalizeZipPath(src);
      if (!files[zipPath]) {
        files[zipPath] = await fetchBytes(resolveUrl(baseUrl, src));
      }
      font.src = zipPath;
    }
  }

  files['story.json'] = strToU8(JSON.stringify(packed, null, 2));
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped], { type: 'application/zip' });
}

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
