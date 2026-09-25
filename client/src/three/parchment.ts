/**
 * The blank table: aged parchment rather than a flat fill — soft mottling,
 * faint fibers, a couple of old cup rings, darker worn edges and a small
 * compass rose in one corner. Painted once per page (it's the same for
 * every redraw) and seeded, so every player sees the very same sheet.
 */

/** A small, fast seeded PRNG (mulberry32): the same seed always yields the
 * same sequence of numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PARCHMENT_SEED = 20260925;
let cached: HTMLCanvasElement | null = null;

/** The parchment sheet at `pixels` square, painted on first use. */
export function parchmentSheet(pixels: number, base: string): HTMLCanvasElement {
  if (cached && cached.width === pixels) {
    return cached;
  }
  const canvas = document.createElement('canvas');
  canvas.width = pixels;
  canvas.height = pixels;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    paint(ctx, pixels, base, seededRandom(PARCHMENT_SEED));
  }
  cached = canvas;
  return canvas;
}

function paint(
  ctx: CanvasRenderingContext2D,
  size: number,
  base: string,
  random: () => number,
): void {
  const unit = size / 1024;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Mottling: overlapping soft blotches, some darker, some paler.
  for (let i = 0; i < 240; i++) {
    const x = random() * size;
    const y = random() * size;
    const radius = size * (0.03 + random() * 0.1);
    const alpha = 0.02 + random() * 0.045;
    const rgb = random() < 0.65 ? '146, 100, 50' : '255, 244, 216';
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(${rgb}, ${alpha})`);
    glow.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Fibers: short, faint, mostly-horizontal strands.
  ctx.lineCap = 'round';
  for (let i = 0; i < 1600; i++) {
    const x = random() * size;
    const y = random() * size;
    const length = unit * (6 + random() * 22);
    const angle = (random() - 0.5) * 0.9;
    ctx.strokeStyle = `rgba(96, 66, 34, ${0.03 + random() * 0.05})`;
    ctx.lineWidth = unit * (0.4 + random() * 0.6);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }

  // Two old cup rings, near the edges where a mug would have stood.
  for (const [cx, cy, r] of [
    [0.13, 0.2, 44],
    [0.83, 0.12, 38],
  ] as const) {
    for (let pass = 0; pass < 3; pass++) {
      ctx.strokeStyle = `rgba(122, 78, 36, ${0.07 + random() * 0.05})`;
      ctx.lineWidth = unit * (1.5 + random() * 2.5);
      ctx.beginPath();
      const start = random() * Math.PI * 2;
      ctx.arc(
        cx * size + (random() - 0.5) * unit * 4,
        cy * size + (random() - 0.5) * unit * 4,
        r * unit * (0.96 + random() * 0.08),
        start,
        start + Math.PI * (1.3 + random() * 0.7),
      );
      ctx.stroke();
    }
  }

  // Worn, darker edges.
  const middle = size / 2;
  const edges = ctx.createRadialGradient(middle, middle, size * 0.36, middle, middle, size * 0.74);
  edges.addColorStop(0, 'rgba(104, 64, 28, 0)');
  edges.addColorStop(1, 'rgba(104, 64, 28, 0.32)');
  ctx.fillStyle = edges;
  ctx.fillRect(0, 0, size, size);

  paintCompass(ctx, size * 0.875, size * 0.875, unit * 64);
}

/** An eight-point compass rose in faded ink. */
function paintCompass(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  const ink = 'rgba(74, 46, 22, 0.34)';
  const wash = 'rgba(74, 46, 22, 0.12)';
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';

  ctx.strokeStyle = ink;
  ctx.lineWidth = radius * 0.025;
  for (const ring of [0.62, 0.7]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius * ring, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Short diagonal points first, then the long cardinal ones over them.
  for (const [length, width, offset] of [
    [0.6, 0.12, Math.PI / 4],
    [1, 0.16, 0],
  ] as const) {
    for (let i = 0; i < 4; i++) {
      const angle = offset + (i * Math.PI) / 2;
      ctx.save();
      ctx.rotate(angle);
      // Each point is two halves: one inked, one only washed — the classic
      // light-and-shadow look.
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -radius * length);
      ctx.lineTo(radius * width, -radius * width);
      ctx.closePath();
      ctx.fillStyle = ink;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -radius * length);
      ctx.lineTo(-radius * width, -radius * width);
      ctx.closePath();
      ctx.fillStyle = wash;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.fillStyle = ink;
  ctx.font = `700 ${radius * 0.3}px Georgia, 'Times New Roman', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('N', 0, -radius * 1.08);
  ctx.restore();
}
