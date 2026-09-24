import type { Dice } from '@custom-tabletop/shared';

export interface DiceSyncPlan {
  added: string[];
  removed: string[];
  /** Ids rolled since the last sync — detected by `rollCount`, not by the
   * result, so a re-roll that lands on the same number still animates. A
   * die a later joiner sees already resolved is `added`, not `rolled` (it
   * shouldn't tumble on arrival). */
  rolled: string[];
}

/**
 * Pure diff between a dice list and the previously known roll count per
 * id, so `DiceManager` can decide what to create/remove/animate without
 * repeating this logic inline (keeps the THREE-touching class thin and
 * this part unit-testable without a browser). The caller updates its own
 * tracked state from `dice` after acting on the plan.
 */
export function planDiceSync(
  dice: Dice[],
  previousRollCounts: ReadonlyMap<string, number>,
): DiceSyncPlan {
  const added: string[] = [];
  const rolled: string[] = [];
  const seen = new Set<string>();

  for (const die of dice) {
    seen.add(die.id);
    const previous = previousRollCounts.get(die.id);
    if (previous === undefined) {
      added.push(die.id);
    } else if (die.rollCount > previous && die.result !== null) {
      rolled.push(die.id);
    }
  }

  const removed = [...previousRollCounts.keys()].filter((id) => !seen.has(id));
  return { added, removed, rolled };
}
