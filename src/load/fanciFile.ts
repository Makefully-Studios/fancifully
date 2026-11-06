/** Extension / MIME helpers for `.fanci` package files. */

export function extensionOf(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

export function isFanciFile(file: File): boolean {
  const ext = extensionOf(file.name);
  const type = (file.type || '').toLowerCase();
  return ext === 'fanci' || type === 'application/x-fanci' || type === 'application/fanci';
}

/** First `.fanci` file in a DataTransfer, if any. */
export function findFanciFile(dt: DataTransfer | null | undefined): File | null {
  if (!dt?.files?.length) return null;
  for (const file of Array.from(dt.files)) {
    if (isFanciFile(file)) return file;
  }
  return null;
}
