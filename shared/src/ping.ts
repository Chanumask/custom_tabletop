/**
 * table:ping — "look here!": a player marks a spot on the table and everyone
 * sees rings pulse there in their color (right-click the table). Fire and
 * forget, like player:move: never stored, relayed to the others by the
 * server (the pinger draws their own ping immediately), rate-limited.
 */
import type { Point2D } from './types.js';

export interface TablePingRequest {
  sessionId: string;
  playerId: string;
  /** Where on the table, in table-canvas coordinates (like drawing points). */
  point: Point2D;
}

/** The map grid's allowed sizes (cells per side); 0 = no grid. */
export const GRID_CELL_OPTIONS = [0, 10, 15, 20, 25, 30] as const;

export function isGridCells(value: unknown): value is number {
  return (GRID_CELL_OPTIONS as readonly unknown[]).includes(value);
}
