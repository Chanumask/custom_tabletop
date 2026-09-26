/**
 * Request/response payload shape for object:interact (Milestone 8) — one
 * generic event for every room interactable, following
 * docs/engineering/architecture.md's own suggested naming ("e.g.
 * object:interact"). The server dispatches on `objectId`
 * (server/src/sessionStore.ts's `toggleLight`/`toggleSeated`) rather than
 * this shape enumerating a payload per object — there are only a couple of
 * interactables so far and a generic id keeps this event open to more
 * without a new type per object.
 *
 * Not host-gated: toggling the room light affects every player equally (no
 * authority question to protect), and toggling `seated` only ever changes
 * the requesting player's own record. Infrequent enough (an occasional
 * keypress, not a per-frame stream) to use the same ack +
 * full-GameState-broadcast pattern as scene:* / dice:*.
 */
import type { GameState } from './types.js';

export interface ObjectInteractRequest {
  sessionId: string;
  playerId: string;
  objectId: string;
  /** Table only: sit down (true) or stand up (false) explicitly, rather
   * than toggling — so a client that missed a state update can't flip the
   * server the wrong way. Absent = toggle (older clients). */
  seated?: boolean;
  /** Table only, when sitting down: the chair wanted (see
   * `Player.seatIndex`). Refused if someone else is already on it. */
  seatIndex?: number;
  /** A switch's wanted state — the reading lamp on (true) or off, a candle
   * group lit — rather than a toggle, for the same reason as `seated`.
   * Absent = toggle. */
  on?: boolean;
  /** Which one, where there are several: the candle group (room.ts). */
  target?: string;
}

/** The highest chair index a request may name (the room has far fewer). */
export const MAX_SEAT_INDEX = 63;

export type ObjectInteractResponse = { ok: true; state: GameState } | { ok: false; error: string };
