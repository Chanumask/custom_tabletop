/**
 * Request/response payload shape for photo:capture — the chest's camera
 * (gadgets phase 2). The client captures a screenshot of the room, uploads
 * it over the existing `/uploads/images` REST route (client/src/uploads.ts
 * — the same route the map background uses), then this event registers
 * the resulting URL as a new pinned photo. Refused unless the requester is
 * currently holding the camera (`InventoryItem.kind === 'camera'`).
 */
import type { GameState } from './types.js';

/** The wall pinboard's fixed size — always full of the most recent photos,
 * oldest dropped first once it's full (unlike the wall soundboard's
 * `soundboardSlots`, there's no manual per-slot placement to preserve). */
export const PINBOARD_SLOT_COUNT = 12;

/** At most one photo per player this often: the server refuses sooner ones,
 * and the camera doesn't even take them (so none is uploaded for nothing). */
export const PHOTO_MIN_INTERVAL_MS = 2000;

export interface PhotoCaptureRequest {
  sessionId: string;
  playerId: string;
  /** Where the already-uploaded photo is. Only one of this server's own
   * image uploads is accepted; the server keeps just its path
   * (`/uploads/images/<name>`), and each client loads it from its server. */
  url: string;
}

export type PhotoCaptureResponse = { ok: true; state: GameState } | { ok: false; error: string };
