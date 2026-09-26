import { describe, expect, it } from 'vitest';
import { HANDBOOK, paragraphs } from './handbook.js';

describe('reading a book', () => {
  it('splits paragraphs on blank lines and makes "# " lines headings', () => {
    expect(paragraphs('# One\n\nFirst.\nStill first.\n\n\n  Second.  \n')).toEqual([
      { heading: true, text: 'One' },
      { heading: false, text: 'First.\nStill first.' },
      { heading: false, text: 'Second.' },
    ]);
    expect(paragraphs('   ')).toEqual([]);
  });

  it('has a guide to the room with a heading for every part of it', () => {
    const headings = paragraphs(HANDBOOK.text).filter((paragraph) => paragraph.heading);
    expect(headings.length).toBeGreaterThanOrEqual(8);
    expect(HANDBOOK.title.length).toBeLessThanOrEqual(60);
  });
});
