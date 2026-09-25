/**
 * Request/response payload shapes for item:take/item:drop — the room
 * chest's gadgets (phase 1: camera, flashlight, walkie-talkies, calculator
 * — see types.ts's `STARTING_INVENTORY`). Not host-gated: a player can only
 * ever take/drop their *own* held item (`playerId` always comes from the
 * requester, never a target), the same "no per-player authority question"
 * reasoning as the table's seated toggle (object:interact, Milestone 8).
 * Ack + full-broadcast, like scene:* / object:interact — infrequent enough
 * (an occasional keypress in the chest dialog, not a per-frame stream) that
 * a full GameState round trip is simpler than a delta.
 */
import type { GameState } from './types.js';

export interface ItemTakeRequest {
  sessionId: string;
  playerId: string;
  itemId: string;
}

export type ItemTakeResponse = { ok: true; state: GameState } | { ok: false; error: string };

export interface ItemDropRequest {
  sessionId: string;
  playerId: string;
  itemId: string;
}

export type ItemDropResponse = { ok: true; state: GameState } | { ok: false; error: string };
