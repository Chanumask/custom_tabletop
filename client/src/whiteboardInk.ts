import { playerColorHex, type Player, type WhiteboardLine } from '@custom-tabletop/shared';

/** Marker color for a line whose author (and their color) is unknown. */
export const DEFAULT_INK = '#2b2f36';

/** The whiteboard's surface color (WhiteboardCanvas paints it). */
export const BOARD_COLOR = '#f4f6f7';

/**
 * Contrast every ink keeps against the board. WCAG's large-text minimum is
 * 3:1; the room's warm, dim lighting eats some of it, hence the margin.
 */
const MIN_INK_CONTRAST = 3.5;

function channelToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parseHex(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG relative luminance of a `#rrggbb` color. */
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(channelToLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#rrggbb` colors. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(parseHex(a)), luminance(parseHex(b))].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The marker version of a player color: unchanged if it already reads well
 * on the board, otherwise darkened toward black (same hue) just enough that
 * it does — yellow on a whiteboard becomes a dark gold rather than vanishing.
 */
export function legibleInk(hex: string, background = BOARD_COLOR): string {
  const rgb = parseHex(hex);
  for (let scale = 1; scale > 0; scale -= 0.02) {
    const candidate = toHex(rgb.map((c) => c * scale) as [number, number, number]);
    if (contrastRatio(candidate, background) >= MIN_INK_CONTRAST) {
      return candidate;
    }
  }
  return DEFAULT_INK;
}

/**
 * The color a whiteboard line is written in: its author's *current* player
 * color while they're in the session (so changing your color re-inks your
 * lines), otherwise the color they had when they wrote it, otherwise a plain
 * dark marker — always made legible on the board.
 */
export function inkColorFor(line: WhiteboardLine, players: Pick<Player, 'id' | 'color'>[]): string {
  const author = line.authorId ? players.find((player) => player.id === line.authorId) : undefined;
  if (author) {
    return legibleInk(playerColorHex(author.color));
  }
  return line.color ? legibleInk(playerColorHex(line.color)) : DEFAULT_INK;
}
