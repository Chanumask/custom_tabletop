/**
 * "Look at it and press E" (docs/decisions.md, "The cozy room"): small
 * things close together — the candles on the mantel, the fire under them,
 * the cat on the rug in front — can't be told apart by who's nearest, the
 * way the chest or the table can. Each is a sphere in the room; the one the
 * crosshair's ray passes through first, within reach, is what E acts on.
 */

export interface AimTarget {
  id: string;
  /** Where it is, and how big (a sphere around it). */
  center: { x: number; y: number; z: number };
  radius: number;
  /** How far from the eye (metres) it can be reached. */
  reach: number;
  /** What the prompt says now (it can change: "light" or "blow out"). */
  prompt: () => string;
  /** What E does — Shift+E may do something else (a window's curtains). */
  act: (shift: boolean) => void;
  /** Hidden or unavailable right now (e.g. not a candle to blow out). */
  disabled?: () => boolean;
}

export interface Ray {
  origin: { x: number; y: number; z: number };
  /** Unit length. */
  direction: { x: number; y: number; z: number };
}

/** How far along `ray` it first touches the sphere, or null if it misses. Pure. */
export function rayHitsSphere(
  ray: Ray,
  center: { x: number; y: number; z: number },
  radius: number,
): number | null {
  const ox = ray.origin.x - center.x;
  const oy = ray.origin.y - center.y;
  const oz = ray.origin.z - center.z;
  const b = ox * ray.direction.x + oy * ray.direction.y + oz * ray.direction.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const near = -b - root;
  if (near >= 0) return near;
  // Inside the sphere: it's right there.
  return -b + root >= 0 ? 0 : null;
}

/** The target the crosshair is on — the nearest one hit within its reach —
 * or null. Pure. */
export function pickAimTarget(ray: Ray, targets: readonly AimTarget[]): AimTarget | null {
  let best: AimTarget | null = null;
  let bestDistance = Infinity;
  for (const target of targets) {
    if (target.disabled?.()) continue;
    const distance = rayHitsSphere(ray, target.center, target.radius);
    if (distance !== null && distance <= target.reach && distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}
