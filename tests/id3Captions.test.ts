import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  findCaptionsTrack,
  getTimedCueTracks,
  syltToCues,
  type TimedCueTrack,
} from '../src/audio/id3Captions.ts';

describe('getTimedCueTracks / findCaptionsTrack', () => {
  it('normalizes ID3 SYLT frames and prefers captions descriptor', () => {
    const tracks = getTimedCueTracks({
      type: 'ID3',
      tags: {
        SYLT: {
          data: {
            descriptor: 'captions',
            contentType: 'transcription',
            language: 'eng',
            synchronisedText: [
              { text: 'Once upon a time', timeStamp: 0 },
              { text: 'there was a pup', timeStamp: 1480 },
            ],
          },
        },
      },
    });

    assert.equal(tracks.length, 1);
    assert.equal(tracks[0]?.descriptor, 'captions');
    const captions = findCaptionsTrack(tracks);
    assert.equal(captions?.synchronisedText[0]?.text, 'Once upon a time');
  });

  it('falls back to transcription contentType when descriptor is empty', () => {
    const tracks = getTimedCueTracks({
      type: 'ID3',
      tags: {
        SYLT: {
          data: {
            descriptor: '',
            contentType: 'transcription',
            synchronisedText: [{ text: 'Hi', timeStamp: 0 }],
          },
        },
      },
    });
    assert.ok(findCaptionsTrack(tracks));
  });

  it('returns empty when tags are missing', () => {
    assert.deepEqual(getTimedCueTracks(undefined), []);
    assert.deepEqual(getTimedCueTracks({ tags: {} }), []);
    assert.equal(findCaptionsTrack([]), null);
  });
});

describe('syltToCues', () => {
  const track: TimedCueTrack = {
    descriptor: 'captions',
    contentType: 'transcription',
    synchronisedText: [
      { text: 'Once upon a time, there was a family', timeStamp: 0 },
      { text: 'with three children who lived together', timeStamp: 1480 },
      { text: 'in a quiet little house.', timeStamp: 3000 },
    ],
  };

  it('converts ms timestamps to seconds and ends from next cue', () => {
    const cues = syltToCues(track, 5);
    assert.equal(cues.length, 3);
    assert.deepEqual(
      cues.map((c) => ({ start: c.start, end: c.end, text: c.text })),
      [
        {
          start: 0,
          end: 1.48,
          text: 'Once upon a time, there was a family',
        },
        {
          start: 1.48,
          end: 3,
          text: 'with three children who lived together',
        },
        {
          start: 3,
          end: 5,
          text: 'in a quiet little house.',
        },
      ],
    );
    assert.equal(cues[0]?.id, 'sylt-0');
  });

  it('uses a soft fallback end when duration is unknown', () => {
    const cues = syltToCues({
      descriptor: 'captions',
      synchronisedText: [{ text: 'Tap the house!', timeStamp: 0 }],
    });
    assert.equal(cues.length, 1);
    assert.equal(cues[0]?.start, 0);
    assert.equal(cues[0]?.end, 10);
    assert.equal(cues[0]?.text, 'Tap the house!');
  });

  it('honors explicit end when present', () => {
    const cues = syltToCues({
      descriptor: 'captions',
      synchronisedText: [{ text: 'A', timeStamp: 500, end: 900 }],
    });
    assert.equal(cues[0]?.start, 0.5);
    assert.equal(cues[0]?.end, 0.9);
  });
});
