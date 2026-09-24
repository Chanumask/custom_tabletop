import { describe, expect, it } from 'vitest';
import { nearestInteractable } from './interaction.js';

describe('nearestInteractable', () => {
  it('returns null when nothing is in range', () => {
    const result = nearestInteractable({ x: 0, z: 0 }, [
      { id: 'light', position: { x: 10, z: 10 }, range: 1.5 },
    ]);
    expect(result).toBeNull();
  });

  it('returns the single interactable in range', () => {
    const light = { id: 'light', position: { x: 0, z: 0.5 }, range: 1.5 };
    const result = nearestInteractable({ x: 0, z: 0 }, [light]);
    expect(result).toBe(light);
  });

  it('picks the nearer of two overlapping in-range interactables', () => {
    const near = { id: 'near', position: { x: 0, z: 0.5 }, range: 2 };
    const far = { id: 'far', position: { x: 0, z: 1.5 }, range: 2 };
    const result = nearestInteractable({ x: 0, z: 0 }, [far, near]);
    expect(result?.id).toBe('near');
  });

  it('treats exactly-at-range as in range (inclusive boundary)', () => {
    const light = { id: 'light', position: { x: 0, z: 2 }, range: 2 };
    const result = nearestInteractable({ x: 0, z: 0 }, [light]);
    expect(result?.id).toBe('light');
  });

  it('returns null for an empty interactable list', () => {
    expect(nearestInteractable({ x: 0, z: 0 }, [])).toBeNull();
  });
});
