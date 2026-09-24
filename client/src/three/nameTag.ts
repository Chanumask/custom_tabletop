import * as THREE from 'three';

export interface NameTagInfo {
  name: string;
  colorHex: string;
  muted: boolean;
  away: boolean;
}

const WIDTH = 512;
const HEIGHT = 128;
/** World-space width of the tag (metres) — readable across the room. */
const WORLD_WIDTH = 0.72;

/** The label text: the name plus any status worth seeing at a glance. */
export function nameTagLabel(info: NameTagInfo): string {
  const status = info.away ? ' · reconnecting…' : info.muted ? ' · muted' : '';
  return `${info.name}${status}`;
}

/**
 * A floating name tag above another player's character — their name in a
 * dark pill with a dot in their color (so it reads on any background), and
 * their status (muted / reconnecting). A camera-facing sprite on a canvas
 * texture, redrawn only when the shown information changes.
 */
export class NameTag {
  readonly sprite: THREE.Sprite;
  // No DOM under the unit tests' node environment — the tag then just has
  // nothing drawn on it, and everything else still works.
  private readonly canvas =
    typeof document === 'undefined' ? null : document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture | null;
  private shown = '';

  constructor() {
    if (this.canvas) {
      this.canvas.width = WIDTH;
      this.canvas.height = HEIGHT;
    }
    this.texture = this.canvas ? new THREE.CanvasTexture(this.canvas) : null;
    if (this.texture) {
      this.texture.colorSpace = THREE.SRGBColorSpace;
    }
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false }),
    );
    this.sprite.scale.set(WORLD_WIDTH, (WORLD_WIDTH * HEIGHT) / WIDTH, 1);
    this.sprite.renderOrder = 10;
  }

  /** What the tag currently shows (label + color) — for tests. */
  get shownKey(): string {
    return this.shown;
  }

  update(info: NameTagInfo): void {
    const key = `${nameTagLabel(info)}|${info.colorHex}`;
    if (key === this.shown) {
      return;
    }
    this.shown = key;
    const ctx = this.canvas?.getContext('2d');
    if (!ctx || !this.texture) {
      return;
    }
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const label = nameTagLabel(info);
    ctx.font = '600 44px system-ui, sans-serif';
    const textWidth = Math.min(ctx.measureText(label).width, WIDTH - 110);
    const pillWidth = textWidth + 96;
    const x0 = (WIDTH - pillWidth) / 2;
    const y0 = 22;
    const pillHeight = 84;

    ctx.globalAlpha = info.away ? 0.55 : 1;
    ctx.fillStyle = 'rgba(20, 14, 10, 0.78)';
    ctx.beginPath();
    ctx.roundRect(x0, y0, pillWidth, pillHeight, pillHeight / 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = info.colorHex;
    ctx.stroke();

    ctx.fillStyle = info.colorHex;
    ctx.beginPath();
    ctx.arc(x0 + 40, y0 + pillHeight / 2, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f7ecdc';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x0 + 66, y0 + pillHeight / 2 + 2, textWidth);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture?.dispose();
    this.sprite.material.dispose();
  }
}
