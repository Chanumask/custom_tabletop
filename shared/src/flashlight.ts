/**
 * Request/response payload shape for flashlight:toggle (gadgets phase 3).
 * Not host-gated: a player can only ever toggle their *own* flashlight
 * (`playerId` always comes from the requester), the same reasoning as the
 * seated toggle. Refused unless the requester currently holds the
 * flashlight (`InventoryItem.kind === 'flashlight'`).
 */
import type { GameState } from './types.js';

export interface FlashlightToggleRequest {
  sessionId: string;
  playerId: string;
}

export type FlashlightToggleResponse =
  { ok: true; state: GameState } | { ok: false; error: string };
