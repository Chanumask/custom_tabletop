import type { Drawing, Point2D } from '@custom-tabletop/shared';

function distanceToSegment(point: Point2D, a: Point2D, b: Point2D): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSq));
  const closestX = a.x + t * abx;
  const closestY = a.y + t * aby;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

function distanceToStroke(point: Point2D, drawing: Drawing): number {
  const [first, ...rest] = drawing.points;
  if (!first) {
    return Infinity;
  }
  if (rest.length === 0) {
    return Math.hypot(point.x - first.x, point.y - first.y);
  }

  let min = Infinity;
  let previous = first;
  for (const current of rest) {
    min = Math.min(min, distanceToSegment(point, previous, current));
    previous = current;
  }
  return min;
}

/**
 * Finds the closest stroke to `point` (in the table canvas's own pixel
 * space) whose distance — minus half its own line width, so a thick stroke
 * is as easy to hit as it looks — is within `threshold`, or null if none
 * qualify. The eraser tool's hit-test (Milestone 8's seated drawing
 * toolbar): "erase the line I clicked on," not "erase the line whose
 * infinitely-thin centerline I clicked exactly on." Pure so it's testable
 * without a canvas/DOM, the same extraction pattern as `resolveMovement`
 * (collision.ts) and `nearestInteractable` (interaction.ts).
 */
export function findStrokeNear(
  point: Point2D,
  drawings: Drawing[],
  threshold: number,
): string | null {
  let bestId: string | null = null;
  let bestDistance = Infinity;

  for (const drawing of drawings) {
    const distance = Math.max(0, distanceToStroke(point, drawing) - drawing.width / 2);
    if (distance <= threshold && distance < bestDistance) {
      bestDistance = distance;
      bestId = drawing.id;
    }
  }

  return bestId;
}
