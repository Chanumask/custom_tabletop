import { describe, expect, it } from 'vitest';
import type { Dice } from '@custom-tabletop/shared';
import { planDiceSync } from './diceSync.js';

function makeDie(id: string, result: number | null = null): Dice {
  return { id, ownerId: 'p1', position: { x: 0, y: 0, z: 0 }, result };
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

  it('reports a result changing from null to a number as rolled', () => {
    const previous = new Map([['d1', null]]);
    const plan = planDiceSync([makeDie('d1', 4)], previous);
    expect(plan).toEqual({ added: [], removed: [], rolled: ['d1'] });
  });

  it('reports a result changing from one number to another as rolled (re-roll)', () => {
    const previous = new Map([['d1', 4]]);
    const plan = planDiceSync([makeDie('d1', 2)], previous);
    expect(plan).toEqual({ added: [], removed: [], rolled: ['d1'] });
  });

  it('reports no change when the result is unchanged', () => {
    const previous = new Map([['d1', 4]]);
    const plan = planDiceSync([makeDie('d1', 4)], previous);
    expect(plan).toEqual({ added: [], removed: [], rolled: [] });
  });

  it('reports a die missing from the new list as removed', () => {
    const previous = new Map([['d1', 4]]);
    const plan = planDiceSync([], previous);
    expect(plan).toEqual({ added: [], removed: ['d1'], rolled: [] });
  });

  it('handles a mix of added, removed, rolled, and unchanged dice in one sync', () => {
    const previous = new Map([
      ['stays', 1],
      ['rerolled', 3],
      ['gone', 6],
    ]);
    const plan = planDiceSync(
      [makeDie('stays', 1), makeDie('rerolled', 5), makeDie('fresh')],
      previous,
    );
    expect(plan.added).toEqual(['fresh']);
    expect(plan.removed).toEqual(['gone']);
    expect(plan.rolled).toEqual(['rerolled']);
  });
});
