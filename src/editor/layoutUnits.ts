import type { LayoutBox } from '../schema/story.js';

export type PageSize = { width: number; height: number };

/**
 * Parse a layout length to CSS pixels.
 * Supports numbers, numeric strings, `px`, and `%` (resolved against `axisSize`).
 */
export function toPx(
  value: number | string | undefined,
  fallback = 0,
  axisSize = 0,
): number {
  if (value == null) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const trimmed = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : fallback;
  }
  const pct = trimmed.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (pct) {
    const n = Number(pct[1]);
    if (!Number.isFinite(n) || !(axisSize > 0)) return fallback;
    return (n / 100) * axisSize;
  }
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/i);
  if (match) {
    const n = Number(match[1]);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/** Resolve a layout box to page-space pixels (percentages use pageSize). */
export function boxToPixels(
  box: LayoutBox | undefined,
  pageSize: PageSize,
): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const { width: pageW, height: pageH } = pageSize;
  return {
    x: Math.round(toPx(box?.x, 0, pageW)),
    y: Math.round(toPx(box?.y, 0, pageH)),
    width: Math.round(toPx(box?.width, pageW, pageW)),
    height: Math.round(toPx(box?.height, pageH * 0.25, pageH)),
  };
}

function isPercentLength(value: number | string | undefined): boolean {
  return typeof value === 'string' && /%$/.test(value.trim());
}

function toPercentString(px: number, axis: number): string {
  if (!(axis > 0)) return '0%';
  const pct = (px / axis) * 100;
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded}%`;
}

/**
 * Write fabric geometry back to a layout box.
 * Preserves the previous box (including `%` units / authored height) when the
 * resolved position & width are unchanged — Textbox height is content-driven and
 * must not rewrite the story box on every edit session.
 */
export function serializeLayoutBox(
  left: number,
  top: number,
  width: number,
  height: number,
  prev: LayoutBox | undefined,
  pageSize: PageSize,
  options: { preserveHeight?: boolean } = {},
): LayoutBox {
  const prevBox = boxToPixels(prev, pageSize);
  const samePos =
    Math.abs(prevBox.x - left) <= 1 &&
    Math.abs(prevBox.y - top) <= 1 &&
    Math.abs(prevBox.width - width) <= 1;
  const sameHeight = Math.abs(prevBox.height - height) <= 1;
  if (samePos && (options.preserveHeight || sameHeight) && prev) {
    return { ...prev };
  }

  const usePct =
    isPercentLength(prev?.x) ||
    isPercentLength(prev?.y) ||
    isPercentLength(prev?.width) ||
    isPercentLength(prev?.height);

  const outHeight = options.preserveHeight && prev?.height != null ? prev.height : height;

  if (usePct) {
    return {
      ...prev,
      x: toPercentString(left, pageSize.width),
      y: toPercentString(top, pageSize.height),
      width: toPercentString(width, pageSize.width),
      height:
        typeof outHeight === 'string' || typeof outHeight === 'number'
          ? typeof outHeight === 'number'
            ? toPercentString(outHeight, pageSize.height)
            : outHeight
          : toPercentString(height, pageSize.height),
    };
  }

  return {
    ...prev,
    x: left,
    y: top,
    width,
    height: typeof outHeight === 'number' ? Math.round(outHeight) : outHeight,
  };
}

/**
 * Resolve story/CSS line-height to a unitless multiplier (CSS `line-height: 1.4`).
 * Accepts unitless numbers, numeric strings, `%`, or `px` (px ÷ fontSize).
 */
export function resolveCssLineHeight(
  value: number | string | undefined,
  fontSizePx: number,
  fallback = 1.35,
): number {
  if (value == null) return fallback;
  if (typeof value === 'number') return value > 0 ? value : fallback;
  const trimmed = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    return n > 0 ? n : fallback;
  }
  const pct = trimmed.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (pct) {
    const n = Number(pct[1]) / 100;
    return n > 0 ? n : fallback;
  }
  const px = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/i);
  if (px && fontSizePx > 0) {
    const n = Number(px[1]) / fontSizePx;
    return n > 0 ? n : fallback;
  }
  return fallback;
}

/**
 * Fabric applies `lineHeight * _fontSizeMult` (default mult 1.13) per line.
 * Set mult to 1 so story/CSS unitless line-height matches 1:1.
 */
export const FABRIC_CSS_FONT_SIZE_MULT = 1;

export function htmlToPlainText(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\u00a0/g, ' ');
}

export function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const withBreaks = escaped.replace(/\n/g, '<br/>');
  return `<p>${withBreaks}</p>`;
}
