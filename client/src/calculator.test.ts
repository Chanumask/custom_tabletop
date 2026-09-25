import { describe, expect, it } from 'vitest';
import {
  INITIAL_CALCULATOR_STATE,
  pressBackspace,
  pressClear,
  pressDecimal,
  pressDigit,
  pressEquals,
  pressOperator,
  type CalculatorState,
} from './calculator.js';

function type(state: CalculatorState, ...keys: (string | '+' | '-' | '×' | '÷' | '.' | '=')[]) {
  for (const key of keys) {
    if (key === '=') {
      state = pressEquals(state);
    } else if (key === '.') {
      state = pressDecimal(state);
    } else if (key === '+' || key === '-' || key === '×' || key === '÷') {
      state = pressOperator(state, key);
    } else {
      state = pressDigit(state, key);
    }
  }
  return state;
}

describe('calculator', () => {
  it('starts at 0', () => {
    expect(INITIAL_CALCULATOR_STATE.display).toBe('0');
  });

  it('adds two numbers', () => {
    expect(type(INITIAL_CALCULATOR_STATE, '2', '+', '3', '=').display).toBe('5');
  });

  it('chains operations left to right, like a real pocket calculator', () => {
    // 2 + 3 * 4 = 20 here (not 14 — no operator precedence), the same as
    // pressing the keys on a physical four-function calculator.
    expect(type(INITIAL_CALCULATOR_STATE, '2', '+', '3', '×', '4', '=').display).toBe('20');
  });

  it('supports decimals', () => {
    expect(type(INITIAL_CALCULATOR_STATE, '1', '.', '5', '+', '2', '.', '5', '=').display).toBe(
      '4',
    );
  });

  it('ignores a second decimal point in the same number', () => {
    const state = type(INITIAL_CALCULATOR_STATE, '1', '.', '2', '.', '3');
    expect(state.display).toBe('1.23');
  });

  it('shows Error for division by zero, and clears it on the next digit', () => {
    const divided = type(INITIAL_CALCULATOR_STATE, '5', '÷', '0', '=');
    expect(divided.display).toBe('Error');
    expect(pressDigit(divided, '7').display).toBe('7');
  });

  it('replacing the operator before typing the next number just changes it', () => {
    // 2 + then changing to × before typing 3: should compute 2 × 3, not 2 + 3.
    const state = type(INITIAL_CALCULATOR_STATE, '2', '+', '×', '3', '=');
    expect(state.display).toBe('6');
  });

  it('backspace removes the last digit, floors at 0, and does nothing right after an operator', () => {
    expect(pressBackspace(type(INITIAL_CALCULATOR_STATE, '1', '2', '3')).display).toBe('12');
    expect(pressBackspace(type(INITIAL_CALCULATOR_STATE, '5')).display).toBe('0');
    const afterOperator = type(INITIAL_CALCULATOR_STATE, '5', '+');
    expect(pressBackspace(afterOperator)).toEqual(afterOperator);
  });

  it('clear resets to the initial state', () => {
    const state = type(INITIAL_CALCULATOR_STATE, '9', '+', '9', '=');
    expect(pressClear()).toEqual(INITIAL_CALCULATOR_STATE);
    expect(state.display).not.toBe('0');
  });

  it('equals with no pending operator is a no-op', () => {
    const state = type(INITIAL_CALCULATOR_STATE, '4', '2');
    expect(pressEquals(state)).toEqual(state);
  });
});
