/**
 * Player profiles (docs/decisions.md, "Player profiles"): each player can
 * share one image — usually their character sheet — that only they and the
 * table's current host can see. The image itself never travels in
 * GameState or over the socket: it's uploaded and fetched over HTTP, with
 * the player's own secret token (server/src/profileImages.ts). GameState
 * only carries its `ProfileImage` description, and only to those two
 * (server/src/privacy.ts).
 *
 * `inspectImage` is shared so the join screen can say what's wrong with a
 * file before sending 10 MB, by exactly the rules the server applies.
 */

export type ProfileImageType = 'png' | 'jpeg' | 'webp';

export const PROFILE_IMAGE_FORMATS: Record<
  ProfileImageType,
  { mime: string; extension: string; label: string }
> = {
  png: { mime: 'image/png', extension: 'png', label: 'PNG' },
  jpeg: { mime: 'image/jpeg', extension: 'jpg', label: 'JPG' },
  webp: { mime: 'image/webp', extension: 'webp', label: 'WebP' },
};

/** What a file picker should offer. */
export const PROFILE_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';

/** Big enough for a scanned or photographed character sheet. */
export const PROFILE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** Pixel limits: a 600 dpi A4 scan (4960 × 7016) fits; an image that would
 * take gigabytes to display (a few KB of PNG can claim 50000 × 50000)
 * doesn't. */
export const PROFILE_IMAGE_MAX_SIDE = 16384;
export const PROFILE_IMAGE_MAX_PIXELS = 40_000_000;

/** A shared profile image, as its owner and the host see it in GameState. */
export interface ProfileImage {
  /** New with every upload — names the stored file, and tells a client its
   * copy is out of date. */
  id: string;
  type: ProfileImageType;
  width: number;
  height: number;
  /** Size as stored (location and other hidden data already removed). */
  bytes: number;
  /** When it was shared (ms since the epoch). */
  at: number;
}

export type ImageInspection =
  | { ok: true; type: ProfileImageType; width: number; height: number }
  | { ok: false; error: string };

export const PROFILE_IMAGE_EMPTY_ERROR = 'That file is empty.';
export const PROFILE_IMAGE_TOO_BIG_ERROR =
  'That image is over 10 MB. Save it smaller (a JPG is usually much smaller) and try again.';
export const PROFILE_IMAGE_TYPE_ERROR = 'That isn’t a PNG, JPG or WebP image.';
export const PROFILE_IMAGE_DAMAGED_ERROR =
  'That image looks damaged and couldn’t be read. Try saving it again.';

function tooManyPixels(width: number, height: number): string {
  return `That image is ${width} × ${height} pixels — too large to show. At most 40 megapixels (e.g. 5000 × 8000); scale it down and try again.`;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, prefix: readonly number[], at = 0): boolean {
  if (bytes.length < at + prefix.length) return false;
  return prefix.every((value, i) => bytes[at + i] === value);
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  let text = '';
  for (let i = at; i < at + length && i < bytes.length; i += 1) {
    text += String.fromCharCode(bytes[i]!);
  }
  return text;
}

const u16be = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;
const u32be = (b: Uint8Array, at: number) =>
  ((b[at]! << 24) >>> 0) + ((b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!);
const u16le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u24le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
const u32le = (b: Uint8Array, at: number) => (u24le(b, at) + (b[at + 3]! << 24)) >>> 0;

/** The format and size of a PNG, JPEG or WebP, read from its bytes — never
 * from a file name or a declared type, which say whatever the sender likes. */
export function sniffImage(
  bytes: Uint8Array,
): { type: ProfileImageType; width: number; height: number } | 'unknown' | 'damaged' {
  if (startsWith(bytes, PNG_SIGNATURE)) {
    // The first chunk must be IHDR (13 bytes): width, height.
    if (bytes.length < 33 || u32be(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== 'IHDR') {
      return 'damaged';
    }
    return { type: 'png', width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    const size = jpegSize(bytes);
    return size ? { type: 'jpeg', ...size } : 'damaged';
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    const size = webpSize(bytes);
    return size ? { type: 'webp', ...size } : 'damaged';
  }
  return 'unknown';
}

/** A JPEG's size, from its frame header (SOF): the segments before it are
 * walked one by one, each by its declared length. */
function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    while (bytes[i + 1] === 0xff) i += 1; // fill bytes
    const marker = bytes[i + 1]!;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // markers without a length
      continue;
    }
    // Scan data or the end of the image before any frame header.
    if (marker === 0xda || marker === 0xd9) return null;
    if (i + 4 > bytes.length) return null;
    const length = u16be(bytes, i + 2);
    if (length < 2 || i + 2 + length > bytes.length) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (length < 7) return null;
      return { height: u16be(bytes, i + 5), width: u16be(bytes, i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

/** A WebP's size, from its first chunk: VP8 (lossy), VP8L (lossless) or
 * VP8X (extended: animation, alpha, metadata). */
function webpSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  const chunk = ascii(bytes, 12, 4);
  const data = 20;
  if (chunk === 'VP8 ') {
    if (!startsWith(bytes, [0x9d, 0x01, 0x2a], data + 3)) return null;
    return {
      width: u16le(bytes, data + 6) & 0x3fff,
      height: u16le(bytes, data + 8) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    if (bytes[data] !== 0x2f) return null;
    const bits = u32le(bytes, data + 1);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return { width: u24le(bytes, data + 4) + 1, height: u24le(bytes, data + 7) + 1 };
  }
  return null;
}

/** Whether `bytes` may be shared as a profile image, and if so what it is. */
export function inspectImage(bytes: Uint8Array): ImageInspection {
  if (bytes.length === 0) return { ok: false, error: PROFILE_IMAGE_EMPTY_ERROR };
  if (bytes.length > PROFILE_IMAGE_MAX_BYTES) {
    return { ok: false, error: PROFILE_IMAGE_TOO_BIG_ERROR };
  }
  const sniffed = sniffImage(bytes);
  if (sniffed === 'unknown') return { ok: false, error: PROFILE_IMAGE_TYPE_ERROR };
  if (sniffed === 'damaged') return { ok: false, error: PROFILE_IMAGE_DAMAGED_ERROR };
  const { width, height } = sniffed;
  if (width < 1 || height < 1) return { ok: false, error: PROFILE_IMAGE_DAMAGED_ERROR };
  if (
    width > PROFILE_IMAGE_MAX_SIDE ||
    height > PROFILE_IMAGE_MAX_SIDE ||
    width * height > PROFILE_IMAGE_MAX_PIXELS
  ) {
    return { ok: false, error: tooManyPixels(width, height) };
  }
  return { ok: true, ...sniffed };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A `ProfileImage` from a saved table, or null if it isn't a valid one
 * (a save is only data: its id becomes a file name). */
export function normalizeProfileImage(value: unknown): ProfileImage | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, type, width, height, bytes, at } = value as Record<string, unknown>;
  const whole = (n: unknown, max: number): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= max;
  if (
    typeof id !== 'string' ||
    !UUID.test(id) ||
    (type !== 'png' && type !== 'jpeg' && type !== 'webp') ||
    !whole(width, PROFILE_IMAGE_MAX_SIDE) ||
    !whole(height, PROFILE_IMAGE_MAX_SIDE) ||
    !whole(bytes, PROFILE_IMAGE_MAX_BYTES) ||
    typeof at !== 'number' ||
    !Number.isFinite(at)
  ) {
    return null;
  }
  return { id, type, width, height, bytes, at };
}

/** "3.1 MB", "840 KB" — for showing a profile's size. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
