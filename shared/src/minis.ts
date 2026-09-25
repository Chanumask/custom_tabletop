/**
 * Minis and moving dice on the table (docs/decisions.md, "Minis"). Each
 * player has one miniature of their own character they can put on the
 * table and drag around; dice can be dragged too. Moves are frequent while
 * dragging, so — like player:move — they're fire-and-forget: the server
 * checks them, keeps the result in GameState (late joiners, saved tables)
 * and relays them to everyone else.
 */
import type { Point2D, Vector3 } from './types.js';

/** The table surface's coordinate space (the same as drawings and pings):
 * 0..TABLE_UNITS on both axes, the map's top-left at 0,0. */
export const TABLE_UNITS = 1024;

/** mini:move — put a mini on the table, move it, or take it off (`point:
 * null`). Your own mini; the host may move anyone's. */
export interface MiniMoveRequest {
  sessionId: string;
  playerId: string;
  /** Whose mini. */
  targetPlayerId: string;
  point: Point2D | null;
}

/** mini:moved — relayed to everyone else at the table. */
export interface MiniMoved {
  sessionId: string;
  targetPlayerId: string;
  point: Point2D | null;
}

/** dice:move — drag a die across the table. Your own dice; the host may
 * move any. `position` is where it rests (as in `Dice.position`). */
export interface DiceMoveRequest {
  sessionId: string;
  playerId: string;
  diceId: string;
  position: Vector3;
}

/** dice:moved — relayed to everyone else at the table. */
export interface DiceMoved {
  sessionId: string;
  diceId: string;
  position: Vector3;
}

/** Keeps a point on the table surface. */
export function clampToTable(point: Point2D): Point2D {
  const clamp = (value: number) => Math.min(TABLE_UNITS, Math.max(0, value));
  return { x: clamp(point.x), y: clamp(point.y) };
}
