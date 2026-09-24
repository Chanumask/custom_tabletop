/**
 * Request/response payload shapes for the dice:* events (Milestone 6).
 * Not host-gated — any player can spawn/roll/remove a die (the M6 exit
 * check is explicit: "any player"). Infrequent enough (nobody rolls dice
 * many times a second) to use the same ack + full-GameState-broadcast
 * pattern as session:join and scene:*, rather than player:move/drawing:*'s
 * fire-and-forget delta pattern. The roll result itself is decided
 * server-side (server/src/sessionStore.ts's `rollDice`), never trusted from
 * the client — see docs/decisions.md.
 */
import type { GameState, Vector3 } from './types.js';

/** The standard polyhedral set. */
export const DIE_KINDS = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'] as const;
export type DieKind = (typeof DIE_KINDS)[number];

/** How many faces (possible results, 1..n) each kind has. */
export const DIE_FACES: Record<DieKind, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
};

export function isDieKind(value: unknown): value is DieKind {
  return typeof value === 'string' && (DIE_KINDS as readonly string[]).includes(value);
}

/** Enough for any real roll (a fireball's 8d6 and then some) while keeping
 * a runaway spawn loop from filling the table. */
export const MAX_DICE_PER_SESSION = 40;
/** Most dice one dice:roll may roll together. */
export const MAX_DICE_PER_ROLL = 20;

export interface DiceSpawnRequest {
  sessionId: string;
  playerId: string;
  /** Client-generated (crypto.randomUUID()), same pattern as playerId. */
  diceId: string;
  /** The point on the table surface the die rests on (its bottom). */
  position: Vector3;
  kind: DieKind;
}

export type DiceSpawnResponse = { ok: true; state: GameState } | { ok: false; error: string };

/** Rolls one or several dice together (one broadcast — e.g. "roll all my
 * dice" is a single, simultaneous roll). */
export interface DiceRollRequest {
  sessionId: string;
  playerId: string;
  diceIds: string[];
}

export type DiceRollResponse = { ok: true; state: GameState } | { ok: false; error: string };

export interface DiceRemoveRequest {
  sessionId: string;
  playerId: string;
  diceId: string;
}

export type DiceRemoveResponse = { ok: true; state: GameState } | { ok: false; error: string };
