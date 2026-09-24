import { useCallback, useEffect, useRef, useState } from 'react';
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
  type Dice,
  type SoundState,
  type PlayerEmoteRequest,
  EMOTES,
} from '@custom-tabletop/shared';
import { loadRoom } from './RoomLoader.js';
import { FirstPersonController } from './FirstPersonController.js';
import {
  addRoomLighting,
  configureRoomToneMapping,
  setRoomLightsOn,
  type RoomLights,
} from './RoomLighting.js';
import { PlayerAvatars } from './PlayerAvatars.js';
import { CharacterLibrary } from './characters.js';
import { isTypingTarget } from '../keyboard.js';
import { TableCanvas } from './TableCanvas.js';
import { TableDrawing } from './TableDrawing.js';
import { remapTableTopUV } from './tableTopUV.js';
import { DiceManager } from './DiceManager.js';
import {
  createLamp,
  setLampOn,
  disposeLamp,
  LAMP_POSITION,
  LAMP_RANGE,
  type RoomLamp,
} from './RoomLamp.js';
import { SoundboardWall } from './SoundboardWall.js';
import { nearestInteractable, type Interactable } from './interaction.js';
import { findStrokeNear } from './eraser.js';
import { formatKeyCode } from '../keyLabel.js';
import { isInteractKeyPress } from '../keyboard.js';
import { SoundboardAssignMenu } from '../SoundboardAssignMenu.js';

const ROOM_GLTF_URL = '/models/room.glb';
// Module-level so each character model downloads once per page, not once
// per room mount (leaving and rejoining a session reuses it).
const characterLibrary = new CharacterLibrary();
// Throttle: enough for smooth-looking remote avatars without flooding the
// socket (docs/engineering/architecture.md, "Performance" — deltas, not a
// broadcast on every frame).
const MOVE_SEND_INTERVAL_MS = 100;
const MAX_FRAME_SECONDS = 0.1;
const MOVE_POSITION_EPSILON = 0.01;
const MOVE_ROTATION_EPSILON = 0.01;
// How far past the table's own edge still counts as "approaching" it for
// the sit-down interactable (Milestone 8).
const TABLE_APPROACH_MARGIN = 1.3;
// The table surface is unlit (it shows the map image in its true colors);
// with the room light off it's dimmed to this instead, so it doesn't glow.
const TABLE_DIMMED_BRIGHTNESS = 0.18;
// Canvas-pixel click tolerance for the eraser tool — the table canvas is
// TABLE_CANVAS_SIZE px across the table's full 2*radius diameter, so this is
// a generous few centimetres on the real table surface.
const ERASE_THRESHOLD = 20;
const DEFAULT_DRAW_COLOR = '#241a12';
const DEFAULT_DRAW_WIDTH = 5;

type DrawTool = 'pen' | 'eraser';

/** Switches between the normal full-viewport camera and a square one
 * (Milestone 8's seated table view — "full screen" for a round table reads
 * best as a square frame, not a letterboxed widescreen one). */
function applyViewportSize(
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  container: HTMLElement,
  seated: boolean,
): void {
  const width = Math.max(container.clientWidth, 1);
  const height = Math.max(container.clientHeight, 1);
  if (seated) {
    const size = Math.min(width, height);
    camera.aspect = 1;
    renderer.setSize(size, size);
  } else {
    camera.aspect = width / height;
    renderer.setSize(width, height);
  }
  camera.updateProjectionMatrix();
}

export interface RoomViewProps {
  socket: Socket;
  sessionId: string;
  playerId: string;
  players: Player[];
  activeScene: GameScene;
  dice: Dice[];
  lightOn: boolean;
  soundboard: SoundState[];
  /** Slot index -> assigned sound id or null (Milestone 8 follow-up's wall
   * board — see shared/src/types.ts). */
  soundboardSlots: (string | null)[];
  /** A `KeyboardEvent.code` value (Milestone 10 follow-up, user-rebindable
   * via Settings) — which key triggers the nearest interactable. */
  interactKey: string;
  onPlaySound: (soundId: string) => void;
  onObjectInteract: (objectId: string) => void;
  /** Registers a newly-uploaded/linked sound into the shared soundboard —
   * shared with the 2D panel's own upload form (SessionView.tsx), which
   * never passes `slotIndex`. Passing one (from the wall board's assign
   * menu) also assigns the sound to that physical button in the same round
   * trip. */
  onUploadSound: (name: string, url: string, slotIndex?: number) => void;
  /** Put an existing sound on a wall button, or clear it (null). */
  onAssignSlot: (slotIndex: number, soundId: string | null) => void;
  /** Short on-screen feedback (e.g. "You wave"). */
  onNotify: (text: string) => void;
}

function promptFor(
  nearestId: string | null,
  seated: boolean,
  interactKey: string,
  boardTarget: { slotIndex: number; soundName: string | null } | null,
): string | null {
  const keyLabel = formatKeyCode(interactKey);
  if (seated) {
    return `Press ${keyLabel} to stand up`;
  }
  if (boardTarget) {
    return boardTarget.soundName
      ? `Press ${keyLabel} to play "${boardTarget.soundName}" · Shift+${keyLabel} to change it`
      : `Press ${keyLabel} to put a sound on this button`;
  }
  if (nearestId === 'light') {
    return `Press ${keyLabel} to switch the light on/off`;
  }
  if (nearestId === 'table') {
    return `Press ${keyLabel} to sit at the table`;
  }
  return null;
}

/** Full first-person view of the room: renders the real Blender-exported
 * room (`public/models/room.glb`, see docs/engineering/blender-workflow.md)
 * via `loadRoom`'s `gltfUrl` option, drives WASD + mouse-look movement
 * through `FirstPersonController`, renders/moves every other connected
 * player as a placeholder capsule avatar (`PlayerAvatars`, Milestone 4),
 * renders the active scene's background/drawings as a `CanvasTexture` on
 * the table (`TableCanvas`/`TableDrawing`, Milestone 5), renders/animates
 * dice on the table (`DiceManager`, Milestone 6), and renders the room's
 * interactables — a light switch and the table's sit-down mode
 * (`RoomLamp`/`FirstPersonController.sit`/`stand`, Milestone 8, proximity +
 * E) plus a wall-mounted 4x4 soundboard (`SoundboardWall`, Milestone 8
 * follow-up, reusing `sound:play`/`sound:upload`) triggered by *aiming* at a
 * specific button and pressing E — proximity alone can't disambiguate which
 * of 16 buttons on a flat wall a player means, so this one raycasts from the
 * camera's own look direction instead of XZ distance. Pressing E on a filled
 * button plays its sound for everyone; on an empty one it opens
 * `SoundboardAssignMenu`, a DOM overlay for attaching a sound via link or
 * upload. Click-to-lock, Esc (browser default) to release; drawing only
 * while not locked. The light/table proximity interactables trigger via E
 * regardless of lock state (unchanged from Milestone 8); the board's
 * aim-based targeting only makes sense while actively looking around, so it
 * only resolves while pointer-locked. Sitting switches the viewport to a
 * square, table-filling
 * frame (`applyViewportSize`) and shows a small drawing toolbar (pen
 * color/size, plus an eraser reusing `drawing:delete` via a stroke hit-test,
 * `eraser.ts`) alongside it. */
export function RoomView({
  socket,
  sessionId,
  playerId,
  players,
  activeScene,
  dice,
  lightOn,
  soundboard,
  soundboardSlots,
  interactKey,
  onPlaySound,
  onObjectInteract,
  onUploadSound,
  onAssignSlot,
  onNotify,
}: RoomViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<FirstPersonController | null>(null);
  const avatarsRef = useRef<PlayerAvatars | null>(null);
  const playersRef = useRef<Player[]>(players);
  const playerIdRef = useRef<string>(playerId);
  const tableCanvasRef = useRef<TableCanvas | null>(null);
  const activeSceneRef = useRef<GameScene>(activeScene);
  const lastRedrawnSignatureRef = useRef<string>('');
  const diceManagerRef = useRef<DiceManager | null>(null);
  const diceRef = useRef<Dice[]>(dice);
  const roomLightsRef = useRef<RoomLights | null>(null);
  const lampRef = useRef<RoomLamp | null>(null);
  const lightOnRef = useRef<boolean>(lightOn);
  const tableMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const soundboardRef = useRef<SoundState[]>(soundboard);
  const soundboardSlotsRef = useRef<(string | null)[]>(soundboardSlots);
  const soundboardWallRef = useRef<SoundboardWall | null>(null);
  const interactablesRef = useRef<Interactable[]>([]);
  const nearestInteractableIdRef = useRef<string | null>(null);
  // The wall board's targeted slot (aim-based, recomputed every frame in
  // the animate loop below) — separate from nearestInteractableIdRef, which
  // only ever holds the light/table's proximity-based ids.
  const boardTargetSlotRef = useRef<number | null>(null);
  // Deduped separately from nearestInteractableIdRef: sitting down keeps
  // that ref at 'table' (it's still what E would toggle), but the prompt
  // text itself must still change from "sit" to "stand up" — a plain
  // nearestId-only comparison would miss that transition since the id
  // doesn't change, only `seated` does.
  const lastPromptKeyRef = useRef<string>('');
  const onPlaySoundRef = useRef(onPlaySound);
  const onObjectInteractRef = useRef(onObjectInteract);
  const onUploadSoundRef = useRef(onUploadSound);
  const onNotifyRef = useRef(onNotify);
  const interactKeyRef = useRef(interactKey);
  const [locked, setLocked] = useState(false);
  const [seated, setSeated] = useState(false);
  const [interactionPrompt, setInteractionPrompt] = useState<string | null>(null);
  // The wall board's assign-sound overlay (Milestone 8 follow-up) — set to
  // the empty slot's index while open, null otherwise. Mirrored into a ref
  // for the same reason every other per-frame-read value here is (the mount
  // effect's closures only run once and would otherwise see a stale value).
  const [assignSlotIndex, setAssignSlotIndex] = useState<number | null>(null);
  const assignSlotIndexRef = useRef<number | null>(null);
  // The drawing toolbar (Milestone 8, shown only while seated) — local UI
  // preference, not shared GameState; mirrored into refs so the mount
  // effect's closures (registered once) always read the current value
  // instead of a stale one from when they were created.
  const [drawTool, setDrawTool] = useState<DrawTool>('pen');
  const [drawColor, setDrawColor] = useState(DEFAULT_DRAW_COLOR);
  const [drawWidth, setDrawWidth] = useState(DEFAULT_DRAW_WIDTH);
  // Stable identity so the assign menu's Escape listener isn't re-registered
  // on every RoomView render.
  const closeAssignMenu = useCallback(() => setAssignSlotIndex(null), []);
  const drawToolRef = useRef<DrawTool>(drawTool);
  const drawColorRef = useRef(drawColor);
  const drawWidthRef = useRef(drawWidth);

  // Membership (who has an avatar at all) is driven by GameState.players —
  // infrequent (join/leave only). Live movement between snapshots comes
  // from player:move broadcasts instead, handled inside the effect below.
  useEffect(() => {
    playersRef.current = players;
    avatarsRef.current?.sync(players, playerId);
  }, [players, playerId]);

  useEffect(() => {
    playerIdRef.current = playerId;
  }, [playerId]);

  useEffect(() => {
    onPlaySoundRef.current = onPlaySound;
  }, [onPlaySound]);

  useEffect(() => {
    onObjectInteractRef.current = onObjectInteract;
  }, [onObjectInteract]);

  useEffect(() => {
    onUploadSoundRef.current = onUploadSound;
  }, [onUploadSound]);

  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);

  useEffect(() => {
    interactKeyRef.current = interactKey;
  }, [interactKey]);

  useEffect(() => {
    assignSlotIndexRef.current = assignSlotIndex;
  }, [assignSlotIndex]);

  useEffect(() => {
    drawToolRef.current = drawTool;
  }, [drawTool]);

  useEffect(() => {
    drawColorRef.current = drawColor;
  }, [drawColor]);

  useEffect(() => {
    drawWidthRef.current = drawWidth;
  }, [drawWidth]);

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
      void tableCanvasRef.current?.redraw(activeScene, () => activeSceneRef.current.drawings);
    }
  }, [activeScene]);

  // Dice (Milestone 6): spawn/roll/remove all arrive via the same
  // GameState.dice snapshot (no separate delta channel like player:move),
  // so a single sync per change covers membership and live roll results.
  useEffect(() => {
    diceRef.current = dice;
    diceManagerRef.current?.sync(dice);
  }, [dice]);

  // The room light (Milestone 8) is a session-wide flag, applied to both
  // the ambient/point lights (RoomLighting.ts) and the lamp prop's own
  // material (RoomLamp.ts) so the toggle reads clearly even before the
  // player's eyes adjust to the overall brightness change.
  useEffect(() => {
    lightOnRef.current = lightOn;
    if (roomLightsRef.current) {
      setRoomLightsOn(roomLightsRef.current, lightOn);
    }
    if (lampRef.current) {
      setLampOn(lampRef.current, lightOn);
    }
    tableMaterialRef.current?.color.setScalar(lightOn ? 1 : TABLE_DIMMED_BRIGHTNESS);
  }, [lightOn]);

  // The wall board (Milestone 8 follow-up) is presentation only — it just
  // mirrors GameState.soundboard/soundboardSlots the same way the 2D panel
  // mirrors soundboard, reusing sound:play/sound:upload entirely.
  useEffect(() => {
    soundboardRef.current = soundboard;
    soundboardSlotsRef.current = soundboardSlots;
    soundboardWallRef.current?.sync(soundboard, soundboardSlots);
  }, [soundboard, soundboardSlots]);

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
    // Capped: past 2x the extra pixels cost a lot of GPU for no visible gain.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    configureRoomToneMapping(renderer);
    container.appendChild(renderer.domElement);

    const clock = new THREE.Clock();

    const handleResize = () => {
      applyViewportSize(camera, renderer, container, controllerRef.current?.isSeated ?? false);
    };
    window.addEventListener('resize', handleResize);

    const handleRemoteMove = (move: PlayerMoveRequest) => {
      avatarsRef.current?.updateOne(move.playerId, move.position, move.rotationY);
    };
    socket.on(SocketEvent.PlayerMove, handleRemoteMove);

    const handleRemoteEmote = (request: PlayerEmoteRequest) => {
      avatarsRef.current?.playEmote(request.playerId, request.emote);
    };
    socket.on(SocketEvent.PlayerEmote, handleRemoteEmote);

    // Live, point-by-point stroke updates from other players — a full
    // scene redraw is for background/membership changes (the effect
    // above), not for this.
    // Keeps activeSceneRef.current.drawings up to date in real time for
    // *other* players' strokes too, not just the visible canvas texture —
    // drawing:* has no accompanying session:state broadcast, so without
    // this a freshly (remote-)drawn stroke would be invisible to anything
    // that reads activeSceneRef.current.drawings (the eraser's hit-test)
    // until an unrelated broadcast happened to refresh it.
    const handleDrawingStart = (request: DrawingStartRequest) => {
      tableCanvasRef.current?.extendStroke(request.drawingId, request.point, {
        color: request.color,
        width: request.width,
      });
      activeSceneRef.current = {
        ...activeSceneRef.current,
        drawings: [
          ...activeSceneRef.current.drawings,
          {
            id: request.drawingId,
            sceneId: request.sceneId,
            playerId: request.playerId,
            points: [request.point],
            color: request.color,
            width: request.width,
          },
        ],
      };
    };
    const handleDrawingUpdate = (request: DrawingUpdateRequest) => {
      tableCanvasRef.current?.extendStroke(request.drawingId, request.point);
      activeSceneRef.current = {
        ...activeSceneRef.current,
        drawings: activeSceneRef.current.drawings.map((drawing) =>
          drawing.id === request.drawingId
            ? { ...drawing, points: [...drawing.points, request.point] }
            : drawing,
        ),
      };
    };
    const handleDrawingEnd = (request: DrawingEndRequest) => {
      tableCanvasRef.current?.endStroke(request.drawingId);
    };
    const handleDrawingDelete = (request: DrawingDeleteRequest) => {
      tableCanvasRef.current?.endStroke(request.drawingId);
      // activeSceneRef.current still has the deleted stroke in it — the
      // server applies drawing:delete immediately, but there's no
      // accompanying session:state broadcast that would refresh this
      // client's own copy of the scene (drawing:* is a fire-and-forget
      // delta channel, not the ack+full-broadcast one). Filter it out
      // locally so the redraw below doesn't just repaint the stroke it's
      // meant to remove; a later unrelated session:state (from any other
      // event) will naturally overwrite this with the server's own copy.
      const withoutDeleted = {
        ...activeSceneRef.current,
        drawings: activeSceneRef.current.drawings.filter((d) => d.id !== request.drawingId),
      };
      activeSceneRef.current = withoutDeleted;
      void tableCanvasRef.current?.redraw(withoutDeleted, currentDrawings);
    };
    socket.on(SocketEvent.DrawingStart, handleDrawingStart);
    socket.on(SocketEvent.DrawingUpdate, handleDrawingUpdate);
    socket.on(SocketEvent.DrawingEnd, handleDrawingEnd);
    socket.on(SocketEvent.DrawingDelete, handleDrawingDelete);

    let tableDrawing: TableDrawing | null = null;
    let chandelier: THREE.Object3D | null = null;
    // Everything a full table redraw should paint, read at paint time (see
    // TableCanvas.redraw) so strokes drawn while a map image loads survive.
    const currentDrawings = () => activeSceneRef.current.drawings;

    /** Switches between the standing view and the seated, top-down one:
     * square viewport, and the chandelier hidden (it hangs exactly where the
     * seated camera looks down from). */
    const applySeatedView = (seatedNow: boolean) => {
      applyViewportSize(camera, renderer, container, seatedNow);
      if (chandelier) {
        chandelier.visible = !seatedNow;
      }
      setSeated(seatedNow);
    };
    let handleInteractKey: ((event: KeyboardEvent) => void) | null = null;
    let handleEmoteKey: ((event: KeyboardEvent) => void) | null = null;

    void loadRoom(ROOM_GLTF_URL).then((room) => {
      if (disposed) {
        return;
      }
      scene.add(room.object3D);
      chandelier = room.chandelier;
      const lights = addRoomLighting(scene, room.layout);
      setRoomLightsOn(lights, lightOnRef.current);
      roomLightsRef.current = lights;

      const lamp = createLamp(scene, 0);
      setLampOn(lamp, lightOnRef.current);
      lampRef.current = lamp;

      const soundboardWall = new SoundboardWall(scene, 0);
      soundboardWall.sync(soundboardRef.current, soundboardSlotsRef.current);
      soundboardWallRef.current = soundboardWall;

      interactablesRef.current = [
        { id: 'light', position: LAMP_POSITION, range: LAMP_RANGE },
        {
          id: 'table',
          position: { x: room.layout.table.center.x, z: room.layout.table.center.z },
          range:
            Math.max(room.layout.table.halfWidth, room.layout.table.halfDepth) +
            TABLE_APPROACH_MARGIN,
        },
      ];

      const avatars = new PlayerAvatars(scene, characterLibrary, room.seats);
      avatars.sync(playersRef.current, playerId);
      avatarsRef.current = avatars;

      const diceManager = new DiceManager(scene);
      diceManager.sync(diceRef.current);
      diceManagerRef.current = diceManager;

      const controller = new FirstPersonController({
        camera,
        domElement: renderer.domElement,
        room: room.layout.bounds,
        obstacles: room.layout.obstacles,
        table: room.layout.table,
      });
      controller.connect();
      controller.controls.addEventListener('lock', () => setLocked(true));
      controller.controls.addEventListener('unlock', () => setLocked(false));
      controllerRef.current = controller;

      // Dev-only automation hook: browsers refuse pointer lock to scripted
      // clicks, so automated/live verification (docs/decisions.md, M8)
      // drives the camera through this instead. Compiled out of production
      // builds by Vite's `import.meta.env.DEV` constant.
      if (import.meta.env.DEV) {
        (window as unknown as { __tabletop?: unknown }).__tabletop = {
          camera,
          controller,
          scene,
          renderer,
          avatars,
        };
      }

      // Reconciles a rejoin/reload while GameState already has this player
      // seated (a lingering flag — a disconnect doesn't clear it, same as
      // every other per-player status): without this, the fresh controller
      // would start standing while the server still thinks they're seated,
      // and the next E-press would incorrectly toggle the server *back* to
      // standing instead of sitting the rejoined player down.
      if (playersRef.current.find((candidate) => candidate.id === playerId)?.seated) {
        controller.sit();
      }
      applySeatedView(controller.isSeated);

      const tableTopMesh = room.tableTop;
      if (tableTopMesh) {
        remapTableTopUV(tableTopMesh, room.layout.table);

        const tableCanvas = new TableCanvas();
        tableCanvas.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        // Unlit and outside tone mapping on purpose: the map image shows in
        // exactly its own colors, instead of being tinted by the warm lamps
        // and compressed by the filmic tone curve like every lit surface.
        const tableMaterial = new THREE.MeshBasicMaterial({
          map: tableCanvas.texture,
          toneMapped: false,
        });
        tableMaterial.color.setScalar(lightOnRef.current ? 1 : TABLE_DIMMED_BRIGHTNESS);
        tableTopMesh.material = tableMaterial;
        tableMaterialRef.current = tableMaterial;
        lastRedrawnSignatureRef.current = `${activeSceneRef.current.id}|${activeSceneRef.current.backgroundImage}`;
        void tableCanvas.redraw(activeSceneRef.current, currentDrawings);
        tableCanvasRef.current = tableCanvas;

        let currentDrawingId: string | null = null;
        tableDrawing = new TableDrawing({
          camera,
          domElement: renderer.domElement,
          tableTopMesh,
          table: room.layout.table,
          isDrawingAllowed: () => !controller.controls.isLocked,
          getTool: () => drawToolRef.current,
          onStrokeStart: (point) => {
            currentDrawingId = crypto.randomUUID();
            const color = drawColorRef.current;
            const width = drawWidthRef.current;
            tableCanvas.extendStroke(currentDrawingId, point, { color, width });
            // Same reasoning as handleDrawingStart's remote-side copy of
            // this: drawing:start has no accompanying session:state, so
            // this player's own freshly-drawn stroke has to be added to
            // activeSceneRef.current.drawings by hand, right away — not
            // just left to arrive from an unrelated later broadcast — or
            // the eraser can't find it.
            activeSceneRef.current = {
              ...activeSceneRef.current,
              drawings: [
                ...activeSceneRef.current.drawings,
                {
                  id: currentDrawingId,
                  sceneId: activeSceneRef.current.id,
                  playerId,
                  points: [point],
                  color,
                  width,
                },
              ],
            };
            socket.emit(SocketEvent.DrawingStart, {
              sessionId,
              playerId,
              sceneId: activeSceneRef.current.id,
              drawingId: currentDrawingId,
              point,
              color,
              width,
            } satisfies DrawingStartRequest);
          },
          onStrokePoint: (point) => {
            if (!currentDrawingId) {
              return;
            }
            tableCanvas.extendStroke(currentDrawingId, point);
            const drawingId = currentDrawingId;
            activeSceneRef.current = {
              ...activeSceneRef.current,
              drawings: activeSceneRef.current.drawings.map((drawing) =>
                drawing.id === drawingId
                  ? { ...drawing, points: [...drawing.points, point] }
                  : drawing,
              ),
            };
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
          onErase: (point) => {
            const hitId = findStrokeNear(point, activeSceneRef.current.drawings, ERASE_THRESHOLD);
            if (!hitId) {
              return;
            }
            tableCanvas.endStroke(hitId);
            // Local-optimistic removal, same reasoning as handleDrawingDelete
            // above: no session:state accompanies drawing:delete, so this
            // client has to update its own copy of the scene itself.
            const withoutErased = {
              ...activeSceneRef.current,
              drawings: activeSceneRef.current.drawings.filter((d) => d.id !== hitId),
            };
            activeSceneRef.current = withoutErased;
            void tableCanvas.redraw(withoutErased, currentDrawings);
            socket.emit(SocketEvent.DrawingDelete, {
              sessionId,
              sceneId: activeSceneRef.current.id,
              drawingId: hitId,
            } satisfies DrawingDeleteRequest);
          },
        });
        tableDrawing.connect();
      }

      // Proximity + E (Milestone 8) for the light and the table; aim + E
      // (Milestone 8 follow-up) for the wall board's individual buttons —
      // see the raycastFromCamera call in the animate loop below for why the
      // board needs a different targeting model than a single toggle does.
      handleInteractKey = (event: KeyboardEvent) => {
        if (!isInteractKeyPress(event, interactKeyRef.current)) {
          return;
        }
        // The assign-sound overlay is a normal DOM form; while it's open,
        // the interact key should type into it (or do nothing) like any
        // other key, not re-trigger room interactions underneath it.
        if (assignSlotIndexRef.current !== null) {
          return;
        }
        if (controller.isSeated) {
          controller.stand();
          applySeatedView(false);
          onObjectInteractRef.current('table');
          return;
        }
        const targetedSlot = boardTargetSlotRef.current;
        if (targetedSlot !== null) {
          const soundId = soundboardWallRef.current?.getSlotSoundId(targetedSlot) ?? null;
          if (soundId && !event.shiftKey) {
            onPlaySoundRef.current(soundId);
          } else {
            // Empty button, or Shift+interact on a filled one: configure it.
            controller.controls.unlock();
            setAssignSlotIndex(targetedSlot);
          }
          return;
        }
        const nearestId = nearestInteractableIdRef.current;
        if (nearestId === 'light') {
          onObjectInteractRef.current('light');
        } else if (nearestId === 'table') {
          controller.sit();
          applySeatedView(true);
          onObjectInteractRef.current('table');
        }
      };
      document.addEventListener('keydown', handleInteractKey);

      // Emotes on the number keys: everyone else sees this player's
      // character perform it (the local player gets a short confirmation,
      // since they can't see their own avatar from first person).
      handleEmoteKey = (event: KeyboardEvent) => {
        if (event.repeat || isTypingTarget(event.target) || controller.isSeated) {
          return;
        }
        const emote = EMOTES.find((candidate) => candidate.key === event.code);
        if (!emote) {
          return;
        }
        socket.emit(SocketEvent.PlayerEmote, {
          sessionId,
          playerId,
          emote: emote.id,
        } satisfies PlayerEmoteRequest);
        onNotifyRef.current(`${emote.label}!`);
      };
      document.addEventListener('keydown', handleEmoteKey);

      let lastSentAt = 0;
      const lastSentPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
      let lastSentYaw = Infinity;

      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        // Capped: after the tab was hidden, the first frame's delta can be
        // seconds long — one huge step could carry the player past thin
        // furniture (collision checks where a step ends, not the path).
        const delta = Math.min(clock.getDelta(), MAX_FRAME_SECONDS);
        controller.update(delta);
        diceManagerRef.current?.update(delta);
        avatarsRef.current?.update(delta);
        renderer.render(scene, camera);

        const nearest = controller.isSeated
          ? null
          : nearestInteractable(
              { x: camera.position.x, z: camera.position.z },
              interactablesRef.current,
            );
        const nearestId = controller.isSeated ? 'table' : (nearest?.id ?? null);
        nearestInteractableIdRef.current = nearestId;

        // Aim-based, not proximity-based (see the class doc comment) — only
        // resolved while actively looking around and not mid-assign-menu, so
        // a frozen unlocked view (or the menu's own frozen aim) can't keep
        // re-targeting a button behind the scenes.
        const targetedSlot =
          !controller.isSeated &&
          controller.controls.isLocked &&
          assignSlotIndexRef.current === null
            ? (soundboardWallRef.current?.raycastFromCamera(camera) ?? null)
            : null;
        boardTargetSlotRef.current = targetedSlot;
        const boardTarget =
          targetedSlot !== null
            ? {
                slotIndex: targetedSlot,
                soundName:
                  soundboardRef.current.find(
                    (sound) => sound.id === soundboardWallRef.current?.getSlotSoundId(targetedSlot),
                  )?.name ?? null,
              }
            : null;

        const promptKey = `${nearestId}|${controller.isSeated}|${interactKeyRef.current}|${targetedSlot}|${boardTarget?.soundName}`;
        if (promptKey !== lastPromptKeyRef.current) {
          lastPromptKeyRef.current = promptKey;
          setInteractionPrompt(
            promptFor(nearestId, controller.isSeated, interactKeyRef.current, boardTarget),
          );
        }

        // No position to sync while seated — the camera is locked to a
        // fixed top-down view above the table, not the player's real
        // position (FirstPersonController.sit()).
        if (controller.isSeated) {
          return;
        }

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
      socket.off(SocketEvent.PlayerEmote, handleRemoteEmote);
      socket.off(SocketEvent.DrawingStart, handleDrawingStart);
      socket.off(SocketEvent.DrawingUpdate, handleDrawingUpdate);
      socket.off(SocketEvent.DrawingEnd, handleDrawingEnd);
      socket.off(SocketEvent.DrawingDelete, handleDrawingDelete);
      if (handleInteractKey) {
        document.removeEventListener('keydown', handleInteractKey);
      }
      if (handleEmoteKey) {
        document.removeEventListener('keydown', handleEmoteKey);
      }
      cancelAnimationFrame(animationFrameId);
      controllerRef.current?.dispose();
      controllerRef.current = null;
      avatarsRef.current?.dispose();
      avatarsRef.current = null;
      diceManagerRef.current?.dispose();
      diceManagerRef.current = null;
      tableDrawing?.dispose();
      tableCanvasRef.current?.dispose();
      tableCanvasRef.current = null;
      if (lampRef.current) {
        disposeLamp(lampRef.current);
        lampRef.current = null;
      }
      soundboardWallRef.current?.dispose();
      soundboardWallRef.current = null;
      roomLightsRef.current = null;
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [socket, sessionId, playerId]);

  return (
    <div ref={containerRef} className="room-view">
      {locked && !seated && assignSlotIndex === null && <div className="crosshair" />}
      {!locked && !seated && assignSlotIndex === null && (
        <button
          type="button"
          className="room-view-overlay"
          onClick={() => controllerRef.current?.controls.lock()}
        >
          Click to look around (WASD to move · Shift to run · 1–6 to emote · Esc to release)
          <br />
          or click-drag on the table to draw
        </button>
      )}
      {interactionPrompt && assignSlotIndex === null && (
        <div className="interaction-prompt">{interactionPrompt}</div>
      )}
      {assignSlotIndex !== null && (
        <SoundboardAssignMenu
          slotIndex={assignSlotIndex}
          soundboard={soundboard}
          currentSoundId={soundboardSlots[assignSlotIndex] ?? null}
          onAssignExisting={(soundId) => {
            onAssignSlot(assignSlotIndex, soundId);
            setAssignSlotIndex(null);
          }}
          onAddNew={(name, url) => {
            onUploadSoundRef.current(name, url, assignSlotIndex);
            setAssignSlotIndex(null);
          }}
          onClose={closeAssignMenu}
        />
      )}
      {seated && (
        <div className="drawing-toolbar">
          <button
            type="button"
            className={drawTool === 'pen' ? 'active' : ''}
            onClick={() => setDrawTool('pen')}
          >
            Pen
          </button>
          <button
            type="button"
            className={drawTool === 'eraser' ? 'active' : ''}
            onClick={() => setDrawTool('eraser')}
          >
            Eraser
          </button>
          <label>
            Color
            <input
              type="color"
              value={drawColor}
              onChange={(event) => setDrawColor(event.target.value)}
              disabled={drawTool === 'eraser'}
            />
          </label>
          <label>
            Size
            <input
              type="range"
              min={1}
              max={20}
              value={drawWidth}
              onChange={(event) => setDrawWidth(Number(event.target.value))}
              disabled={drawTool === 'eraser'}
            />
          </label>
        </div>
      )}
    </div>
  );
}
