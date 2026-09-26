/**
 * The room's own shared, changeable things (docs/decisions.md, "The cozy
 * room"): what anyone can switch, light or open — the same for everyone,
 * like the room light already was. One small object in GameState, patched
 * as a whole (it stays a few hundred bytes).
 */

/** The candles, by where they stand: the two candelabras on the mantel,
 * the candle and the oil lamp on the chest, and the two wall sconces by the
 * sideboard. Each group is blown out or lit as one. */
export const CANDLE_GROUPS = [
  'mantel-north',
  'mantel-south',
  'chest-candle',
  'oil-lamp',
  'sconce-west',
  'sconce-east',
] as const;

export type CandleGroup = (typeof CANDLE_GROUPS)[number];

export function isCandleGroup(value: unknown): value is CandleGroup {
  return CANDLE_GROUPS.some((group) => group === value);
}

export interface RoomState {
  /** The reading lamp by the armchair — its own switch, apart from the
   * room's main light (`GameState.lightOn`, the switch by the door). */
  readingLampOn: boolean;
  /** When someone last put a log on the fire (server clock, ms), or null:
   * it flares up and burns back down over `FIRE_BURN_MS` (`fireLevel`). */
  fireStokedAt: number | null;
  /** Candle groups that are out; every other one burns. */
  candlesOut: CandleGroup[];
}

export const DEFAULT_ROOM_STATE: RoomState = {
  readingLampOn: true,
  fireStokedAt: null,
  candlesOut: [],
};

/** How long a freshly stoked fire takes to burn back down (ms). */
export const FIRE_BURN_MS = 3 * 60_000;
/** How much bigger a freshly stoked fire burns (1 = its usual size). */
export const FIRE_STOKE_BOOST = 0.75;
/** The new log catches over this long (ms) before the fire is at its biggest. */
const FIRE_CATCH_MS = 1800;
/** One log at a time: stoking again sooner changes nothing. */
export const STOKE_MIN_INTERVAL_MS = 4000;

/** How big the fire burns at `now` (1 = usual, up to 1 + FIRE_STOKE_BOOST
 * right after a stoke), given when it was last stoked. Pure. */
export function fireLevel(stokedAt: number | null, now: number): number {
  if (stokedAt === null) return 1;
  const since = now - stokedAt;
  if (since < 0) return 1;
  if (since >= FIRE_BURN_MS) return 1;
  const caught = Math.min(1, since / FIRE_CATCH_MS);
  const left = 1 - since / FIRE_BURN_MS;
  return 1 + FIRE_STOKE_BOOST * caught * left ** 1.5;
}

/** A saved or partial room state, filled in with today's defaults. */
export function normalizeRoomState(saved: Partial<RoomState> | undefined): RoomState {
  return {
    readingLampOn:
      typeof saved?.readingLampOn === 'boolean'
        ? saved.readingLampOn
        : DEFAULT_ROOM_STATE.readingLampOn,
    fireStokedAt: typeof saved?.fireStokedAt === 'number' ? saved.fireStokedAt : null,
    candlesOut: Array.isArray(saved?.candlesOut)
      ? CANDLE_GROUPS.filter((group) => saved.candlesOut!.includes(group))
      : [],
  };
}
