/**
 * Request/response payload shapes for sound:play/sound:upload (Milestones 7
 * and 8). Playing is host-only (the roadmap's own default scope); uploading
 * a sound to the shared soundboard is not — any player can contribute one
 * (docs/decisions.md). Unlike scene:* / dice:*, sound:play has no persisted
 * GameState to broadcast back — playing a sound doesn't change anything
 * about the session, so the ack is a bare ok/error and the broadcast
 * (server -> every client, sender included — see docs/decisions.md for why
 * the sender isn't excluded here) carries just the payload back out, the
 * same shape it came in as. sound:upload *does* change persisted state
 * (`GameState.soundboard`), so it uses the ack + full-broadcast pattern
 * instead, like scene:* / dice:*.
 */
import type { GameState } from './types.js';

export interface SoundPlayRequest {
  sessionId: string;
  playerId: string;
  /** Must match an id already in `GameState.soundboard` — the server
   * validates this (Milestone 8), unlike Milestone 7's original
   * unvalidated client-catalog-only lookup. */
  soundId: string;
}

export type SoundPlayResponse = { ok: true } | { ok: false; error: string };

export interface SoundUploadRequest {
  sessionId: string;
  playerId: string;
  /** Client-generated (crypto.randomUUID()), same pattern as diceId/drawingId. */
  soundId: string;
  name: string;
  /** An absolute URL to the uploaded audio file (see client/src/uploads.ts —
   * the file itself goes over a plain REST POST, not this socket event;
   * this just registers the resulting URL into the shared soundboard). */
  url: string;
}

export type SoundUploadResponse = { ok: true; state: GameState } | { ok: false; error: string };

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
