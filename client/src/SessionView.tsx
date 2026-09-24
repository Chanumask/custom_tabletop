import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  EMOTES,
  MAX_PLAYER_NAME_LENGTH,
  playerColorHex,
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
  onSpawnDie: () => void;
  onRollDie: (diceId: string) => void;
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
  onSpawnDie,
  onRollDie,
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
    <div className="session-overlay">
      <div className="session-overlay-header">
        <span>
          Session <strong>{state.sessionId}</strong>
        </span>
        <button type="button" className="invite-button" onClick={copyInviteLink}>
          Copy invite link
        </button>
      </div>

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
          <MapTab isHost={isHost} state={state} onSetMapBackground={onSetMapBackground} />
        )}
        {activeTab === 'dice' && (
          <DiceTab
            state={state}
            onSpawnDie={onSpawnDie}
            onRollDie={onRollDie}
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
}: {
  isHost: boolean;
  state: GameState;
  onSetMapBackground: (url: string) => void;
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
      {source && (
        <MapCropDialog source={source} onConfirm={handleConfirm} onCancel={() => setSource(null)} />
      )}
    </div>
  );
}

function DiceTab({
  state,
  onSpawnDie,
  onRollDie,
  onRemoveDie,
}: {
  state: GameState;
  onSpawnDie: () => void;
  onRollDie: (diceId: string) => void;
  onRemoveDie: (diceId: string) => void;
}) {
  return (
    <div>
      <button type="button" onClick={onSpawnDie}>
        Spawn die
      </button>
      <ul className="dice-list">
        {state.dice.map((die) => (
          <li key={die.id}>
            <span>
              {die.id.slice(0, 6)}: {die.result ?? 'unrolled'}
            </span>
            <span>
              <button type="button" onClick={() => onRollDie(die.id)}>
                Roll
              </button>
              <button type="button" onClick={() => onRemoveDie(die.id)}>
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>
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
        Volume
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(settings.masterVolume * 100)}
          onChange={(event) => updateSettings({ masterVolume: Number(event.target.value) / 100 })}
        />
      </label>

      <div className="settings-row">
        <span>Interact key</span>
        <button type="button" onClick={() => setRebinding(true)} disabled={rebinding}>
          {rebinding ? 'Press a key…' : formatKeyCode(settings.interactKey)}
        </button>
      </div>
      {rebindError && <p role="alert">{rebindError}</p>}

      <p className="tab-empty-note">More settings will land here as they're added.</p>
    </div>
  );
}
