/**
 * Where a sound in the room is, heard from where the player stands: how loud
 * (farther is quieter) and how far left or right. Pure, so the room's many
 * little sounds (footsteps, the clock, the door, the cat) all place
 * themselves the same way.
 */

export interface Listener {
  x: number;
  z: number;
  /** Which way the listener faces (radians; facing is (sin, cos) of it, like
   * `Player.rotationY`). */
  yaw: number;
}

export interface Placement {
  /** 0..1 */
  volume: number;
  /** -1 (left) .. 1 (right) */
  pan: number;
}

/**
 * `near`: within this many metres, full volume. `far`: past it, silent.
 * In between it eases down (squared), which sounds natural in a room.
 */
export function placeSound(
  listener: Listener,
  source: { x: number; z: number },
  near = 1,
  far = 8,
): Placement {
  const dx = source.x - listener.x;
  const dz = source.z - listener.z;
  const distance = Math.hypot(dx, dz);
  const t = Math.min(Math.max((distance - near) / Math.max(far - near, 1e-6), 0), 1);
  const volume = (1 - t) ** 2;
  if (distance < 1e-6) return { volume, pan: 0 };
  // The listener's right is (cos yaw, -sin yaw) when facing (sin yaw, cos yaw).
  const right = (dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw)) / distance;
  // Never hard left/right: both ears hear everything in a small room.
  return { volume, pan: Math.max(-0.8, Math.min(0.8, right * 0.8)) };
}

/** What a window does to the sound of outside (the night, the rain) heard
 * through it: open, louder; its curtains drawn, softer. */
export function throughWindow(open: boolean, drawn: boolean): number {
  return open ? 1.6 : drawn ? 0.55 : 1;
}
