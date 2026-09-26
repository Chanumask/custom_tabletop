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

/** The weather outside — the host's choice, like the theme. A storm is
 * heavy rain with thunder and lightning. */
export const WEATHERS = ['clear', 'rain', 'storm', 'snow'] as const;
export type Weather = (typeof WEATHERS)[number];

/** The room's five windows: the big one in the north wall, and two each in
 * the east and west walls (north one first). */
export const WINDOWS = ['north', 'east-1', 'east-2', 'west-1', 'west-2'] as const;
export type WindowId = (typeof WINDOWS)[number];

export function isWindowId(value: unknown): value is WindowId {
  return WINDOWS.some((id) => id === value);
}

/** The room's comfy seats away from the table — three on the sofa, the
 * armchair by the reading lamp, the rocking chair — each for one player at
 * a time (`Player.lounge`). */
export const LOUNGE_SEATS = [
  'sofa-west',
  'sofa-middle',
  'sofa-east',
  'armchair',
  'rocking-chair',
] as const;
export type LoungeSeat = (typeof LOUNGE_SEATS)[number];

export function isLoungeSeat(value: unknown): value is LoungeSeat {
  return LOUNGE_SEATS.some((seat) => seat === value);
}

/** A window: open or shut, and its curtains drawn or not. */
export interface WindowState {
  open: boolean;
  drawn: boolean;
}

/** The record player's own records — the music itself is made in each
 * player's browser, the same for everyone (client/src/music). */
export const RECORDS = [
  { id: 'tavern', name: 'Tavern Night', hint: 'a fiddle, a lute and a drum by the fire' },
  { id: 'lofi', name: 'Lo-fi Evening', hint: 'soft keys and a lazy beat' },
  { id: 'rain-jazz', name: 'Rain Jazz', hint: 'brushes, a walking bass, late-night piano' },
] as const;
export type RecordId = (typeof RECORDS)[number]['id'];

export function isRecordId(value: unknown): value is RecordId {
  return RECORDS.some((record) => record.id === value);
}

/** A soundboard sound put on the record player instead (an audio file). */
export const SOUND_RECORD_PREFIX = 'sound:';

/** The record on the turntable: one of `RECORDS`, or `sound:<id>` — and
 * when it was put on (server clock, ms), which everyone plays it from. */
export interface RecordPlaying {
  record: string;
  startedAt: number;
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
  /** The weather outside (host-set). */
  weather: Weather;
  /** Every window, open or shut, curtains drawn or not. */
  windows: Record<WindowId, WindowState>;
  /** What's playing on the record player, or null. */
  record: RecordPlaying | null;
}

const closedWindows = (): Record<WindowId, WindowState> =>
  Object.fromEntries(WINDOWS.map((id) => [id, { open: false, drawn: false }])) as Record<
    WindowId,
    WindowState
  >;

export const DEFAULT_ROOM_STATE: RoomState = {
  readingLampOn: true,
  fireStokedAt: null,
  candlesOut: [],
  weather: 'clear',
  windows: closedWindows(),
  record: null,
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
    weather: WEATHERS.find((weather) => weather === saved?.weather) ?? 'clear',
    windows: Object.fromEntries(
      WINDOWS.map((id) => {
        const window = saved?.windows?.[id];
        return [id, { open: window?.open === true, drawn: window?.drawn === true }];
      }),
    ) as Record<WindowId, WindowState>,
    record:
      typeof saved?.record?.record === 'string' && typeof saved.record.startedAt === 'number'
        ? { record: saved.record.record, startedAt: saved.record.startedAt }
        : null,
  };
}
