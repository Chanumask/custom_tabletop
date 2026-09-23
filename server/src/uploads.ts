import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';

// server/uploads — sibling to server/src, gitignored (server-local files,
// not source). Not committed, so a fresh checkout/restart starts empty —
// consistent with SessionStore's own in-memory, wiped-on-restart state.
const UPLOADS_ROOT = path.join(import.meta.dirname, '..', 'uploads');

const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const SOUND_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
]);

function makeUpload(subdir: string, maxBytes: number, allowedTypes: Set<string>) {
  const dir = path.join(UPLOADS_ROOT, subdir);
  fs.mkdirSync(dir, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).slice(0, 10); // caps an absurd extension
        cb(null, `${randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: maxBytes },
    fileFilter: (_req, file, cb) => {
      cb(null, allowedTypes.has(file.mimetype));
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
export function registerUploadRoutes(app: Express): void {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
  app.use('/uploads', express.static(UPLOADS_ROOT));

  const imageUpload = makeUpload('images', IMAGE_MAX_BYTES, ALLOWED_IMAGE_TYPES);
  app.post('/uploads/images', imageUpload.single('file'), (req, res) => {
    if (!req.file) {
      res
        .status(400)
        .json({ error: 'No valid image file provided (png/jpeg/webp/gif, max 10MB).' });
      return;
    }
    res.json({ url: `/uploads/images/${req.file.filename}` });
  });

  const soundUpload = makeUpload('sounds', SOUND_MAX_BYTES, ALLOWED_AUDIO_TYPES);
  app.post('/uploads/sounds', soundUpload.single('file'), (req, res) => {
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
}
