/**
 * player:emote — a short character animation (wave, point, ...) everyone
 * else sees on this player's avatar. Fire-and-forget like player:move: no
 * ack, nothing stored in GameState (an emote is a moment, not state), and
 * relayed to everyone *except* the sender, who can't see their own avatar
 * from first person anyway.
 */
export const EMOTES = [
  { id: 'wave', label: 'Wave', key: 'Digit1' },
  { id: 'point', label: 'Point', key: 'Digit2' },
  { id: 'punch', label: 'Punch', key: 'Digit3' },
  { id: 'kick', label: 'Kick', key: 'Digit4' },
  { id: 'roll', label: 'Roll', key: 'Digit5' },
  { id: 'faint', label: 'Faint', key: 'Digit6' },
] as const;

export type EmoteId = (typeof EMOTES)[number]['id'];

export function isEmoteId(value: unknown): value is EmoteId {
  return EMOTES.some((emote) => emote.id === value);
}

export interface PlayerEmoteRequest {
  sessionId: string;
  playerId: string;
  emote: EmoteId;
}
