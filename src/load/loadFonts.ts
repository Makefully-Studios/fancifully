import type { Story } from '../schema/story.js';
import { resolveUrl } from './resolveUrl.js';

export async function loadFonts(story: Story, baseUrl: string): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return;
  }

  await Promise.all(
    story.fonts.map(async (font) => {
      const url = resolveUrl(baseUrl, font.src);
      const face = new FontFace(font.family, `url(${JSON.stringify(url)})`, {
        weight: font.weight != null ? String(font.weight) : 'normal',
        style: font.style ?? 'normal',
      });
      const loaded = await face.load();
      document.fonts.add(loaded);
    }),
  );
}
