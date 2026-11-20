import type {
  PageTrigger,
  ReadAloudAutoPlay,
  StoryPage,
} from '../schema/story.js';

/** Whether a trigger should run for the current host autoplay mode. */
export function triggerMatchesAutoPlay(
  trigger: Pick<PageTrigger, 'whenAutoPlay'>,
  mode: ReadAloudAutoPlay,
): boolean {
  const modes = trigger.whenAutoPlay;
  if (!modes || modes.length === 0) return true;
  return modes.includes(mode);
}

/** Default attention targets: hotspots and areas on the page. */
export function defaultHighlightTargets(page: StoryPage): string[] {
  return page.blocks
    .filter((block) => block.type === 'hotspot' || block.type === 'area')
    .map((block) => block.id);
}

export function resolveHighlightTargets(
  page: StoryPage,
  trigger: PageTrigger,
): string[] {
  const listed = trigger.highlight?.targets;
  if (listed && listed.length > 0) return listed;
  return defaultHighlightTargets(page);
}

export function resolveHighlightClassName(trigger: PageTrigger): string {
  return trigger.highlight?.className?.trim() || 'fc-attention';
}
