import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { GameState } from '@custom-tabletop/shared';
import { uploadImage, uploadSound } from './uploads.js';

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
}

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
}: SessionViewProps) {
  const isHost = playerId === state.hostId;
  const activeScene = state.scenes.find((scene) => scene.id === state.activeSceneId);
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [mapUploadError, setMapUploadError] = useState<string | null>(null);
  const [mapUploading, setMapUploading] = useState(false);
  const [soundUploadError, setSoundUploadError] = useState<string | null>(null);
  const [soundUploading, setSoundUploading] = useState(false);

  function handleSetMap(event: FormEvent) {
    event.preventDefault();
    onSetMapBackground(backgroundUrl.trim());
  }

  async function handleMapFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // lets the same file be picked again later
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

  return (
    <div>
      <p>
        Session <strong>{state.sessionId}</strong>
      </p>
      <ul>
        {state.players.map((player) => {
          const canModerate = player.id === playerId || isHost;
          return (
            <li key={player.id}>
              {player.name}
              {player.id === state.hostId && ' (host)'}
              {player.id === playerId && ' (you)'}
              {player.muted && ' (muted)'}
              {canModerate && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() =>
                      player.muted ? onUnmutePlayer(player.id) : onMutePlayer(player.id)
                    }
                  >
                    {player.muted ? 'Unmute' : 'Mute'}
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {isHost && (
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
            <input
              type="file"
              accept="image/*"
              onChange={(event) => void handleMapFileChange(event)}
            />
          </label>
          {mapUploading && <p>Uploading map…</p>}
          {mapUploadError && <p role="alert">{mapUploadError}</p>}
        </div>
      )}
      <div>
        <p>Dice</p>
        <button type="button" onClick={onSpawnDie}>
          Spawn die
        </button>
        <ul>
          {state.dice.map((die) => (
            <li key={die.id}>
              {die.id.slice(0, 6)}: {die.result ?? 'unrolled'}{' '}
              <button type="button" onClick={() => onRollDie(die.id)}>
                Roll
              </button>{' '}
              <button type="button" onClick={() => onRemoveDie(die.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p>Soundboard</p>
        <ul>
          {state.soundboard.map((sound) => (
            <li key={sound.id}>
              {sound.name}
              {isHost && (
                <>
                  {' '}
                  <button type="button" onClick={() => onPlaySound(sound.id)}>
                    Play
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        <label>
          Upload a sound (shared with everyone)
          <input
            type="file"
            accept="audio/*"
            onChange={(event) => void handleSoundFileChange(event)}
          />
        </label>
        {soundUploading && <p>Uploading sound…</p>}
        {soundUploadError && <p role="alert">{soundUploadError}</p>}
      </div>
      <button onClick={onLeave}>Leave session</button>
    </div>
  );
}
