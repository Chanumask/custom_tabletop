import {
  DEFAULT_SOUND_MIX,
  SOUND_CATEGORIES,
  type AudioPreferences,
  type SoundMix,
} from './audioMix.js';

/**
 * Client-only preferences (Milestone 10 follow-up, user request) — never
 * shared `GameState`, just a per-browser convenience persisted in
 * `localStorage` so a player doesn't have to reconfigure them every visit.
 * Deliberately one small, flat object rather than one `localStorage` key
 * per setting, so adding a future setting (the user's own "other stuff
 * we will add in the future") is a one-line addition to `ClientSettings`
 * and `DEFAULT_SETTINGS`, not a new storage/loading mechanism.
 */
export interface ClientSettings extends AudioPreferences {
  /** 0 (silent) to 1 (full): everything this player hears, on top of each
   * sound category's own volume (`sound`, audioMix.ts). */
  masterVolume: number;
  /** A `KeyboardEvent.code` value (e.g. "KeyE") — which key triggers a
   * room interactable (client/src/three/RoomView.tsx). */
  interactKey: string;
  /** The session menu folded down to its header, leaving the room clear. */
  menuCollapsed: boolean;
}

export const DEFAULT_SETTINGS: ClientSettings = {
  masterVolume: 1,
  interactKey: 'KeyE',
  sound: DEFAULT_SOUND_MIX,
  mutedPlayers: [],
  noFlashing: false,
  menuCollapsed: false,
};

/** The room's fixed keys (RoomView.tsx), which the interact key can't take
 * over: both would fire on the same press. */
export const RESERVED_KEYS = new Map([
  ['KeyR', 'uses your item'],
  ['KeyV', 'switches the chair view'],
]);

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

/** A saved sound mix, filled in: every category defaults to on at full
 * volume (a category added since keeps that), and a save from before the
 * mix existed carries its old "Fireplace sound"/"Night sounds" switches over. */
function soundMixFrom(saved: Partial<ClientSettings> & Record<string, unknown>): SoundMix {
  const mix: SoundMix = { ...DEFAULT_SOUND_MIX };
  const stored = typeof saved.sound === 'object' && saved.sound !== null ? saved.sound : {};
  for (const { id } of SOUND_CATEGORIES) {
    const entry = (stored as Partial<SoundMix>)[id];
    if (entry && typeof entry === 'object') {
      mix[id] = {
        on: typeof entry.on === 'boolean' ? entry.on : true,
        volume:
          typeof entry.volume === 'number' && Number.isFinite(entry.volume)
            ? Math.min(1, Math.max(0, entry.volume))
            : 1,
      };
    }
  }
  if (saved.fireSound === false && !('fire' in stored)) mix.fire = { on: false, volume: 1 };
  if (saved.nightSounds === false && !('night' in stored)) mix.night = { on: false, volume: 1 };
  return mix;
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
    // The old separate fire/night switches now live in the sound mix.
    const rest: Record<string, unknown> = { ...parsed };
    delete rest.fireSound;
    delete rest.nightSounds;
    const settings = { ...DEFAULT_SETTINGS, ...(rest as Partial<ClientSettings>) };
    // An interact key saved before its key was reserved goes back to E.
    if (typeof settings.interactKey !== 'string' || RESERVED_KEYS.has(settings.interactKey)) {
      settings.interactKey = DEFAULT_SETTINGS.interactKey;
    }
    settings.sound = soundMixFrom(parsed as Partial<ClientSettings> & Record<string, unknown>);
    settings.mutedPlayers = Array.isArray(settings.mutedPlayers)
      ? settings.mutedPlayers.filter((id): id is string => typeof id === 'string')
      : [];
    settings.noFlashing = settings.noFlashing === true;
    return settings;
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
