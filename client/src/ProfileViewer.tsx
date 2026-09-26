import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  centreOf,
  clampView,
  fitView,
  panBy,
  scaleLimits,
  zoomAt,
  type Size,
  type View,
} from './imageViewport.js';

const ZOOM_STEP = 1.25;
const WHEEL_STEP = 1.12;
const KEY_PAN = 80;

/**
 * A player's profile image, full screen (docs/decisions.md, "Player
 * profiles") — usually a character sheet, so it's made for reading: the
 * whole page first, then zoom (wheel, pinch, +/−, double-click) and drag
 * around the parts that matter. Esc closes it. While it's open, keys are
 * its own: nothing reaches the room behind it.
 */
export function ProfileViewer({
  title,
  note,
  load,
  onClose,
}: {
  title: string;
  /** Who else can see it, in words. */
  note: string;
  /** Resolves with an object URL for the image. */
  load: () => Promise<string>;
  onClose: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [image, setImage] = useState<Size | null>(null);
  const [frame, setFrame] = useState<Size | null>(null);
  const [view, setView] = useState<View | null>(null);
  /** Still showing the whole image — so a resize re-fits it. */
  const fitted = useRef(true);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);

  // A new image (or another try) starts from the whole page again.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setSrc(null);
    setImage(null);
    setView(null);
    fitted.current = true;
    load().then(
      (url) => !cancelled && setSrc(url),
      (reason: unknown) =>
        !cancelled &&
        setError(reason instanceof Error ? reason.message : 'Couldn’t load the profile.'),
    );
    return () => {
      cancelled = true;
    };
  }, [load, attempt]);

  // The room's mouse-look lets go, and focus comes here (and goes back).
  useEffect(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  // The stage's size, kept current.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => setFrame({ width: stage.clientWidth, height: stage.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Fit on load, and again on resize while fitted; otherwise stay in view.
  useEffect(() => {
    if (!image || !frame) return;
    setView((current) =>
      !current || fitted.current ? fitView(image, frame) : clampView(current, image, frame),
    );
  }, [image, frame]);

  // Every change builds on the latest view (a burst of wheel or pointer
  // events can outrun React's re-renders).
  const change = useCallback(
    (next: (current: View, image: Size, frame: Size) => View) => {
      if (!image || !frame) return;
      fitted.current = false;
      setView((current) => (current ? next(current, image, frame) : current));
    },
    [image, frame],
  );
  const zoomTo = useCallback(
    (scale: number, point?: { x: number; y: number }) =>
      change((current, image, frame) =>
        zoomAt(current, scale, point ?? centreOf(frame), image, frame),
      ),
    [change],
  );
  const zoomBy = useCallback(
    (factor: number, point?: { x: number; y: number }) =>
      change((current, image, frame) =>
        zoomAt(current, current.scale * factor, point ?? centreOf(frame), image, frame),
      ),
    [change],
  );
  const fit = useCallback(() => {
    if (!image || !frame) return;
    fitted.current = true;
    setView(fitView(image, frame));
  }, [image, frame]);

  // Keys belong to the viewer while it's open (capture phase, so the
  // room's own shortcuts never see them).
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      const pan = (dx: number, dy: number) => {
        event.preventDefault();
        change((current, image, frame) => panBy(current, dx, dy, image, frame));
      };
      switch (event.key) {
        case '+':
        case '=':
          event.preventDefault();
          zoomBy(ZOOM_STEP);
          break;
        case '-':
        case '_':
          event.preventDefault();
          zoomBy(1 / ZOOM_STEP);
          break;
        case '0':
          event.preventDefault();
          fit();
          break;
        case '1':
          event.preventDefault();
          zoomTo(1);
          break;
        case 'ArrowLeft':
          pan(KEY_PAN, 0);
          break;
        case 'ArrowRight':
          pan(-KEY_PAN, 0);
          break;
        case 'ArrowUp':
          pan(0, KEY_PAN);
          break;
        case 'ArrowDown':
          pan(0, -KEY_PAN);
          break;
      }
    };
    const swallow = (event: KeyboardEvent) => event.stopPropagation();
    window.addEventListener('keydown', handleKey, true);
    window.addEventListener('keyup', swallow, true);
    return () => {
      window.removeEventListener('keydown', handleKey, true);
      window.removeEventListener('keyup', swallow, true);
    };
  }, [onClose, change, zoomBy, zoomTo, fit]);

  // The wheel zooms around the cursor (a native listener: React's is
  // passive, and the page mustn't scroll).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      // In pixels (Firefox may count lines or pages). A trackpad sends many
      // small deltas, a mouse wheel a few big ones: zoom by how far it went.
      const pixels = event.deltaY * (event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 800 : 1);
      if (pixels === 0) return;
      const steps = Math.min(3, Math.abs(pixels) / 100);
      zoomBy(Math.pow(WHEEL_STEP, -Math.sign(pixels) * steps), point);
    };
    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, [zoomBy]);

  function stagePoint(event: { clientX: number; clientY: number }) {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, stagePoint(event));
    if (pointers.current.size === 2 && view) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), scale: view.scale };
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const point = stagePoint(event);
    pointers.current.set(event.pointerId, point);
    const started = pinch.current;
    if (pointers.current.size >= 2 && started) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const middle = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      zoomTo((started.scale * distance) / Math.max(1, started.distance), middle);
      return;
    }
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    change((current, image, frame) => panBy(current, dx, dy, image, frame));
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  function handleDoubleClick(event: { clientX: number; clientY: number }) {
    if (!image || !frame || !view) return;
    const fitScale = fitView(image, frame).scale;
    // Whole page → actual size where you clicked; anything else → whole page.
    if (Math.abs(view.scale - fitScale) < 1e-6)
      zoomTo(Math.max(1, fitScale * 2), stagePoint(event));
    else fit();
  }

  const limits = image && frame ? scaleLimits(image, frame) : null;
  const percent = view ? Math.round(view.scale * 100) : null;

  return createPortal(
    <div
      className="modal-backdrop profile-viewer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="profile-viewer">
        <header className="profile-viewer-bar">
          <p className="modal-title">{title}</p>
          <span className="profile-viewer-note">{note}</span>
          <span className="profile-viewer-tools">
            <button
              type="button"
              className="icon-button"
              aria-label="Zoom out"
              title="Zoom out (−)"
              disabled={!view || !limits || view.scale <= limits.min + 1e-6}
              onClick={() => zoomBy(1 / ZOOM_STEP)}
            >
              −
            </button>
            <span className="profile-viewer-zoom" aria-live="polite">
              {percent === null ? '' : `${percent}%`}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Zoom in"
              title="Zoom in (+)"
              disabled={!view || !limits || view.scale >= limits.max - 1e-6}
              onClick={() => zoomBy(ZOOM_STEP)}
            >
              +
            </button>
            <button type="button" disabled={!view} title="The whole image (0)" onClick={fit}>
              Fit
            </button>
            <button
              type="button"
              disabled={!view}
              title="Actual size (1)"
              onClick={() => zoomTo(1)}
            >
              1:1
            </button>
            <button
              ref={closeRef}
              type="button"
              className="icon-button"
              aria-label="Close"
              title="Close (Esc)"
              onClick={onClose}
            >
              ×
            </button>
          </span>
        </header>
        <div
          ref={stageRef}
          className={`profile-viewer-stage${view ? ' ready' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        >
          {src && !error && (
            <img
              src={src}
              alt={title}
              draggable={false}
              decoding="async"
              style={
                view
                  ? {
                      width: image!.width * view.scale,
                      height: image!.height * view.scale,
                      transform: `translate(${view.x}px, ${view.y}px)`,
                    }
                  : { visibility: 'hidden' }
              }
              onLoad={(event) =>
                setImage({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              onError={() => setError('This image couldn’t be displayed.')}
            />
          )}
          {!view && !error && (
            <p className="profile-viewer-status" role="status">
              Loading…
            </p>
          )}
          {error && (
            <div className="profile-viewer-status" role="alert">
              <p>{error}</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            </div>
          )}
        </div>
        <p className="profile-viewer-hint">
          Scroll or pinch to zoom · drag to move · double-click for actual size
        </p>
      </div>
    </div>,
    document.body,
  );
}
