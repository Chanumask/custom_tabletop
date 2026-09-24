import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { describeRoom } from './RoomLoader.js';
import { PLACEHOLDER_ROOM_LAYOUT } from './RoomLayout.js';

function box(name: string, size: [number, number, number], at: [number, number, number]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size));
  mesh.name = name;
  mesh.position.set(...at);
  return mesh;
}

describe('describeRoom', () => {
  it('reads the play surface, colliders, bounds and wall height from the model', () => {
    const root = new THREE.Group();
    root.add(box('Floor', [10, 0.01, 8], [0, -0.005, 0]));
    root.add(box('Ceiling', [10, 0.06, 8], [0, 3.03, 0]));
    root.add(box('Table_Top', [2, 0.04, 2], [0.5, 0.76, -0.25]));
    root.add(box('COL_Table', [2.24, 1, 2.24], [0.5, 0.5, -0.25]));
    root.add(box('COL_Bookshelf', [1.4, 1, 0.6], [-4, 0.5, -3.7]));

    const room = describeRoom(root);

    expect(room.layout.table.center.x).toBeCloseTo(0.5);
    expect(room.layout.table.center.z).toBeCloseTo(-0.25);
    expect(room.layout.table.halfWidth).toBeCloseTo(1);
    expect(room.layout.table.halfDepth).toBeCloseTo(1);
    expect(room.layout.table.height).toBeCloseTo(0.78);
    expect(room.layout.obstacles).toHaveLength(2);
    expect(room.layout.obstacles[1]!.minX).toBeCloseTo(-4.7);
    expect(room.layout.bounds.maxX).toBeCloseTo(5);
    expect(room.layout.bounds.minZ).toBeCloseTo(-4);
    expect(room.layout.wallHeight).toBeCloseTo(3);
    expect(room.tableTop?.name).toBe('Table_Top');
  });

  it('hides collider boxes so they never render', () => {
    const root = new THREE.Group();
    const collider = box('COL_Chair_N', [0.6, 1, 0.6], [0, 0.5, 1.5]);
    root.add(collider);
    describeRoom(root);
    expect(collider.visible).toBe(false);
  });

  it('falls back to the placeholder layout for anything the model lacks', () => {
    const room = describeRoom(new THREE.Group());
    expect(room.layout).toEqual(PLACEHOLDER_ROOM_LAYOUT);
    expect(room.tableTop).toBeNull();
    expect(room.whiteboardSurface).toBeNull();
    expect(room.chandelier).toBeNull();
  });
});
