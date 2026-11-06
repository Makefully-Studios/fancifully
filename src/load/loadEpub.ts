import { parseStory, type Cue, type Story, type StoryAsset, type StoryPage } from '../schema/story.js';
import {
  createBlobUrl,
  findZipEntry,
  normalizeZipPath,
  readZipText,
  unpackZip,
  type ZipEntries,
} from './zipArchive.js';

export type EpubPackage = {
  story: Story;
  blobUrls: string[];
};

type ManifestItem = {
  id: string;
  href: string;
  mediaType: string;
  mediaOverlay?: string;
  properties?: string;
};

/**
 * Import an EPUB (fixed-layout friendly) into a Fancifully Story.
 * Supports spine pages, images, audio, and a simplified Media Overlay → cue mapping.
 * Hotspots and rich Fancifully layout are not present in EPUB and are omitted.
 */
export function loadEpubFromBytes(data: ArrayBuffer | Uint8Array): EpubPackage {
  return loadEpubFromZip(unpackZip(data));
}

export function loadEpubFromZip(entries: ZipEntries): EpubPackage {
  const containerXml = readZipText(entries, 'META-INF/container.xml');
  const rootfile = matchAttr(containerXml, /full-path\s*=\s*"([^"]+)"/i);
  if (!rootfile) {
    throw new Error('Invalid EPUB: missing rootfile in container.xml');
  }

  const opfPath = normalizeZipPath(rootfile);
  const opfDir = opfPath.includes('/') ? opfPath.replace(/\/[^/]+$/, '/') : '';
  const opfXml = readZipText(entries, opfPath);

  const title = textContent(opfXml, 'dc:title') || textContent(opfXml, 'title') || 'EPUB Story';
  const pageSize = parseViewport(opfXml) ?? { width: 768, height: 1024 };

  const manifest = parseManifest(opfXml, opfDir);
  const spineIds = parseSpine(opfXml);

  const blobUrls: string[] = [];
  const hrefToUrl = new Map<string, string>();

  const materialize = (href: string): string => {
    const path = normalizeZipPath(href);
    if (hrefToUrl.has(path)) return hrefToUrl.get(path)!;
    const data = findZipEntry(entries, path);
    if (!data) {
      throw new Error(`EPUB missing file: ${path}`);
    }
    const url = createBlobUrl(data, path);
    blobUrls.push(url);
    hrefToUrl.set(path, url);
    return url;
  };

  const assets: Record<string, StoryAsset> = {};
  const pages: StoryPage[] = [];

  spineIds.forEach((id, index) => {
    const item = manifest.get(id);
    if (!item) return;
    if (!/html|xml/i.test(item.mediaType) && !item.href.match(/\.x?html?$/i)) return;

    const pagePath = item.href;
    const pageHtml = readZipText(entries, pagePath);
    const pageDir = pagePath.includes('/') ? pagePath.replace(/\/[^/]+$/, '/') : '';
    const pageId = `page-${index + 1}`;

    const bodyHtml = extractBody(pageHtml);
    const { html, imageHrefs } = rewriteHtmlResources(bodyHtml, pageDir, (rel) => {
      const abs = normalizeZipPath(rel.includes(':') ? rel : `${pageDir}${rel}`);
      try {
        return materialize(abs);
      } catch {
        return rel;
      }
    });

    const blocks: StoryPage['blocks'] = [
      {
        id: `${pageId}-text`,
        type: 'text',
        layout: { x: '5%', y: '5%', width: '90%', height: '90%' },
        html,
      },
    ];

    // Promote first large image as background when obvious
    const bgHref = imageHrefs[0];
    let background: StoryPage['background'];
    if (bgHref) {
      const assetId = `img-${index}-0`;
      assets[assetId] = { type: 'image', src: materialize(bgHref) };
      background = { asset: assetId, color: '#ffffff' };
    } else {
      background = { color: '#ffffff' };
    }

    let readAloud: StoryPage['readAloud'];
    if (item.mediaOverlay) {
      const overlayItem = manifest.get(item.mediaOverlay);
      if (overlayItem) {
        const overlay = parseMediaOverlay(readZipText(entries, overlayItem.href), overlayItem.href);
        if (overlay.audioHref) {
          const audioId = `vo-${index}`;
          const audioPath = normalizeZipPath(
            overlay.audioHref.includes('/') || overlay.audioHref.startsWith('.')
              ? resolveAgainst(overlayItem.href, overlay.audioHref)
              : `${opfDir}${overlay.audioHref}`,
          );
          assets[audioId] = { type: 'audio', src: materialize(audioPath), channel: 'vo' };
          const cues = overlay.cues;
          if (cues.length) {
            readAloud = { audio: audioId, cues };
          } else {
            readAloud = { audio: audioId };
          }
        }
      }
    }

    pages.push({
      id: pageId,
      background,
      readAloud,
      blocks,
    });
  });

  if (pages.length === 0) {
    throw new Error('Invalid EPUB: no spine HTML documents found');
  }

  const story = parseStory({
    id: `epub-${slugify(title)}`,
    title,
    pageSize,
    fonts: [],
    assets,
    pages,
  });

  return { story, blobUrls };
}

export function isEpubZip(entries: ZipEntries): boolean {
  return Boolean(findZipEntry(entries, 'META-INF/container.xml'));
}

function parseManifest(opfXml: string, opfDir: string): Map<string, ManifestItem> {
  const map = new Map<string, ManifestItem>();
  const itemRe = /<item\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(opfXml))) {
    const tag = match[0];
    const id = matchAttr(tag, /\bid\s*=\s*"([^"]+)"/i);
    const href = matchAttr(tag, /\bhref\s*=\s*"([^"]+)"/i);
    const mediaType = matchAttr(tag, /\bmedia-type\s*=\s*"([^"]+)"/i) ?? '';
    const mediaOverlay = matchAttr(tag, /\bmedia-overlay\s*=\s*"([^"]+)"/i) ?? undefined;
    const properties = matchAttr(tag, /\bproperties\s*=\s*"([^"]+)"/i) ?? undefined;
    if (!id || !href) continue;
    map.set(id, {
      id,
      href: normalizeZipPath(`${opfDir}${href}`),
      mediaType,
      mediaOverlay,
      properties,
    });
  }
  return map;
}

function parseSpine(opfXml: string): string[] {
  const spineMatch = opfXml.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i);
  if (!spineMatch) return [];
  const ids: string[] = [];
  const itemRefRe = /<itemref\b[^>]*\bidref\s*=\s*"([^"]+)"[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRefRe.exec(spineMatch[1]))) {
    ids.push(match[1]);
  }
  return ids;
}

function parseViewport(opfXml: string): { width: number; height: number } | null {
  const meta = opfXml.match(
    /<meta\b[^>]*name\s*=\s*"viewport"[^>]*content\s*=\s*"([^"]+)"[^>]*>/i,
  ) || opfXml.match(/<meta\b[^>]*content\s*=\s*"([^"]+)"[^>]*name\s*=\s*"viewport"[^>]*>/i);
  if (!meta) return null;
  const content = meta[1];
  const w = content.match(/width\s*=\s*(\d+)/i);
  const h = content.match(/height\s*=\s*(\d+)/i);
  if (!w || !h) return null;
  return { width: Number(w[1]), height: Number(h[1]) };
}

function parseMediaOverlay(smil: string, smilPath: string): { audioHref?: string; cues: Cue[] } {
  const cues: Cue[] = [];
  let audioHref: string | undefined;

  // Collect audio src from first audio element
  const audioSrc = matchAttr(smil, /<audio\b[^>]*\bsrc\s*=\s*"([^"]+)"/i);
  if (audioSrc) {
    audioHref = resolveAgainst(smilPath, audioSrc);
  }

  const parRe = /<par\b[^>]*>([\s\S]*?)<\/par>/gi;
  let parMatch: RegExpExecArray | null;
  let index = 0;
  while ((parMatch = parRe.exec(smil))) {
    const block = parMatch[1];
    const textSrc = matchAttr(block, /<text\b[^>]*\bsrc\s*=\s*"([^"]+)"/i);
    const clipBegin = matchAttr(block, /\bclipBegin\s*=\s*"([^"]+)"/i);
    const clipEnd = matchAttr(block, /\bclipEnd\s*=\s*"([^"]+)"/i);
    const frag = textSrc?.includes('#') ? textSrc.split('#')[1] : `cue-${index}`;
    if (clipBegin == null || clipEnd == null) continue;
    cues.push({
      id: frag || `cue-${index}`,
      start: parseSmilTime(clipBegin),
      end: parseSmilTime(clipEnd),
    });
    index += 1;
  }

  return { audioHref, cues };
}

function parseSmilTime(value: string): number {
  // npt= or plain seconds / clock
  const cleaned = value.replace(/^npt=/i, '').trim();
  if (/^\d+(\.\d+)?$/.test(cleaned)) return Number(cleaned);
  const parts = cleaned.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function extractBody(xhtml: string): string {
  const body = xhtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return body ? body[1].trim() : xhtml;
}

function rewriteHtmlResources(
  html: string,
  pageDir: string,
  resolveUrl: (rel: string) => string,
): { html: string; imageHrefs: string[] } {
  const imageHrefs: string[] = [];
  const rewritten = html.replace(
    /\b(src|href)\s*=\s*["']([^"']+)["']/gi,
    (full, attr: string, rel: string) => {
      if (/^(?:[a-z]+:|#|data:)/i.test(rel)) return full;
      const abs = normalizeZipPath(`${pageDir}${rel}`);
      if (/\.(png|jpe?g|gif|webp|svg)$/i.test(rel)) {
        imageHrefs.push(abs);
      }
      const url = resolveUrl(rel);
      return `${attr}="${url}"`;
    },
  );
  return { html: rewritten, imageHrefs };
}

function resolveAgainst(basePath: string, rel: string): string {
  if (/^(?:[a-z]+:)/i.test(rel)) return rel;
  const baseDir = basePath.includes('/') ? basePath.replace(/\/[^/]+$/, '/') : '';
  const stack = (baseDir + rel).split('/');
  const out: string[] = [];
  for (const part of stack) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function matchAttr(source: string, re: RegExp): string | null {
  const m = source.match(re);
  return m ? m[1] : null;
}

function textContent(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag.replace(':', ':')}[^>]*>([^<]*)</${tag.replace(':', ':')}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'book';
}
