/**
 * The YouTube clip everyone watches together (docs/decisions.md, "Synced
 * clips"). Server-authoritative: a playback *anchor* — where the video was
 * (`position`) at a moment on the server's clock (`anchorAt`), and whether
 * it's playing — from which every client computes where it should be now.
 * Any player can pause, play, seek or stop it; the host can lock it so only
 * the host can.
 */
export interface SharedClip {
  /** New for every play, so a stale control can't touch a newer clip. */
  id: string;
  /** The soundboard entry it came from. */
  soundId: string;
  videoId: string;
  title: string;
  /** Name of whoever started it. */
  playedBy: string;
  playing: boolean;
  /** Seconds into the video at `anchorAt`. */
  position: number;
  /** Server clock (epoch ms) when `position` was true. */
  anchorAt: number;
}

export type ClipAction = 'play' | 'pause' | 'seek' | 'stop' | 'ended';

export const CLIP_ACTIONS: readonly ClipAction[] = ['play', 'pause', 'seek', 'stop', 'ended'];

/** clip:control — a player paused/played/seeked/stopped the shared clip,
 * or it reached its end (`ended`, which a lock doesn't block). */
export interface ClipControlRequest {
  sessionId: string;
  playerId: string;
  clipId: string;
  action: ClipAction;
  /** The video position (seconds) the action happened at. */
  position: number;
}

export type ClipControlResponse = { ok: true } | { ok: false; error: string };

/** clip:lock — host only: only the host may control the clip while locked. */
export interface ClipLockRequest {
  sessionId: string;
  playerId: string;
  locked: boolean;
}

export type ClipLockResponse = { ok: true } | { ok: false; error: string };

export const CLIP_LOCKED_ERROR = 'The host has locked the TV.';

/** Longest position accepted (a day) — anything past is a bogus value. */
export const MAX_CLIP_POSITION = 24 * 60 * 60;

/** Where the shared clip should be at `serverNow` (server clock, ms). Pure. */
export function clipPositionAt(clip: SharedClip, serverNow: number): number {
  return clip.playing
    ? clip.position + Math.max(0, serverNow - clip.anchorAt) / 1000
    : clip.position;
}
