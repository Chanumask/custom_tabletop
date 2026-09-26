import { crc32, deflateSync } from 'node:zlib';

/**
 * Test-only image files (not itself a test file), built byte by byte so the
 * tests know exactly what's inside: real structure, the kinds of hidden
 * data a phone or an editor leaves in (GPS, a camera serial, comments,
 * a second picture after the first), and recognizable marker text to look
 * for afterwards. The image data itself is only structurally real — the
 * server never decodes pixels (imageMetadata.ts), and the end-to-end test
 * covers what browsers make of it.
 */

/** Text planted in metadata, to prove it's gone after stripping. */
export const SECRET = 'SECRET-GPS-52.5200N-13.4050E';

function u32be(value: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(value >>> 0, 0);
  return b;
}
function u16be(value: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(value, 0);
  return b;
}
function u32le(value: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value >>> 0, 0);
  return b;
}

/** A little-endian TIFF/EXIF block: orientation, plus a GPS pointer and a
 * camera serial as ASCII — what a phone photo carries. */
export function phoneExif(orientation: number): Buffer {
  const serial = Buffer.from(`${SECRET}\0`, 'latin1');
  const entries = 3;
  const ifdSize = 2 + entries * 12 + 4;
  const serialAt = 8 + ifdSize;
  const entry = (tag: number, type: number, count: number, value: Buffer) =>
    Buffer.concat([
      Buffer.from([tag & 0xff, tag >> 8, type & 0xff, type >> 8]),
      u32le(count),
      value,
    ]);
  return Buffer.concat([
    Buffer.from('II*\0', 'latin1'),
    u32le(8),
    Buffer.from([entries, 0]),
    entry(0x0112, 3, 1, Buffer.from([orientation, 0, 0, 0])), // orientation
    entry(0xa431, 2, serial.length, u32le(serialAt)), // BodySerialNumber
    entry(0x8825, 4, 1, u32le(serialAt)), // GPSInfo pointer
    u32le(0),
    serial,
  ]);
}

// ---- PNG -------------------------------------------------------------------

export function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'latin1');
  return Buffer.concat([
    u32be(data.length),
    typeBytes,
    data,
    u32be(crc32(Buffer.concat([typeBytes, data]))),
  ]);
}

export function pngHeader(width: number, height: number): Buffer {
  return pngChunk(
    'IHDR',
    Buffer.concat([u32be(width), u32be(height), Buffer.from([8, 6, 0, 0, 0])]),
  );
}

/** A real, decodable RGBA PNG (a plain colour), with optional extra
 * chunks before its image data and anything after its end. */
export function png(
  width: number,
  height: number,
  options: { before?: Buffer[]; after?: Buffer } = {},
): Buffer {
  const row = Buffer.alloc(1 + width * 4, 0x80);
  row[0] = 0; // filter: none
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngHeader(width, height),
    ...(options.before ?? []),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
    options.after ?? Buffer.alloc(0),
  ]);
}

/** A PNG the way an editor or phone saves it: text, EXIF, a timestamp. */
export function pngWithMetadata(width: number, height: number, orientation = 1): Buffer {
  return png(width, height, {
    before: [
      pngChunk('sRGB', Buffer.from([0])),
      pngChunk('tEXt', Buffer.from(`Comment\0${SECRET}`, 'latin1')),
      pngChunk('iTXt', Buffer.from(`XML:com.adobe.xmp\0\0\0\0\0${SECRET}`, 'latin1')),
      pngChunk('eXIf', phoneExif(orientation)),
      pngChunk('tIME', Buffer.from([0x07, 0xea, 9, 26, 12, 0, 0])),
      pngChunk('prVt', Buffer.from(SECRET, 'latin1')), // unknown private chunk
    ],
    after: Buffer.from(SECRET, 'latin1'),
  });
}

// ---- JPEG ------------------------------------------------------------------

function segment(marker: number, payload: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0xff, marker]), u16be(payload.length + 2), payload]);
}

/** Compressed scan data, including what must survive untouched: a stuffed
 * 0xFF00 and a restart marker. */
export const SCAN_DATA = Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0x9a]);

const FRAME = (width: number, height: number, marker = 0xc0) =>
  segment(
    marker,
    Buffer.concat([Buffer.from([8]), u16be(height), u16be(width), Buffer.from([1, 1, 0x11, 0])]),
  );
const QUANT = segment(0xdb, Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 1)]));
const HUFFMAN = segment(0xc4, Buffer.concat([Buffer.from([0]), Buffer.alloc(16, 0)]));
const SCAN = segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0]));
export const ICC_SEGMENT = segment(
  0xe2,
  Buffer.concat([Buffer.from('ICC_PROFILE\0', 'latin1'), Buffer.from([1, 1]), Buffer.alloc(8, 7)]),
);
export const ADOBE_SEGMENT = segment(
  0xee,
  Buffer.concat([Buffer.from('Adobe', 'latin1'), Buffer.from([0, 100, 0, 0, 0, 0, 1])]),
);
const JFIF_SEGMENT = segment(
  0xe0,
  Buffer.concat([Buffer.from('JFIF\0', 'latin1'), Buffer.from([1, 1, 0, 0, 1, 0, 1, 0, 0])]),
);

/** A JPEG as a phone saves it: EXIF with GPS and orientation, XMP, IPTC,
 * a comment, a multi-picture index, and a second picture after the end. */
export function jpegWithMetadata(
  width: number,
  height: number,
  options: { orientation?: number; jfif?: boolean; progressive?: boolean } = {},
): Buffer {
  const scans = options.progressive
    ? // Progressive: several scans, tables between them.
      [SCAN, SCAN_DATA, HUFFMAN, SCAN, SCAN_DATA]
    : [SCAN, SCAN_DATA];
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    ...(options.jfif ? [JFIF_SEGMENT] : []),
    segment(
      0xe1,
      Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), phoneExif(options.orientation ?? 1)]),
    ),
    segment(
      0xe1,
      Buffer.from(`http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>${SECRET}</x:xmpmeta>`, 'latin1'),
    ),
    ICC_SEGMENT,
    segment(0xe2, Buffer.from(`MPF\0${SECRET}`, 'latin1')),
    segment(0xed, Buffer.from(`Photoshop 3.0\0${SECRET}`, 'latin1')),
    ADOBE_SEGMENT,
    segment(0xfe, Buffer.from(SECRET, 'latin1')),
    QUANT,
    FRAME(width, height, options.progressive ? 0xc2 : 0xc0),
    HUFFMAN,
    ...scans,
    Buffer.from([0xff, 0xd9]),
    // The "second picture" a phone appends, metadata and all.
    Buffer.from([0xff, 0xd8]),
    segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), phoneExif(1)])),
    Buffer.from([0xff, 0xd9]),
  ]);
}

/** The same JPEG with nothing but the picture. */
export function plainJpeg(width: number, height: number): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    QUANT,
    FRAME(width, height),
    HUFFMAN,
    SCAN,
    SCAN_DATA,
    Buffer.from([0xff, 0xd9]),
  ]);
}

// ---- WebP ------------------------------------------------------------------

export function riffChunk(fourcc: string, data: Buffer): Buffer {
  const pad = data.length & 1 ? Buffer.from([0]) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(fourcc, 'latin1'), u32le(data.length), data, pad]);
}

export function riff(chunks: Buffer[]): Buffer {
  const body = Buffer.concat(chunks);
  return Buffer.concat([
    Buffer.from('RIFF', 'latin1'),
    u32le(4 + body.length),
    Buffer.from('WEBP', 'latin1'),
    body,
  ]);
}

/** Lossless image data of the given size (only its header is real). */
export function vp8l(width: number, height: number): Buffer {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  return riffChunk('VP8L', Buffer.concat([Buffer.from([0x2f]), u32le(bits), Buffer.alloc(5, 9)]));
}

/** Lossy image data of the given size (only its header is real). */
export function vp8(width: number, height: number): Buffer {
  const dims = Buffer.alloc(4);
  dims.writeUInt16LE(width, 0);
  dims.writeUInt16LE(height, 2);
  return riffChunk(
    'VP8 ',
    Buffer.concat([Buffer.from([0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a]), dims, Buffer.alloc(7, 3)]),
  );
}

export function vp8x(width: number, height: number, flags: number): Buffer {
  const data = Buffer.alloc(10);
  data[0] = flags;
  data.writeUIntLE(width - 1, 4, 3);
  data.writeUIntLE(height - 1, 7, 3);
  return riffChunk('VP8X', data);
}

/** An extended WebP with EXIF and XMP (flags set), an ICC profile, alpha,
 * and an unknown chunk. */
export function webpWithMetadata(width: number, height: number): Buffer {
  return riff([
    vp8x(width, height, 0x20 | 0x10 | 0x08 | 0x04), // ICC, alpha, EXIF, XMP
    riffChunk('ICCP', Buffer.alloc(12, 5)),
    riffChunk('ALPH', Buffer.alloc(7, 1)), // odd size: padded
    vp8l(width, height),
    riffChunk('EXIF', phoneExif(1)),
    riffChunk('XMP ', Buffer.from(`<x:xmpmeta>${SECRET}</x:xmpmeta>`, 'latin1')),
    riffChunk('SeCr', Buffer.from(SECRET, 'latin1')),
  ]);
}
