/**
 * Books on the lectern by the bookshelf (docs/decisions.md, "The cozy
 * room"): the host writes them — lore, a letter, the rules of the house —
 * and everyone can read them. Stored with the table (GameState.books).
 */

export interface Book {
  id: string;
  title: string;
  /** Plain text; a blank line starts a new paragraph. */
  text: string;
  /** Which of the cover colors (`BOOK_COVERS`) it's bound in. */
  cover: number;
}

export const MAX_BOOKS = 12;
export const MAX_BOOK_TITLE = 60;
export const MAX_BOOK_TEXT = 8000;

/** Leather, cloth and board: what the books on the lectern are bound in. */
export const BOOK_COVERS = [
  '#7a2e24',
  '#2f4f6e',
  '#3f5d3a',
  '#6b4a2b',
  '#5a3a6b',
  '#8a6a2a',
] as const;

/** A book as the host sent it, tidied — or null if there's no title. */
export function cleanBook(input: { title: unknown; text: unknown; cover?: unknown }): {
  title: string;
  text: string;
  cover: number;
} | null {
  if (typeof input.title !== 'string' || typeof input.text !== 'string') return null;
  // One line for the title; the text keeps its line breaks but no other
  // control characters.
  const title = replaceControls(input.title, () => ' ')
    .trim()
    .slice(0, MAX_BOOK_TITLE);
  const text = replaceControls(input.text.replace(/\r\n?/g, '\n'), (char) =>
    char === '\n' || char === '\t' ? char : '',
  ).slice(0, MAX_BOOK_TEXT);
  if (!title) return null;
  const cover =
    typeof input.cover === 'number' && Number.isInteger(input.cover)
      ? Math.abs(input.cover) % BOOK_COVERS.length
      : 0;
  return { title, text, cover };
}

/** Each control character (below 32, and 127) swapped for `swap(char)`. */
function replaceControls(text: string, swap: (char: string) => string): string {
  let result = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    result += code < 32 || code === 127 ? swap(char) : char;
  }
  return result;
}

/** Saved books, kept only if they still make sense. */
export function normalizeBooks(saved: unknown): Book[] {
  if (!Array.isArray(saved)) return [];
  const books: Book[] = [];
  for (const entry of saved.slice(0, MAX_BOOKS)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { id } = entry as { id?: unknown };
    const book = cleanBook(entry as { title: unknown; text: unknown; cover?: unknown });
    if (typeof id === 'string' && id && book) books.push({ id, ...book });
  }
  return books;
}
