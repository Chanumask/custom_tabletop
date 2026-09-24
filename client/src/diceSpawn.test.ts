import { describe, expect, it } from 'vitest';
import { randomDiceSpawnPosition } from './diceSpawn.js';

const table = { center: { x: 0, z: 0 }, halfWidth: 1, halfDepth: 1, height: 0.78 };

describe('randomDiceSpawnPosition', () => {
  it('rests the die on top of the play surface', () => {
    expect(randomDiceSpawnPosition(table, 0.12, () => 0.5).y).toBeCloseTo(0.78 + 0.06);
  });

  it('stays well inside the play surface for any random draw', () => {
    for (const random of [0, 0.25, 0.5, 0.75, 0.999]) {
      const position = randomDiceSpawnPosition(table, 0.12, () => random);
      expect(Math.abs(position.x)).toBeLessThanOrEqual(0.7 + 1e-9);
      expect(Math.abs(position.z)).toBeLessThanOrEqual(0.7 + 1e-9);
    }
  });

  it('is centered on the table, not the world origin, when the table is off-center', () => {
    const position = randomDiceSpawnPosition({ ...table, center: { x: 5, z: -3 } }, 0.1, () => 0.5);
    expect(position.x).toBeCloseTo(5);
    expect(position.z).toBeCloseTo(-3);
  });
});
