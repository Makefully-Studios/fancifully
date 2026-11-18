import type { Cue } from '../schema/story.js';

/**
 * Wrap page text matching cue payloads with `<span data-cue-id class="fc-cue">`.
 * Works for word- or phrase-level VTT. Skips cues that already have a matching
 * `#id` / `[data-cue-id]` under `root`. Search is sequential and whitespace-flexible.
 */
export function applyCueSpans(root: ParentNode, cues: Cue[]): void {
  if (!cues.length) return;

  const scopes = resolveScopes(root);
  if (scopes.length === 0) return;

  for (const cue of cues) {
    if (!cue.id) continue;
    if (hasCueTarget(root, cue.id)) continue;

    const needle = (cue.text ?? '').trim();
    if (!needle) continue;

    // Rebuild each pass: text already inside .fc-cue spans is omitted, so the
    // next cue matches at the start of the remaining (unwrapped) text.
    const flat = flattenText(scopes);
    const match = findFlexibleMatch(flat.text, needle, 0);
    if (!match) continue;

    wrapRange(flat.map, match.start, match.end, cue.id);
  }
}

function resolveScopes(root: ParentNode): Element[] {
  if (typeof (root as Element).querySelectorAll !== 'function') return [];
  const texts = Array.from((root as Element).querySelectorAll('.fc-block-text'));
  if (texts.length > 0) return texts;
  if (root instanceof Element) return [root];
  return [];
}

function hasCueTarget(root: ParentNode, id: string): boolean {
  return Boolean(findCueElement(root, id));
}

function findCueElement(root: ParentNode, id: string): Element | null {
  if (typeof (root as Element).querySelector !== 'function') return null;
  const el = root as Element;
  const attr = cssEscapeAttr(id);
  const byAttr = el.querySelector(`[data-cue-id="${attr}"]`);
  if (byAttr) return byAttr;
  // `#1` is invalid in CSS; only use id selectors for safe idents.
  if (!/^[A-Za-z_][\w-]*$/.test(id)) return null;
  return el.querySelector(`#${cssEscape(id)}`);
}

type FlatMap = { node: Text; offset: number }[];

type FlatText = { text: string; map: FlatMap };

function flattenText(scopes: Element[]): FlatText {
  const map: FlatMap = [];
  let text = '';
  const SHOW_TEXT = 4; // NodeFilter.SHOW_TEXT (happy-dom / workers may lack NodeFilter)
  for (const scope of scopes) {
    const walker = scope.ownerDocument!.createTreeWalker(scope, SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    while (node) {
      // Skip text inside existing cue spans so we don't nest wraps.
      if (node.parentElement?.closest('.fc-cue, [data-cue-id]')) {
        node = walker.nextNode() as Text | null;
        continue;
      }
      const value = node.nodeValue ?? '';
      for (let i = 0; i < value.length; i += 1) {
        map.push({ node, offset: i });
        text += value[i];
      }
      node = walker.nextNode() as Text | null;
    }
  }
  return { text, map };
}

function findFlexibleMatch(
  haystack: string,
  needle: string,
  fromIndex: number,
): { start: number; end: number } | null {
  const parts = needle.split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (parts.length === 0) return null;
  const pattern = new RegExp(parts.join('\\s+'));
  const sliced = haystack.slice(Math.max(0, fromIndex));
  const m = pattern.exec(sliced);
  if (!m) return null;
  const start = fromIndex + m.index;
  return { start, end: start + m[0].length };
}

function wrapRange(map: FlatMap, start: number, end: number, cueId: string): void {
  if (start < 0 || end <= start || end > map.length) return;

  const startRef = map[start];
  const endRef = map[end - 1];
  if (!startRef || !endRef) return;

  const doc = startRef.node.ownerDocument;
  if (!doc) return;

  // Same text node — split and wrap.
  if (startRef.node === endRef.node) {
    const node = startRef.node;
    const full = node.nodeValue ?? '';
    const before = full.slice(0, startRef.offset);
    const mid = full.slice(startRef.offset, endRef.offset + 1);
    const after = full.slice(endRef.offset + 1);
    const span = createCueSpan(doc, cueId, mid);
    const parent = node.parentNode;
    if (!parent) return;
    if (before) parent.insertBefore(doc.createTextNode(before), node);
    parent.insertBefore(span, node);
    if (after) parent.insertBefore(doc.createTextNode(after), node);
    parent.removeChild(node);
    return;
  }

  // Multi-node: use Range when available.
  if (typeof doc.createRange === 'function') {
    const range = doc.createRange();
    range.setStart(startRef.node, startRef.offset);
    range.setEnd(endRef.node, endRef.offset + 1);
    const span = createCueSpan(doc, cueId, '');
    try {
      range.surroundContents(span);
      return;
    } catch {
      // Partially selected elements — fall through to extractContents.
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
    }
  }
}

function createCueSpan(doc: Document, cueId: string, text: string): HTMLElement {
  const span = doc.createElement('span');
  span.dataset.cueId = cueId;
  span.classList.add('fc-cue');
  if (text) span.textContent = text;
  return span;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function cssEscapeAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
