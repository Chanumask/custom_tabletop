const NAMED_KEYS: Record<string, string> = {
  Space: 'Space',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  Tab: 'Tab',
  Enter: 'Enter',
  Escape: 'Esc',
  Backspace: 'Backspace',
};

/**
 * Converts a `KeyboardEvent.code` value (the rebindable-keybind storage
 * format — layout-independent, unlike `.key`) into a short label for UI
 * display: `"KeyE"` -> `"E"`, `"Digit1"` -> `"1"`, `"Space"` -> `"Space"`.
 * Falls back to the raw code for anything not explicitly handled, so an
 * unusual rebind (e.g. `"F5"`) still displays as *something* rather than
 * a blank label.
 */
export function formatKeyCode(code: string): string {
  const letterMatch = /^Key([A-Z])$/.exec(code);
  if (letterMatch) {
    return letterMatch[1]!;
  }
  const digitMatch = /^Digit([0-9])$/.exec(code);
  if (digitMatch) {
    return digitMatch[1]!;
  }
  return NAMED_KEYS[code] ?? code;
}
