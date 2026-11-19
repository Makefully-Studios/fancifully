import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Window } from 'happy-dom';
import { AudioBus } from '../src/audio/AudioBus.ts';
import { ReadAloudPlayer } from '../src/audio/ReadAloudPlayer.ts';

describe('ReadAloudPlayer completion', () => {
  it('fires onComplete when the queue drains, not after stop', async () => {
    const window = new Window();
    (globalThis as { Audio?: unknown; document?: Document }).Audio = window.Audio;
    (globalThis as { document?: Document }).document = window.document as unknown as Document;

    const bus = new AudioBus();
    const player = new ReadAloudPlayer(bus);
    let completes = 0;
    player.onComplete(() => {
      completes += 1;
    });

    await player.playSequence([]);
    assert.equal(completes, 0);

    player.stop();
    assert.equal(completes, 0);
    assert.equal(player.isPlaying(), false);
    player.destroy();
  });
});
