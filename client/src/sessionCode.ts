// Excludes 0/O and 1/I — easier to read and say aloud when sharing a code.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

/** A short, shareable code for a fresh session to host. */
export function generateSessionCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/** Longest session code a player can type (hosts may pick their own). */
export const MAX_SESSION_CODE_LENGTH = 12;

/**
 * What a typed or pasted session code field should hold: upper case, only
 * letters, digits and dashes. A pasted invite link (`…?join=CODE`) yields
 * its code, so "paste the link the host sent" just works.
 */
export function normalizeSessionCodeInput(raw: string): string {
  const invite = /[?&]join=([^&#\s]*)/i.exec(raw);
  const code = invite ? decodeURIComponent(invite[1]!) : raw;
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, MAX_SESSION_CODE_LENGTH);
}
