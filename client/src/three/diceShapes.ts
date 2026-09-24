import * as THREE from 'three';
import { DIE_FACES, type DieKind } from '@custom-tabletop/shared';

/** One flat face of a die, in the die's local space. */
export interface DieFace {
  /** The number printed in the middle of the face (d6–d20). */
  value: number;
  /** Outward unit normal. */
  normal: THREE.Vector3;
  centroid: THREE.Vector3;
  /** The face's corners, counter-clockwise seen from outside. */
  corners: THREE.Vector3[];
  /** d4 only: the numbers printed near each corner (same order as
   * `corners`) — a d4 is read at its top vertex, not a top face. */
  cornerValues?: number[];
  /** The face as triangles (a fan over `corners`). */
  triangles: [THREE.Vector3, THREE.Vector3, THREE.Vector3][];
}

export interface DieShape {
  kind: DieKind;
  faces: DieFace[];
  /** Height of the die's center above the table when it lies on a face. */
  restHeight: number;
  /** The local direction that must point straight up to show `value`. */
  upFor(value: number): THREE.Vector3;
}

/** Circumradius per kind: roughly the same apparent size on the table. */
const RADIUS: Record<DieKind, number> = {
  d4: 0.1,
  d6: 0.085,
  d8: 0.085,
  d10: 0.08,
  d12: 0.085,
  d20: 0.09,
};

const cache = new Map<DieKind, DieShape>();

/** The shape (faces, numbering, resting height) of a die kind. Cached. */
export function dieShape(kind: DieKind): DieShape {
  let shape = cache.get(kind);
  if (!shape) {
    shape = buildShape(kind);
    cache.set(kind, shape);
  }
  return shape;
}

function buildShape(kind: DieKind): DieShape {
  const radius = RADIUS[kind];
  const faces = groupIntoFaces(rawTriangles(kind, radius));
  if (faces.length !== (kind === 'd4' ? 4 : DIE_FACES[kind])) {
    throw new Error(`${kind}: expected ${DIE_FACES[kind]} faces, got ${faces.length}`);
  }

  if (kind === 'd4') {
    return buildD4(faces);
  }

  numberOppositePairs(faces, DIE_FACES[kind]);
  const byValue = new Map(faces.map((face) => [face.value, face]));
  // Lying on a face, the center is that face's plane distance up.
  const restHeight = Math.abs(faces[0]!.centroid.dot(faces[0]!.normal));
  return {
    kind,
    faces,
    restHeight,
    upFor: (value) => byValue.get(value)?.normal.clone() ?? new THREE.Vector3(0, 1, 0),
  };
}

/**
 * A d4 is numbered at its vertices: each face shows the numbers of its
 * three corners, and the result is the number at the top — so "value up"
 * means that *vertex* points up (the opposite face lies on the table).
 */
function buildD4(faces: DieFace[]): DieShape {
  const vertices: THREE.Vector3[] = [];
  for (const face of faces) {
    for (const corner of face.corners) {
      if (!vertices.some((known) => known.distanceTo(corner) < 1e-6)) {
        vertices.push(corner);
      }
    }
  }
  vertices.sort(compareVectors);
  const valueOf = (corner: THREE.Vector3) =>
    vertices.findIndex((vertex) => vertex.distanceTo(corner) < 1e-6) + 1;

  faces.forEach((face, index) => {
    face.value = index + 1; // unused for reading; keeps values unique
    face.cornerValues = face.corners.map(valueOf);
  });
  const restHeight = Math.abs(faces[0]!.centroid.dot(faces[0]!.normal));
  return {
    kind: 'd4',
    faces,
    restHeight,
    upFor: (value) => (vertices[value - 1] ?? vertices[0]!).clone().normalize(),
  };
}

/** The die's surface as triangles, before grouping into faces. */
function rawTriangles(
  kind: DieKind,
  radius: number,
): [THREE.Vector3, THREE.Vector3, THREE.Vector3][] {
  if (kind === 'd10') {
    return trapezohedronTriangles(radius);
  }
  const geometry =
    kind === 'd4'
      ? new THREE.TetrahedronGeometry(radius, 0)
      : kind === 'd6'
        ? new THREE.BoxGeometry(
            (radius * 2) / Math.sqrt(3),
            (radius * 2) / Math.sqrt(3),
            (radius * 2) / Math.sqrt(3),
          )
        : kind === 'd8'
          ? new THREE.OctahedronGeometry(radius, 0)
          : kind === 'd12'
            ? new THREE.DodecahedronGeometry(radius, 0)
            : new THREE.IcosahedronGeometry(radius, 0);
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = flat.getAttribute('position');
  const triangles: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
  for (let i = 0; i < position.count; i += 3) {
    triangles.push([
      new THREE.Vector3().fromBufferAttribute(position, i),
      new THREE.Vector3().fromBufferAttribute(position, i + 1),
      new THREE.Vector3().fromBufferAttribute(position, i + 2),
    ]);
  }
  geometry.dispose();
  flat.dispose();
  return triangles;
}

/**
 * A d10: the pentagonal trapezohedron — two apexes and two staggered rings
 * of five, ten kite faces. The apex height makes each kite planar:
 * h = z·(1 + cos 36°)/(1 − cos 36°) for rings at ±z (ring radius 1).
 */
function trapezohedronTriangles(radius: number): [THREE.Vector3, THREE.Vector3, THREE.Vector3][] {
  const cos36 = Math.cos(Math.PI / 5);
  const ringHeight = 0.105;
  const apexHeight = (ringHeight * (1 + cos36)) / (1 - cos36);
  const scale = radius / Math.max(1, apexHeight);
  const top = new THREE.Vector3(0, apexHeight, 0).multiplyScalar(scale);
  const bottom = new THREE.Vector3(0, -apexHeight, 0).multiplyScalar(scale);
  const ring = (index: number, offset: number, y: number) => {
    const angle = ((index % 5) * 2 * Math.PI) / 5 + offset;
    return new THREE.Vector3(Math.cos(angle), y, Math.sin(angle)).multiplyScalar(scale);
  };
  const upper = (k: number) => ring(k, 0, ringHeight);
  const lower = (k: number) => ring(k, Math.PI / 5, -ringHeight);

  const triangles: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
  for (let k = 0; k < 5; k++) {
    // Upper kite: top, U(k), L(k), U(k+1). Lower kite: bottom, L(k), U(k+1), L(k+1).
    triangles.push([top, upper(k), lower(k)], [top, lower(k), upper(k + 1)]);
    triangles.push([bottom, lower(k), upper(k + 1)], [bottom, upper(k + 1), lower(k + 1)]);
  }
  return triangles.map(outwardWinding);
}

function outwardWinding(
  triangle: [THREE.Vector3, THREE.Vector3, THREE.Vector3],
): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const [a, b, c] = triangle;
  const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  const center = new THREE.Vector3().add(a).add(b).add(c);
  return normal.dot(center) < 0 ? [a, c, b] : triangle;
}

/** Groups coplanar triangles (same outward normal) into faces. */
function groupIntoFaces(triangles: [THREE.Vector3, THREE.Vector3, THREE.Vector3][]): DieFace[] {
  const faces: DieFace[] = [];
  for (const raw of triangles) {
    const triangle = outwardWinding(raw);
    const [a, b, c] = triangle;
    const normal = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .normalize();
    let face = faces.find((candidate) => candidate.normal.dot(normal) > 0.9999);
    if (!face) {
      face = { value: 0, normal, centroid: new THREE.Vector3(), corners: [], triangles: [] };
      faces.push(face);
    }
    face.triangles.push(triangle);
    for (const vertex of triangle) {
      if (!face.corners.some((corner) => corner.distanceTo(vertex) < 1e-6)) {
        face.corners.push(vertex.clone());
      }
    }
  }

  for (const face of faces) {
    face.centroid = face.corners
      .reduce((sum, corner) => sum.add(corner), new THREE.Vector3())
      .divideScalar(face.corners.length);
    sortCornersCounterClockwise(face);
    // Re-fan the face from its sorted corners: clean triangles for the UVs.
    face.triangles = face.corners
      .slice(1, -1)
      .map((corner, index) => [face.corners[0]!, corner, face.corners[index + 2]!]);
  }
  return faces.sort((a, b) => compareVectors(a.normal, b.normal));
}

function sortCornersCounterClockwise(face: DieFace): void {
  const { x: xAxis, y: yAxis } = faceBasis(
    face.normal,
    face.corners[0]!.clone().sub(face.centroid),
  );
  const angle = (corner: THREE.Vector3) => {
    const offset = corner.clone().sub(face.centroid);
    return Math.atan2(offset.dot(yAxis), offset.dot(xAxis));
  };
  face.corners.sort((a, b) => angle(a) - angle(b));
}

/** An in-plane basis for a face, seen from outside: x right, y up, x×y = n. */
export function faceBasis(
  normal: THREE.Vector3,
  towardUp: THREE.Vector3,
): { x: THREE.Vector3; y: THREE.Vector3 } {
  const y = towardUp.clone().projectOnPlane(normal).normalize();
  const x = y.clone().cross(normal).normalize();
  return { x, y };
}

/** Real dice put opposite faces on n+1 − each other: 1 opposite n, and so on. */
function numberOppositePairs(faces: DieFace[], count: number): void {
  const unnumbered = new Set(faces);
  let low = 1;
  for (const face of faces) {
    if (!unnumbered.has(face)) {
      continue;
    }
    const opposite = faces.find(
      (candidate) => unnumbered.has(candidate) && candidate.normal.dot(face.normal) < -0.9999,
    );
    unnumbered.delete(face);
    face.value = low;
    if (opposite) {
      unnumbered.delete(opposite);
      opposite.value = count + 1 - low;
    }
    low += 1;
  }
}

function compareVectors(a: THREE.Vector3, b: THREE.Vector3): number {
  const round = (value: number) => Math.round(value * 1e4);
  return round(b.y) - round(a.y) || round(a.x) - round(b.x) || round(a.z) - round(b.z);
}

/**
 * The orientation that rests a die showing `value` on top, turned `yaw`
 * radians about the vertical — every client computes the same pose for the
 * same roll (see `rollSeed`), so the table looks the same for everyone.
 */
export function restingQuaternion(shape: DieShape, value: number, yaw: number): THREE.Quaternion {
  const align = new THREE.Quaternion().setFromUnitVectors(
    shape.upFor(value).normalize(),
    new THREE.Vector3(0, 1, 0),
  );
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  return turn.multiply(align);
}

/** A deterministic 0..1 random stream from a die id and its roll count. */
export function rollRandom(dieId: string, rollCount: number): () => number {
  let seed = rollCount * 0x9e3779b1;
  for (let i = 0; i < dieId.length; i++) {
    seed = Math.imul(seed ^ dieId.charCodeAt(i), 0x85ebca6b);
  }
  // mulberry32
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How the faces are laid out on a die's texture: one square cell each. */
export interface AtlasLayout {
  cols: number;
  rows: number;
}

export function atlasLayout(shape: DieShape): AtlasLayout {
  const cols = Math.ceil(Math.sqrt(shape.faces.length));
  return { cols, rows: Math.ceil(shape.faces.length / cols) };
}

/** A face's corners in its own 2D frame (x right, y "up" for its number),
 * scaled so the farthest corner is at distance 1 from the center. */
export function faceCorners2D(shape: DieShape, face: DieFace): THREE.Vector2[] {
  const offsets = face.corners.map((corner) => corner.clone().sub(face.centroid));
  // Numbers point at a corner (the apex, on a d10's kites) — except on a
  // d6's squares, where they sit square to an edge.
  const farthest = offsets.reduce((best, offset) =>
    offset.lengthSq() > best.lengthSq() + 1e-12 ? offset : best,
  );
  const towardUp =
    shape.kind === 'd6' ? offsets[0]!.clone().add(offsets[1]!).multiplyScalar(0.5) : farthest;
  const { x, y } = faceBasis(face.normal, towardUp);
  const radius = Math.sqrt(Math.max(...offsets.map((offset) => offset.lengthSq())));
  return offsets.map((offset) => new THREE.Vector2(offset.dot(x) / radius, offset.dot(y) / radius));
}

/** How much of its cell a face's texture occupies (a margin avoids
 * bleeding between neighbouring faces when the texture is filtered). */
export const ATLAS_FILL = 0.46;

/**
 * The die's mesh geometry: flat-shaded triangles whose UVs map each face
 * into its own atlas cell (row-major from the top, matching how
 * `DiceManager` paints the atlas canvas).
 */
export function buildDieGeometry(shape: DieShape): THREE.BufferGeometry {
  const { cols, rows } = atlasLayout(shape);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  shape.faces.forEach((face, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const corners2D = faceCorners2D(shape, face);
    const uvOf = (corner: THREE.Vector3) => {
      const at = face.corners.findIndex((candidate) => candidate.distanceTo(corner) < 1e-9);
      const p = corners2D[at]!;
      return [
        (col + 0.5 + ATLAS_FILL * p.x) / cols,
        1 - (row + 0.5 - ATLAS_FILL * p.y) / rows, // canvas rows run top-down
      ];
    };
    for (const triangle of face.triangles) {
      for (const vertex of triangle) {
        positions.push(vertex.x, vertex.y, vertex.z);
        normals.push(face.normal.x, face.normal.y, face.normal.z);
        uvs.push(...uvOf(vertex));
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}
