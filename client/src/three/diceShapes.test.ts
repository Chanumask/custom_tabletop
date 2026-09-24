import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DIE_FACES, DIE_KINDS } from '@custom-tabletop/shared';
import {
  atlasLayout,
  buildDieGeometry,
  dieShape,
  restingQuaternion,
  rollRandom,
} from './diceShapes.js';

const UP = new THREE.Vector3(0, 1, 0);

describe('dieShape', () => {
  it.each(DIE_KINDS)('%s has one face per result, numbered 1..n', (kind) => {
    const shape = dieShape(kind);
    const faces = DIE_FACES[kind];
    expect(shape.faces).toHaveLength(faces);
    if (kind !== 'd4') {
      expect(shape.faces.map((face) => face.value).sort((a, b) => a - b)).toEqual(
        Array.from({ length: faces }, (_, index) => index + 1),
      );
    }
  });

  it.each(DIE_KINDS.filter((kind) => kind !== 'd4'))(
    '%s puts opposite faces on n+1 − each other, like real dice',
    (kind) => {
      const shape = dieShape(kind);
      for (const face of shape.faces) {
        const opposite = shape.faces.find((other) => other.normal.dot(face.normal) < -0.9999);
        expect(opposite?.value).toBe(DIE_FACES[kind] + 1 - face.value);
      }
    },
  );

  it('d4 shows each face the numbers of its three corners', () => {
    const shape = dieShape('d4');
    for (const face of shape.faces) {
      expect(new Set(face.cornerValues)).toHaveProperty('size', 3);
    }
    // Every number appears on exactly three faces (it's a vertex).
    for (let value = 1; value <= 4; value++) {
      expect(shape.faces.filter((face) => face.cornerValues!.includes(value))).toHaveLength(3);
    }
  });
});

describe('restingQuaternion', () => {
  it.each(DIE_KINDS)('%s rests flat on the table with the rolled number on top', (kind) => {
    const shape = dieShape(kind);
    for (let value = 1; value <= DIE_FACES[kind]; value++) {
      const pose = restingQuaternion(shape, value, 1.234 * value);

      // The number reads up: its face (or, on a d4, its vertex) points up.
      expect(shape.upFor(value).applyQuaternion(pose).angleTo(UP)).toBeLessThan(1e-6);
      if (kind === 'd4') {
        // ...and the three faces meeting at that vertex all show it.
        const showing = shape.faces.filter((face) => face.cornerValues!.includes(value));
        expect(showing).toHaveLength(3);
      } else {
        const top = shape.faces.find((face) => face.value === value)!;
        expect(top.normal.clone().applyQuaternion(pose).angleTo(UP)).toBeLessThan(1e-6);
      }

      // Lying on a face: the lowest corners sit exactly restHeight below
      // the center, and a whole face (≥ 3 corners) touches the table.
      const heights = shape.faces
        .flatMap((face) => face.corners)
        .map((corner) => corner.clone().applyQuaternion(pose).y);
      const lowest = Math.min(...heights);
      expect(lowest).toBeCloseTo(-shape.restHeight, 6);
      const touching = new Set(
        heights.filter((y) => Math.abs(y - lowest) < 1e-6).map((y) => y.toFixed(6)),
      );
      expect(touching.size).toBe(1);
      expect(heights.filter((y) => Math.abs(y - lowest) < 1e-6).length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('rollRandom', () => {
  it('is the same stream for the same die and roll — different otherwise', () => {
    const a = rollRandom('die-1', 3);
    const b = rollRandom('die-1', 3);
    const c = rollRandom('die-1', 4);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});

describe('buildDieGeometry', () => {
  it.each(DIE_KINDS)('%s maps every face into its own atlas cell', (kind) => {
    const shape = dieShape(kind);
    const geometry = buildDieGeometry(shape);
    const { cols, rows } = atlasLayout(shape);
    const uv = geometry.getAttribute('uv');
    const cellOf = (i: number) =>
      `${Math.floor(uv.getX(i) * cols)},${Math.floor((1 - uv.getY(i)) * rows)}`;

    let vertex = 0;
    const cells = new Set<string>();
    for (const face of shape.faces) {
      const count = face.triangles.length * 3;
      const faceCells = new Set(Array.from({ length: count }, (_, k) => cellOf(vertex + k)));
      expect(faceCells.size).toBe(1); // a face never straddles two cells
      cells.add([...faceCells][0]!);
      vertex += count;
    }
    expect(cells.size).toBe(shape.faces.length); // and no two faces share one
    expect(vertex).toBe(geometry.getAttribute('position').count);
  });
});
