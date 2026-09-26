import * as THREE from 'three';
import { BOOK_COVERS, type Book } from '@custom-tabletop/shared';
import type { Obstacle } from './collision.js';
import { mergeStatic } from './mergeStatic.js';
import { woodBox } from './woodBox.js';

/** Against the west wall between the bookshelf and the grandfather clock,
 * facing into the room (+X). */
const SPOT = { x: -4.66, z: -3.0 };
const DESK_HEIGHT = 1.02;
const DESK_TILT = 0.42;
/** How many of the host's books fit on the shelf under the desk. */
const SHELF_BOOKS = 10;

/**
 * The lectern (docs/decisions.md, "The cozy room, lived in"): a reading stand by the
 * bookshelf with a book lying open on it, and the host's books (books.ts)
 * standing on the shelf underneath, one spine for each, in its cover's
 * color. Everyone reads them here; the host writes them here.
 */
export class Lectern {
  readonly group = new THREE.Group();
  /** Where to aim to read, and how big. */
  readonly aim = { center: new THREE.Vector3(SPOT.x + 0.08, DESK_HEIGHT, SPOT.z), radius: 0.3 };
  readonly obstacle: Obstacle = {
    minX: SPOT.x - 0.28,
    maxX: SPOT.x + 0.28,
    minZ: SPOT.z - 0.3,
    maxZ: SPOT.z + 0.3,
  };
  private readonly spines: THREE.Mesh[] = [];
  private readonly coverMaterials: THREE.MeshStandardMaterial[];
  private readonly disposables: { dispose(): void }[] = [];

  constructor(scene: THREE.Scene, wood: THREE.Material | null) {
    this.group.name = 'lectern';
    this.group.position.set(SPOT.x, 0, SPOT.z);
    // Built facing +Z; turned to face the room (+X).
    this.group.rotation.y = Math.PI / 2;
    scene.add(this.group);
    const oak =
      wood ?? this.keep(new THREE.MeshStandardMaterial({ color: 0x4a2c1a, roughness: 0.6 }));
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(this.keep(woodBox(w, h, d)), oak);
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      return mesh;
    };
    // A heavy foot, two uprights, a shelf between them, the desk on top.
    box(0.5, 0.05, 0.42, 0, 0.025, 0);
    for (const side of [-1, 1]) box(0.05, 0.86, 0.05, side * 0.2, 0.48, -0.04);
    box(0.46, 0.025, 0.3, 0, 0.3, -0.02);
    box(0.44, 0.02, 0.26, 0, 0.62, -0.03); // the shelf's top board
    const desk = new THREE.Group();
    desk.position.set(0, DESK_HEIGHT - 0.06, 0);
    desk.rotation.x = DESK_TILT;
    this.group.add(desk);
    const top = new THREE.Mesh(this.keep(woodBox(0.54, 0.03, 0.4)), oak);
    desk.add(top);
    // A lip along the front, to stop the book sliding off.
    const lip = new THREE.Mesh(this.keep(woodBox(0.5, 0.035, 0.02)), oak);
    lip.position.set(0, 0.025, 0.2);
    desk.add(lip);

    // The open book: two pages bowed up from the spine, on its cover.
    const pages = this.keep(
      new THREE.MeshStandardMaterial({ map: this.keep(pageTexture()), roughness: 0.9 }),
    );
    const leather = this.keep(new THREE.MeshStandardMaterial({ color: 0x5b2a1c, roughness: 0.7 }));
    const cover = new THREE.Mesh(this.keep(new THREE.BoxGeometry(0.46, 0.008, 0.31)), leather);
    cover.position.y = 0.02;
    desk.add(cover);
    for (const side of [-1, 1]) {
      const page = new THREE.Mesh(this.keep(new THREE.BoxGeometry(0.215, 0.018, 0.29)), pages);
      page.position.set(side * 0.112, 0.033, 0);
      page.rotation.z = side * -0.06;
      // Each page shows its own half of the texture.
      const uv = page.geometry.attributes.uv!;
      for (let i = 0; i < uv.count; i++) {
        uv.setX(i, side < 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
      }
      desk.add(page);
    }
    // A red ribbon hanging from between the pages.
    const ribbon = new THREE.Mesh(
      this.keep(new THREE.BoxGeometry(0.012, 0.002, 0.075)),
      this.keep(new THREE.MeshStandardMaterial({ color: 0x9a1b1b, roughness: 0.6 })),
    );
    ribbon.position.set(0.01, 0.036, 0.17);
    ribbon.rotation.x = 0.35;
    desk.add(ribbon);

    // The host's books, spines out, on the shelf.
    this.coverMaterials = BOOK_COVERS.map((color) =>
      this.keep(new THREE.MeshStandardMaterial({ color, roughness: 0.65 })),
    );
    const gold = this.keep(
      new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.8, roughness: 0.35 }),
    );
    const spineShape = this.keep(new THREE.BoxGeometry(0.032, 0.23, 0.2));
    const bandShape = this.keep(new THREE.BoxGeometry(0.034, 0.012, 0.004));
    for (let i = 0; i < SHELF_BOOKS; i++) {
      const spine = new THREE.Mesh(spineShape, this.coverMaterials[0]!);
      spine.position.set(-0.19 + i * 0.038, 0.3125 + 0.115, -0.02);
      // Two gold bands across each spine.
      for (const y of [0.075, -0.075]) {
        const band = new THREE.Mesh(bandShape, gold);
        band.position.set(0, y, 0.101);
        spine.add(band);
      }
      spine.visible = false;
      this.group.add(spine);
      this.spines.push(spine);
    }
    for (const geometry of mergeStatic(this.group, (part) =>
      this.spines.includes(part as THREE.Mesh),
    )) {
      this.keep(geometry);
    }
  }

  /** Shows the host's books on the shelf, a spine in each one's color. */
  setBooks(books: readonly Book[]): void {
    this.spines.forEach((spine, i) => {
      const book = books[i];
      spine.visible = Boolean(book);
      if (book) {
        spine.material = this.coverMaterials[book.cover % this.coverMaterials.length]!;
        // Not quite in a row, like books put back by hand.
        spine.rotation.z = ((i * 37) % 7) * 0.012 - 0.036;
      }
    });
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.disposables.forEach((item) => item.dispose());
  }

  private keep<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }
}

/** Two pages of old print: faint lines of text, a large first letter. */
function pageTexture(): THREE.Texture {
  const width = 512;
  const height = 320;
  const data = new Uint8Array(width * height * 4);
  // Rows go bottom-up in a texture; this draws top-down.
  const put = (x: number, fromTop: number, r: number, g: number, b: number) =>
    data.set([r, g, b, 255], ((height - 1 - fromTop) * width + x) * 4);
  // Warm paper, a touch darker toward the edges and the spine.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const across = x < width / 2 ? x / (width / 2) : (width - x) / (width / 2);
      const edge = Math.min(across, 1 - Math.abs(y / height - 0.5) * 2);
      const shade = 232 - (1 - Math.min(1, edge * 6)) * 30;
      put(x, y, shade, shade * 0.93, shade * 0.8);
    }
  }
  // Lines of "text": short dark runs, words and gaps.
  let seed = 11;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [left, right] of [
    [30, 236],
    [276, 482],
  ] as const) {
    for (let line = 40; line < height - 30; line += 13) {
      let x = left + (line < 70 ? 34 : 0);
      // The right page's chapter ends a few lines early.
      const end = line > height - 60 && left > 200 ? left + 120 : right;
      while (x < end) {
        const word = 8 + Math.floor(random() * 26);
        for (let dx = 0; dx < word && x + dx < end; dx++) {
          for (let dy = 0; dy < 3; dy++) put(x + dx, line + dy, 92, 70, 52);
        }
        x += word + 6;
      }
    }
    // A big red first letter at the top of the page.
    for (let dy = 0; dy < 26; dy++) {
      for (let dx = 0; dx < 26; dx++) put(left + dx, 38 + dy, 122, 40, 30);
    }
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
