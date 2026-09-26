/**
 * The room's own shared, changeable things (docs/decisions.md, "The cozy
 * room"): what anyone can switch, light or open — the same for everyone,
 * like the room light already was. One small object in GameState, patched
 * as a whole (it stays a few hundred bytes).
 */

export interface RoomState {
  /** The reading lamp by the armchair — its own switch, apart from the
   * room's main light (`GameState.lightOn`, the switch by the door). */
  readingLampOn: boolean;
}

export const DEFAULT_ROOM_STATE: RoomState = {
  readingLampOn: true,
};

/** A saved or partial room state, filled in with today's defaults. */
export function normalizeRoomState(saved: Partial<RoomState> | undefined): RoomState {
  return {
    readingLampOn:
      typeof saved?.readingLampOn === 'boolean'
        ? saved.readingLampOn
        : DEFAULT_ROOM_STATE.readingLampOn,
  };
}
