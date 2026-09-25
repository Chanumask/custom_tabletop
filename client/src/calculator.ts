/**
 * A plain four-function calculator's state machine (gadgets phase 5) —
 * pure and DOM-free, the same extraction pattern `mapFit.ts`/
 * `pinboardLayout.ts` use for logic a component shouldn't have to re-derive.
 * Immediate evaluation (press `2`, `+`, `3`, `=` → `5`), like a real pocket
 * calculator, not a full expression parser with operator precedence.
 */

export type CalcOperator = '+' | '-' | '×' | '÷';

export interface CalculatorState {
  /** What the screen shows. */
  display: string;
  /** The value from before the operator currently pending, if any. */
  previous: number | null;
  operator: CalcOperator | null;
  /** The next digit press starts a fresh number instead of appending —
   * true right after `=`, an operator, or on a fresh/cleared calculator. */
  overwrite: boolean;
}

export const INITIAL_CALCULATOR_STATE: CalculatorState = {
  display: '0',
  previous: null,
  operator: null,
  overwrite: true,
};

/** Longest the display ever gets, digits and sign/point included — a real
 * pocket calculator's screen is finite too. */
const MAX_DISPLAY_LENGTH = 12;

function applyOperator(a: number, b: number, operator: CalcOperator): number {
  switch (operator) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '×':
      return a * b;
    case '÷':
      return b === 0 ? NaN : a / b;
  }
}

/** Trims float noise (0.1 + 0.2) and very long results down to what the
 * display can actually hold: fewer decimals first (1 ÷ 7 × 100000 is
 * 14285.7142857, not 1.42857e+4), and only a number whose whole part
 * doesn't fit goes to an exponent. */
export function formatResult(value: number): string {
  if (!Number.isFinite(value)) {
    return 'Error';
  }
  const rounded = Math.round(value * 1e9) / 1e9;
  const plain = String(rounded);
  if (plain.length <= MAX_DISPLAY_LENGTH && !plain.includes('e')) {
    return plain;
  }
  const whole = String(Math.trunc(Math.abs(rounded))).length + (rounded < 0 ? 1 : 0);
  if (!plain.includes('e') && whole <= MAX_DISPLAY_LENGTH) {
    const decimals = Math.max(0, MAX_DISPLAY_LENGTH - whole - 1);
    const fitted = String(Number(rounded.toFixed(decimals)));
    if (fitted.length <= MAX_DISPLAY_LENGTH) {
      return fitted;
    }
  }
  for (let digits = MAX_DISPLAY_LENGTH; digits > 0; digits -= 1) {
    const text = rounded.toExponential(digits).replace(/\.?0+e/, 'e');
    if (text.length <= MAX_DISPLAY_LENGTH) {
      return text;
    }
  }
  return rounded.toExponential(0);
}

export function pressDigit(state: CalculatorState, digit: string): CalculatorState {
  const base = state.display === 'Error' ? INITIAL_CALCULATOR_STATE : state;
  if (base.overwrite) {
    return { ...base, display: digit, overwrite: false };
  }
  if (base.display === '0') {
    return { ...base, display: digit };
  }
  if (base.display.replace('-', '').length >= MAX_DISPLAY_LENGTH) {
    return base;
  }
  return { ...base, display: base.display + digit };
}

export function pressDecimal(state: CalculatorState): CalculatorState {
  if (state.display === 'Error' || state.overwrite) {
    return { ...state, display: '0.', overwrite: false };
  }
  if (state.display.includes('.')) {
    return state;
  }
  return { ...state, display: state.display + '.' };
}

export function pressOperator(state: CalculatorState, operator: CalcOperator): CalculatorState {
  const current = Number(state.display);
  if (state.previous !== null && state.operator !== null && !state.overwrite) {
    const result = applyOperator(state.previous, current, state.operator);
    return {
      display: formatResult(result),
      previous: Number.isFinite(result) ? result : null,
      operator: Number.isFinite(result) ? operator : null,
      overwrite: true,
    };
  }
  return { ...state, previous: current, operator, overwrite: true };
}

export function pressEquals(state: CalculatorState): CalculatorState {
  if (state.operator === null || state.previous === null) {
    return state;
  }
  const current = Number(state.display);
  const result = applyOperator(state.previous, current, state.operator);
  return { display: formatResult(result), previous: null, operator: null, overwrite: true };
}

export function pressClear(): CalculatorState {
  return INITIAL_CALCULATOR_STATE;
}

export function pressBackspace(state: CalculatorState): CalculatorState {
  if (state.display === 'Error' || state.overwrite) {
    return state;
  }
  const trimmed = state.display.slice(0, -1);
  return { ...state, display: trimmed === '' || trimmed === '-' ? '0' : trimmed };
}
