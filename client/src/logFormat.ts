import type { LogEntry } from '@custom-tabletop/shared';

type RollEntry = Extract<LogEntry, { kind: 'roll' }>;

/** What was rolled, in dice notation: the typed text for a /roll, or the
 * table dice grouped by size ("2d6+1d20") for a roll of physical dice. */
export function rollSummary(entry: RollEntry): string {
  if (entry.notation) {
    return entry.notation;
  }
  const counts = new Map<number, number>();
  for (const die of entry.dice) {
    counts.set(die.sides, (counts.get(die.sides) ?? 0) + 1);
  }
  return [...counts.entries()].map(([sides, count]) => `${count}d${sides}`).join('+');
}

/** The individual results and modifier, as a sum: "4 + 2 − 1 + 3". */
export function rollBreakdown(entry: RollEntry): string {
  const terms = entry.dice.map((die, index) => {
    if (index === 0) {
      return die.subtract ? `−${die.result}` : String(die.result);
    }
    return `${die.subtract ? '−' : '+'} ${die.result}`;
  });
  if (entry.modifier) {
    terms.push(`${entry.modifier < 0 ? '−' : '+'} ${Math.abs(entry.modifier)}`);
  }
  return terms.join(' ');
}

/** A lone d20 that came up 20 or 1 — worth making a fuss about. */
export function rollFlavor(entry: RollEntry): 'critical' | 'fumble' | null {
  const d20s = entry.dice.filter((die) => die.sides === 20);
  if (d20s.length !== 1) {
    return null;
  }
  return d20s[0]!.result === 20 ? 'critical' : d20s[0]!.result === 1 ? 'fumble' : null;
}

/** The speech-bubble text for a typed roll over the roller's head. */
export function rollBubble(entry: RollEntry): string {
  const flavor = rollFlavor(entry);
  const suffix = flavor === 'critical' ? ' — nat 20!' : flavor === 'fumble' ? ' — nat 1…' : '';
  return `🎲 ${rollSummary(entry)} → ${entry.total}${suffix}`;
}

/**
 * The collapsed chat feed: entries this client first saw less than
 * `seconds` ago (by its own clock — `seenAt`), newest `max` of them. Lines
 * that were already in the log when the view opened are history
 * (`-Infinity`) and never pop up.
 */
export function feedEntries<T extends { id: string }>(
  log: readonly T[],
  seenAt: ReadonlyMap<string, number>,
  now: number,
  seconds: number,
  max: number,
): T[] {
  return log
    .filter((entry) => (now - (seenAt.get(entry.id) ?? -Infinity)) / 1000 < seconds)
    .slice(-max);
}
