import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import {
  MOODS,
  type RoomTheme,
  type Weather,
  EMOTES,
  MAX_PLAYER_NAME_LENGTH,
  DIE_KINDS,
  GRID_CELL_OPTIONS,
  SAVED_TABLE_TTL_DAYS,
  TABLE_UNITS,
  SOUNDS_OFF_ERROR,
  MAX_SCENES_PER_SESSION,
  MAX_SCENE_NAME_LENGTH,
  type Scene,
  mayUse,
  type ClearTarget,
  type HostAction,
  type Point2D,
  playerColorHex,
  type DieKind,
  type GameState,
  type Player,
  type PlayerColorId,
  PROFILE_IMAGE_ACCEPT,
  PROFILE_IMAGE_FORMATS,
  formatBytes,
  type ProfileImage,
} from '@custom-tabletop/shared';
import { ProfileViewer } from './ProfileViewer.js';
import type { ProfileSharing } from './useProfileSharing.js';
import { hasProfileImageUrl } from './profileImages.js';
import { ColorPicker } from './ColorPicker.js';
import type { ToastKind } from './useToasts.js';
import { uploadImage } from './uploads.js';
import { AddSoundForm } from './AddSoundForm.js';
import { MapCropDialog, type MapSource } from './MapCropDialog.js';
import { SOUND_KIND_LABEL, soundKind } from './soundKind.js';
import { useSettings } from './useSettings.js';
import { RESERVED_KEYS } from './settings.js';
import { formatKeyCode } from './keyLabel.js';
import { hostLink } from './hostKeys.js';
import { MOVEMENT_KEYS, RUN_KEYS } from './three/FirstPersonController.js';
import { SOUNDBOARD_JEWELS } from './three/soundboardLayout.js';

/** A wall button's enamel color as CSS (the Sound tab's little board). */
const jewelHex = (index: number) =>
  `#${(SOUNDBOARD_JEWELS[index] ?? 0x6a5a48).toString(16).padStart(6, '0')}`;
import {
  MapIcon,
  DiceIcon,
  SoundIcon,
  SoundOffIcon,
  PlayersIcon,
  SettingsIcon,
  HostIcon,
  SheetIcon,
} from './icons.js';
import { SOUND_CATEGORIES, type CategoryMix, type SoundCategory } from './audioMix.js';

/** What the host can do with the table's maps (App.tsx sends them). */
export interface MapActions {
  create: (sceneId: string, name: string) => void;
  show: (sceneId: string) => void;
  rename: (sceneId: string, name: string) => void;
  remove: (sceneId: string) => void;
  setBackground: (sceneId: string, url: string) => void;
  setGrid: (sceneId: string, gridCells: number) => void;
}

export interface SessionViewProps {
  state: GameState;
  playerId: string;
  onLeave: () => void;
  /** The host's maps: add, show, rename, delete, and set one up. */
  maps: MapActions;
  onSpawnDie: (kind: DieKind, hidden?: boolean) => void;
  onRollDice: (diceIds: string[]) => void;
  onRemoveDie: (diceId: string) => void;
  onPlaySound: (soundId: string) => void;
  onUploadSound: (name: string, url: string) => void;
  onMutePlayer: (targetPlayerId: string) => void;
  onUnmutePlayer: (targetPlayerId: string) => void;
  onTransferHost: (targetPlayerId: string) => void;
  onUpdateProfile: (patch: { name?: string; color?: PlayerColorId }) => void;
  onAssignSlot: (slotIndex: number, soundId: string | null) => void;
  onRemoveSound: (soundId: string) => void;
  onNotify: (text: string, kind?: ToastKind) => void;
  /** The table's host key — only while this player is the host. */
  hostKey?: string | null;
  /** Put your mini on the table, or (null) take it off. */
  onMoveMini: (targetPlayerId: string, point: Point2D | null) => void;
  /** The host's controls (host.ts). */
  onHostAction: (action: HostAction) => void;
  onLockClip: (locked: boolean) => void;
  /** Your profile image, and (as host) everyone's. */
  profile: ProfileSharing;
}

type TabId = 'players' | 'map' | 'dice' | 'soundboard' | 'host' | 'settings';

const TABS: { id: TabId; label: string; icon: typeof MapIcon; hostOnly?: boolean }[] = [
  { id: 'players', label: 'Players', icon: PlayersIcon },
  { id: 'map', label: 'Map', icon: MapIcon },
  { id: 'dice', label: 'Dice', icon: DiceIcon },
  { id: 'soundboard', label: 'Sound', icon: SoundIcon },
  { id: 'host', label: 'Host', icon: HostIcon, hostOnly: true },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

/**
 * The session menu (Milestone 10 follow-up, user request): categorized
 * tabs instead of one long scrolling list, so only one category's content
 * shows at a time. Session code + Leave stay outside the tabs — they're
 * not really "a category," more like the panel's own chrome.
 */
export function SessionView({
  state,
  playerId,
  onLeave,
  maps,
  onSpawnDie,
  onRollDice,
  onRemoveDie,
  onPlaySound,
  onUploadSound,
  onMutePlayer,
  onUnmutePlayer,
  onTransferHost,
  onUpdateProfile,
  onAssignSlot,
  onRemoveSound,
  onNotify,
  hostKey,
  onMoveMini,
  onHostAction,
  onLockClip,
  profile,
}: SessionViewProps) {
  const isHost = playerId === state.hostId;
  const [chosenTab, setActiveTab] = useState<TabId>('players');
  // Handing the host role on closes the Host tab with it.
  const activeTab = chosenTab === 'host' && !isHost ? 'players' : chosenTab;
  const tabs = TABS.filter((tab) => isHost || !tab.hostOnly);
  const { settings, updateSettings } = useSettings();
  const collapsed = settings.menuCollapsed;

  function copyInviteLink() {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('join', state.sessionId);
    navigator.clipboard.writeText(url.toString()).then(
      () => onNotify('Invite link copied — send it to your players.'),
      () => onNotify(`Couldn't copy automatically. Share this code: ${state.sessionId}`, 'error'),
    );
  }

  return (
    <div className={`session-overlay${collapsed ? ' collapsed' : ''}`}>
      <div className="session-overlay-header">
        <span className="session-code">
          Session <strong>{state.sessionId}</strong>
        </span>
        <span className="session-header-actions">
          <button
            type="button"
            className="invite-button"
            title="Copy an invite link to send your players"
            onClick={copyInviteLink}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
            </svg>
            Invite
          </button>
          <button
            type="button"
            className="collapse-button"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Show the menu' : 'Hide the menu'}
            title={collapsed ? 'Show the menu' : 'Hide the menu'}
            onClick={() => updateSettings({ menuCollapsed: !collapsed })}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 15l6-6 6 6" />
            </svg>
          </button>
        </span>
      </div>

      {!collapsed && (
        <>
          <div className="tab-bar" role="tablist">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={activeTab === tab.id ? 'tab-button active' : 'tab-button'}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="tab-panel" role="tabpanel">
            {activeTab === 'players' && (
              <PlayersTab
                state={state}
                playerId={playerId}
                isHost={isHost}
                onMutePlayer={onMutePlayer}
                onUnmutePlayer={onUnmutePlayer}
                onTransferHost={onTransferHost}
                onUpdateProfile={onUpdateProfile}
                onRemovePlayer={(targetPlayerId) =>
                  onHostAction({ action: 'remove', targetPlayerId })
                }
                profile={profile}
              />
            )}
            {activeTab === 'players' && isHost && hostKey && (
              <SavedTableNote sessionId={state.sessionId} hostKey={hostKey} onNotify={onNotify} />
            )}
            {activeTab === 'map' && (
              <MapTab
                isHost={isHost}
                state={state}
                playerId={playerId}
                maps={maps}
                onMoveMini={onMoveMini}
              />
            )}
            {activeTab === 'dice' && (
              <DiceTab
                state={state}
                playerId={playerId}
                onSpawnDie={onSpawnDie}
                isHost={isHost}
                onRollDice={onRollDice}
                onRemoveDie={onRemoveDie}
              />
            )}
            {activeTab === 'soundboard' && (
              <SoundboardTab
                state={state}
                playerId={playerId}
                isHost={isHost}
                onPlaySound={onPlaySound}
                onUploadSound={onUploadSound}
                onAssignSlot={onAssignSlot}
                onRemoveSound={onRemoveSound}
              />
            )}
            {activeTab === 'host' && (
              <HostTab state={state} onHostAction={onHostAction} onLockClip={onLockClip} />
            )}
            {activeTab === 'settings' && <SettingsTab />}
          </div>

          <button type="button" className="leave-button" onClick={onLeave}>
            Leave session
          </button>
        </>
      )}
    </div>
  );
}

/**
 * The host's note that the table saves itself (docs/decisions.md, "Saved
 * tables"), with the private host link that reopens it from any device.
 */
function SavedTableNote({
  sessionId,
  hostKey,
  onNotify,
}: {
  sessionId: string;
  hostKey: string;
  onNotify: (text: string, kind?: ToastKind) => void;
}) {
  function copyHostLink() {
    navigator.clipboard.writeText(hostLink(window.location.origin, sessionId, hostKey)).then(
      () => onNotify('Host link copied — keep it private: it reopens this table from any device.'),
      () => onNotify('Couldn’t copy the host link automatically.', 'error'),
    );
  }

  return (
    <div className="saved-table">
      <p className="saved-table-title">Saved automatically</p>
      <p className="saved-table-text">
        When everyone has left, this table waits {SAVED_TABLE_TTL_DAYS} days for you. Reopen it with
        code <strong>{sessionId}</strong> in this browser, or anywhere with your host link.
      </p>
      <button type="button" onClick={copyHostLink}>
        Copy host link
      </button>
    </div>
  );
}

function PlayersTab({
  state,
  playerId,
  isHost,
  onMutePlayer,
  onUnmutePlayer,
  onTransferHost,
  onUpdateProfile,
  onRemovePlayer,
  profile,
}: {
  state: GameState;
  playerId: string;
  isHost: boolean;
  onMutePlayer: (targetPlayerId: string) => void;
  onUnmutePlayer: (targetPlayerId: string) => void;
  onTransferHost: (targetPlayerId: string) => void;
  onUpdateProfile: (patch: { name?: string; color?: PlayerColorId }) => void;
  onRemovePlayer: (targetPlayerId: string) => void;
  profile: ProfileSharing;
}) {
  const self = state.players.find((player) => player.id === playerId);
  // Whose profile image is open full screen. The server only sends this
  // player the ones they may see (their own; everyone's as host), so a
  // player whose image disappears (withdrawn, gone, or no longer theirs to
  // see) closes it.
  const [viewing, setViewing] = useState<string | null>(null);
  const viewed = viewing ? state.players.find((player) => player.id === viewing) : undefined;
  const viewedImageId = viewed?.profileImage?.id ?? null;
  const viewedRef = useRef(viewed);
  viewedRef.current = viewed;
  useEffect(() => {
    if (viewing && !viewedImageId) setViewing(null);
  }, [viewing, viewedImageId]);
  const { imageUrl } = profile;
  const loadViewed = useCallback(() => {
    const player = viewedRef.current;
    return player && viewedImageId
      ? imageUrl(player)
      : Promise.reject(new Error('There’s no profile shared.'));
  }, [imageUrl, viewedImageId]);
  const { settings, updateSettings } = useSettings();
  const toggleHearing = (target: Player) =>
    updateSettings({
      mutedPlayers: settings.mutedPlayers.includes(target.id)
        ? settings.mutedPlayers.filter((id) => id !== target.id)
        : [...settings.mutedPlayers, target.id],
    });
  return (
    <>
      {self && <ProfileEditor state={state} self={self} onUpdateProfile={onUpdateProfile} />}
      {self && (
        <ProfileImageSection
          self={self}
          isHost={isHost}
          profile={profile}
          onView={() => setViewing(self.id)}
        />
      )}
      {viewed && viewedImageId && (
        <ProfileViewer
          title={viewed.id === playerId ? 'Your profile' : `${viewed.name}’s profile`}
          note={
            viewed.id !== playerId
              ? `Only you (the host) and ${viewed.name} can see it.`
              : isHost
                ? 'Only you can see it — you’re the host.'
                : 'Only you and the host can see it.'
          }
          load={loadViewed}
          onClose={() => setViewing(null)}
        />
      )}
      <ul className="player-list">
        {state.players.map((player) => {
          const isSelf = player.id === playerId;
          const canModerate = isSelf || isHost;
          const canPromote = isHost && !isSelf && player.connected;
          return (
            <li key={player.id} className={player.connected ? undefined : 'player-away'}>
              <span className="player-name">
                <span
                  className="player-dot"
                  style={{ background: playerColorHex(player.color) }}
                  aria-hidden="true"
                />
                <span className="player-label">
                  {player.name}
                  {isSelf && ' (you)'}
                  {player.muted && ' (muted)'}
                  {!player.connected && ' (reconnecting…)'}
                </span>
                {player.id === state.hostId && (
                  <span className="host-crown" title="The host" aria-label="(host)">
                    <HostIcon />
                  </span>
                )}
              </span>
              <span className="player-actions">
                {player.profileImage && (
                  <button
                    type="button"
                    className="icon-button"
                    title={isSelf ? 'View your profile' : `View ${player.name}’s profile`}
                    aria-label={isSelf ? 'View your profile' : `View ${player.name}’s profile`}
                    onClick={() => setViewing(player.id)}
                  >
                    <SheetIcon />
                  </button>
                )}
                {!isSelf && (
                  <button
                    type="button"
                    className={
                      settings.mutedPlayers.includes(player.id)
                        ? 'icon-button hearing-off'
                        : 'icon-button'
                    }
                    aria-pressed={settings.mutedPlayers.includes(player.id)}
                    title={
                      settings.mutedPlayers.includes(player.id)
                        ? `You don't hear ${player.name}'s sounds — press to hear them again`
                        : `Silence ${player.name}'s sounds, only for you`
                    }
                    aria-label={
                      settings.mutedPlayers.includes(player.id)
                        ? `Hear ${player.name}'s sounds again`
                        : `Silence ${player.name}'s sounds for you`
                    }
                    onClick={() => toggleHearing(player)}
                  >
                    {settings.mutedPlayers.includes(player.id) ? <SoundOffIcon /> : <SoundIcon />}
                  </button>
                )}
                {canPromote && (
                  <button
                    type="button"
                    className="icon-button"
                    title={`Make ${player.name} the host`}
                    aria-label={`Make ${player.name} the host`}
                    onClick={() => onTransferHost(player.id)}
                  >
                    <HostIcon />
                  </button>
                )}
                {canModerate && (
                  <button
                    type="button"
                    onClick={() =>
                      player.muted ? onUnmutePlayer(player.id) : onMutePlayer(player.id)
                    }
                  >
                    {player.muted ? 'Unmute' : 'Mute'}
                  </button>
                )}
                {isHost && !isSelf && (
                  <ConfirmButton
                    className="icon-button danger"
                    label="×"
                    armedLabel="Remove?"
                    title={`Remove ${player.name} from the table`}
                    ariaLabel={`Remove ${player.name}`}
                    onConfirm={() => onRemovePlayer(player.id)}
                  />
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** "You" — change your own name/color mid-session. A color change applies
 * immediately (and is refused by the server if someone else grabbed that
 * color first); a rename applies on Save/Enter. */
function ProfileEditor({
  state,
  self,
  onUpdateProfile,
}: {
  state: GameState;
  self: Player;
  onUpdateProfile: (patch: { name?: string; color?: PlayerColorId }) => void;
}) {
  const [name, setName] = useState(self.name);
  const taken = new Set(
    state.players.filter((player) => player.id !== self.id).map((player) => player.color),
  );
  const trimmed = name.trim();
  const renamed = trimmed.length > 0 && trimmed !== self.name;

  // Adopt a server-side name change (e.g. from another tab) when not mid-edit.
  useEffect(() => {
    setName(self.name);
  }, [self.name]);

  function handleRename(event: FormEvent) {
    event.preventDefault();
    if (renamed) {
      onUpdateProfile({ name: trimmed });
    }
  }

  return (
    <div className="profile-editor">
      <p className="tab-section-label">You</p>
      <form className="profile-name" onSubmit={handleRename}>
        <input
          value={name}
          maxLength={MAX_PLAYER_NAME_LENGTH}
          aria-label="Your name"
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" disabled={!renamed}>
          Save
        </button>
      </form>
      <ColorPicker
        value={self.color}
        taken={taken}
        onChange={(color) => color !== self.color && onUpdateProfile({ color })}
        label="Your color"
      />
    </div>
  );
}

/** "PNG · 2480 × 3508 · 3.1 MB" */
function describeImage(image: ProfileImage): string {
  return `${PROFILE_IMAGE_FORMATS[image.type].label} · ${image.width} × ${image.height} · ${formatBytes(image.bytes)}`;
}

/** Your profile image (docs/decisions.md, "Player profiles"): share one
 * (a character sheet, say), replace it, look at it, withdraw it. Only you
 * and the host ever see it. */
function ProfileImageSection({
  self,
  isHost,
  profile,
  onView,
}: {
  self: Player;
  isHost: boolean;
  profile: ProfileSharing;
  onView: () => void;
}) {
  const own = profile.own;
  const uploading = profile.progress !== null;

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) profile.share(file);
  }

  return (
    <div className="profile-image-section">
      <p className="tab-section-label">Your profile</p>
      {own ? (
        <div className="profile-image-card">
          <ProfileThumb player={self} image={own} profile={profile} onClick={onView} />
          <span className="profile-image-meta">
            <strong>{isHost ? 'Shared (you’re the host)' : 'Shared with the host'}</strong>
            <span>{describeImage(own)}</span>
          </span>
        </div>
      ) : (
        <p className="profile-image-hint">
          {isHost
            ? 'An image only the host sees, and you’re the host: nobody else can see it.'
            : 'An image only you and the host can see: your character sheet, say.'}{' '}
          PNG, JPG or WebP, up to 10 MB.
        </p>
      )}
      {uploading ? (
        <div className="profile-image-progress" role="status">
          <progress max={1} value={profile.progress ?? 0} aria-label="Sharing your profile" />
          <span>{Math.round((profile.progress ?? 0) * 100)}%</span>
          <button type="button" onClick={profile.cancel}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="profile-image-actions">
          {own && (
            <button type="button" onClick={onView}>
              View
            </button>
          )}
          <label className={own ? 'file-button' : 'file-button primary'}>
            {own ? 'Replace…' : 'Choose an image…'}
            <input type="file" accept={PROFILE_IMAGE_ACCEPT} onChange={handleFile} />
          </label>
          {!own && profile.deviceCopy && (
            <button type="button" onClick={() => profile.share(profile.deviceCopy!)}>
              Share your saved one
            </button>
          )}
          {own && (
            <ConfirmButton
              className="danger-text"
              label="Remove"
              armedLabel="Remove it?"
              title="Stop sharing it with the host"
              onConfirm={profile.remove}
            />
          )}
        </div>
      )}
      {profile.error && (
        <p className="profile-image-error" role="alert">
          {profile.error}
        </p>
      )}
      <label className="settings-row">
        <span>
          Keep a copy on this device
          <span className="row-hint">offered when you join a table</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={profile.keepCopy}
          onChange={(event) => profile.setKeepCopy(event.target.checked)}
        />
      </label>
    </div>
  );
}

/** A small preview of your own image, when this tab already has it (it
 * was shared from here, or opened); otherwise a sheet icon, rather than
 * downloading up to 10 MB for a thumbnail. */
function ProfileThumb({
  player,
  image,
  profile,
  onClick,
}: {
  player: Player;
  image: ProfileImage;
  profile: ProfileSharing;
  onClick: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const local = hasProfileImageUrl(image.id);
  const { imageUrl } = profile;
  const playerRef = useRef(player);
  playerRef.current = player;
  useEffect(() => {
    setSrc(null);
    if (!local) return;
    let cancelled = false;
    imageUrl(playerRef.current).then(
      (url) => !cancelled && setSrc(url),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [image.id, local, imageUrl]);
  return (
    <button type="button" className="profile-thumb" title="View your profile" onClick={onClick}>
      {src ? <img src={src} alt="" /> : <SheetIcon />}
    </button>
  );
}

/** Your mini (docs/decisions.md, "Minis"): put it on the table or take it
 * off; moving it is a drag on the table itself. */
function MiniSection({
  state,
  playerId,
  onMoveMini,
}: {
  state: GameState;
  playerId: string;
  onMoveMini: (targetPlayerId: string, point: Point2D | null) => void;
}) {
  const onTable = Boolean(state.minis[playerId]);
  function putOnTable() {
    // Near the middle, a little apart from anyone else's.
    const spread = TABLE_UNITS * 0.16;
    onMoveMini(playerId, {
      x: TABLE_UNITS / 2 + (Math.random() - 0.5) * spread,
      y: TABLE_UNITS / 2 + (Math.random() - 0.5) * spread,
    });
  }
  return (
    <div className="mini-section">
      <p className="tab-section-label">Your mini</p>
      <p className="mini-hint">
        {onTable
          ? 'Drag it around the map with the mouse (click Esc first if you’re looking around).'
          : 'A little figure of your character to move around the map.'}
      </p>
      {onTable ? (
        <button type="button" onClick={() => onMoveMini(playerId, null)}>
          Take it off the table
        </button>
      ) : (
        <button type="button" className="primary" onClick={putOnTable}>
          Put it on the table
        </button>
      )}
    </div>
  );
}

function MapTab({
  isHost,
  state,
  playerId,
  maps,
  onMoveMini,
}: {
  isHost: boolean;
  state: GameState;
  playerId: string;
  maps: MapActions;
  onMoveMini: (targetPlayerId: string, point: Point2D | null) => void;
}) {
  const activeScene = state.scenes.find((scene) => scene.id === state.activeSceneId);
  // The map the host is setting up — the one on the table unless they pick
  // another (a map in preparation isn't shown until they say so).
  const [selectedId, setSelectedId] = useState(state.activeSceneId);
  const selected = state.scenes.find((scene) => scene.id === selectedId) ?? activeScene;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [source, setSource] = useState<{ map: MapSource; sceneId: string } | null>(null);
  const minis = <MiniSection state={state} playerId={playerId} onMoveMini={onMoveMini} />;

  if (!isHost || !selected) {
    return (
      <>
        {minis}
        {activeScene && (
          <p className="tab-empty-note">
            On the table: <strong>{activeScene.name}</strong>. Only the host changes the map.
          </p>
        )}
      </>
    );
  }
  const target = selected;

  function addMap() {
    const taken = new Set(state.scenes.map((scene) => scene.name));
    let n = state.scenes.length + 1;
    while (taken.has(`Map ${n}`)) n += 1;
    const sceneId = crypto.randomUUID();
    maps.create(sceneId, `Map ${n}`);
    setSelectedId(sceneId);
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      setSource({ map: { kind: 'file', file }, sceneId: target.id });
    }
  }

  function handleLink(event: FormEvent) {
    event.preventDefault();
    const trimmed = link.trim();
    if (trimmed) {
      setSource({ map: { kind: 'url', url: trimmed }, sceneId: target.id });
    }
  }

  async function handleConfirm(image: Blob) {
    if (!source) return;
    const url = await uploadImage(new File([image], 'map.jpg', { type: 'image/jpeg' }));
    maps.setBackground(source.sceneId, url);
    setSource(null);
    setLink('');
  }

  const onTable = target.id === state.activeSceneId;
  return (
    <div>
      {minis}
      <div className="map-list-head">
        <p className="tab-section-label">Maps</p>
        <button
          type="button"
          className="map-add"
          disabled={state.scenes.length >= MAX_SCENES_PER_SESSION}
          title={
            state.scenes.length >= MAX_SCENES_PER_SESSION
              ? `At most ${MAX_SCENES_PER_SESSION} maps`
              : 'Add a map to prepare'
          }
          onClick={addMap}
        >
          + New map
        </button>
      </div>
      <ul className="map-list">
        {state.scenes.map((scene) => (
          <MapRow
            key={scene.id}
            scene={scene}
            selected={scene.id === target.id}
            live={scene.id === state.activeSceneId}
            renaming={renaming === scene.id}
            onSelect={() => setSelectedId(scene.id)}
            onStartRename={() => setRenaming(scene.id)}
            onRename={(name) => {
              setRenaming(null);
              if (name && name !== scene.name) maps.rename(scene.id, name);
            }}
            onShow={() => maps.show(scene.id)}
            onRemove={() => maps.remove(scene.id)}
          />
        ))}
      </ul>

      <p className="tab-section-label">
        {onTable ? 'On the table' : 'Preparing'}: {target.name}
      </p>
      <div className="map-current">
        {target.backgroundImage ? (
          <img src={target.backgroundImage} alt={`The map ${target.name}`} className="map-thumb" />
        ) : (
          <div className="map-thumb map-thumb-empty">No map yet — blank parchment</div>
        )}
      </div>
      {!onTable && (
        <button type="button" className="primary" onClick={() => maps.show(target.id)}>
          Show this map to everyone
        </button>
      )}
      <label className="file-label">
        Upload a map image
        <input type="file" accept="image/*" onChange={handleFile} />
      </label>
      <form onSubmit={handleLink}>
        <label>
          or paste an image link
          <input
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://…/map.png"
          />
        </label>
        <button type="submit" disabled={!link.trim()}>
          Preview
        </button>
      </form>
      {target.backgroundImage && (
        <button type="button" onClick={() => maps.setBackground(target.id, '')}>
          Clear map
        </button>
      )}
      <div className="grid-picker" role="radiogroup" aria-label="Map grid">
        <span className="grid-picker-label">Grid</span>
        {GRID_CELL_OPTIONS.map((cells) => (
          <button
            key={cells}
            type="button"
            role="radio"
            aria-checked={target.gridCells === cells}
            className={target.gridCells === cells ? 'active' : ''}
            onClick={() => maps.setGrid(target.id, cells)}
          >
            {cells === 0 ? 'Off' : cells}
          </button>
        ))}
      </div>
      {source && (
        <MapCropDialog
          source={source.map}
          onConfirm={handleConfirm}
          onCancel={() => setSource(null)}
        />
      )}
    </div>
  );
}

/** One map in the host's list: pick it to set it up, show it, rename it,
 * delete it (never the one on the table). */
function MapRow({
  scene,
  selected,
  live,
  renaming,
  onSelect,
  onStartRename,
  onRename,
  onShow,
  onRemove,
}: {
  scene: Scene;
  selected: boolean;
  live: boolean;
  renaming: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onShow: () => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(scene.name);
  useEffect(() => {
    if (renaming) setDraft(scene.name);
  }, [renaming, scene.name]);
  const thumb = scene.backgroundImage ? { backgroundImage: `url(${scene.backgroundImage})` } : {};

  return (
    <li className={`map-row${selected ? ' selected' : ''}${live ? ' live' : ''}`}>
      {renaming ? (
        <form
          className="map-rename"
          onSubmit={(event) => {
            event.preventDefault();
            onRename(draft.trim());
          }}
        >
          <input
            autoFocus
            value={draft}
            maxLength={MAX_SCENE_NAME_LENGTH}
            aria-label={`New name for ${scene.name}`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => onRename(draft.trim())}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onRename(scene.name);
            }}
          />
        </form>
      ) : (
        <button
          type="button"
          className="map-pick"
          aria-pressed={selected}
          title={`Set up ${scene.name}`}
          onClick={onSelect}
        >
          <span className="map-row-thumb" style={thumb} aria-hidden="true" />
          <span className="map-row-text">
            <span className="map-row-name">{scene.name}</span>
            {live && <span className="map-live">on the table</span>}
          </span>
        </button>
      )}
      <span className="player-actions">
        {!live && (
          <button type="button" onClick={onShow} title={`Put ${scene.name} on the table`}>
            Show
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          title={`Rename ${scene.name}`}
          aria-label={`Rename ${scene.name}`}
          onClick={onStartRename}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 20h4L19 9l-4-4L4 16v4Z M14 6l4 4" />
          </svg>
        </button>
        {!live && (
          <ConfirmButton
            className="icon-button danger"
            label="×"
            armedLabel="Delete?"
            title={`Delete ${scene.name}`}
            ariaLabel={`Delete ${scene.name}`}
            onConfirm={onRemove}
          />
        )}
      </span>
    </li>
  );
}

/** Outline of each die kind, for the Dice tab's buttons and list. */
function DieGlyph({ kind }: { kind: DieKind }) {
  const shapes: Record<DieKind, string> = {
    d4: 'M12 3 21 19H3Z',
    d6: 'M5 5h14v14H5Z',
    d8: 'M12 2 20 12 12 22 4 12Z',
    d10: 'M12 2 20 10 12 22 4 10Z',
    d12: 'M12 2.5 21 9l-3.4 10.5H6.4L3 9Z',
    d20: 'M12 2 20.5 7v10L12 22l-8.5-5V7Z',
  };
  return (
    <svg className="die-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d={shapes[kind]} />
    </svg>
  );
}

function DiceTab({
  state,
  playerId,
  onSpawnDie,
  isHost,
  onRollDice,
  onRemoveDie,
}: {
  state: GameState;
  playerId: string;
  onSpawnDie: (kind: DieKind, hidden?: boolean) => void;
  isHost: boolean;
  onRollDice: (diceIds: string[]) => void;
  onRemoveDie: (diceId: string) => void;
}) {
  // The host's secret dice (docs/decisions.md, "Secret dice").
  const [secret, setSecret] = useState(false);
  const makeSecret = isHost && secret;
  const mine = state.dice.filter((die) => die.ownerId === playerId);
  const rolledMine = mine.filter((die) => die.result !== null);
  const total = rolledMine.reduce((sum, die) => sum + (die.result ?? 0), 0);
  const owner = (id: string) => state.players.find((player) => player.id === id);

  return (
    <div className="dice-tab">
      <p className="dice-section-title">
        {makeSecret ? 'Add a secret die — only you see it' : 'Add a die to the table'}
      </p>
      <div className="die-picker">
        {DIE_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={makeSecret ? 'secret' : undefined}
            onClick={() => onSpawnDie(kind, makeSecret)}
            title={makeSecret ? `Add a secret ${kind}` : `Add a ${kind}`}
          >
            <DieGlyph kind={kind} />
            <span>{kind}</span>
          </button>
        ))}
      </div>
      {isHost && (
        <label className="settings-row secret-row">
          <span>
            Secret dice <span className="secret-hint">only you see them and their rolls</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={secret}
            onChange={(event) => setSecret(event.target.checked)}
          />
        </label>
      )}

      <div className="dice-actions">
        <button
          type="button"
          className="primary"
          disabled={mine.length === 0}
          onClick={() => onRollDice(mine.map((die) => die.id))}
        >
          Roll my dice{mine.length > 0 ? ` (${mine.length})` : ''}
        </button>
        <button
          type="button"
          disabled={mine.length === 0}
          onClick={() => mine.forEach((die) => onRemoveDie(die.id))}
        >
          Clear mine
        </button>
      </div>
      {rolledMine.length > 1 && (
        <p className="dice-total">
          Your dice: {rolledMine.map((die) => die.result).join(' + ')} = <strong>{total}</strong>
        </p>
      )}

      {state.dice.length === 0 ? (
        <p className="dice-empty">No dice on the table yet.</p>
      ) : (
        <ul className="dice-list">
          {state.dice.map((die) => {
            const dieOwner = owner(die.ownerId);
            const color = dieOwner ? playerColorHex(dieOwner.color) : '#efe6d4';
            const critical = die.kind === 'd20' && die.result === 20;
            const fumble = die.kind === 'd20' && die.result === 1;
            return (
              <li key={die.id}>
                <span className="dice-kind" style={{ color }}>
                  <DieGlyph kind={die.kind} />
                  {die.kind}
                </span>
                <span className="dice-owner">
                  {dieOwner?.name ?? 'Nobody'}
                  {die.hidden && (
                    <span className="secret-lock" title="Secret — only you see it">
                      <svg viewBox="0 0 24 24" aria-label="secret">
                        <rect x="5" y="11" width="14" height="9" rx="2" />
                        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                      </svg>
                    </span>
                  )}
                </span>
                <span
                  className={`dice-result${critical ? ' critical' : ''}${fumble ? ' fumble' : ''}`}
                  title={die.rollCount > 0 ? `Rolled ${die.rollCount}×` : 'Not rolled yet'}
                >
                  {die.result ?? '–'}
                </span>
                <button type="button" onClick={() => onRollDice([die.id])}>
                  Roll
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove this ${die.kind}`}
                  onClick={() => onRemoveDie(die.id)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="dice-hint">
        Click a die on the table to roll it, or drag it to move it — aiming at one and pressing E
        rolls it too.
      </p>
    </div>
  );
}

function SoundboardTab({
  state,
  playerId,
  isHost,
  onPlaySound,
  onUploadSound,
  onAssignSlot,
  onRemoveSound,
}: {
  state: GameState;
  playerId: string;
  isHost: boolean;
  onPlaySound: (soundId: string) => void;
  onUploadSound: (name: string, url: string) => void;
  onAssignSlot: (slotIndex: number, soundId: string | null) => void;
  onRemoveSound: (soundId: string) => void;
}) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const soundName = (id: string | null) =>
    id ? (state.soundboard.find((sound) => sound.id === id)?.name ?? null) : null;
  const allowed = mayUse(state, playerId, 'sounds');

  return (
    <div>
      {!allowed && <p className="tab-empty-note">{SOUNDS_OFF_ERROR}</p>}
      <ul className="sound-list">
        {state.soundboard.map((sound) => {
          const kind = soundKind(sound);
          const canRemove = isHost || sound.addedBy === playerId;
          return (
            <li key={sound.id}>
              <span className="sound-name" title={sound.name}>
                <span className={`sound-kind sound-kind-${kind}`}>{SOUND_KIND_LABEL[kind]}</span>
                {sound.name}
              </span>
              <span className="player-actions">
                <button type="button" disabled={!allowed} onClick={() => onPlaySound(sound.id)}>
                  Play
                </button>
                {canRemove && (
                  <button
                    type="button"
                    className="icon-button"
                    title={`Remove “${sound.name}”`}
                    aria-label={`Remove ${sound.name}`}
                    onClick={() => onRemoveSound(sound.id)}
                  >
                    ×
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="tab-section-label">Wall board</p>
      <div className="slot-grid">
        {state.soundboardSlots.map((slotSoundId, index) => {
          const name = soundName(slotSoundId);
          return (
            <button
              key={index}
              type="button"
              className={`slot-cell${name ? ' filled' : ''}${selectedSlot === index ? ' selected' : ''}`}
              style={{ '--jewel': jewelHex(index) } as CSSProperties}
              title={name ?? `Button ${index + 1} — empty`}
              disabled={!allowed}
              onClick={() => setSelectedSlot(selectedSlot === index ? null : index)}
            >
              <span className="slot-jewel" aria-hidden="true" />
              <span className="slot-name">{name ?? '+'}</span>
            </button>
          );
        })}
      </div>
      {allowed && selectedSlot !== null && (
        <label className="slot-editor">
          Button {selectedSlot + 1} plays
          <select
            value={state.soundboardSlots[selectedSlot] ?? ''}
            onChange={(event) => onAssignSlot(selectedSlot, event.target.value || null)}
          >
            <option value="">— nothing (empty) —</option>
            {state.soundboard.map((sound) => (
              <option key={sound.id} value={sound.id}>
                {sound.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {allowed && (
        <>
          <p className="tab-section-label">Add a sound (shared with everyone)</p>
          <AddSoundForm onAdd={onUploadSound} />
        </>
      )}
    </div>
  );
}

/**
 * A button that asks before it acts: the first press arms it (its label
 * turns into the question), a second one within a few seconds confirms.
 * For things that can't be undone — removing a player, clearing the table.
 */
function ConfirmButton({
  label,
  armedLabel,
  title,
  ariaLabel,
  className,
  disabled,
  onConfirm,
}: {
  label: string;
  armedLabel: string;
  title?: string;
  /** For a symbol-only label (×): what screen readers call the button. */
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      className={[className, 'confirm-button', armed ? 'armed' : ''].filter(Boolean).join(' ')}
      title={title}
      aria-label={armed ? armedLabel : ariaLabel}
      disabled={disabled}
      onClick={() => {
        window.clearTimeout(timer.current);
        if (armed) {
          setArmed(false);
          onConfirm();
          return;
        }
        setArmed(true);
        timer.current = window.setTimeout(() => setArmed(false), 3500);
      }}
      onBlur={() => setArmed(false)}
    >
      {armed ? armedLabel : label}
    </button>
  );
}

/** How the host can dress the room (host.ts), and what each means. */
const THEME_CHOICES: { id: RoomTheme; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'halloween', label: 'Halloween' },
  { id: 'winter', label: 'Winter' },
];
const THEME_HINTS: Record<RoomTheme, string> = {
  classic: 'the cozy room as it is',
  halloween: 'pumpkins, bats, a graveyard outside',
  winter: 'a tree, stockings, snow outside',
};
/** The weather outside (room.ts) — the host's choice, like the theme. */
const WEATHER_CHOICES: { id: Weather; label: string }[] = [
  { id: 'clear', label: 'Clear' },
  { id: 'rain', label: 'Rain' },
  { id: 'storm', label: 'Storm' },
  { id: 'snow', label: 'Snow' },
];
const WEATHER_HINTS: Record<Weather, string> = {
  clear: 'a clear night, the moon and the stars',
  rain: 'rain on the windows and the roof',
  storm: 'heavy rain, thunder and lightning',
  snow: 'snow falling outside',
};

/** What the host can clear, and how much of it is on the table now — null
 * for the drawings: they travel stroke by stroke and only reach this copy of
 * the state with the next full snapshot, so it can't count them. */
function clearables(
  state: GameState,
): { target: ClearTarget; label: string; count: number | null }[] {
  return [
    { target: 'drawings', label: 'Drawings', count: null },
    {
      target: 'whiteboard',
      label: 'Whiteboard',
      count: state.whiteboard.filter((line) => line.text).length,
    },
    { target: 'dice', label: 'Dice', count: state.dice.length },
    { target: 'minis', label: 'Minis', count: Object.keys(state.minis).length },
    { target: 'photos', label: 'Photos', count: state.photos.length },
  ];
}

/**
 * The host's own tab (docs/decisions.md, "Host controls"): who may come in,
 * what everyone else may do, and clearing things off the table.
 */
function HostTab({
  state,
  onHostAction,
  onLockClip,
}: {
  state: GameState;
  onHostAction: (action: HostAction) => void;
  onLockClip: (locked: boolean) => void;
}) {
  return (
    <div className="host-tab">
      <p className="host-section">The room</p>
      <div className="host-choice">
        <span>
          Dressed for
          <span className="row-hint">{THEME_HINTS[state.theme ?? 'classic']}</span>
        </span>
        <div className="choice-row" role="radiogroup" aria-label="How the room is dressed">
          {THEME_CHOICES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={(state.theme ?? 'classic') === id}
              className={(state.theme ?? 'classic') === id ? 'active' : undefined}
              onClick={() => onHostAction({ action: 'theme', theme: id })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="host-choice">
        <span>
          Weather
          <span className="row-hint">{WEATHER_HINTS[state.room?.weather ?? 'clear']}</span>
        </span>
        <div className="choice-row" role="radiogroup" aria-label="The weather outside">
          {WEATHER_CHOICES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={(state.room?.weather ?? 'clear') === id}
              className={(state.room?.weather ?? 'clear') === id ? 'active' : undefined}
              onClick={() => onHostAction({ action: 'weather', weather: id })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="host-choice">
        <span>
          Set the mood
          <span className="row-hint">a few things at once — each still yours to change after</span>
        </span>
        <div className="mood-row">
          {MOODS.map(({ id, label, hint }) => (
            <button
              key={id}
              type="button"
              className="mood-button"
              onClick={() => onHostAction({ action: 'mood', mood: id })}
            >
              <span>{label}</span>
              <small>{hint}</small>
            </button>
          ))}
        </div>
      </div>
      <p className="settings-hint">
        Books for everyone to read — lore, a letter, the rules of the house — you write at the
        lectern by the bookshelf.
      </p>

      <p className="host-section">The table</p>
      <label className="settings-row">
        <span>
          Lock the table
          <span className="row-hint">nobody new can join; players can still reconnect</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={state.locked}
          onChange={(event) => onHostAction({ action: 'lock', locked: event.target.checked })}
        />
      </label>
      <label className="settings-row">
        <span>
          Lock the TV
          <span className="row-hint">only you can pause, skip or stop clips</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={state.clipLocked}
          onChange={(event) => onLockClip(event.target.checked)}
        />
      </label>

      <p className="host-section">Everyone else may</p>
      <label className="settings-row">
        <span>
          Draw on the map
          <span className="row-hint">and erase from it</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={state.permissions.draw}
          onChange={(event) =>
            onHostAction({
              action: 'permission',
              permission: 'draw',
              allowed: event.target.checked,
            })
          }
        />
      </label>
      <label className="settings-row">
        <span>
          Use sounds
          <span className="row-hint">the soundboard, and clips on the TV</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={state.permissions.sounds}
          onChange={(event) =>
            onHostAction({
              action: 'permission',
              permission: 'sounds',
              allowed: event.target.checked,
            })
          }
        />
      </label>

      <p className="host-section">Clear the table</p>
      <div className="clear-grid">
        {clearables(state).map(({ target, label, count }) => (
          <ConfirmButton
            key={target}
            className="danger"
            label={count ? `${label} · ${count}` : label}
            armedLabel="Clear? Press again"
            title={
              count === 0
                ? `No ${label.toLowerCase()} to clear`
                : `Clear ${label.toLowerCase()} for everyone`
            }
            disabled={count === 0}
            onConfirm={() => onHostAction({ action: 'clear', target })}
          />
        ))}
      </div>
    </div>
  );
}

function SettingsTab() {
  const { settings, updateSettings } = useSettings();
  const [rebinding, setRebinding] = useState(false);
  const [rebindError, setRebindError] = useState<string | null>(null);

  useEffect(() => {
    if (!rebinding) {
      return;
    }

    // Capture phase + stopPropagation: while rebinding, the pressed key
    // belongs to this capture alone — it must not also reach the room's own
    // (document-level, bubble-phase) interact/movement listeners.
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        setRebinding(false);
        return;
      }
      if (MOVEMENT_KEYS.has(event.code) || RUN_KEYS.has(event.code)) {
        setRebindError('That key is used for movement — try another.');
        return;
      }
      if (EMOTES.some((emote) => emote.key === event.code)) {
        setRebindError('That key plays an emote — try another.');
        return;
      }
      const reserved = RESERVED_KEYS.get(event.code);
      if (reserved) {
        setRebindError(`That key ${reserved} — try another.`);
        return;
      }
      updateSettings({ interactKey: event.code });
      setRebindError(null);
      setRebinding(false);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [rebinding, updateSettings]);

  const setCategory = (category: SoundCategory, change: Partial<CategoryMix>) =>
    updateSettings({
      sound: { ...settings.sound, [category]: { ...settings.sound[category], ...change } },
    });

  return (
    <div className="settings-tab">
      <p className="host-section">Sound</p>
      <label className="settings-row">
        <span>Volume</span>
        <span className="settings-volume">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.masterVolume * 100)}
            onChange={(event) => updateSettings({ masterVolume: Number(event.target.value) / 100 })}
          />
          <output>{Math.round(settings.masterVolume * 100)}%</output>
        </span>
      </label>
      <p className="settings-hint">Only for you — everyone else hears what they choose.</p>
      <ul className="sound-mix" aria-label="Each kind of sound">
        {SOUND_CATEGORIES.map(({ id, label, hint }) => {
          const mix = settings.sound[id];
          return (
            <li key={id} className={mix.on ? 'sound-mix-row' : 'sound-mix-row off'}>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={mix.on}
                aria-label={label}
                onChange={(event) => setCategory(id, { on: event.target.checked })}
              />
              <span className="sound-mix-label">
                <span>{label}</span>
                <small>{hint}</small>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(mix.volume * 100)}
                disabled={!mix.on}
                aria-label={`${label} volume`}
                onChange={(event) => setCategory(id, { volume: Number(event.target.value) / 100 })}
              />
            </li>
          );
        })}
      </ul>

      <p className="host-section">Comfort</p>
      <label className="settings-row">
        <span className="settings-row-label">
          <span>No flashing lights</span>
          <small>No thunder flashes, no camera flash</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={settings.noFlashing}
          onChange={(event) => updateSettings({ noFlashing: event.target.checked })}
        />
      </label>

      <p className="host-section">Controls</p>
      <div className="settings-row">
        <span>Interact key</span>
        <button type="button" onClick={() => setRebinding(true)} disabled={rebinding}>
          {rebinding ? 'Press a key…' : formatKeyCode(settings.interactKey)}
        </button>
      </div>
      {rebinding && <p className="settings-hint">Press any key — Esc cancels.</p>}
      {rebindError && (
        <p className="add-sound-error" role="alert">
          {rebindError}
        </p>
      )}
    </div>
  );
}
