import type { IdStorage } from './playerIdentity.js';

/**
 * What this browser remembers about the player's profile image
 * (docs/decisions.md, "Player profiles"). There are no accounts, so a
 * profile belongs to a player at a table; to spare them picking the file
 * again at every table, the browser can keep a copy and offer it on the
 * join screen:
 *
 * - **The device copy** (IndexedDB — localStorage holds strings of a few MB
 *   at most): the last image shared, while "keep a copy" is on.
 * - **Keep a copy** (localStorage): on unless the player turns it off,
 *   which also deletes the copy.
 * - **Shared here** (sessionStorage, per tab like the player's identity):
 *   that this player wants their image shared at this table — so if the
 *   table loses it (they were dropped for too long, a server hiccup), the
 *   tab shares it again by itself; a player who withdrew it isn't.
 */

const REMEMBER_KEY = 'customTabletop.keepProfileCopy';
const SHARED_KEY = 'customTabletop.profileSharedAt';

export function loadKeepCopy(storage: IdStorage): boolean {
  try {
    return storage.getItem(REMEMBER_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveKeepCopy(storage: IdStorage, keep: boolean): void {
  try {
    storage.setItem(REMEMBER_KEY, keep ? 'on' : 'off');
  } catch {
    // Best-effort: it just won't be remembered next visit.
  }
}

/** Whether this tab's player wants their image shared at `sessionId`. */
export function wantsShared(storage: IdStorage, sessionId: string): boolean {
  try {
    return storage.getItem(SHARED_KEY) === sessionId;
  } catch {
    return false;
  }
}

export function markShared(storage: IdStorage, sessionId: string | null): void {
  try {
    if (sessionId) storage.setItem(SHARED_KEY, sessionId);
    else storage.setItem(SHARED_KEY, '');
  } catch {
    // Best-effort: a lost image just won't come back by itself.
  }
}

// ---- The device copy ---------------------------------------------------------

const DB_NAME = 'customTabletop';
const STORE = 'profile';
const KEY = 'copy';

interface StoredCopy {
  /** Bytes rather than a Blob: every browser stores an ArrayBuffer. */
  bytes: ArrayBuffer;
  type: string;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no IndexedDB'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'));
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result as T);
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB aborted'));
    });
  } finally {
    db.close();
  }
}

/** The device copy, or null (none, or this browser won't keep one — a
 * private window, storage turned off). */
export async function loadDeviceCopy(): Promise<Blob | null> {
  try {
    const stored = await withStore<StoredCopy | undefined>('readonly', (store) => store.get(KEY));
    if (!stored || !(stored.bytes instanceof ArrayBuffer) || typeof stored.type !== 'string') {
      return null;
    }
    return new Blob([stored.bytes], { type: stored.type });
  } catch {
    return null;
  }
}

/** Keeps `file` as the device copy. False if the browser wouldn't. */
export async function saveDeviceCopy(file: Blob): Promise<boolean> {
  try {
    const copy: StoredCopy = {
      bytes: await file.arrayBuffer(),
      type: file.type,
      savedAt: Date.now(),
    };
    await withStore('readwrite', (store) => store.put(copy, KEY));
    return true;
  } catch {
    return false;
  }
}

export async function forgetDeviceCopy(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(KEY));
  } catch {
    // Nothing kept, or nothing we can do.
  }
}
