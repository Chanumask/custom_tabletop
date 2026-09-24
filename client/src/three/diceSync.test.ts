import { describe, expect, it } from 'vitest';
import type { Dice } from '@custom-tabletop/shared';
import { planDiceSync } from './diceSync.js';

function makeDie(id: string, result: number | null = null, rollCount = result ? 1 : 0): Dice {
  return {
    id,
    ownerId: 'p1',
    kind: 'd6',
    position: { x: 0, y: 0, z: 0 },
    result,
    rollCount,
    rolledBy: result ? 'p1' : null,
  };
}

describe('planDiceSync', () => {
  it('reports a brand-new die as added, never rolled', () => {
    const plan = planDiceSync([makeDie('d1')], new Map());
    expect(plan).toEqual({ added: ['d1'], removed: [], rolled: [] });
  });

  it('a later joiner seeing an already-resolved die reports it as added, not rolled', () => {
    const plan = planDiceSync([makeDie('d1', 5)], new Map());
    expect(plan).toEqual({ added: ['d1'], removed: [], rolled: [] });
  });

  it('reports a first roll as rolled', () => {
    const plan = planDiceSync([makeDie('d1', 4, 1)], new Map([['d1', 0]]));
    expect(plan).toEqual({ added: [], removed: [], rolled: ['d1'] });
  });

  it('reports a re-roll as rolled — even when it lands on the same number', () => {
    expect(planDiceSync([makeDie('d1', 2, 2)], new Map([['d1', 1]])).rolled).toEqual(['d1']);
    expect(planDiceSync([makeDie('d1', 4, 2)], new Map([['d1', 1]])).rolled).toEqual(['d1']);
  });

  it('reports no change when the roll count is unchanged', () => {
    const plan = planDiceSync([makeDie('d1', 4, 3)], new Map([['d1', 3]]));
    expect(plan).toEqual({ added: [], removed: [], rolled: [] });
  });

  it('reports a die missing from the new list as removed', () => {
    const plan = planDiceSync([], new Map([['d1', 1]]));
    expect(plan).toEqual({ added: [], removed: ['d1'], rolled: [] });
  });

  it('handles a mix of added, removed, rolled, and unchanged dice in one sync', () => {
    const previous = new Map([
      ['stays', 1],
      ['rerolled', 1],
      ['gone', 1],
    ]);
    const plan = planDiceSync(
      [makeDie('stays', 1, 1), makeDie('rerolled', 5, 2), makeDie('fresh')],
      previous,
    );
    expect(plan.added).toEqual(['fresh']);
    expect(plan.removed).toEqual(['gone']);
    expect(plan.rolled).toEqual(['rerolled']);
  });
});
