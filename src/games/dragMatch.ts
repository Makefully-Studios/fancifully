import type { PageGameContext, PageGameHandle } from './PageGame.js';

export const DRAG_MATCH_GAME_ID = 'fc.drag-match';

export type DragMatchPiece = {
  id: string;
  asset: string;
  /** Match key compared to `zone.expects`. */
  match: string;
  label?: string;
};

export type DragMatchZone = {
  id: string;
  asset?: string;
  expects: string;
  label?: string;
};

export type DragMatchParams = {
  pieces: DragMatchPiece[];
  zones: DragMatchZone[];
  /** Tray (pieces) before zones, or after. Default `after`. */
  tray?: 'before' | 'after';
};

function assetUrl(
  assets: PageGameContext['assets'],
  id: string | undefined,
): string | null {
  if (!id) return null;
  return assets.images.get(id)?.src ?? null;
}

function pointerPos(el: HTMLElement, event: PointerEvent) {
  const rect = el.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100,
    y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100,
  };
}

/** Prefer over elementFromPoint — absolute drag can cover zones mid-check. */
function dropTargetAt(
  clientX: number,
  clientY: number,
  targets: Iterable<HTMLElement>,
): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const r = target.getBoundingClientRect();
    if (
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    ) {
      const area = r.width * r.height;
      if (area < bestArea) {
        best = target;
        bestArea = area;
      }
    }
  }
  return best;
}

function parseParams(raw: Record<string, unknown> | undefined): DragMatchParams | null {
  if (!raw) return null;
  const pieceList = Array.isArray(raw.pieces) ? raw.pieces : [];
  const zoneList = Array.isArray(raw.zones)
    ? raw.zones
    : Array.isArray(raw.slots)
      ? raw.slots
      : Array.isArray(raw.piles)
        ? raw.piles
        : [];

  const pieces: DragMatchPiece[] = [];
  for (const item of pieceList) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    if (typeof p.id !== 'string' || typeof p.asset !== 'string') continue;
    const match =
      typeof p.match === 'string'
        ? p.match
        : typeof p.shape === 'string'
          ? p.shape
          : p.id;
    pieces.push({
      id: p.id,
      asset: p.asset,
      match,
      label: typeof p.label === 'string' ? p.label : undefined,
    });
  }

  const zones: DragMatchZone[] = [];
  for (const item of zoneList) {
    if (!item || typeof item !== 'object') continue;
    const z = item as Record<string, unknown>;
    if (typeof z.id !== 'string' || typeof z.expects !== 'string') continue;
    zones.push({
      id: z.id,
      expects: z.expects,
      asset: typeof z.asset === 'string' ? z.asset : undefined,
      label: typeof z.label === 'string' ? z.label : undefined,
    });
  }

  if (pieces.length === 0 || zones.length === 0) return null;
  const tray = raw.tray === 'before' || raw.tray === 'after' ? raw.tray : 'after';
  return { pieces, zones, tray };
}

export function mountDragMatch(ctx: PageGameContext): PageGameHandle {
  const { el, onComplete, signal, assets, block } = ctx;
  el.replaceChildren();
  el.classList.add('fc-game', 'fc-game-drag-match');

  const params = parseParams(block.params as Record<string, unknown> | undefined);
  if (!params) {
    const missing = document.createElement('p');
    missing.className = 'fc-area-missing';
    missing.textContent = 'Invalid fc.drag-match params (need pieces + zones)';
    el.append(missing);
    return {
      destroy() {
        el.replaceChildren();
        el.classList.remove('fc-game', 'fc-game-drag-match');
      },
    };
  }

  const { pieces, zones, tray = 'after' } = params;
  const placedPieces = new Set<string>();

  const board = document.createElement('div');
  board.className = 'fc-game-board';

  const zoneRow = document.createElement('div');
  zoneRow.className = 'fc-game-zones';
  const zoneEls: HTMLElement[] = [];

  for (const zone of zones) {
    const zoneEl = document.createElement('div');
    zoneEl.className = 'fc-game-zone';
    zoneEl.dataset.zoneId = zone.id;
    zoneEl.dataset.expects = zone.expects;
    const url = assetUrl(assets, zone.asset);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.draggable = false;
      zoneEl.append(img);
    }
    if (zone.label) {
      const label = document.createElement('span');
      label.className = 'fc-game-zone-label';
      label.textContent = zone.label;
      zoneEl.append(label);
    }
    zoneRow.append(zoneEl);
    zoneEls.push(zoneEl);
  }

  const pieceRow = document.createElement('div');
  pieceRow.className = 'fc-game-pieces';

  const checkDone = () => {
    if (placedPieces.size < pieces.length || signal.aborted) return;
    onComplete();
  };

  for (const piece of pieces) {
    const pieceEl = document.createElement('button');
    pieceEl.type = 'button';
    pieceEl.className = 'fc-game-piece';
    pieceEl.dataset.pieceId = piece.id;
    pieceEl.dataset.match = piece.match;
    if (piece.label) pieceEl.setAttribute('aria-label', piece.label);
    const url = assetUrl(assets, piece.asset);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = piece.label ?? piece.id;
      img.draggable = false;
      pieceEl.append(img);
    }
    if (piece.label) {
      const label = document.createElement('span');
      label.className = 'fc-game-piece-label';
      label.textContent = piece.label;
      pieceEl.append(label);
    }

    let dragging = false;

    const bounceHome = () => {
      pieceEl.classList.add('is-bounce');
      window.setTimeout(() => pieceEl.classList.remove('is-bounce'), 280);
      pieceEl.classList.remove('is-placed');
      placedPieces.delete(piece.id);
      pieceRow.append(pieceEl);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (signal.aborted) return;
      event.preventDefault();
      event.stopPropagation();
      dragging = true;
      placedPieces.delete(piece.id);
      pieceEl.classList.remove('is-placed');
      pieceEl.setPointerCapture(event.pointerId);
      pieceEl.classList.add('is-dragging');
      const pos = pointerPos(board, event);
      pieceEl.style.left = `${pos.x}%`;
      pieceEl.style.top = `${pos.y}%`;
      board.append(pieceEl);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      event.stopPropagation();
      const pos = pointerPos(board, event);
      pieceEl.style.left = `${pos.x}%`;
      pieceEl.style.top = `${pos.y}%`;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!dragging) return;
      event.stopPropagation();
      dragging = false;
      const zoneEl = dropTargetAt(event.clientX, event.clientY, zoneEls);
      pieceEl.classList.remove('is-dragging');
      pieceEl.style.left = '';
      pieceEl.style.top = '';

      if (zoneEl?.dataset.expects === piece.match) {
        placedPieces.add(piece.id);
        zoneEl.append(pieceEl);
        pieceEl.classList.add('is-placed');
        checkDone();
        return;
      }

      if (zoneEl) {
        bounceHome();
        return;
      }
      bounceHome();
    };

    pieceEl.addEventListener('pointerdown', onPointerDown);
    pieceEl.addEventListener('pointermove', onPointerMove);
    pieceEl.addEventListener('pointerup', onPointerUp);
    pieceEl.addEventListener('pointercancel', onPointerUp);
    pieceRow.append(pieceEl);
  }

  if (tray === 'before') board.append(pieceRow, zoneRow);
  else board.append(zoneRow, pieceRow);
  el.append(board);

  return {
    destroy() {
      el.replaceChildren();
      el.classList.remove('fc-game', 'fc-game-drag-match');
    },
  };
}
