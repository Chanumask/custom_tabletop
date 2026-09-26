import { describe, expect, it } from 'vitest';
import {
  PROFILE_IMAGE_DAMAGED_ERROR,
  PROFILE_IMAGE_EMPTY_ERROR,
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_TOO_BIG_ERROR,
  PROFILE_IMAGE_TYPE_ERROR,
  formatBytes,
  inspectImage,
  normalizeProfileImage,
} from './profileImage.js';

const bytes = (...parts: (number[] | string | Uint8Array)[]) => {
  const arrays = parts.map((part) =>
    typeof part === 'string'
      ? Uint8Array.from(part, (c) => c.charCodeAt(0))
      : part instanceof Uint8Array
        ? part
        : Uint8Array.from(part),
  );
  const out = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
  let at = 0;
  for (const a of arrays) {
    out.set(a, at);
    at += a.length;
  }
  return out;
};
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];

const pngOf = (width: number, height: number) =>
  bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    be32(13),
    'IHDR',
    be32(width),
    be32(height),
    [8, 6, 0, 0, 0],
    [0, 0, 0, 0], // (crc — not checked here)
  );

const jpegOf = (width: number, height: number, before: number[] = []) =>
  bytes(
    [0xff, 0xd8],
    before,
    [0xff, 0xdb, ...be16(67), 0, ...new Array<number>(64).fill(1)],
    [0xff, 0xc2, ...be16(11), 8, ...be16(height), ...be16(width), 1, 1, 0x11, 0],
    [0xff, 0xda, ...be16(8), 1, 1, 0, 0, 63, 0],
  );

const webp = (chunk: string, data: number[]) =>
  bytes('RIFF', le32(4 + 8 + data.length), 'WEBP', chunk, le32(data.length), data);

describe('inspectImage', () => {
  it('reads a PNG’s size from its header', () => {
    expect(inspectImage(pngOf(2480, 3508))).toEqual({
      ok: true,
      type: 'png',
      width: 2480,
      height: 3508,
    });
  });

  it('finds a JPEG’s frame past the segments before it (fill bytes too)', () => {
    const app1 = [0xff, 0xe1, ...be16(10), ...new Array<number>(8).fill(0x45)];
    expect(inspectImage(jpegOf(4032, 3024, [...app1, 0xff]))).toEqual({
      ok: true,
      type: 'jpeg',
      width: 4032,
      height: 3024,
    });
  });

  it('reads all three kinds of WebP', () => {
    // Frame tag, start code, then width and height (little-endian, 14 bits).
    const size = [0x20, 0x03, 0x58, 0x02]; // 800 × 600
    const lossy = webp('VP8 ', [
      0x10,
      0x02,
      0x00,
      0x9d,
      0x01,
      0x2a,
      ...size,
      ...new Array<number>(10).fill(0),
    ]);
    expect(inspectImage(lossy)).toMatchObject({ ok: true, type: 'webp', width: 800, height: 600 });

    const bits = (1000 - 1) | ((750 - 1) << 14);
    const lossless = webp('VP8L', [0x2f, ...le32(bits), 0, 0, 0, 0, 0]);
    expect(inspectImage(lossless)).toMatchObject({ width: 1000, height: 750 });

    const extended = webp('VP8X', [0x10, 0, 0, 0, ...le24(4095), ...le24(2047)]);
    expect(inspectImage(extended)).toMatchObject({ width: 4096, height: 2048 });
  });

  it('refuses what isn’t a PNG, JPG or WebP — whatever it’s called', () => {
    expect(inspectImage(bytes('GIF89a', new Array<number>(40).fill(0)))).toEqual({
      ok: false,
      error: PROFILE_IMAGE_TYPE_ERROR,
    });
    expect(inspectImage(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toMatchObject({
      error: PROFILE_IMAGE_TYPE_ERROR,
    });
    expect(inspectImage(new Uint8Array(0))).toMatchObject({ error: PROFILE_IMAGE_EMPTY_ERROR });
  });

  it('calls a file that starts right but doesn’t hold together damaged', () => {
    expect(inspectImage(pngOf(10, 10).subarray(0, 20))).toMatchObject({
      error: PROFILE_IMAGE_DAMAGED_ERROR,
    });
    expect(inspectImage(pngOf(0, 10))).toMatchObject({ error: PROFILE_IMAGE_DAMAGED_ERROR });
    // A JPEG whose segment claims more bytes than there are.
    expect(inspectImage(bytes([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2]))).toMatchObject({
      error: PROFILE_IMAGE_DAMAGED_ERROR,
    });
    // A JPEG whose scan starts before any frame header.
    expect(inspectImage(bytes([0xff, 0xd8, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0]))).toMatchObject({
      error: PROFILE_IMAGE_DAMAGED_ERROR,
    });
    expect(inspectImage(webp('VP8 ', new Array<number>(20).fill(0)))).toMatchObject({
      error: PROFILE_IMAGE_DAMAGED_ERROR,
    });
  });

  it('refuses images too large to show, however small the file', () => {
    const huge = inspectImage(pngOf(50000, 50000));
    expect(huge.ok).toBe(false);
    expect(!huge.ok && huge.error).toContain('50000 × 50000');
    expect(inspectImage(pngOf(8000, 6000)).ok).toBe(false); // 48 megapixels
    expect(inspectImage(pngOf(20000, 10)).ok).toBe(false); // too wide
    expect(inspectImage(pngOf(4960, 7016)).ok).toBe(true); // an A4 scan at 600 dpi
  });

  it('refuses a file over 10 MB', () => {
    const big = new Uint8Array(PROFILE_IMAGE_MAX_BYTES + 1);
    big.set(pngOf(100, 100));
    expect(inspectImage(big)).toEqual({ ok: false, error: PROFILE_IMAGE_TOO_BIG_ERROR });
  });
});

describe('normalizeProfileImage', () => {
  const valid = {
    id: '0b6f3c1e-8f0a-4c5e-9d2b-3a1f7e6c5d4b',
    type: 'png',
    width: 2480,
    height: 3508,
    bytes: 3_100_000,
    at: 1_790_000_000_000,
  };

  it('keeps a valid one', () => {
    expect(normalizeProfileImage(valid)).toEqual(valid);
  });

  it('drops anything else — its id becomes a file name', () => {
    expect(normalizeProfileImage(null)).toBeNull();
    expect(normalizeProfileImage({ ...valid, id: '../../etc/passwd' })).toBeNull();
    expect(normalizeProfileImage({ ...valid, id: valid.id.toUpperCase() })).toBeNull();
    expect(normalizeProfileImage({ ...valid, type: 'gif' })).toBeNull();
    expect(normalizeProfileImage({ ...valid, width: 0 })).toBeNull();
    expect(normalizeProfileImage({ ...valid, bytes: 1.5 })).toBeNull();
    expect(normalizeProfileImage({ ...valid, at: 'yesterday' })).toBeNull();
  });
});

describe('formatBytes', () => {
  it('reads like a file size', () => {
    expect(formatBytes(3_250_000)).toBe('3.1 MB');
    expect(formatBytes(840 * 1024)).toBe('840 KB');
    expect(formatBytes(12)).toBe('1 KB');
  });
});
