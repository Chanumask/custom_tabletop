import * as THREE from 'three';
import type { Point2D } from '@custom-tabletop/shared';
import type { TableBounds } from './collision.js';
import { tableLocalToCanvas } from './tableCoordinates.js';
import { TABLE_CANVAS_SIZE } from './TableCanvas.js';

export interface TableDrawingOptions {
  camera: THREE.Camera;
  domElement: HTMLElement;
  tableTopMesh: THREE.Object3D;
  table: TableBounds;
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
}

/**
 * Raycasts mouse input against the table's top mesh and converts a hit into
 * canvas coordinates, so drawing happens directly on the rendered table
 * surface — the "physical surface on the table" framing in
 * docs/engineering/architecture.md — rather than a flat 2D overlay
 * disconnected from the 3D room. Active only while the pointer isn't locked
 * (see `isDrawingAllowed`); WASD + mouse-look owns the pointer otherwise.
 */
export class TableDrawing {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private strokeActive = false;
  private eraseActive = false;

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.options.isDrawingAllowed()) {
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
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  dispose(): void {
    this.options.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    this.strokeActive = false;
    this.eraseActive = false;
  }

  private raycastToCanvasPoint(event: PointerEvent): Point2D | null {
    const rect = this.options.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNdc, this.options.camera);
    const [hit] = this.raycaster.intersectObject(this.options.tableTopMesh, false);
    if (!hit) {
      return null;
    }

    const localX = hit.point.x - this.options.table.center.x;
    const localZ = hit.point.z - this.options.table.center.z;
    return tableLocalToCanvas(localX, localZ, this.options.table.radius, TABLE_CANVAS_SIZE);
  }
}
