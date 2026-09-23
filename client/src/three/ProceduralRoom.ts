import * as THREE from 'three';
import { PLACEHOLDER_ROOM_LAYOUT, type RoomLayout } from './RoomLayout.js';

const WALL_THICKNESS = 0.2;

// Warm, wood/lamp-toned placeholder palette — stands in for the real
// Blender-built "cozy tabletop game room" (docs/decisions.md, Milestone 3)
// until that asset exists.
const COLORS = {
  floor: 0x8a5a34,
  wall: 0x5c4632,
  table: 0x6b3f22,
  shelf: 0x3e2c1c,
  window: 0xcfe8ff,
} as const;

function addFloor(group: THREE.Group, layout: RoomLayout): void {
  const { bounds } = layout;
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const material = new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.85 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  group.add(floor);
}

function addWalls(group: THREE.Group, layout: RoomLayout): void {
  const { bounds, wallHeight } = layout;
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const material = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.9 });

  const northSouth = () =>
    new THREE.Mesh(
      new THREE.BoxGeometry(width + WALL_THICKNESS * 2, wallHeight, WALL_THICKNESS),
      material,
    );
  const northWall = northSouth();
  northWall.position.set(centerX, wallHeight / 2, bounds.minZ - WALL_THICKNESS / 2);
  group.add(northWall);

  const southWall = northSouth();
  southWall.position.set(centerX, wallHeight / 2, bounds.maxZ + WALL_THICKNESS / 2);
  group.add(southWall);

  const eastWest = () =>
    new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICKNESS, wallHeight, depth + WALL_THICKNESS * 2),
      material,
    );
  const eastWall = eastWest();
  eastWall.position.set(bounds.maxX + WALL_THICKNESS / 2, wallHeight / 2, centerZ);
  group.add(eastWall);

  const westWall = eastWest();
  westWall.position.set(bounds.minX - WALL_THICKNESS / 2, wallHeight / 2, centerZ);
  group.add(westWall);
}

function addTable(group: THREE.Group, layout: RoomLayout): void {
  const { table, tableHeight } = layout;
  const material = new THREE.MeshStandardMaterial({ color: COLORS.table, roughness: 0.6 });

  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(table.radius, table.radius, 0.08, 32),
    material,
  );
  top.position.set(table.center.x, tableHeight, table.center.z);
  group.add(top);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, tableHeight, 16),
    material,
  );
  pedestal.position.set(table.center.x, tableHeight / 2, table.center.z);
  group.add(pedestal);
}

/** A couple of cheap blockout shapes so the placeholder reads as "a cozy
 * room" rather than a bare test box — a bookshelf silhouette and a window
 * panel. Both get replaced by real geometry once the Blender asset lands. */
function addFurnishingBlockouts(group: THREE.Group, layout: RoomLayout): void {
  const { bounds, wallHeight } = layout;

  const shelfMaterial = new THREE.MeshStandardMaterial({ color: COLORS.shelf, roughness: 0.8 });
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2, 0.4), shelfMaterial);
  shelf.position.set(bounds.minX + 0.4, 1, bounds.minZ + 1.6);
  group.add(shelf);

  const windowMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.window,
    emissive: 0x223344,
    emissiveIntensity: 0.3,
  });
  const windowPanel = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), windowMaterial);
  windowPanel.position.set(bounds.maxX - 0.01, wallHeight * 0.55, 0);
  windowPanel.rotation.y = -Math.PI / 2;
  group.add(windowPanel);
}

function addLighting(group: THREE.Group, layout: RoomLayout): void {
  const { bounds, table } = layout;

  const ambient = new THREE.AmbientLight(0xffe9c7, 0.5);
  group.add(ambient);

  const overTable = new THREE.PointLight(0xffc98a, 1.4, 9, 2);
  overTable.position.set(table.center.x, 2.4, table.center.z);
  group.add(overTable);

  const corner = new THREE.PointLight(0xffddb0, 0.7, 7, 2);
  corner.position.set(bounds.minX + 1, 2.2, bounds.maxZ - 1);
  group.add(corner);
}

/** Builds the placeholder "cozy tabletop game room" directly in Three.js —
 * no Blender/glTF involved. Stands in until the real asset exists (see
 * docs/engineering/blender-workflow.md and docs/decisions.md, Milestone 3). */
export function buildProceduralRoom(layout: RoomLayout = PLACEHOLDER_ROOM_LAYOUT): THREE.Group {
  const group = new THREE.Group();
  group.name = 'procedural-placeholder-room';

  addFloor(group, layout);
  addWalls(group, layout);
  addTable(group, layout);
  addFurnishingBlockouts(group, layout);
  addLighting(group, layout);

  return group;
}
