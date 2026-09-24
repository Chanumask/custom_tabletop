/**
 * Request/response payload shapes for sound:play/sound:upload (Milestones 7
 * and 8). **Playing was host-only through Milestone 9** but was opened up to
 * any player in the wall-soundboard follow-up (docs/decisions.md) — a
 * physical board any player can walk up to and press wouldn't make sense
 * gated to the host alone, and gating it per-trigger-source (host-only from
 * the 2D panel, open from the wall) would mean the same event enforces two
 * different rules depending on who's asking, which is more confusing than
 * useful. Uploading a sound to the shared soundboard was never host-gated —
 * any player can contribute one (docs/decisions.md). Unlike scene:* /
 * dice:*, sound:play has no persisted GameState to broadcast back — playing
 * a sound doesn't change anything about the session, so the ack is a bare
 * ok/error and the broadcast (server -> every client, sender included — see
 * docs/decisions.md for why the sender isn't excluded here) carries just the
 * payload back out, the same shape it came in as. sound:upload *does* change
 * persisted state (`GameState.soundboard`, and optionally
 * `GameState.soundboardSlots` — see below), so it uses the ack +
 * full-broadcast pattern instead, like scene:* / dice:*.
 */
import type { GameState } from './types.js';

/** The wall soundboard (Milestone 8 follow-up) is a fixed 4x4 grid of
 * physical buttons — independent of however many sounds
 * `GameState.soundboard` grows to via uploads, since a button is a specific
 * spot on the wall, not "the Nth sound in the list." */
export const SOUNDBOARD_SLOT_COUNT = 16;

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
  /** Set when this upload comes from pressing an empty wall-soundboard
   * button (0..SOUNDBOARD_SLOT_COUNT-1) — assigns the newly-registered sound
   * to that slot in the same round trip, rather than needing a second event.
   * Omitted for an ordinary 2D-panel upload, which doesn't touch any slot. */
  slotIndex?: number;
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
