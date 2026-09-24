import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  clampTransform,
  fillTransform,
  fitTransform,
  rescaleTransform,
  scaleLimits,
  zoomAt,
  type MapTransform,
} from './mapFit.js';
import { TABLE_PARCHMENT, TABLE_TEXTURE_PIXELS } from './three/TableCanvas.js';

export type MapSource = { kind: 'file'; file: File } | { kind: 'url'; url: string };

/** On-screen preview size (CSS px); rendered at 2x for sharpness. */
const PREVIEW = 360;
const PREVIEW_PIXELS = PREVIEW * 2;
const WHEEL_ZOOM_STEP = 1.1;

function loadSource(source: MapSource): Promise<{ image: HTMLImageElement; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let objectUrl: string | null = null;
    image.crossOrigin = 'anonymous';
    image.onload = () =>
      resolve({ image, revoke: () => objectUrl && URL.revokeObjectURL(objectUrl) });
    image.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('load failed'));
    };
    if (source.kind === 'file') {
      objectUrl = URL.createObjectURL(source.file);
      image.src = objectUrl;
    } else {
      image.src = source.url;
    }
  });
}

function paint(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  t: MapTransform,
  frameSize: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const k = canvas.width / frameSize;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = TABLE_PARCHMENT;
  ctx.fillRect(0, 0, frameSize, frameSize);
  ctx.drawImage(image, t.x, t.y, image.naturalWidth * t.scale, image.naturalHeight * t.scale);
}

/**
 * Preview + crop for a table map (change request #2): the image shown in a
 * square frame that *is* the table — same parchment behind any uncovered
 * area — where the host drags to position it, zooms (slider or mouse
 * wheel, anchored on the cursor), or snaps to "fit whole image" (the
 * default: nothing cut off) / "fill table" / "center". Confirming bakes
 * exactly that framing into a square image at the table texture's native
 * resolution and uploads it (a linked image gets re-hosted the same way, so
 * the map no longer depends on the original site). The image is only ever
 * scaled uniformly, so its aspect ratio is always preserved.
 */
export function MapCropDialog({
  source,
  onConfirm,
  onCancel,
}: {
  source: MapSource;
  onConfirm: (image: Blob) => Promise<void>;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [transform, setTransform] = useState<MapTransform | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  useEffect(() => {
    let revoke: (() => void) | null = null;
    let cancelled = false;
    loadSource(source).then(
      (loaded) => {
        revoke = loaded.revoke;
        if (cancelled) return;
        setImage(loaded.image);
        setTransform(fitTransform(loaded.image.naturalWidth, loaded.image.naturalHeight, PREVIEW));
      },
      () => {
        if (!cancelled) {
          setError(
            source.kind === 'url'
              ? "Couldn't load that image. The site may not allow its images to be reused — download it and upload the file instead."
              : "Couldn't read that image file.",
          );
        }
      },
    );
    return () => {
      cancelled = true;
      revoke?.();
    };
  }, [source]);

  useEffect(() => {
    if (canvasRef.current && image && transform) {
      paint(canvasRef.current, image, transform, PREVIEW);
    }
  }, [image, transform]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel, busy]);

  const apply = useCallback(
    (next: MapTransform) => {
      if (!image) return;
      setTransform(clampTransform(next, image.naturalWidth, image.naturalHeight, PREVIEW));
    },
    [image],
  );

  // Rendered into <body> so no ancestor's stacking context (the session
  // menu it's opened from) can ever paint over it.
  if (error) {
    return createPortal(
      <div className="modal-backdrop" role="dialog" aria-label="Map preview">
        <div className="map-crop-dialog">
          <p className="modal-title">Map preview</p>
          <p className="add-sound-error">{error}</p>
          <button type="button" onClick={onCancel}>
            Close
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  const limits = image ? scaleLimits(image.naturalWidth, image.naturalHeight, PREVIEW) : null;
  // The slider is logarithmic so zooming feels even across the whole range.
  const sliderValue =
    limits && transform
      ? Math.log(transform.scale / limits.min) / Math.log(limits.max / limits.min)
      : 0;

  function localPoint(event: { clientX: number; clientY: number }) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * PREVIEW,
      y: ((event.clientY - rect.top) / rect.height) * PREVIEW,
    };
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, ...localPoint(event) };
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId || !transform) return;
    const point = localPoint(event);
    apply({
      scale: transform.scale,
      x: transform.x + point.x - drag.current.x,
      y: transform.y + point.y - drag.current.y,
    });
    drag.current = { pointerId: event.pointerId, ...point };
  }

  function handleWheel(event: WheelEvent<HTMLCanvasElement>) {
    if (!transform || !limits) return;
    const factor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
    const scale = Math.min(limits.max, Math.max(limits.min, transform.scale * factor));
    apply(zoomAt(transform, scale, localPoint(event)));
  }

  function handleSlider(value: number) {
    if (!transform || !limits) return;
    const scale = limits.min * Math.pow(limits.max / limits.min, value);
    apply(zoomAt(transform, scale, { x: PREVIEW / 2, y: PREVIEW / 2 }));
  }

  async function handleConfirm() {
    if (!image || !transform) return;
    setBusy(true);
    try {
      const output = document.createElement('canvas');
      output.width = TABLE_TEXTURE_PIXELS;
      output.height = TABLE_TEXTURE_PIXELS;
      paint(
        output,
        image,
        rescaleTransform(transform, PREVIEW, TABLE_TEXTURE_PIXELS),
        TABLE_TEXTURE_PIXELS,
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        output.toBlob(resolve, 'image/jpeg', 0.92),
      );
      if (!blob) throw new Error('encode failed');
      await onConfirm(blob);
    } catch (confirmError) {
      setError(
        confirmError instanceof Error && confirmError.message !== 'encode failed'
          ? confirmError.message
          : "Couldn't prepare that image for the table.",
      );
    } finally {
      setBusy(false);
    }
  }

  const w = image?.naturalWidth ?? 1;
  const h = image?.naturalHeight ?? 1;

  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-label="Fit the map to the table">
      <div className="map-crop-dialog">
        <p className="modal-title">Fit the map to the table</p>
        <p className="modal-hint">Drag to move · scroll or use the slider to zoom</p>
        <canvas
          ref={canvasRef}
          className="map-crop-canvas"
          width={PREVIEW_PIXELS}
          height={PREVIEW_PIXELS}
          style={{ width: PREVIEW, height: PREVIEW }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onWheel={handleWheel}
        />
        <label className="map-crop-zoom">
          Zoom
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={sliderValue}
            disabled={!image}
            onChange={(event) => handleSlider(Number(event.target.value))}
          />
        </label>
        <div className="map-crop-presets">
          <button
            type="button"
            disabled={!image}
            onClick={() => apply(fitTransform(w, h, PREVIEW))}
          >
            Fit whole image
          </button>
          <button
            type="button"
            disabled={!image}
            onClick={() => apply(fillTransform(w, h, PREVIEW))}
          >
            Fill table
          </button>
          <button
            type="button"
            disabled={!image || !transform}
            onClick={() =>
              transform &&
              apply({
                scale: transform.scale,
                x: (PREVIEW - w * transform.scale) / 2,
                y: (PREVIEW - h * transform.scale) / 2,
              })
            }
          >
            Center
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void handleConfirm()}
            disabled={!image || busy}
          >
            {busy ? 'Setting the table…' : 'Use this map'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
