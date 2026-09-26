import { describe, expect, it } from 'vitest';
import { StepCounter, surfaceAt } from './footsteps.js';

/** Walks a counter along +x at `speed` m/s for `seconds`, 60 frames a second. */
function walk(counter: StepCounter, speed: number, seconds: number, startX = 0) {
  const steps: boolean[] = [];
  const dt = 1 / 60;
  let x = startX;
  counter.advance(x, 0, dt);
  for (let t = 0; t < seconds; t += dt) {
    x += speed * dt;
    const step = counter.advance(x, 0, dt);
    if (step) steps.push(step.running);
  }
  return steps;
}

describe('footsteps', () => {
  it('takes a step every stride while walking, and soon after setting off', () => {
    const counter = new StepCounter();
    const steps = walk(counter, 2.2, 2);
    // 4.4 m at 0.85 m a stride, the first one half a stride in.
    expect(steps.length).toBeGreaterThanOrEqual(5);
    expect(steps.length).toBeLessThanOrEqual(6);
    expect(steps.every((running) => !running)).toBe(true);
  });

  it('runs with longer, harder strides', () => {
    const steps = walk(new StepCounter(), 4.2, 2);
    expect(steps.length).toBeGreaterThanOrEqual(6);
    expect(steps.every((running) => running)).toBe(true);
  });

  it('is silent standing still, and a jump across the room is not a step', () => {
    const counter = new StepCounter();
    counter.advance(0, 0, 0.016);
    expect(counter.advance(0, 0, 0.016)).toBeNull();
    expect(counter.advance(4, 0, 0.016)).toBeNull();
  });

  it('starts fresh after a reset (getting up from a chair is not a step)', () => {
    const counter = new StepCounter();
    counter.advance(0, 0, 0.016);
    counter.reset();
    expect(counter.advance(0.5, 0, 0.016)).toBeNull();
  });

  it('knows a rug from the bare boards', () => {
    const rugs = [{ minX: -1, maxX: 1, minZ: -1, maxZ: 1 }];
    expect(surfaceAt(0, 0.5, rugs)).toBe('rug');
    expect(surfaceAt(2, 0, rugs)).toBe('wood');
    expect(surfaceAt(0, 0, [])).toBe('wood');
  });
});
