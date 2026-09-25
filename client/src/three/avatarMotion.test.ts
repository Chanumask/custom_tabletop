import { describe, expect, it } from 'vitest';
import {
  pickChair,
  lerpAngle,
  locomotionFor,
  playbackRate,
  shortestAngle,
  smoothingFactor,
} from './avatarMotion.js';

describe('smoothingFactor', () => {
  it('closes half the gap per half-life, independent of frame rate', () => {
    expect(smoothingFactor(0.1, 0.1)).toBeCloseTo(0.5);
    // two 50ms frames == one 100ms frame
    const twoSteps = 1 - (1 - smoothingFactor(0.05, 0.1)) ** 2;
    expect(twoSteps).toBeCloseTo(smoothingFactor(0.1, 0.1));
  });

  it('snaps when there is no smoothing', () => {
    expect(smoothingFactor(0.016, 0)).toBe(1);
  });
});

describe('angles', () => {
  it('turns the short way round across the ±π seam', () => {
    expect(shortestAngle(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    expect(lerpAngle(3.1, -3.1, 0.5)).toBeCloseTo(Math.PI, 1);
  });

  it('is zero for equal angles a full turn apart', () => {
    expect(shortestAngle(1, 1 + Math.PI * 2)).toBeCloseTo(0);
  });
});

describe('locomotion', () => {
  it('idles, walks, and runs by speed', () => {
    expect(locomotionFor(0)).toBe('Idle');
    expect(locomotionFor(2.2)).toBe('Walk');
    expect(locomotionFor(4.2)).toBe('Run');
  });

  it('keeps playback within a natural-looking range', () => {
    expect(playbackRate('Walk', 100)).toBe(1.5);
    expect(playbackRate('Walk', 0.3)).toBe(0.6);
    expect(playbackRate('Idle', 3)).toBe(1);
  });
});

describe('pickChair', () => {
  const seats = [
    { x: 0, z: 1.5, yaw: Math.PI },
    { x: 0, z: -1.5, yaw: 0 },
    { x: 1.5, z: 0, yaw: -Math.PI / 2 },
  ];

  it('picks the nearest chair', () => {
    expect(pickChair(seats, new Set(), { x: 0.2, z: -2 })).toBe(1);
  });

  it('skips chairs someone is already on', () => {
    expect(pickChair(seats, new Set([1]), { x: 0.2, z: -2 })).toBe(2);
  });

  it('gives null when every chair is taken', () => {
    expect(pickChair(seats, new Set([0, 1, 2]), { x: 0, z: 0 })).toBeNull();
  });
});
