import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import {
  PROFILE_IMAGE_DAMAGED_ERROR,
  PROFILE_IMAGE_EMPTY_ERROR,
  PROFILE_IMAGE_FORMATS,
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_TOO_BIG_ERROR,
  PROFILE_IMAGE_TYPE_ERROR,
  inspectImage,
  type ProfileImage,
} from '@custom-tabletop/shared';
import type { SessionStore } from './sessionStore.js';
import { RateLimiter } from './uploadStorage.js';
import { jpegOrientation, stripImageMetadata } from './imageMetadata.js';

/**
 * Player profiles (docs/decisions.md, "Player profiles"): one image per
 * player, seen only by that player and whoever is host right now.
 *
 * Unlike maps and sounds (uploads.ts), these are never public files: they
 * live outside the `/uploads` folder, and the only way to one is this route,
 * which asks every request who it's from — the player's id and their secret
 * token (the same one their `session:join` presents), checked against the
 * table. There is no link to a profile image that works on its own.
 *
 *   PUT    /api/profile-image           share or replace your own
 *   DELETE /api/profile-image           withdraw your own
 *   GET    /api/profile-image/:playerId yours, or anyone's if you're host
 *
 * Every request carries `X-Table` and `X-Player` (URI-encoded) and
 * `Authorization: Bearer <player token>` — headers, never the URL, so the
 * token can't end up in a proxy's access log or the browser's history.
 */
export const PROFILE_IMAGE_ROUTE = '/api/profile-image';

export interface ProfileImagePolicy {
  /** All profile images together may take at most this much disk. */
  maxBytes: number;
  /** A file no table uses is only swept once it's at least this old. */
  minAgeMs: number;
}

export const DEFAULT_PROFILE_IMAGE_POLICY: ProfileImagePolicy = {
  maxBytes: 1024 * 1024 * 1024, // 1 GB — a hundred full tables
  minAgeMs: 10 * 60 * 1000,
};

/** Shares and withdrawals per client IP per window; views are looser. */
const DEFAULT_UPLOAD_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 };
const DEFAULT_VIEW_LIMIT = { limit: 300, windowMs: 10 * 60 * 1000 };
/** Uploads read into memory at once (each up to 10 MB). */
const DEFAULT_MAX_CONCURRENT_UPLOADS = 3;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

const NOT_AT_TABLE_ERROR = 'You’re not at this table any more — rejoin it and try again.';
const HOST_ONLY_ERROR = 'Only the host can see other players’ profiles.';
const NO_PROFILE_ERROR = 'There’s no profile shared.';
const BUSY_ERROR = 'The server is busy with other uploads — try again in a moment.';
const FULL_ERROR = 'The server’s profile storage is full right now — try again later.';
const RATE_ERROR = 'Too many uploads — wait a few minutes and try again.';
const BROKEN_UPLOAD_ERROR = 'The upload didn’t arrive in one piece — try again.';
const SAVE_FAILED_ERROR = 'Couldn’t store your profile on the server — try again.';

const FILE_NAME = /^([0-9a-f-]{36})\.(png|jpg|webp)$/;
const TEMP_NAME = /^\.[0-9a-f-]{36}\.tmp$/;

/** The profile images on disk: `<id>.<ext>`, one per shared image. */
export class ProfileImageStorage {
  readonly dir: string;
  /** Bytes on disk: measured by every sweep, kept up to date in between. */
  usedBytes = 0;

  constructor(dir: string) {
    this.dir = path.resolve(dir);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  pathOf(image: Pick<ProfileImage, 'id' | 'type'>): string {
    return path.join(this.dir, `${image.id}.${PROFILE_IMAGE_FORMATS[image.type].extension}`);
  }

  has(image: Pick<ProfileImage, 'id' | 'type'>): boolean {
    return fs.existsSync(this.pathOf(image));
  }

  /** Writes a new image in full before it appears under its name, so a
   * crash mid-write never leaves half a picture behind a real name. */
  async write(image: ProfileImage, bytes: Buffer): Promise<void> {
    const temp = path.join(this.dir, `.${image.id}.tmp`);
    try {
      await fs.promises.writeFile(temp, bytes, { flag: 'wx' });
      await fs.promises.rename(temp, this.pathOf(image));
      this.usedBytes += bytes.length;
    } catch (error) {
      await fs.promises.rm(temp, { force: true }).catch(() => {});
      throw error;
    }
  }

  remove(image: ProfileImage): void {
    this.usedBytes = Math.max(0, this.usedBytes - image.bytes);
    fs.rm(this.pathOf(image), { force: true }, (error) => {
      if (error) console.error(`[profiles] couldn't delete ${image.id}:`, error);
    });
  }

  /** Deletes what no table uses any more (a crash between storing an image
   * and saving its table, a write that failed half way) once it's old
   * enough not to be an upload in progress. Returns the bytes that stay. */
  sweep(inUse: ReadonlySet<string>, minAgeMs: number, now = Date.now()): number {
    let kept = 0;
    let removed = 0;
    for (const entry of fs.readdirSync(this.dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const image = FILE_NAME.exec(entry.name);
      if (!image && !TEMP_NAME.test(entry.name)) continue; // not ours
      const filePath = path.join(this.dir, entry.name);
      const stat = fs.statSync(filePath, { throwIfNoEntry: false });
      if (!stat) continue;
      if ((image && inUse.has(image[1]!)) || now - stat.mtimeMs < minAgeMs) {
        kept += stat.size;
        continue;
      }
      fs.rmSync(filePath, { force: true });
      removed += 1;
    }
    if (removed > 0) console.log(`[profiles] removed ${removed} unused file(s)`);
    this.usedBytes = kept;
    return kept;
  }
}

export interface ProfileImageRouteOptions {
  storage: ProfileImageStorage;
  sessions: SessionStore;
  /** A player's profile image changed: tell them and the host. */
  onChange: (sessionId: string, playerId: string) => void;
  policy?: ProfileImagePolicy;
  uploadLimit?: { limit: number; windowMs: number };
  viewLimit?: { limit: number; windowMs: number };
  maxConcurrentUploads?: number;
}

interface Requester {
  sessionId: string;
  playerId: string;
}

/** One `X-…` header, URI-decoded; null if missing or malformed. */
function header(req: Request, name: string): string | null {
  const raw = req.get(name);
  if (!raw || raw.length > 300) return null;
  try {
    const value = decodeURIComponent(raw).trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function fail(res: Response, status: number, error: string): void {
  res.status(status).json({ error });
}

/** Mounts the profile image routes. Returns a function that stops its
 * periodic sweep. The first sweep is the caller's, once saved tables are
 * back in memory — before that, every stored image would look unused. */
export function registerProfileImageRoutes(
  app: Express,
  options: ProfileImageRouteOptions,
): () => void {
  const { storage, sessions, onChange } = options;
  const policy = options.policy ?? DEFAULT_PROFILE_IMAGE_POLICY;
  const maxConcurrent = options.maxConcurrentUploads ?? DEFAULT_MAX_CONCURRENT_UPLOADS;
  const uploadLimit = options.uploadLimit ?? DEFAULT_UPLOAD_LIMIT;
  const viewLimit = options.viewLimit ?? DEFAULT_VIEW_LIMIT;
  const uploads = new RateLimiter(uploadLimit.limit, uploadLimit.windowMs);
  const views = new RateLimiter(viewLimit.limit, viewLimit.windowMs);

  const sweep = () => storage.sweep(sessions.referencedProfileImages(), policy.minAgeMs);
  const timer = setInterval(() => {
    sweep();
    uploads.sweep();
    views.sweep();
  }, SWEEP_INTERVAL_MS);
  timer.unref();

  const limited = (limiter: RateLimiter) => (req: Request, res: Response, next: NextFunction) => {
    if (!limiter.allow(req.ip ?? 'unknown')) {
      fail(res, 429, RATE_ERROR);
      return;
    }
    next();
  };

  /** Who's asking: a player at that table, proven by their token. */
  const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const sessionId = header(req, 'X-Table');
    const playerId = header(req, 'X-Player');
    const token = /^Bearer (\S{1,200})$/.exec(req.get('Authorization') ?? '')?.[1];
    if (!sessionId || !playerId || !token || !sessions.verifyPlayer(sessionId, playerId, token)) {
      fail(res, 401, NOT_AT_TABLE_ERROR);
      return;
    }
    res.locals.requester = { sessionId, playerId } satisfies Requester;
    next();
  };

  // Checked before a byte of the body is read: how many uploads are in
  // memory right now, and whether there's room on disk for this one.
  let inFlight = 0;
  const admit = (req: Request, res: Response, next: NextFunction) => {
    const declared = Number(req.get('Content-Length') ?? 0);
    if (declared > PROFILE_IMAGE_MAX_BYTES) {
      fail(res, 413, PROFILE_IMAGE_TOO_BIG_ERROR);
      return;
    }
    if (inFlight >= maxConcurrent) {
      fail(res, 503, BUSY_ERROR);
      return;
    }
    const room = (bytes: number) => storage.usedBytes + bytes <= policy.maxBytes;
    if (!room(declared || 0)) sweep();
    if (!room(declared || 0)) {
      fail(res, 507, FULL_ERROR);
      return;
    }
    inFlight += 1;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        inFlight -= 1;
      }
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };

  const body = express.raw({ type: () => true, limit: PROFILE_IMAGE_MAX_BYTES });

  const share = async (req: Request, res: Response) => {
    const { sessionId, playerId } = res.locals.requester as Requester;
    const bytes: unknown = req.body;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      fail(res, 400, PROFILE_IMAGE_EMPTY_ERROR);
      return;
    }
    const inspection = inspectImage(bytes);
    if (!inspection.ok) {
      const status =
        inspection.error === PROFILE_IMAGE_TOO_BIG_ERROR
          ? 413
          : inspection.error === PROFILE_IMAGE_TYPE_ERROR
            ? 415
            : 400;
      fail(res, status, inspection.error);
      return;
    }
    const stripped = stripImageMetadata(bytes, inspection.type);
    const check = stripped ? inspectImage(stripped) : null;
    if (
      !stripped ||
      !check?.ok ||
      check.type !== inspection.type ||
      check.width !== inspection.width ||
      check.height !== inspection.height
    ) {
      fail(res, 400, PROFILE_IMAGE_DAMAGED_ERROR);
      return;
    }
    if (storage.usedBytes + stripped.length > policy.maxBytes) {
      fail(res, 507, FULL_ERROR);
      return;
    }

    // Its size as it shows: a phone photo stored sideways is turned upright.
    const turned = inspection.type === 'jpeg' && jpegOrientation(stripped) >= 5;
    const image: ProfileImage = {
      id: randomUUID(),
      type: inspection.type,
      width: turned ? inspection.height : inspection.width,
      height: turned ? inspection.width : inspection.height,
      bytes: stripped.length,
      at: Date.now(),
    };
    try {
      await storage.write(image, stripped);
    } catch (error) {
      console.error('[profiles] write failed:', error);
      fail(res, 500, SAVE_FAILED_ERROR);
      return;
    }
    // The player may have left (or been removed) while it uploaded.
    const result = sessions.setProfileImage(sessionId, playerId, image);
    if (!result.ok) {
      storage.remove(image);
      fail(res, 410, result.error);
      return;
    }
    if (result.previous) storage.remove(result.previous);
    onChange(sessionId, playerId);
    res.json({ profileImage: image });
  };
  app.put(PROFILE_IMAGE_ROUTE, limited(uploads), authenticate, admit, body, (req, res, next) => {
    // Express 4 doesn't catch a rejected promise itself.
    share(req, res).catch(next);
  });

  app.delete(PROFILE_IMAGE_ROUTE, limited(uploads), authenticate, (_req, res) => {
    const { sessionId, playerId } = res.locals.requester as Requester;
    const result = sessions.setProfileImage(sessionId, playerId, null);
    if (!result.ok) {
      fail(res, 410, result.error);
      return;
    }
    if (result.previous) {
      storage.remove(result.previous);
      onChange(sessionId, playerId);
    }
    res.json({ ok: true });
  });

  app.get(
    `${PROFILE_IMAGE_ROUTE}/:playerId`,
    limited(views),
    authenticate,
    (req: Request, res: Response) => {
      const { sessionId, playerId: viewer } = res.locals.requester as Requester;
      const target = typeof req.params.playerId === 'string' ? req.params.playerId : '';
      if (target !== viewer && !sessions.isHost(sessionId, viewer)) {
        fail(res, 403, HOST_ONLY_ERROR);
        return;
      }
      const image = sessions.profileImageOf(sessionId, target);
      if (!image) {
        fail(res, 404, NO_PROFILE_ERROR);
        return;
      }
      res.sendFile(
        storage.pathOf(image),
        {
          headers: {
            'Content-Type': PROFILE_IMAGE_FORMATS[image.type].mime,
            // Private to whoever asked: never kept by a browser or a proxy.
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'",
            'Cross-Origin-Resource-Policy': 'same-site',
          },
          dotfiles: 'deny',
          etag: false,
          lastModified: false,
          cacheControl: false,
        },
        (error?: NodeJS.ErrnoException) => {
          if (!error) return;
          if (error.code === 'ENOENT') {
            // Its file is gone (someone cleaned the folder by hand): the
            // table stops pointing at it, rather than failing every time.
            if (sessions.profileImageOf(sessionId, target)?.id === image.id) {
              sessions.setProfileImage(sessionId, target, null);
              onChange(sessionId, target);
            }
            if (!res.headersSent) fail(res, 404, NO_PROFILE_ERROR);
            return;
          }
          console.error('[profiles] read failed:', error);
          if (!res.headersSent) fail(res, 500, 'Couldn’t read that profile — try again.');
          else res.destroy();
        },
      );
    },
  );

  // A body over the limit, or one cut off half way: a clear answer rather
  // than Express's HTML error page.
  app.use(
    PROFILE_IMAGE_ROUTE,
    (
      error: { type?: string; status?: number },
      _req: Request,
      res: Response,
      next: NextFunction,
    ) => {
      if (res.headersSent) {
        next(error);
        return;
      }
      if (error.type === 'entity.too.large' || error.status === 413) {
        fail(res, 413, PROFILE_IMAGE_TOO_BIG_ERROR);
      } else if (error.status && error.status >= 400 && error.status < 500) {
        fail(res, 400, BROKEN_UPLOAD_ERROR);
      } else {
        next(error);
      }
    },
  );

  return () => clearInterval(timer);
}
