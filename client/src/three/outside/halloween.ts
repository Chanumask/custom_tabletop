import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom } from '../parchment.js';
import { GRAVEYARD, MOON_DIRECTION, groundHeight } from './terrain.js';
import type { Kit, Piece } from './kit.js';

/**
 * Halloween night outside (the host's theme toggle): jack-o'-lanterns, an
 * old graveyard with a dead tree and drifting ghosts, bats, low fog, a black
 * cat on the fence — and now and then a witch across the moon. Built once,
 * shown only while the theme is on.
 */
export function buildHalloween(kit: Kit): Piece {
  const group = new THREE.Group();
  group.name = 'halloween';
  group.visible = false;
  const glow = kit.glow();
  const updates: ((dt: number, time: number, camera: THREE.Camera) => void)[] = [];
  const parts: Piece[] = [
    jackOLanterns(kit, glow),
    graveyard(kit),
    ghosts(kit),
    groundFog(kit),
    bats(kit),
    blackCat(kit, glow),
    witch(kit),
  ];
  for (const part of parts) {
    group.add(part.object);
    if (part.update) updates.push(part.update);
  }
  return {
    object: group,
    setTheme(theme) {
      group.visible = theme === 'halloween';
    },
    update(dt, time, camera) {
      if (!group.visible) return;
      for (const update of updates) update(dt, time, camera);
    },
  };
}

// --- Jack-o'-lanterns -------------------------------------------------------

/** A ribbed, squat pumpkin with a stem, its carved face on the +z side. */
export function pumpkinGeometry(radius: number): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(radius, 28, 18);
  const position = body.attributes.position!;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const angle = Math.atan2(v.z, v.x);
    const ribs = 0.9 + 0.1 * Math.abs(Math.cos(angle * 4));
    position.setXYZ(i, v.x * ribs, v.y * 0.74, v.z * ribs);
  }
  body.computeVertexNormals();
  return body;
}

function jackOLanterns(kit: Kit, glow: THREE.Texture): Piece {
  const group = new THREE.Group();
  const face = kit.canvasTexture(512, 256, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 512, 256);
    // The front of a three.js sphere is at u = 0.25.
    ctx.translate(128, 128);
    ctx.fillStyle = '#ffd27a';
    ctx.shadowColor = '#ff9a30';
    ctx.shadowBlur = 12;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 34, -44);
      ctx.lineTo(side * 12, -14);
      ctx.lineTo(side * 54, -14);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-8, 8);
    ctx.lineTo(8, 8);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-60, 18);
    for (let i = 0; i <= 8; i += 1) {
      ctx.lineTo(-60 + i * 15, 18 + (i % 2 === 0 ? 0 : 12) + Math.sin((i / 8) * Math.PI) * 18);
    }
    for (let i = 8; i >= 0; i -= 1) {
      ctx.lineTo(-60 + i * 15, 30 + Math.sin((i / 8) * Math.PI) * 30 - (i % 2 === 0 ? 0 : 8));
    }
    ctx.fill();
  });
  const geometry = kit.keep(pumpkinGeometry(0.34));
  const stem = kit.keep(new THREE.CylinderGeometry(0.035, 0.05, 0.16, 6).translate(0, 0.3, 0));
  const stemMaterial = kit.keep(new THREE.MeshLambertMaterial({ color: '#3a4a1c' }));
  // Three flicker phases, so they don't all breathe in step.
  const lit = [0, 1, 2].map(() =>
    kit.keep(
      new THREE.MeshLambertMaterial({
        color: '#c8601a',
        emissive: new THREE.Color('#ff8a2a'),
        emissiveMap: face,
        emissiveIntensity: 2.2,
      }),
    ),
  );
  const plain = kit.keep(new THREE.MeshLambertMaterial({ color: '#b8561a' }));
  const halos: { sprite: THREE.Sprite; phase: number }[] = [];
  const random = seededRandom(0x9a3b);
  const place = (x: number, z: number, carved: boolean, size = 1, y?: number) => {
    const pumpkin = new THREE.Group();
    const material = carved ? lit[Math.floor(random() * lit.length)]! : plain;
    pumpkin.add(new THREE.Mesh(geometry, material), new THREE.Mesh(stem, stemMaterial));
    // Carved faces look towards the house.
    pumpkin.rotation.y = Math.atan2(-x, -z) + (random() - 0.5) * 0.5;
    pumpkin.scale.setScalar(size);
    pumpkin.position.set(x, (y ?? groundHeight(x, z)) + 0.25 * size, z);
    group.add(pumpkin);
    if (carved) {
      const halo = kit.halo(glow, '#ff8a2a', 1.4 * size, 0.55);
      halo.position.copy(pumpkin.position);
      halo.position.y += 0.05;
      group.add(halo);
      halos.push({ sprite: halo, phase: random() * 10 });
    }
  };
  // Lining the path out of the gate...
  for (const [x, z] of [
    [1.3, -15.6],
    [4.7, -16.4],
    [0.8, -19],
    [5.2, -21.5],
    [2.2, -25],
  ] as const) {
    place(x, z, true);
  }
  // ...by the well, the bench and the graveyard gate...
  place(-7.2, 8.8, true);
  place(-9.6, 6.3, true, 0.8);
  place(9.7, -2.6, true, 0.9);
  place(-15.5, -2, true, 1.1);
  place(-15.5, 2.2, true, 1.1);
  // ...a patch of them in the east yard...
  for (let i = 0; i < 12; i += 1) {
    const x = 8.5 + random() * 5;
    const z = 4 + random() * 5;
    place(x, z, i % 4 === 0, 0.7 + random() * 0.6);
  }
  // ...and one as the scarecrow's head.
  place(-3.5, -30, true, 0.75, groundHeight(-3.5, -30) + 1.95);

  return {
    object: group,
    update(_dt, time) {
      if (kit.reducedMotion) return;
      lit.forEach((material, index) => {
        material.emissiveIntensity =
          2.0 + 0.5 * Math.sin(time * 9 + index * 2.1) + 0.3 * Math.sin(time * 17.3 + index);
      });
      for (const halo of halos) {
        halo.sprite.material.opacity = 0.5 + 0.12 * Math.sin(time * 8 + halo.phase);
      }
    },
  };
}

// --- The graveyard ---------------------------------------------------------

/** A dead tree: a trunk forking into crooked, bare branches. */
function deadTreeGeometry(seed: number): THREE.BufferGeometry {
  const random = seededRandom(seed);
  const pieces: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const grow = (
    start: THREE.Vector3,
    direction: THREE.Vector3,
    length: number,
    radius: number,
    depth: number,
  ) => {
    const end = start.clone().addScaledVector(direction, length);
    const piece = new THREE.CylinderGeometry(radius * 0.7, radius, length, 5);
    piece.translate(0, length / 2, 0);
    piece.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction));
    piece.translate(start.x, start.y, start.z);
    pieces.push(piece);
    if (depth === 0) return;
    const forks = depth > 2 ? 2 : 2 + Math.floor(random() * 2);
    for (let i = 0; i < forks; i += 1) {
      const bend = new THREE.Vector3(
        direction.x + (random() - 0.5) * 1.4,
        direction.y * (0.5 + random() * 0.5),
        direction.z + (random() - 0.5) * 1.4,
      ).normalize();
      grow(end, bend, length * (0.6 + random() * 0.2), radius * 0.62, depth - 1);
    }
  };
  grow(new THREE.Vector3(), up, 3.2, 0.32, 4);
  const merged = mergeGeometries(pieces)!;
  pieces.forEach((piece) => piece.dispose());
  return merged;
}

function graveyard(kit: Kit): Piece {
  const group = new THREE.Group();
  const random = seededRandom(0x6a7e);
  const stone = kit.keep(new THREE.MeshLambertMaterial({ color: '#7c7a74', flatShading: true }));
  const iron = kit.keep(new THREE.MeshLambertMaterial({ color: '#141416' }));

  // Headstones: rounded slabs, crosses and the odd obelisk.
  const slab = kit.keep(
    mergeGeometries([
      new THREE.BoxGeometry(0.62, 0.8, 0.14).translate(0, 0.4, 0),
      new THREE.CylinderGeometry(0.31, 0.31, 0.14, 14, 1, false, 0, Math.PI)
        .rotateX(Math.PI / 2)
        .rotateZ(Math.PI / 2)
        .translate(0, 0.8, 0),
    ])!,
  );
  const cross = kit.keep(
    mergeGeometries([
      new THREE.BoxGeometry(0.14, 1.2, 0.12).translate(0, 0.6, 0),
      new THREE.BoxGeometry(0.62, 0.13, 0.12).translate(0, 0.88, 0),
    ])!,
  );
  const obelisk = kit.keep(
    mergeGeometries([
      new THREE.CylinderGeometry(0.16, 0.26, 1.8, 4).rotateY(Math.PI / 4).translate(0, 0.9, 0),
      new THREE.ConeGeometry(0.2, 0.3, 4).rotateY(Math.PI / 4).translate(0, 1.95, 0),
    ])!,
  );
  const shapes = [slab, slab, cross, slab, cross, obelisk];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      if (random() < 0.2) continue;
      const x = GRAVEYARD.maxX - 2.2 - row * 2.6 + (random() - 0.5) * 0.6;
      const z = GRAVEYARD.minZ + 1.6 + col * 2.9 + (random() - 0.5) * 0.8;
      const stoneMesh = new THREE.Mesh(shapes[Math.floor(random() * shapes.length)]!, stone);
      stoneMesh.position.set(x, groundHeight(x, z) - 0.05, z);
      stoneMesh.rotation.set(
        (random() - 0.5) * 0.25,
        Math.PI / 2 + (random() - 0.5) * 0.3,
        (random() - 0.5) * 0.25,
      );
      stoneMesh.scale.setScalar(0.85 + random() * 0.35);
      group.add(stoneMesh);
    }
  }

  // A wrought-iron fence around it, the gate facing the house.
  const bars: THREE.Vector3[] = [];
  const { minX, maxX, minZ, maxZ } = GRAVEYARD;
  const edge = (ax: number, az: number, bx: number, bz: number, gate = false) => {
    const length = Math.hypot(bx - ax, bz - az);
    const count = Math.round(length / 0.32);
    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      const z = az + (bz - az) * t;
      if (gate && Math.abs(z) < 1.6) continue;
      const x = ax + (bx - ax) * t;
      bars.push(new THREE.Vector3(x, groundHeight(x, z), z));
    }
  };
  edge(maxX, minZ, maxX, maxZ, true);
  edge(minX, minZ, minX, maxZ);
  edge(minX, minZ, maxX, minZ);
  edge(minX, maxZ, maxX, maxZ);
  const barGeometry = kit.keep(
    mergeGeometries([
      new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4).translate(0, 0.7, 0),
      new THREE.ConeGeometry(0.045, 0.14, 4).translate(0, 1.47, 0),
    ])!,
  );
  const barMesh = new THREE.InstancedMesh(barGeometry, iron, bars.length);
  const matrix = new THREE.Matrix4();
  bars.forEach((bar, index) =>
    barMesh.setMatrixAt(index, matrix.makeTranslation(bar.x, bar.y, bar.z)),
  );
  group.add(barMesh);
  for (const [ax, az, bx, bz] of [
    [maxX, minZ, maxX, -1.6],
    [maxX, 1.6, maxX, maxZ],
    [minX, minZ, minX, maxZ],
    [minX, minZ, maxX, minZ],
    [minX, maxZ, maxX, maxZ],
  ] as const) {
    for (const height of [0.35, 1.2]) {
      const length = Math.hypot(bx - ax, bz - az);
      const rail = new THREE.Mesh(kit.keep(new THREE.BoxGeometry(0.03, 0.04, length)), iron);
      rail.rotation.y = Math.atan2(bx - ax, bz - az);
      rail.position.set(
        (ax + bx) / 2,
        groundHeight((ax + bx) / 2, (az + bz) / 2) + height,
        (az + bz) / 2,
      );
      group.add(rail);
    }
  }

  // A mausoleum at the back, and a dead tree leaning over the graves.
  const tomb = new THREE.Group();
  const block = new THREE.Mesh(kit.keep(new THREE.BoxGeometry(3.2, 2.6, 3.6)), stone);
  block.position.y = 1.3;
  const pediment = new THREE.Mesh(
    kit.keep(
      new THREE.CylinderGeometry(2.3, 2.3, 3.8, 3, 1).rotateZ(Math.PI / 2).rotateY(Math.PI / 2),
    ),
    stone,
  );
  pediment.scale.set(1, 0.4, 1);
  pediment.position.y = 3.05;
  const door = new THREE.Mesh(
    kit.keep(new THREE.PlaneGeometry(1.1, 1.8)),
    kit.keep(new THREE.MeshBasicMaterial({ color: '#050407' })),
  );
  door.position.set(1.61, 0.9, 0);
  door.rotation.y = Math.PI / 2;
  const columnGeometry = kit.keep(new THREE.CylinderGeometry(0.16, 0.18, 2.6, 8));
  for (const z of [-1.2, 1.2]) {
    const column = new THREE.Mesh(columnGeometry, stone);
    column.position.set(1.75, 1.3, z);
    tomb.add(column);
  }
  tomb.add(block, pediment, door);
  tomb.position.set(minX + 2.4, groundHeight(minX + 2.4, 0), 0.5);
  group.add(tomb);

  const bark = kit.keep(new THREE.MeshLambertMaterial({ color: '#1c1714', flatShading: true }));
  for (const [x, z, seed, size] of [
    [minX + 4.5, maxZ - 2.5, 0x1d, 1.3],
    [maxX + 3.5, minZ - 4, 0x2e, 1.0],
    [9, 10.5, 0x3f, 0.8],
  ] as const) {
    const tree = new THREE.Mesh(kit.keep(deadTreeGeometry(seed)), bark);
    tree.position.set(x, groundHeight(x, z) - 0.1, z);
    tree.scale.setScalar(size);
    tree.rotation.y = seed;
    group.add(tree);
  }
  return { object: group };
}

// --- Ghosts, fog, bats -----------------------------------------------------

function ghosts(kit: Kit): Piece {
  const group = new THREE.Group();
  const texture = kit.canvasTexture(128, 160, (ctx) => {
    const body = ctx.createLinearGradient(0, 0, 0, 160);
    body.addColorStop(0, 'rgba(235, 240, 255, 0.95)');
    body.addColorStop(1, 'rgba(235, 240, 255, 0)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(18, 150);
    ctx.lineTo(18, 64);
    ctx.bezierCurveTo(18, 10, 110, 10, 110, 64);
    ctx.lineTo(110, 150);
    for (let i = 0; i < 4; i += 1) {
      ctx.quadraticCurveTo(99 - i * 23, 128, 87 - i * 23, 150);
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(20, 20, 40, 0.85)';
    for (const x of [48, 80]) {
      ctx.beginPath();
      ctx.ellipse(x, 60, 7, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const random = seededRandom(0x6405);
  const ghostsList = Array.from({ length: 4 }, (_, index) => {
    const material = kit.keep(
      new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false }),
    );
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.1, 1.4, 1);
    group.add(sprite);
    return {
      sprite,
      x: GRAVEYARD.minX + 3 + random() * (GRAVEYARD.maxX - GRAVEYARD.minX - 5),
      z: GRAVEYARD.minZ + 2 + random() * (GRAVEYARD.maxZ - GRAVEYARD.minZ - 4),
      phase: index * 2.7 + random(),
    };
  });
  return {
    object: group,
    update(_dt, time) {
      for (const ghost of ghostsList) {
        const t = time * 0.25 + ghost.phase;
        const x = ghost.x + Math.sin(t) * 2.2;
        const z = ghost.z + Math.cos(t * 0.7) * 2.2;
        ghost.sprite.position.set(x, groundHeight(x, z) + 1.1 + Math.sin(t * 2.3) * 0.2, z);
        // Fading in and out of the night.
        ghost.sprite.material.opacity = kit.reducedMotion
          ? 0.25
          : Math.max(0, Math.sin(time * 0.3 + ghost.phase)) * 0.4;
      }
    },
  };
}

function groundFog(kit: Kit): Piece {
  const group = new THREE.Group();
  const texture = kit.canvasTexture(256, 256, (ctx) => {
    const random = seededRandom(0xf06);
    for (let i = 0; i < 60; i += 1) {
      const x = 40 + random() * 176;
      const y = 40 + random() * 176;
      const r = 20 + random() * 50;
      const puff = ctx.createRadialGradient(x, y, 0, x, y, r);
      puff.addColorStop(0, 'rgba(255,255,255,0.22)');
      puff.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = puff;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  const random = seededRandom(0xf07);
  const banks = Array.from({ length: 9 }, () => {
    const material = kit.keep(
      new THREE.MeshBasicMaterial({
        map: texture,
        color: '#7a6a9a',
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
    );
    const bank = new THREE.Mesh(kit.keep(new THREE.PlaneGeometry(22, 22)), material);
    bank.rotation.x = -Math.PI / 2;
    const angle = random() * Math.PI * 2;
    const r = 9 + random() * 30;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    bank.position.set(x, groundHeight(x, z) + 0.15 + random() * 0.5, z);
    group.add(bank);
    return { bank, speed: 0.25 + random() * 0.3, phase: random() * 10 };
  });
  return {
    object: group,
    update(dt) {
      if (kit.reducedMotion) return;
      for (const fog of banks) {
        fog.bank.position.x += fog.speed * dt;
        fog.bank.rotation.z += 0.01 * dt;
        if (fog.bank.position.x > 42) fog.bank.position.x = -42;
      }
    },
  };
}

function bats(kit: Kit): Piece {
  const group = new THREE.Group();
  const black = kit.keep(new THREE.MeshBasicMaterial({ color: '#07060a', side: THREE.DoubleSide }));
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(0.3, 0.1);
  wingShape.lineTo(0.42, -0.02);
  wingShape.lineTo(0.3, -0.04);
  wingShape.lineTo(0.22, -0.1);
  wingShape.lineTo(0.12, -0.05);
  wingShape.lineTo(0, -0.08);
  const wingGeometry = kit.keep(new THREE.ShapeGeometry(wingShape).rotateX(-Math.PI / 2));
  const bodyGeometry = kit.keep(new THREE.SphereGeometry(0.06, 6, 4).scale(1, 0.8, 1.6));
  const random = seededRandom(0xba7);
  const moon = new THREE.Vector3(MOON_DIRECTION.x, MOON_DIRECTION.y, MOON_DIRECTION.z);
  const flock = Array.from({ length: 18 }, (_, index) => {
    const bat = new THREE.Group();
    const left = new THREE.Mesh(wingGeometry, black);
    const right = new THREE.Mesh(wingGeometry, black);
    right.scale.x = -1;
    bat.add(new THREE.Mesh(bodyGeometry, black), left, right);
    // Big near the moon (they're far off, but read against it), small nearby.
    const nearMoon = index < 10;
    const size = nearMoon ? 4 + random() * 3 : 1.4 + random();
    bat.scale.setScalar(size);
    group.add(bat);
    const centre = nearMoon
      ? moon.clone().multiplyScalar(90 + random() * 60)
      : new THREE.Vector3(GRAVEYARD.maxX - 5 + random() * 4, 7 + random() * 4, random() * 8 - 4);
    return {
      bat,
      left,
      right,
      centre,
      radius: nearMoon ? 8 + random() * 14 : 3 + random() * 5,
      speed: (0.35 + random() * 0.4) * (random() < 0.5 ? 1 : -1),
      phase: random() * Math.PI * 2,
      flap: 9 + random() * 5,
    };
  });
  return {
    object: group,
    update(_dt, time) {
      for (const bat of flock) {
        const t = time * bat.speed + bat.phase;
        bat.bat.position.set(
          bat.centre.x + Math.cos(t) * bat.radius,
          bat.centre.y + Math.sin(t * 2.1) * bat.radius * 0.25,
          bat.centre.z + Math.sin(t) * bat.radius,
        );
        // Face along the flight path.
        bat.bat.rotation.y = -t + (bat.speed > 0 ? 0 : Math.PI);
        const flap = kit.reducedMotion ? 0.3 : Math.sin(time * bat.flap + bat.phase) * 0.8;
        bat.left.rotation.z = flap;
        bat.right.rotation.z = -flap;
      }
    },
  };
}

// --- A black cat, and a witch ---------------------------------------------

function blackCat(kit: Kit, glow: THREE.Texture): Piece {
  const texture = kit.canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#060508';
    ctx.beginPath();
    ctx.ellipse(64, 92, 26, 30, 0, 0, Math.PI * 2); // body
    ctx.fill();
    ctx.beginPath();
    ctx.arc(64, 52, 18, 0, Math.PI * 2); // head
    ctx.fill();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(64 + side * 6, 40);
      ctx.lineTo(64 + side * 17, 24);
      ctx.lineTo(64 + side * 18, 46);
      ctx.fill();
    }
    ctx.strokeStyle = '#060508';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(86, 110);
    ctx.quadraticCurveTo(116, 100, 108, 66);
    ctx.stroke();
  });
  const cat = new THREE.Sprite(
    kit.keep(new THREE.SpriteMaterial({ map: texture, depthWrite: false })),
  );
  cat.scale.set(0.7, 0.7, 1);
  const x = -2;
  const z = -15;
  cat.position.set(x, groundHeight(x, z) + 1.42, z);
  const eyes = new THREE.Group();
  for (const side of [-1, 1]) {
    const eye = kit.halo(glow, '#c8ff5a', 0.07, 1);
    eye.position.set(side * 0.045, 0.1, 0.01);
    eyes.add(eye);
  }
  eyes.position.copy(cat.position);
  const group = new THREE.Group();
  group.add(cat, eyes);
  return {
    object: group,
    update(_dt, time) {
      // A slow blink every few seconds.
      eyes.visible = kit.reducedMotion || time % 4.3 > 0.18;
    },
  };
}

function witch(kit: Kit): Piece {
  const texture = kit.canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = '#050407';
    ctx.strokeStyle = '#050407';
    ctx.lineCap = 'round';
    // The broom, and its bristles.
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(40, 92);
    ctx.lineTo(220, 72);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(44, 92);
    ctx.lineTo(8, 78);
    ctx.lineTo(4, 100);
    ctx.lineTo(10, 112);
    ctx.closePath();
    ctx.fill();
    // Her cloak, streaming back.
    ctx.beginPath();
    ctx.moveTo(150, 80);
    ctx.quadraticCurveTo(120, 40, 70, 58);
    ctx.quadraticCurveTo(100, 70, 88, 96);
    ctx.quadraticCurveTo(130, 94, 150, 80);
    ctx.fill();
    // Head, and the hat.
    ctx.beginPath();
    ctx.arc(150, 54, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(128, 46);
    ctx.lineTo(176, 44);
    ctx.lineTo(140, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(124, 44, 56, 5);
  });
  const sprite = new THREE.Sprite(
    kit.keep(new THREE.SpriteMaterial({ map: texture, fog: false, depthWrite: false })),
  );
  sprite.visible = false;
  sprite.renderOrder = -8;
  const moon = new THREE.Vector3(MOON_DIRECTION.x, MOON_DIRECTION.y, MOON_DIRECTION.z);
  const across = new THREE.Vector3(-moon.z, 0, moon.x).normalize();
  let clock = 8;
  const FLIGHT = 9;
  const INTERVAL = 38;
  return {
    object: sprite,
    update(dt, _time, camera) {
      if (kit.reducedMotion) return;
      clock += dt;
      const t = (clock % INTERVAL) / FLIGHT;
      sprite.visible = t < 1;
      if (!sprite.visible) return;
      // Across the moon, from left to right, a little rise as she goes.
      const offset = (t - 0.5) * 380;
      sprite.position
        .copy(moon)
        .multiplyScalar(1100)
        .addScaledVector(across, offset)
        .add(new THREE.Vector3(0, (t - 0.5) * 60, 0))
        .add(camera.position);
      sprite.scale.set(70, 35, 1);
    },
  };
}
