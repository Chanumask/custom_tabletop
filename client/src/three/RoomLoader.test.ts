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

  it('turns every Chair_* into a seat that faces the table', () => {
    const root = new THREE.Group();
    root.add(box('Table_Top', [2, 0.04, 2], [0, 0.76, 0]));
    root.add(box('Chair_S', [0.6, 1, 0.6], [0, 0.5, 1.56]));
    root.add(box('Chair_E', [0.6, 1, 0.6], [1.56, 0.5, 0]));
    root.add(box('COL_Chair_S', [0.6, 1, 0.6], [0, 0.5, 1.56])); // a collider, not a seat

    const { seats } = describeRoom(root);
    expect(seats).toHaveLength(2);
    const south = seats.find((seat) => seat.z > 1)!;
    // Facing -Z (toward the table): yaw π, i.e. a +Z-facing model turned round.
    expect(Math.abs(south.yaw)).toBeCloseTo(Math.PI);
    const east = seats.find((seat) => seat.x > 1)!;
    expect(east.yaw).toBeCloseTo(-Math.PI / 2);
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
    expect(room.seats).toEqual([]);
  });
});

describe('describeRoom cozy anchors', () => {
  it('finds the TV screen, window, fire, flames, glow spots and beams', () => {
    const root = new THREE.Group();
    root.add(box('TV_Screen', [0.76, 0.57, 0.001], [0, 0.67, 3.5]));
    root.add(box('Window_View', [1.3, 1.15, 0.001], [2.95, 1.9, -3.99]));
    root.add(box('Fireplace_Embers', [0.3, 0.01, 0.6], [-4.7, 0.12, 0.35]));
    const fire = new THREE.Object3D();
    fire.name = 'Fireplace_Fire';
    fire.position.set(-4.72, 0.2, 0.35);
    root.add(fire);
    const glow = new THREE.Object3D();
    glow.name = 'Glow_Lantern_01';
    glow.position.set(0.42, 1.2, 3.72);
    root.add(glow);
    root.add(box('Flame_Candle_0', [0.01, 0.03, 0.01], [-4.66, 1.8, 1.0]));
    root.add(box('Flame_OilLamp', [0.01, 0.03, 0.01], [4.7, 1.2, 2.0]));
    root.add(box('Beam_0', [10, 0.2, 0.2], [0, 2.9, 2.6]));

    const room = describeRoom(root);

    expect(room.tvScreen?.name).toBe('TV_Screen');
    expect(room.windowViews.map((pane) => pane.name)).toEqual(['Window_View']);
    expect(room.embers?.name).toBe('Fireplace_Embers');
    expect(room.fireSpot?.toArray()).toEqual([-4.72, 0.2, 0.35]);
    expect(room.flames.map((flame) => flame.name).sort()).toEqual([
      'Flame_Candle_0',
      'Flame_OilLamp',
    ]);
    expect(room.glowSpots).toHaveLength(1);
    expect(room.beams).toHaveLength(1);
    expect(room.beams[0]!.min.y).toBeCloseTo(2.8);
  });

  it('leaves them empty when the model has none', () => {
    const room = describeRoom(new THREE.Group());
    expect(room.tvScreen).toBeNull();
    expect(room.fireSpot).toBeNull();
    expect(room.flames).toEqual([]);
  });
});
