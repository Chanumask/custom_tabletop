/**
 * Zoom and pan for the profile viewer (ProfileViewer.tsx): an image of
 * `image` pixels shown in a `frame`, scaled by `scale` with its top-left
 * corner at (x, y) in frame pixels. Pure, so it's testable without a DOM.
 */
export interface Size {
  width: number;
  height: number;
}

export interface View {
  scale: number;
  x: number;
  y: number;
}

/** Space kept around a fitted image. */
const MARGIN = 16;
/** The furthest in: four screen pixels per image pixel. */
const MAX_ZOOM = 4;

/** The scale at which the whole image fits the frame. */
export function fitScale(image: Size, frame: Size): number {
  const width = Math.max(1, frame.width - MARGIN * 2);
  const height = Math.max(1, frame.height - MARGIN * 2);
  return Math.min(width / image.width, height / image.height);
}

/** How far out and in it goes: out to the whole image (or its actual size,
 * if that's smaller still), in to 4× its actual size (further, for a tiny
 * image blown up to fit). */
export function scaleLimits(image: Size, frame: Size): { min: number; max: number } {
  const fit = fitScale(image, frame);
  return { min: Math.min(fit, 1), max: Math.max(MAX_ZOOM, fit * 2) };
}

/** Where the image goes at `scale` so that it stays in view: centred along
 * any side where it's smaller than the frame, otherwise with no gap at the
 * edges. */
export function clampView(view: View, image: Size, frame: Size): View {
  const clampAxis = (offset: number, imageSide: number, frameSide: number) => {
    const shown = imageSide * view.scale;
    if (shown <= frameSide) return (frameSide - shown) / 2;
    return Math.min(0, Math.max(frameSide - shown, offset));
  };
  return {
    scale: view.scale,
    x: clampAxis(view.x, image.width, frame.width),
    y: clampAxis(view.y, image.height, frame.height),
  };
}

/** The whole image, centred. */
export function fitView(image: Size, frame: Size): View {
  return clampView({ scale: fitScale(image, frame), x: 0, y: 0 }, image, frame);
}

/** Zooms to `scale` (within the limits) keeping the image point under
 * `point` (frame pixels) where it is — the cursor, or a pinch's middle. */
export function zoomAt(
  view: View,
  scale: number,
  point: { x: number; y: number },
  image: Size,
  frame: Size,
): View {
  const { min, max } = scaleLimits(image, frame);
  const next = Math.min(max, Math.max(min, scale));
  const ratio = next / view.scale;
  return clampView(
    {
      scale: next,
      x: point.x - (point.x - view.x) * ratio,
      y: point.y - (point.y - view.y) * ratio,
    },
    image,
    frame,
  );
}

/** Moves the image by (dx, dy) frame pixels, as far as it'll go. */
export function panBy(view: View, dx: number, dy: number, image: Size, frame: Size): View {
  return clampView({ scale: view.scale, x: view.x + dx, y: view.y + dy }, image, frame);
}

/** The frame's middle — where the zoom buttons and keys zoom around. */
export function centreOf(frame: Size): { x: number; y: number } {
  return { x: frame.width / 2, y: frame.height / 2 };
}
