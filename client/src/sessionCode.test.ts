import { describe, expect, it } from 'vitest';
import { generateSessionCode, normalizeSessionCodeInput } from './sessionCode.js';

describe('generateSessionCode', () => {
  it('generates a 5-character code from the readable alphabet', () => {
    expect(generateSessionCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
  });

  it('is not deterministic', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateSessionCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('normalizeSessionCodeInput', () => {
  it('upper-cases and drops spaces and punctuation', () => {
    expect(normalizeSessionCodeInput(' ab c4d ')).toBe('ABC4D');
    expect(normalizeSessionCodeInput('dnd-night!')).toBe('DND-NIGHT');
  });

  it('pulls the code out of a pasted invite link', () => {
    expect(normalizeSessionCodeInput('http://localhost:5173/?join=K7QPX')).toBe('K7QPX');
    expect(normalizeSessionCodeInput('https://table.example/?x=1&join=ab2cd#top')).toBe('AB2CD');
  });

  it('caps the length', () => {
    expect(normalizeSessionCodeInput('A'.repeat(40))).toHaveLength(12);
  });
});
