import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reportSpringrollProgress, type LoadProgress } from '../src/springroll/loading.ts';

describe('reportSpringrollProgress', () => {
  it('sends progress and loading to the SpringRoll container', () => {
    const sent: Array<{ event: string; data: unknown }> = [];
    const app = {
      container: {
        send(event: string, data?: unknown) {
          sent.push({ event, data });
        },
      },
    };

    const progress: LoadProgress = {
      stage: 'assets',
      progress: 0.5,
      count: 2,
      total: 4,
      detail: 'cover',
    };
    reportSpringrollProgress(app, progress);

    assert.deepEqual(sent[0], { event: 'progress', data: 0.5 });
    assert.equal(sent[1].event, 'loading');
    assert.deepEqual(sent[1].data, {
      stage: 'assets',
      progress: 0.5,
      count: 2,
      total: 4,
      detail: 'cover',
    });
  });

  it('clamps progress to 0–1', () => {
    const sent: number[] = [];
    reportSpringrollProgress(
      {
        container: {
          send(event: string, data?: unknown) {
            if (event === 'progress') sent.push(data as number);
          },
        },
      },
      { stage: 'complete', progress: 1.5 },
    );
    assert.equal(sent[0], 1);
  });
});
