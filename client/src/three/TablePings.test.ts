import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TablePings } from './TablePings.js';

describe('TablePings', () => {
  it('pulses rings at the spot, then clears itself away', () => {
    const scene = new THREE.Scene();
    const pings = new TablePings(scene);
    pings.ping(0.4, 0.78, -0.2, '#3d7fdb');
    expect(pings.active).toBe(1);

    const group = scene.getObjectByName('table-pings')!.children[0]!;
    expect(group.position.x).toBeCloseTo(0.4);
    expect(group.position.z).toBeCloseTo(-0.2);
    expect(group.position.y).toBeGreaterThan(0.78); // on top of the table

    pings.update(0.5);
    const rings = group.children.filter(
      (child) => (child as THREE.Mesh).geometry.type === 'RingGeometry',
    );
    expect(rings.filter((ring) => ring.visible).length).toBeGreaterThan(0);

    pings.update(3);
    expect(pings.active).toBe(0);
    expect(scene.getObjectByName('table-pings')!.children).toHaveLength(0);
  });

  it('dispose removes everything from the scene', () => {
    const scene = new THREE.Scene();
    const pings = new TablePings(scene);
    pings.ping(0, 0.78, 0, '#d9443b');
    pings.dispose();
    expect(scene.getObjectByName('table-pings')).toBeUndefined();
  });
});
