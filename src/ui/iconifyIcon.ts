import { getIconData, iconToHTML, iconToSVG } from '@iconify/utils';
import mdiSubset from './mdi-subset.json';

/** Offline MDI subset used by editor / book chrome (see mdi-subset.json). */
const icons = mdiSubset as Parameters<typeof getIconData>[0];

export type MdiIconName =
  | 'chevron-left'
  | 'chevron-right'
  | 'book-open-page-variant'
  | 'pencil'
  | 'eye'
  | 'download'
  | 'cog'
  | 'file-plus'
  | 'file-remove'
  | 'book'
  | 'book-open-outline'
  | 'book-variant'
  | 'folder-open'
  | 'drag-vertical'
  | 'close'
  | 'plus';

export type ButtonIconContent = {
  icon: MdiIconName;
  /** Visible or screen-reader label */
  label: string;
  /** Hide label visually (keep for assistive tech). */
  iconOnly?: boolean;
};

/**
 * Build an inline SVG from the offline MDI subset (`currentColor` fill).
 */
export function createMdiIcon(
  name: MdiIconName,
  opts: { className?: string; size?: string } = {},
): HTMLElement {
  const data = getIconData(icons, name);
  if (!data) {
    throw new Error(`Unknown MDI icon in subset: ${name}`);
  }
  const size = opts.size ?? '1.15rem';
  const built = iconToSVG(data, { height: size, width: size });
  const wrap = document.createElement('span');
  wrap.className = opts.className ?? 'fc-icon';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = iconToHTML(built.body, built.attributes);
  return wrap;
}

/**
 * Replace button children with an Iconify icon + label.
 * Always sets `title` / `aria-label` so narrow icon-only chrome keeps a tooltip.
 */
export function setButtonIconContent(btn: HTMLElement, content: ButtonIconContent): void {
  const icon = createMdiIcon(content.icon);
  const label = document.createElement('span');
  label.className = content.iconOnly ? 'fc-btn-label fc-btn-label--sr' : 'fc-btn-label';
  label.textContent = content.label;
  btn.title = content.label;
  btn.setAttribute('aria-label', content.label);
  btn.replaceChildren(icon, label);
}
