/**
 * Request/response payload shapes for sound:play (Milestone 7). Host-only
 * (the roadmap's own default scope). Unlike scene:* / dice:*, there's no
 * persisted GameState to broadcast back — playing a sound doesn't change
 * anything about the session, so the ack is a bare ok/error and the
 * broadcast (server -> every client, sender included — see
 * docs/decisions.md for why the sender isn't excluded here) carries just
 * the payload back out, the same shape it came in as.
 */
import type { GameState } from './types.js';

export interface SoundPlayRequest {
  sessionId: string;
  playerId: string;
  /** A preset id from the client's own small sound catalog
   * (client/src/sounds.ts) — the server never inspects it, just relays it. */
  soundId: string;
}

export type SoundPlayResponse = { ok: true } | { ok: false; error: string };

/**
 * Request/response payload shapes for player:mute/player:unmute. Not purely
 * host-gated: a player can always mute/unmute *themselves* (self-service,
 * like muting your own mic), and the host can additionally mute/unmute any
 * player (moderation) — see docs/decisions.md. `muted` here is a visible
 * status flag only; this app has no voice chat to actually silence.
 */
export interface PlayerMuteRequest {
  sessionId: string;
  playerId: string;
  targetPlayerId: string;
}

export type PlayerMuteResponse = { ok: true; state: GameState } | { ok: false; error: string };

export interface PlayerUnmuteRequest {
  sessionId: string;
  playerId: string;
  targetPlayerId: string;
}

export type PlayerUnmuteResponse = { ok: true; state: GameState } | { ok: false; error: string };
