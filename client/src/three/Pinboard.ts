import * as THREE from 'three';
import type { Photo } from '@custom-tabletop/shared';
import { PinboardCanvas } from './PinboardCanvas.js';
import { PINBOARD_COLS, PINBOARD_ROWS } from './pinboardLayout.js';

/** North wall, between "The Realm" painting and the whiteboard — the one
 * clear gap on that wall, checked against the live room (walked up to it
 * and confirmed empty; see docs/decisions.md, gadgets phase 2). */
export const PINBOARD_POSITION = { x: -1.08, z: -3.86 };
const PINBOARD_HEIGHT_CENTER = 1.75;
const PANEL_WIDTH = 0.9;
const PANEL_HEIGHT = (PANEL_WIDTH / PINBOARD_COLS) * PINBOARD_ROWS;
const FRAME_THICKNESS = 0.05;
const FRAME_DEPTH = 0.04;
const CORK_DEPTH = 0.015;

export interface Pinboard {
  group: THREE.Group;
  canvas: PinboardCanvas;
}

/**
 * The wall pinboard prop (gadgets phase 2) — a plain wooden-framed cork
 * panel, built the same procedural-geometry way as `RoomLamp`/
 * `SoundboardWall` rather than an imported model. Purely reactive: unlike
 * the wall soundboard, nobody aims at or presses this — it only ever
 * reflects `GameState.photos` (`sync`/`PinboardCanvas.draw`).
 */
export function createPinboard(scene: THREE.Scene): Pinboard {
  const group = new THREE.Group();
  group.name = 'pinboard';

  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.75 });
  const frameOuterW = PANEL_WIDTH + FRAME_THICKNESS * 2;
  const sides: [number, number, number, number][] = [
    // x, y, width, height (local, centered on the panel)
    [0, (PANEL_HEIGHT + FRAME_THICKNESS) / 2, frameOuterW, FRAME_THICKNESS], // top
    [0, -(PANEL_HEIGHT + FRAME_THICKNESS) / 2, frameOuterW, FRAME_THICKNESS], // bottom
    [-(PANEL_WIDTH + FRAME_THICKNESS) / 2, 0, FRAME_THICKNESS, PANEL_HEIGHT], // left
    [(PANEL_WIDTH + FRAME_THICKNESS) / 2, 0, FRAME_THICKNESS, PANEL_HEIGHT], // right
  ];
  for (const [x, y, width, height] of sides) {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(width, height, FRAME_DEPTH), woodMaterial);
    piece.position.set(x, y, 0);
    group.add(piece);
  }

  const canvas = new PinboardCanvas();
  const cork = new THREE.Mesh(
    new THREE.BoxGeometry(PANEL_WIDTH, PANEL_HEIGHT, CORK_DEPTH),
    new THREE.MeshStandardMaterial({ map: canvas.texture, roughness: 0.85 }),
  );
  cork.position.z = -(FRAME_DEPTH - CORK_DEPTH) / 2;
  group.add(cork);

  // Mounted flush against the north wall, facing into the room (+Z).
  group.position.set(PINBOARD_POSITION.x, PINBOARD_HEIGHT_CENTER, PINBOARD_POSITION.z);

  scene.add(group);
  return { group, canvas };
}

export function syncPinboard(pinboard: Pinboard, photos: Photo[]): void {
  pinboard.canvas.draw(photos);
}

export function disposePinboard(pinboard: Pinboard): void {
  pinboard.group.parent?.remove(pinboard.group);
  pinboard.canvas.dispose();
  for (const child of pinboard.group.children) {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) {
        material.forEach((m) => m.dispose());
      } else {
        material.dispose();
      }
    }
  }
}
