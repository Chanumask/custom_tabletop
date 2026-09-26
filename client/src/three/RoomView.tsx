import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Socket } from 'socket.io-client';
import {
  TABLE_UNITS,
  type Vector3,
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
  type DieKind,
  type LogEntry,
  type ObjectInteractRequest,
  type ObjectInteractResponse,
  type InventoryItem,
  type Photo,
  type Point2D,
  type TablePingRequest,
  playerColorHex,
  type SoundState,
  type PlayerEmoteRequest,
  type SoundPlayRequest,
  type RoomTheme,
  type RoomState,
  type CandleGroup,
  fireLevel,
  type WhiteboardLine,
  EMOTES,
  WHITEBOARD_LINE_COUNT,
  SOUNDS_OFF_ERROR,
  PHOTO_MIN_INTERVAL_MS,
  chairCount,
  LOUNGE_SEATS,
  type LoungeSeat,
  type Drink,
  type Gesture,
  type PlayerGestureRequest,
  type Book,
  type HostAction,
} from '@custom-tabletop/shared';
import { loadRoom } from './RoomLoader.js';
import { FirstPersonController, type SeatedView } from './FirstPersonController.js';
import { pickChair, type Seat } from './avatarMotion.js';
import type { TableChairs } from './tableChairs.js';
import {
  addRoomLighting,
  configureRoomToneMapping,
  setRoomLightsOn,
  tuneRoomMaterials,
  type RoomLights,
} from './RoomLighting.js';
import { PlayerAvatars } from './PlayerAvatars.js';
import { CharacterLibrary } from './characters.js';
import { MiniManager } from './Minis.js';
import { canvasToWorld } from './tableCoordinates.js';
import { throttle } from '../throttle.js';
import { isTypingTarget } from '../keyboard.js';
import { WhiteboardCanvas } from './WhiteboardCanvas.js';
import { WhiteboardEditor } from '../WhiteboardEditor.js';
import { inkColorFor } from '../whiteboardInk.js';
import { TABLE_CANVAS_SIZE, TableCanvas } from './TableCanvas.js';
import { TableDrawing } from './TableDrawing.js';
import { remapTableTopUV } from './tableTopUV.js';
import { DiceManager, TUMBLE_SECONDS } from './DiceManager.js';
import { playDiceClatter, playPingSound, playShutterSound } from '../sounds.js';
import { flashingAllowed, isPlayerMuted } from '../audioMix.js';
import { TablePings } from './TablePings.js';
import { Ambience } from './Ambience.js';
import { OutsideWorld } from './outside/OutsideWorld.js';
import { HalloweenDecor } from './HalloweenDecor.js';
import { hangPaintings } from './paintings.js';
import { FireAmbience } from '../fireAmbience.js';
import { NightAmbience } from '../nightAmbience.js';
import { TV_PLAYER_HEIGHT, TV_PLAYER_WIDTH, TvScreen } from './TvScreen.js';
import { ClipControls, YouTubeClip, YouTubeEmbed, type ClipView } from '../YouTubeClip.js';
import { createPortal } from 'react-dom';
import { RoomLoading } from '../RoomLoading.js';
import { canvasToTableLocal, tableLocalToCanvas } from './tableCoordinates.js';
import type { TableSurface } from './RoomLayout.js';
import { RESUME_LOOK_EVENT } from '../ChatPanel.js';
import { rollBubble } from '../logFormat.js';
import {
  createLamp,
  setLampOn,
  disposeLamp,
  LAMP_POSITION,
  LAMP_RANGE,
  type RoomLamp,
} from './RoomLamp.js';
import { SoundboardWall } from './SoundboardWall.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { nearestInteractable, type Interactable } from './interaction.js';
import { findStrokeNear } from './eraser.js';
import { formatKeyCode } from '../keyLabel.js';
import { isInteractKeyPress } from '../keyboard.js';
import { SoundboardAssignMenu } from '../SoundboardAssignMenu.js';
import { InventoryDialog } from '../InventoryDialog.js';
import { WalkieDialog } from '../WalkieDialog.js';
import { CalculatorDialog } from '../CalculatorDialog.js';
import { RecordDialog } from '../RecordDialog.js';
import { BookshelfDialog } from '../BookshelfDialog.js';
import { Lectern } from './Lectern.js';
import { MusicPlayer } from '../music/MusicPlayer.js';
import { RecordPlayer } from './RecordPlayer.js';
import { roomWood } from './woodBox.js';
import { HeldMugView } from './HeldMugView.js';
import type { HeldKind } from './heldItems.js';
import { buildSnackBowl, SNACK_BOWL, TEA_SET } from './refreshmentMeshes.js';
import { CAT_NAME, RoomCat } from './RoomCat.js';
import { catTarget } from './catRoutes.js';
import { CatPurr, playMrrp } from '../catSounds.js';
import { HeldItems } from '../HeldItems.js';
import { createPinboard, syncPinboard, disposePinboard, type Pinboard } from './Pinboard.js';
import { uploadImage } from '../uploads.js';
import { aimFlashlightBeam } from './flashlightBeam.js';
import { RoomLife } from './RoomLife.js';
import { LOUNGE_SPOTS, loungeEye, sitterOn } from './loungeSeats.js';
import { RoomWindows } from './RoomWindows.js';
import { WinterDecor } from './WinterDecor.js';
import { WeatherAudio } from '../weatherAudio.js';
import { setLightningFlash } from './RoomLighting.js';
import { pickAimTarget, type AimTarget } from './aimTargets.js';
import { candlePrompt } from './candles.js';
import {
  playBlowOut,
  playCurtains,
  playNeedleDrop,
  playNeedleLift,
  playClink,
  playCrunch,
  playSip,
  playLogOnFire,
  playMatchStrike,
  playWindowSash,
} from '../roomSounds.js';
import { placeSound } from '../spatialAudio.js';
import { LIGHT_SWITCH_RANGE, LIGHT_SWITCH_SPOT } from './LightSwitch.js';
import { GadgetLibrary } from './gadgetMeshes.js';
import { HOLDS } from './heldItems.js';

// Module-level so each character model downloads once per page, not once
// per room mount (leaving and rejoining a session reuses it).
const characterLibrary = new CharacterLibrary();
const gadgetLibrary = new GadgetLibrary();
/** A dragged mini or die sends where it is this often (ms). */
const DRAG_SEND_MS = 60;
/** DiceManager's carry lift (kept in step with its DRAG_LIFT). */
const DIE_DRAG_LIFT = 0.02;
/** Dragged things stay this far (table units) inside the play surface's
 * edge, so a mini's base or a die never hangs over the rail. */
const MINI_EDGE_UNITS = 24;
const DIE_EDGE_UNITS = 40;

function insetOnTable(point: Point2D, margin: number): Point2D {
  const clamp = (value: number) => Math.min(TABLE_UNITS - margin, Math.max(margin, value));
  return { x: clamp(point.x), y: clamp(point.y) };
}
// Throttle: enough for smooth-looking remote avatars without flooding the
// socket (docs/engineering/architecture.md, "Performance" — deltas, not a
// broadcast on every frame).
const MOVE_SEND_INTERVAL_MS = 100;
const MAX_FRAME_SECONDS = 0.1;
/** How close (along the view ray) the whiteboard can be aimed at. */
const WHITEBOARD_RANGE = 3.2;
const SCREEN_CENTER = new THREE.Vector2(0, 0);
/** Pinned photos are square: the middle of the view, at this size. */
const PHOTO_SIZE = 512;
/** How far away a die on the table can be aimed at to roll it. */
const DIE_REACH = 2.6;
const MOVE_POSITION_EPSILON = 0.01;
const MOVE_ROTATION_EPSILON = 0.01;
// How far past the table's own edge still counts as "approaching" it for
// the sit-down interactable (Milestone 8).
const TABLE_APPROACH_MARGIN = 1.3;
/** Proximity range for the chest (the gadgets inventory, phase 1) — same
 * approach-and-press-E model as the light/table, not aim-based (there's
 * only one chest, unlike the wall board's 16 buttons). */
const CHEST_RANGE = 1.4;
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

/** Keycaps and what they do, for the "click to look around" card. */
function HintKeys({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="hint-key-group">
      {keys.map((key) => (
        <kbd key={key}>{key}</kbd>
      ))}
      <span>{label}</span>
    </span>
  );
}

/** What a full repaint of the table depends on: the scene, its map, its grid. */
function paintSignature(scene: GameScene): string {
  return `${scene.id}|${scene.backgroundImage}|${scene.gridCells}`;
}

/** Whether a stroke the table shows (`shown`, kept current stroke by stroke
 * via drawing:*) is missing from the scene the server just sent — the host
 * cleared the map — so it needs a full repaint. */
function lostStrokes(shown: GameScene, next: GameScene): boolean {
  if (shown.id !== next.id) return false;
  const kept = new Set(next.drawings.map((drawing) => drawing.id));
  return shown.drawings.some((drawing) => !kept.has(drawing.id));
}

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
  /** Players' minis on the table (minis.ts): playerId -> table point. */
  minis: Record<string, Point2D>;
  /** Whoever is host may move anyone's mini or die. */
  hostId: string;
  /** Move (or place) a mini; the host may move anyone's. */
  onMoveMini: (targetPlayerId: string, point: Point2D) => void;
  /** Drag a die to a new resting position. */
  onMoveDie: (diceId: string, position: Vector3) => void;
  lightOn: boolean;
  /** The reading lamp by the armchair — its own switch (GameState.room). */
  readingLampOn: boolean;
  /** The room's shared switches and states: the fire, the candles, … */
  room: RoomState;
  /** serverClock - localClock (ms): the fire's stoke time is on the server's. */
  serverOffset: number;
  /** Lights or blows out a candle group, stokes the fire, … (object:interact
   * with a target and a wanted state). */
  onRoomAction: (objectId: string, fields?: { target?: string; on?: boolean }) => void;
  /** The host's books on the lectern (books.ts). */
  books: Book[];
  /** The host's own controls — writing the books. */
  onHostAction: (action: HostAction) => void;
  soundboard: SoundState[];
  /** Slot index -> assigned sound id or null (Milestone 8 follow-up's wall
   * board — see shared/src/types.ts). */
  soundboardSlots: (string | null)[];
  /** A `KeyboardEvent.code` value (Milestone 10 follow-up, user-rebindable
   * via Settings) — which key triggers the nearest interactable. */
  interactKey: string;
  onPlaySound: (soundId: string) => void;
  onObjectInteract: (objectId: string) => void;
  /** The room chest's contents (the gadgets inventory, phase 1). */
  inventory: InventoryItem[];
  onTakeItem: (itemId: string) => void;
  onDropItem: (itemId: string) => void;
  /** Photos pinned to the wall pinboard (the camera, gadgets phase 2). */
  photos: Photo[];
  /** Registers an already-uploaded photo (the upload itself is a plain
   * REST call inside this component, same split as sound/map uploads). */
  onCapturePhoto: (url: string) => void;
  /** Toggles the local player's flashlight (the gadgets inventory, phase 3)
   * — refused server-side unless they currently hold it. */
  onToggleFlashlight: () => void;
  /** Sends a private walkie-talkie message (the gadgets inventory, phase 4)
   * — refused server-side unless the requester holds one and someone else
   * holds the other. */
  onTransmitWalkie: (text: string) => void;
  /** Registers a newly-uploaded/linked sound into the shared soundboard —
   * shared with the 2D panel's own upload form (SessionView.tsx), which
   * never passes `slotIndex`. Passing one (from the wall board's assign
   * menu) also assigns the sound to that physical button in the same round
   * trip. */
  onUploadSound: (name: string, url: string, slotIndex?: number) => void;
  /** Put an existing sound on a wall button, or clear it (null). */
  onAssignSlot: (slotIndex: number, soundId: string | null) => void;
  /** How the room (and the night outside) is dressed — the host's choice. */
  theme: RoomTheme;
  /** Whether this player may draw on the map / use sounds (host.ts). */
  canDraw: boolean;
  canUseSounds: boolean;
  /** Short on-screen feedback (e.g. "You wave"). */
  onNotify: (text: string) => void;
  /** The whiteboard's lines (GameState.whiteboard). */
  whiteboard: WhiteboardLine[];
  /** Saves the whiteboard: the edited lines' text, `null` for the rest. */
  onWriteWhiteboard: (lines: (string | null)[]) => void;
  /** Rolls dice on the table (aim + interact, or a click while seated). */
  onRollDice: (diceIds: string[]) => void;
  /** The YouTube clip everyone is watching (on the room's TV), if any. */
  clipView: ClipView | null;
  /** The session log: new chat lines and typed rolls pop up as speech
   * bubbles over whoever said them. */
  log: LogEntry[];
}

function promptFor(
  nearestId: string | null,
  seatedView: SeatedView | null,
  hasChair: boolean,
  interactKey: string,
  boardTarget: { slotIndex: number; soundName: string | null } | null,
  whiteboardTargeted: boolean,
  targetedDie: DieKind | null = null,
  heldItemKind: HeldKind | null = null,
): string | null {
  const keyLabel = formatKeyCode(interactKey);
  if (seatedView) {
    const other = seatedView === 'chair' ? 'the table view' : 'the view from your chair';
    return hasChair
      ? `Press ${keyLabel} to stand up · V for ${other}`
      : `Press ${keyLabel} to stand up`;
  }
  if (boardTarget) {
    return boardTarget.soundName
      ? `Press ${keyLabel} to play "${boardTarget.soundName}" · Shift+${keyLabel} to change it`
      : `Press ${keyLabel} to put a sound on this button`;
  }
  if (targetedDie) {
    return `Press ${keyLabel} to roll the ${targetedDie}`;
  }
  if (whiteboardTargeted) {
    return `Press ${keyLabel} to write on the whiteboard`;
  }
  if (nearestId === 'light') {
    return `Press ${keyLabel} to switch the room light on/off`;
  }
  if (nearestId === 'lamp') {
    return `Press ${keyLabel} to switch the reading lamp on/off`;
  }
  if (nearestId === 'table') {
    return `Press ${keyLabel} to sit at the table`;
  }
  if (nearestId === 'lounge') {
    return `Press ${keyLabel} to get up`;
  }
  if (nearestId === 'chest') {
    return `Press ${keyLabel} to open the chest`;
  }
  switch (heldItemKind) {
    case 'tea':
    case 'cocoa':
      return 'Press R to sip · 7 to raise your mug';
    case 'camera':
      return 'Press R to take a photo';
    case 'flashlight':
      return 'Press R to toggle the flashlight';
    case 'walkie':
      return 'Press R to talk on the walkie-talkie';
    case 'calculator':
      return 'Press R to use the calculator';
    default:
      return null;
  }
}

/** The winter decorations up or down — and the tree solid while it's up. */
function showWinter(
  winter: WinterDecor | null,
  obstacles: import('./collision.js').Obstacle[] | null,
  visible: boolean,
): void {
  if (!winter) return;
  winter.setVisible(visible);
  if (!obstacles) return;
  const index = obstacles.indexOf(winter.obstacle);
  if (visible && index < 0) obstacles.push(winter.obstacle);
  if (!visible && index >= 0) obstacles.splice(index, 1);
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
 * upload. Also proximity + E, the room's existing decorative chest
 * (`COL_Chest` in the model, `RoomLoader.ts`'s `chestSpot`): opens
 * `InventoryDialog`, a fixed catalog of small gadgets a player can take or
 * put back (the gadgets inventory, phase 1 — each gadget's own effect lands
 * with that gadget; this phase only tracks who's holding what). The camera
 * (phase 2) is a location-free fallback action instead — R while holding it
 * captures a square photo, uploads it, and pins it to the wall `Pinboard`,
 * which is purely reactive (`GameState.photos`, no interaction of its own).
 * Click-to-lock, Esc (browser default) to release; drawing only while not
 * locked. The
 * light/table/chest proximity interactables trigger via E regardless of lock
 * state (unchanged from Milestone 8); the board's aim-based targeting only
 * makes sense while actively looking around, so it only resolves while
 * pointer-locked. Sitting switches the viewport to a square, table-filling
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
  minis,
  hostId,
  onMoveMini,
  onMoveDie,
  lightOn,
  readingLampOn,
  room,
  serverOffset,
  onRoomAction,
  books,
  onHostAction,
  soundboard,
  soundboardSlots,
  interactKey,
  onPlaySound,
  onObjectInteract,
  inventory,
  onTakeItem,
  onDropItem,
  photos,
  onCapturePhoto,
  onToggleFlashlight,
  onTransmitWalkie,
  onUploadSound,
  onAssignSlot,
  canDraw,
  canUseSounds,
  theme,
  onNotify,
  whiteboard,
  onWriteWhiteboard,
  onRollDice,
  log,
  clipView,
}: RoomViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controllerRef = useRef<FirstPersonController | null>(null);
  const avatarsRef = useRef<PlayerAvatars | null>(null);
  const playersRef = useRef<Player[]>(players);
  const playerIdRef = useRef<string>(playerId);
  const tableCanvasRef = useRef<TableCanvas | null>(null);
  const activeSceneRef = useRef<GameScene>(activeScene);
  const lastRedrawnSignatureRef = useRef<string>('');
  const themeRef = useRef(theme);
  const outsideRef = useRef<OutsideWorld | null>(null);
  const decorRef = useRef<HalloweenDecor | null>(null);
  const winterRef = useRef<WinterDecor | null>(null);
  const windowsRef = useRef<RoomWindows | null>(null);
  const weatherAudioRef = useRef<WeatherAudio | null>(null);
  const recordPlayerRef = useRef<RecordPlayer | null>(null);
  const musicRef = useRef<MusicPlayer | null>(null);
  const lecternRef = useRef<Lectern | null>(null);
  const booksRef = useRef(books);
  const heldMugRef = useRef<HeldMugView | null>(null);
  // The room's obstacles (the controller walks against these): the winter
  // tree joins them while it's up.
  const obstaclesRef = useRef<import('./collision.js').Obstacle[] | null>(null);
  // The host's theme: the night outside, the decorations, the fairy lights.
  useEffect(() => {
    themeRef.current = theme;
    outsideRef.current?.setTheme(theme);
    nightRef.current?.setTheme(theme);
    decorRef.current?.setVisible(theme === 'halloween');
    ambienceRef.current?.setTheme(theme);
    showWinter(winterRef.current, obstaclesRef.current, theme === 'winter');
  }, [theme]);
  const canDrawRef = useRef(canDraw);
  const canUseSoundsRef = useRef(canUseSounds);
  useEffect(() => {
    canDrawRef.current = canDraw;
    canUseSoundsRef.current = canUseSounds;
  }, [canDraw, canUseSounds]);
  const diceManagerRef = useRef<DiceManager | null>(null);
  const diceRef = useRef<Dice[]>(dice);
  const minisRef = useRef(minis);
  const miniManagerRef = useRef<MiniManager | null>(null);
  const isHostRef = useRef(hostId === playerId);
  isHostRef.current = hostId === playerId;
  const onMoveMiniRef = useRef(onMoveMini);
  onMoveMiniRef.current = onMoveMini;
  const onMoveDieRef = useRef(onMoveDie);
  onMoveDieRef.current = onMoveDie;
  const roomLightsRef = useRef<RoomLights | null>(null);
  const lampRef = useRef<RoomLamp | null>(null);
  const tableChairsRef = useRef<TableChairs | null>(null);
  const seatsRef = useRef<Seat[]>([]);
  const lightOnRef = useRef<boolean>(lightOn);
  const readingLampOnRef = useRef<boolean>(readingLampOn);
  const roomRef = useRef<RoomState>(room);
  const serverOffsetRef = useRef(serverOffset);
  serverOffsetRef.current = serverOffset;
  const onRoomActionRef = useRef(onRoomAction);
  onRoomActionRef.current = onRoomAction;
  // "Look at it and press E" (aimTargets.ts): the candles, the fire, …
  const aimTargetsRef = useRef<AimTarget[]>([]);
  const aimTargetRef = useRef<AimTarget | null>(null);
  const fireSpotRef = useRef<THREE.Vector3 | null>(null);
  // Footsteps, the clock, the door, the light switch (RoomLife.ts).
  const roomLifeRef = useRef<RoomLife | null>(null);
  const tableMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const soundboardRef = useRef<SoundState[]>(soundboard);
  const soundboardSlotsRef = useRef<(string | null)[]>(soundboardSlots);
  const soundboardWallRef = useRef<SoundboardWall | null>(null);
  const pinboardRef = useRef<Pinboard | null>(null);
  const flashlightRef = useRef<THREE.SpotLight | null>(null);
  const flashlightTargetRef = useRef<THREE.Object3D | null>(null);
  const photosRef = useRef<Photo[]>(photos);
  const capturingPhotoRef = useRef(false);
  const seenPhotoIdsRef = useRef<Set<string> | null>(null);
  const [cameraFlash, setCameraFlash] = useState(false);
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
  const onRollDiceRef = useRef(onRollDice);
  // The fire, candles, fairy lights, night sky and dust (Ambience.ts).
  const ambienceRef = useRef<Ambience | null>(null);
  const nightRef = useRef<NightAmbience | null>(null);
  // The console TV (TvScreen.ts): where shared YouTube clips play, unless a
  // player pops the clip out into the corner card.
  const tvRef = useRef<TvScreen | null>(null);
  const [tvElement, setTvElement] = useState<HTMLDivElement | null>(null);
  const [clipOnCard, setClipOnCard] = useState(false);
  // Until the room model is in the scene: a loading card, or why it failed.
  const [roomState, setRoomState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const seatedViewRef = useRef<SeatedView | null>(null);
  // The newest log entry already shown — lines from before this view
  // mounted are history, not something anyone is saying right now.
  const lastLogIdRef = useRef<string | null>(log.at(-1)?.id ?? null);
  const targetedDieRef = useRef<string | null>(null);
  const onObjectInteractRef = useRef(onObjectInteract);
  const onUploadSoundRef = useRef(onUploadSound);
  const onCapturePhotoRef = useRef(onCapturePhoto);
  const onToggleFlashlightRef = useRef(onToggleFlashlight);
  const inventoryRef = useRef<InventoryItem[]>(inventory);
  const onNotifyRef = useRef(onNotify);
  const interactKeyRef = useRef(interactKey);
  const [locked, setLocked] = useState(false);
  const [seated, setSeated] = useState(false);
  // Seated: looking out from the chair, or down at the table (V toggles).
  const [seatedView, setSeatedViewState] = useState<SeatedView | null>(null);
  const [hasChair, setHasChair] = useState(false);
  const toggleSeatedViewRef = useRef<() => void>(() => {});
  const [interactionPrompt, setInteractionPrompt] = useState<string | null>(null);
  // The wall board's assign-sound overlay (Milestone 8 follow-up) — set to
  // the empty slot's index while open, null otherwise. Mirrored into a ref
  // for the same reason every other per-frame-read value here is (the mount
  // effect's closures only run once and would otherwise see a stale value).
  const [assignSlotIndex, setAssignSlotIndex] = useState<number | null>(null);
  // The whiteboard editor (change request #5) — open or not; mirrored into a
  // ref for the once-registered key handler, like assignSlotIndex.
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const whiteboardOpenRef = useRef(false);
  // The chest dialog (the gadgets inventory, phase 1) — mirrors
  // assignSlotIndex/whiteboardOpen's open-flag + ref pattern.
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const inventoryOpenRef = useRef(false);
  const closeInventory = useCallback(() => setInventoryOpen(false), []);
  // The walkie-talkie's message dialog (gadgets phase 4) — mirrors the
  // same open-flag + ref pattern.
  const [walkieOpen, setWalkieOpen] = useState(false);
  const walkieOpenRef = useRef(false);
  const closeWalkie = useCallback(() => setWalkieOpen(false), []);
  const onTransmitWalkieRef = useRef(onTransmitWalkie);
  // The calculator (gadgets phase 5) — same open-flag + ref pattern;
  // purely client-local, no server round trip, so no onXxxRef for it.
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const calculatorOpenRef = useRef(false);
  const closeCalculator = useCallback(() => setCalculatorOpen(false), []);
  // The record box (RecordDialog), opened at the record player.
  const [recordOpen, setRecordOpen] = useState(false);
  const recordOpenRef = useRef(false);
  const closeRecords = useCallback(() => setRecordOpen(false), []);
  // The lectern's books (BookshelfDialog).
  const [booksOpen, setBooksOpen] = useState(false);
  const booksOpenRef = useRef(false);
  const closeBooks = useCallback(() => setBooksOpen(false), []);
  const whiteboardRef = useRef<WhiteboardLine[]>(whiteboard);
  const whiteboardCanvasRef = useRef<WhiteboardCanvas | null>(null);
  const whiteboardTargetedRef = useRef(false);
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
  const closeWhiteboard = useCallback(() => setWhiteboardOpen(false), []);
  const drawToolRef = useRef<DrawTool>(drawTool);
  const drawColorRef = useRef(drawColor);
  const drawWidthRef = useRef(drawWidth);

  // Membership (who has an avatar at all) is driven by GameState.players —
  // infrequent (join/leave only). Live movement between snapshots comes
  // from player:move broadcasts instead, handled inside the effect below.
  useEffect(() => {
    playersRef.current = players;
    // The chairs first (one per player, four at least), so avatars and
    // this player's own seat land on where the chairs now are.
    tableChairsRef.current?.apply(chairCount(players.length));
    const self = players.find((candidate) => candidate.id === playerId);
    const seat =
      self?.seated && self.seatIndex !== null ? (seatsRef.current[self.seatIndex] ?? null) : null;
    if (seat) controllerRef.current?.moveChair(seat);
    avatarsRef.current?.sync(players, playerId, inventory);
    // After the avatars: someone new knocks and walks in through the door.
    roomLifeRef.current?.syncPlayers(players);
    heldMugRef.current?.setDrink(
      players.find((player) => player.id === playerId)?.carrying ?? null,
    );
  }, [players, playerId, inventory]);

  useEffect(() => {
    playerIdRef.current = playerId;
  }, [playerId]);

  useEffect(() => {
    onPlaySoundRef.current = onPlaySound;
  }, [onPlaySound]);

  useEffect(() => {
    onRollDiceRef.current = onRollDice;
  }, [onRollDice]);

  // A new clip always starts on the TV — and its wall button pulses.
  const startedClipSound = clipView?.clip.soundId;
  useEffect(() => {
    setClipOnCard(false);
    if (startedClipSound) soundboardWallRef.current?.pulse(startedClipSound);
  }, [clipView?.clip.id, startedClipSound]);

  useEffect(() => {
    tvRef.current?.setPlaying(clipView !== null && !clipOnCard);
  }, [clipView, clipOnCard, tvElement]);

  useEffect(() => {
    seatedViewRef.current = seatedView;
  }, [seatedView]);

  useEffect(() => {
    const lastSeen = lastLogIdRef.current;
    const seenIndex = lastSeen ? log.findIndex((entry) => entry.id === lastSeen) : -1;
    // (If the last-seen line already scrolled out of the log, just the newest.)
    const fresh =
      lastSeen === null ? log : seenIndex >= 0 ? log.slice(seenIndex + 1) : log.slice(-1);
    lastLogIdRef.current = log.at(-1)?.id ?? lastSeen;
    for (const entry of fresh) {
      if (entry.kind === 'chat') {
        avatarsRef.current?.say(entry.playerId, entry.text);
      } else if (entry.kind === 'roll' && entry.notation) {
        avatarsRef.current?.say(entry.playerId, rollBubble(entry));
      }
    }
  }, [log]);

  useEffect(() => {
    onObjectInteractRef.current = onObjectInteract;
  }, [onObjectInteract]);

  useEffect(() => {
    onUploadSoundRef.current = onUploadSound;
  }, [onUploadSound]);

  useEffect(() => {
    onCapturePhotoRef.current = onCapturePhoto;
  }, [onCapturePhoto]);

  useEffect(() => {
    onToggleFlashlightRef.current = onToggleFlashlight;
  }, [onToggleFlashlight]);

  useEffect(() => {
    inventoryRef.current = inventory;
  }, [inventory]);

  useEffect(() => {
    // A new photo someone else took: their camera flashes in their hand.
    // (What's already on the board when we arrive doesn't flash.)
    if (seenPhotoIdsRef.current) {
      for (const photo of photos) {
        if (!seenPhotoIdsRef.current.has(photo.id) && photo.takenBy !== playerId) {
          avatarsRef.current?.flashCamera(photo.takenBy);
        }
      }
    }
    seenPhotoIdsRef.current = new Set(photos.map((photo) => photo.id));
    photosRef.current = photos;
    if (pinboardRef.current) {
      syncPinboard(pinboardRef.current, photos);
    }
  }, [photos, playerId]);

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
    whiteboardOpenRef.current = whiteboardOpen;
  }, [whiteboardOpen]);

  useEffect(() => {
    inventoryOpenRef.current = inventoryOpen;
  }, [inventoryOpen]);

  useEffect(() => {
    walkieOpenRef.current = walkieOpen;
  }, [walkieOpen]);

  useEffect(() => {
    onTransmitWalkieRef.current = onTransmitWalkie;
  }, [onTransmitWalkie]);

  useEffect(() => {
    calculatorOpenRef.current = calculatorOpen;
  }, [calculatorOpen]);

  useEffect(() => {
    recordOpenRef.current = recordOpen;
  }, [recordOpen]);

  useEffect(() => {
    booksOpenRef.current = booksOpen;
  }, [booksOpen]);

  useEffect(() => {
    booksRef.current = books;
    lecternRef.current?.setBooks(books);
  }, [books]);

  // Re-ink when the lines change *or* when an author changes color.
  useEffect(() => {
    whiteboardRef.current = whiteboard;
    whiteboardCanvasRef.current?.draw(
      whiteboard.map((line) => ({ text: line.text, color: inkColorFor(line, players) })),
    );
  }, [whiteboard, players]);

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
  // canvas without a full redraw — and a scene that lost strokes the table
  // shows (the host cleared the drawings) repaints it.
  useEffect(() => {
    const cleared = lostStrokes(activeSceneRef.current, activeScene);
    activeSceneRef.current = activeScene;
    const signature = paintSignature(activeScene);
    if (signature !== lastRedrawnSignatureRef.current || cleared) {
      lastRedrawnSignatureRef.current = signature;
      void tableCanvasRef.current?.redraw(activeScene, () => activeSceneRef.current.drawings);
    }
  }, [activeScene]);

  // Dice (Milestone 6): spawn/roll/remove all arrive via the same
  // GameState.dice snapshot (no separate delta channel like player:move),
  // so a single sync per change covers membership and live roll results.
  // Players too: a die is drawn in its owner's color.
  useEffect(() => {
    diceRef.current = dice;
    diceManagerRef.current?.sync(dice, players);
  }, [dice, players]);

  useEffect(() => {
    minisRef.current = minis;
    miniManagerRef.current?.sync(minis, players);
  }, [minis, players]);

  // The room light (Milestone 8) is a session-wide flag, applied to both
  // the ambient/point lights (RoomLighting.ts) and the lamp prop's own
  // material (RoomLamp.ts) so the toggle reads clearly even before the
  // player's eyes adjust to the overall brightness change.
  useEffect(() => {
    if (lightOnRef.current !== lightOn) roomLifeRef.current?.setLightOn(lightOn);
    lightOnRef.current = lightOn;
    ambienceRef.current?.setRoomLightsOn(lightOn);
    if (roomLightsRef.current) {
      setRoomLightsOn(roomLightsRef.current, lightOn);
    }
    tableMaterialRef.current?.color.setScalar(lightOn ? 1 : TABLE_DIMMED_BRIGHTNESS);
  }, [lightOn]);

  // The fire and the candles (GameState.room): a log going on flares the
  // fire up; a candle group blown out or lit makes its little sound.
  useEffect(() => {
    const before = roomRef.current;
    roomRef.current = room;
    const ambience = ambienceRef.current;
    const camera = cameraRef.current;
    const yaw = controllerRef.current?.getYaw() ?? 0;
    const listener = camera ? { x: camera.position.x, z: camera.position.z, yaw } : null;
    if (room.fireStokedAt !== before.fireStokedAt && room.fireStokedAt !== null) {
      ambience?.stoke();
      const fire = fireSpotRef.current;
      if (listener && fire) playLogOnFire(placeSound(listener, fire, 1.5, 12));
    }
    // The weather, and every window: open or shut, curtains drawn or not.
    outsideRef.current?.setWeather(room.weather);
    nightRef.current?.setWeather(room.weather);
    weatherAudioRef.current?.setWeather(room.weather);
    windowsRef.current?.setStates(room.windows);
    const windowSpots = windowsRef.current?.list() ?? [];
    if (listener) {
      for (const window of windowSpots) {
        const old = before.windows[window.id];
        const next = room.windows[window.id];
        if (!old || !next) continue;
        const place = placeSound(listener, window.center, 1, 9);
        if (old.open !== next.open) playWindowSash(place, next.open);
        if (old.drawn !== next.drawn) playCurtains(place);
      }
    }
    // The record player: what's on, and the needle going down or up.
    musicRef.current?.setRecord(room.record);
    recordPlayerRef.current?.setPlaying(room.record?.record ?? null);
    const turntable = recordPlayerRef.current?.soundSpot;
    if (listener && turntable && room.record?.startedAt !== before.record?.startedAt) {
      const place = placeSound(listener, turntable, 1, 8);
      if (room.record) playNeedleDrop(place);
      else playNeedleLift(place);
    }
    const was = new Set(before.candlesOut);
    const now = new Set(room.candlesOut);
    ambience?.setCandlesOut(now);
    const spots = ambience?.candleSpots();
    if (listener && spots) {
      for (const [group, spot] of spots) {
        if (now.has(group) && !was.has(group)) playBlowOut(placeSound(listener, spot.center, 1, 8));
        if (!now.has(group) && was.has(group))
          playMatchStrike(placeSound(listener, spot.center, 1, 8));
      }
    }
  }, [room]);

  // The reading lamp by the armchair has its own switch now.
  useEffect(() => {
    if (readingLampOnRef.current !== readingLampOn) roomLifeRef.current?.readingLampSwitched();
    readingLampOnRef.current = readingLampOn;
    if (lampRef.current) {
      setLampOn(lampRef.current, readingLampOn);
    }
  }, [readingLampOn]);

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
    // Start where the server has this player: their color's spawn point on
    // a fresh join, or wherever they last stood after a reload — facing the
    // way they faced (rotationY is a heading; the camera looks down its -z).
    const self = playersRef.current.find((player) => player.id === playerId);
    const start = self?.position ?? DEFAULT_SPAWN_POSITION;
    camera.position.set(start.x, DEFAULT_SPAWN_POSITION.y, start.z);
    camera.rotation.set(0, (self?.rotationY ?? Math.PI) + Math.PI, 0, 'YXZ');
    cameraRef.current = camera;

    // alpha: the TV's screen punches a transparent hole so the YouTube
    // player underneath the canvas shows through (TvScreen.ts).
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 1);
    renderer.setSize(container.clientWidth, container.clientHeight);
    // Capped: past 2x the extra pixels cost a lot of GPU for no visible gain.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    configureRoomToneMapping(renderer);
    container.appendChild(renderer.domElement);

    const timer = new THREE.Timer();
    timer.connect(document);

    const handleResize = () => {
      applyViewportSize(camera, renderer, container, controllerRef.current?.seatedView === 'table');
      ambienceRef.current?.setViewport(renderer.domElement.clientHeight, camera.fov);
      decorRef.current?.setViewport(renderer.domElement.clientHeight, camera.fov);
      winterRef.current?.setViewport(renderer.domElement.clientHeight, camera.fov);
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

    // Pings ("look here!" on the table): shown at once for the pinger,
    // relayed by the server to everyone else.
    const tablePings = new TablePings(scene);
    let pingSurface: TableSurface | null = null;
    const showPing = (point: Point2D, pingerId: string) => {
      if (!pingSurface) {
        return;
      }
      const local = canvasToTableLocal(
        point,
        pingSurface.halfWidth,
        pingSurface.halfDepth,
        TABLE_CANVAS_SIZE,
      );
      const pinger = playersRef.current.find((candidate) => candidate.id === pingerId);
      tablePings.ping(
        pingSurface.center.x + local.x,
        pingSurface.height,
        pingSurface.center.z + local.z,
        pinger ? playerColorHex(pinger.color) : '#f3e6d3',
      );
      playPingSound();
    };
    const sendPing = (point: Point2D) => {
      showPing(point, playerId);
      socket.emit(SocketEvent.TablePing, { sessionId, playerId, point } satisfies TablePingRequest);
    };
    const handleRemotePing = (request: TablePingRequest) =>
      showPing(request.point, request.playerId);
    socket.on(SocketEvent.TablePing, handleRemotePing);
    let handleLockedPing: ((event: MouseEvent) => void) | null = null;

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
    // Whoever plays a sound, its button on the wall sinks and flashes.
    const handleSoundPlayed = (request: SoundPlayRequest) =>
      soundboardWallRef.current?.pulse(request.soundId);
    socket.on(SocketEvent.SoundPlay, handleSoundPlayed);

    let tableDrawing: TableDrawing | null = null;
    let brassEnv: THREE.Texture | null = null;
    let outside: OutsideWorld | null = null;
    let paintings: { dispose(): void }[] = [];
    let chandelier: THREE.Object3D | null = null;
    // Everything a full table redraw should paint, read at paint time (see
    // TableCanvas.redraw) so strokes drawn while a map image loads survive.
    const currentDrawings = () => activeSceneRef.current.drawings;

    /** Applies whatever the controller now is — standing, seated in the
     * chair view, or seated looking down at the table. The top-down view
     * gets a square viewport and hides the chandelier (it hangs exactly
     * where that camera looks down from). */
    const applySeatedView = () => {
      const view = controllerRef.current?.seatedView ?? null;
      const topDown = view === 'table';
      applyViewportSize(camera, renderer, container, topDown);
      ambienceRef.current?.setViewport(renderer.domElement.clientHeight, camera.fov);
      decorRef.current?.setViewport(renderer.domElement.clientHeight, camera.fov);
      if (chandelier) {
        chandelier.visible = !topDown;
      }
      setSeated(view !== null);
      setSeatedViewState(view);
      setHasChair(controllerRef.current?.hasChair ?? false);
      diceManagerRef.current?.setSeated(topDown);
    };
    let handleInteractKey: ((event: KeyboardEvent) => void) | null = null;
    let handleEmoteKey: ((event: KeyboardEvent) => void) | null = null;
    let handleRemoteGesture: ((request: PlayerGestureRequest) => void) | null = null;
    let disposeCat: (() => void) | null = null;
    let handleViewKey: ((event: KeyboardEvent) => void) | null = null;
    let handleUseItemKey: ((event: KeyboardEvent) => void) | null = null;
    let fireAudioRef: FireAmbience | null = null;
    let startFireAudio: (() => void) | null = null;
    let startNight: (() => void) | null = null;
    let updateNight: ((dt: number) => void) | null = null;
    let updateFireAudio: ((dt: number) => void) | null = null;
    let handleResumeLook: (() => void) | null = null;

    void loadRoom().then(
      (room) => {
        if (disposed) {
          return;
        }
        scene.add(room.object3D);
        setRoomState('ready');
        chandelier = room.chandelier;
        tuneRoomMaterials(room.object3D);
        paintings = hangPaintings(room.object3D);
        const lights = addRoomLighting(scene, room.layout);
        setRoomLightsOn(lights, lightOnRef.current);
        roomLightsRef.current = lights;

        const lamp = createLamp(scene, 0);
        setLampOn(lamp, readingLampOnRef.current);
        lampRef.current = lamp;

        const ambience = new Ambience(
          scene,
          room,
          window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        );
        ambience.setRoomLightsOn(lightOnRef.current);
        ambience.setViewport(renderer.domElement.clientHeight, camera.fov);
        ambience.setCandlesOut(new Set(roomRef.current.candlesOut));
        ambienceRef.current = ambience;
        fireSpotRef.current = room.fireSpot;

        // Look at them and press E: the candle groups, and the fire.
        const keyLabel = () => formatKeyCode(interactKeyRef.current);
        const candleTargets: AimTarget[] = [...ambience.candleSpots()].map(([group, spot]) => ({
          id: `candles:${group}`,
          center: spot.center,
          radius: spot.radius,
          reach: 2.4,
          prompt: () => candlePrompt(group, !isOut(group), keyLabel()),
          act: () => onRoomActionRef.current('candles', { target: group, on: isOut(group) }),
        }));
        const isOut = (group: CandleGroup) => roomRef.current.candlesOut.includes(group);
        const fireTarget: AimTarget[] = room.fireSpot
          ? [
              {
                id: 'hearth',
                center: room.fireSpot.clone().add(new THREE.Vector3(0.05, 0.12, 0)),
                radius: 0.42,
                reach: 3.2,
                prompt: () => `Press ${keyLabel()} to put another log on the fire`,
                act: () => onRoomActionRef.current('hearth'),
              },
            ]
          : [];
        aimTargetsRef.current = [...candleTargets, ...fireTarget];
        const weatherAudio = new WeatherAudio();
        weatherAudio.setWeather(roomRef.current.weather);
        weatherAudioRef.current = weatherAudio;
        outside = new OutsideWorld(
          room.windowViews,
          window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          (loudness, delay) => weatherAudio.thunder(loudness, delay),
        );
        outside.setWeather(roomRef.current.weather);
        outsideRef.current = outside;
        const outsideWorld = outside;
        const windows = new RoomWindows(room.object3D, (pane, openTo) =>
          outsideWorld.setPaneOpen(pane, openTo),
        );
        windows.setStates(roomRef.current.windows);
        windowsRef.current = windows;
        // The windows: E opens or shuts one, Shift+E draws its curtains.
        const windowTargets: AimTarget[] = windows.list().map((spot) => ({
          id: `window:${spot.id}`,
          center: spot.center,
          radius: spot.radius,
          reach: 2.8,
          prompt: () => {
            const state = roomRef.current.windows[spot.id];
            return `Press ${keyLabel()} to ${state?.open ? 'shut' : 'open'} the window · Shift+${keyLabel()} to ${state?.drawn ? 'open' : 'draw'} the curtains`;
          },
          act: (shift) => {
            const state = roomRef.current.windows[spot.id];
            if (shift) {
              onRoomActionRef.current('curtains', { target: spot.id, on: !state?.drawn });
            } else {
              onRoomActionRef.current('window', { target: spot.id, on: !state?.open });
            }
          },
        }));
        aimTargetsRef.current = [...aimTargetsRef.current, ...windowTargets];
        obstaclesRef.current = room.layout.obstacles;
        const winter = new WinterDecor(
          scene,
          room,
          window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        );
        winter.setViewport(renderer.domElement.clientHeight, camera.fov);
        winterRef.current = winter;
        showWinter(winter, room.layout.obstacles, themeRef.current === 'winter');
        const decor = new HalloweenDecor(
          scene,
          room,
          window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        );
        decor.setViewport(renderer.domElement.clientHeight, camera.fov);
        decorRef.current = decor;
        outside.setTheme(themeRef.current);
        decor.setVisible(themeRef.current === 'halloween');
        ambience.setTheme(themeRef.current);

        // The fire's crackle: needs a user gesture to start (browser audio
        // policy) — the first click or key press in the room does it.
        // The night outside, loudest by a window (nightAmbience.ts).
        const night = new NightAmbience();
        night.setTheme(themeRef.current);
        night.setWeather(roomRef.current.weather);
        nightRef.current = night;
        startNight = () => {
          night.start();
          weatherAudio.start();
        };
        document.addEventListener('pointerdown', startNight);
        document.addEventListener('keydown', startNight);
        // The night and the rain, heard through the nearest window — louder
        // through an open one, softer through drawn curtains.
        updateNight = (dt: number) => {
          let nearest = Infinity;
          let open = false;
          let drawn = false;
          for (const spot of windows.list()) {
            const distance = Math.hypot(
              camera.position.x - spot.center.x,
              camera.position.z - spot.center.z,
            );
            if (distance < nearest) {
              nearest = distance;
              open = spot.state.open;
              drawn = spot.state.drawn && !spot.state.open;
            }
          }
          night.update(dt, nearest, open, drawn);
          weatherAudio.update(dt, nearest, open, drawn);
        };

        const fireSpot = room.fireSpot;
        if (fireSpot) {
          const fireAudio = new FireAmbience();
          fireAudioRef = fireAudio;
          startFireAudio = () => fireAudio.start();
          document.addEventListener('pointerdown', startFireAudio);
          document.addEventListener('keydown', startFireAudio);
          // Across the floor only: the top-down table view lifts the camera
          // high above the table, which isn't "further from the fire".
          updateFireAudio = (dt: number) =>
            fireAudio.update(
              dt,
              Math.hypot(camera.position.x - fireSpot.x, camera.position.z - fireSpot.z),
            );
        }

        if (room.tvScreen) {
          const tv = new TvScreen(container, scene, room.tvScreen, () => {
            // This browser can't show the TV (TvScreen.verify): clips play
            // in the corner player instead, picking up where they were.
            tvRef.current = null;
            tv.dispose();
            if (!disposed) setTvElement(null);
          });
          tvRef.current = tv;
          setTvElement(tv.element);
        }

        // The board's brass needs something to reflect; the room has no
        // environment map of its own (a room-wide one would relight it all).
        const pmrem = new THREE.PMREMGenerator(renderer);
        brassEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
        const soundboardWall = new SoundboardWall(scene, 0, brassEnv);
        soundboardWall.sync(soundboardRef.current, soundboardSlotsRef.current);
        soundboardWallRef.current = soundboardWall;

        const pinboard = createPinboard(scene);
        syncPinboard(pinboard, photosRef.current);
        pinboardRef.current = pinboard;

        // The flashlight's beam (gadgets phase 3): one light for the one
        // flashlight, aimed each frame by aimFlashlightBeam (the animate
        // loop below) from whoever holds it.
        const flashlight = new THREE.SpotLight(0xfff0d0, 0, 10, Math.PI / 7, 0.45, 1.2);
        flashlight.name = 'flashlight-beam';
        const flashlightTarget = new THREE.Object3D();
        flashlight.target = flashlightTarget;
        scene.add(flashlight, flashlightTarget);
        flashlightRef.current = flashlight;
        flashlightTargetRef.current = flashlightTarget;

        const whiteboardSurface = room.whiteboardSurface;
        if (whiteboardSurface) {
          const board = new WhiteboardCanvas(WHITEBOARD_LINE_COUNT);
          board.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
          whiteboardSurface.material = new THREE.MeshStandardMaterial({
            map: board.texture,
            // Matte enough that the lamp's highlight never washes out the ink.
            roughness: 0.7,
          });
          board.draw(
            whiteboardRef.current.map((line) => ({
              text: line.text,
              color: inkColorFor(line, playersRef.current),
            })),
          );
          whiteboardCanvasRef.current = board;
        }
        const whiteboardRaycaster = new THREE.Raycaster();
        whiteboardRaycaster.far = WHITEBOARD_RANGE;

        interactablesRef.current = [
          { id: 'light', position: LIGHT_SWITCH_SPOT, range: LIGHT_SWITCH_RANGE },
          { id: 'lamp', position: LAMP_POSITION, range: LAMP_RANGE },
          {
            id: 'table',
            position: { x: room.layout.table.center.x, z: room.layout.table.center.z },
            range:
              Math.max(room.layout.table.halfWidth, room.layout.table.halfDepth) +
              TABLE_APPROACH_MARGIN,
          },
          ...(room.chestSpot
            ? [
                {
                  id: 'chest',
                  position: { x: room.chestSpot.x, z: room.chestSpot.z },
                  range: CHEST_RANGE,
                },
              ]
            : []),
        ];

        tableChairsRef.current = room.chairs;
        seatsRef.current = room.seats;
        room.chairs?.apply(chairCount(playersRef.current.length));
        gadgetLibrary.preload();
        const avatars = new PlayerAvatars(scene, characterLibrary, room.seats, gadgetLibrary);
        avatars.sync(playersRef.current, playerId, inventoryRef.current);
        avatarsRef.current = avatars;
        const roomLife = new RoomLife(scene, room, avatars, playerId);
        roomLife.syncPlayers(playersRef.current);
        roomLife.setLightOn(lightOnRef.current, true);
        if (winter.wreath) roomLife.hangOnDoor(winter.wreath);

        // The record player: a cabinet by the reading lamp, its turntable,
        // and the music itself (MusicPlayer), following GameState.room.
        const darkWood = roomWood(room.object3D);
        // The lectern by the bookshelf, with the host's books (books.ts).
        const lectern = new Lectern(scene, darkWood);
        lecternRef.current = lectern;
        room.layout.obstacles.push(lectern.obstacle);
        lectern.setBooks(booksRef.current);
        const openBooks = () => {
          controller.controls.unlock();
          setBooksOpen(true);
        };
        const recordPlayer = new RecordPlayer(scene, darkWood);
        recordPlayerRef.current = recordPlayer;
        room.layout.obstacles.push(recordPlayer.obstacle);
        const music = new MusicPlayer(
          () => Date.now() + serverOffsetRef.current,
          (soundId) => soundboardRef.current.find((sound) => sound.id === soundId)?.url ?? null,
        );
        musicRef.current = music;
        music.setRecord(roomRef.current.record);
        recordPlayer.setPlaying(roomRef.current.record?.record ?? null);
        aimTargetsRef.current = [
          ...aimTargetsRef.current,
          {
            id: 'lectern',
            center: lectern.aim.center,
            radius: lectern.aim.radius,
            reach: 2.4,
            prompt: () => `Press ${keyLabel()} to read the books`,
            act: openBooks,
          },
          {
            id: 'bookshelf',
            center: { x: -4.05, y: 1.1, z: -3.62 },
            radius: 0.55,
            reach: 3,
            prompt: () => `Press ${keyLabel()} to look at the books`,
            act: openBooks,
          },
          {
            id: 'record-player',
            center: recordPlayer.aim.center,
            radius: recordPlayer.aim.radius,
            reach: 2.4,
            prompt: () =>
              roomRef.current.record
                ? `Press ${keyLabel()} for the records · Shift+${keyLabel()} to take this one off`
                : `Press ${keyLabel()} to put a record on`,
            act: (shift) => {
              if (shift && roomRef.current.record) {
                onRoomActionRef.current('record', { on: false });
                return;
              }
              controller.controls.unlock();
              setRecordOpen(true);
            },
          },
        ];
        roomLifeRef.current = roomLife;

        // The sofa, the armchair and the rocking chair: look at one and press
        // E to sit (one player per seat); E again, or walking off, gets up.
        // Like the table, the camera sits at once and the server can refuse.
        let myLounge: LoungeSeat | null = null;
        const sendLounge = (seat: LoungeSeat, on: boolean) => {
          socket.emit(
            SocketEvent.ObjectInteract,
            {
              sessionId,
              playerId,
              objectId: 'lounge',
              target: seat,
              on,
            } satisfies ObjectInteractRequest,
            (response: ObjectInteractResponse) => {
              if (response.ok) return;
              if (on && myLounge === seat) {
                controller.getUp();
                myLounge = null;
              }
              onNotifyRef.current(response.error);
            },
          );
        };
        const sitOn = (seat: LoungeSeat) => {
          const spot = LOUNGE_SPOTS[seat];
          controller.lounge(loungeEye(spot), spot.yaw);
          myLounge = seat;
          sendLounge(seat, true);
        };
        const getUp = () => {
          const seat = myLounge;
          controller.getUp();
          myLounge = null;
          if (seat) sendLounge(seat, false);
        };
        const loungeTargets: AimTarget[] = LOUNGE_SEATS.map((seat) => {
          const spot = LOUNGE_SPOTS[seat];
          const someoneElse = () => {
            const sitter = sitterOn(seat, playersRef.current);
            return sitter && sitter.id !== playerId ? sitter : null;
          };
          return {
            id: `seat:${seat}`,
            center: spot.cushion,
            radius: seat.startsWith('sofa') ? 0.27 : 0.32,
            reach: 2.4,
            prompt: () => {
              if (myLounge === seat) return `Press ${keyLabel()} to get up`;
              const sitter = someoneElse();
              if (sitter) return `${sitter.name} is sitting there`;
              return `Press ${keyLabel()} to sit ${seat.startsWith('sofa') ? 'on' : 'in'} ${spot.name}`;
            },
            act: () => {
              if (myLounge === seat) getUp();
              else if (!someoneElse()) sitOn(seat);
            },
          };
        });
        aimTargetsRef.current = [...aimTargetsRef.current, ...loungeTargets];
        // Tea and cocoa from the tea set by the sofa; popcorn from the bowl on
        // the table's corner (refreshments.ts). Your own mug in first person.
        const snackBowl = buildSnackBowl(darkWood);
        scene.add(snackBowl);
        const heldMug = new HeldMugView(camera, scene);
        heldMugRef.current = heldMug;
        const selfDrink = (): Drink | null =>
          playersRef.current.find((player) => player.id === playerId)?.carrying ?? null;
        heldMug.setDrink(selfDrink());
        const sendGesture = (gesture: Gesture) =>
          socket.emit(SocketEvent.PlayerGesture, {
            sessionId,
            playerId,
            gesture,
          } satisfies PlayerGestureRequest);
        const whereIs = (id: string): { x: number; z: number } | null =>
          id === playerId ? camera.position : (avatarsRef.current?.objectFor(id)?.position ?? null);
        const hearing = () => ({
          x: camera.position.x,
          z: camera.position.z,
          yaw: controller.getYaw(),
        });
        // A toast clinks when someone else with a drink is close enough to
        // meet mugs.
        const clinkIfToasting = (toasterId: string) => {
          const at = whereIs(toasterId);
          if (!at) return;
          const company = playersRef.current.some((player) => {
            if (player.id === toasterId || !player.carrying) return false;
            const there = whereIs(player.id);
            return there !== null && Math.hypot(there.x - at.x, there.z - at.z) < 2.2;
          });
          if (company) playClink(placeSound(hearing(), at, 1.5, 10));
        };
        const sip = () => {
          heldMug.play('sip');
          playSip({ volume: 0.55, pan: 0 });
          sendGesture('sip');
        };
        const raiseMug = () => {
          heldMug.play('cheers');
          sendGesture('cheers');
          clinkIfToasting(playerId);
        };
        let lastSnackAt = -Infinity;
        handleRemoteGesture = (request: PlayerGestureRequest) => {
          avatarsRef.current?.gesture(request.playerId, request.gesture);
          if (isPlayerMuted(request.playerId)) return;
          const at = whereIs(request.playerId);
          if (request.gesture === 'snack' && at) playCrunch(placeSound(hearing(), at, 0.8, 6));
          if (request.gesture === 'cheers') {
            avatarsRef.current?.say(request.playerId, 'Cheers!');
            clinkIfToasting(request.playerId);
          }
          if (request.gesture === 'pet' && cat.pet()) purr.pet();
        };
        socket.on(SocketEvent.PlayerGesture, handleRemoteGesture);
        aimTargetsRef.current = [
          ...aimTargetsRef.current,
          {
            id: 'tea-set',
            center: TEA_SET,
            radius: 0.24,
            reach: 2.3,
            prompt: () => {
              const drink = selfDrink();
              return drink
                ? `Press ${keyLabel()} to set your ${drink} down`
                : `Press ${keyLabel()} to pour a cup of tea · Shift+${keyLabel()} for hot cocoa`;
            },
            act: (shift) =>
              selfDrink()
                ? onRoomActionRef.current('teaset', { on: false })
                : onRoomActionRef.current('teaset', { target: shift ? 'cocoa' : 'tea', on: true }),
          },
          {
            id: 'snack-bowl',
            center: { x: SNACK_BOWL.x, y: SNACK_BOWL.y + 0.05, z: SNACK_BOWL.z },
            radius: 0.13,
            reach: 2.2,
            prompt: () => `Press ${keyLabel()} to grab some popcorn`,
            act: () => {
              if (performance.now() - lastSnackAt < 900) return;
              lastSnackAt = performance.now();
              playCrunch({ volume: 0.7, pan: 0 });
              sendGesture('snack');
            },
          },
        ];
        const rockingSpot = LOUNGE_SPOTS['rocking-chair'];
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // The cat: asleep by the fire (or wherever it's wandered to — the same
        // spot for everyone, from the server's clock), purring close by.
        const cat = new RoomCat(scene);
        const purr = new CatPurr();
        purr.start();
        const catNow = () => catTarget(Date.now() + serverOffsetRef.current, playersRef.current);
        disposeCat = () => {
          cat.dispose();
          purr.dispose();
        };
        aimTargetsRef.current = [
          ...aimTargetsRef.current,
          {
            id: 'cat',
            center: cat.aimPoint,
            radius: 0.2,
            reach: 2,
            prompt: () => `Press ${keyLabel()} to pet ${CAT_NAME}`,
            disabled: () => !cat.resting,
            priority: 1,
            act: () => {
              if (!cat.pet()) return;
              purr.pet();
              if (Math.random() < 0.4) playMrrp(placeSound(hearing(), cat.position, 1, 6));
              sendGesture('pet');
            },
          },
        ];

        const diceManager = new DiceManager(scene, (count) =>
          playDiceClatter(count, TUMBLE_SECONDS),
        );
        diceManager.sync(diceRef.current, playersRef.current);
        const diceRaycaster = new THREE.Raycaster();
        diceRaycaster.far = DIE_REACH;
        diceManagerRef.current = diceManager;

        const miniManager = new MiniManager(scene, characterLibrary, room.layout.table);
        miniManager.sync(minisRef.current, playersRef.current);
        miniManagerRef.current = miniManager;

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
            outside,
            music,
            recordPlayer,
            cat,
            // Live-tunable: the arm poses and grips read this every frame.
            holds: HOLDS,
          };
        }

        // Reconciles a rejoin/reload while GameState already has this player
        // seated (a lingering flag — a disconnect doesn't clear it, same as
        // every other per-player status): without this, the fresh controller
        // would start standing while the server still thinks they're seated,
        // and the next E-press would incorrectly toggle the server *back* to
        // standing instead of sitting the rejoined player down.
        const selfAtStart = playersRef.current.find((candidate) => candidate.id === playerId);
        if (selfAtStart?.seated) {
          controller.sit(
            selfAtStart.seatIndex !== null ? (room.seats[selfAtStart.seatIndex] ?? null) : null,
          );
        } else if (selfAtStart?.lounge) {
          const spot = LOUNGE_SPOTS[selfAtStart.lounge];
          controller.lounge(loungeEye(spot), spot.yaw);
          myLounge = selfAtStart.lounge;
        }
        controller.onWalkOff = getUp;
        applySeatedView();

        // Sitting and standing are explicit (not a toggle) and acknowledged:
        // if the server refuses a chair (someone took it a moment earlier),
        // the camera goes back to standing and the player is told why.
        const sendSeated = (seatedNow: boolean, seatIndex: number | null) => {
          socket.emit(
            SocketEvent.ObjectInteract,
            {
              sessionId,
              playerId,
              objectId: 'table',
              seated: seatedNow,
              ...(seatIndex !== null ? { seatIndex } : {}),
            } satisfies ObjectInteractRequest,
            (response: ObjectInteractResponse) => {
              if (!response.ok) {
                if (seatedNow) {
                  controller.stand();
                  applySeatedView();
                }
                onNotifyRef.current(response.error);
              }
            },
          );
        };
        const sitDown = () => {
          const taken = new Set(
            playersRef.current
              .filter((other) => other.id !== playerId && other.seated && other.seatIndex !== null)
              .map((other) => other.seatIndex!),
          );
          const seatIndex = pickChair(room.seats, taken, {
            x: camera.position.x,
            z: camera.position.z,
          });
          controller.sit(seatIndex !== null ? room.seats[seatIndex]! : null);
          applySeatedView();
          sendSeated(true, seatIndex);
        };
        const standUp = () => {
          controller.stand();
          applySeatedView();
          sendSeated(false, null);
        };
        // The camera (gadgets phase 2) — a fallback action, not tied to any
        // location: available whenever the interact key doesn't hit anything
        // more specific and the local player currently holds it. The flash
        // and shutter play immediately; the upload (and so the photo
        // reaching the pinboard) happens in the background.
        let lastPhotoAt = -Infinity;
        const takePhoto = () => {
          if (
            capturingPhotoRef.current ||
            performance.now() - lastPhotoAt < PHOTO_MIN_INTERVAL_MS
          ) {
            return;
          }
          lastPhotoAt = performance.now();
          capturingPhotoRef.current = true;
          // (A player who turned flashing effects off gets no white flash.)
          setCameraFlash(flashingAllowed());
          playShutterSound();
          window.setTimeout(() => setCameraFlash(false), 180);
          // The renderer isn't created with preserveDrawingBuffer (a
          // per-frame cost not worth paying for every frame just so an
          // occasional photo works) — the canvas's WebGL buffer can already
          // be cleared by the time toBlob's callback runs. Rendering once
          // more, synchronously, right before reading it back keeps the
          // buffer valid for this capture without that always-on cost.
          renderer.render(scene, camera);
          // A square from the middle of the view, at pinboard size: the
          // board shows photos square, and a full-window capture would
          // be squashed there (and upload a few MB for a 180 px slot).
          const view = renderer.domElement;
          const side = Math.min(view.width, view.height);
          const photo = document.createElement('canvas');
          photo.width = PHOTO_SIZE;
          photo.height = PHOTO_SIZE;
          photo
            .getContext('2d')
            ?.drawImage(
              view,
              (view.width - side) / 2,
              (view.height - side) / 2,
              side,
              side,
              0,
              0,
              PHOTO_SIZE,
              PHOTO_SIZE,
            );
          photo.toBlob(
            (blob) => {
              if (!blob) {
                capturingPhotoRef.current = false;
                onNotifyRef.current("Couldn't take that photo.");
                return;
              }
              uploadImage(new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
                .then((url) => onCapturePhotoRef.current(url))
                .catch(() => onNotifyRef.current("Couldn't take that photo."))
                .finally(() => {
                  capturingPhotoRef.current = false;
                });
            },
            'image/jpeg',
            0.85,
          );
        };
        toggleSeatedViewRef.current = () => {
          if (!controller.isSeated || !controller.hasChair) {
            return;
          }
          controller.setSeatedView(controller.seatedView === 'chair' ? 'table' : 'chair');
          applySeatedView();
        };

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
          lastRedrawnSignatureRef.current = paintSignature(activeSceneRef.current);
          void tableCanvas.redraw(activeSceneRef.current, currentDrawings);
          tableCanvasRef.current = tableCanvas;

          let currentDrawingId: string | null = null;
          tableDrawing = new TableDrawing({
            camera,
            domElement: renderer.domElement,
            tableTopMesh,
            table: room.layout.table,
            isDrawingAllowed: () => !controller.controls.isLocked,
            canMark: () => canDrawRef.current,
            // Minis and dice can be picked up and dragged (docs/decisions.md,
            // "Minis"); a die that's pressed but not moved rolls, as before.
            startDrag: (raycaster) => {
              // Anyone can push any mini or die around, like on a real
              // table (a secret die only ever shows for its owner anyway).
              const miniOwner = miniManagerRef.current?.pick(raycaster) ?? null;
              if (miniOwner) {
                const send = throttle(
                  (point: Point2D) => onMoveMiniRef.current(miniOwner, point),
                  DRAG_SEND_MS,
                );
                return {
                  move: (raw) => {
                    const point = insetOnTable(raw, MINI_EDGE_UNITS);
                    miniManagerRef.current?.carry(miniOwner, point);
                    send.call(point);
                  },
                  end: () => {
                    send.flush();
                    miniManagerRef.current?.release(miniOwner);
                  },
                };
              }
              const dieId = diceManagerRef.current?.pick(raycaster) ?? null;
              if (!dieId) {
                return null;
              }
              const canMove = diceRef.current.some((candidate) => candidate.id === dieId);
              const send = throttle(
                (position: Vector3) => onMoveDieRef.current(dieId, position),
                DRAG_SEND_MS,
              );
              let last: Vector3 | null = null;
              return {
                move: (raw) => {
                  if (!canMove) return;
                  const point = insetOnTable(raw, DIE_EDGE_UNITS);
                  last = canvasToWorld(point, room.layout.table, TABLE_UNITS);
                  diceManagerRef.current?.carry(dieId, last);
                  send.call(last);
                },
                end: (moved) => {
                  if (!moved) {
                    onRollDiceRef.current([dieId]);
                    return;
                  }
                  send.flush();
                  if (!last) return;
                  // Set it back down where it was let go.
                  diceManagerRef.current?.carry(dieId, { ...last, y: last.y - DIE_DRAG_LIFT });
                },
              };
            },
            canPickUp: (raycaster) => {
              const miniOwner = miniManagerRef.current?.pick(raycaster) ?? null;
              if (miniOwner) return true;
              return diceManagerRef.current?.pick(raycaster) !== null;
            },
            getTool: () => drawToolRef.current,
            onPing: sendPing,
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

          // Walking (mouse-look): right-click pings whatever spot of the table
          // the crosshair is on.
          pingSurface = room.layout.table;
          const pingRaycaster = new THREE.Raycaster();
          handleLockedPing = (event: MouseEvent) => {
            if (!controller.controls.isLocked || event.button !== 2) {
              return;
            }
            pingRaycaster.setFromCamera(SCREEN_CENTER, camera);
            const [hit] = pingRaycaster.intersectObject(tableTopMesh, false);
            if (!hit) {
              return;
            }
            const table = room.layout.table;
            sendPing(
              tableLocalToCanvas(
                hit.point.x - table.center.x,
                hit.point.z - table.center.z,
                table.halfWidth,
                table.halfDepth,
                TABLE_CANVAS_SIZE,
              ),
            );
          };
          renderer.domElement.addEventListener('mousedown', handleLockedPing);
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
          // other key, not re-trigger room interactions underneath it. Same
          // for any other open dialog — isInteractKeyPress's isTypingTarget
          // check only catches a focused text input, not e.g. a dialog's
          // own buttons, so this still needs checking explicitly.
          if (
            assignSlotIndexRef.current !== null ||
            whiteboardOpenRef.current ||
            inventoryOpenRef.current ||
            walkieOpenRef.current ||
            calculatorOpenRef.current ||
            recordOpenRef.current ||
            booksOpenRef.current
          ) {
            return;
          }
          // The room consumes this keystroke. Without this, a dialog it opens
          // (the whiteboard editor, the assign-sound menu) mounts and focuses
          // its input before the browser inserts the key's character — so the
          // "e" that opened it got typed into it.
          event.preventDefault();
          if (controller.isSeated) {
            standUp();
            return;
          }
          const targetedSlot = boardTargetSlotRef.current;
          if (targetedSlot !== null && !canUseSoundsRef.current) {
            onNotifyRef.current(SOUNDS_OFF_ERROR);
            return;
          }
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
          if (targetedDieRef.current) {
            onRollDiceRef.current([targetedDieRef.current]);
            return;
          }
          if (whiteboardTargetedRef.current) {
            controller.controls.unlock();
            setWhiteboardOpen(true);
            return;
          }
          if (aimTargetRef.current) {
            aimTargetRef.current.act(event.shiftKey);
            return;
          }
          if (controller.isLounging) {
            getUp();
            return;
          }
          const nearestId = nearestInteractableIdRef.current;
          if (nearestId === 'light' || nearestId === 'lamp') {
            onObjectInteractRef.current(nearestId);
          } else if (nearestId === 'table') {
            sitDown();
          } else if (nearestId === 'chest') {
            controller.controls.unlock();
            setInventoryOpen(true);
          }
        };
        document.addEventListener('keydown', handleInteractKey);

        // Any open dialog (the assign-sound overlay, the whiteboard editor,
        // the chest, the radio, the calculator) already owns input focus,
        // but its own buttons aren't a "typing target" — isTypingTarget
        // alone wouldn't stop V, R or an emote key from firing underneath.
        const aDialogIsOpen = () =>
          assignSlotIndexRef.current !== null ||
          whiteboardOpenRef.current ||
          inventoryOpenRef.current ||
          walkieOpenRef.current ||
          calculatorOpenRef.current ||
          recordOpenRef.current ||
          booksOpenRef.current;

        // V: switch between looking out from the chair and the table view.
        handleViewKey = (event: KeyboardEvent) => {
          if (
            event.code !== 'KeyV' ||
            event.repeat ||
            isTypingTarget(event.target) ||
            aDialogIsOpen()
          ) {
            return;
          }
          if (controller.isSeated) {
            event.preventDefault();
            toggleSeatedViewRef.current();
          }
        };
        document.addEventListener('keydown', handleViewKey);

        // R: use whatever single item the player currently holds (gadgets
        // phase 6 — single item slot) — a fixed key, not the rebindable
        // interact key, so E stays exclusively for room interactables (the
        // light, the table, the chest, the soundboard, dice, the
        // whiteboard) regardless of which gadget is held. A silent no-op
        // with nothing held (server would refuse the camera/flashlight/
        // walkie actions anyway; this just skips the round trip). The
        // interact key can never be R (settings.ts, RESERVED_KEYS).
        handleUseItemKey = (event: KeyboardEvent) => {
          if (
            event.code !== 'KeyR' ||
            event.repeat ||
            isTypingTarget(event.target) ||
            aDialogIsOpen()
          ) {
            return;
          }
          if (selfDrink()) {
            sip();
            return;
          }
          const heldKind = inventoryRef.current.find((item) => item.heldBy === playerId)?.kind;
          if (!heldKind) {
            return;
          }
          switch (heldKind) {
            case 'camera':
              event.preventDefault();
              takePhoto();
              break;
            case 'flashlight':
              event.preventDefault();
              onToggleFlashlightRef.current();
              break;
            case 'walkie':
              // Consumes the keystroke — without this, the same "r" that
              // opens the dialog gets typed into its now-focused input
              // (the same stray-key issue Milestone 8's table sit-down
              // fixed for E).
              event.preventDefault();
              controller.controls.unlock();
              setWalkieOpen(true);
              break;
            case 'calculator':
              event.preventDefault();
              controller.controls.unlock();
              setCalculatorOpen(true);
              break;
          }
        };
        document.addEventListener('keydown', handleUseItemKey);

        // Chat was opened from a walking view: sending (or Esc) hands the
        // mouse straight back to looking around (ChatPanel.tsx).
        handleResumeLook = () => {
          if (controller.seatedView !== 'table') {
            controller.controls.lock();
          }
        };
        window.addEventListener(RESUME_LOOK_EVENT, handleResumeLook);

        // Emotes on the number keys: everyone else sees this player's
        // character perform it (the local player gets a short confirmation,
        // since they can't see their own avatar from first person).
        handleEmoteKey = (event: KeyboardEvent) => {
          if (event.repeat || isTypingTarget(event.target) || aDialogIsOpen()) {
            return;
          }
          // 7: raise your mug to everyone — seated at the table too.
          if (event.code === 'Digit7') {
            if (selfDrink()) raiseMug();
            return;
          }
          if (controller.isSeated) {
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

        const aimDirection = new THREE.Vector3();
        let lastSentAt = 0;
        const lastSentPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
        let lastSentYaw = Infinity;

        const animate = (timestamp?: number) => {
          animationFrameId = requestAnimationFrame(animate);
          timer.update(timestamp);
          // Capped: after the tab was hidden, the first frame's delta can be
          // seconds long — one huge step could carry the player past thin
          // furniture (collision checks where a step ends, not the path).
          const delta = Math.min(timer.getDelta(), MAX_FRAME_SECONDS);
          controller.update(delta);
          diceManagerRef.current?.update(delta, camera);
          miniManagerRef.current?.update(delta);
          tablePings.update(delta);
          const fireNow = fireLevel(
            roomRef.current.fireStokedAt,
            Date.now() + serverOffsetRef.current,
          );
          ambienceRef.current?.setFireLevel(fireNow);
          fireAudioRef?.setLevel(fireNow);
          ambienceRef.current?.update(delta, timer.getElapsed());
          updateFireAudio?.(delta);
          updateNight?.(delta);
          avatarsRef.current?.update(delta);
          roomLife.update(
            delta,
            camera,
            controller.getYaw(),
            !controller.isSeated && !controller.isLounging && controller.controls.isLocked,
          );
          // The rocking chair rocks whoever's in it — and your view, if it's
          // you (unless you've asked your system for less motion).
          avatars.rockingChairAngle = roomLife.rockingChair.angle;
          if (myLounge === 'rocking-chair' && !reducedMotion) {
            controller.setLoungeEye(loungeEye(rockingSpot, roomLife.rockingChair.angle));
          }
          if (flashlightRef.current) {
            aimFlashlightBeam(flashlightRef.current, playersRef.current, playerId, camera, {
              lensOf: (id) => avatarsRef.current?.flashlightLensOf(id),
              avatarOf: (id) => avatarsRef.current?.objectFor(id),
            });
          }
          soundboardWallRef.current?.update(delta);
          decorRef.current?.update(delta, timer.getElapsed());
          winterRef.current?.update(delta, timer.getElapsed());
          windowsRef.current?.update(delta);
          recordPlayer.update(delta);
          heldMug.update(delta, controller.seatedView !== 'table');
          cat.update(delta, catNow(), reducedMotion);
          purr.update(delta, placeSound(hearing(), cat.position, 0.6, 3.5));
          {
            const place = placeSound(
              { x: camera.position.x, z: camera.position.z, yaw: controller.getYaw() },
              recordPlayer.soundSpot,
              2,
              16,
            );
            // Heard all over the room, a little louder close by.
            music.setPlacement({ volume: 0.55 + 0.45 * place.volume, pan: place.pan * 0.5 });
          }
          // Lightning through the windows (a storm; never for a player who
          // turned flashing effects off).
          outside?.setFlashAllowed(flashingAllowed());
          if (roomLightsRef.current) {
            setLightningFlash(roomLightsRef.current, outside?.flash ?? 0, lightOnRef.current);
          }
          outside?.render(renderer, camera, delta, timer.getElapsed());
          tableCanvasRef.current?.flush(renderer);
          renderer.render(scene, camera);
          tvRef.current?.render(
            camera,
            renderer.domElement.clientWidth,
            renderer.domElement.clientHeight,
            timer.getElapsed(),
            seatedViewRef.current !== 'table',
          );

          const nearest =
            controller.isSeated || controller.isLounging
              ? null
              : nearestInteractable(
                  { x: camera.position.x, z: camera.position.z },
                  interactablesRef.current,
                );
          const nearestId = controller.isSeated
            ? 'table'
            : controller.isLounging
              ? 'lounge'
              : (nearest?.id ?? null);
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
          soundboardWallRef.current?.setTargeted(targetedSlot);

          let targetedDie: string | null = null;
          if (
            targetedSlot === null &&
            !controller.isSeated &&
            controller.controls.isLocked &&
            assignSlotIndexRef.current === null &&
            !whiteboardOpenRef.current
          ) {
            diceRaycaster.setFromCamera(SCREEN_CENTER, camera);
            targetedDie = diceManager.pick(diceRaycaster);
          }
          targetedDieRef.current = targetedDie;
          const targetedDieKind =
            diceRef.current.find((candidate) => candidate.id === targetedDie)?.kind ?? null;

          let whiteboardTargeted = false;
          if (
            targetedSlot === null &&
            targetedDie === null &&
            whiteboardSurface &&
            !controller.isSeated &&
            controller.controls.isLocked &&
            assignSlotIndexRef.current === null &&
            !whiteboardOpenRef.current
          ) {
            whiteboardRaycaster.setFromCamera(SCREEN_CENTER, camera);
            whiteboardTargeted =
              whiteboardRaycaster.intersectObject(whiteboardSurface, false).length > 0;
          }
          whiteboardTargetedRef.current = whiteboardTargeted;
          // The candles, the fire, …: whatever the crosshair is on, if nothing
          // above already is.
          let aimTarget: AimTarget | null = null;
          if (
            targetedSlot === null &&
            targetedDie === null &&
            !whiteboardTargeted &&
            !controller.isSeated &&
            controller.controls.isLocked &&
            !aDialogIsOpen()
          ) {
            camera.getWorldDirection(aimDirection);
            aimTarget = pickAimTarget(
              { origin: camera.position, direction: aimDirection },
              aimTargetsRef.current,
            );
          }
          aimTargetRef.current = aimTarget;
          const aimPrompt = aimTarget?.prompt() ?? null;
          const boardTarget =
            targetedSlot !== null
              ? {
                  slotIndex: targetedSlot,
                  soundName:
                    soundboardRef.current.find(
                      (sound) =>
                        sound.id === soundboardWallRef.current?.getSlotSoundId(targetedSlot),
                    )?.name ?? null,
                }
              : null;

          const heldItemKind: HeldKind | null =
            selfDrink() ??
            inventoryRef.current.find((item) => item.heldBy === playerId)?.kind ??
            null;
          const promptKey = `${nearestId}|${controller.seatedView}|${interactKeyRef.current}|${targetedSlot}|${boardTarget?.soundName}|${whiteboardTargeted}|${targetedDie}|${heldItemKind}|${aimPrompt}`;
          if (promptKey !== lastPromptKeyRef.current) {
            lastPromptKeyRef.current = promptKey;
            setInteractionPrompt(
              aimPrompt ??
                promptFor(
                  nearestId,
                  controller.seatedView,
                  controller.hasChair,
                  interactKeyRef.current,
                  boardTarget,
                  whiteboardTargeted,
                  targetedDieKind,
                  heldItemKind,
                ),
            );
          }

          // No position to sync while seated — the camera is locked to a
          // fixed top-down view above the table, not the player's real
          // position (FirstPersonController.sit()) — or on the sofa or a
          // chair, where everyone sees them by their seat (Player.lounge).
          if (controller.isSeated || controller.isLounging) {
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
      },
      (error: unknown) => {
        console.error('Loading the room failed:', error);
        if (!disposed) {
          setRoomState('failed');
        }
      },
    );

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      socket.off(SocketEvent.PlayerMove, handleRemoteMove);
      socket.off(SocketEvent.PlayerEmote, handleRemoteEmote);
      socket.off(SocketEvent.TablePing, handleRemotePing);
      if (handleLockedPing) {
        renderer.domElement.removeEventListener('mousedown', handleLockedPing);
      }
      tablePings.dispose();
      socket.off(SocketEvent.DrawingStart, handleDrawingStart);
      socket.off(SocketEvent.DrawingUpdate, handleDrawingUpdate);
      socket.off(SocketEvent.DrawingEnd, handleDrawingEnd);
      socket.off(SocketEvent.DrawingDelete, handleDrawingDelete);
      socket.off(SocketEvent.SoundPlay, handleSoundPlayed);
      if (handleResumeLook) {
        window.removeEventListener(RESUME_LOOK_EVENT, handleResumeLook);
      }
      if (handleInteractKey) {
        document.removeEventListener('keydown', handleInteractKey);
      }
      if (handleRemoteGesture) {
        socket.off(SocketEvent.PlayerGesture, handleRemoteGesture);
      }
      heldMugRef.current?.dispose();
      heldMugRef.current = null;
      if (handleEmoteKey) {
        document.removeEventListener('keydown', handleEmoteKey);
      }
      if (handleViewKey) {
        document.removeEventListener('keydown', handleViewKey);
      }
      if (handleUseItemKey) {
        document.removeEventListener('keydown', handleUseItemKey);
      }
      cancelAnimationFrame(animationFrameId);
      timer.dispose();
      controllerRef.current?.dispose();
      controllerRef.current = null;
      avatarsRef.current?.dispose();
      avatarsRef.current = null;
      roomLifeRef.current?.dispose();
      roomLifeRef.current = null;
      diceManagerRef.current?.dispose();
      diceManagerRef.current = null;
      miniManagerRef.current?.dispose();
      miniManagerRef.current = null;
      tableDrawing?.dispose();
      tableCanvasRef.current?.dispose();
      tableCanvasRef.current = null;
      if (lampRef.current) {
        disposeLamp(lampRef.current);
        lampRef.current = null;
      }
      soundboardWallRef.current?.dispose();
      soundboardWallRef.current = null;
      if (pinboardRef.current) {
        disposePinboard(pinboardRef.current);
        pinboardRef.current = null;
      }
      if (flashlightRef.current) {
        scene.remove(flashlightRef.current);
        if (flashlightTargetRef.current) scene.remove(flashlightTargetRef.current);
        flashlightRef.current = null;
        flashlightTargetRef.current = null;
      }
      brassEnv?.dispose();
      outside?.dispose();
      paintings.forEach((item) => item.dispose());
      outsideRef.current = null;
      decorRef.current?.dispose();
      decorRef.current = null;
      winterRef.current?.dispose();
      winterRef.current = null;
      windowsRef.current?.dispose();
      windowsRef.current = null;
      weatherAudioRef.current?.dispose();
      weatherAudioRef.current = null;
      recordPlayerRef.current?.dispose();
      recordPlayerRef.current = null;
      lecternRef.current?.dispose();
      lecternRef.current = null;
      scene.getObjectByName('snack-bowl')?.removeFromParent();
      disposeCat?.();
      musicRef.current?.dispose();
      musicRef.current = null;
      whiteboardCanvasRef.current?.dispose();
      whiteboardCanvasRef.current = null;
      roomLightsRef.current = null;
      ambienceRef.current?.dispose();
      ambienceRef.current = null;
      tvRef.current?.dispose();
      tvRef.current = null;
      if (startFireAudio) {
        document.removeEventListener('pointerdown', startFireAudio);
        document.removeEventListener('keydown', startFireAudio);
      }
      fireAudioRef?.dispose();
      if (startNight) {
        document.removeEventListener('pointerdown', startNight);
        document.removeEventListener('keydown', startNight);
      }
      nightRef.current?.dispose();
      nightRef.current = null;
      setTvElement(null);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [socket, sessionId, playerId]);

  return (
    <div ref={containerRef} className="room-view">
      <div className="room-vignette" aria-hidden="true" />
      {roomState === 'loading' && <RoomLoading />}
      {roomState === 'failed' && (
        <div className="room-loading" role="alert">
          <p className="room-loading-title">The room didn't load.</p>
          <p className="room-loading-detail">Check your connection and reload the page.</p>
        </div>
      )}
      {clipView &&
        tvElement &&
        !clipOnCard &&
        createPortal(
          <YouTubeEmbed view={clipView} width={TV_PLAYER_WIDTH} height={TV_PLAYER_HEIGHT} />,
          tvElement,
        )}
      {clipView && tvElement && !clipOnCard && (
        <div className="tv-now-playing" role="status">
          <span className="tv-now-icon" aria-hidden="true">
            📺
          </span>
          <span className="tv-now-text">
            <span className="tv-now-title" title={clipView.clip.title}>
              {clipView.clip.title}
            </span>
            <span className="tv-now-by">
              on the TV · played by {clipView.clip.playedBy}
              {!clipView.clip.playing && ' · paused'}
            </span>
          </span>
          <button type="button" onClick={() => setClipOnCard(true)}>
            Pop out
          </button>
          <ClipControls view={clipView} />
        </div>
      )}
      {clipView && (!tvElement || clipOnCard) && (
        <YouTubeClip
          view={clipView}
          onShowOnTv={tvElement ? () => setClipOnCard(false) : undefined}
        />
      )}
      {locked &&
        seatedView !== 'table' &&
        assignSlotIndex === null &&
        !whiteboardOpen &&
        !inventoryOpen &&
        !walkieOpen &&
        !calculatorOpen &&
        !recordOpen &&
        !booksOpen && <div className="crosshair" />}
      {cameraFlash && <div className="camera-flash" />}
      <HeldItems
        items={inventory.filter((item) => item.heldBy === playerId)}
        drink={players.find((player) => player.id === playerId)?.carrying ?? null}
      />
      {/* One bottom-center stack, so the prompt always sits above the hint
          instead of the two overlapping when the hint wraps. */}
      <div className="room-bottom-stack">
        {interactionPrompt &&
          assignSlotIndex === null &&
          !whiteboardOpen &&
          !inventoryOpen &&
          !walkieOpen &&
          !calculatorOpen &&
          !recordOpen &&
          !booksOpen &&
          // Seated in the chair view, the card below already says it.
          !(seated && !locked && seatedView !== 'table') && (
            <div className="interaction-prompt">{interactionPrompt}</div>
          )}
        {!locked &&
          seatedView !== 'table' &&
          assignSlotIndex === null &&
          !whiteboardOpen &&
          !inventoryOpen &&
          !walkieOpen &&
          !calculatorOpen &&
          !recordOpen &&
          !booksOpen && (
            <button
              type="button"
              className="room-view-overlay"
              onClick={() => controllerRef.current?.controls.lock()}
            >
              <span className="hint-title">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="6.5" y="3" width="11" height="18" rx="5.5" />
                  <path d="M12 3v6.5" />
                </svg>
                Click to look around
              </span>
              <span className="hint-keys">
                {seated ? (
                  <>
                    <HintKeys keys={[formatKeyCode(interactKey)]} label="stand up" />
                    <HintKeys keys={['V']} label="table view" />
                  </>
                ) : (
                  <>
                    <HintKeys keys={['W', 'A', 'S', 'D']} label="move" />
                    <HintKeys keys={['Shift']} label="run" />
                    <HintKeys keys={[formatKeyCode(interactKey)]} label="interact" />
                    <HintKeys keys={['1–6']} label="emote" />
                  </>
                )}
                <HintKeys keys={['Enter']} label="chat" />
                <HintKeys keys={['Esc']} label="free the mouse" />
              </span>
              <span className="hint-mouse">
                {canDraw ? 'Drag on the table to draw' : 'Drag minis and dice'} · click a die to
                roll it · right-click to ping
              </span>
            </button>
          )}
      </div>
      {whiteboardOpen && (
        <WhiteboardEditor
          lines={whiteboard}
          players={players}
          selfColor={players.find((candidate) => candidate.id === playerId)?.color ?? 'red'}
          onSave={(lines) => {
            onWriteWhiteboard(lines);
            setWhiteboardOpen(false);
          }}
          onClose={closeWhiteboard}
        />
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
      {inventoryOpen && (
        <InventoryDialog
          items={inventory}
          players={players}
          playerId={playerId}
          onTake={(itemId) => onTakeItem(itemId)}
          onDrop={(itemId) => onDropItem(itemId)}
          onClose={closeInventory}
        />
      )}
      {walkieOpen && (
        <WalkieDialog onSend={(text) => onTransmitWalkieRef.current(text)} onClose={closeWalkie} />
      )}
      {calculatorOpen && <CalculatorDialog onClose={closeCalculator} />}
      {booksOpen && (
        <BookshelfDialog
          books={books}
          isHost={hostId === playerId}
          onWrite={(book) => onHostAction({ action: 'writeBook', ...book })}
          onRemove={(bookId) => onHostAction({ action: 'removeBook', bookId })}
          onClose={closeBooks}
        />
      )}
      {recordOpen && (
        <RecordDialog
          playing={room.record}
          soundboard={soundboard}
          canUseSounds={canUseSounds}
          onPlay={(record) => {
            onRoomAction('record', { target: record, on: true });
            setRecordOpen(false);
          }}
          onStop={() => {
            onRoomAction('record', { on: false });
            setRecordOpen(false);
          }}
          onClose={closeRecords}
        />
      )}
      {seated && (
        <div className="drawing-toolbar">
          {hasChair && (
            <button
              type="button"
              className="view-toggle"
              title="Switch view (V)"
              onClick={() => toggleSeatedViewRef.current()}
            >
              {seatedView === 'chair' ? 'Table view' : 'Chair view'} <kbd>V</kbd>
            </button>
          )}
          {canDraw ? (
            <>
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
            </>
          ) : (
            <span className="drawing-off">The host has turned drawing off for now.</span>
          )}
        </div>
      )}
    </div>
  );
}
