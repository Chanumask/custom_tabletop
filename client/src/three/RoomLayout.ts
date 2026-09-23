import { DEFAULT_SPAWN_POSITION } from '@custom-tabletop/shared';
import type { RoomBounds, TableBounds } from './collision.js';

export interface RoomLayout {
  bounds: RoomBounds;
  table: TableBounds;
  wallHeight: number;
  tableHeight: number;
}

/**
 * Dimensions for the placeholder room, chosen to fit a round table seating
 * 4-5 players (radius 1.1m -> ~2.2m diameter, matching the size the user
 * asked for) with room to walk behind them. Replaced by whatever the real
 * Blender export measures once that lands (see docs/engineering/blender-workflow.md)
 * — this is a placeholder, not a spec.
 */
export const PLACEHOLDER_ROOM_LAYOUT: RoomLayout = {
  bounds: { minX: -5, maxX: 5, minZ: -4, maxZ: 4 },
  table: { center: { x: 0, z: 0 }, radius: 1.1 },
  wallHeight: 3,
  tableHeight: 0.75,
};

export const PLAYER_EYE_HEIGHT = DEFAULT_SPAWN_POSITION.y;
export const PLAYER_RADIUS = 0.35;
