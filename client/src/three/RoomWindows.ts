import * as THREE from 'three';
import type { WindowId, WindowState } from '@custom-tabletop/shared';
import { mergeStatic } from './mergeStatic.js';

/** Each window's parts in the room model. */
const PARTS: Record<
  WindowId,
  {
    pane: string;
    mullions: [across: string, upright: string];
    curtains: [left: string, right: string];
  }
> = {
  north: {
    pane: 'Window_View',
    mullions: ['Window_Mullion_H', 'Window_Mullion_V'],
    curtains: ['Curtain_L', 'Curtain_R'],
  },
  'east-1': {
    pane: 'Window_View_E1',
    mullions: ['WinE1_Mullion_H', 'WinE1_Mullion_V'],
    curtains: ['WinCurtain_E1_L', 'WinCurtain_E1_R'],
  },
  'east-2': {
    pane: 'Window_View_E2',
    mullions: ['WinE2_Mullion_H', 'WinE2_Mullion_V'],
    curtains: ['WinCurtain_E2_L', 'WinCurtain_E2_R'],
  },
  'west-1': {
    pane: 'Window_View_W1',
    mullions: ['WinW1_Mullion_H', 'WinW1_Mullion_V'],
    curtains: ['WinCurtain_W1_L', 'WinCurtain_W1_R'],
  },
  'west-2': {
    pane: 'Window_View_W2',
    mullions: ['WinW2_Mullion_H', 'WinW2_Mullion_V'],
    curtains: ['WinCurtain_W2_L', 'WinCurtain_W2_R'],
  },
};

const SASH_SECONDS = 0.9;
const CURTAIN_SECONDS = 1.1;
/** A sash's frame bars: face width. */
const BAR = 0.042;
/** How deep the window's woodwork is, from the glass into the room: the
 * upper sash takes the back of it, the lower one the front, so the lower
 * one slides up in front of the upper. */
const DEPTH = 0.07;
const UPPER_DEPTH = 0.032;
const LOWER_FROM = 0.036;

interface Curtain {
  pivot: THREE.Group;
  /** Width scale when drawn (open is 1). */
  drawnScale: number;
}

interface Window {
  id: WindowId;
  pane: THREE.Mesh;
  center: THREE.Vector3;
  /** Half the pane's width — how big it is to aim at. */
  radius: number;
  /** The lower sash, which slides up to open. */
  sash: THREE.Group;
  sashGlass: THREE.Mesh;
  /** How far the lower sash slides up when open (metres). */
  slide: number;
  /** The pane's bottom edge (world height). */
  bottom: number;
  curtains: Curtain[];
  /** Along x (the north window) or z (the side ones). */
  alongX: boolean;
  /** Which way (sign) into the room, along the axis across the wall. */
  inward: number;
  open: number;
  drawn: number;
  state: WindowState;
}

/**
 * The room's windows (docs/decisions.md, "The cozy room, lived in"): old sash
 * windows, whose lower half slides up to open — clear of the curtains,
 * which draw across from their outer edges to meet in the middle. Open,
 * the curtains stir in the breeze. Shared state: GameState.room.
 */
export class RoomWindows {
  private readonly windows: Window[] = [];
  private time = 0;
  private readonly glassMaterial: THREE.MeshStandardMaterial;
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(
    root: THREE.Object3D,
    /** An open window shows the night without glass below `openTo` (a
     * world height; the pane's outside view, OutsideWorld). */
    private readonly onPaneOpen: (pane: THREE.Mesh, openTo: number) => void,
  ) {
    this.glassMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8e4f0,
      roughness: 0.05,
      metalness: 0.4,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    root.updateMatrixWorld(true);
    for (const [id, parts] of Object.entries(PARTS) as [WindowId, (typeof PARTS)[WindowId]][]) {
      const pane = root.getObjectByName(parts.pane);
      const across = root.getObjectByName(parts.mullions[0]);
      const upright = root.getObjectByName(parts.mullions[1]);
      if (!(pane instanceof THREE.Mesh) || !(across instanceof THREE.Mesh)) continue;
      const box = new THREE.Box3().setFromObject(pane);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const alongX = size.x >= size.z;
      const width = alongX ? size.x : size.z;
      const height = size.y;
      const inward = alongX ? 1 : center.x > 0 ? -1 : 1;
      const wood = Array.isArray(across.material) ? across.material[0]! : across.material;

      // The window's own frame, built facing +z ("into the room") from the
      // middle of the pane's bottom edge, and turned to face the room from
      // its wall. The model's cross bars become the two sashes' bars.
      const frame = new THREE.Group();
      frame.name = `${id}-sashes`;
      frame.position.set(center.x, box.min.y, center.z);
      frame.rotation.y = alongX ? 0 : center.x > 0 ? -Math.PI / 2 : Math.PI / 2;
      root.add(frame);
      frame.updateMatrixWorld(true);
      const local = (object: THREE.Object3D) => {
        const bounds = new THREE.Box3().setFromObject(object);
        const min = frame.worldToLocal(bounds.min.clone());
        const max = frame.worldToLocal(bounds.max.clone());
        return new THREE.Box3(min.clone().min(max), min.max(max));
      };
      const rail = local(across);
      const railHeight = rail.max.y - rail.min.y;
      const post = upright ? local(upright) : null;
      const postWidth = post ? post.max.x - post.min.x : BAR;
      const postX = post ? (post.min.x + post.max.x) / 2 : 0;
      across.visible = false;
      if (upright) upright.visible = false;

      const bar = (
        parent: THREE.Object3D,
        w: number,
        h: number,
        x: number,
        y: number,
        z0: number,
        z1: number,
      ) => {
        const mesh = new THREE.Mesh(this.keep(new THREE.BoxGeometry(w, h, z1 - z0)), wood);
        mesh.position.set(x, y, (z0 + z1) / 2);
        parent.add(mesh);
      };
      // The upper sash stays put: its top rail, stiles, meeting rail and bar.
      const upperFrom = rail.min.y;
      bar(frame, width, BAR, 0, height - BAR / 2, 0, UPPER_DEPTH);
      for (const side of [-1, 1]) {
        bar(
          frame,
          BAR,
          height - upperFrom,
          (side * (width - BAR)) / 2,
          (upperFrom + height) / 2,
          0,
          UPPER_DEPTH,
        );
      }
      bar(frame, width, railHeight, 0, (rail.min.y + rail.max.y) / 2, 0, UPPER_DEPTH);
      bar(frame, postWidth, height - rail.max.y, postX, (rail.max.y + height) / 2, 0, UPPER_DEPTH);

      // The lower sash slides: bottom rail, stiles, meeting rail, bar, glass.
      const sash = new THREE.Group();
      sash.name = `${id}-sash`;
      frame.add(sash);
      bar(sash, width, BAR, 0, BAR / 2, LOWER_FROM, DEPTH);
      for (const side of [-1, 1]) {
        bar(sash, BAR, rail.max.y, (side * (width - BAR)) / 2, rail.max.y / 2, LOWER_FROM, DEPTH);
      }
      bar(sash, width, railHeight, 0, (rail.min.y + rail.max.y) / 2, LOWER_FROM, DEPTH);
      bar(sash, postWidth, rail.min.y, postX, rail.min.y / 2, LOWER_FROM, DEPTH);
      const sashGlass = new THREE.Mesh(
        this.keep(new THREE.PlaneGeometry(width - BAR, rail.min.y - BAR)),
        this.glassMaterial,
      );
      sashGlass.position.set(0, (BAR + rail.min.y) / 2, (LOWER_FROM + DEPTH) / 2);
      sashGlass.visible = false;
      sash.add(sashGlass);
      // Each sash's bars as one mesh (the lower one moves as a whole).
      this.geometries.push(
        ...mergeStatic(frame, (part) => part === sash),
        ...mergeStatic(sash, (part) => part === sashGlass),
      );
      // Up until its meeting rail tucks under the upper sash's top rail.
      const slide = Math.max(0, height - BAR - rail.max.y);

      const curtains: Curtain[] = [];
      parts.curtains.forEach((name) => {
        const panel = root.getObjectByName(name);
        if (!panel) return;
        const panelBox = new THREE.Box3().setFromObject(panel);
        // Which end is the outer one: the one away from the pane's middle.
        const lo = alongX ? panelBox.min.x : panelBox.min.z;
        const hi = alongX ? panelBox.max.x : panelBox.max.z;
        const middle = alongX ? center.x : center.z;
        const outer = Math.abs(lo - middle) > Math.abs(hi - middle) ? lo : hi;
        const pivot = new THREE.Group();
        pivot.name = `${name}-pivot`;
        pivot.position.set(
          alongX ? outer : panelBox.getCenter(new THREE.Vector3()).x,
          panelBox.max.y,
          alongX ? panelBox.getCenter(new THREE.Vector3()).z : outer,
        );
        root.add(pivot);
        pivot.updateMatrixWorld(true);
        pivot.attach(panel);
        // Drawn: the inner edge reaches just past the middle of the pane.
        const reach = Math.abs(middle - outer) + 0.03;
        curtains.push({ pivot, drawnScale: reach / Math.max(hi - lo, 0.01) });
      });

      this.windows.push({
        id,
        pane,
        center,
        radius: Math.max(width, size.y) * 0.45,
        sash,
        sashGlass,
        slide,
        bottom: box.min.y,
        curtains,
        alongX,
        inward,
        open: 0,
        drawn: 0,
        state: { open: false, drawn: false },
      });
    }
  }

  /** Every window, for aiming at (RoomView) and hearing through (the
   * night and the rain are louder by an open one). */
  list(): readonly { id: WindowId; center: THREE.Vector3; radius: number; state: WindowState }[] {
    return this.windows;
  }

  /** The shared state (GameState.room.windows); `update` animates to it. */
  setStates(states: Record<WindowId, WindowState>): void {
    for (const window of this.windows) window.state = states[window.id] ?? window.state;
  }

  update(dt: number): void {
    this.time += dt;
    for (const window of this.windows) {
      const wantOpen = window.state.open ? 1 : 0;
      const wantDrawn = window.state.drawn ? 1 : 0;
      window.open = approach(window.open, wantOpen, dt / SASH_SECONDS);
      window.drawn = approach(window.drawn, wantDrawn, dt / CURTAIN_SECONDS);
      const lift = ease(window.open) * window.slide;
      window.sash.position.y = lift;
      window.sashGlass.visible = window.open > 0.01;
      // No glass below the sliding sash's bottom rail (its middle hides the edge).
      this.onPaneOpen(window.pane, window.open > 0.01 ? window.bottom + lift + BAR / 2 : -Infinity);
      const spread = ease(window.drawn);
      window.curtains.forEach((curtain, index) => {
        const scale = 1 + (curtain.drawnScale - 1) * spread;
        if (window.alongX) curtain.pivot.scale.x = scale;
        else curtain.pivot.scale.z = scale;
        // A breeze through an open window billows the curtains into the room.
        const breeze =
          window.open > 0.2
            ? window.open * (0.03 * Math.sin(this.time * 1.7 + index * 1.3) + 0.04)
            : 0;
        // Turning about the rod: the hem swings `inward` along the wall's axis.
        if (window.alongX) curtain.pivot.rotation.x = -window.inward * breeze;
        else curtain.pivot.rotation.z = window.inward * breeze;
      });
    }
  }

  dispose(): void {
    this.glassMaterial.dispose();
    this.geometries.forEach((geometry) => geometry.dispose());
  }

  private keep<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }
}

function approach(value: number, target: number, step: number): number {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}
