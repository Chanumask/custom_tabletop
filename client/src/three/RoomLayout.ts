import { DEFAULT_SPAWN_POSITION } from '@custom-tabletop/shared';
import type { Obstacle, RoomBounds, Vector2 } from './collision.js';

/** The table's play surface — where the map/drawing canvas lives. In the
 * real room it's measured from the Blender export's `Table_Top` mesh
 * (RoomLoader.ts), not hand-typed. */
export interface TableSurface {
  center: Vector2;
  halfWidth: number;
  halfDepth: number;
  /** World height of the play surface (where dice rest). */
  height: number;
}

export interface RoomLayout {
  bounds: RoomBounds;
  table: TableSurface;
  /** Solid furniture footprints (the table's own rail included). */
  obstacles: Obstacle[];
  wallHeight: number;
}

/**
 * Fallback dimensions matching the Blender room (blender/room.blend): a
 * 10m x 8m room, a square 2m game table (with a 12cm rail around it)
 * centered in it. The real values are read from the exported model at load
 * time (RoomLoader.ts); these only apply to the procedural fallback room
 * and to anything that needs a layout before the model has loaded.
 */
export const PLACEHOLDER_ROOM_LAYOUT: RoomLayout = {
  bounds: { minX: -5, maxX: 5, minZ: -4, maxZ: 4 },
  table: { center: { x: 0, z: 0 }, halfWidth: 1.0, halfDepth: 1.0, height: 0.78 },
  obstacles: [{ minX: -1.12, maxX: 1.12, minZ: -1.12, maxZ: 1.12 }],
  wallHeight: 3,
};

export const PLAYER_EYE_HEIGHT = DEFAULT_SPAWN_POSITION.y;
export const PLAYER_RADIUS = 0.3;

/** How much of the frame around the play surface the seated view keeps —
 * enough to show the table's rail as a frame without wasting the screen. */
const SEATED_FRAME_MARGIN = 1.14;

/**
 * How high above the floor the "seated" camera must hover, looking straight
 * down, for the whole play surface (plus a little rail) to fill a *square*
 * viewport at the given vertical field of view (RoomView switches to a
 * square frame while seated, so horizontal FOV equals vertical).
 */
export function seatedCameraHeight(table: TableSurface, verticalFovDeg: number): number {
  const halfExtent = Math.max(table.halfWidth, table.halfDepth) * SEATED_FRAME_MARGIN;
  const halfAngle = (verticalFovDeg * Math.PI) / 360;
  return table.height + halfExtent / Math.tan(halfAngle);
}
