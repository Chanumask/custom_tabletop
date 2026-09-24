export interface Interactable {
  id: string;
  position: { x: number; z: number };
  /** How close (metres, XZ distance only — height doesn't matter for a
   * room interactable) counts as "approaching" it. */
  range: number;
}

/**
 * Returns the closest interactable within its own `range` of `position`, or
 * null if none are in range — the proximity half of the "walk up and press
 * E" interaction model (Milestone 8, user-chosen over a raycast/click model
 * like table drawing uses). Pure so this is unit-testable without a DOM/
 * Three.js instance, the same extraction pattern as `resolveMovement`
 * (collision.ts) and `tableLocalToCanvas` (tableCoordinates.ts).
 */
export function nearestInteractable(
  position: { x: number; z: number },
  interactables: Interactable[],
): Interactable | null {
  let nearest: Interactable | null = null;
  let nearestDistance = Infinity;

  for (const interactable of interactables) {
    const dx = position.x - interactable.position.x;
    const dz = position.z - interactable.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= interactable.range && distance < nearestDistance) {
      nearest = interactable;
      nearestDistance = distance;
    }
  }

  return nearest;
}
