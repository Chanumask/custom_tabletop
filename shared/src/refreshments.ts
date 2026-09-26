/**
 * Tea and cocoa from the tea set by the sofa, and the snack bowl on the
 * table (docs/decisions.md, "The cozy room"). A drink is held in the hand
 * like a gadget — the same single slot: pouring one puts a held gadget
 * back in the chest, and taking a gadget sets the drink down.
 */

export const DRINKS = ['tea', 'cocoa'] as const;
export type Drink = (typeof DRINKS)[number];

export function isDrink(value: unknown): value is Drink {
  return DRINKS.some((drink) => drink === value);
}

/** Little things a player does that everyone else sees (and hears): a sip
 * of their drink, raising it to the others, a handful from the snack bowl.
 * Relayed, never stored — like an emote. */
export const GESTURES = ['sip', 'cheers', 'snack'] as const;
export type Gesture = (typeof GESTURES)[number];

export function isGesture(value: unknown): value is Gesture {
  return GESTURES.some((gesture) => gesture === value);
}

/** A sip or a toast needs a drink in hand. */
export function gestureNeedsDrink(gesture: Gesture): boolean {
  return gesture !== 'snack';
}

export interface PlayerGestureRequest {
  sessionId: string;
  playerId: string;
  gesture: Gesture;
}
