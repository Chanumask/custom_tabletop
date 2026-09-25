/**
 * Request/response payload shape for walkie:transmit (gadgets phase 4) — a
 * private two-way channel, not a room-wide broadcast like chat. Refused
 * unless the requester holds a walkie-talkie (`InventoryItem.kind ===
 * 'walkie'`) *and* someone else currently holds the other one — "nobody's
 * listening" otherwise. The resulting log entry (`LogEntry` kind `'radio'`)
 * reaches only the two of them, via the same server-side privacy filter a
 * secret dice roll's `visibleTo` uses (server/src/privacy.ts) — never a
 * targeted socket emit, so it's covered by the exact same tested mechanism.
 */
import type { GameState } from './types.js';

export interface WalkieTransmitRequest {
  sessionId: string;
  playerId: string;
  text: string;
}

export type WalkieTransmitResponse = { ok: true; state: GameState } | { ok: false; error: string };
