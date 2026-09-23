/**
 * Socket.IO event names, shared so client and server never hand-type string
 * literals that can drift apart. Source: docs/engineering/architecture.md
 * ("Echtzeitkommunikation" section).
 */
export const SocketEvent = {
  SessionJoin: 'session:join',
  SessionLeave: 'session:leave',

  SceneCreate: 'scene:create',
  SceneChange: 'scene:change',
  SceneUpdate: 'scene:update',

  DrawingStart: 'drawing:start',
  DrawingUpdate: 'drawing:update',
  DrawingEnd: 'drawing:end',
  DrawingDelete: 'drawing:delete',

  PlayerMove: 'player:move',

  DiceSpawn: 'dice:spawn',
  DiceRoll: 'dice:roll',
  DiceRemove: 'dice:remove',

  SoundPlay: 'sound:play',

  PlayerMute: 'player:mute',
  PlayerUnmute: 'player:unmute',
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
