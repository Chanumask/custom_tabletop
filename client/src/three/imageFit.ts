export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Computes where to draw an image of `imageWidth`×`imageHeight` into a
 * `targetSize`×`targetSize` square so it fills the square completely with
 * its aspect ratio preserved (like CSS `object-fit: cover`) — crops the
 * longer dimension instead of stretching, so an uploaded (or linked) map
 * image that isn't already square doesn't look squashed on the table
 * (Milestone 8; docs/decisions.md). The full interactive resize/reposition
 * tool the user actually asked for is bigger scope, tracked in
 * docs/roadmap.md — this is a cheap, non-interactive stopgap.
 */
export function computeCoverRect(
  imageWidth: number,
  imageHeight: number,
  targetSize: number,
): Rect {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { x: 0, y: 0, width: targetSize, height: targetSize };
  }

  const scale = Math.max(targetSize / imageWidth, targetSize / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return {
    x: (targetSize - width) / 2,
    y: (targetSize - height) / 2,
    width,
    height,
  };
}
