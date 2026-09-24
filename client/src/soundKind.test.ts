import { describe, expect, it } from 'vitest';
import { soundKind } from './soundKind.js';

describe('soundKind', () => {
  it.each([
    ['', 'tone'],
    ['http://localhost:3001/uploads/sounds/3f2a.mp3', 'file'],
    ['https://example.com/sfx/horn.mp3', 'link'],
    ['https://www.youtube.com/watch?v=a1Y73sPHKxw', 'youtube'],
  ])('classifies %s as %s', (url, kind) => {
    expect(soundKind({ url })).toBe(kind);
  });
});
