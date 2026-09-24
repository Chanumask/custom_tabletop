import { PLAYER_COLORS, isPlayerColorId, type PlayerColorId } from '@custom-tabletop/shared';
import type { IdStorage } from './playerIdentity.js';

export interface JoinIntent {
  playerName: string;
  sessionId: string;
}

const LAST_JOIN_KEY = 'customTabletop.lastJoin';
const NAME_KEY = 'customTabletop.playerName';
const COLOR_KEY = 'customTabletop.playerColor';

function isJoinIntent(value: unknown): value is JoinIntent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { playerName, sessionId } = value as Record<string, unknown>;
  return typeof playerName === 'string' && typeof sessionId === 'string';
}

/**
 * The session this tab was last in (sessionStorage — per tab, survives a
 * reload), so a page reload drops the player straight back into the room
 * instead of the join screen. Cleared on an explicit leave, or when the
 * session turns out to have ended.
 */
export function loadLastJoin(storage: IdStorage): JoinIntent | null {
  try {
    const raw = storage.getItem(LAST_JOIN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isJoinIntent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLastJoin(storage: IdStorage, intent: JoinIntent): void {
  try {
    storage.setItem(LAST_JOIN_KEY, JSON.stringify(intent));
  } catch {
    // Best-effort — a reload just won't auto-rejoin.
  }
}

export function clearLastJoin(storage: IdStorage & { removeItem(key: string): void }): void {
  try {
    storage.removeItem(LAST_JOIN_KEY);
  } catch {
    // Best-effort, same as above.
  }
}

/** The name this browser last joined with (localStorage — remembered across
 * visits), pre-filled on the join screen so returning players don't retype it. */
export function loadRememberedName(storage: IdStorage): string {
  try {
    return storage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberName(storage: IdStorage, name: string): void {
  try {
    storage.setItem(NAME_KEY, name);
  } catch {
    // Best-effort.
  }
}

/** The color this browser last played as (localStorage), pre-selected on the
 * join screen — falls back to the first color. */
export function loadRememberedColor(storage: IdStorage): PlayerColorId {
  try {
    const stored = storage.getItem(COLOR_KEY);
    return isPlayerColorId(stored) ? stored : PLAYER_COLORS[0].id;
  } catch {
    return PLAYER_COLORS[0].id;
  }
}

export function rememberColor(storage: IdStorage, color: PlayerColorId): void {
  try {
    storage.setItem(COLOR_KEY, color);
  } catch {
    // Best-effort.
  }
}
