/**
 * A six-player load test (Milestone 10): starts the real server in-process
 * and drives six simulated players through a busy session for a while —
 * everyone moving at 10 Hz, two players drawing continuously, dice pools
 * rolled, chat, pings — then reports what it cost:
 *
 * - the server's event-loop lag (does it keep up?) and CPU time,
 * - what each player receives per second, and the size of the biggest
 *   single message (full-state broadcasts grow with the drawings),
 * - round-trip latency of acknowledged actions (chat, dice rolls).
 *
 * Run: npm run load-test [-- --seconds 20]
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { io as ioClient, type Socket } from 'socket.io-client';
import { SocketEvent, type PlayerColorId } from '@custom-tabletop/shared';
import { createAppServer } from '../server/src/server.js';

const SECONDS = Number(process.argv[process.argv.indexOf('--seconds') + 1]) || 15;
const COLORS: PlayerColorId[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
const SESSION = 'LOAD';

interface Player {
  id: string;
  socket: Socket;
  bytes: number;
  messages: number;
  biggest: number;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

async function main() {
  const app = createAppServer();
  await new Promise<void>((resolve) => app.http.listen(0, resolve));
  const address = app.http.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  const url = `http://localhost:${address.port}`;

  const players: Player[] = [];
  for (const [i, color] of COLORS.entries()) {
    const socket = ioClient(url, { transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    const player: Player = { id: `p${i}`, socket, bytes: 0, messages: 0, biggest: 0 };
    socket.onAny((_event: string, ...args: unknown[]) => {
      const size = JSON.stringify(args).length;
      player.bytes += size;
      player.messages += 1;
      player.biggest = Math.max(player.biggest, size);
    });
    await new Promise((resolve) =>
      socket.emit(
        SocketEvent.SessionJoin,
        {
          sessionId: SESSION,
          playerId: player.id,
          playerName: `Player ${i}`,
          playerToken: `t${i}`,
          color,
        },
        resolve,
      ),
    );
    players.push(player);
  }
  // Two dice each.
  for (const player of players) {
    for (const [k, kind] of (['d20', 'd6'] as const).entries()) {
      await new Promise((resolve) =>
        player.socket.emit(
          SocketEvent.DiceSpawn,
          {
            sessionId: SESSION,
            playerId: player.id,
            diceId: `${player.id}-${k}`,
            kind,
            position: { x: Math.random() - 0.5, y: 0.78, z: Math.random() - 0.5 },
          },
          resolve,
        ),
      );
    }
  }
  players.forEach((player) => {
    player.bytes = 0;
    player.messages = 0;
    player.biggest = 0;
  });

  const lag = monitorEventLoopDelay({ resolution: 10 });
  lag.enable();
  const cpuStart = process.cpuUsage();
  const latencies: { chat: number[]; roll: number[] } = { chat: [], roll: [] };
  const timers: NodeJS.Timeout[] = [];
  const start = Date.now();

  // Everyone walks around at 10 Hz (like the client's MOVE_SEND_INTERVAL).
  for (const [i, player] of players.entries()) {
    timers.push(
      setInterval(() => {
        const t = (Date.now() - start) / 1000 + i;
        player.socket.emit(SocketEvent.PlayerMove, {
          sessionId: SESSION,
          playerId: player.id,
          position: { x: Math.cos(t) * 3, y: 1.7, z: Math.sin(t) * 2.5 },
          rotationY: t,
        });
      }, 100),
    );
  }
  // Two players draw non-stop: a new stroke every 2 s, points at 30 Hz.
  for (const player of players.slice(0, 2)) {
    let stroke = 0;
    let drawingId = '';
    timers.push(
      setInterval(() => {
        const t = Date.now() - start;
        const point = { x: 512 + Math.cos(t / 300) * 300, y: 512 + Math.sin(t / 470) * 300 };
        if (t % 2000 < 34 || !drawingId) {
          drawingId = `${player.id}-stroke-${stroke++}`;
          player.socket.emit(SocketEvent.DrawingStart, {
            sessionId: SESSION,
            playerId: player.id,
            sceneId: 'default',
            drawingId,
            point,
            color: '#223344',
            width: 4,
          });
        } else {
          player.socket.emit(SocketEvent.DrawingUpdate, { sessionId: SESSION, drawingId, point });
        }
      }, 33),
    );
  }
  // Dice pools, chat and pings from the others.
  timers.push(
    setInterval(() => {
      const player = players[2 + Math.floor(Math.random() * 4)]!;
      const sent = performance.now();
      player.socket.emit(
        SocketEvent.DiceRoll,
        { sessionId: SESSION, playerId: player.id, diceIds: [`${player.id}-0`, `${player.id}-1`] },
        () => latencies.roll.push(performance.now() - sent),
      );
    }, 1500),
    setInterval(() => {
      const player = players[Math.floor(Math.random() * players.length)]!;
      const sent = performance.now();
      player.socket.emit(
        SocketEvent.ChatSend,
        {
          sessionId: SESSION,
          playerId: player.id,
          text: Math.random() < 0.3 ? '/roll 2d6+3' : 'onward!',
        },
        () => latencies.chat.push(performance.now() - sent),
      );
    }, 900),
    setInterval(() => {
      const player = players[Math.floor(Math.random() * players.length)]!;
      player.socket.emit(SocketEvent.TablePing, {
        sessionId: SESSION,
        playerId: player.id,
        point: { x: Math.random() * 1024, y: Math.random() * 1024 },
      });
    }, 700),
  );

  await new Promise((resolve) => setTimeout(resolve, SECONDS * 1000));
  timers.forEach(clearInterval);
  lag.disable();
  const cpu = process.cpuUsage(cpuStart);
  const elapsed = (Date.now() - start) / 1000;

  const perPlayer = players.map((player) => ({
    player: player.id,
    'KB/s received': +(player.bytes / 1024 / elapsed).toFixed(1),
    'msgs/s': +(player.messages / elapsed).toFixed(0),
    'biggest msg KB': +(player.biggest / 1024).toFixed(1),
  }));
  console.log(
    `\nSix players, ${elapsed.toFixed(0)} s of moving, drawing, rolling, chatting and pinging\n`,
  );
  console.table(perPlayer);
  console.log(
    'Server event-loop lag (ms): p50',
    (lag.percentile(50) / 1e6).toFixed(1),
    'p99',
    (lag.percentile(99) / 1e6).toFixed(1),
    'max',
    (lag.max / 1e6).toFixed(1),
  );
  console.log(
    'Process CPU (whole test, incl. the six clients):',
    (((cpu.user + cpu.system) / 1e6 / elapsed) * 100).toFixed(0) + '% of one core',
  );
  console.log(
    'Ack latency (ms): chat p50',
    percentile(latencies.chat, 50).toFixed(1),
    'p95',
    percentile(latencies.chat, 95).toFixed(1),
    '| dice roll p50',
    percentile(latencies.roll, 50).toFixed(1),
    'p95',
    percentile(latencies.roll, 95).toFixed(1),
  );

  players.forEach((player) => player.socket.disconnect());
  app.io.close();
  await new Promise<void>((resolve) => app.http.close(() => resolve()));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
