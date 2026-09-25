/**
 * Client-only preferences (Milestone 10 follow-up, user request) — never
 * shared `GameState`, just a per-browser convenience persisted in
 * `localStorage` so a player doesn't have to reconfigure them every visit.
 * Deliberately one small, flat object rather than one `localStorage` key
 * per setting, so adding a future setting (the user's own "other stuff
 * we will add in the future") is a one-line addition to `ClientSettings`
 * and `DEFAULT_SETTINGS`, not a new storage/loading mechanism.
 */
export interface ClientSettings {
  /** 0 (silent) to 1 (full) — applied to both synthesized tones and
   * uploaded/linked audio playback (client/src/sounds.ts). */
  masterVolume: number;
  /** A `KeyboardEvent.code` value (e.g. "KeyE") — which key triggers a
   * room interactable (client/src/three/RoomView.tsx). */
  interactKey: string;
  /** The fireplace's crackle (fireAmbience.ts) — on by default. */
  fireSound: boolean;
  /** The session menu folded down to its header, leaving the room clear. */
  menuCollapsed: boolean;
}

export const DEFAULT_SETTINGS: ClientSettings = {
  masterVolume: 1,
  interactKey: 'KeyE',
  fireSound: true,
  menuCollapsed: false,
};

const STORAGE_KEY = 'customTabletop.settings';

/** Same minimal shape as `playerIdentity.ts`'s `IdStorage` — storage is
 * passed in rather than read off the `localStorage` global directly so
 * this stays testable under Vitest's `node` environment (no real
 * `localStorage` there), the same pattern `getOrCreatePlayerId` uses. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isPartialSettings(value: unknown): value is Partial<ClientSettings> {
  return typeof value === 'object' && value !== null;
}

/** Reads persisted settings, filling in defaults for anything missing —
 * including everything, the first time, or if storage holds corrupt JSON
 * from an older shape. Never throws: a broken/blocked storage should
 * degrade to defaults, not crash the app. */
export function loadSettings(storage: SettingsStorage): ClientSettings {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isPartialSettings(parsed)) {
      return { ...DEFAULT_SETTINGS };
    }
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Best-effort — a write failure (storage disabled/full) just means the
 * setting won't survive a reload, not a reason to break the app. */
export function saveSettings(storage: SettingsStorage, settings: ClientSettings): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignored on purpose — see doc comment above.
  }
}
