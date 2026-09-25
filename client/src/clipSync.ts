/**
 * How a local YouTube player follows the shared clip (docs/decisions.md,
 * "Synced clips") — the decisions, kept pure so they're unit-tested; the
 * player wiring is in YouTubeClip.tsx.
 */

import { clipPositionAt, type SharedClip } from '@custom-tabletop/shared';

/** Where the shared clip is right now, on this machine's clock
 * (`serverOffset` = server clock - local clock, ms). */
export function sharedPosition(view: { clip: SharedClip; serverOffset: number }): number {
  return clipPositionAt(view.clip, Date.now() + view.serverOffset);
}

/** Out of step by more than this (seconds): seek to where everyone is. */
export const RESYNC_SECONDS = 1.5;
/** A jump between two polls bigger than time explains (seconds) is a seek
 * the player made in YouTube's own controls. Buffering can't cause one:
 * while it buffers the position stands still, which lags, never jumps. */
export const SEEK_JUMP_SECONDS = 2;

export interface PollSample {
  position: number;
  /** Local clock, ms. */
  at: number;
}

/** Whether the position moved in a way playback alone can't explain. */
export function isSeekJump(previous: PollSample, current: PollSample, playing: boolean): boolean {
  const expected = playing
    ? previous.position + (current.at - previous.at) / 1000
    : previous.position;
  return Math.abs(current.position - expected) > SEEK_JUMP_SECONDS;
}

/** Whether the local player needs a seek to catch up with the shared clip. */
export function needsResync(localPosition: number, sharedPosition: number): boolean {
  return Math.abs(localPosition - sharedPosition) > RESYNC_SECONDS;
}
