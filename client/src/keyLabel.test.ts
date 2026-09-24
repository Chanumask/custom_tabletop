import { describe, expect, it } from 'vitest';
import { formatKeyCode } from './keyLabel.js';

describe('formatKeyCode', () => {
  it('formats a letter key to just the letter', () => {
    expect(formatKeyCode('KeyE')).toBe('E');
    expect(formatKeyCode('KeyA')).toBe('A');
  });

  it('formats a digit key to just the digit', () => {
    expect(formatKeyCode('Digit1')).toBe('1');
    expect(formatKeyCode('Digit0')).toBe('0');
  });

  it('formats known named keys', () => {
    expect(formatKeyCode('Space')).toBe('Space');
    expect(formatKeyCode('ArrowUp')).toBe('↑');
    expect(formatKeyCode('ShiftLeft')).toBe('Shift');
  });

  it('falls back to the raw code for anything unrecognized', () => {
    expect(formatKeyCode('F5')).toBe('F5');
  });
});
