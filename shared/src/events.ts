/**
 * Socket.IO event names, shared so client and server never hand-type string
 * literals that can drift apart. Source: docs/engineering/architecture.md
 * ("Echtzeitkommunikation" section).
 */
export const SocketEvent = {
  SessionJoin: 'session:join',
  SessionLeave: 'session:leave',
  /**
   * Server -> client broadcast of the authoritative GameState, sent to a
   * session's room whenever membership changes. Not in the original spec's
   * event list (which named session:join/leave but not how the resulting
   * state actually reaches clients) — added in Milestone 2.
   */
  SessionState: 'session:state',
  /** Read-only look at a session before joining (join screen). */
  SessionPeek: 'session:peek',
  /** Host-only: hand the host role to another player. */
  SessionTransferHost: 'session:transfer-host',
  /**
   * Server -> client, no payload: this connection's player identity was
   * just claimed by a newer connection (the same tab reconnecting on a new
   * socket, or a duplicated tab) — this socket no longer speaks for that
   * player and should drop back to the join screen.
   */
  SessionReplaced: 'session:replaced',

  SceneCreate: 'scene:create',
  SceneChange: 'scene:change',
  SceneUpdate: 'scene:update',

  DrawingStart: 'drawing:start',
  DrawingUpdate: 'drawing:update',
  DrawingEnd: 'drawing:end',
  DrawingDelete: 'drawing:delete',

  PlayerMove: 'player:move',
  /** A player changes their own name/color mid-session. */
  PlayerUpdate: 'player:update',
  /** A short character animation everyone else sees (emote.ts). */
  PlayerEmote: 'player:emote',

  DiceSpawn: 'dice:spawn',
  DiceRoll: 'dice:roll',
  DiceRemove: 'dice:remove',

  SoundPlay: 'sound:play',
  SoundUpload: 'sound:upload',
  SoundRemove: 'sound:remove',
  /** Put an existing sound on a wall-board button, or clear the button. */
  SoundboardAssign: 'soundboard:assign',

  PlayerMute: 'player:mute',
  PlayerUnmute: 'player:unmute',

  ObjectInteract: 'object:interact',

  /** Save the whiteboard's lines (whiteboard.ts). */
  WhiteboardWrite: 'whiteboard:write',
  /** Chat, or a typed roll (/roll 2d6+3) — log.ts. */
  ChatSend: 'chat:send',
  /** Server → room: just the parts of GameState an action changed (types.ts
   * `SessionPatch`) — most actions send this instead of a full snapshot. */
  SessionPatch: 'session:patch',
  /** Server → room: one new log entry (a chat line or typed roll). */
  LogEntry: 'log:entry',
  /** "Look here!" on the table — relayed, never stored (ping.ts). */
  TablePing: 'table:ping',
} as const;

export type SocketEventName = (typeof SocketEvent)[keyof typeof SocketEvent];

/**
 * Infra-only round-trip used to prove the WebSocket connection is alive
 * (Milestone 1's exit check). Not part of the domain event model above —
 * no session/game-state semantics attached.
 */
export const ConnectionEvent = {
  Ping: 'connection:ping',
  Pong: 'connection:pong',
} as const;

export type ConnectionEventName = (typeof ConnectionEvent)[keyof typeof ConnectionEvent];
