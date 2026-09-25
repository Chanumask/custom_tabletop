import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SAVED_TABLE_TTL_DAYS, type GameState } from '@custom-tabletop/shared';
import { uploadNameFromUrl } from './uploadStorage.js';

/**
 * Saved tables on disk (docs/decisions.md, 2026-09-25 "Saved tables"): one
 * JSON file per table. A live table is written every few seconds while it
 * changes, so a restart or deploy doesn't end the game; a table everyone has
 * left stays here for `SAVED_TABLE_TTL_DAYS`, reopenable by its host.
 *
 * Bump `SAVE_FORMAT` if a save stops being loadable as-is; older saves are
 * filled in with defaults when restored (SessionStore.restore), and a file
 * from a *newer* format is left alone rather than misread.
 */
export const SAVE_FORMAT = 1;

export interface SavedTable {
  format: number;
  sessionId: string;
  /** The last time anyone was at the table (a live table: its last save). */
  lastActiveAt: number;
  /** Reopens the table once everyone has left (the host link carries it). */
  hostKey: string;
  /** Who hosted it last — shown on the join screen once nobody's there. */
  hostName?: string | null;
  /** playerId -> SHA-256 of that player's secret token, for the players
   * still at the table when it was saved — so after a restart they can
   * rejoin as themselves. The tokens themselves are never stored. */
  credentialHashes: Record<string, string>;
  state: GameState;
}

export interface ArchivePolicy {
  /** A table nobody is at is deleted this long after its last use. */
  ttlMs: number;
  /** Past either cap, the least recently used saved tables go first. */
  maxTables: number;
  maxBytes: number;
}

export const DEFAULT_ARCHIVE_POLICY: ArchivePolicy = {
  ttlMs: SAVED_TABLE_TTL_DAYS * 24 * 60 * 60 * 1000,
  maxTables: 500,
  maxBytes: 512 * 1024 * 1024,
};

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** A new, unguessable host key (URL-safe, it goes in the host link). */
export function newHostKey(): string {
  return randomBytes(24).toString('base64url');
}

/** Constant-time comparison of two secrets of any length. */
export function secretsMatch(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}

/** A table's file name. Plain codes (what the client makes) keep their
 * name; anything else is hashed, so no code can escape the folder or
 * collide on a case-insensitive filesystem. */
export function tableFileName(sessionId: string): string {
  return /^[A-Z0-9_-]{1,32}$/.test(sessionId)
    ? `${sessionId}.json`
    : `~${hashSecret(sessionId).slice(0, 40)}.json`;
}

export interface ArchiveEntry {
  sessionId: string;
  lastActiveAt: number;
  bytes: number;
}

/**
 * Pure: which saved tables to delete. Tables in play are never deleted.
 * Expired ones go; then, while over either cap, the least recently used.
 */
export function planArchiveSweep(
  entries: ArchiveEntry[],
  policy: ArchivePolicy,
  now: number,
  isLive: (sessionId: string) => boolean,
): string[] {
  const remove = new Set<string>();
  for (const entry of entries) {
    if (!isLive(entry.sessionId) && now - entry.lastActiveAt > policy.ttlMs) {
      remove.add(entry.sessionId);
    }
  }
  let count = entries.length - remove.size;
  let bytes = entries.reduce((sum, e) => (remove.has(e.sessionId) ? sum : sum + e.bytes), 0);
  const oldestFirst = entries
    .filter((e) => !remove.has(e.sessionId) && !isLive(e.sessionId))
    .sort((a, b) => a.lastActiveAt - b.lastActiveAt);
  for (const entry of oldestFirst) {
    if (count <= policy.maxTables && bytes <= policy.maxBytes) break;
    remove.add(entry.sessionId);
    count -= 1;
    bytes -= entry.bytes;
  }
  return [...remove];
}

/** The uploads (maps, sounds) a table's state refers to. */
export function uploadsOf(state: GameState): string[] {
  const names = new Set<string>();
  const add = (url: string) => {
    const name = uploadNameFromUrl(url);
    if (name) names.add(name);
  };
  state.scenes?.forEach((scene) => add(scene.backgroundImage ?? ''));
  state.soundboard?.forEach((sound) => add(sound.url ?? ''));
  state.photos?.forEach((photo) => add(photo.url ?? ''));
  return [...names];
}

function isSavedTable(value: unknown): value is SavedTable {
  if (typeof value !== 'object' || value === null) return false;
  const table = value as Record<string, unknown>;
  return (
    typeof table.format === 'number' &&
    typeof table.sessionId === 'string' &&
    typeof table.lastActiveAt === 'number' &&
    typeof table.hostKey === 'string' &&
    typeof table.credentialHashes === 'object' &&
    table.credentialHashes !== null &&
    typeof table.state === 'object' &&
    table.state !== null
  );
}

interface IndexEntry extends ArchiveEntry {
  hostName: string | null;
  uploads: string[];
}

export class TableArchive {
  private readonly index = new Map<string, IndexEntry>();

  constructor(
    private readonly dir: string,
    private readonly policy: ArchivePolicy = DEFAULT_ARCHIVE_POLICY,
  ) {
    fs.mkdirSync(dir, { recursive: true });
    for (const table of this.readAll()) {
      this.indexTable(table, this.fileBytes(table.sessionId));
    }
  }

  /** Every readable saved table (startup: restoring the live ones). */
  readAll(): SavedTable[] {
    const tables: SavedTable[] = [];
    for (const file of fs.readdirSync(this.dir)) {
      if (!file.endsWith('.json')) continue;
      const table = this.readFile(path.join(this.dir, file));
      if (table) tables.push(table);
    }
    return tables;
  }

  has(sessionId: string): boolean {
    return this.index.has(sessionId);
  }

  /** What the join screen may know about a saved table. */
  info(sessionId: string): { lastActiveAt: number; hostName: string | null } | null {
    const entry = this.index.get(sessionId);
    return entry ? { lastActiveAt: entry.lastActiveAt, hostName: entry.hostName } : null;
  }

  load(sessionId: string): SavedTable | null {
    if (!this.index.has(sessionId)) return null;
    return this.readFile(this.filePath(sessionId));
  }

  /** Writes a table atomically (a crash mid-write leaves the old copy). */
  save(table: SavedTable): void {
    const target = this.filePath(table.sessionId);
    const json = JSON.stringify(table);
    const temp = `${target}.tmp`;
    fs.writeFileSync(temp, json);
    fs.renameSync(temp, target);
    this.indexTable(table, Buffer.byteLength(json));
  }

  remove(sessionId: string): void {
    fs.rmSync(this.filePath(sessionId), { force: true });
    this.index.delete(sessionId);
  }

  /** Deletes expired and over-cap saved tables; returns their codes. */
  sweep(now: number, isLive: (sessionId: string) => boolean): string[] {
    const removed = planArchiveSweep([...this.index.values()], this.policy, now, isLive);
    removed.forEach((sessionId) => this.remove(sessionId));
    if (removed.length > 0) {
      console.log(`[tables] removed ${removed.length} saved table(s)`);
    }
    return removed;
  }

  /** Uploads any saved table refers to — kept safe from upload pruning. */
  referencedUploads(): Set<string> {
    const names = new Set<string>();
    for (const entry of this.index.values()) entry.uploads.forEach((name) => names.add(name));
    return names;
  }

  private indexTable(table: SavedTable, bytes: number): void {
    const host = table.state.players?.find((player) => player.id === table.state.hostId);
    const previous = this.index.get(table.sessionId);
    this.index.set(table.sessionId, {
      sessionId: table.sessionId,
      lastActiveAt: table.lastActiveAt,
      bytes,
      // A table everyone left has no players: keep the last host's name.
      hostName: host?.name ?? table.hostName ?? previous?.hostName ?? null,
      uploads: uploadsOf(table.state),
    });
  }

  private filePath(sessionId: string): string {
    return path.join(this.dir, tableFileName(sessionId));
  }

  private fileBytes(sessionId: string): number {
    return fs.statSync(this.filePath(sessionId), { throwIfNoEntry: false })?.size ?? 0;
  }

  private readFile(file: string): SavedTable | null {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!isSavedTable(parsed)) {
        console.warn(`[tables] skipping unreadable save ${path.basename(file)}`);
        return null;
      }
      if (parsed.format > SAVE_FORMAT) {
        console.warn(`[tables] skipping ${path.basename(file)}: newer save format`);
        return null;
      }
      return parsed;
    } catch {
      console.warn(`[tables] skipping unreadable save ${path.basename(file)}`);
      return null;
    }
  }
}
