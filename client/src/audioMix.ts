/**
 * What each player hears, their own choice (docs/decisions.md, "Your own
 * sound"): every sound the room makes belongs to one category, and each
 * category has its own switch and volume on top of the master volume. A
 * player can also silence one other player's sounds, just for themselves,
 * and turn flashing effects off. All of it lives in their browser
 * (settings.ts); nothing here is shared.
 *
 * Web Audio sounds connect to `categoryOutput(ctx, category)` — one gain
 * per category, kept at `categoryVolume(category)` — instead of straight to
 * the speakers. `<audio>` elements and the TV's YouTube player set their
 * own volume from `categoryVolume` instead.
 */

export const SOUND_CATEGORIES = [
  { id: 'soundboard', label: 'Soundboard', hint: 'What anyone plays from the wall board' },
  { id: 'tv', label: 'TV clips', hint: 'Videos on the TV' },
  { id: 'music', label: 'Music', hint: 'The record player' },
  { id: 'table', label: 'Dice & table', hint: 'Dice, pings and minis' },
  { id: 'fire', label: 'Fire', hint: 'The fireplace' },
  { id: 'night', label: 'Night outside', hint: 'Wind, crickets, the owl' },
  { id: 'weather', label: 'Rain & thunder', hint: 'When the host brings the weather in' },
  { id: 'room', label: 'Room sounds', hint: 'The clock, the cat, the door' },
  { id: 'footsteps', label: 'Footsteps', hint: 'Yours and everyone else’s' },
  { id: 'gadgets', label: 'Gadgets & snacks', hint: 'Camera, walkie, tea, snacks' },
] as const;

export type SoundCategory = (typeof SOUND_CATEGORIES)[number]['id'];

export interface CategoryMix {
  on: boolean;
  /** 0 to 1, on top of the master volume. */
  volume: number;
}

export type SoundMix = Record<SoundCategory, CategoryMix>;

/** Everything on, at full volume: nobody has to find a setting to hear the room. */
export const DEFAULT_SOUND_MIX: SoundMix = Object.fromEntries(
  SOUND_CATEGORIES.map(({ id }) => [id, { on: true, volume: 1 }]),
) as SoundMix;

/** What the player chose (the audio part of settings.ts's ClientSettings). */
export interface AudioPreferences {
  masterVolume: number;
  sound: SoundMix;
  /** Players whose sounds this player doesn't want to hear. */
  mutedPlayers: readonly string[];
  /** No thunder flashes in the windows, no camera flash pops. */
  noFlashing: boolean;
}

const unit = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1);

/** How loud `category` plays under `preferences` (0..1). Pure. */
export function mixedVolume(preferences: AudioPreferences, category: SoundCategory): number {
  const mix = preferences.sound[category] ?? DEFAULT_SOUND_MIX[category];
  return mix.on ? unit(preferences.masterVolume) * unit(mix.volume) : 0;
}

let current: AudioPreferences = {
  masterVolume: 1,
  sound: DEFAULT_SOUND_MIX,
  mutedPlayers: [],
  noFlashing: false,
};
const outputs = new Map<SoundCategory, GainNode>();

/** How loud `category` plays right now (0..1). */
export function categoryVolume(category: SoundCategory): number {
  return mixedVolume(current, category);
}

/** Adopts the player's settings (App.tsx calls this whenever they change);
 * every category's volume follows within a few milliseconds. */
export function setAudioPreferences(preferences: AudioPreferences): void {
  current = preferences;
  for (const [category, gain] of outputs) {
    gain.gain.setTargetAtTime(categoryVolume(category), gain.context.currentTime, 0.03);
  }
}

/** Where a sound of `category` connects: its own gain, then the speakers. */
export function categoryOutput(ctx: BaseAudioContext, category: SoundCategory): AudioNode {
  let gain = outputs.get(category);
  if (!gain || gain.context !== ctx) {
    gain = ctx.createGain();
    gain.gain.value = categoryVolume(category);
    gain.connect(ctx.destination);
    outputs.set(category, gain);
  }
  return gain;
}

/** Whether this player chose not to hear `playerId`'s sounds. */
export function isPlayerMuted(playerId: string | null | undefined): boolean {
  return !!playerId && current.mutedPlayers.includes(playerId);
}

/** Whether flashing effects (thunder, the camera flash) may show. */
export function flashingAllowed(): boolean {
  return !current.noFlashing;
}
