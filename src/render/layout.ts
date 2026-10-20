import type { LayoutBox } from '../schema/story.js';

export type ResolvedBox = {
  left: string;
  top: string;
  width?: string;
  height?: string;
};

export function resolveLayoutBox(box: LayoutBox | undefined | null): ResolvedBox {
  const layout: Partial<LayoutBox> = box ?? {};
  const result: ResolvedBox = {
    left: toCssLength(layout.x ?? 0),
    top: toCssLength(layout.y ?? 0),
  };
  if (layout.width != null) result.width = toCssLength(layout.width);
  if (layout.height != null) result.height = toCssLength(layout.height);
  return result;
}

export function applyLayout(el: HTMLElement, box: LayoutBox | undefined): void {
  const resolved = resolveLayoutBox(box);
  el.style.left = resolved.left;
  el.style.top = resolved.top;
  if (resolved.width) el.style.width = resolved.width;
  if (resolved.height) el.style.height = resolved.height;

  if (box?.horizontalAlign === 'right') {
    el.style.left = 'auto';
    el.style.right = toCssLength(box.x ?? 0);
  } else if (box?.horizontalAlign === 'center') {
    el.style.left = '50%';
    el.style.transform = `${el.style.transform || ''} translateX(-50%)`.trim();
  }

  if (box?.verticalAlign === 'bottom') {
    el.style.top = 'auto';
    el.style.bottom = toCssLength(box.y ?? 0);
  } else if (box?.verticalAlign === 'center') {
    el.style.top = '50%';
    el.style.transform = `${el.style.transform || ''} translateY(-50%)`.trim();
  }
}

function toCssLength(value: number | string): string {
  if (typeof value === 'number') {
    return `${value}px`;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return `${value}px`;
  }
  return value;
}
