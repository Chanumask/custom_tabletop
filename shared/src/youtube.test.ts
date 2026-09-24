import { describe, expect, it } from 'vitest';
import { isHttpUrl, parseYouTubeTime, parseYouTubeUrl } from './youtube.js';

describe('parseYouTubeUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ', 0],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=42', 'dQw4w9WgXcQ', 42],
    ['https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ', 'dQw4w9WgXcQ', 0],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ', 0],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ', 0],
    ['https://youtu.be/dQw4w9WgXcQ?t=1m30s', 'dQw4w9WgXcQ', 90],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ', 0],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ?start=7', 'dQw4w9WgXcQ', 7],
    ['  https://youtu.be/dQw4w9WgXcQ  ', 'dQw4w9WgXcQ', 0],
  ])('recognizes %s', (url, videoId, startSeconds) => {
    expect(parseYouTubeUrl(url)).toEqual({ videoId, startSeconds });
  });

  it.each([
    ['https://example.com/sound.mp3'],
    ['https://www.youtube.com/'],
    ['https://www.youtube.com/watch?v=tooshort'],
    ['https://www.youtube.com/playlist?list=PL123'],
    ['https://notyoutube.com/watch?v=dQw4w9WgXcQ'],
    ['ftp://youtu.be/dQw4w9WgXcQ'],
    ['not a url'],
  ])('does not treat %s as a YouTube clip', (url) => {
    expect(parseYouTubeUrl(url)).toBeNull();
  });
});

describe('parseYouTubeTime', () => {
  it.each([
    [null, 0],
    ['', 0],
    ['95', 95],
    ['95s', 95],
    ['2m', 120],
    ['1h2m3s', 3723],
    ['garbage', 0],
  ])('parses %s as %i seconds', (raw, seconds) => {
    expect(parseYouTubeTime(raw)).toBe(seconds);
  });
});

describe('isHttpUrl', () => {
  it('accepts http(s) and rejects everything else', () => {
    expect(isHttpUrl('https://example.com/a.mp3')).toBe(true);
    expect(isHttpUrl('http://localhost:3001/uploads/sounds/x.ogg')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('data:audio/mp3;base64,AAAA')).toBe(false);
    expect(isHttpUrl('sound.mp3')).toBe(false);
  });
});
