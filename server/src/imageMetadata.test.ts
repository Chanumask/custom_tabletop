import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { inspectImage } from '@custom-tabletop/shared';
import {
  exifOrientation,
  jpegOrientation,
  orientationOnlyExif,
  stripImageMetadata,
} from './imageMetadata.js';
import {
  ADOBE_SEGMENT,
  ICC_SEGMENT,
  SCAN_DATA,
  SECRET,
  jpegWithMetadata,
  phoneExif,
  plainJpeg,
  png,
  pngChunk,
  pngWithMetadata,
  riff,
  riffChunk,
  vp8,
  vp8l,
  vp8x,
  webpWithMetadata,
} from './testImages.js';

const contains = (haystack: Buffer, needle: Buffer | string) =>
  haystack.indexOf(typeof needle === 'string' ? Buffer.from(needle, 'latin1') : needle) !== -1;

/** The chunk types of a PNG, in order. */
function pngChunks(bytes: Buffer): string[] {
  const types: string[] = [];
  for (let i = 8; i + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(i);
    types.push(bytes.toString('latin1', i + 4, i + 8));
    i += 12 + length;
  }
  return types;
}

/** The markers of a JPEG's segments up to its first scan. */
function jpegMarkers(bytes: Buffer): number[] {
  const markers: number[] = [];
  for (let i = 2; i + 4 <= bytes.length;) {
    const marker = bytes[i + 1]!;
    markers.push(marker);
    if (marker === 0xda) break;
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  return markers;
}

/** The chunk fourccs of a WebP, in order. */
function webpChunks(bytes: Buffer): string[] {
  const chunks: string[] = [];
  for (let i = 12; i + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(i + 4);
    chunks.push(bytes.toString('latin1', i, i + 4));
    i += 8 + size + (size & 1);
  }
  return chunks;
}

describe('EXIF orientation', () => {
  it('reads it from little- and big-endian EXIF', () => {
    expect(exifOrientation(phoneExif(6))).toBe(6);
    expect(exifOrientation(orientationOnlyExif(8))).toBe(8);
    expect(exifOrientation(orientationOnlyExif(1))).toBe(1);
  });

  it('gives up on anything that isn’t EXIF, or an out-of-range value', () => {
    expect(exifOrientation(Buffer.from('not exif at all'))).toBeNull();
    expect(exifOrientation(Buffer.alloc(0))).toBeNull();
    expect(exifOrientation(orientationOnlyExif(9))).toBeNull();
    // An IFD that claims more entries than there are bytes.
    const truncated = Buffer.from(orientationOnlyExif(3).subarray(0, 12));
    expect(exifOrientation(truncated)).toBeNull();
  });
});

describe('PNG', () => {
  it('drops text, EXIF, timestamps, unknown chunks and anything after the end', () => {
    const stripped = stripImageMetadata(pngWithMetadata(40, 30), 'png')!;
    expect(stripped).not.toBeNull();
    expect(contains(stripped, SECRET)).toBe(false);
    expect(pngChunks(stripped)).toEqual(['IHDR', 'sRGB', 'IDAT', 'IEND']);
    expect(inspectImage(stripped)).toMatchObject({ ok: true, type: 'png', width: 40, height: 30 });
  });

  it('keeps the image data byte for byte', () => {
    const plain = png(40, 30);
    expect(stripImageMetadata(plain, 'png')).toEqual(plain);
    const idat = plain.subarray(8 + 25, plain.length - 12);
    expect(contains(stripImageMetadata(pngWithMetadata(40, 30), 'png')!, idat)).toBe(true);
  });

  it('keeps which way up it goes, on its own, with a valid checksum', () => {
    const stripped = stripImageMetadata(pngWithMetadata(40, 30, 6), 'png')!;
    expect(pngChunks(stripped)).toEqual(['IHDR', 'eXIf', 'sRGB', 'IDAT', 'IEND']);
    const at = 8 + 25; // after the signature and IHDR
    const length = stripped.readUInt32BE(at);
    const data = stripped.subarray(at + 8, at + 8 + length);
    expect(exifOrientation(data)).toBe(6);
    expect(stripped.readUInt32BE(at + 8 + length)).toBe(
      crc32(stripped.subarray(at + 4, at + 8 + length)),
    );
  });

  it('refuses a PNG with no end, a chunk running past the file, or no header first', () => {
    const whole = png(10, 10);
    expect(stripImageMetadata(whole.subarray(0, whole.length - 12), 'png')).toBeNull();
    const overrun = Buffer.from(whole);
    overrun.writeUInt32BE(0x7fffffff, 8 + 25); // IDAT's length
    expect(stripImageMetadata(overrun, 'png')).toBeNull();
    const headerLater = Buffer.concat([
      whole.subarray(0, 8),
      pngChunk('sRGB', Buffer.from([0])),
      whole.subarray(8),
    ]);
    expect(stripImageMetadata(headerLater, 'png')).toBeNull();
  });
});

describe('JPEG', () => {
  it('drops EXIF, XMP, IPTC, comments, multi-picture data and the picture after the end', () => {
    const stripped = stripImageMetadata(jpegWithMetadata(64, 48), 'jpeg')!;
    expect(stripped).not.toBeNull();
    expect(contains(stripped, SECRET)).toBe(false);
    expect(contains(stripped, 'Exif')).toBe(false);
    // What decides how it looks stays: the colour profile, Adobe's colour
    // transform, the tables, the frame, the scan.
    expect(jpegMarkers(stripped)).toEqual([0xe2, 0xee, 0xdb, 0xc0, 0xc4, 0xda]);
    expect(contains(stripped, ICC_SEGMENT)).toBe(true);
    expect(contains(stripped, ADOBE_SEGMENT)).toBe(true);
    expect(stripped.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    expect(inspectImage(stripped)).toMatchObject({ ok: true, type: 'jpeg', width: 64, height: 48 });
  });

  it('copies the compressed scan untouched — stuffed bytes and restart markers too', () => {
    const stripped = stripImageMetadata(jpegWithMetadata(64, 48), 'jpeg')!;
    expect(contains(stripped, SCAN_DATA)).toBe(true);
  });

  it('leaves a JPEG without metadata exactly as it was', () => {
    const plain = plainJpeg(64, 48);
    expect(stripImageMetadata(plain, 'jpeg')).toEqual(plain);
  });

  it('keeps a progressive JPEG’s every scan and the tables between them', () => {
    const stripped = stripImageMetadata(jpegWithMetadata(64, 48, { progressive: true }), 'jpeg')!;
    const scans = stripped.toString('latin1').split(SCAN_DATA.toString('latin1')).length - 1;
    expect(scans).toBe(2);
    expect(contains(stripped, SECRET)).toBe(false);
  });

  it('keeps a sideways photo sideways — its orientation rebuilt on its own', () => {
    const stripped = stripImageMetadata(jpegWithMetadata(64, 48, { orientation: 6 }), 'jpeg')!;
    expect(jpegMarkers(stripped)[0]).toBe(0xe1);
    const exif = stripped.subarray(4 + 2 + 6, 4 + stripped.readUInt16BE(4));
    expect(exifOrientation(exif)).toBe(6);
    expect(contains(stripped, SECRET)).toBe(false);
  });

  it('tells which way up a JPEG goes', () => {
    expect(jpegOrientation(jpegWithMetadata(64, 48, { orientation: 6 }))).toBe(6);
    expect(
      jpegOrientation(stripImageMetadata(jpegWithMetadata(64, 48, { orientation: 8 }), 'jpeg')!),
    ).toBe(8);
    expect(jpegOrientation(plainJpeg(64, 48))).toBe(1);
  });

  it('puts the orientation after JFIF’s header, which has to come first', () => {
    const stripped = stripImageMetadata(
      jpegWithMetadata(64, 48, { orientation: 3, jfif: true }),
      'jpeg',
    )!;
    expect(jpegMarkers(stripped).slice(0, 2)).toEqual([0xe0, 0xe1]);
  });

  it('keeps a JPEG cut off mid-scan as far as it goes', () => {
    const plain = plainJpeg(64, 48);
    const cut = plain.subarray(0, plain.length - 4);
    expect(stripImageMetadata(cut, 'jpeg')).toEqual(cut);
  });

  it('refuses one whose segments don’t hold together, or with no frame', () => {
    const plain = plainJpeg(64, 48);
    const broken = Buffer.from(plain);
    broken.writeUInt16BE(0xfff0, 4); // the first segment's length
    expect(stripImageMetadata(broken, 'jpeg')).toBeNull();
    const noFrame = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 63, 0]),
      SCAN_DATA,
      Buffer.from([0xff, 0xd9]),
    ]);
    expect(stripImageMetadata(noFrame, 'jpeg')).toBeNull();
    expect(stripImageMetadata(Buffer.from([0xff, 0xd8, 0x00, 0x00]), 'jpeg')).toBeNull();
  });
});

describe('WebP', () => {
  it('drops EXIF, XMP and unknown chunks, and says so in its header', () => {
    const stripped = stripImageMetadata(webpWithMetadata(30, 20), 'webp')!;
    expect(stripped).not.toBeNull();
    expect(contains(stripped, SECRET)).toBe(false);
    expect(webpChunks(stripped)).toEqual(['VP8X', 'ICCP', 'ALPH', 'VP8L']);
    const flags = stripped[20]!;
    expect(flags & 0x08).toBe(0); // EXIF
    expect(flags & 0x04).toBe(0); // XMP
    expect(flags & 0x30).toBe(0x30); // ICC and alpha stay
    expect(stripped.readUInt32LE(4)).toBe(stripped.length - 8);
    expect(inspectImage(stripped)).toMatchObject({ ok: true, type: 'webp', width: 30, height: 20 });
  });

  it('leaves a simple WebP as it was', () => {
    for (const plain of [riff([vp8(30, 20)]), riff([vp8l(30, 20)])]) {
      expect(stripImageMetadata(plain, 'webp')).toEqual(plain);
    }
  });

  it('pads an odd last chunk whose pad byte is missing', () => {
    const odd = riff([vp8x(5, 5, 0x10), riffChunk('ALPH', Buffer.alloc(3, 1))]);
    const unpadded = Buffer.from(odd.subarray(0, odd.length - 1));
    unpadded.writeUInt32LE(unpadded.length - 8, 4);
    const stripped = stripImageMetadata(unpadded, 'webp')!;
    expect(stripped).toEqual(odd);
  });

  it('refuses one whose chunks run past the file, or with no image chunk first', () => {
    const whole = riff([vp8l(30, 20)]);
    const overrun = Buffer.from(whole);
    overrun.writeUInt32LE(0x7fffffff, 16);
    expect(stripImageMetadata(overrun, 'webp')).toBeNull();
    expect(stripImageMetadata(riff([riffChunk('EXIF', phoneExif(1))]), 'webp')).toBeNull();
  });
});
