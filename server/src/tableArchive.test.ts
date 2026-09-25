import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameState } from '@custom-tabletop/shared';
import {
  SAVE_FORMAT,
  TableArchive,
  hashSecret,
  planArchiveSweep,
  secretsMatch,
  tableFileName,
  type ArchiveEntry,
  type ArchivePolicy,
  type SavedTable,
} from './tableArchive.js';
import { SessionStore } from './sessionStore.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const policy: ArchivePolicy = { ttlMs: 7 * DAY, maxTables: 3, maxBytes: 1000 };

function entry(sessionId: string, ageMs: number, bytes = 10): ArchiveEntry {
  return { sessionId, lastActiveAt: NOW - ageMs, bytes };
}

describe('planArchiveSweep', () => {
  const noneLive = () => false;

  it('removes tables unused for longer than the expiry, keeps the rest', () => {
    const removed = planArchiveSweep(
      [entry('OLD', 8 * DAY), entry('RECENT', 2 * DAY)],
      policy,
      NOW,
      noneLive,
    );
    expect(removed).toEqual(['OLD']);
  });

  it('never removes a table in play, however old its last save', () => {
    expect(planArchiveSweep([entry('LIVE', 30 * DAY)], policy, NOW, () => true)).toEqual([]);
  });

  it('over the table cap, removes the least recently used saved tables', () => {
    const removed = planArchiveSweep(
      [entry('A', 4 * DAY), entry('B', 3 * DAY), entry('C', 2 * DAY), entry('D', 1 * DAY)],
      policy,
      NOW,
      noneLive,
    );
    expect(removed).toEqual(['A']);
  });

  it('over the byte cap, removes oldest saved tables but not live ones', () => {
    const removed = planArchiveSweep(
      [entry('BIG-OLD', 3 * DAY, 600), entry('LIVE', 5 * DAY, 600), entry('NEW', 1 * DAY, 100)],
      policy,
      NOW,
      (id) => id === 'LIVE',
    );
    expect(removed).toEqual(['BIG-OLD']);
  });
});

describe('secrets and file names', () => {
  it('compares secrets without leaking which one matched', () => {
    expect(secretsMatch('abc', 'abc')).toBe(true);
    expect(secretsMatch('abc', 'abd')).toBe(false);
    expect(secretsMatch('abc', 'a-much-longer-string')).toBe(false);
  });

  it('hashes deterministically (tokens are stored as SHA-256 hex)', () => {
    expect(hashSecret('token')).toBe(hashSecret('token'));
    expect(hashSecret('token')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps plain codes readable and hashes anything else', () => {
    expect(tableFileName('CRYPT7')).toBe('CRYPT7.json');
    expect(tableFileName('../../etc/passwd')).toMatch(/^~[0-9a-f]{40}\.json$/);
    // Distinct on case-insensitive filesystems.
    expect(tableFileName('crypt7')).not.toBe(tableFileName('CRYPT7'));
  });
});

describe('TableArchive on disk', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tables-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function savedTable(sessionId: string, lastActiveAt = NOW): SavedTable {
    const store = new SessionStore();
    store.join(sessionId, 'p1', 'Alice', 'secret');
    store.updateScene(sessionId, 'p1', 'default', {
      backgroundImage: 'https://tabletop.murri.me/uploads/images/map.png',
    });
    const snapshot = store.snapshot(sessionId)!;
    return { format: SAVE_FORMAT, lastActiveAt, ...snapshot };
  }

  it('saves and loads a table, and indexes it after a restart', () => {
    new TableArchive(dir).save(savedTable('CRYPT'));
    const reopened = new TableArchive(dir);
    expect(reopened.has('CRYPT')).toBe(true);
    expect(reopened.info('CRYPT')).toEqual({ lastActiveAt: NOW, hostName: 'Alice' });
    const loaded = reopened.load('CRYPT')!;
    expect(loaded.state.scenes[0]!.backgroundImage).toContain('map.png');
    // Only a hash of the player's token is kept.
    expect(JSON.stringify(loaded)).not.toContain('"secret"');
    expect(loaded.credentialHashes.p1).toBe(hashSecret('secret'));
    expect(fs.readdirSync(dir)).toEqual(['CRYPT.json']); // no temp file left
  });

  it('knows which uploads saved tables use (kept safe from pruning)', () => {
    const archive = new TableArchive(dir);
    archive.save(savedTable('CRYPT'));
    expect([...archive.referencedUploads()]).toEqual(['map.png']);
    archive.remove('CRYPT');
    expect(archive.referencedUploads().size).toBe(0);
  });

  it('skips unreadable files and saves from a newer format instead of misreading them', () => {
    fs.writeFileSync(path.join(dir, 'BROKEN.json'), '{ not json');
    fs.writeFileSync(
      path.join(dir, 'FUTURE.json'),
      JSON.stringify({ ...savedTable('FUTURE'), format: SAVE_FORMAT + 1 }),
    );
    const archive = new TableArchive(dir);
    expect(archive.has('BROKEN')).toBe(false);
    expect(archive.has('FUTURE')).toBe(false);
    expect(fs.existsSync(path.join(dir, 'FUTURE.json'))).toBe(true); // left alone
  });

  it('sweeps expired saved tables from disk', () => {
    const archive = new TableArchive(dir, { ...policy, maxBytes: 10_000_000 });
    archive.save(savedTable('STALE', NOW - 8 * DAY));
    archive.save(savedTable('FRESH', NOW - DAY));
    expect(archive.sweep(NOW, () => false)).toEqual(['STALE']);
    expect(fs.readdirSync(dir)).toEqual(['FRESH.json']);
  });
});

describe('SessionStore saving hooks', () => {
  it('hands over the table (with its host key) when the last player leaves', () => {
    const emptied: { state: GameState; hostKey: string }[] = [];
    const store = new SessionStore({ onEmptied: (table) => emptied.push(table) });
    store.join('ROOM', 'p1', 'Alice', 'secret');
    const hostKey = store.hostKeyOf('ROOM');
    store.leave('ROOM', 'p1');
    expect(emptied).toHaveLength(1);
    expect(emptied[0]!.hostKey).toBe(hostKey);
    expect(emptied[0]!.state.players).toEqual([]);
    expect(store.get('ROOM')).toBeUndefined();
  });

  it('restores a saved table with its players away, and fills in fields old saves lack', () => {
    const store = new SessionStore();
    const old = {
      sessionId: 'ROOM',
      hostKey: 'key',
      credentialHashes: { p1: hashSecret('secret') },
      // A save from before whiteboard/log/grid existed.
      state: {
        sessionId: 'ROOM',
        hostId: 'p1',
        activeSceneId: 'default',
        scenes: [{ id: 'default', name: 'Map', backgroundImage: '', drawings: [] }],
        players: [
          {
            ...new SessionStore().join('X', 'p1', 'Alice').players[0]!,
            connected: true,
          },
        ],
        dice: [],
        soundboard: [],
        soundboardSlots: [],
        lightOn: true,
      } as unknown as GameState,
    };
    const state = store.restore(old);
    expect(state.players[0]!.connected).toBe(false);
    expect(state.whiteboard.length).toBeGreaterThan(0);
    expect(state.inventory.length).toBeGreaterThan(0);
    expect(state.log).toEqual([]);
    expect(state.scenes[0]!.gridCells).toBe(0);
    expect(store.authorizeJoin('ROOM', 'p1', 'secret')).toBe(true);
    expect(store.authorizeJoin('ROOM', 'p1', 'wrong')).toBe(false);
  });

  it('a reopened table (restored empty) makes its first joiner the host', () => {
    const store = new SessionStore();
    store.join('ROOM', 'p1', 'Alice', 'secret');
    const snapshot = store.snapshot('ROOM')!;
    const fresh = new SessionStore();
    fresh.restore({ ...snapshot, credentialHashes: {}, state: { ...snapshot.state, players: [] } });
    const state = fresh.join('ROOM', 'p9', 'Zed', 'other');
    expect(state.hostId).toBe('p9');
    expect(state.log.at(-1)!.kind === 'system' && state.log.at(-1)).toBeTruthy();
    expect(JSON.stringify(state.log.at(-1))).toContain('Zed reopened the table');
  });
});
