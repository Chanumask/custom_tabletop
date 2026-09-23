export interface IdStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'customTabletop.playerId';

/**
 * A stable identity for this browser TAB, used so a dropped connection can
 * rejoin the same session as the same Player instead of creating a
 * duplicate. Deliberately sessionStorage-backed, not localStorage: two tabs
 * of the same browser share localStorage, which would collide them into one
 * identity and defeat the multi-tab exit check — sessionStorage is per-tab
 * but still survives a same-tab reload/reconnect. See docs/decisions.md.
 */
export function getOrCreatePlayerId(storage: IdStorage): string {
  const existing = storage.getItem(STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  storage.setItem(STORAGE_KEY, id);
  return id;
}
