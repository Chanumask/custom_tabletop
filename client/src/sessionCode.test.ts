import { describe, expect, it } from 'vitest';
import { generateSessionCode } from './sessionCode.js';

describe('generateSessionCode', () => {
  it('generates a 5-character code from the readable alphabet', () => {
    expect(generateSessionCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
  });

  it('is not deterministic', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateSessionCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
