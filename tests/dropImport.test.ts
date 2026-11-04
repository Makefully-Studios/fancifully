import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyFile,
  extensionOf,
  familyFromFilename,
  uniqueFamily,
} from '../src/editor/dropImport.ts';

describe('dropImport', () => {
  it('classifies fonts and images by extension and mime', () => {
    assert.equal(classifyFile(new File([], 'Story.woff2', { type: '' })), 'font');
    assert.equal(classifyFile(new File([], 'x.ttf', { type: 'font/ttf' })), 'font');
    assert.equal(classifyFile(new File([], 'art.png', { type: 'image/png' })), 'image');
    assert.equal(classifyFile(new File([], 'note.txt', { type: 'text/plain' })), 'text');
    assert.equal(classifyFile(new File([], 'data.bin', { type: '' })), 'unknown');
  });

  it('derives font family names and unique suffixes', () => {
    assert.equal(familyFromFilename('Comic_Sans.ttf'), 'Comic Sans');
    assert.equal(extensionOf('a.b.woff2'), 'woff2');
    assert.equal(uniqueFamily('Kids', ['Kids', 'Kids 2']), 'Kids 3');
    assert.equal(uniqueFamily('Kids', ['Other']), 'Kids');
  });
});
