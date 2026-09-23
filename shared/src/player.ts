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
import type { Vector3 } from './types.js';

export interface PlayerMoveRequest {
  sessionId: string;
  playerId: string;
  position: Vector3;
  rotationY: number;
}
