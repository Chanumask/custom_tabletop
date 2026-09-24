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

  DiceSpawn: 'dice:spawn',
  DiceRoll: 'dice:roll',
  DiceRemove: 'dice:remove',

  SoundPlay: 'sound:play',
  SoundUpload: 'sound:upload',

  PlayerMute: 'player:mute',
  PlayerUnmute: 'player:unmute',

  ObjectInteract: 'object:interact',
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
