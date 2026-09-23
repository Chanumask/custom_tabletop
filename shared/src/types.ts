/**
 * Server-authoritative session state and the data shapes it's made of.
 *
 * Source: docs/engineering/architecture.md ("Client State" section — the
 * original spec's GameState/Scene/Player interfaces, carried over verbatim).
 * `Character`, `Drawing`, `Dice`, and `SoundState` were referenced there but
 * left undefined; these are placeholder shapes, expected to grow when the
 * milestone that actually uses them lands (see docs/roadmap.md).
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** A point in a 2D canvas's own pixel space (the map/drawing surface),
 * distinct from `Vector3` world positions. A drawing stroke lives on a flat
 * canvas texture, not in 3D space — see docs/decisions.md (Milestone 5) for
 * why this replaced the original spec's `Vector3[]` for `Drawing.points`. */
export interface Point2D {
  x: number;
  y: number;
}

export interface Character {
  id: string;
  name: string;
}

export interface Drawing {
  id: string;
  sceneId: string;
  playerId: string;
  points: Point2D[];
}

/**
 * A physical object sitting on the table, not part of the 2D map layer —
 * unlike `Drawing`, deliberately has no `sceneId` (Milestone 6, logged in
 * docs/decisions.md): swapping the map underneath a die shouldn't make it
 * vanish, the same way a real die on a real table doesn't care what's
 * printed on the paper under it.
 */
export interface Dice {
  id: string;
  ownerId: string;
  position: Vector3;
  /** null until rolled/settled; a fresh roll is server-authoritative
   * (Math.random() never runs on the client) so it can't be faked. */
  result: number | null;
}

export interface SoundState {
  id: string;
  name: string;
  /** Empty for a built-in synthesized preset — the client plays it locally
   * from its own tone catalog, keyed by `id` (see client/src/sounds.ts).
   * A server URL (from a player's upload) otherwise. */
  url: string;
  playing: boolean;
}

/**
 * The soundboard's built-in entries — every session seeds `soundboard`
 * with these (Milestone 8). Kept here rather than only client-side so the
 * server can seed real `GameState.soundboard` entries without owning
 * synthesis details (frequency/waveform/duration stay client-only).
 */
export const BUILTIN_SOUND_PRESETS: SoundState[] = [
  { id: 'bell', name: 'Bell', url: '', playing: false },
  { id: 'drum', name: 'Drum', url: '', playing: false },
  { id: 'alert', name: 'Alert', url: '', playing: false },
];

export interface Player {
  id: string;
  name: string;

  character: Character;

  position: Vector3;
  /** Yaw only, radians. Enough to orient a placeholder avatar toward its
   * facing direction — pitch/roll aren't tracked (Milestone 4). */
  rotationY: number;

  muted: boolean;
}

export interface Scene {
  id: string;
  name: string;
  backgroundImage: string;

  drawings: Drawing[];
}

export interface GameState {
  sessionId: string;
  hostId: string;
  activeSceneId: string;

  scenes: Scene[];

  players: Player[];

  dice: Dice[];

  soundboard: SoundState[];
}

/**
 * Where a newly-joined player's camera starts, and what the server seeds a
 * new `Player.position` as (Milestone 4) — kept in one shared place so a
 * fresh join doesn't render that player's avatar at the wrong spot (e.g.
 * underground at the origin) for the brief window before their first
 * `player:move`.
 */
export const DEFAULT_SPAWN_POSITION: Vector3 = { x: 0, y: 1.7, z: 3 };
