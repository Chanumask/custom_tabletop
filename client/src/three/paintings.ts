import * as THREE from 'three';
import { seededRandom } from './parchment.js';

/**
 * The two framed pictures on the north and south walls came with the
 * asset's stock artwork (a mock-up print). They get paintings that belong in
 * a game room instead (docs/decisions.md, "Checking the room"): a map of the
 * realm, and a star chart. Painted on canvases at load, seeded, so every
 * player sees the same pictures.
 */
const WIDTH = 512;
const HEIGHT = 730; // the frames' portrait aspect

/** The mat around every picture. */
function withMat(paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = '#e9dfc8';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const mat = 34;
  ctx.save();
  ctx.translate(mat, mat);
  ctx.beginPath();
  ctx.rect(0, 0, WIDTH - mat * 2, HEIGHT - mat * 2);
  ctx.clip();
  paint(ctx, WIDTH - mat * 2, HEIGHT - mat * 2);
  ctx.restore();
  // A thin bevel where the mat meets the picture.
  ctx.strokeStyle = 'rgba(90, 70, 40, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(mat - 1, mat - 1, WIDTH - mat * 2 + 2, HEIGHT - mat * 2 + 2);
  return canvas;
}

/** A hand-drawn map of an island realm: coast, mountains, woods, a river,
 * a town, a compass and a sea serpent. */
export function realmMap(): HTMLCanvasElement {
  return withMat((ctx, w, h) => {
    const random = seededRandom(0x4ea1);
    // Sea-stained parchment.
    ctx.fillStyle = '#d9c49a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i += 1) {
      const x = random() * w;
      const y = random() * h;
      const r = 20 + random() * 80;
      const blotch = ctx.createRadialGradient(x, y, 0, x, y, r);
      blotch.addColorStop(0, `rgba(140, 100, 50, ${0.03 + random() * 0.05})`);
      blotch.addColorStop(1, 'rgba(140, 100, 50, 0)');
      ctx.fillStyle = blotch;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // The island: a wobbly blob, the sea shaded around it.
    const cx = w * 0.5;
    const cy = h * 0.52;
    const coast: [number, number][] = [];
    for (let i = 0; i < 72; i += 1) {
      const angle = (i / 72) * Math.PI * 2;
      const r =
        Math.min(w, h) *
        (0.34 +
          0.07 * Math.sin(angle * 3 + 1) +
          0.04 * Math.sin(angle * 7 + 2) +
          0.02 * (random() - 0.5));
      coast.push([cx + Math.cos(angle) * r * 1.05, cy + Math.sin(angle) * r * 1.3]);
    }
    const trace = () => {
      ctx.beginPath();
      coast.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
    };
    for (let ring = 5; ring >= 1; ring -= 1) {
      ctx.save();
      trace();
      ctx.lineWidth = ring * 9;
      ctx.strokeStyle = `rgba(70, 110, 120, ${0.05 + (6 - ring) * 0.025})`;
      ctx.stroke();
      ctx.restore();
    }
    trace();
    ctx.fillStyle = '#e6d4a8';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#4a3420';
    ctx.stroke();
    const ink = '#4a3420';
    // Mountains along the north.
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 9; i += 1) {
      const x = cx - 110 + i * 26 + (random() - 0.5) * 8;
      const y = cy - 120 + Math.sin(i) * 16;
      const s = 14 + random() * 8;
      ctx.beginPath();
      ctx.moveTo(x - s, y + s);
      ctx.lineTo(x, y - s * 0.6);
      ctx.lineTo(x + s, y + s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.6);
      ctx.lineTo(x + s * 0.35, y + s * 0.2);
      ctx.stroke();
    }
    // Woods in the south-west.
    for (let i = 0; i < 26; i += 1) {
      const x = cx - 120 + random() * 110;
      const y = cy + 40 + random() * 110;
      ctx.beginPath();
      ctx.arc(x, y, 5 + random() * 3, Math.PI, 0);
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 6);
      ctx.stroke();
    }
    // A river from the mountains to the sea.
    ctx.strokeStyle = '#3f6a78';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx + 20, cy - 96);
    ctx.bezierCurveTo(cx + 60, cy - 30, cx - 10, cy + 20, cx + 40, cy + 80);
    ctx.bezierCurveTo(cx + 70, cy + 120, cx + 110, cy + 150, cx + 150, cy + 190);
    ctx.stroke();
    // The town, marked in red.
    ctx.fillStyle = '#8a2a1c';
    ctx.beginPath();
    ctx.arc(cx + 34, cy + 62, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.font = 'italic 600 15px Georgia, serif';
    ctx.fillText('Emberfall', cx + 44, cy + 58);
    // A sea serpent, and a compass rose.
    ctx.strokeStyle = '#3f5a60';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 40; i += 1) {
      const x = 30 + i * 3.2;
      const y = h - 70 + Math.sin(i * 0.45) * 9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#3f5a60';
    ctx.beginPath();
    ctx.ellipse(162, h - 74, 9, 6, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // In from the edge: the frame's UVs trim a little off the sides.
    const rose = { x: w - 88, y: 74 };
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(rose.x, rose.y, 30, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 4; i += 1) {
      const angle = (i * Math.PI) / 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(rose.x + Math.cos(angle) * 38, rose.y + Math.sin(angle) * 38);
      ctx.lineTo(rose.x + Math.cos(angle + 0.5) * 8, rose.y + Math.sin(angle + 0.5) * 8);
      ctx.lineTo(rose.x + Math.cos(angle - 0.5) * 8, rose.y + Math.sin(angle - 0.5) * 8);
      ctx.closePath();
      if (i === 0) ctx.fill();
      else ctx.stroke();
    }
    ctx.font = '700 12px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', rose.x, rose.y - 44);
    // The title cartouche.
    ctx.font = '700 26px Georgia, serif';
    ctx.fillText('The Realm', w / 2, 46);
    ctx.font = 'italic 13px Georgia, serif';
    ctx.fillText('here be dragons', 100, h - 30);
  });
}

/** A gold-on-navy star chart: constellations, a ring of degrees, the moon. */
export function starChart(): HTMLCanvasElement {
  return withMat((ctx, w, h) => {
    const random = seededRandom(0x57a2);
    const sky = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, h * 0.7);
    sky.addColorStop(0, '#1d2a52');
    sky.addColorStop(1, '#0b1128');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i += 1) {
      ctx.fillStyle = `rgba(255, 244, 214, ${0.3 + random() * 0.6})`;
      ctx.beginPath();
      ctx.arc(random() * w, random() * h, random() * 1.3 + 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    const gold = '#d9b25a';
    const cx = w / 2;
    const cy = h / 2 + 10;
    const radius = w * 0.36;
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.5;
    for (const r of [radius, radius - 14]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 72; i += 1) {
      const angle = (i / 72) * Math.PI * 2;
      const inner = i % 6 === 0 ? radius - 14 : radius - 6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.stroke();
    }
    // Four constellations, stars joined by fine gold lines.
    ctx.lineWidth = 1;
    for (let c = 0; c < 4; c += 1) {
      const angle = (c / 4) * Math.PI * 2 + 0.4;
      const ox = cx + Math.cos(angle) * radius * 0.5;
      const oy = cy + Math.sin(angle) * radius * 0.5;
      const stars: [number, number][] = [];
      for (let s = 0; s < 5; s += 1) {
        stars.push([ox + (random() - 0.5) * 90, oy + (random() - 0.5) * 90]);
      }
      ctx.strokeStyle = 'rgba(217, 178, 90, 0.7)';
      ctx.beginPath();
      stars.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
      ctx.fillStyle = '#fff4d6';
      for (const [x, y] of stars) {
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // A crescent moon at the centre.
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16204a';
    ctx.beginPath();
    ctx.arc(cx + 11, cy - 6, 23, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = gold;
    ctx.textAlign = 'center';
    ctx.font = '700 22px Georgia, serif';
    ctx.fillText('Caelum Nocturnum', w / 2, 42);
    ctx.font = 'italic 13px Georgia, serif';
    ctx.fillText('the stars over the realm', w / 2, h - 26);
  });
}

/** Swaps the stock artwork in the room's two small frames for our
 * paintings. Returns what to dispose with the room. */
export function hangPaintings(root: THREE.Object3D): { dispose(): void }[] {
  const made: { dispose(): void }[] = [];
  const art: Record<string, () => HTMLCanvasElement> = {
    hanging_picture_frame_01_north: realmMap,
    hanging_picture_frame_01: starChart,
  };
  for (const [frameName, paint] of Object.entries(art)) {
    const frame = root.getObjectByName(frameName);
    frame?.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const material = node.material as THREE.MeshStandardMaterial;
      if (!/artwork/i.test(material.name)) return;
      const texture = new THREE.CanvasTexture(paint());
      texture.flipY = false; // glTF's UV convention
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      const painted = material.clone();
      painted.map = texture;
      painted.roughness = 0.85;
      node.material = painted;
      made.push(texture, painted);
    });
  }
  return made;
}
