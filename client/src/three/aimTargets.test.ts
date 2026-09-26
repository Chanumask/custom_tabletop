import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { pickAimTarget, rayHitsSphere, type AimTarget } from './aimTargets.js';
import { candleGroupOf, candlePrompt } from './candles.js';

const ray = { origin: { x: 0, y: 1.6, z: 0 }, direction: { x: 0, y: 0, z: -1 } };

function target(id: string, z: number, overrides: Partial<AimTarget> = {}): AimTarget {
  return {
    id,
    center: { x: 0, y: 1.6, z },
    radius: 0.3,
    reach: 3,
    prompt: () => id,
    act: () => {},
    ...overrides,
  };
}

describe('aiming at things', () => {
  it('finds where a ray first meets a sphere, or that it misses', () => {
    expect(rayHitsSphere(ray, { x: 0, y: 1.6, z: -2 }, 0.5)).toBeCloseTo(1.5);
    expect(rayHitsSphere(ray, { x: 2, y: 1.6, z: -2 }, 0.5)).toBeNull();
    expect(rayHitsSphere(ray, { x: 0, y: 1.6, z: 2 }, 0.5)).toBeNull(); // behind
    expect(rayHitsSphere(ray, { x: 0, y: 1.6, z: 0 }, 0.5)).toBe(0); // inside
  });

  it('picks the nearest thing on the crosshair, within reach and not disabled', () => {
    const near = target('near', -1.5);
    const far = target('far', -2.5);
    expect(pickAimTarget(ray, [far, near])?.id).toBe('near');
    expect(pickAimTarget(ray, [far, { ...near, disabled: () => true }])?.id).toBe('far');
    expect(pickAimTarget(ray, [target('too far', -5)])).toBeNull();
    expect(pickAimTarget(ray, [])).toBeNull();
  });
});

describe('the candles', () => {
  const named = (name: string, parent?: string) => {
    const flame = new THREE.Object3D();
    flame.name = name;
    if (parent) {
      const holder = new THREE.Object3D();
      holder.name = parent;
      holder.add(flame);
    }
    return flame;
  };

  it('know which group each flame belongs to', () => {
    expect(candleGroupOf(named('Flame_Candle_2', 'brass_candleholder_02'))).toBe('mantel-north');
    expect(candleGroupOf(named('Flame_Candle_7', 'brass_candleholder_03'))).toBe('mantel-south');
    expect(candleGroupOf(named('Flame_Candle_0', 'brass_candleholder_01'))).toBe('chest-candle');
    expect(candleGroupOf(named('Flame_OilLamp', 'vintage_oil_lamp'))).toBe('oil-lamp');
    expect(candleGroupOf(named('Flame_Sconce_1'))).toBe('sconce-east');
    expect(candleGroupOf(named('Flame_Mystery'))).toBeNull();
  });

  it('say what E will do', () => {
    expect(candlePrompt('mantel-north', true, 'E')).toBe('Press E to blow out the candles');
    expect(candlePrompt('oil-lamp', false, 'E')).toBe('Press E to light the oil lamp');
    expect(candlePrompt('sconce-west', true, 'F')).toBe('Press F to blow out the candle');
  });
});

describe('aim priority', () => {
  it('prefers a target that asks for it, when the crosshair is on both', () => {
    const ray = { origin: { x: 0, y: 1, z: 0 }, direction: { x: 0, y: 0, z: -1 } };
    const seat: AimTarget = {
      id: 'seat',
      center: { x: 0, y: 1, z: -1.4 },
      radius: 0.3,
      reach: 3,
      prompt: () => 'sit',
      act: () => {},
    };
    const cat: AimTarget = {
      ...seat,
      id: 'cat',
      center: { x: 0, y: 1, z: -1.5 },
      radius: 0.2,
      priority: 1,
    };
    expect(pickAimTarget(ray, [seat, cat])?.id).toBe('cat');
    // Aimed beside the cat, the seat's still there.
    const beside = { ...ray, origin: { x: 0.25, y: 1, z: 0 } };
    expect(pickAimTarget(beside, [seat, cat])?.id).toBe('seat');
  });
});
