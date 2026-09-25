import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  INITIAL_CALCULATOR_STATE,
  pressBackspace,
  pressClear,
  pressDecimal,
  pressDigit,
  pressEquals,
  pressOperator,
  type CalcOperator,
  type CalculatorState,
} from './calculator.js';

type Key =
  | { label: string; kind: 'digit'; value: string }
  | { label: string; kind: 'operator'; value: CalcOperator }
  | { label: string; kind: 'decimal' }
  | { label: string; kind: 'equals' }
  | { label: string; kind: 'clear' }
  | { label: string; kind: 'backspace' };

/** Row-major, left to right — a real four-function pocket calculator's
 * layout (clear/backspace/÷/× on top, digits and +/- below, a tall = down
 * the bottom-right beside a wide 0 and the decimal point). */
const KEYS: Key[] = [
  { label: 'C', kind: 'clear' },
  { label: '⌫', kind: 'backspace' },
  { label: '÷', kind: 'operator', value: '÷' },
  { label: '×', kind: 'operator', value: '×' },
  { label: '7', kind: 'digit', value: '7' },
  { label: '8', kind: 'digit', value: '8' },
  { label: '9', kind: 'digit', value: '9' },
  { label: '-', kind: 'operator', value: '-' },
  { label: '4', kind: 'digit', value: '4' },
  { label: '5', kind: 'digit', value: '5' },
  { label: '6', kind: 'digit', value: '6' },
  { label: '+', kind: 'operator', value: '+' },
  { label: '1', kind: 'digit', value: '1' },
  { label: '2', kind: 'digit', value: '2' },
  { label: '3', kind: 'digit', value: '3' },
  { label: '=', kind: 'equals' },
  { label: '0', kind: 'digit', value: '0' },
  { label: '.', kind: 'decimal' },
];

function apply(state: CalculatorState, key: Key): CalculatorState {
  switch (key.kind) {
    case 'digit':
      return pressDigit(state, key.value);
    case 'operator':
      return pressOperator(state, key.value);
    case 'decimal':
      return pressDecimal(state);
    case 'equals':
      return pressEquals(state);
    case 'clear':
      return pressClear();
    case 'backspace':
      return pressBackspace(state);
  }
}

const KEYBOARD_MAP: Record<string, Key> = {
  '0': { label: '0', kind: 'digit', value: '0' },
  '1': { label: '1', kind: 'digit', value: '1' },
  '2': { label: '2', kind: 'digit', value: '2' },
  '3': { label: '3', kind: 'digit', value: '3' },
  '4': { label: '4', kind: 'digit', value: '4' },
  '5': { label: '5', kind: 'digit', value: '5' },
  '6': { label: '6', kind: 'digit', value: '6' },
  '7': { label: '7', kind: 'digit', value: '7' },
  '8': { label: '8', kind: 'digit', value: '8' },
  '9': { label: '9', kind: 'digit', value: '9' },
  '.': { label: '.', kind: 'decimal' },
  '+': { label: '+', kind: 'operator', value: '+' },
  '-': { label: '-', kind: 'operator', value: '-' },
  '*': { label: '×', kind: 'operator', value: '×' },
  '/': { label: '÷', kind: 'operator', value: '÷' },
  Enter: { label: '=', kind: 'equals' },
  '=': { label: '=', kind: 'equals' },
  Backspace: { label: '⌫', kind: 'backspace' },
};

/**
 * The calculator (gadgets phase 5) — opened by pressing R while holding it.
 * Purely client-local: unlike the other gadgets, using it changes nothing
 * about the shared table, so there's no server round trip at all, just the
 * pure state machine in calculator.ts.
 */
export function CalculatorDialog({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState(INITIAL_CALCULATOR_STATE);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        onClose();
        return;
      }
      const key = KEYBOARD_MAP[event.key];
      if (key) {
        event.preventDefault();
        setState((current) => apply(current, key));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-label="Calculator">
      <div className="calculator-dialog">
        <p className="modal-title">Calculator</p>
        <output className="calculator-display">{state.display}</output>
        <div className="calculator-grid">
          {KEYS.map((key, index) => (
            <button
              key={index}
              type="button"
              className={
                key.kind === 'operator'
                  ? 'calculator-operator'
                  : key.kind === 'equals'
                    ? 'calculator-equals'
                    : key.label === '0'
                      ? 'calculator-zero'
                      : undefined
              }
              onClick={() => setState((current) => apply(current, key))}
            >
              {key.label}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
