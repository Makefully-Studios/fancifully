import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseVtt, parseVttTimestamp } from '../src/sync/parseVtt.ts';

describe('parseVtt', () => {
  it('parses cue ids and times', () => {
    const cues = parseVtt(`WEBVTT

w1
00:00:00.000 --> 00:00:00.600
Once

w2
00:00:00.600 --> 00:00:01.100
upon
`);
    assert.equal(cues.length, 2);
    assert.equal(cues[0].id, 'w1');
    assert.equal(cues[0].start, 0);
    assert.equal(cues[0].end, 0.6);
    assert.equal(cues[0].text, 'Once');
    assert.equal(cues[1].id, 'w2');
  });

  it('parses timestamps without hours', () => {
    assert.equal(parseVttTimestamp('01:02.500'), 62.5);
  });
});
