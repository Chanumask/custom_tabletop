import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  SocketEvent,
  type SessionJoinResponse,
  type SoundPlayResponse,
  type SoundUploadResponse,
  type PlayerMuteResponse,
} from '@custom-tabletop/shared';
import { createAppServer, type AppServer } from './server.js';

function joinAck(client: ClientSocket, payload: unknown): Promise<SessionJoinResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.SessionJoin, payload, resolve));
}

function soundPlayAck(client: ClientSocket, payload: unknown): Promise<SoundPlayResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.SoundPlay, payload, resolve));
}

function soundUploadAck(client: ClientSocket, payload: unknown): Promise<SoundUploadResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.SoundUpload, payload, resolve));
}

function muteAck(client: ClientSocket, payload: unknown): Promise<PlayerMuteResponse> {
  return new Promise((resolve) => client.emit(SocketEvent.PlayerMute, payload, resolve));
}

function connect(url: string): Promise<ClientSocket> {
  const client = ioClient(url, { transports: ['websocket'] });
  return new Promise((resolve) => client.on('connect', () => resolve(client)));
}

describe('Soundboard & mute (Milestone 7 exit check)', () => {
  let app: AppServer;
  let url: string;
  let clients: ClientSocket[];

  beforeEach(async () => {
    app = createAppServer();
    await new Promise<void>((resolve) => {
      app.http.listen(0, () => resolve());
    });
    const address = app.http.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected server to bind to a numeric port');
    }
    url = `http://localhost:${address.port}`;
    clients = [];
  });

  afterEach(async () => {
    clients.forEach((client) => client.disconnect());
    app.io.close();
    await new Promise<void>((resolve) => app.http.close(() => resolve()));
  });

  it('a non-host player playing a sound is heard (received) by every player in the session, sender included', async () => {
    // Playing was host-only through Milestone 9 but was opened up to any
    // player in the wall-soundboard follow-up (docs/decisions.md) — proven
    // here with Bob (not the host) as the one triggering it.
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    await joinAck(alice, { sessionId: 'table-1', playerId: 'alice-id', playerName: 'Alice' });
    await joinAck(bob, { sessionId: 'table-1', playerId: 'bob-id', playerName: 'Bob' });

    const aliceHearsIt = new Promise((resolve) => alice.once(SocketEvent.SoundPlay, resolve));
    const bobHearsIt = new Promise((resolve) => bob.once(SocketEvent.SoundPlay, resolve));

    const result = await soundPlayAck(bob, {
      sessionId: 'table-1',
      playerId: 'bob-id',
      soundId: 'bell',
    });
    expect(result).toEqual({ ok: true });

    const expected = { sessionId: 'table-1', playerId: 'bob-id', soundId: 'bell' };
    expect(await aliceHearsIt).toEqual(expected);
    expect(await bobHearsIt).toEqual(expected);
  });

  it('rejects playing an unrecognized sound id', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'table-2b', playerId: 'alice-id', playerName: 'Alice' });

    const result = await soundPlayAck(alice, {
      sessionId: 'table-2b',
      playerId: 'alice-id',
      soundId: 'not-a-real-sound',
    });
    expect(result).toEqual({ ok: false, error: 'Sound not found.' });
  });

  it("a fresh session already has the built-in soundboard presets, filling the wall board's first slots", async () => {
    const alice = await connect(url);
    clients.push(alice);
    const joined = await joinAck(alice, {
      sessionId: 'table-2c',
      playerId: 'alice-id',
      playerName: 'Alice',
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.state.soundboard.map((s) => s.id)).toEqual(['bell', 'drum', 'alert']);
    // The wall board (Milestone 8 follow-up) is a fixed 16-slot grid: the
    // three built-ins fill the first three buttons, everything else starts
    // empty, ready for a player to press and attach something.
    expect(joined.state.soundboardSlots).toEqual([
      'bell',
      'drum',
      'alert',
      ...Array<null>(13).fill(null),
    ]);
  });

  it("a non-host player's uploaded sound is added to the shared soundboard, seen live by everyone, and can then be played by anyone", async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    await joinAck(alice, { sessionId: 'table-2d', playerId: 'alice-id', playerName: 'Alice' });
    await joinAck(bob, { sessionId: 'table-2d', playerId: 'bob-id', playerName: 'Bob' });
    // Let Bob's own join broadcast fully drain before listening for the
    // *next* one — see the same note on the mute test below.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const aliceSeesTheUpload = new Promise((resolve) =>
      alice.once(SocketEvent.SessionState, resolve),
    );

    // Bob (not the host) uploads a sound — uploading was never host-gated.
    const uploadResult = await soundUploadAck(bob, {
      sessionId: 'table-2d',
      playerId: 'bob-id',
      soundId: 'custom-1',
      name: 'Air Horn',
      url: 'http://localhost:3001/uploads/sounds/air-horn.mp3',
    });
    expect(uploadResult.ok).toBe(true);
    if (!uploadResult.ok) return;
    expect(uploadResult.state.soundboard).toContainEqual({
      id: 'custom-1',
      name: 'Air Horn',
      url: 'http://localhost:3001/uploads/sounds/air-horn.mp3',
      playing: false,
    });

    const broadcast = (await aliceSeesTheUpload) as { soundboard: { id: string }[] };
    expect(broadcast.soundboard.map((s) => s.id)).toContain('custom-1');

    // Bob himself can now play the sound he just uploaded — playing is open
    // to any player (see the test above), not just the host.
    const playResult = await soundPlayAck(bob, {
      sessionId: 'table-2d',
      playerId: 'bob-id',
      soundId: 'custom-1',
    });
    expect(playResult).toEqual({ ok: true });
  });

  it('sound:upload rejects a duplicate sound id', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'table-2e', playerId: 'alice-id', playerName: 'Alice' });

    const result = await soundUploadAck(alice, {
      sessionId: 'table-2e',
      playerId: 'alice-id',
      soundId: 'bell', // already a built-in preset id
      name: 'Not actually a bell',
      url: 'http://localhost:3001/uploads/sounds/whatever.mp3',
    });
    expect(result).toEqual({ ok: false, error: 'A sound with that id already exists.' });
  });

  it('sound:upload with a slotIndex assigns the new sound to that wall-board slot', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'table-2f', playerId: 'alice-id', playerName: 'Alice' });

    // Slot 5 starts empty (only 0/1/2 are pre-filled) — pressing it opens
    // the assign menu client-side, which then uploads with slotIndex: 5.
    const result = await soundUploadAck(alice, {
      sessionId: 'table-2f',
      playerId: 'alice-id',
      soundId: 'custom-2',
      name: 'Air Horn',
      url: 'http://localhost:3001/uploads/sounds/air-horn.mp3',
      slotIndex: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.soundboardSlots[5]).toBe('custom-2');
  });

  it('sound:upload rejects an out-of-range slotIndex as malformed', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'table-2g', playerId: 'alice-id', playerName: 'Alice' });

    const result = await soundUploadAck(alice, {
      sessionId: 'table-2g',
      playerId: 'alice-id',
      soundId: 'custom-3',
      name: 'Air Horn',
      url: 'http://localhost:3001/uploads/sounds/air-horn.mp3',
      slotIndex: 16, // valid indices are 0..15
    });
    expect(result.ok).toBe(false);
  });

  it("a muted player's state is seen live by everyone in the session", async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    clients.push(alice, bob);

    await joinAck(alice, { sessionId: 'table-3', playerId: 'alice-id', playerName: 'Alice' });
    await joinAck(bob, { sessionId: 'table-3', playerId: 'bob-id', playerName: 'Bob' });
    // Let Bob's own join broadcast fully drain before listening for the
    // *next* one — otherwise a once() registered here can catch that
    // already-in-flight broadcast instead of the mute-triggered one.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const aliceSeesBobMuted = new Promise((resolve) =>
      alice.once(SocketEvent.SessionState, resolve),
    );

    // Bob mutes himself (self-service, not host-gated).
    const result = await muteAck(bob, {
      sessionId: 'table-3',
      playerId: 'bob-id',
      targetPlayerId: 'bob-id',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.find((p) => p.id === 'bob-id')?.muted).toBe(true);

    const broadcast = (await aliceSeesBobMuted) as { players: { id: string; muted: boolean }[] };
    expect(broadcast.players.find((p) => p.id === 'bob-id')?.muted).toBe(true);
  });

  it('a non-host cannot mute another player, but the host can', async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    const carol = await connect(url);
    clients.push(alice, bob, carol);

    await joinAck(alice, { sessionId: 'table-4', playerId: 'alice-id', playerName: 'Alice' });
    await joinAck(bob, { sessionId: 'table-4', playerId: 'bob-id', playerName: 'Bob' });
    await joinAck(carol, { sessionId: 'table-4', playerId: 'carol-id', playerName: 'Carol' });

    const bobMutesCarol = await muteAck(bob, {
      sessionId: 'table-4',
      playerId: 'bob-id',
      targetPlayerId: 'carol-id',
    });
    expect(bobMutesCarol).toEqual({ ok: false, error: 'Only the host can mute another player.' });

    const aliceMutesCarol = await muteAck(alice, {
      sessionId: 'table-4',
      playerId: 'alice-id',
      targetPlayerId: 'carol-id',
    });
    expect(aliceMutesCarol.ok).toBe(true);
  });

  it('rejects malformed sound/mute payloads with an error ack instead of crashing', async () => {
    const alice = await connect(url);
    clients.push(alice);
    await joinAck(alice, { sessionId: 'table-5', playerId: 'alice-id', playerName: 'Alice' });

    const badSound = await soundPlayAck(alice, { sessionId: 'table-5', playerId: 'alice-id' });
    expect(badSound.ok).toBe(false);

    const badMute = await muteAck(alice, { sessionId: 'table-5', playerId: 'alice-id' });
    expect(badMute.ok).toBe(false);

    // The server must still be alive and answering normal requests afterward.
    const followUp = await soundPlayAck(alice, {
      sessionId: 'table-5',
      playerId: 'alice-id',
      soundId: 'bell',
    });
    expect(followUp.ok).toBe(true);
  });
});
