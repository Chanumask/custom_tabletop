import { describe, expect, it } from 'vitest';
import { deriveNameFromUrl } from './soundName.js';

describe('deriveNameFromUrl', () => {
  it('derives a name from the last path segment, stripping the extension', () => {
    expect(deriveNameFromUrl('https://example.com/sounds/air-horn.mp3')).toBe('air horn');
  });

  it('decodes a URL-encoded segment', () => {
    expect(deriveNameFromUrl('https://example.com/sounds/drum%20roll.wav')).toBe('drum roll');
  });

  it('falls back to "Sound" for a URL with no path', () => {
    expect(deriveNameFromUrl('https://example.com')).toBe('Sound');
  });

  it('falls back to "Sound" for an unparseable URL', () => {
    expect(deriveNameFromUrl('not a url')).toBe('Sound');
  });

  it('handles a segment with no extension', () => {
    expect(deriveNameFromUrl('https://example.com/clips/laugh')).toBe('laugh');
  });
});
