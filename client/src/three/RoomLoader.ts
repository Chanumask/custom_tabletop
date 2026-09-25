import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { preloadRoom } from '../roomAssets.js';
import type { Obstacle } from './collision.js';
import type { Seat } from './avatarMotion.js';
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
  /** Where seated players' characters sit (every `Chair_*`), facing the table. */
  seats: Seat[];
  /** The console TV's screen rectangle (`TV_Screen`) — where shared
   * YouTube clips play. */
  tvScreen: THREE.Mesh | null;
  /** Every window pane (`Window_View*`) — each looks out on the world
   * outside (outside/OutsideWorld.ts). */
  windowViews: THREE.Mesh[];
  /** Center of the fireplace's fire (`Fireplace_Fire`), and its ember bed. */
  fireSpot: THREE.Vector3 | null;
  embers: THREE.Mesh | null;
  /** Every candle/lamp flame (`Flame_*`) — made to glow and flicker. */
  flames: THREE.Mesh[];
  /** Other soft light sources to halo (`Glow_*`, e.g. lantern glass). */
  glowSpots: THREE.Vector3[];
  /** Ceiling beams (`Beam_*`) — fairy lights hang along them. */
  beams: THREE.Box3[];
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
 * - every `Chair_*` -> a seat facing the table (where a seated player's
 *   character sits),
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

  // Sorted by name, so a seat's index (Player.seatIndex) always means the
  // same chair. Each faces straight across its side of the table — with two
  // chairs to a side, facing the table's centre would angle them inward.
  const chairs: { name: string; at: THREE.Vector3 }[] = [];
  root.traverse((node) => {
    if (node.name.startsWith('Chair_')) {
      chairs.push({ name: node.name, at: node.getWorldPosition(new THREE.Vector3()) });
    }
  });
  const seats: Seat[] = chairs
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ at }) => {
      const dx = table.center.x - at.x;
      const dz = table.center.z - at.z;
      const alongZ = Math.abs(dz) >= Math.abs(dx);
      return {
        x: at.x,
        z: at.z,
        yaw: alongZ ? Math.atan2(0, dz) : Math.atan2(dx, 0),
      };
    });

  const flames: THREE.Mesh[] = [];
  const glowSpots: THREE.Vector3[] = [];
  const beams: THREE.Box3[] = [];
  root.traverse((node) => {
    if (node.name.startsWith('Flame_') && node instanceof THREE.Mesh) {
      flames.push(node);
    } else if (node.name.startsWith('Glow_')) {
      glowSpots.push(node.getWorldPosition(new THREE.Vector3()));
    } else if (node.name.startsWith('Beam_')) {
      beams.push(boxOf(node));
    }
  });
  const fire = root.getObjectByName('Fireplace_Fire');
  const embers = root.getObjectByName('Fireplace_Embers');
  const tvScreen = root.getObjectByName('TV_Screen');
  const windowViews: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.Mesh && node.name.startsWith('Window_View')) windowViews.push(node);
  });

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
    seats,
    tvScreen: tvScreen instanceof THREE.Mesh ? tvScreen : null,
    windowViews,
    fireSpot: fire ? fire.getWorldPosition(new THREE.Vector3()) : null,
    embers: embers instanceof THREE.Mesh ? embers : null,
    flames,
    glowSpots,
    beams,
  };
}

/** Loads the Blender-exported room (`public/models/room.glb`) — from the
 * bytes the join screen already started downloading (roomAssets.ts). */
export async function loadRoom(): Promise<RoomAsset> {
  // The room is exported with meshopt-compressed geometry and WebP textures
  // (docs/engineering/blender-workflow.md) — about a third of the size.
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(await preloadRoom(), '');
  return describeRoom(gltf.scene);
}
