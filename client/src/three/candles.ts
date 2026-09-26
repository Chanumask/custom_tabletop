import type { Object3D } from 'three';
import type { CandleGroup } from '@custom-tabletop/shared';

/** Which holder (by its name in the room model) holds which candle group. */
const HOLDERS: Record<string, CandleGroup> = {
  brass_candleholder_01: 'chest-candle',
  brass_candleholder_02: 'mantel-north',
  brass_candleholder_03: 'mantel-south',
  vintage_oil_lamp: 'oil-lamp',
};

/** The two wall sconces' flames are loose in the model, named per side. */
const SCONCES: Record<string, CandleGroup> = {
  Flame_Sconce_0: 'sconce-west',
  Flame_Sconce_1: 'sconce-east',
};

/** Which candle group a flame (`Flame_*` in the room model) belongs to —
 * the holder it stands in, or its own sconce — or null for anything else. */
export function candleGroupOf(flame: Object3D): CandleGroup | null {
  const sconce = SCONCES[flame.name];
  if (sconce) return sconce;
  for (let node: Object3D | null = flame.parent; node; node = node.parent) {
    const group = HOLDERS[node.name];
    if (group) return group;
  }
  return null;
}

/** What E says for a candle group. */
export function candlePrompt(group: CandleGroup, lit: boolean, key: string): string {
  const what =
    group === 'oil-lamp'
      ? 'the oil lamp'
      : group === 'chest-candle' || group.startsWith('sconce')
        ? 'the candle'
        : 'the candles';
  return lit ? `Press ${key} to blow out ${what}` : `Press ${key} to light ${what}`;
}
