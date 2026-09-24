import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  MAX_PLAYER_NAME_LENGTH,
  playerColorHex,
  type GameState,
  type Player,
  type PlayerColorId,
} from '@custom-tabletop/shared';
import { ColorPicker } from './ColorPicker.js';
import type { ToastKind } from './useToasts.js';
import { uploadImage, uploadSound } from './uploads.js';
import { useSettings } from './useSettings.js';
import { deriveNameFromUrl } from './soundName.js';
import { formatKeyCode } from './keyLabel.js';
import { MOVEMENT_KEYS } from './three/FirstPersonController.js';
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
          <SoundboardTab state={state} onPlaySound={onPlaySound} onUploadSound={onUploadSound} />
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
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [mapUploadError, setMapUploadError] = useState<string | null>(null);
  const [mapUploading, setMapUploading] = useState(false);

  function handleSetMap(event: FormEvent) {
    event.preventDefault();
    onSetMapBackground(backgroundUrl.trim());
  }

  async function handleMapFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setMapUploading(true);
    setMapUploadError(null);
    try {
      const url = await uploadImage(file);
      onSetMapBackground(url);
    } catch (error) {
      setMapUploadError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setMapUploading(false);
    }
  }

  if (!isHost) {
    return <p className="tab-empty-note">Only the host can change the map.</p>;
  }

  return (
    <div>
      <form onSubmit={handleSetMap}>
        <label>
          Map background URL
          <input
            value={backgroundUrl}
            onChange={(event) => setBackgroundUrl(event.target.value)}
            placeholder={activeScene?.backgroundImage || 'leave blank for a plain map'}
          />
        </label>
        <button type="submit">Set map</button>
      </form>
      <label>
        or upload an image
        <input type="file" accept="image/*" onChange={(event) => void handleMapFileChange(event)} />
      </label>
      {mapUploading && <p>Uploading map…</p>}
      {mapUploadError && <p role="alert">{mapUploadError}</p>}
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
  onPlaySound,
  onUploadSound,
}: {
  state: GameState;
  onPlaySound: (soundId: string) => void;
  onUploadSound: (name: string, url: string) => void;
}) {
  const [soundUploadError, setSoundUploadError] = useState<string | null>(null);
  const [soundUploading, setSoundUploading] = useState(false);
  const [soundUrl, setSoundUrl] = useState('');

  async function handleSoundFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setSoundUploading(true);
    setSoundUploadError(null);
    try {
      const url = await uploadSound(file);
      onUploadSound(file.name.replace(/\.[^./]+$/, ''), url);
    } catch (error) {
      setSoundUploadError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setSoundUploading(false);
    }
  }

  function handleAddSoundUrl(event: FormEvent) {
    event.preventDefault();
    const trimmed = soundUrl.trim();
    if (!trimmed) {
      return;
    }
    onUploadSound(deriveNameFromUrl(trimmed), trimmed);
    setSoundUrl('');
  }

  return (
    <div>
      <ul className="sound-list">
        {state.soundboard.map((sound) => (
          <li key={sound.id}>
            <span>{sound.name}</span>
            <button type="button" onClick={() => onPlaySound(sound.id)}>
              Play
            </button>
          </li>
        ))}
      </ul>
      <p className="tab-section-label">Add a sound (shared with everyone)</p>
      <label>
        Upload a file
        <input
          type="file"
          accept="audio/*"
          onChange={(event) => void handleSoundFileChange(event)}
        />
      </label>
      <form onSubmit={handleAddSoundUrl}>
        <label>
          or a direct link to an audio file
          <input
            value={soundUrl}
            onChange={(event) => setSoundUrl(event.target.value)}
            placeholder="https://…/sound.mp3"
          />
        </label>
        <button type="submit">Add</button>
      </form>
      {soundUploading && <p>Uploading sound…</p>}
      {soundUploadError && <p role="alert">{soundUploadError}</p>}
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
      if (MOVEMENT_KEYS.has(event.code)) {
        setRebindError('That key is used for movement — try another.');
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
