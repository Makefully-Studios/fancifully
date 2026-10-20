export function resolveUrl(baseUrl: string, src: string): string {
  if (/^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith('data:') || src.startsWith('blob:')) {
    return src;
  }
  if (!baseUrl) {
    return src;
  }
  try {
    return new URL(src, ensureTrailingSlash(baseUrl)).href;
  } catch {
    const base = ensureTrailingSlash(baseUrl);
    return `${base}${src.replace(/^\//, '')}`;
  }
}

function ensureTrailingSlash(value: string): string {
  if (value.endsWith('/') || value.includes('?')) {
    return value.endsWith('/') ? value : `${value}/`;
  }
  // If base looks like a file, strip filename
  if (/\.[a-z0-9]+$/i.test(value.split('/').pop() ?? '')) {
    return value.replace(/[^/]+$/, '');
  }
  return `${value}/`;
}

export function baseUrlFromStoryUrl(storyUrl: string): string {
  try {
    const url = new URL(storyUrl, typeof location !== 'undefined' ? location.href : 'http://local/');
    url.hash = '';
    const path = url.pathname;
    url.pathname = path.replace(/[^/]+$/, '');
    return url.href;
  } catch {
    return ensureTrailingSlash(storyUrl.replace(/[^/]+$/, ''));
  }
}
