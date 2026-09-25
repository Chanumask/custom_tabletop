import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import {
  DEFAULT_STORAGE_POLICY,
  RateLimiter,
  pruneUploads,
  type StoragePolicy,
} from './uploadStorage.js';

// server/uploads — sibling to server/src, gitignored (server-local files,
// not source). Not committed, so a fresh checkout/restart starts empty —
// consistent with SessionStore's own in-memory, wiped-on-restart state.
// A deployment points this at a volume instead (UPLOADS_DIR, index.ts).
export const DEFAULT_UPLOADS_ROOT = path.join(import.meta.dirname, '..', 'uploads');

/** Uploads per client IP per window — generous for a game night, tight
 * enough that a script can't pour files in. */
const UPLOAD_RATE_LIMIT = 30;
const UPLOAD_RATE_WINDOW_MS = 10 * 60 * 1000;
/** How often stale uploads are swept (docs: uploadStorage.ts). */
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

export interface UploadRouteOptions {
  root?: string;
  policy?: StoragePolicy;
  /** File names a live session still uses — never pruned. */
  inUse?: () => ReadonlySet<string>;
  /** Uploads per client IP per window (default: 30 per 10 minutes). */
  rateLimit?: { limit: number; windowMs: number };
}

const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const SOUND_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
// Allowed mimetype -> the extension the stored file gets. The extension is
// derived from the (allowlisted) type, never taken from the client's own
// file name: `express.static` serves by extension, so "evil.html" declared
// as image/png must not end up stored — and served — as HTML.
const IMAGE_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const AUDIO_TYPES: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.webm',
  'audio/mp4': '.m4a',
};

function makeUpload(root: string, subdir: string, maxBytes: number, types: Record<string, string>) {
  const dir = path.join(root, subdir);
  fs.mkdirSync(dir, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${types[file.mimetype] ?? ''}`);
      },
    }),
    limits: { fileSize: maxBytes },
    fileFilter: (_req, file, cb) => {
      cb(null, file.mimetype in types);
    },
  });
}

/**
 * Mounts /uploads/images and /uploads/sounds (Milestone 8) — plain REST
 * endpoints for the actual file bytes, not socket events: multipart file
 * upload from an `<input type="file">` is what `fetch`/`FormData` are for,
 * not something to shoehorn into Socket.IO. The resulting URL is what a
 * client then registers into session state *separately*, over the socket
 * (`scene:update` for a map background, `sound:upload` for a soundboard
 * entry) — upload and "use this in my session" are deliberately two
 * different steps, the same as the map background URL field already
 * accepting any URL regardless of where it came from.
 */
export function registerUploadRoutes(app: Express, options: UploadRouteOptions = {}): () => void {
  const root = options.root ?? DEFAULT_UPLOADS_ROOT;
  const policy = options.policy ?? DEFAULT_STORAGE_POLICY;
  const inUse = options.inUse ?? (() => new Set<string>());
  fs.mkdirSync(root, { recursive: true });

  // Storage limits (uploadStorage.ts): the bytes on disk, re-measured on
  // every sweep and counted up as uploads land in between.
  let usedBytes = pruneUploads(root, policy, inUse());
  const limiter = new RateLimiter(
    options.rateLimit?.limit ?? UPLOAD_RATE_LIMIT,
    options.rateLimit?.windowMs ?? UPLOAD_RATE_WINDOW_MS,
  );
  const sweep = setInterval(() => {
    usedBytes = pruneUploads(root, policy, inUse());
    limiter.sweep();
  }, PRUNE_INTERVAL_MS);
  sweep.unref();

  const guard = (req: Request, res: Response, next: NextFunction) => {
    if (!limiter.allow(req.ip ?? 'unknown')) {
      res.status(429).json({ error: 'Too many uploads — wait a few minutes and try again.' });
      return;
    }
    if (usedBytes >= policy.maxBytes) {
      usedBytes = pruneUploads(root, policy, inUse());
    }
    if (usedBytes >= policy.maxBytes) {
      res
        .status(507)
        .json({ error: 'The server’s upload storage is full right now — try again later.' });
      return;
    }
    next();
  };
  const counted = (req: Request, _res: Response, next: NextFunction) => {
    usedBytes += req.file?.size ?? 0;
    next();
  };

  app.use(
    '/uploads',
    express.static(root, {
      setHeaders: (res) => {
        // Belt and braces with the extension rule above: never let a
        // browser second-guess an uploaded file's declared type.
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );

  const imageUpload = makeUpload(root, 'images', IMAGE_MAX_BYTES, IMAGE_TYPES);
  app.post('/uploads/images', guard, imageUpload.single('file'), counted, (req, res) => {
    if (!req.file) {
      res
        .status(400)
        .json({ error: 'No valid image file provided (png/jpeg/webp/gif, max 10MB).' });
      return;
    }
    res.json({ url: `/uploads/images/${req.file.filename}` });
  });

  const soundUpload = makeUpload(root, 'sounds', SOUND_MAX_BYTES, AUDIO_TYPES);
  app.post('/uploads/sounds', guard, soundUpload.single('file'), counted, (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No valid audio file provided (mp3/wav/ogg/webm, max 8MB).' });
      return;
    }
    res.json({ url: `/uploads/sounds/${req.file.filename}` });
  });

  // Must be registered after the routes, with all 4 params, per Express's
  // error-middleware convention — otherwise a too-large file's MulterError
  // falls through to Express's default 500 handler instead of a clean 400.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  });

  return () => clearInterval(sweep);
}
