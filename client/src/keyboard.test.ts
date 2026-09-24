import { describe, expect, it } from 'vitest';
import { isInteractKeyPress, isTypingTarget } from './keyboard.js';

describe('isTypingTarget', () => {
  it.each([
    [{ tagName: 'INPUT', type: 'text' }],
    [{ tagName: 'INPUT', type: 'url' }],
    [{ tagName: 'input', type: 'SEARCH' }],
    [{ tagName: 'INPUT' }], // no type attribute defaults to text
    [{ tagName: 'TEXTAREA' }],
    [{ tagName: 'SELECT' }],
    [{ tagName: 'DIV', isContentEditable: true }],
  ])('treats %o as typing', (target) => {
    expect(isTypingTarget(target as unknown as EventTarget)).toBe(true);
  });

  it.each([
    [null],
    [{ tagName: 'CANVAS' }],
    [{ tagName: 'BUTTON' }],
    [{ tagName: 'INPUT', type: 'range' }],
    [{ tagName: 'INPUT', type: 'color' }],
    [{ tagName: 'INPUT', type: 'checkbox' }],
    [{ tagName: 'INPUT', type: 'file' }],
    [{ tagName: 'DIV', isContentEditable: false }],
  ])('does not treat %o as typing', (target) => {
    expect(isTypingTarget(target as unknown as EventTarget)).toBe(false);
  });
});

describe('isInteractKeyPress', () => {
  const canvas = { tagName: 'CANVAS' } as unknown as EventTarget;
  const textField = { tagName: 'INPUT', type: 'text' } as unknown as EventTarget;

  it('fires for a fresh press of the bound key outside a text field', () => {
    expect(isInteractKeyPress({ code: 'KeyE', repeat: false, target: canvas }, 'KeyE')).toBe(true);
  });

  it('ignores other keys', () => {
    expect(isInteractKeyPress({ code: 'KeyF', repeat: false, target: canvas }, 'KeyE')).toBe(false);
  });

  it('ignores auto-repeat from holding the key down', () => {
    expect(isInteractKeyPress({ code: 'KeyE', repeat: true, target: canvas }, 'KeyE')).toBe(false);
  });

  it('ignores the key while typing into a text field', () => {
    expect(isInteractKeyPress({ code: 'KeyE', repeat: false, target: textField }, 'KeyE')).toBe(
      false,
    );
  });
});
