import { describe, expect, it } from 'vitest';
import { randomDiceSpawnPosition } from './diceSpawn.js';

const layout = { table: { center: { x: 0, z: 0 }, radius: 1.1 }, tableHeight: 0.75 };

describe('randomDiceSpawnPosition', () => {
  it('rests the die on top of the table surface', () => {
    const position = randomDiceSpawnPosition(layout, 0.12, () => 0);
    expect(position.y).toBeCloseTo(0.75 + 0.06);
  });

  it('stays within SPAWN_RADIUS_FRACTION of the table radius, centered on the table', () => {
    for (const random of [0, 0.25, 0.5, 0.75, 0.999]) {
      const position = randomDiceSpawnPosition(layout, 0.12, () => random);
      const distanceFromCenter = Math.hypot(
        position.x - layout.table.center.x,
        position.z - layout.table.center.z,
      );
      expect(distanceFromCenter).toBeLessThanOrEqual(layout.table.radius * 0.6 + 1e-9);
    }
  });

  it('offsets the table center, not the world origin, when the table is off-center', () => {
    const offsetLayout = { table: { center: { x: 5, z: -3 }, radius: 1 }, tableHeight: 0.5 };
    const position = randomDiceSpawnPosition(offsetLayout, 0.1, () => 0);
    // random()=0 -> angle=0, distance=0, so the point is exactly the center
    expect(position.x).toBeCloseTo(5);
    expect(position.z).toBeCloseTo(-3);
  });
});
