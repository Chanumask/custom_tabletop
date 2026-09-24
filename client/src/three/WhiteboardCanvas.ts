import * as THREE from 'three';
import { BOARD_COLOR } from '../whiteboardInk.js';

/** Rendered text lines: what to write, and in which color. */
export interface InkedLine {
  text: string;
  color: string;
}

// The board's writable area is 2.11 m x 1.11 m (blender/room.blend's
// `Whiteboard_Surface`); the canvas keeps that aspect.
const WIDTH = 2048;
const HEIGHT = Math.round((WIDTH * 1.11) / 2.11);
const MARGIN_X = 90;
const MARGIN_TOP = 70;
const BASE_FONT_PX = 124;
const MIN_FONT_PX = 64;
/** Marker-style handwriting where the system has one, plain sans otherwise. */
const FONT_FAMILY =
  '"Segoe Print", "Bradley Hand", "Chalkboard SE", "Marker Felt", "Comic Sans MS", cursive, sans-serif';

/**
 * The whiteboard's writing, painted onto a canvas texture for the board's
 * `Whiteboard_Surface` mesh: one row per line, in each line's ink color,
 * shrunk to fit if a line is long. A faint ruled guideline under each row
 * makes an empty board still read as "write here".
 */
export class WhiteboardCanvas {
  readonly texture: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private shown = '';

  constructor(lineCount: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    // The board mesh keeps its exported glTF UVs, whose `v` runs top-down —
    // like every texture GLTFLoader creates, this one must not be flipped.
    this.texture.flipY = false;
    this.draw(Array.from({ length: lineCount }, () => ({ text: '', color: '#000' })));
  }

  draw(lines: InkedLine[]): void {
    const key = JSON.stringify(lines);
    if (key === this.shown) {
      return;
    }
    this.shown = key;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.fillStyle = BOARD_COLOR;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // A whisper of old marker ghosting, so the board isn't sterile white.
    ctx.fillStyle = 'rgba(120, 130, 140, 0.04)';
    for (let i = 0; i < 7; i += 1) {
      ctx.beginPath();
      ctx.ellipse(260 + i * 270, 200 + (i % 3) * 260, 220, 60, -0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    const rowHeight = (HEIGHT - MARGIN_TOP * 2) / lines.length;
    const maxWidth = WIDTH - MARGIN_X * 2;
    ctx.textBaseline = 'alphabetic';
    lines.forEach((line, index) => {
      const baseline = MARGIN_TOP + rowHeight * (index + 1) - rowHeight * 0.22;
      ctx.strokeStyle = 'rgba(80, 110, 140, 0.12)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X, baseline + 14);
      ctx.lineTo(WIDTH - MARGIN_X, baseline + 14);
      ctx.stroke();

      if (!line.text) {
        return;
      }
      let size = Math.min(BASE_FONT_PX, rowHeight * 0.78);
      ctx.font = `600 ${size}px ${FONT_FAMILY}`;
      while (ctx.measureText(line.text).width > maxWidth && size > MIN_FONT_PX) {
        size -= 4;
        ctx.font = `600 ${size}px ${FONT_FAMILY}`;
      }
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, MARGIN_X, baseline, maxWidth);
    });
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
