import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  EMOTES,
  MAX_PLAYER_NAME_LENGTH,
  DIE_KINDS,
  GRID_CELL_OPTIONS,
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
import { MOVEMENT_KEYS, RUN_KEYS } from './three/FirstPersonController.js';
import { MapIcon, DiceIcon, SoundIcon, PlayersIcon, SettingsIcon } from './icons.js';

export interface SessionViewProps {
  state: GameState;
  playerId: string;
  onLeave: () => void;
  onSetMapBackground: (url: string) => void;
  onSetMapGrid: (gridCells: number) => void;
  onSpawnDie: (kind: DieKind) => void;
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
}

type TabId = 'players' | 'map' | 'dice' | 'soundboard' | 'settings';

const TABS: { id: TabId; label: string; icon: typeof MapIcon }[] = [
  { id: 'players', label: 'Players', icon: PlayersIcon },
  { id: 'map', label: 'Map', icon: MapIcon },
  { id: 'dice', label: 'Dice', icon: DiceIcon },
  { id: 'soundboard', label: 'Sound', icon: SoundIcon },
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
}: SessionViewProps) {
  const isHost = playerId === state.hostId;
  const [activeTab, setActiveTab] = useState<TabId>('players');
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
            {TABS.map((tab) => {
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
              />
            )}
            {activeTab === 'map' && (
              <MapTab
                isHost={isHost}
                state={state}
                onSetMapBackground={onSetMapBackground}
                onSetMapGrid={onSetMapGrid}
              />
            )}
            {activeTab === 'dice' && (
              <DiceTab
                state={state}
                playerId={playerId}
                onSpawnDie={onSpawnDie}
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

function PlayersTab({
  state,
  playerId,
  isHost,
  onMutePlayer,
  onUnmutePlayer,
  onTransferHost,
  onUpdateProfile,
}: {
  state: GameState;
  playerId: string;
  isHost: boolean;
  onMutePlayer: (targetPlayerId: string) => void;
  onUnmutePlayer: (targetPlayerId: string) => void;
  onTransferHost: (targetPlayerId: string) => void;
  onUpdateProfile: (patch: { name?: string; color?: PlayerColorId }) => void;
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
                {player.name}
                {player.id === state.hostId && ' (host)'}
                {isSelf && ' (you)'}
                {player.muted && ' (muted)'}
                {!player.connected && ' (reconnecting…)'}
              </span>
              <span className="player-actions">
                {canPromote && (
                  <button type="button" onClick={() => onTransferHost(player.id)}>
                    Make host
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

function MapTab({
  isHost,
  state,
  onSetMapBackground,
  onSetMapGrid,
}: {
  isHost: boolean;
  state: GameState;
  onSetMapBackground: (url: string) => void;
  onSetMapGrid: (gridCells: number) => void;
}) {
  const activeScene = state.scenes.find((scene) => scene.id === state.activeSceneId);
  const current = activeScene?.backgroundImage ?? '';
  const [link, setLink] = useState('');
  const [source, setSource] = useState<MapSource | null>(null);

  if (!isHost) {
    return <p className="tab-empty-note">Only the host can change the map.</p>;
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
  onRollDice,
  onRemoveDie,
}: {
  state: GameState;
  playerId: string;
  onSpawnDie: (kind: DieKind) => void;
  onRollDice: (diceIds: string[]) => void;
  onRemoveDie: (diceId: string) => void;
}) {
  const mine = state.dice.filter((die) => die.ownerId === playerId);
  const rolledMine = mine.filter((die) => die.result !== null);
  const total = rolledMine.reduce((sum, die) => sum + (die.result ?? 0), 0);
  const owner = (id: string) => state.players.find((player) => player.id === id);

  return (
    <div className="dice-tab">
      <p className="dice-section-title">Add a die to the table</p>
      <div className="die-picker">
        {DIE_KINDS.map((kind) => (
          <button key={kind} type="button" onClick={() => onSpawnDie(kind)} title={`Add a ${kind}`}>
            <DieGlyph kind={kind} />
            <span>{kind}</span>
          </button>
        ))}
      </div>

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
                <span className="dice-owner">{dieOwner?.name ?? 'Nobody'}</span>
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
      <p className="dice-hint">Aim at a die and press E to roll it — or click it at the table.</p>
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

  return (
    <div>
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
                <button type="button" onClick={() => onPlaySound(sound.id)}>
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
              title={name ?? `Button ${index + 1} — empty`}
              onClick={() => setSelectedSlot(selectedSlot === index ? null : index)}
            >
              {name ?? '+'}
            </button>
          );
        })}
      </div>
      {selectedSlot !== null && (
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

      <p className="tab-section-label">Add a sound (shared with everyone)</p>
      <AddSoundForm onAdd={onUploadSound} />
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
