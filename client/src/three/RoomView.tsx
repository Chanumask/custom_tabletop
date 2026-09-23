import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Socket } from 'socket.io-client';
import {
  SocketEvent,
  DEFAULT_SPAWN_POSITION,
  type Player,
  type PlayerMoveRequest,
  type Scene as GameScene,
  type DrawingStartRequest,
  type DrawingUpdateRequest,
  type DrawingEndRequest,
  type DrawingDeleteRequest,
} from '@custom-tabletop/shared';
import { loadRoom } from './RoomLoader.js';
import { FirstPersonController } from './FirstPersonController.js';
import { addRoomLighting, configureRoomToneMapping } from './RoomLighting.js';
import { PlayerAvatars } from './PlayerAvatars.js';
import { TableCanvas } from './TableCanvas.js';
import { TableDrawing } from './TableDrawing.js';
import { remapTableTopUV } from './tableTopUV.js';

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
  activeScene: GameScene;
}

/** Full first-person view of the room: renders the real Blender-exported
 * room (`public/models/room.glb`, see docs/engineering/blender-workflow.md)
 * via `loadRoom`'s `gltfUrl` option, drives WASD + mouse-look movement
 * through `FirstPersonController`, renders/moves every other connected
 * player as a placeholder capsule avatar (`PlayerAvatars`, Milestone 4),
 * and renders the active scene's background/drawings as a `CanvasTexture`
 * on the table (`TableCanvas`/`TableDrawing`, Milestone 5). Click-to-lock,
 * Esc (browser default) to release; drawing only while not locked. */
export function RoomView({ socket, sessionId, playerId, players, activeScene }: RoomViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<FirstPersonController | null>(null);
  const avatarsRef = useRef<PlayerAvatars | null>(null);
  const playersRef = useRef<Player[]>(players);
  const tableCanvasRef = useRef<TableCanvas | null>(null);
  const activeSceneRef = useRef<GameScene>(activeScene);
  const lastRedrawnSignatureRef = useRef<string>('');
  const [locked, setLocked] = useState(false);

  // Membership (who has an avatar at all) is driven by GameState.players —
  // infrequent (join/leave only). Live movement between snapshots comes
  // from player:move broadcasts instead, handled inside the effect below.
  useEffect(() => {
    playersRef.current = players;
    avatarsRef.current?.sync(players, playerId);
  }, [players, playerId]);

  // Same split as player avatars: a full redraw only when the scene itself
  // or its background actually changes (join/create/change/update), not on
  // every session:state broadcast — join/leave broadcasts also carry the
  // active scene, but with the same id/background, so the signature check
  // below skips a redundant redraw (and background-image reload) for those.
  // Point-by-point drawing updates go through the drawing:* socket
  // listeners inside the effect below instead, applied directly to the
  // canvas without a full redraw.
  useEffect(() => {
    activeSceneRef.current = activeScene;
    const signature = `${activeScene.id}|${activeScene.backgroundImage}`;
    if (signature !== lastRedrawnSignatureRef.current) {
      lastRedrawnSignatureRef.current = signature;
      void tableCanvasRef.current?.redraw(activeScene);
    }
  }, [activeScene]);

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

    // Live, point-by-point stroke updates from other players — a full
    // scene redraw is for background/membership changes (the effect
    // above), not for this.
    const handleDrawingStart = (request: DrawingStartRequest) => {
      tableCanvasRef.current?.extendStroke(request.drawingId, request.point);
    };
    const handleDrawingUpdate = (request: DrawingUpdateRequest) => {
      tableCanvasRef.current?.extendStroke(request.drawingId, request.point);
    };
    const handleDrawingEnd = (request: DrawingEndRequest) => {
      tableCanvasRef.current?.endStroke(request.drawingId);
    };
    const handleDrawingDelete = (request: DrawingDeleteRequest) => {
      tableCanvasRef.current?.endStroke(request.drawingId);
      void tableCanvasRef.current?.redraw(activeSceneRef.current);
    };
    socket.on(SocketEvent.DrawingStart, handleDrawingStart);
    socket.on(SocketEvent.DrawingUpdate, handleDrawingUpdate);
    socket.on(SocketEvent.DrawingEnd, handleDrawingEnd);
    socket.on(SocketEvent.DrawingDelete, handleDrawingDelete);

    let tableDrawing: TableDrawing | null = null;

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

      const tableTopMesh = room.object3D.getObjectByName('Table_Top');
      if (tableTopMesh instanceof THREE.Mesh) {
        remapTableTopUV(tableTopMesh, room.layout.table.radius);

        const tableCanvas = new TableCanvas();
        tableTopMesh.material = new THREE.MeshStandardMaterial({
          map: tableCanvas.texture,
          roughness: 0.7,
        });
        lastRedrawnSignatureRef.current = `${activeSceneRef.current.id}|${activeSceneRef.current.backgroundImage}`;
        void tableCanvas.redraw(activeSceneRef.current);
        tableCanvasRef.current = tableCanvas;

        let currentDrawingId: string | null = null;
        tableDrawing = new TableDrawing({
          camera,
          domElement: renderer.domElement,
          tableTopMesh,
          table: room.layout.table,
          isDrawingAllowed: () => !controller.controls.isLocked,
          onStrokeStart: (point) => {
            currentDrawingId = crypto.randomUUID();
            tableCanvas.extendStroke(currentDrawingId, point);
            socket.emit(SocketEvent.DrawingStart, {
              sessionId,
              playerId,
              sceneId: activeSceneRef.current.id,
              drawingId: currentDrawingId,
              point,
            } satisfies DrawingStartRequest);
          },
          onStrokePoint: (point) => {
            if (!currentDrawingId) {
              return;
            }
            tableCanvas.extendStroke(currentDrawingId, point);
            socket.emit(SocketEvent.DrawingUpdate, {
              sessionId,
              drawingId: currentDrawingId,
              point,
            } satisfies DrawingUpdateRequest);
          },
          onStrokeEnd: () => {
            if (!currentDrawingId) {
              return;
            }
            tableCanvas.endStroke(currentDrawingId);
            socket.emit(SocketEvent.DrawingEnd, {
              sessionId,
              drawingId: currentDrawingId,
            } satisfies DrawingEndRequest);
            currentDrawingId = null;
          },
        });
        tableDrawing.connect();
      }

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
      socket.off(SocketEvent.DrawingStart, handleDrawingStart);
      socket.off(SocketEvent.DrawingUpdate, handleDrawingUpdate);
      socket.off(SocketEvent.DrawingEnd, handleDrawingEnd);
      socket.off(SocketEvent.DrawingDelete, handleDrawingDelete);
      cancelAnimationFrame(animationFrameId);
      controllerRef.current?.dispose();
      controllerRef.current = null;
      avatarsRef.current?.dispose();
      avatarsRef.current = null;
      tableDrawing?.dispose();
      tableCanvasRef.current?.dispose();
      tableCanvasRef.current = null;
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
          Click to look around (WASD to move · Esc to release)
          <br />
          or click-drag on the table to draw
        </button>
      )}
    </div>
  );
}
