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
}

export type ObjectInteractResponse = { ok: true; state: GameState } | { ok: false; error: string };
