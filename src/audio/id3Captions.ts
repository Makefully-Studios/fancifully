/**
 * Platypus-style ID3 SYLT / WebM cue extraction for closed captions.
 * Ports timedCueTracks helpers; timestamps are converted to Cue seconds.
 */

import jsmediatags from '@probityrules/jsmediatags';
import type { Cue } from '../schema/story.js';

export type TimedCue = {
  text: string;
  /** Start time; ID3 SYLT is typically milliseconds. */
  timeStamp: number;
  end?: number;
};

export type TimedCueTrack = {
  descriptor: string;
  contentType?: string;
  language?: string;
  synchronisedText: TimedCue[];
};

/** jsmediatags onSuccess payload (subset we care about). */
export type AudioTagResult = {
  type?: string;
  tags?: Record<string, unknown>;
};

type TagReaderInput = ArrayBuffer | Blob | string | Uint8Array;

type TagReader = {
  read: (
    data: TagReaderInput,
    callbacks: {
      onSuccess: (result: AudioTagResult) => void;
      onError: (error: unknown) => void;
    },
  ) => void;
};

/**
 * Browser jsmediatags registers Blob/XHR readers, but not ArrayBuffer.
 * Prefer Blob when FileReader exists; in Node prefer Buffer (not bare Uint8Array).
 */
function forTagReader(data: TagReaderInput): TagReaderInput {
  if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) {
    if (typeof Blob !== 'undefined' && typeof FileReader !== 'undefined') {
      return new Blob([data]);
    }
    const NodeBuffer = (globalThis as { Buffer?: { from: (d: ArrayBuffer) => Uint8Array } }).Buffer;
    if (NodeBuffer) {
      return NodeBuffer.from(data);
    }
    return new Uint8Array(data);
  }
  return data;
}

/** Read ID3 / WebM tags via `@probityrules/jsmediatags`. */
export function readAudioTags(
  data: ArrayBuffer | Blob | string,
  tagReader: TagReader = jsmediatags as unknown as TagReader,
): Promise<AudioTagResult> {
  return new Promise((resolve, reject) => {
    tagReader.read(forTagReader(data), {
      onSuccess: resolve,
      onError: reject,
    });
  });
}

/**
 * Normalize timed cue tracks from jsmediatags ID3 SYLT or WebM WEBVTT results
 * into a shared shape for captions.
 */
export function getTimedCueTracks(tagResult: AudioTagResult | null | undefined): TimedCueTrack[] {
  if (!tagResult?.tags) return [];

  const { type, tags } = tagResult;

  if (type === 'WebM' || tags.WEBVTT) {
    const raw = tags.WEBVTT;
    const list = raw == null ? [] : Array.isArray(raw) ? raw : [raw];

    return list
      .map((frame: { data?: Record<string, unknown>; description?: string }) => {
        const data = (frame?.data ?? frame) as {
          name?: string;
          kind?: string;
          language?: string;
          cues?: Array<{ text: string; timeStamp: number; end?: number }>;
        };
        return {
          descriptor: data.name || frame?.description || '',
          contentType: String(data.kind || '').toLowerCase(),
          language: data.language,
          synchronisedText: (data.cues || []).map(({ text, timeStamp, end }) => ({
            text,
            timeStamp,
            end,
          })),
        } satisfies TimedCueTrack;
      })
      .filter((track) => track.synchronisedText.length > 0);
  }

  const SYLT = tags.SYLT;
  if (!SYLT) return [];

  const list = Array.isArray(SYLT) ? SYLT : [SYLT];

  return list
    .map((frame: { data?: {
      descriptor?: string;
      contentType?: string;
      language?: string;
      synchronisedText?: TimedCue[];
    } }) => ({
      descriptor: frame.data?.descriptor || '',
      contentType: frame.data?.contentType,
      language: frame.data?.language,
      synchronisedText: frame.data?.synchronisedText || [],
    }))
    .filter((track) => track.synchronisedText.length > 0);
}

/**
 * Prefer captions / words descriptor, then transcription/lyrics content types.
 */
export function findCaptionsTrack(tracks: TimedCueTrack[]): TimedCueTrack | null {
  if (!tracks?.length) return null;

  return (
    tracks.find(({ descriptor }) => descriptor === 'captions' || descriptor === 'words')
    ?? tracks.find(
      ({ contentType }) => contentType === 'transcription' || contentType === 'captions',
    )
    ?? tracks.find(
      ({ contentType }) => contentType === 'lyrics' || contentType === 'subtitles',
    )
    ?? null
  );
}

/**
 * Convert a SYLT (or WebM) timed track to Fancifully `Cue[]` in **seconds**.
 * ID3 SYLT timestamps are milliseconds; `durationSec` sets the last cue end when
 * the track does not provide `end` / a following cue.
 */
export function syltToCues(track: TimedCueTrack, durationSec?: number): Cue[] {
  const texts = track.synchronisedText;
  if (!texts.length) return [];

  const durationMs =
    durationSec != null && Number.isFinite(durationSec) && durationSec > 0
      ? durationSec * 1000
      : undefined;

  return texts.map((item, index) => {
    const next = texts[index + 1];
    const startMs = Math.max(0, Number(item.timeStamp) || 0);
    const endMs = Math.max(
      startMs,
      item.end
        ?? next?.timeStamp
        ?? durationMs
        ?? startMs + 10_000,
    );
    return {
      id: `sylt-${index}`,
      start: startMs / 1000,
      end: endMs / 1000,
      text: item.text,
    };
  });
}

/**
 * Soft-fail helper: read tags and return caption cues, or `[]` on any failure.
 */
export async function extractCaptionCuesFromAudio(
  data: ArrayBuffer | Blob | string,
  durationSec?: number,
): Promise<Cue[]> {
  try {
    const tagResult = await readAudioTags(data);
    const track = findCaptionsTrack(getTimedCueTracks(tagResult));
    if (!track) return [];
    return syltToCues(track, durationSec);
  } catch {
    return [];
  }
}
