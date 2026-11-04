export type DropKind = 'font' | 'image' | 'text' | 'unknown';

const FONT_EXT = new Set(['woff', 'woff2', 'ttf', 'otf']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif']);

export function extensionOf(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

export function classifyFile(file: File): DropKind {
  const ext = extensionOf(file.name);
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('font/') || type.includes('font') || FONT_EXT.has(ext)) {
    return 'font';
  }
  if (type.startsWith('image/') || IMAGE_EXT.has(ext)) {
    return 'image';
  }
  if (type.startsWith('text/') || ext === 'txt' || ext === 'md') {
    return 'text';
  }
  return 'unknown';
}

/** Family name derived from a font filename (no extension). */
export function familyFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base || 'Custom Font';
}

export function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function uniqueFamily(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export async function loadImageElement(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image ${url}`));
    img.src = url;
  });
  return img;
}

export async function registerFontFace(
  family: string,
  url: string,
  descriptors?: { weight?: string; style?: string },
): Promise<FontFace> {
  const face = new FontFace(family, `url(${JSON.stringify(url)})`, {
    weight: descriptors?.weight ?? 'normal',
    style: descriptors?.style ?? 'normal',
  });
  const loaded = await face.load();
  document.fonts.add(loaded);
  return loaded;
}

/** Plain text from a drop (files and/or text/plain / text/html). */
export async function extractDroppedText(dt: DataTransfer): Promise<string | null> {
  const plain = dt.getData('text/plain')?.trim();
  if (plain) return plain;

  const html = dt.getData('text/html')?.trim();
  if (html && typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const text = (doc.body.textContent ?? '').replace(/\u00a0/g, ' ').trim();
    if (text) return text;
  }

  for (const file of Array.from(dt.files ?? [])) {
    if (classifyFile(file) === 'text') {
      const text = (await file.text()).trim();
      if (text) return text;
    }
  }
  return null;
}
