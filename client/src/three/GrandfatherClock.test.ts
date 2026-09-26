import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GrandfatherClock, handAngles, strikesAt } from './GrandfatherClock.js';

const at = (h: number, m: number, s = 0) => new Date(2026, 8, 26, h, m, s);

describe('the grandfather clock', () => {
  it('points its hands at the time', () => {
    expect(handAngles(at(12, 0)).hour).toBeCloseTo(0);
    expect(handAngles(at(3, 0)).hour).toBeCloseTo(Math.PI / 2);
    expect(handAngles(at(15, 30)).minute).toBeCloseTo(Math.PI);
    // The hour hand creeps on through the hour.
    expect(handAngles(at(3, 30)).hour).toBeCloseTo(Math.PI / 2 + Math.PI / 12);
  });

  it('chimes the hour on the hour, once on the half hour, otherwise not', () => {
    expect(strikesAt(at(15, 0))).toBe(3);
    expect(strikesAt(at(0, 0))).toBe(12);
    expect(strikesAt(at(12, 0))).toBe(12);
    expect(strikesAt(at(9, 30))).toBe(1);
    expect(strikesAt(at(9, 15))).toBe(0);
  });

  it('ticks every second and chimes once when the hour comes round', () => {
    const root = new THREE.Group();
    for (const name of ['HourHand', 'MinuteHand']) {
      const hand = new THREE.Object3D();
      hand.name = `vintage_grandfather_clock_01_${name}`;
      root.add(hand);
    }
    const ticks: boolean[] = [];
    const chimes: number[] = [];
    const clock = GrandfatherClock.fromRoom(root, {
      tick: (tock) => ticks.push(tock),
      chime: (strikes) => chimes.push(strikes),
    })!;
    clock.update(at(3, 59, 58));
    clock.update(at(3, 59, 59));
    clock.update(at(4, 0, 0));
    clock.update(at(4, 0, 0));
    clock.update(at(4, 0, 1));
    expect(ticks).toEqual([true, false, true]);
    expect(chimes).toEqual([4]);
  });

  it('turns the minute hand clockwise as seen from the room', () => {
    const root = new THREE.Group();
    const minute = new THREE.Object3D();
    minute.name = 'vintage_grandfather_clock_01_MinuteHand';
    const hour = new THREE.Object3D();
    hour.name = 'vintage_grandfather_clock_01_HourHand';
    root.add(minute, hour);
    const clock = GrandfatherClock.fromRoom(root, { tick: () => {}, chime: () => {} })!;
    clock.update(at(1, 15));
    // Quarter past: the hand (pointing +y at 12) points to the viewer's
    // right — -z, for someone in the room looking at the face (along -x).
    const tip = new THREE.Vector3(0, 1, 0).applyQuaternion(minute.quaternion);
    expect(tip.z).toBeCloseTo(-1);
    expect(tip.y).toBeCloseTo(0);
  });
});
