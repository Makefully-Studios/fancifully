/** Fancifully story package (ZIP of story.json + assets). `.fan` is occupied elsewhere. */
export const FANCI_EXTENSION = '.fanci';

export type StorySource =
  | string
  | ArrayBuffer
  | Uint8Array
  | Blob
  | File
  | { story: unknown; baseUrl?: string };

export type PackageKind = 'json' | 'fanci' | 'epub' | 'object';

export function extensionOf(urlOrName: string): string {
  const clean = urlOrName.split('?')[0].split('#')[0];
  const base = clean.split('/').pop() ?? clean;
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot).toLowerCase() : '';
}

export function detectPackageKind(source: StorySource, hintName?: string): PackageKind {
  if (typeof source === 'object' && source !== null && !(source instanceof Blob) && !(source instanceof ArrayBuffer) && !(source instanceof Uint8Array) && !ArrayBuffer.isView(source)) {
    if ('story' in source || ('id' in source && 'pages' in source)) {
      return 'object';
    }
  }

  const name = hintName
    ?? (typeof source === 'string' ? source : source instanceof File ? source.name : '');

  const ext = extensionOf(name);
  if (ext === FANCI_EXTENSION || ext === '.fanci.zip') return 'fanci';
  if (ext === '.epub') return 'epub';
  if (ext === '.json') return 'json';

  return 'json';
}

export async function toArrayBuffer(source: ArrayBuffer | Uint8Array | Blob | File): Promise<ArrayBuffer> {
  if (source instanceof ArrayBuffer) return source;
  if (source instanceof Uint8Array) {
    return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer;
  }
  return source.arrayBuffer();
}
