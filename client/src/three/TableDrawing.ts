import * as THREE from 'three';
import type { Point2D } from '@custom-tabletop/shared';
import type { TableSurface } from './RoomLayout.js';
import { tableLocalToCanvas } from './tableCoordinates.js';
import { TABLE_CANVAS_SIZE } from './TableCanvas.js';

export interface TableDrawingOptions {
  camera: THREE.Camera;
  domElement: HTMLElement;
  tableTopMesh: THREE.Object3D;
  table: TableSurface;
  /** Drawing only makes sense while the player isn't looking around
   * (pointer-locked) — the same mouse drives both, and letting a drag
   * during mouse-look accidentally draw would be surprising. */
  isDrawingAllowed: () => boolean;
  /** Which of the drawing toolbar's tools (Milestone 8) is active —
   * checked on every pointerdown so switching tools mid-session takes
   * effect on the next click without reconstructing this class. */
  getTool: () => 'pen' | 'eraser';
  onStrokeStart: (point: Point2D) => void;
  onStrokePoint: (point: Point2D) => void;
  onStrokeEnd: () => void;
  /** The eraser tool (Milestone 8): called with every point under the
   * cursor while erasing, including while dragging — the caller hit-tests
   * which stroke (if any) that point is near. */
  onErase: (point: Point2D) => void;
  /** Gets first say on a press: something on the table (a mini, a die)
   * can be picked up instead of starting a stroke under it. Returns what to
   * do as the pointer moves and when it's let go — `end(false)` means it
   * never moved, i.e. a click (a die rolls). Null: nothing there. */
  startDrag?: (raycaster: THREE.Raycaster) => TableDrag | null;
  /** Whether what's under the pointer could be picked up (the hand cursor). */
  canPickUp?: (raycaster: THREE.Raycaster) => boolean;
  /** A right-click on the table: "look here!" (TablePings). */
  onPing?: (point: Point2D) => void;
  /** Whether a press on the bare table may draw or erase — false while the
   * host has drawing turned off (host.ts). Dragging and rolling still work. */
  canMark?: () => boolean;
}

/**
 * Raycasts mouse input against the table's top mesh and converts a hit into
 * canvas coordinates, so drawing happens directly on the rendered table
 * surface — the "physical surface on the table" framing in
 * docs/engineering/architecture.md — rather than a flat 2D overlay
 * disconnected from the 3D room. Active only while the pointer isn't locked
 * (see `isDrawingAllowed`); WASD + mouse-look owns the pointer otherwise.
 */
/** Right-click pings, so the browser's context menu has no business here. */
function preventContextMenu(event: Event): void {
  event.preventDefault();
}

/** Something picked up off the table (TableDrawingOptions.startDrag). */
export interface TableDrag {
  move(point: Point2D): void;
  end(moved: boolean): void;
}

/** Pointer travel (px) before a press counts as a drag, not a click. */
const DRAG_THRESHOLD_PX = 5;

export class TableDrawing {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private strokeActive = false;
  private eraseActive = false;
  private drag: { handler: TableDrag; x: number; y: number; moved: boolean } | null = null;

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.options.isDrawingAllowed()) {
      return;
    }
    if (event.button === 2) {
      const target = this.raycastToCanvasPoint(event);
      if (target) {
        this.options.onPing?.(target);
      }
      return;
    }
    if (event.button !== 0) {
      return; // the middle button (and anything else) neither draws nor rolls
    }
    this.aim(event);
    const drag = this.options.startDrag?.(this.raycaster);
    if (drag) {
      this.drag = { handler: drag, x: event.clientX, y: event.clientY, moved: false };
      this.options.domElement.style.cursor = 'grabbing';
      return;
    }
    if (this.options.canMark && !this.options.canMark()) {
      return;
    }
    const point = this.raycastToCanvasPoint(event);
    if (!point) {
      return;
    }
    if (this.options.getTool() === 'eraser') {
      this.eraseActive = true;
      this.options.onErase(point);
      return;
    }
    this.strokeActive = true;
    this.options.onStrokeStart(point);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.drag) {
      const drag = this.drag;
      if (
        !drag.moved &&
        Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > DRAG_THRESHOLD_PX
      ) {
        drag.moved = true;
      }
      if (drag.moved) {
        const point = this.raycastToCanvasPoint(event);
        if (point) drag.handler.move(point);
      }
      return;
    }
    if (!this.strokeActive && !this.eraseActive) {
      this.updateHoverCursor(event);
    }
    if (this.eraseActive) {
      const point = this.raycastToCanvasPoint(event);
      if (point) {
        this.options.onErase(point);
      }
      return;
    }
    if (!this.strokeActive) {
      return;
    }
    const point = this.raycastToCanvasPoint(event);
    if (point) {
      this.options.onStrokePoint(point);
    }
  };

  private readonly handlePointerUp = (): void => {
    if (this.drag) {
      const { handler, moved } = this.drag;
      this.drag = null;
      this.options.domElement.style.cursor = '';
      handler.end(moved);
      return;
    }
    if (this.eraseActive) {
      this.eraseActive = false;
      return;
    }
    if (!this.strokeActive) {
      return;
    }
    this.strokeActive = false;
    this.options.onStrokeEnd();
  };

  constructor(private readonly options: TableDrawingOptions) {}

  connect(): void {
    this.options.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.options.domElement.addEventListener('contextmenu', preventContextMenu);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  dispose(): void {
    this.options.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.options.domElement.removeEventListener('contextmenu', preventContextMenu);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    this.strokeActive = false;
    this.eraseActive = false;
    this.drag = null;
    this.options.domElement.style.cursor = '';
  }

  /** A hand over something that can be picked up (only over the canvas,
   * and only while the pointer is free to draw). */
  private updateHoverCursor(event: PointerEvent): void {
    const element = this.options.domElement;
    if (event.target !== element || !this.options.isDrawingAllowed() || !this.options.canPickUp) {
      if (element.style.cursor === 'grab') element.style.cursor = '';
      return;
    }
    this.aim(event);
    const cursor = this.options.canPickUp(this.raycaster) ? 'grab' : '';
    if (element.style.cursor !== cursor) element.style.cursor = cursor;
  }

  private aim(event: PointerEvent): void {
    const rect = this.options.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.options.camera);
  }

  private raycastToCanvasPoint(event: PointerEvent): Point2D | null {
    this.aim(event);
    const [hit] = this.raycaster.intersectObject(this.options.tableTopMesh, false);
    if (!hit) {
      return null;
    }

    const localX = hit.point.x - this.options.table.center.x;
    const localZ = hit.point.z - this.options.table.center.z;
    const { halfWidth, halfDepth } = this.options.table;
    return tableLocalToCanvas(localX, localZ, halfWidth, halfDepth, TABLE_CANVAS_SIZE);
  }
}
