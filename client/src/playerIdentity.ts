export interface IdStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'customTabletop.playerId';
const TOKEN_STORAGE_KEY = 'customTabletop.playerToken';

function getOrCreate(storage: IdStorage, key: string): string {
  const existing = storage.getItem(key);
  if (existing) {
    return existing;
  }

  const value = crypto.randomUUID();
  storage.setItem(key, value);
  return value;
}

/**
 * A stable identity for this browser TAB, used so a dropped connection can
 * rejoin the same session as the same Player instead of creating a
 * duplicate. Deliberately sessionStorage-backed, not localStorage: two tabs
 * of the same browser share localStorage, which would collide them into one
 * identity and defeat the multi-tab exit check — sessionStorage is per-tab
 * but still survives a same-tab reload/reconnect. See docs/decisions.md.
 */
export function getOrCreatePlayerId(storage: IdStorage): string {
  return getOrCreate(storage, STORAGE_KEY);
}

/**
 * The secret half of this tab's identity — sent only in `session:join`,
 * never broadcast. `playerId` is public (every client sees it in
 * GameState), so the server requires this token to let a rejoin claim an
 * existing player; stored alongside the id so a reload presents the same
 * one (docs/decisions.md, identity binding).
 */
export function getOrCreatePlayerToken(storage: IdStorage): string {
  return getOrCreate(storage, TOKEN_STORAGE_KEY);
}
