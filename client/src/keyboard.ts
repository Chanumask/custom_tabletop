// Input types a player actually types characters into. A focused slider,
// color swatch, checkbox, or file picker doesn't consume letter keys, so
// those don't count — pressing the interact key there should still work.
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'email', 'password', 'number', 'tel']);

/**
 * Whether a keyboard event's target is somewhere the player is typing
 * (a text field, textarea, or contenteditable element) — keys pressed there
 * belong to that field, not to room controls, so typing a URL containing an
 * "e" into the session menu must never sit the player down or flip the
 * light. Structurally typed rather than `instanceof HTMLElement` so it's
 * unit-testable under Vitest's `node` environment (no DOM).
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') {
    return false;
  }
  const element = target as { tagName?: unknown; isContentEditable?: unknown; type?: unknown };
  if (element.isContentEditable === true) {
    return true;
  }
  const tag = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
  if (tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  if (tag === 'INPUT') {
    const type = typeof element.type === 'string' ? element.type.toLowerCase() : 'text';
    return TEXT_INPUT_TYPES.has(type);
  }
  return false;
}

/** Whether `event` should trigger the room's interact action: the bound key,
 * pressed fresh (not an auto-repeat from holding it down — holding E must
 * not rapidly toggle sit/stand), and not while typing into a field. */
export function isInteractKeyPress(
  event: Pick<KeyboardEvent, 'code' | 'repeat' | 'target'>,
  interactKey: string,
): boolean {
  return event.code === interactKey && !event.repeat && !isTypingTarget(event.target);
}
