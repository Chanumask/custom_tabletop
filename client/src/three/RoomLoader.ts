import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Obstacle } from './collision.js';
import { PLACEHOLDER_ROOM_LAYOUT, type RoomLayout, type TableSurface } from './RoomLayout.js';

export interface RoomAsset {
  object3D: THREE.Object3D;
  layout: RoomLayout;
  /** The play surface mesh — gets the map/drawing canvas texture. */
  tableTop: THREE.Mesh | null;
  /** The whiteboard's writable face — gets the whiteboard text texture. */
  whiteboardSurface: THREE.Mesh | null;
  /** Hidden while seated: it hangs right where the top-down camera sits. */
  chandelier: THREE.Object3D | null;
}

/** Blender objects named `COL_*` are invisible collision footprints. */
export const COLLIDER_PREFIX = 'COL_';

function boxOf(object: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(object);
}

/**
 * Reads everything gameplay needs straight out of the exported room model,
 * so the Blender file stays the single source of truth for room geometry
 * (docs/engineering/blender-workflow.md) instead of numbers hand-copied
 * into code that silently drift apart when the room changes:
 *
 * - every `COL_*` object -> an `Obstacle` footprint (and hidden),
 * - `Table_Top` -> the play surface's center/size/height,
 * - `Floor` -> the walkable bounds, `Ceiling` -> the wall height,
 * - `Whiteboard_Surface` / `Chandelier` -> handed back for the caller.
 *
 * Anything missing falls back to `fallback` (so a stripped-down model still
 * loads). Pure apart from hiding the colliders — testable with a plain
 * THREE scene graph, no WebGL.
 */
export function describeRoom(
  root: THREE.Object3D,
  fallback: RoomLayout = PLACEHOLDER_ROOM_LAYOUT,
): RoomAsset {
  root.updateMatrixWorld(true);

  const obstacles: Obstacle[] = [];
  root.traverse((node) => {
    if (node.name.startsWith(COLLIDER_PREFIX)) {
      const box = boxOf(node);
      obstacles.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
      node.visible = false;
    }
  });

  const tableNode = root.getObjectByName('Table_Top');
  let table: TableSurface = fallback.table;
  if (tableNode) {
    const box = boxOf(tableNode);
    table = {
      center: { x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2 },
      halfWidth: (box.max.x - box.min.x) / 2,
      halfDepth: (box.max.z - box.min.z) / 2,
      height: box.max.y,
    };
  }

  const floor = root.getObjectByName('Floor');
  const floorBox = floor ? boxOf(floor) : null;
  const ceiling = root.getObjectByName('Ceiling');

  const whiteboard = root.getObjectByName('Whiteboard_Surface');
  return {
    object3D: root,
    layout: {
      bounds: floorBox
        ? { minX: floorBox.min.x, maxX: floorBox.max.x, minZ: floorBox.min.z, maxZ: floorBox.max.z }
        : fallback.bounds,
      table,
      obstacles: obstacles.length > 0 ? obstacles : fallback.obstacles,
      wallHeight: ceiling ? boxOf(ceiling).min.y : fallback.wallHeight,
    },
    tableTop: tableNode instanceof THREE.Mesh ? tableNode : null,
    whiteboardSurface: whiteboard instanceof THREE.Mesh ? whiteboard : null,
    chandelier: root.getObjectByName('Chandelier') ?? null,
  };
}

/** Loads the Blender-exported room (`public/models/room.glb`). */
export async function loadRoom(gltfUrl: string): Promise<RoomAsset> {
  const gltf = await new GLTFLoader().loadAsync(gltfUrl);
  return describeRoom(gltf.scene);
}
