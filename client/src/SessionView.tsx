import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import {
  EMOTES,
  MAX_PLAYER_NAME_LENGTH,
  DIE_KINDS,
  GRID_CELL_OPTIONS,
  SAVED_TABLE_TTL_DAYS,
  TABLE_UNITS,
  SOUNDS_OFF_ERROR,
  mayUse,
  type ClearTarget,
  type HostAction,
  type Point2D,
  playerColorHex,
  type DieKind,
  type GameState,
  type Player,
  type PlayerColorId,
} from '@custom-tabletop/shared';
import { ColorPicker } from './ColorPicker.js';
import type { ToastKind } from './useToasts.js';
import { uploadImage } from './uploads.js';
import { AddSoundForm } from './AddSoundForm.js';
import { MapCropDialog, type MapSource } from './MapCropDialog.js';
import { SOUND_KIND_LABEL, soundKind } from './soundKind.js';
import { useSettings } from './useSettings.js';
import { formatKeyCode } from './keyLabel.js';
import { hostLink } from './hostKeys.js';
import { MOVEMENT_KEYS, RUN_KEYS } from './three/FirstPersonController.js';
import { SOUNDBOARD_JEWELS } from './three/soundboardLayout.js';

/** A wall button's enamel color as CSS (the Sound tab's little board). */
const jewelHex = (index: number) =>
  `#${(SOUNDBOARD_JEWELS[index] ?? 0x6a5a48).toString(16).padStart(6, '0')}`;
import { MapIcon, DiceIcon, SoundIcon, PlayersIcon, SettingsIcon, HostIcon } from './icons.js';

export interface SessionViewProps {
  state: GameState;
  playerId: string;
  onLeave: () => void;
  onSetMapBackground: (url: string) => void;
  onSetMapGrid: (gridCells: number) => void;
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
  onSetMapBackground,
  onSetMapGrid,
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
                onSetMapBackground={onSetMapBackground}
                onSetMapGrid={onSetMapGrid}
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
}: {
  state: GameState;
  playerId: string;
  isHost: boolean;
  onMutePlayer: (targetPlayerId: string) => void;
  onUnmutePlayer: (targetPlayerId: string) => void;
  onTransferHost: (targetPlayerId: string) => void;
  onUpdateProfile: (patch: { name?: string; color?: PlayerColorId }) => void;
  onRemovePlayer: (targetPlayerId: string) => void;
}) {
  const self = state.players.find((player) => player.id === playerId);
  return (
    <>
      {self && <ProfileEditor state={state} self={self} onUpdateProfile={onUpdateProfile} />}
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
  onSetMapBackground,
  onSetMapGrid,
  onMoveMini,
}: {
  isHost: boolean;
  state: GameState;
  playerId: string;
  onSetMapBackground: (url: string) => void;
  onSetMapGrid: (gridCells: number) => void;
  onMoveMini: (targetPlayerId: string, point: Point2D | null) => void;
}) {
  const activeScene = state.scenes.find((scene) => scene.id === state.activeSceneId);
  const current = activeScene?.backgroundImage ?? '';
  const [link, setLink] = useState('');
  const [source, setSource] = useState<MapSource | null>(null);
  const minis = <MiniSection state={state} playerId={playerId} onMoveMini={onMoveMini} />;

  if (!isHost) {
    return (
      <>
        {minis}
        <p className="tab-empty-note">Only the host can change the map.</p>
      </>
    );
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      setSource({ kind: 'file', file });
    }
  }

  function handleLink(event: FormEvent) {
    event.preventDefault();
    const trimmed = link.trim();
    if (trimmed) {
      setSource({ kind: 'url', url: trimmed });
    }
  }

  async function handleConfirm(image: Blob) {
    const url = await uploadImage(new File([image], 'map.jpg', { type: 'image/jpeg' }));
    onSetMapBackground(url);
    setSource(null);
    setLink('');
  }

  return (
    <div>
      {minis}
      <p className="tab-section-label">Map</p>
      <div className="map-current">
        {current ? (
          <img src={current} alt="Current map" className="map-thumb" />
        ) : (
          <div className="map-thumb map-thumb-empty">No map yet — blank parchment</div>
        )}
      </div>
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
      {current && (
        <button type="button" onClick={() => onSetMapBackground('')}>
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
            aria-checked={(activeScene?.gridCells ?? 0) === cells}
            className={(activeScene?.gridCells ?? 0) === cells ? 'active' : ''}
            onClick={() => onSetMapGrid(cells)}
          >
            {cells === 0 ? 'Off' : cells}
          </button>
        ))}
      </div>
      {source && (
        <MapCropDialog source={source} onConfirm={handleConfirm} onCancel={() => setSource(null)} />
      )}
    </div>
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
      <label className="settings-row">
        <span>
          Halloween night
          <span className="row-hint">pumpkins, bats, a graveyard outside — for everyone</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={state.theme === 'halloween'}
          onChange={(event) =>
            onHostAction({ action: 'theme', theme: event.target.checked ? 'halloween' : 'classic' })
          }
        />
      </label>

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
      updateSettings({ interactKey: event.code });
      setRebindError(null);
      setRebinding(false);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [rebinding, updateSettings]);

  return (
    <div className="settings-tab">
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

      <label className="settings-row">
        <span>Fireplace sound</span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={settings.fireSound}
          onChange={(event) => updateSettings({ fireSound: event.target.checked })}
        />
      </label>
    </div>
  );
}
