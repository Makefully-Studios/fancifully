import type { Cue } from '../schema/story.js';

/** Parse WebVTT into cue objects. Cue id comes from the optional identifier line. */
export function parseVtt(source: string): Cue[] {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  if (!normalized.startsWith('WEBVTT')) {
    throw new Error('Invalid WebVTT: missing WEBVTT header');
  }

  const body = normalized.slice(normalized.indexOf('\n') + 1);
  const blocks = body.split(/\n\n+/);
  const cues: Cue[] = [];
  let autoIndex = 0;

  for (const block of blocks) {
    const useful = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('NOTE'));

    if (useful.length === 0) continue;

    const timingIndex = useful.findIndex((l) => l.includes('-->'));
    if (timingIndex === -1) continue;

    const id = timingIndex > 0 ? useful[0] : undefined;
    const timingLine = useful[timingIndex];
    const textLines = useful.slice(timingIndex + 1);
    const times = timingLine.split('-->').map((p) => p.trim().split(/\s+/)[0]);
    if (times.length < 2) continue;

    const start = parseVttTimestamp(times[0]);
    const end = parseVttTimestamp(times[1]);
    const text = textLines.join(' ').trim();
    const cueId = id || text || `cue-${autoIndex++}`;

    cues.push({
      id: cueId,
      start,
      end,
      text: text || undefined,
    });
  }

  return cues;
}

export function parseVttTimestamp(value: string): number {
  const parts = value.trim().split(':');
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return Number(h) * 3600 + Number(m) * 60 + Number(s);
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return Number(m) * 60 + Number(s);
  }
  return Number(value);
}
