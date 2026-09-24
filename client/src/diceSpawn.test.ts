import { describe, expect, it } from 'vitest';
import { randomDiceSpawnPosition } from './diceSpawn.js';

const table = { center: { x: 0, z: 0 }, halfWidth: 1, halfDepth: 1, height: 0.78 };

describe('randomDiceSpawnPosition', () => {
  it('puts the die on the play surface', () => {
    expect(randomDiceSpawnPosition(table, [], () => 0.5).y).toBeCloseTo(0.78);
  });

  it('stays well inside the play surface for any random draw', () => {
    for (const random of [0, 0.25, 0.5, 0.75, 0.999]) {
      const position = randomDiceSpawnPosition(table, [], () => random);
      expect(Math.abs(position.x)).toBeLessThanOrEqual(0.7 + 1e-9);
      expect(Math.abs(position.z)).toBeLessThanOrEqual(0.7 + 1e-9);
    }
  });

  it('is centered on the table, not the world origin, when the table is off-center', () => {
    const position = randomDiceSpawnPosition({ ...table, center: { x: 5, z: -3 } }, [], () => 0.5);
    expect(position.x).toBeCloseTo(5);
    expect(position.z).toBeCloseTo(-3);
  });

  it('keeps clear of dice already on the table', () => {
    // A die sits dead center; of the candidates, the farthest one wins.
    const draws = [0.5, 0.5, 0.95, 0.95, 0.55, 0.5];
    let i = 0;
    const random = () => draws[i++ % draws.length]!;
    const position = randomDiceSpawnPosition(table, [{ x: 0, y: 0.78, z: 0 }], random);
    expect(Math.hypot(position.x, position.z)).toBeGreaterThan(0.5);
  });
});
