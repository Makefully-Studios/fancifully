import { unzipSync, strFromU8 } from 'fflate';

export type ZipEntries = Map<string, Uint8Array>;

const ZIP_MAGIC = [0x50, 0x4b]; // PK

export function isZipBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === ZIP_MAGIC[0] && bytes[1] === ZIP_MAGIC[1];
}

export function unpackZip(data: ArrayBuffer | Uint8Array): ZipEntries {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!isZipBytes(bytes)) {
    throw new Error('Not a ZIP archive');
  }
  const raw = unzipSync(bytes);
  const entries: ZipEntries = new Map();
  for (const [path, content] of Object.entries(raw)) {
    if (!content || path.endsWith('/')) continue;
    entries.set(normalizeZipPath(path), content);
  }
  return entries;
}

export function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

export function readZipText(entries: ZipEntries, path: string): string {
  const data = findZipEntry(entries, path);
  if (!data) {
    throw new Error(`Missing zip entry: ${path}`);
  }
  return strFromU8(data);
}

export function findZipEntry(entries: ZipEntries, path: string): Uint8Array | undefined {
  const normalized = normalizeZipPath(path);
  if (entries.has(normalized)) return entries.get(normalized);
  const lower = normalized.toLowerCase();
  for (const [key, value] of entries) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

export function listZipPaths(entries: ZipEntries): string[] {
  return [...entries.keys()];
}

export function mimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'm4a':
      return 'audio/mp4';
    case 'webm':
      return 'audio/webm';
    case 'vtt':
      return 'text/vtt';
    case 'html':
    case 'xhtml':
    case 'htm':
      return 'application/xhtml+xml';
    case 'css':
      return 'text/css';
    case 'json':
      return 'application/json';
    case 'woff':
      return 'font/woff';
    case 'woff2':
      return 'font/woff2';
    case 'ttf':
      return 'font/ttf';
    case 'otf':
      return 'font/otf';
    default:
      return 'application/octet-stream';
  }
}

export function createBlobUrl(data: Uint8Array, path: string): string {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const blob = new Blob([copy.buffer], { type: mimeFromPath(path) });
  return URL.createObjectURL(blob);
}

export async function fetchAsArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.arrayBuffer();
}
