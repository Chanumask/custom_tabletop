import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Socket } from 'socket.io-client';
import {
  SocketEvent,
  DEFAULT_SPAWN_POSITION,
  type Player,
  type PlayerMoveRequest,
} from '@custom-tabletop/shared';
import { loadRoom } from './RoomLoader.js';
import { FirstPersonController } from './FirstPersonController.js';
import { addRoomLighting, configureRoomToneMapping } from './RoomLighting.js';
import { PlayerAvatars } from './PlayerAvatars.js';

const ROOM_GLTF_URL = '/models/room.glb';
// Throttle: enough for smooth-looking remote avatars without flooding the
// socket (docs/engineering/architecture.md, "Performance" — deltas, not a
// broadcast on every frame).
const MOVE_SEND_INTERVAL_MS = 100;
const MOVE_POSITION_EPSILON = 0.01;
const MOVE_ROTATION_EPSILON = 0.01;

export interface RoomViewProps {
  socket: Socket;
  sessionId: string;
  playerId: string;
  players: Player[];
}

/** Full first-person view of the room: renders the real Blender-exported
 * room (`public/models/room.glb`, see docs/engineering/blender-workflow.md)
 * via `loadRoom`'s `gltfUrl` option, drives WASD + mouse-look movement
 * through `FirstPersonController`, and renders/moves every other connected
 * player as a placeholder capsule avatar (`PlayerAvatars`, Milestone 4).
 * Click-to-lock, Esc (browser default) to release. */
export function RoomView({ socket, sessionId, playerId, players }: RoomViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<FirstPersonController | null>(null);
  const avatarsRef = useRef<PlayerAvatars | null>(null);
  const playersRef = useRef<Player[]>(players);
  const [locked, setLocked] = useState(false);

  // Membership (who has an avatar at all) is driven by GameState.players —
  // infrequent (join/leave only). Live movement between snapshots comes
  // from player:move broadcasts instead, handled inside the effect below.
  useEffect(() => {
    playersRef.current = players;
    avatarsRef.current?.sync(players, playerId);
  }, [players, playerId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let disposed = false;
    let animationFrameId = 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1410);

    const camera = new THREE.PerspectiveCamera(
      70,
      Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
      0.1,
      100,
    );
    camera.position.set(
      DEFAULT_SPAWN_POSITION.x,
      DEFAULT_SPAWN_POSITION.y,
      DEFAULT_SPAWN_POSITION.z,
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    configureRoomToneMapping(renderer);
    container.appendChild(renderer.domElement);

    const clock = new THREE.Clock();

    const handleResize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    const handleRemoteMove = (move: PlayerMoveRequest) => {
      avatarsRef.current?.updateOne(move.playerId, move.position, move.rotationY);
    };
    socket.on(SocketEvent.PlayerMove, handleRemoteMove);

    void loadRoom({ gltfUrl: ROOM_GLTF_URL }).then((room) => {
      if (disposed) {
        return;
      }
      scene.add(room.object3D);
      addRoomLighting(scene, room.layout);

      const avatars = new PlayerAvatars(scene);
      avatars.sync(playersRef.current, playerId);
      avatarsRef.current = avatars;

      const controller = new FirstPersonController({
        camera,
        domElement: renderer.domElement,
        room: room.layout.bounds,
        table: room.layout.table,
      });
      controller.connect();
      controller.controls.addEventListener('lock', () => setLocked(true));
      controller.controls.addEventListener('unlock', () => setLocked(false));
      controllerRef.current = controller;

      let lastSentAt = 0;
      const lastSentPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
      let lastSentYaw = Infinity;

      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        controller.update(clock.getDelta());
        renderer.render(scene, camera);

        const now = performance.now();
        if (now - lastSentAt < MOVE_SEND_INTERVAL_MS) {
          return;
        }
        const yaw = controller.getYaw();
        const moved =
          camera.position.distanceTo(lastSentPosition) > MOVE_POSITION_EPSILON ||
          Math.abs(yaw - lastSentYaw) > MOVE_ROTATION_EPSILON;
        if (!moved) {
          return;
        }
        lastSentAt = now;
        lastSentPosition.copy(camera.position);
        lastSentYaw = yaw;
        socket.emit(SocketEvent.PlayerMove, {
          sessionId,
          playerId,
          position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          rotationY: yaw,
        } satisfies PlayerMoveRequest);
      };
      animate();
    });

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      socket.off(SocketEvent.PlayerMove, handleRemoteMove);
      cancelAnimationFrame(animationFrameId);
      controllerRef.current?.dispose();
      controllerRef.current = null;
      avatarsRef.current?.dispose();
      avatarsRef.current = null;
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [socket, sessionId, playerId]);

  return (
    <div ref={containerRef} className="room-view">
      {!locked && (
        <button
          type="button"
          className="room-view-overlay"
          onClick={() => controllerRef.current?.controls.lock()}
        >
          Click to look around
          <br />
          WASD to move · mouse to look · Esc to release
        </button>
      )}
    </div>
  );
}
