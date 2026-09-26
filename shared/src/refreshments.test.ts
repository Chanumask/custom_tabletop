import { describe, expect, it } from 'vitest';
import { gestureNeedsDrink, isDrink, isGesture } from './refreshments.js';

describe('refreshments', () => {
  it('knows its drinks and gestures', () => {
    expect(isDrink('tea')).toBe(true);
    expect(isDrink('cocoa')).toBe(true);
    expect(isDrink('coffee')).toBe(false);
    expect(isGesture('cheers')).toBe(true);
    expect(isGesture('wave')).toBe(false);
  });

  it('needs a drink in hand for a sip or a toast, not for a snack', () => {
    expect(gestureNeedsDrink('sip')).toBe(true);
    expect(gestureNeedsDrink('cheers')).toBe(true);
    expect(gestureNeedsDrink('snack')).toBe(false);
  });
});
