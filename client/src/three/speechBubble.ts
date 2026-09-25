import * as THREE from 'three';

const WIDTH = 640;
const LINE_HEIGHT = 50;
const PADDING = 26;
const TAIL = 22;
/** World-space width (metres) — a little wider than the name tag. */
const WORLD_WIDTH = 0.95;
const MAX_LINES = 3;
const MAX_LINE_CHARS = 26;

/**
 * Word-wraps chat text to at most `maxLines` lines of roughly `maxChars`,
 * ending in "…" if it doesn't fit. Long words are hard-split. Pure, so the
 * bubble's layout is tested without a canvas.
 */
export function wrapSpeech(
  text: string,
  maxChars = MAX_LINE_CHARS,
  maxLines = MAX_LINES,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let word of words) {
    while (word.length > maxChars) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (!line) {
      line = word;
    } else if (line.length + 1 + word.length <= maxChars) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) {
    lines.push(line);
  }
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1]!;
    kept[maxLines - 1] = `${last.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
    return kept;
  }
  return lines;
}

/** How long a bubble stays up: long enough to read, never forever. */
export function speechSeconds(text: string): number {
  return Math.min(10, Math.max(5, 3 + text.length * 0.07));
}

/**
 * A chat line floating above a player's character for a few seconds — a
 * light, rounded bubble with a tail pointing down at their name tag, edged
 * in their color. A camera-facing sprite like the name tag.
 */
export class SpeechBubble {
  readonly sprite: THREE.Sprite;
  // No DOM under the unit tests' node environment (same as NameTag).
  private readonly canvas =
    typeof document === 'undefined' ? null : document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture | null;
  readonly height: number;

  constructor(text: string, colorHex: string) {
    const lines = wrapSpeech(text);
    const canvasHeight = PADDING * 2 + lines.length * LINE_HEIGHT + TAIL;
    this.height = (WORLD_WIDTH * canvasHeight) / WIDTH;
    if (this.canvas) {
      this.canvas.width = WIDTH;
      this.canvas.height = canvasHeight;
      draw(this.canvas, lines, colorHex);
    }
    this.texture = this.canvas ? new THREE.CanvasTexture(this.canvas) : null;
    if (this.texture) {
      this.texture.colorSpace = THREE.SRGBColorSpace;
    }
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false }),
    );
    this.sprite.scale.set(WORLD_WIDTH, this.height, 1);
    // Anchored at its tail tip, so it grows upward from the name tag.
    this.sprite.center.set(0.5, 0);
    this.sprite.renderOrder = 11;
  }

  set opacity(value: number) {
    this.sprite.material.opacity = value;
  }

  dispose(): void {
    this.texture?.dispose();
    this.sprite.material.dispose();
  }
}

function draw(canvas: HTMLCanvasElement, lines: string[], colorHex: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  ctx.font = '600 38px system-ui, "Segoe UI", sans-serif';
  const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const boxWidth = Math.min(WIDTH - 8, textWidth + PADDING * 2.4);
  const boxHeight = canvas.height - TAIL - 4;
  const x0 = (WIDTH - boxWidth) / 2;
  const y0 = 2;

  // One outline — box and tail (pointing down at the speaker) together,
  // so the stroke doesn't cut across the tail's base.
  const r = 30;
  const x1 = x0 + boxWidth;
  const y1 = y0 + boxHeight;
  const cx = WIDTH / 2;
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x1, y0, x1, y1, r);
  ctx.arcTo(x1, y1, cx, y1, r);
  ctx.lineTo(cx + 18, y1);
  ctx.lineTo(cx, y1 + TAIL);
  ctx.lineTo(cx - 18, y1);
  ctx.arcTo(x0, y1, x0, y0, r);
  ctx.arcTo(x0, y0, x1, y0, r);
  ctx.closePath();
  ctx.fillStyle = 'rgba(252, 247, 238, 0.96)';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = colorHex;
  ctx.stroke();

  ctx.fillStyle = '#22170f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, index) => {
    ctx.fillText(line, WIDTH / 2, y0 + PADDING + LINE_HEIGHT * (index + 0.5));
  });
}
