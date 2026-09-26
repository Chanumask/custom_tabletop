import { describe, expect, it } from 'vitest';
import {
  BOOK_COVERS,
  cleanBook,
  MAX_BOOK_TEXT,
  MAX_BOOK_TITLE,
  MAX_BOOKS,
  normalizeBooks,
} from './books.js';

describe('books', () => {
  it('tidies what the host wrote: one-line title, text kept, sensible cover', () => {
    expect(cleanBook({ title: '  A\ttale\n ', text: 'Line one\r\nLine two', cover: 9 })).toEqual({
      title: 'A tale',
      text: 'Line one\nLine two',
      cover: 9 % BOOK_COVERS.length,
    });
    expect(
      cleanBook({ title: 'x'.repeat(200), text: 'y'.repeat(MAX_BOOK_TEXT + 50) }),
    ).toMatchObject({
      title: 'x'.repeat(MAX_BOOK_TITLE),
      cover: 0,
    });
    expect(cleanBook({ title: 'x', text: 'y'.repeat(MAX_BOOK_TEXT + 50) })!.text).toHaveLength(
      MAX_BOOK_TEXT,
    );
  });

  it('needs a title', () => {
    expect(cleanBook({ title: '   ', text: 'words' })).toBeNull();
    expect(cleanBook({ title: 5, text: 'words' })).toBeNull();
  });

  it('keeps only saved books that still make sense, and no more than fit', () => {
    const saved = [
      { id: 'a', title: 'One', text: '', cover: 1 },
      { id: '', title: 'No id', text: '' },
      { title: 'No id at all', text: '' },
      'nonsense',
      ...Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, title: `Book ${i}`, text: '' })),
    ];
    const books = normalizeBooks(saved);
    expect(books[0]).toEqual({ id: 'a', title: 'One', text: '', cover: 1 });
    expect(books.length).toBeLessThanOrEqual(MAX_BOOKS);
    expect(normalizeBooks(undefined)).toEqual([]);
  });
});
