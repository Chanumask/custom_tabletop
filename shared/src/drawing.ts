/**
 * Request payload shapes for the drawing:* events (Milestone 5). Like
 * player:move, these are fire-and-forget — no ack, no full-state broadcast
 * — since a stroke can fire many times a second while a player draws (see
 * docs/engineering/architecture.md's "Performance" section, which uses
 * exactly this event as its own worked example of a delta payload). Not
 * host-gated: any player can draw. A malformed payload is dropped silently
 * server-side rather than acked with an error (server/src/validation.ts).
 */
import type { Point2D } from './types.js';

export interface DrawingStartRequest {
  sessionId: string;
  playerId: string;
  sceneId: string;
  /** Client-generated (crypto.randomUUID()) — ties start/update/end/delete
   * to the same stroke. */
  drawingId: string;
  point: Point2D;
}

export interface DrawingUpdateRequest {
  sessionId: string;
  drawingId: string;
  point: Point2D;
}

export interface DrawingEndRequest {
  sessionId: string;
  drawingId: string;
}

export interface DrawingDeleteRequest {
  sessionId: string;
  sceneId: string;
  drawingId: string;
}
