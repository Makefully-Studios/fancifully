import type { PageGameContext, PageGameHandle } from './PageGame.js';

export const COUNT_UNITS_GAME_ID = 'fc.count-units';

export type CountUnitsParams = {
  targetCount: number;
  unitAsset: string;
  trackAsset?: string;
  label?: string;
};

function assetUrl(
  assets: PageGameContext['assets'],
  id: string | undefined,
): string | null {
  if (!id) return null;
  return assets.images.get(id)?.src ?? null;
}

function parseParams(raw: Record<string, unknown> | undefined): CountUnitsParams | null {
  if (!raw) return null;
  const targetCount = Number(raw.targetCount);
  const unitAsset =
    typeof raw.unitAsset === 'string'
      ? raw.unitAsset
      : undefined;
  if (!Number.isFinite(targetCount) || targetCount < 1 || !unitAsset) return null;
  const trackAsset =
    typeof raw.trackAsset === 'string'
      ? raw.trackAsset
      : typeof raw.bedAsset === 'string'
        ? raw.bedAsset
        : undefined;
  return {
    targetCount: Math.floor(targetCount),
    unitAsset,
    trackAsset,
    label: typeof raw.label === 'string' ? raw.label : undefined,
  };
}

export function mountCountUnits(ctx: PageGameContext): PageGameHandle {
  const { el, onComplete, signal, assets, block } = ctx;
  el.replaceChildren();
  el.classList.add('fc-game', 'fc-game-count-units');

  const params = parseParams(block.params as Record<string, unknown> | undefined);
  if (!params) {
    const missing = document.createElement('p');
    missing.className = 'fc-area-missing';
    missing.textContent = 'Invalid fc.count-units params (need targetCount + unitAsset)';
    el.append(missing);
    return {
      destroy() {
        el.replaceChildren();
        el.classList.remove('fc-game', 'fc-game-count-units');
      },
    };
  }

  const { targetCount, unitAsset, trackAsset, label } = params;
  let count = 0;
  const unitUrl = assetUrl(assets, unitAsset);

  const board = document.createElement('div');
  board.className = 'fc-game-board';

  const track = document.createElement('div');
  track.className = 'fc-game-track';
  const trackUrl = assetUrl(assets, trackAsset);
  if (trackUrl) {
    const img = document.createElement('img');
    img.src = trackUrl;
    img.alt = '';
    img.draggable = false;
    track.append(img);
  }

  const units = document.createElement('div');
  units.className = 'fc-game-units';

  const counter = document.createElement('p');
  counter.className = 'fc-game-count';
  const format = (n: number) =>
    label ? label.replace('{n}', String(n)).replace('{target}', String(targetCount)) : `${n} / ${targetCount}`;
  counter.textContent = format(0);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'fc-game-add-unit';
  addBtn.setAttribute('aria-label', 'Add one');
  if (unitUrl) {
    const img = document.createElement('img');
    img.src = unitUrl;
    img.alt = '';
    img.draggable = false;
    addBtn.append(img);
  } else {
    addBtn.textContent = '+';
  }

  addBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (signal.aborted || count >= targetCount) return;
    count += 1;
    const unit = document.createElement('div');
    unit.className = 'fc-game-unit';
    if (unitUrl) {
      const img = document.createElement('img');
      img.src = unitUrl;
      img.alt = '';
      img.draggable = false;
      unit.append(img);
    }
    units.append(unit);
    counter.textContent = format(count);
    if (count >= targetCount) {
      addBtn.disabled = true;
      board.classList.add('is-complete');
      onComplete();
    }
  });

  board.append(track, units, counter, addBtn);
  el.append(board);

  return {
    destroy() {
      el.replaceChildren();
      el.classList.remove('fc-game', 'fc-game-count-units');
    },
  };
}
