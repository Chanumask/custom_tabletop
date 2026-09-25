/**
 * player:move payload — used both client -> server (the mover's own update)
 * and server -> other clients in the session (the rebroadcast). No ack and
 * no response type: this fires many times a second while walking, so a
 * round-trip per move would add needless latency (see
 * docs/engineering/architecture.md's "Performance" section — deltas, not
 * full state, for high-frequency updates). A malformed payload is dropped
 * silently server-side rather than acked with an error, for the same
 * reason (see server/src/validation.ts).
 */
import { DEFAULT_SPAWN_POSITION, type GameState, type Vector3 } from './types.js';

export interface PlayerMoveRequest {
  sessionId: string;
  playerId: string;
  position: Vector3;
  rotationY: number;
}

/**
 * The six selectable player colors. A player's color is unique within a
 * session and drives everything that represents them: their character
 * model (each color has its own distinct model, wearing a shirt in that
 * color — client/src/three/characters.ts), their name tag, whiteboard text,
 * etc. Six colors means a session holds at most six players, which matches
 * the table's seating.
 */
export const PLAYER_COLORS = [
  { id: 'red', label: 'Red', hex: '#d9443b' },
  { id: 'blue', label: 'Blue', hex: '#3d7fdb' },
  { id: 'green', label: 'Green', hex: '#3fae5a' },
  { id: 'yellow', label: 'Yellow', hex: '#e9c33b' },
  { id: 'purple', label: 'Purple', hex: '#9160d6' },
  { id: 'orange', label: 'Orange', hex: '#ec8a36' },
] as const;

export type PlayerColorId = (typeof PLAYER_COLORS)[number]['id'];

export const MAX_PLAYERS_PER_SESSION = PLAYER_COLORS.length;

/** Player names are trimmed and must be 1..MAX_PLAYER_NAME_LENGTH chars —
 * long enough for real names, short enough to fit a name tag. */
export const MAX_PLAYER_NAME_LENGTH = 24;

export function isPlayerColorId(value: unknown): value is PlayerColorId {
  return PLAYER_COLORS.some((color) => color.id === value);
}

export function playerColorHex(id: PlayerColorId): string {
  return PLAYER_COLORS.find((color) => color.id === id)!.hex;
}

/**
 * player:update — a player changes their own name and/or color mid-session.
 * Ack + full-state broadcast (infrequent). Only ever changes the requesting
 * player's own record; a color already worn by someone else is rejected.
 */
export interface PlayerUpdateRequest {
  sessionId: string;
  playerId: string;
  name?: string;
  color?: PlayerColorId;
}

export type PlayerUpdateResponse = { ok: true; state: GameState } | { ok: false; error: string };

/** Spawn points sit on an arc this far from the table's center (the room's
 * origin), on the south side where the room's entrance view is. */
const SPAWN_ARC_RADIUS = 3;
/** Each color's place on that arc (degrees from due south, +x to the east):
 * neighbours in join order stand on opposite sides, so a table of six
 * never starts out standing inside each other. */
const SPAWN_ANGLE_DEG: Record<PlayerColorId, number> = {
  red: -10,
  blue: 10,
  green: -30,
  yellow: 30,
  purple: -50,
  orange: 50,
};

/**
 * Where a player of this color first appears, and which way they face
 * (`rotationY`, the same heading convention as `player:move`: the facing
 * direction is (sin, cos) of it) — always toward the table.
 */
export function spawnPointFor(color: PlayerColorId): { position: Vector3; rotationY: number } {
  const angle = (SPAWN_ANGLE_DEG[color] * Math.PI) / 180;
  const x = SPAWN_ARC_RADIUS * Math.sin(angle);
  const z = SPAWN_ARC_RADIUS * Math.cos(angle);
  return {
    position: { x, y: DEFAULT_SPAWN_POSITION.y, z },
    rotationY: Math.atan2(-x, -z),
  };
}
