import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SocketEvent,
  appendLogEntry,
  type GameState,
  type LogEntryBroadcast,
  type SessionPatch,
  type PlayerColorId,
  type SessionJoinResponse,
  type SoundPlayRequest,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';
import { eventually } from './testSupport.js';

/**
 * Change request #7: a busy session with four players — soundboard edits
 * and plays, a dice pool, simultaneous whiteboard writes, chat and a typed
 * roll, someone leaving — and afterwards every remaining client must hold
 * exactly the same game. Each test client applies events the way the real
 * client does (App.tsx): a session:state replaces its copy, a log:entry is
 * merged into it.
 */
describe('a four-player session stays in sync', () => {
  let app: AppServer;
  let url: string;
  const sockets: ClientSocket[] = [];

  beforeEach(async () => {
    app = createAppServer();
    await new Promise<void>((resolve) => app.http.listen(0, () => resolve()));
    const address = app.http.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    url = `http://localhost:${address.port}`;
  });

  afterEach(async () => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
    app.io.close();
    await new Promise<void>((resolve) => app.http.close(() => resolve()));
  });

  interface TestPlayer {
    id: string;
    socket: ClientSocket;
    state: () => GameState;
    soundsHeard: SoundPlayRequest[];
    emit: <T>(event: string, fields: Record<string, unknown>) => Promise<T>;
  }

  async function join(id: string, color: PlayerColorId): Promise<TestPlayer> {
    const socket = ioClient(url, { transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));

    let state: GameState | null = null;
    const soundsHeard: SoundPlayRequest[] = [];
    socket.on(SocketEvent.SessionState, (next: GameState) => {
      state = next;
    });
    socket.on(SocketEvent.SessionPatch, (message: SessionPatch) => {
      if (state) state = { ...state, ...message.patch };
    });
    socket.on(SocketEvent.LogEntry, (message: LogEntryBroadcast) => {
      if (state) state = { ...state, log: appendLogEntry(state.log, message.entry) };
    });
    socket.on(SocketEvent.SoundPlay, (request: SoundPlayRequest) => soundsHeard.push(request));

    const joined = await new Promise<SessionJoinResponse>((resolve) =>
      socket.emit(
        SocketEvent.SessionJoin,
        { sessionId: 'table', playerId: id, playerName: id, playerToken: `t-${id}`, color },
        resolve,
      ),
    );
    if (!joined.ok) throw new Error(joined.error);
    state ??= joined.state;

    return {
      id,
      socket,
      state: () => state!,
      soundsHeard,
      emit: <T>(event: string, fields: Record<string, unknown>) =>
        new Promise<T>((resolve) =>
          socket.emit(event, { sessionId: 'table', playerId: id, ...fields }, resolve),
        ),
    };
  }

  it('everyone ends up with the same game after a busy session', async () => {
    const alice = await join('alice', 'red');
    const bob = await join('bob', 'blue');
    const carol = await join('carol', 'green');
    const dave = await join('dave', 'yellow');
    const everyone = [alice, bob, carol, dave];
    type Ack = { ok: boolean; error?: string };
    const ok = (ack: Ack) => expect(ack.ok, ack.error).toBe(true);

    // Everyone starts on their own spot (once the last join has reached all).
    await eventually(() => {
      const spawns = alice
        .state()
        .players.map((player) => `${player.position.x},${player.position.z}`);
      expect(new Set(spawns).size).toBe(4);
    });

    // Soundboard: Carol puts a linked sound on wall button 5; Dave presses it.
    ok(
      await carol.emit<Ack>(SocketEvent.SoundUpload, {
        soundId: 'horn',
        name: 'War horn',
        url: 'https://example.com/horn.mp3',
        slotIndex: 5,
      }),
    );
    ok(await dave.emit<Ack>(SocketEvent.SoundPlay, { soundId: 'horn' }));
    // Bob copies it to button 6 while Alice clears button 5 — at once.
    const [copy, clear] = await Promise.all([
      bob.emit<Ack>(SocketEvent.SoundboardAssign, { slotIndex: 6, soundId: 'horn' }),
      alice.emit<Ack>(SocketEvent.SoundboardAssign, { slotIndex: 5, soundId: null }),
    ]);
    ok(copy);
    ok(clear);

    // Dice: Bob adds a d20 and a d6 and rolls them together, then again.
    ok(
      await bob.emit<Ack>(SocketEvent.DiceSpawn, {
        diceId: 'd20',
        kind: 'd20',
        position: { x: 0, y: 0.78, z: 0 },
      }),
    );
    ok(
      await bob.emit<Ack>(SocketEvent.DiceSpawn, {
        diceId: 'd6',
        kind: 'd6',
        position: { x: 0.3, y: 0.78, z: 0 },
      }),
    );
    ok(await bob.emit<Ack>(SocketEvent.DiceRoll, { diceIds: ['d20', 'd6'] }));
    ok(await carol.emit<Ack>(SocketEvent.DiceRoll, { diceIds: ['d20'] }));

    // Whiteboard: Alice and Carol write different lines at the same moment.
    const lines = (index: number, text: string) =>
      Array.from({ length: 6 }, (_, i) => (i === index ? text : null));
    const [aliceWrote, carolWrote] = await Promise.all([
      alice.emit<Ack>(SocketEvent.WhiteboardWrite, { lines: lines(0, 'Goblin ambush!') }),
      carol.emit<Ack>(SocketEvent.WhiteboardWrite, { lines: lines(3, 'Carol: 12 HP') }),
    ]);
    ok(aliceWrote);
    ok(carolWrote);

    // Chat and a typed roll.
    ok(await dave.emit<Ack>(SocketEvent.ChatSend, { text: 'I hide behind the barrel.' }));
    ok(await carol.emit<Ack>(SocketEvent.ChatSend, { text: '/roll 1d20+3' }));

    // And Bob has to go.
    ok(await bob.emit<Ack>(SocketEvent.SessionLeave, {}));

    // --- Everyone who stayed sees the same game (once it has all arrived). ---
    const remaining = [alice, carol, dave];
    await eventually(() => {
      expect(alice.state().log.at(-1)).toMatchObject({ text: 'bob left the table' });
      for (const player of remaining) {
        expect(player.state()).toEqual(alice.state());
      }
    });
    const reference = alice.state();

    // ...and it's the game that was played.
    expect(reference.players.map((player) => player.id)).toEqual(['alice', 'carol', 'dave']);
    expect(reference.soundboardSlots[5]).toBeNull();
    expect(reference.soundboardSlots[6]).toBe('horn');
    expect(reference.soundboard.find((sound) => sound.id === 'horn')).toMatchObject({
      name: 'War horn',
      addedBy: 'carol',
    });
    expect(reference.dice.map((die) => [die.id, die.rollCount])).toEqual([
      ['d20', 2],
      ['d6', 1],
    ]);
    expect(reference.whiteboard[0]).toMatchObject({ text: 'Goblin ambush!', authorId: 'alice' });
    expect(reference.whiteboard[3]).toMatchObject({ text: 'Carol: 12 HP', authorId: 'carol' });
    const story = reference.log.map((entry) =>
      entry.kind === 'system' ? entry.text : `${entry.kind}:${entry.name}`,
    );
    expect(story).toEqual([
      'alice opened the table',
      'bob joined the table',
      'carol joined the table',
      'dave joined the table',
      'roll:bob',
      'roll:carol',
      'chat:dave',
      'roll:carol',
      'bob left the table',
    ]);

    // The horn was heard by all four, once each — the presser included.
    for (const player of everyone) {
      expect(player.soundsHeard).toEqual([
        { sessionId: 'table', playerId: 'dave', soundId: 'horn' },
      ]);
    }
  });
});
