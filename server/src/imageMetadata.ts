import { crc32 } from 'node:zlib';
import type { ProfileImageType } from '@custom-tabletop/shared';

/**
 * Takes the hidden data out of a shared profile image before it's stored
 * (docs/decisions.md, "Player profiles"). A phone photo of a character
 * sheet carries where it was taken (GPS), the phone's make and serial, the
 * time, often an embedded preview of the uncropped original — none of which
 * the player meant to hand the host. Only the picture is kept: the image
 * data itself, its colour information (so it looks the same), and which way
 * up it goes (EXIF orientation, rebuilt on its own — a phone photo is
 * usually stored sideways and turned by that tag).
 *
 * This works on the file's structure (PNG chunks, JPEG segments, WebP
 * chunks) without decoding a pixel, so it's cheap, and the image data is
 * copied byte for byte. A file whose structure doesn't hold together
 * returns null, and isn't stored.
 */
export function stripImageMetadata(bytes: Uint8Array, type: ProfileImageType): Buffer | null {
  switch (type) {
    case 'png':
      return stripPng(bytes);
    case 'jpeg':
      return stripJpeg(bytes);
    case 'webp':
      return stripWebp(bytes);
  }
}

const u16be = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;
const u32be = (b: Uint8Array, at: number) =>
  ((b[at]! << 24) >>> 0) + ((b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!);
const u32le = (b: Uint8Array, at: number) =>
  (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;

function ascii(bytes: Uint8Array, at: number, length: number): string {
  return Buffer.from(bytes.subarray(at, at + length)).toString('latin1');
}

// ---- EXIF orientation ------------------------------------------------------

/** The orientation (1–8) in a TIFF-structured EXIF block, or null. */
export function exifOrientation(tiff: Uint8Array): number | null {
  if (tiff.length < 8) return null;
  const order = ascii(tiff, 0, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const little = order === 'II';
  const u16 = (at: number) => (little ? tiff[at]! | (tiff[at + 1]! << 8) : u16be(tiff, at));
  const u32 = (at: number) => (little ? u32le(tiff, at) : u32be(tiff, at));
  if (u16(2) !== 42) return null;
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const count = u16(ifd);
  for (let k = 0; k < count; k += 1) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > tiff.length) return null;
    if (u16(entry) === 0x0112) {
      // SHORT, one value, stored in the entry itself.
      const value = u16(entry + 2) === 3 ? u16(entry + 8) : 0;
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** A TIFF block holding nothing but an orientation tag. */
export function orientationOnlyExif(orientation: number): Buffer {
  return Buffer.from([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian, first IFD at 8
    0x00, 0x01, // one entry:
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]); // prettier-ignore
}

const EXIF_HEADER = Buffer.from('Exif\0\0', 'latin1');

// ---- PNG -------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Ancillary PNG chunks that describe the picture itself (transparency,
 * colour, pixel size, animation). Every other ancillary chunk — text,
 * EXIF, timestamps, anything unknown — is dropped; critical chunks
 * (capitalised) are always kept. */
const PNG_KEEP = new Set([
  'tRNS', 'cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB', 'cICP', 'mDCV', 'mDCv', 'cLLI', 'cLLi',
  'bKGD', 'hIST', 'pHYs', 'sPLT', 'acTL', 'fcTL', 'fdAT',
]); // prettier-ignore

function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

function stripPng(bytes: Uint8Array): Buffer | null {
  const kept: Buffer[] = [PNG_SIGNATURE];
  let orientation: number | null = null;
  let afterHeader = -1;
  let ended = false;
  let i = 8;
  while (i + 12 <= bytes.length) {
    const length = u32be(bytes, i);
    const type = ascii(bytes, i + 4, 4);
    const end = i + 12 + length;
    if (!/^[A-Za-z]{4}$/.test(type) || end > bytes.length) return null;
    const critical = type.charCodeAt(0) < 0x61; // an uppercase first letter
    if (type === 'eXIf') {
      let exif = bytes.subarray(i + 8, i + 8 + length);
      if (EXIF_HEADER.equals(Buffer.from(exif.subarray(0, 6)))) exif = exif.subarray(6);
      orientation ??= exifOrientation(exif);
    } else if (critical || PNG_KEEP.has(type)) {
      kept.push(Buffer.from(bytes.subarray(i, end)));
      if (type === 'IHDR') afterHeader = kept.length;
    }
    i = end;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  if (!ended || afterHeader !== 2) return null; // IHDR first, IEND last
  if (orientation !== null && orientation !== 1) {
    kept.splice(afterHeader, 0, pngChunk('eXIf', orientationOnlyExif(orientation)));
  }
  return Buffer.concat(kept);
}

// ---- JPEG ------------------------------------------------------------------

/** APPn segments that affect how the picture looks: JFIF (APP0), an ICC
 * colour profile (APP2 "ICC_PROFILE") and Adobe's colour transform
 * (APP14). Every other APPn — EXIF and XMP (APP1), Photoshop/IPTC (APP13),
 * multi-picture indexes, maker data — and comments are dropped. */
function keepJpegSegment(marker: number, payload: Uint8Array): boolean {
  if (marker === 0xfe) return false; // COM
  if (marker < 0xe0 || marker > 0xef) return true; // not metadata
  if (marker === 0xe0 || marker === 0xee) return true;
  if (marker === 0xe2) return ascii(payload, 0, 12) === 'ICC_PROFILE\0';
  return false;
}

/** From `from` inside entropy-coded scan data: where the next marker
 * starts, or -1 if the data runs to the end of the file. */
function nextMarker(bytes: Uint8Array, from: number): number {
  for (let k = from; k + 1 < bytes.length; k += 1) {
    if (bytes[k] !== 0xff) continue;
    const next = bytes[k + 1]!;
    // Stuffed 0xFF00, restart markers and fill bytes belong to the scan.
    if (next === 0x00 || (next >= 0xd0 && next <= 0xd7) || next === 0xff) continue;
    return k;
  }
  return -1;
}

function stripJpeg(bytes: Uint8Array): Buffer | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const kept: Buffer[] = [];
  let orientation: number | null = null;
  let sawFrame = false;
  let i = 2;
  for (;;) {
    if (i >= bytes.length) break; // no end marker: as far as it goes
    if (bytes[i] !== 0xff) return null;
    while (bytes[i + 1] === 0xff) i += 1; // fill bytes
    const marker = bytes[i + 1];
    if (marker === undefined) return null;
    if (marker === 0xd9) {
      // The end of the image. Anything after it (a phone's second
      // picture, a depth map, with metadata of their own) is left behind.
      kept.push(Buffer.from([0xff, 0xd9]));
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push(Buffer.from([0xff, marker]));
      i += 2;
      continue;
    }
    if (i + 4 > bytes.length) return null;
    const length = u16be(bytes, i + 2);
    const end = i + 2 + length;
    if (length < 2 || end > bytes.length) return null;
    const payload = bytes.subarray(i + 4, end);
    if (marker === 0xe1 && ascii(payload, 0, 6) === 'Exif\0\0') {
      orientation ??= exifOrientation(payload.subarray(6));
    }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      sawFrame = true;
    }
    if (keepJpegSegment(marker, payload)) {
      kept.push(Buffer.from(bytes.subarray(i, end)));
    }
    i = end;
    if (marker === 0xda) {
      // A scan: its compressed data runs to the next marker.
      if (!sawFrame) return null;
      const next = nextMarker(bytes, i);
      kept.push(Buffer.from(bytes.subarray(i, next === -1 ? bytes.length : next)));
      if (next === -1) break;
      i = next;
    }
  }
  if (!sawFrame) return null;
  if (orientation !== null && orientation !== 1) {
    const tiff = orientationOnlyExif(orientation);
    const app1 = Buffer.alloc(4);
    app1.writeUInt16BE(0xffe1, 0);
    app1.writeUInt16BE(2 + EXIF_HEADER.length + tiff.length, 2);
    // Right after JFIF's APP0 if there is one (it has to come first).
    const at = kept[0] && kept[0][1] === 0xe0 ? 1 : 0;
    kept.splice(at, 0, Buffer.concat([app1, EXIF_HEADER, tiff]));
  }
  return Buffer.concat([Buffer.from([0xff, 0xd8]), ...kept]);
}

/** Which way up a JPEG goes (its EXIF orientation, 1 if none) — browsers
 * turn a JPEG by it, so a photo stored 4000 × 3000 with orientation 6
 * shows as 3000 × 4000. */
export function jpegOrientation(bytes: Uint8Array): number {
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1]!;
    if (marker === 0xda || marker === 0xd9) break;
    const length = u16be(bytes, i + 2);
    const payload = bytes.subarray(i + 4, i + 2 + length);
    if (marker === 0xe1 && ascii(payload, 0, 6) === 'Exif  ') {
      return exifOrientation(payload.subarray(6)) ?? 1;
    }
    i += 2 + length;
  }
  return 1;
}

// ---- WebP ------------------------------------------------------------------

const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;
/** The chunks that make up the picture (image data, alpha, animation, the
 * colour profile). EXIF, XMP and anything unknown are dropped. */
const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);

function stripWebp(bytes: Uint8Array): Buffer | null {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    return null;
  }
  const riffEnd = Math.min(bytes.length, 8 + u32le(bytes, 4));
  const kept: Buffer[] = [];
  let i = 12;
  while (i + 8 <= riffEnd) {
    const fourcc = ascii(bytes, i, 4);
    const size = u32le(bytes, i + 4);
    const dataEnd = i + 8 + size;
    if (dataEnd > riffEnd) return null;
    // Chunks are padded to an even size (a missing last pad byte is let go).
    const end = Math.min(dataEnd + (size & 1), riffEnd);
    if (WEBP_KEEP.has(fourcc)) {
      const chunk = Buffer.from(bytes.subarray(i, end));
      if (size & 1 && end === dataEnd) {
        kept.push(chunk, Buffer.from([0]));
      } else {
        kept.push(chunk);
      }
    }
    i = end;
  }
  const first = kept[0];
  if (!first || !['VP8 ', 'VP8L', 'VP8X'].includes(ascii(first, 0, 4))) return null;
  if (ascii(first, 0, 4) === 'VP8X') {
    if (first.length < 18) return null;
    first[8] = first[8]! & ~(VP8X_EXIF | VP8X_XMP);
  }
  const body = Buffer.concat(kept);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}
