import { describe, expect, it } from 'vitest';
import type { Drawing } from '@custom-tabletop/shared';
import { findStrokeNear } from './eraser.js';

function makeDrawing(id: string, points: { x: number; y: number }[], width = 5): Drawing {
  return { id, sceneId: 'scene-1', playerId: 'p1', points, color: '#241a12', width };
}

describe('findStrokeNear', () => {
  it('returns null when nothing is within the threshold', () => {
    const drawings = [
      makeDrawing('d1', [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ];
    expect(findStrokeNear({ x: 500, y: 500 }, drawings, 10)).toBeNull();
  });

  it('finds a stroke whose segment passes near the click point', () => {
    const drawings = [
      makeDrawing('d1', [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    ];
    expect(findStrokeNear({ x: 50, y: 3 }, drawings, 10)).toBe('d1');
  });

  it('finds a single-point (dot) stroke by proximity to that point', () => {
    const drawings = [makeDrawing('d1', [{ x: 20, y: 20 }])];
    expect(findStrokeNear({ x: 22, y: 21 }, drawings, 10)).toBe('d1');
  });

  it('picks the nearer of two overlapping-range strokes', () => {
    const near = makeDrawing('near', [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    const far = makeDrawing('far', [
      { x: 0, y: 20 },
      { x: 100, y: 20 },
    ]);
    expect(findStrokeNear({ x: 50, y: 5 }, [far, near], 30)).toBe('near');
  });

  it('a thicker stroke is easier to hit (distance is measured from its edge, not its centerline)', () => {
    const thick = makeDrawing(
      'thick',
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      40,
    );
    expect(findStrokeNear({ x: 50, y: 15 }, [thick], 2)).toBe('thick');
  });

  it('returns null for an empty drawings list', () => {
    expect(findStrokeNear({ x: 0, y: 0 }, [], 10)).toBeNull();
  });
});
