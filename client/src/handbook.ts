/**
 * The book that's always on the lectern: how the room works, for anyone new
 * to it. Written like the host's books (a blank line between paragraphs, a
 * paragraph starting "# " is a heading).
 */
export const HANDBOOK = {
  id: 'handbook',
  title: 'A guide to the room',
  cover: 3,
  text: `Welcome in. Pull up a chair — here's how everything works.

# Getting about
Click into the room to look around with the mouse. W, A, S and D walk; hold Shift to run; Esc lets go of the mouse again.

# Look at it and press E
Nearly everything answers to E when you look at it: the light switch by the door, the reading lamp, the candles (blow them out and light them again), the fire (another log on), the windows (E opens one, Shift+E draws its curtains), the record player, the tea set, the popcorn, the cat — and this lectern.

# Sitting down
At the table, E sits you in a chair. V swaps between the view from your chair and the map from above, where you draw, roll the dice and point things out. The sofa, the armchair and the rocking chair take one person each: E to sit, E again (or a step) to get up.

# Tea and something to nibble
Pour yourself a cup of tea (E) or hot cocoa (Shift+E) at the tea set by the sofa. R takes a sip; 7 raises your mug to everyone — if someone with a drink is close, you'll hear the clink. The popcorn is in the bowl on the corner of the table.

# Music
The record player by the reading lamp has three records of its own, and it will play any song from the soundboard, too. Everyone hears the same record; how loud it is, is up to you.

# The chest
The old chest by the east wall holds a camera (your photos go up on the pinboard), a flashlight, two walkie-talkies and a calculator. You can hold one thing at a time — a gadget or a drink — and R uses it.

# Talking
Enter opens the chat, and what you say shows over your head for a moment. The number keys 1 to 6 are little gestures: a wave, pointing, and more.

# Your own ears
Under Settings, every kind of sound has its own switch and volume — the fire, the rain, the music, footsteps, the cat — and you can quiet any one player just for yourself. Nobody else is affected. There's a switch for no flashing lights, too.

# For the host
The host dresses the room (classic, Halloween or winter), brings the weather in, sets the mood, writes the other books on this lectern, and looks after the table: who may draw or play sounds, and who's welcome.`,
};

export type Paragraph = { heading: boolean; text: string };

/** A book's text as paragraphs: split on blank lines; "# " makes a heading. */
export function paragraphs(text: string): Paragraph[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) =>
      block.startsWith('# ')
        ? { heading: true, text: block.slice(2).trim() }
        : { heading: false, text: block },
    );
}
