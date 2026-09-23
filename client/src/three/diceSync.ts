import type { Dice } from '@custom-tabletop/shared';

export interface DiceSyncPlan {
  added: string[];
  removed: string[];
  /** Ids whose result changed to a new non-null value this sync — i.e. dice
   * that were just rolled, as opposed to a die a later joiner sees already
   * resolved (that's `added`, not `rolled` — it shouldn't spin on arrival). */
  rolled: string[];
}

/**
 * Pure diff between a dice list and the previously known result per id, so
 * `DiceManager` can decide what to create/remove/animate without repeating
 * this logic inline (extracted the same way `tableCoordinates.ts`/
 * `tableTopUV.ts` were in Milestone 5 — keeps the DOM/THREE-touching class
 * thin and this part unit-testable without a browser). The caller updates
 * its own tracked state from `dice` after acting on the plan.
 */
export function planDiceSync(
  dice: Dice[],
  previousResults: ReadonlyMap<string, number | null>,
): DiceSyncPlan {
  const added: string[] = [];
  const rolled: string[] = [];
  const seen = new Set<string>();

  for (const die of dice) {
    seen.add(die.id);
    if (!previousResults.has(die.id)) {
      added.push(die.id);
      continue;
    }
    const previous = previousResults.get(die.id);
    if (die.result !== previous && die.result !== null) {
      rolled.push(die.id);
    }
  }

  const removed: string[] = [];
  for (const id of previousResults.keys()) {
    if (!seen.has(id)) {
      removed.push(id);
    }
  }

  return { added, removed, rolled };
}
