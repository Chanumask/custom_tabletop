/**
 * Server-authoritative session state and the data shapes it's made of.
 *
 * Source: docs/engineering/architecture.md ("Client State" section — the
 * original spec's GameState/Scene/Player interfaces, carried over verbatim).
 * `Character`, `Drawing`, `Dice`, and `SoundState` were referenced there but
 * left undefined; these are placeholder shapes, expected to grow when the
 * milestone that actually uses them lands (see docs/roadmap.md).
 */
import type { SharedClip } from './clip.js';
import type { PlayerColorId } from './player.js';
import type { WhiteboardLine } from './whiteboard.js';
import type { DieKind } from './dice.js';
import type { LogEntry } from './log.js';
import type { RoomTheme, TablePermissions } from './host.js';

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
  /** Chosen once when the stroke starts (Milestone 8's seated drawing
   * toolbar) and fixed for its whole lifetime — a CSS color string and a
   * canvas-pixel line width. */
  color: string;
  width: number;
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
  kind: DieKind;
  /** Where it rests on the table: the point under its bottom face. */
  position: Vector3;
  /** null until rolled/settled; a fresh roll is server-authoritative
   * (Math.random() never runs on the client) so it can't be faked. */
  result: number | null;
  /** Bumped by every roll, so a re-roll that lands on the same number is
   * still seen (and animated) as a new roll. */
  rollCount: number;
  /** Who rolled it last (null until rolled). */
  rolledBy: string | null;
  /** A secret die (host only): only its owner ever sees it, or its rolls. */
  hidden?: boolean;
}

export interface SoundState {
  id: string;
  name: string;
  /** Empty for a built-in synthesized preset — the client plays it locally
   * from its own tone catalog, keyed by `id` (see client/src/sounds.ts).
   * Otherwise an absolute http(s) URL: an uploaded file, a direct link to
   * an audio file, or a YouTube link (played as a visible clip — see
   * youtube.ts's `parseYouTubeUrl`). */
  url: string;
  playing: boolean;
  /** Who added it — they (or the host) may remove it again. null for the
   * built-in presets, which only the host can remove. */
  addedBy: string | null;
}

/**
 * The soundboard's built-in entries — every session seeds `soundboard`
 * with these (the file-uploads extension, before Milestone 8). Kept here
 * rather than only client-side so the server can seed real
 * `GameState.soundboard` entries without owning synthesis details
 * (frequency/waveform/duration stay client-only).
 */
export const BUILTIN_SOUND_PRESETS: SoundState[] = [
  { id: 'bell', name: 'Bell', url: '', playing: false, addedBy: null },
  { id: 'drum', name: 'Drum', url: '', playing: false, addedBy: null },
  { id: 'alert', name: 'Alert', url: '', playing: false, addedBy: null },
];

/** A small hand-held prop from the room's chest (the gadgets inventory,
 * phase 1 — camera+pinboard, flashlight, walkie-talkies, calculator each
 * get their own "use" mechanic as that gadget lands; this phase only
 * tracks who's carrying what). */
export type ItemKind = 'camera' | 'flashlight' | 'walkie' | 'calculator';

export interface InventoryItem {
  id: string;
  kind: ItemKind;
  /** A player id, or null while it's sitting in the chest. */
  heldBy: string | null;
}

/** A photo taken with the chest's camera (`photo:capture`) and pinned to
 * the wall pinboard — always pinned, in arrival order; the oldest is
 * dropped once the board is full (see `PINBOARD_SLOT_COUNT`, photo.ts). */
export interface Photo {
  id: string;
  url: string;
  takenBy: string;
}

/** Every session's chest starts with these. Two walkies, so a pair of
 * players can use them together once the walkie-talkie mechanic lands. */
export const STARTING_INVENTORY: InventoryItem[] = [
  { id: 'camera-1', kind: 'camera', heldBy: null },
  { id: 'flashlight-1', kind: 'flashlight', heldBy: null },
  { id: 'walkie-1', kind: 'walkie', heldBy: null },
  { id: 'walkie-2', kind: 'walkie', heldBy: null },
  { id: 'calculator-1', kind: 'calculator', heldBy: null },
];

export interface Player {
  id: string;
  name: string;

  /** One of PLAYER_COLORS (player.ts), unique within the session — decides
   * this player's character model/shirt, name tag, whiteboard ink, etc. */
  color: PlayerColorId;

  character: Character;

  position: Vector3;
  /** Yaw only, radians. Enough to orient a placeholder avatar toward its
   * facing direction — pitch/roll aren't tracked (Milestone 4). */
  rotationY: number;

  muted: boolean;

  /** Toggled by the table interactable (Milestone 8, `object:interact` with
   * objectId "table") — a player "sitting" to interact with what's on the
   * table without needing to walk around/look down. Visible to everyone
   * else as a visual change on the player's own avatar (see
   * client/src/three/PlayerAvatars.ts), not a position change: the server
   * never moves a seated player's `position`. */
  seated: boolean;
  /** Which chair they sit on (a seat index — seats.ts `SEAT_SLOTS`; the
   * table has `chairCount(players)` of them), or null — standing, or no
   * chair was free. Chosen by the sitting player's client (the nearest
   * free chair), kept unique by the server, and stable until they stand —
   * unless their chair goes away when the table gets smaller, when the
   * server moves them to a free one (`settleSeats`). */
  seatIndex: number | null;

  /** Live presence: false while this player's connection is dropped but
   * still inside the server's reconnect grace period (a reload, a network
   * blip). Everyone else sees them as "reconnecting" instead of a frozen,
   * silently-present ghost; if the grace period runs out they're removed
   * from the session exactly as if they'd left (see docs/decisions.md). */
  connected: boolean;
}

export interface Scene {
  id: string;
  name: string;
  backgroundImage: string;
  /** A square grid over the map, this many cells per side; 0 = none
   * (GRID_CELL_OPTIONS in ping.ts). Host-set via scene:update. */
  gridCells: number;

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

  /** The wall soundboard's fixed grid of buttons (Milestone 8 follow-up,
   * `SOUNDBOARD_SLOT_COUNT` entries — see sound.ts) — slot index -> the id of
   * the `soundboard` entry assigned to that physical button, or `null` for
   * an empty one. Independent of `soundboard`'s own length/order: a sound
   * can exist in the shared list (playable from the 2D panel) without
   * occupying any wall slot, and a slot always points at a specific button
   * position regardless of how many sounds get added later. */
  soundboardSlots: (string | null)[];

  /** The room's chest (the gadgets inventory, phase 1) — a fixed catalog of
   * small props a player can carry; see `STARTING_INVENTORY`. */
  inventory: InventoryItem[];

  /** Photos taken with the chest's camera, always pinned to the wall
   * pinboard — oldest first, capped at `PINBOARD_SLOT_COUNT` (photo.ts). */
  photos: Photo[];

  /** The room's light switch (Milestone 8, `object:interact` with objectId
   * "light") — a session-wide flag, not per-player: whoever flips it changes
   * the room for everyone, the same way a real light switch would. */
  lightOn: boolean;

  /** The YouTube clip everyone is watching, if any (clip.ts). */
  clip: SharedClip | null;
  /** Host-set: while true, only the host can control the clip. */
  clipLocked: boolean;

  /** Host-set: while true, nobody new can join (host.ts); players already
   * at the table can still reconnect. */
  locked: boolean;
  /** What the host lets everyone else do (host.ts). */
  permissions: TablePermissions;
  /** How the room (and the world outside) is dressed — the host's choice. */
  theme: RoomTheme;

  /** Players' minis on the table: playerId -> where it stands, in table
   * units (minis.ts). A player without an entry has theirs off the table. */
  minis: Record<string, Point2D>;

  /** The north wall's whiteboard — `WHITEBOARD_LINE_COUNT` lines (whiteboard.ts). */
  whiteboard: WhiteboardLine[];

  /** Recent chat, rolls and arrivals/departures, oldest first (log.ts). */
  log: LogEntry[];
}

/**
 * Where a newly-joined player's camera starts, and what the server seeds a
 * new `Player.position` as (Milestone 4) — kept in one shared place so a
 * fresh join doesn't render that player's avatar at the wrong spot (e.g.
 * underground at the origin) for the brief window before their first
 * `player:move`.
 */
export const DEFAULT_SPAWN_POSITION: Vector3 = { x: 0, y: 1.7, z: 3 };

/**
 * session:patch — the top-level parts of a session's GameState that an
 * action changed (dice, players, the whiteboard, …), sent to the room
 * instead of the whole state. A full snapshot (`session:state`) carries
 * every drawing on the map, so resending it for a dice roll would grow
 * with the drawings; clients merge a patch over their copy. Joins and
 * scene changes still send full snapshots.
 */
export interface SessionPatch {
  sessionId: string;
  patch: Partial<Omit<GameState, 'sessionId'>>;
}
