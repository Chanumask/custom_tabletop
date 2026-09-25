import fs from 'node:fs';
import path from 'node:path';

/**
 * Keeps the uploads folder from growing without bound once the app is on
 * the public internet (deploy decision, docs/decisions.md 2026-09-25).
 * Sessions live only in memory, so an upload no live session refers to is
 * garbage — nobody can reach it through the game any more. The rules:
 *
 * - a file a live session uses (its map, a soundboard sound) is never
 *   deleted;
 * - neither is a file younger than `minAgeMs` — an upload is registered
 *   into its session a moment *after* it lands (the map crop dialog
 *   uploads, then sends `scene:update`);
 * - unused files older than `maxAgeMs` are deleted;
 * - then, while the folder is over `maxBytes`, the oldest unused files go.
 *
 * If everything left is in use and it's still over the cap, new uploads are
 * refused (`isFull`) until a table frees something up.
 */
export interface StoredUpload {
  /** File name, e.g. `3f2c….png` — unique (a random UUID). */
  name: string;
  path: string;
  size: number;
  mtimeMs: number;
}

export interface StoragePolicy {
  maxBytes: number;
  maxAgeMs: number;
  minAgeMs: number;
}

export const DEFAULT_STORAGE_POLICY: StoragePolicy = {
  maxBytes: 2 * 1024 * 1024 * 1024, // 2 GB
  maxAgeMs: 24 * 60 * 60 * 1000, // a day
  minAgeMs: 10 * 60 * 1000, // ten minutes
};

/** Pure: which files to delete, and how many bytes stay. */
export function planPrune(
  files: StoredUpload[],
  policy: StoragePolicy,
  inUse: ReadonlySet<string>,
  now: number,
): { remove: StoredUpload[]; keptBytes: number } {
  const removable = (file: StoredUpload) =>
    !inUse.has(file.name) && now - file.mtimeMs >= policy.minAgeMs;

  const remove = new Set<StoredUpload>();
  for (const file of files) {
    if (removable(file) && now - file.mtimeMs >= policy.maxAgeMs) {
      remove.add(file);
    }
  }

  let keptBytes = files.reduce((sum, file) => (remove.has(file) ? sum : sum + file.size), 0);
  const oldestFirst = files
    .filter((file) => removable(file) && !remove.has(file))
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const file of oldestFirst) {
    if (keptBytes <= policy.maxBytes) {
      break;
    }
    remove.add(file);
    keptBytes -= file.size;
  }

  return { remove: [...remove], keptBytes };
}

/** Every file under the uploads root's subfolders (images/, sounds/). */
export function listUploads(root: string): StoredUpload[] {
  const files: StoredUpload[] = [];
  for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const dirPath = path.join(root, dir.name);
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const filePath = path.join(dirPath, entry.name);
      const stat = fs.statSync(filePath, { throwIfNoEntry: false });
      if (stat) {
        files.push({ name: entry.name, path: filePath, size: stat.size, mtimeMs: stat.mtimeMs });
      }
    }
  }
  return files;
}

/** Applies `planPrune` to the folder. Returns the bytes that remain. */
export function pruneUploads(
  root: string,
  policy: StoragePolicy,
  inUse: ReadonlySet<string>,
  now = Date.now(),
): number {
  const { remove, keptBytes } = planPrune(listUploads(root), policy, inUse, now);
  for (const file of remove) {
    fs.rmSync(file.path, { force: true });
  }
  if (remove.length > 0) {
    console.log(`[uploads] pruned ${remove.length} unused file(s)`);
  }
  return keptBytes;
}

/**
 * At most `limit` events per `windowMs` per key (the client's IP) — a
 * sliding window, so a burst can't be timed around a fixed boundary.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records an attempt; false if this key is over the limit. */
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Forgets keys with no recent hits (call now and then). */
  sweep(now = Date.now()): void {
    for (const [key, times] of this.hits) {
      if (times.every((at) => now - at >= this.windowMs)) {
        this.hits.delete(key);
      }
    }
  }
}

/** The file name an upload URL points at, if it's one of ours
 * (`…/uploads/images/<name>` or `…/uploads/sounds/<name>`). */
export function uploadNameFromUrl(url: string): string | null {
  const match = /\/uploads\/(?:images|sounds)\/([^/?#]+)$/.exec(url.split(/[?#]/)[0] ?? '');
  return match?.[1] ?? null;
}
