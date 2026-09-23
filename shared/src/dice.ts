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

export interface DiceSpawnRequest {
  sessionId: string;
  playerId: string;
  /** Client-generated (crypto.randomUUID()), same pattern as playerId. */
  diceId: string;
  position: Vector3;
}

export type DiceSpawnResponse = { ok: true; state: GameState } | { ok: false; error: string };

export interface DiceRollRequest {
  sessionId: string;
  playerId: string;
  diceId: string;
}

export type DiceRollResponse = { ok: true; state: GameState } | { ok: false; error: string };

export interface DiceRemoveRequest {
  sessionId: string;
  playerId: string;
  diceId: string;
}

export type DiceRemoveResponse = { ok: true; state: GameState } | { ok: false; error: string };
