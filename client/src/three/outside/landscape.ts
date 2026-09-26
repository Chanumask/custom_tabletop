import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom } from '../parchment.js';
import {
  LAKE,
  MOON_DIRECTION,
  VILLAGE,
  WINDMILL,
  groundHeight,
  lakeFactor,
  scatterTrees,
} from './terrain.js';
import type { Kit, OutsideTheme, Piece } from './kit.js';
import type { SkyPalette } from './sky.js';

const moonDirection = new THREE.Vector3(MOON_DIRECTION.x, MOON_DIRECTION.y, MOON_DIRECTION.z);

/** Paints a whole geometry one color (for merged, vertex-colored models). */
function tinted(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  const c = new THREE.Color(color);
  const count = geometry.attributes.position!.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) c.toArray(colors, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** The ground: flat yard, rolling meadows, the lake's basin, hills. */
function buildGround(kit: Kit): THREE.Mesh {
  const geometry = kit.keep(new THREE.PlaneGeometry(900, 900, 200, 200));
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position!;
  const colors = new Float32Array(positions.count * 3);
  const random = seededRandom(0x6a55);
  const grass = new THREE.Color('#3f5c3a');
  const dry = new THREE.Color('#6a6440');
  const shore = new THREE.Color('#6a6048');
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, groundHeight(x, z));
    color.copy(grass).lerp(dry, 0.25 + 0.35 * random());
    const lake = lakeFactor(x, z);
    if (lake > 0) color.lerp(shore, Math.min(1, lake * 2.5));
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, kit.keep(new THREE.MeshLambertMaterial({ vertexColors: true })));
}

/** A dirt path from the gate in the north fence, winding to the village. */
function buildPath(kit: Kit): THREE.Mesh {
  const points: THREE.Vector3[] = [];
  const start = new THREE.Vector2(2.5, -15.2);
  const end = new THREE.Vector2(VILLAGE.x + 20, VILLAGE.z + 30);
  for (let t = 0; t <= 1.0001; t += 1 / 90) {
    const x = start.x + (end.x - start.x) * t + Math.sin(t * 9) * 9 * t;
    const z = start.y + (end.y - start.y) * t;
    points.push(new THREE.Vector3(x, 0, z));
  }
  const positions: number[] = [];
  const indices: number[] = [];
  const width = 1.7;
  points.forEach((point, index) => {
    const next = points[Math.min(index + 1, points.length - 1)]!;
    const previous = points[Math.max(index - 1, 0)]!;
    const along = next.clone().sub(previous).normalize();
    const side = new THREE.Vector3(-along.z, 0, along.x).multiplyScalar(width / 2);
    for (const sign of [-1, 1]) {
      const x = point.x + side.x * sign;
      const z = point.z + side.z * sign;
      positions.push(x, groundHeight(x, z) + 0.04, z);
    }
    if (index > 0) {
      const a = (index - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const geometry = kit.keep(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    kit.keep(new THREE.MeshLambertMaterial({ color: '#6b5a3c', side: THREE.DoubleSide })),
  );
}

/** The lake: dark water catching the sky, with a glittering path under the moon. */
function buildLake(kit: Kit, palette: () => SkyPalette): Piece {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uDeep: { value: new THREE.Color('#0a1428') },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uMoonColor: { value: new THREE.Color('#fff2d8') },
      uMoonDir: { value: moonDirection },
      uTime: { value: 0 },
      uIce: { value: 0 },
    },
  ]);
  const material = kit.keep(
    new THREE.ShaderMaterial({
      uniforms,
      fog: true,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          vec4 mvPosition = viewMatrix * world;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uMoonColor;
        uniform vec3 uMoonDir;
        uniform float uTime;
        uniform float uIce;
        varying vec3 vWorld;
        #include <fog_pars_fragment>
        void main() {
          vec2 p = vWorld.xz;
          // Frozen, the water stops moving.
          float t = uTime * (1.0 - uIce);
          vec3 n = normalize(vec3(
            0.05 * sin(p.x * 0.8 + t * 1.1) * cos(p.y * 0.6 - t * 0.7)
              + 0.035 * sin(p.x * 3.1 - p.y * 2.3 + t * 2.3)
              + 0.02 * sin(p.x * 9.0 + p.y * 7.0 - t * 3.7),
            1.0,
            0.05 * cos(p.y * 0.9 + t * 0.9) * sin(p.x * 0.5)
              + 0.035 * cos(p.y * 2.7 + p.x * 1.9 - t * 2.1)
              + 0.02 * cos(p.y * 8.3 - p.x * 6.1 + t * 3.1)));
          vec3 view = normalize(cameraPosition - vWorld);
          vec3 r = reflect(-view, n);
          float fresnel = 0.03 + 0.97 * pow(1.0 - max(dot(view, n), 0.0), 5.0);
          vec3 sky = mix(uHorizon, uZenith, clamp(r.y * 1.6, 0.0, 1.0));
          float toMoon = max(dot(r, uMoonDir), 0.0);
          float glitter = pow(toMoon, 1400.0) * 40.0 + pow(toMoon, 90.0) * 0.5;
          vec3 color = mix(uDeep, sky, fresnel) + uMoonColor * glitter;
          // Ice: pale and dull, frosted in patches, a soft sheen of moonlight.
          float frost = 0.5 + 0.5 * sin(p.x * 0.7 + sin(p.y * 0.5) * 2.0) * sin(p.y * 0.9);
          vec3 ice = mix(vec3(0.34, 0.4, 0.5), vec3(0.62, 0.68, 0.78), frost * 0.6)
            + uMoonColor * pow(toMoon, 30.0) * 0.25;
          color = mix(color, ice, uIce);
          gl_FragColor = vec4(color, 1.0);
          #include <fog_fragment>
        }
      `,
    }),
  );
  const geometry = kit.keep(new THREE.CircleGeometry(1, 72));
  geometry.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(geometry, material);
  water.scale.set(LAKE.rx * 1.05, 1, LAKE.rz * 1.05);
  water.position.set(LAKE.x, LAKE.level, LAKE.z);
  return {
    object: water,
    update(_dt, time) {
      uniforms.uTime!.value = kit.reducedMotion ? 0 : time;
      uniforms.uZenith!.value.copy(palette().zenith);
      uniforms.uHorizon!.value.copy(palette().horizon);
    },
    setTheme(theme) {
      uniforms.uMoonColor!.value.set(theme === 'halloween' ? '#ffb070' : '#fff2d8');
      uniforms.uIce!.value = theme === 'winter' ? 1 : 0;
    },
  };
}

/** The pine woods all around: one instanced mesh. */
function buildForest(kit: Kit): THREE.InstancedMesh {
  const trunk = tinted(
    new THREE.CylinderGeometry(0.16, 0.28, 2.4, 6).translate(0, 1.2, 0),
    '#2a1d14',
  );
  const tiers = [
    [2.3, 3.4, 3.4],
    [1.75, 3.0, 5.1],
    [1.15, 2.6, 6.7],
  ].map(([radius, height, y]) =>
    tinted(new THREE.ConeGeometry(radius, height, 7).translate(0, y!, 0), '#2f5a3c'),
  );
  const pine = kit.keep(mergeGeometries([trunk, ...tiers])!);
  [trunk, ...tiers].forEach((part) => part.dispose());
  const spots = scatterTrees(460);
  const forest = new THREE.InstancedMesh(
    pine,
    kit.keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })),
    spots.length,
  );
  const random = seededRandom(0xf0e5);
  const matrix = new THREE.Matrix4();
  const tint = new THREE.Color();
  spots.forEach((spot, index) => {
    const scale = spot.scale * (1 + Math.min(1, Math.hypot(spot.x, spot.z) / 200) * 0.6);
    matrix.compose(
      new THREE.Vector3(spot.x, groundHeight(spot.x, spot.z) - 0.2, spot.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.turn),
      new THREE.Vector3(scale, scale * (0.85 + random() * 0.4), scale),
    );
    forest.setMatrixAt(index, matrix);
    forest.setColorAt(index, tint.setHSL(0.3 + random() * 0.08, 0.3, 0.45 + random() * 0.25));
  });
  return forest;
}

/** A few old autumn trees in the yard, swaying a little in the wind. */
function buildYardTrees(kit: Kit): Piece {
  const group = new THREE.Group();
  const random = seededRandom(0x0a4);
  const bark = kit.keep(new THREE.MeshLambertMaterial({ color: '#4a3626', flatShading: true }));
  const autumn = ['#a8501c', '#c07a1c', '#8a2a18', '#b8902a'];
  const frosted = ['#4a5a52', '#56665e', '#42524a', '#5a6a62'];
  const leaves = autumn.map((color) =>
    kit.keep(new THREE.MeshLambertMaterial({ color, flatShading: true })),
  );
  const trunkGeometry = kit.keep(
    new THREE.CylinderGeometry(0.22, 0.42, 3.6, 7).translate(0, 1.8, 0),
  );
  const blobGeometry = kit.keep(new THREE.IcosahedronGeometry(1.05, 1));
  const trees: { tree: THREE.Group; phase: number }[] = [];
  for (const [x, z, size] of [
    [12.5, 6.5, 1.25],
    [13.5, -8, 1.1],
    [-9.5, -11, 1.0],
    [8, 12, 0.9],
    [-11.5, 10.5, 1.15],
    [-3, -13.5, 0.8],
  ] as const) {
    const tree = new THREE.Group();
    tree.add(new THREE.Mesh(trunkGeometry, bark));
    for (let i = 0; i < 14; i += 1) {
      const blob = new THREE.Mesh(blobGeometry, leaves[i % leaves.length]!);
      const angle = random() * Math.PI * 2;
      const reach = 0.4 + random() * 1.5;
      blob.position.set(Math.cos(angle) * reach, 3.4 + random() * 2.2, Math.sin(angle) * reach);
      blob.scale.set(0.8 + random() * 0.6, 0.65 + random() * 0.4, 0.8 + random() * 0.6);
      blob.rotation.set(random() * 3, random() * 3, random() * 3);
      tree.add(blob);
    }
    tree.position.set(x, groundHeight(x, z), z);
    tree.scale.setScalar(size);
    group.add(tree);
    trees.push({ tree, phase: random() * Math.PI * 2 });
  }
  return {
    object: group,
    setTheme(theme) {
      leaves.forEach((material, i) =>
        material.color.set(theme === 'winter' ? frosted[i]! : autumn[i]!),
      );
    },
    update(_dt, time) {
      if (kit.reducedMotion) return;
      for (const { tree, phase } of trees) {
        tree.rotation.z = Math.sin(time * 0.7 + phase) * 0.018;
        tree.rotation.x = Math.sin(time * 0.53 + phase * 1.7) * 0.012;
      }
    },
  };
}

/** A post-and-rail fence around the yard, with a gap for the gate north. */
function buildFence(kit: Kit): THREE.Group {
  const group = new THREE.Group();
  const wood = kit.keep(new THREE.MeshLambertMaterial({ color: '#7a6a58' }));
  const corners: [number, number][] = [
    [-14, -15],
    [16, -15],
    [16, 14],
    [-14, 14],
  ];
  const posts: THREE.Vector3[] = [];
  const rails: { from: THREE.Vector3; to: THREE.Vector3 }[] = [];
  corners.forEach(([ax, az], side) => {
    const [bx, bz] = corners[(side + 1) % corners.length]!;
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.round(length / 2.5);
    let previous: THREE.Vector3 | null = null;
    for (let i = 0; i <= steps; i += 1) {
      const x = ax + ((bx - ax) * i) / steps;
      const z = az + ((bz - az) * i) / steps;
      const post = new THREE.Vector3(x, groundHeight(x, z), z);
      // The gate: no rails across the path.
      const gate = side === 0 && x > 1 && x < 4.5;
      if (previous && !gate) rails.push({ from: previous, to: post });
      posts.push(post);
      previous = gate ? null : post;
    }
  });
  const postMesh = new THREE.InstancedMesh(
    kit.keep(new THREE.BoxGeometry(0.13, 1.15, 0.13).translate(0, 0.57, 0)),
    wood,
    posts.length,
  );
  const matrix = new THREE.Matrix4();
  posts.forEach((post, index) => {
    postMesh.setMatrixAt(index, matrix.makeTranslation(post.x, post.y, post.z));
  });
  const railMesh = new THREE.InstancedMesh(
    kit.keep(new THREE.BoxGeometry(1, 0.07, 0.05)),
    wood,
    rails.length * 2,
  );
  rails.forEach(({ from, to }, index) => {
    const length = from.distanceTo(to);
    const middle = from.clone().add(to).multiplyScalar(0.5);
    const angle = Math.atan2(-(to.z - from.z), to.x - from.x);
    for (const [row, height] of [
      [0, 0.45],
      [1, 0.9],
    ] as const) {
      matrix.compose(
        new THREE.Vector3(middle.x, middle.y + height, middle.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle),
        new THREE.Vector3(length, 1, 1),
      );
      railMesh.setMatrixAt(index * 2 + row, matrix);
    }
  });
  group.add(postMesh, railMesh);
  return group;
}

/** Lamp posts in the yard, each pooling warm light on the ground. */
function buildLampPosts(kit: Kit, glow: THREE.Texture): Piece {
  const group = new THREE.Group();
  const iron = kit.keep(new THREE.MeshLambertMaterial({ color: '#1a1714' }));
  const glass = kit.keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.4, 0.6) }));
  const pole = kit.keep(new THREE.CylinderGeometry(0.05, 0.08, 2.7, 8).translate(0, 1.35, 0));
  const lanternGeometry = kit.keep(new THREE.BoxGeometry(0.22, 0.32, 0.22));
  const capGeometry = kit.keep(new THREE.ConeGeometry(0.2, 0.16, 4).rotateY(Math.PI / 4));
  const lamps: { light: THREE.PointLight; halo: THREE.Sprite; phase: number }[] = [];
  for (const [x, z] of [
    [4.3, -15.8],
    [-10.5, 3.5],
    [10, -3],
  ] as const) {
    const lamp = new THREE.Group();
    lamp.add(new THREE.Mesh(pole, iron));
    const lantern = new THREE.Mesh(lanternGeometry, glass);
    lantern.position.y = 2.85;
    const cap = new THREE.Mesh(capGeometry, iron);
    cap.position.y = 3.08;
    const light = new THREE.PointLight('#ffb060', 9, 18, 2);
    light.position.y = 2.8;
    const halo = kit.halo(glow, '#ffb060', 1.6, 0.8);
    halo.position.y = 2.85;
    lamp.add(lantern, cap, light, halo);
    lamp.position.set(x, groundHeight(x, z), z);
    group.add(lamp);
    lamps.push({ light, halo, phase: x * 1.7 + z });
  }
  return {
    object: group,
    update(_dt, time) {
      if (kit.reducedMotion) return;
      for (const lamp of lamps) {
        const flicker =
          0.92 +
          0.05 * Math.sin(time * 7.3 + lamp.phase) +
          0.03 * Math.sin(time * 13.1 + lamp.phase);
        lamp.light.intensity = 9 * flicker;
        lamp.halo.material.opacity = 0.8 * flicker;
      }
    },
    setTheme(theme) {
      for (const lamp of lamps) {
        lamp.light.color.set(theme === 'halloween' ? '#ff8a3a' : '#ffb060');
        lamp.halo.material.color.set(theme === 'halloween' ? '#ff8a3a' : '#ffb060');
      }
    },
  };
}

/** The things a yard has: a stone well, a bench, hay bales and a
 * scarecrow out in the meadow. */
function buildYardProps(kit: Kit): THREE.Group {
  const group = new THREE.Group();
  const stone = kit.keep(new THREE.MeshLambertMaterial({ color: '#77736a', flatShading: true }));
  const wood = kit.keep(new THREE.MeshLambertMaterial({ color: '#6a5238' }));
  const straw = kit.keep(new THREE.MeshLambertMaterial({ color: '#9a8446', flatShading: true }));
  const cloth = kit.keep(new THREE.MeshLambertMaterial({ color: '#6a4a3a', flatShading: true }));
  const put = (object: THREE.Object3D, x: number, z: number, turn = 0) => {
    object.position.set(x, groundHeight(x, z), z);
    object.rotation.y = turn;
    group.add(object);
  };

  // The well: a stone ring, two posts, a little roof and a bucket.
  const well = new THREE.Group();
  const ring = new THREE.Mesh(
    kit.keep(new THREE.CylinderGeometry(0.85, 0.9, 0.85, 14, 1, true)),
    stone,
  );
  ring.position.y = 0.42;
  ring.material.side = THREE.DoubleSide;
  const rim = new THREE.Mesh(kit.keep(new THREE.TorusGeometry(0.86, 0.09, 6, 16)), stone);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.86;
  const postGeometry = kit.keep(new THREE.BoxGeometry(0.12, 1.9, 0.12));
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeometry, wood);
    post.position.set(side * 0.8, 1.3, 0);
    well.add(post);
  }
  const wellRoof = new THREE.Mesh(
    kit.keep(new THREE.ConeGeometry(1.35, 0.8, 4).rotateY(Math.PI / 4)),
    kit.keep(new THREE.MeshLambertMaterial({ color: '#4a3430', flatShading: true })),
  );
  wellRoof.scale.set(1, 1, 0.75);
  wellRoof.position.y = 2.55;
  const bucket = new THREE.Mesh(kit.keep(new THREE.CylinderGeometry(0.16, 0.12, 0.26, 10)), wood);
  bucket.position.set(0.25, 1.35, 0);
  well.add(ring, rim, wellRoof, bucket);
  put(well, -8.5, 7.5, 0.4);

  // A bench by the east lamp.
  const bench = new THREE.Group();
  const seat = new THREE.Mesh(kit.keep(new THREE.BoxGeometry(1.8, 0.07, 0.45)), wood);
  seat.position.y = 0.46;
  const back = new THREE.Mesh(kit.keep(new THREE.BoxGeometry(1.8, 0.45, 0.06)), wood);
  back.position.set(0, 0.8, -0.2);
  const legGeometry = kit.keep(new THREE.BoxGeometry(0.08, 0.46, 0.4));
  for (const side of [-0.8, 0.8]) {
    const leg = new THREE.Mesh(legGeometry, wood);
    leg.position.set(side, 0.23, 0);
    bench.add(leg);
  }
  bench.add(seat, back);
  put(bench, 10.2, -1.3, -Math.PI / 2 + 0.2);

  // Hay bales, rolled, out in the north meadow.
  const bale = kit.keep(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 12).rotateZ(Math.PI / 2));
  for (const [x, z, turn] of [
    [-9, -24, 0.3],
    [-6.8, -25.5, 1.1],
    [-7.6, -22.4, 2.0],
    [12, -30, 0.6],
  ] as const) {
    const hay = new THREE.Mesh(bale, straw);
    hay.position.y = 0.72;
    const holder = new THREE.Group();
    holder.add(hay);
    put(holder, x, z, turn);
  }

  // A scarecrow keeping watch over the meadow.
  const scarecrow = new THREE.Group();
  const pole = new THREE.Mesh(kit.keep(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 6)), wood);
  pole.position.y = 1.2;
  const arms = new THREE.Mesh(kit.keep(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6)), wood);
  arms.rotation.z = Math.PI / 2;
  arms.position.y = 1.75;
  const coat = new THREE.Mesh(kit.keep(new THREE.ConeGeometry(0.42, 1.0, 7)), cloth);
  coat.position.y = 1.45;
  const head = new THREE.Mesh(kit.keep(new THREE.SphereGeometry(0.2, 10, 8)), straw);
  head.position.y = 2.15;
  const hat = new THREE.Mesh(kit.keep(new THREE.ConeGeometry(0.26, 0.42, 8)), cloth);
  hat.position.y = 2.45;
  const brim = new THREE.Mesh(kit.keep(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 12)), cloth);
  brim.position.y = 2.28;
  scarecrow.add(pole, arms, coat, head, hat, brim);
  scarecrow.rotation.z = 0.05;
  put(scarecrow, -3.5, -30, 0.5);
  return group;
}

/** The village on its hill: dark houses with lit windows, and a church. */
function buildVillage(kit: Kit, glow: THREE.Texture): Piece {
  const group = new THREE.Group();
  const random = seededRandom(0x7111);
  const wall = kit.keep(new THREE.MeshLambertMaterial({ color: '#6a625a' }));
  const roof = kit.keep(new THREE.MeshLambertMaterial({ color: '#4a3430' }));
  const windowGeometry = kit.keep(new THREE.PlaneGeometry(0.9, 1.0));
  const lights: {
    material: THREE.MeshBasicMaterial;
    halo: THREE.Sprite;
    phase: number;
    lit: boolean;
  }[] = [];
  const toHouse = (x: number, z: number) => Math.atan2(-x, -z); // face the cottage

  const addWindow = (house: THREE.Object3D, x: number, y: number, depth: number) => {
    const material = kit.keep(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.3, 0.55), fog: false }),
    );
    const pane = new THREE.Mesh(windowGeometry, material);
    pane.position.set(x, y, depth / 2 + 0.02);
    const halo = kit.halo(glow, '#ffb060', 3.2, 0.45);
    halo.position.set(x, y, depth / 2 + 0.3);
    house.add(pane, halo);
    lights.push({ material, halo, phase: random() * 100, lit: random() > 0.12 });
  };

  for (let i = 0; i < 12; i += 1) {
    const angle = random() * Math.PI * 2;
    const reach = random() * VILLAGE.radius;
    const x = VILLAGE.x + Math.cos(angle) * reach;
    const z = VILLAGE.z + Math.sin(angle) * reach;
    const width = 6 + random() * 3;
    const height = 3.8 + random() * 2;
    const depth = 6 + random() * 2.5;
    const house = new THREE.Group();
    const body = new THREE.Mesh(kit.keep(new THREE.BoxGeometry(width, height, depth)), wall);
    body.position.y = height / 2;
    const top = new THREE.Mesh(
      kit.keep(new THREE.ConeGeometry(Math.max(width, depth) * 0.75, 3.2, 4).rotateY(Math.PI / 4)),
      roof,
    );
    top.scale.set(width / Math.max(width, depth), 1, depth / Math.max(width, depth));
    top.position.y = height + 1.6;
    house.add(body, top);
    const windows = 1 + Math.floor(random() * 3);
    for (let w = 0; w < windows; w += 1) {
      addWindow(house, (w - (windows - 1) / 2) * 2.2, height * 0.45, depth);
    }
    house.position.set(x, groundHeight(x, z) - 0.3, z);
    house.rotation.y = toHouse(x, z) + (random() - 0.5) * 0.5;
    group.add(house);
  }
  // The church: a tower with a spire and a lit round window.
  const church = new THREE.Group();
  const tower = new THREE.Mesh(kit.keep(new THREE.BoxGeometry(4.5, 15, 4.5)), wall);
  tower.position.y = 7.5;
  const spire = new THREE.Mesh(
    kit.keep(new THREE.ConeGeometry(3.4, 10, 4).rotateY(Math.PI / 4)),
    roof,
  );
  spire.position.y = 20;
  const nave = new THREE.Mesh(kit.keep(new THREE.BoxGeometry(8, 7, 14)), wall);
  nave.position.set(0, 3.5, -8);
  church.add(tower, spire, nave);
  addWindow(church, 0, 11, 4.5);
  church.position.set(
    VILLAGE.x + 6,
    groundHeight(VILLAGE.x + 6, VILLAGE.z - 8) - 0.3,
    VILLAGE.z - 8,
  );
  church.rotation.y = toHouse(VILLAGE.x, VILLAGE.z);
  group.add(church);

  let sinceChange = 0;
  return {
    object: group,
    update(dt, time) {
      if (kit.reducedMotion) return;
      // Now and then someone blows out a candle, or lights one.
      sinceChange += dt;
      if (sinceChange > 7) {
        sinceChange = 0;
        const light = lights[Math.floor(random() * lights.length)]!;
        light.lit = !light.lit || random() > 0.5;
      }
      for (const light of lights) {
        const flicker = light.lit ? 0.85 + 0.15 * Math.sin(time * 3 + light.phase) : 0;
        light.material.color.setRGB(2.4 * flicker, 1.3 * flicker, 0.55 * flicker);
        light.halo.material.opacity = 0.45 * flicker;
      }
    },
  };
}

/** The windmill on its hill, sails turning slowly, a candle in its window. */
function buildWindmill(kit: Kit, glow: THREE.Texture): Piece {
  const mill = new THREE.Group();
  const plaster = kit.keep(new THREE.MeshLambertMaterial({ color: '#8a8272', flatShading: true }));
  const timber = kit.keep(new THREE.MeshLambertMaterial({ color: '#4a3a2c', flatShading: true }));
  const tower = new THREE.Mesh(kit.keep(new THREE.CylinderGeometry(2.6, 4.2, 14, 8)), plaster);
  tower.position.y = 7;
  const cap = new THREE.Mesh(kit.keep(new THREE.ConeGeometry(3.4, 4.2, 8)), timber);
  cap.position.y = 16.1;
  const hub = new THREE.Group();
  hub.position.set(-3.1, 13.2, 0); // on the side facing the cottage
  const sailGeometry = kit.keep(new THREE.BoxGeometry(0.15, 8.5, 1.5).translate(0, 4.6, 0));
  for (let i = 0; i < 4; i += 1) {
    const sail = new THREE.Mesh(sailGeometry, timber);
    sail.rotation.x = (i * Math.PI) / 2;
    hub.add(sail);
  }
  const lit = kit.keep(
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.3, 0.5), fog: false }),
  );
  const window = new THREE.Mesh(kit.keep(new THREE.PlaneGeometry(0.9, 1.2)), lit);
  window.position.set(-3.55, 6, 0);
  window.rotation.y = -Math.PI / 2;
  const halo = kit.halo(glow, '#ffb060', 3.5, 0.5);
  halo.position.set(-3.9, 6, 0);
  mill.add(tower, cap, hub, window, halo);
  mill.position.set(WINDMILL.x, groundHeight(WINDMILL.x, WINDMILL.z) - 0.5, WINDMILL.z);
  return {
    object: mill,
    update(_dt, time) {
      if (!kit.reducedMotion) hub.rotation.x = time * 0.22;
    },
  };
}

/** Two mountain ranges on the horizon, the far one paler with distance. */
function buildMountains(kit: Kit, palette: () => SkyPalette): Piece {
  const random = seededRandom(0x3a7);
  const ranges = [
    { radius: 720, base: 14, peaks: 42, shade: 0.55 },
    { radius: 1050, base: 26, peaks: 70, shade: 0.8 },
  ].map(({ radius, base, peaks, shade }) => {
    const steps = 240;
    const positions: number[] = [];
    const indices: number[] = [];
    const phase = random() * 10;
    for (let i = 0; i <= steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      const ridge =
        Math.abs(Math.sin(angle * 5 + phase)) * 0.5 +
        Math.abs(Math.sin(angle * 13 + phase * 2)) * 0.3 +
        Math.abs(Math.sin(angle * 31 + phase * 3)) * 0.2;
      const height = base + peaks * ridge * ridge;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      positions.push(x, -60, z, x, height, z);
      if (i > 0) {
        const a = (i - 1) * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geometry = kit.keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    const material = kit.keep(
      new THREE.MeshBasicMaterial({ color: '#000', fog: false, side: THREE.DoubleSide }),
    );
    return { mesh: new THREE.Mesh(geometry, material), material, shade };
  });
  const group = new THREE.Group();
  ranges.forEach(({ mesh }) => group.add(mesh));
  const tint = () => {
    for (const { material, shade } of ranges) {
      material.color.copy(palette().zenith).lerp(palette().horizon, shade);
    }
  };
  tint();
  return { object: group, setTheme: tint };
}

/** Warm light from the room's windows, falling on the ground outside. */
function buildWindowSpill(kit: Kit, panes: THREE.Mesh[]): THREE.Group {
  const group = new THREE.Group();
  const texture = kit.canvasTexture(64, 128, (ctx) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, 128);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 128);
    const sides = ctx.createLinearGradient(0, 0, 64, 0);
    sides.addColorStop(0, 'rgba(0,0,0,1)');
    sides.addColorStop(0.2, 'rgba(0,0,0,0)');
    sides.addColorStop(0.8, 'rgba(0,0,0,0)');
    sides.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = sides;
    ctx.fillRect(0, 0, 64, 128);
  });
  const material = kit.keep(
    new THREE.MeshBasicMaterial({
      map: texture,
      color: '#ffae60',
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  for (const pane of panes) {
    const box = new THREE.Box3().setFromObject(pane);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // Outward: away from the room's middle.
    const outward =
      size.x < size.z
        ? new THREE.Vector3(Math.sign(center.x), 0, 0)
        : new THREE.Vector3(0, 0, Math.sign(center.z));
    const width = Math.max(size.x, size.z) * 1.5;
    const reach = 4.2;
    const spill = new THREE.Mesh(kit.keep(new THREE.PlaneGeometry(width, reach)), material);
    spill.rotation.x = -Math.PI / 2;
    spill.rotation.z = Math.atan2(outward.x, outward.z); // bright end at the wall
    spill.position.set(
      center.x + outward.x * (0.25 + reach / 2),
      0.03,
      center.z + outward.z * (0.25 + reach / 2),
    );
    group.add(spill);
  }
  return group;
}

/** Everything on the land, from the yard to the mountains. */
export function buildLandscape(kit: Kit, panes: THREE.Mesh[], palette: () => SkyPalette): Piece[] {
  const glow = kit.glow();
  const statics = new THREE.Group();
  statics.name = 'land';
  statics.add(buildGround(kit), buildPath(kit), buildForest(kit), buildFence(kit));
  statics.add(buildWindowSpill(kit, panes));
  return [
    { object: statics },
    buildLake(kit, palette),
    buildYardTrees(kit),
    buildLampPosts(kit, glow),
    { object: buildYardProps(kit) },
    buildVillage(kit, glow),
    buildMountains(kit, palette),
    buildWindmill(kit, glow),
  ];
}

export { moonDirection };
export type { OutsideTheme };
