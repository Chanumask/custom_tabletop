/**
 * The geometry behind the map crop/preview dialog (MapCropDialog.tsx): how an
 * image of `width`x`height` pixels is placed inside the square table frame
 * of `size` pixels. `scale` is image pixels -> frame pixels; (x, y) is where
 * the image's top-left corner lands. Uniform scale only — an image is never
 * stretched, so its aspect ratio is always preserved. Pure, so it's tested
 * without a DOM.
 */
export interface MapTransform {
  scale: number;
  x: number;
  y: number;
}

/** Centered at the given scale. */
function centered(width: number, height: number, size: number, scale: number): MapTransform {
  return { scale, x: (size - width * scale) / 2, y: (size - height * scale) / 2 };
}

/** The whole image visible, as large as fits ("contain"). */
export function fitTransform(width: number, height: number, size: number): MapTransform {
  return centered(width, height, size, Math.min(size / width, size / height));
}

/** The whole table covered, cropping the longer side ("cover"). */
export function fillTransform(width: number, height: number, size: number): MapTransform {
  return centered(width, height, size, Math.max(size / width, size / height));
}

/** How far the zoom slider may go: from a quarter of "fit" (a small image
 * framed by lots of parchment) to 4x "fill" (a close crop). */
export function scaleLimits(width: number, height: number, size: number) {
  return {
    min: fitTransform(width, height, size).scale * 0.25,
    max: fillTransform(width, height, size).scale * 4,
  };
}

/** How much of the image must stay inside the frame while panning, so it
 * can't be dragged off entirely and lost. */
const MIN_VISIBLE_FRACTION = 0.2;

/** Keeps at least a sliver of the image on the table while panning. */
export function clampTransform(
  t: MapTransform,
  width: number,
  height: number,
  size: number,
): MapTransform {
  const w = width * t.scale;
  const h = height * t.scale;
  const keepX = Math.min(w, size) * MIN_VISIBLE_FRACTION;
  const keepY = Math.min(h, size) * MIN_VISIBLE_FRACTION;
  return {
    scale: t.scale,
    x: Math.min(Math.max(t.x, keepX - w), size - keepX),
    y: Math.min(Math.max(t.y, keepY - h), size - keepY),
  };
}

/** Changes the scale while keeping the frame point `anchor` fixed on the
 * same spot of the image — zooming "into the cursor" / the frame center. */
export function zoomAt(
  t: MapTransform,
  newScale: number,
  anchor: { x: number; y: number },
): MapTransform {
  const ratio = newScale / t.scale;
  return {
    scale: newScale,
    x: anchor.x - (anchor.x - t.x) * ratio,
    y: anchor.y - (anchor.y - t.y) * ratio,
  };
}

/** The same framing expressed for a differently-sized square frame (the
 * small on-screen preview -> the full-resolution output). */
export function rescaleTransform(t: MapTransform, fromSize: number, toSize: number): MapTransform {
  const k = toSize / fromSize;
  return { scale: t.scale * k, x: t.x * k, y: t.y * k };
}
