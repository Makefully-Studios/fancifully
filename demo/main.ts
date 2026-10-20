import { Storybook } from '@makefully/fancifully';

const app = document.getElementById('app');
const status = document.getElementById('status');
const layoutSelect = document.getElementById('layoutMode') as HTMLSelectElement | null;

if (!app) {
  throw new Error('#app missing');
}

function setStatus(pageIds: string[], index: number, layoutMode: string): void {
  if (status) {
    status.textContent = `spread ${index} · ${pageIds.join(' + ') || '(blank)'} · ${layoutMode}`;
  }
}

const book = await Storybook.create(app, {
  story: './stories/demo/story.json',
  baseUrl: './stories/demo/',
  autoPlayReadAloud: false,
});

book.on('pagechange', ({ pageIds, index, layoutMode }) => {
  setStatus(pageIds, index, layoutMode);
});

book.on('layoutchange', ({ layoutMode }) => {
  if (status) {
    const current = status.textContent ?? '';
    const parts = current.split(' · ');
    if (parts.length >= 3) {
      parts[2] = layoutMode;
      status.textContent = parts.join(' · ');
    } else {
      status.textContent = `layout · ${layoutMode}`;
    }
  }
});

layoutSelect?.addEventListener('change', () => {
  const mode = layoutSelect.value as 'auto' | 'single' | 'two-page';
  book.setLayoutMode(mode);
});

setStatus(book.pageIds, book.spreadIndex, book.layoutMode);
