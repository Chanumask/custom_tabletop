import type { IdStorage } from './playerIdentity.js';

/**
 * The host keys of tables this browser has hosted (localStorage — kept
 * across visits, unlike the per-tab player identity): a saved table that
 * everyone has left reopens only for its host key (docs/decisions.md,
 * "Saved tables"). The host link carries the same key to other devices.
 */
const STORAGE_KEY = 'customTabletop.hostKeys';
/** Oldest keys are forgotten past this many tables (saved tables expire
 * after a week anyway). */
const MAX_KEYS = 30;

type KeyMap = Record<string, { key: string; at: number }>;

function read(storage: IdStorage): KeyMap {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as KeyMap) : {};
  } catch {
    return {};
  }
}

export function loadHostKey(storage: IdStorage, sessionId: string): string | null {
  const entry = read(storage)[sessionId];
  return entry && typeof entry.key === 'string' ? entry.key : null;
}

export function saveHostKey(
  storage: IdStorage,
  sessionId: string,
  key: string,
  now = Date.now(),
): void {
  try {
    const keys = read(storage);
    keys[sessionId] = { key, at: now };
    const newestFirst = Object.entries(keys)
      .sort(([, a], [, b]) => b.at - a.at)
      .slice(0, MAX_KEYS);
    storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(newestFirst)));
  } catch {
    // Best-effort: without storage, the host link still works.
  }
}

/** The link that reopens `sessionId` from any device (keep it private). */
export function hostLink(origin: string, sessionId: string, key: string): string {
  const url = new URL(origin);
  url.searchParams.set('join', sessionId);
  url.searchParams.set('host', key);
  return url.toString();
}
