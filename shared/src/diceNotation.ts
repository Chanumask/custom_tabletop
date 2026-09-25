/**
 * Typed dice notation for `/roll` in chat: terms joined by + and -, each
 * `NdS` (N dice of S sides, N defaults to 1) or a flat number — "d20+5",
 * "2d6 + 1d4 - 1", "4d6". Parsed the same on client (to preview/validate)
 * and server (which rolls).
 */
export interface DiceNotation {
  /** Groups of dice to roll; a negative count subtracts that group. */
  groups: { count: number; sides: number }[];
  modifier: number;
  /** Normalized text, e.g. "2d6+1d4-1". */
  text: string;
}

export const MAX_NOTATION_DICE = 50;
export const MAX_NOTATION_SIDES = 1000;

export function parseDiceNotation(raw: string): DiceNotation | null {
  const compact = raw.toLowerCase().replace(/\s+/g, '');
  if (!compact || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(compact)) {
    return null;
  }

  const groups: DiceNotation['groups'] = [];
  let modifier = 0;
  let totalDice = 0;
  for (const [, sign, term] of compact.matchAll(/([+-]?)(\d*d\d+|\d+)/g)) {
    const direction = sign === '-' ? -1 : 1;
    const dice = /^(\d*)d(\d+)$/.exec(term!);
    if (dice) {
      const count = dice[1] ? Number(dice[1]) : 1;
      const sides = Number(dice[2]);
      if (count < 1 || sides < 2 || sides > MAX_NOTATION_SIDES) {
        return null;
      }
      totalDice += count;
      groups.push({ count: count * direction, sides });
    } else {
      modifier += Number(term) * direction;
    }
  }
  if (groups.length === 0 || totalDice > MAX_NOTATION_DICE || Math.abs(modifier) > 10000) {
    return null;
  }

  const text = [
    ...groups.map((group, index) => {
      const term = `${Math.abs(group.count)}d${group.sides}`;
      return group.count < 0 ? `-${term}` : index === 0 ? term : `+${term}`;
    }),
    modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : '',
  ].join('');
  return { groups, modifier, text };
}

/** If a chat line is a roll command, the notation after it ("/r d20"). */
export function rollCommand(text: string): string | null {
  const match = /^\/(?:roll|r)(?:\s+(.*))?$/i.exec(text.trim());
  return match ? (match[1] ?? '').trim() : null;
}
