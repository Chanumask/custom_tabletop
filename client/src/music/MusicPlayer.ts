import {
  isRecordId,
  parseYouTubeUrl,
  SOUND_RECORD_PREFIX,
  type RecordId,
  type RecordPlaying,
  type SoundState,
} from '@custom-tabletop/shared';
import { categoryOutput, categoryVolume } from '../audioMix.js';
import { getAudioContext } from '../sounds.js';
import type { Placement } from '../spatialAudio.js';
import { makeReverb, play, type Band } from './instruments.js';
import { eventsBetween, songFor, type Song } from './songs.js';

/** How far ahead notes are scheduled (seconds) — far more while the tab is
 * in the background, where timers only run about once a second. */
const LOOKAHEAD = 0.5;
const HIDDEN_LOOKAHEAD = 3;
const TICK_MS = 120;
/** A record fades in when put on, and out when taken off. */
const FADE_SECONDS = 0.6;

/** How each record sounds as a whole: how much room, how dark, how much
 * crackle and warble — a record, after all. */
const MIX: Record<
  RecordId,
  { level: number; reverb: number; tone: number; crackle: number; warble: number }
> = {
  tavern: { level: 0.95, reverb: 0.22, tone: 9000, crackle: 0.5, warble: 3 },
  lofi: { level: 0.9, reverb: 0.25, tone: 4500, crackle: 1, warble: 9 },
  'rain-jazz': { level: 1.4, reverb: 0.3, tone: 6500, crackle: 0.7, warble: 4 },
};

/** A soundboard sound on the record player: `sound:<id>` → its id. */
export function soundOnRecord(record: string): string | null {
  return record.startsWith(SOUND_RECORD_PREFIX) ? record.slice(SOUND_RECORD_PREFIX.length) : null;
}

/** Soundboard sounds a record player can play: audio files, not YouTube
 * links (those play on the TV) and not the built-in effects. */
export function playableSounds(soundboard: readonly SoundState[]): SoundState[] {
  return soundboard.filter((sound) => sound.url && !parseYouTubeUrl(sound.url));
}

/** Where a looping file should be now: `elapsed` seconds in, `duration` long. */
export function loopPosition(elapsed: number, duration: number): number {
  if (!(duration > 0)) return 0;
  return ((elapsed % duration) + duration) % duration;
}

interface Playing {
  record: string;
  startedAt: number;
  /** The record player's own music: its bus, and how far it's scheduled. */
  song: Song | null;
  output: GainNode | null;
  scheduledUntil: number;
  /** Maps the record's time onto the audio clock (seconds). */
  anchor: { audio: number; song: number } | null;
  nextCrackle: number;
  /** Where its notes go. */
  band: Band | null;
  /** A soundboard sound instead: an audio element, looping. */
  file: HTMLAudioElement | null;
  lastSync: number;
}

/**
 * The record player's sound (docs/decisions.md, "The cozy room"): plays
 * what `GameState.room.record` says — one of its own records, composed as
 * it plays (songs.ts) and scheduled a little ahead in step with the
 * server's clock so everyone hears the same bar at the same moment; or a
 * soundboard sound, looping, kept in step the same way. In the player's
 * "Music" sound category (audioMix.ts), and a little louder near it.
 */
export class MusicPlayer {
  private playing: Playing | null = null;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private panner: StereoPannerNode | null = null;
  private wobble: OscillatorNode | null = null;
  private wobbleDepth: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private placement: Placement = { volume: 1, pan: 0 };
  /** One pop of the needle, made once. */
  private click: AudioBuffer | null = null;
  /** How many notes it has played (for checking it's playing at all). */
  notesScheduled = 0;

  constructor(
    /** The server's clock now (ms) — the room's `serverOffset` applied. */
    private readonly now: () => number,
    /** A soundboard sound's URL by id, or null if it's gone. */
    private readonly soundUrl: (soundId: string) => string | null,
  ) {}

  /** Follows `GameState.room.record`: starts, changes or stops the music. */
  setRecord(record: RecordPlaying | null): void {
    const current = this.playing;
    if (
      current &&
      record &&
      current.record === record.record &&
      current.startedAt === record.startedAt
    ) {
      return;
    }
    this.stop();
    if (!record) return;
    const playing: Playing = {
      record: record.record,
      startedAt: record.startedAt,
      song: isRecordId(record.record) ? songFor(record.record) : null,
      output: null,
      scheduledUntil: 0,
      anchor: null,
      nextCrackle: 0,
      band: null,
      file: null,
      lastSync: 0,
    };
    this.playing = playing;
    if (playing.song) {
      this.startSong(playing, playing.song.id);
    } else {
      const soundId = soundOnRecord(record.record);
      const url = soundId ? this.soundUrl(soundId) : null;
      if (url) this.startFile(playing, url);
    }
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  /** How loud and where from, for the listener (RoomView, every frame). */
  setPlacement(place: Placement): void {
    this.placement = place;
    const ctx = this.ctx;
    if (ctx && this.master && this.panner) {
      this.master.gain.setTargetAtTime(place.volume, ctx.currentTime, 0.15);
      this.panner.pan.setTargetAtTime(place.pan, ctx.currentTime, 0.15);
    }
    const file = this.playing?.file;
    if (file) file.volume = Math.min(1, categoryVolume('music') * place.volume * 0.8);
  }

  /** What's on now (for the turntable spinning), or null. */
  get current(): string | null {
    return this.playing?.record ?? null;
  }

  dispose(): void {
    this.stop();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.wobble?.stop();
    this.master?.disconnect();
    this.master = null;
    this.wobble = null;
  }

  private stop(): void {
    const playing = this.playing;
    this.playing = null;
    if (!playing) return;
    const ctx = this.ctx;
    if (playing.output && ctx) {
      const output = playing.output;
      output.gain.cancelScheduledValues(ctx.currentTime);
      output.gain.setValueAtTime(output.gain.value, ctx.currentTime);
      output.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_SECONDS);
      // Notes already scheduled play out into silence, then it's let go.
      setTimeout(() => output.disconnect(), (FADE_SECONDS + HIDDEN_LOOKAHEAD + 1) * 1000);
    }
    if (playing.file) {
      playing.file.pause();
      playing.file.src = '';
    }
  }

  /** The shared chain: every record → master (placement) → pan → "Music". */
  private ensureChain(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const ctx = getAudioContext();
    if (!ctx) return null;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.placement.volume;
    this.panner = ctx.createStereoPanner();
    this.panner.pan.value = this.placement.pan;
    // Keep the peaks round when the whole band hits at once.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.01;
    limiter.release.value = 0.2;
    this.master.connect(limiter).connect(this.panner).connect(categoryOutput(ctx, 'music'));
    // The warble: a slow drift in pitch, a few cents.
    this.wobble = ctx.createOscillator();
    this.wobble.frequency.value = 0.55;
    this.wobbleDepth = ctx.createGain();
    this.wobbleDepth.gain.value = 0;
    this.wobble.connect(this.wobbleDepth);
    this.wobble.start();
    return ctx;
  }

  private startSong(playing: Playing, id: RecordId): void {
    const ctx = this.ensureChain();
    if (!ctx || !this.master) return;
    const mix = MIX[id];
    this.wobbleDepth?.gain.setValueAtTime(mix.warble, ctx.currentTime);
    const output = ctx.createGain();
    output.gain.setValueAtTime(0, ctx.currentTime);
    output.gain.linearRampToValueAtTime(0.5 * mix.level, ctx.currentTime + FADE_SECONDS);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = mix.tone;
    tone.Q.value = 0.5;
    // Old records have no real bass below this, either.
    const rumble = ctx.createBiquadFilter();
    rumble.type = 'highpass';
    rumble.frequency.value = 40;
    const dry = ctx.createGain();
    const reverb = makeReverb(ctx, 2.2);
    const send = ctx.createGain();
    send.gain.value = mix.reverb;
    dry.connect(tone);
    dry.connect(send).connect(reverb).connect(tone);
    tone.connect(rumble).connect(output).connect(this.master);
    playing.output = output;
    playing.band = { ctx, out: dry, wobble: this.wobbleDepth };
  }

  private startFile(playing: Playing, url: string): void {
    const audio = new Audio(url);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = Math.min(1, categoryVolume('music') * this.placement.volume * 0.8);
    playing.file = audio;
    audio.addEventListener('loadedmetadata', () => this.syncFile(playing, true));
  }

  private syncFile(playing: Playing, force = false): void {
    const audio = playing.file;
    if (!audio || !(audio.duration > 0)) return;
    const elapsed = (this.now() - playing.startedAt) / 1000;
    const want = loopPosition(elapsed, audio.duration);
    const off = Math.abs(audio.currentTime - want);
    // Close enough, or just wrapping round the loop.
    if (force || (off > 0.35 && off < audio.duration - 0.35)) audio.currentTime = want;
    if (audio.paused) void audio.play().catch(() => {});
  }

  private tick(): void {
    const playing = this.playing;
    if (!playing) return;
    if (playing.file) {
      const at = performance.now();
      if (at - playing.lastSync > 2000) {
        playing.lastSync = at;
        this.syncFile(playing);
      }
      return;
    }
    const ctx = this.ctx;
    const song = playing.song;
    const band = playing.band;
    if (!ctx || !song || !band) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const songNow = (this.now() - playing.startedAt) / 1000;
    const audioNow = ctx.currentTime;
    // Keep the record's clock on the audio clock, re-pinning only if they
    // drift apart (so notes stay evenly spaced).
    const anchor = playing.anchor;
    if (!anchor || Math.abs(anchor.audio + (songNow - anchor.song) - audioNow) > 0.06) {
      playing.anchor = { audio: audioNow, song: songNow };
    }
    const { audio: anchorAudio, song: anchorSong } = playing.anchor!;
    const toAudio = (songTime: number) => anchorAudio + (songTime - anchorSong);
    // Nothing to hear with the music turned off: skip ahead, schedule nothing.
    const ahead = document.hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD;
    const from = Math.max(playing.scheduledUntil, songNow + 0.02);
    const until = songNow + ahead;
    playing.scheduledUntil = until;
    if (categoryVolume('music') <= 0 || until <= from) return;
    for (const event of eventsBetween(song, from, until)) {
      play(band, event, toAudio(event.at));
      this.notesScheduled += 1;
    }
    this.crackle(playing, band, songNow, until, toAudio);
  }

  /** The needle in the groove: soft pops and ticks, now and then. */
  private crackle(
    playing: Playing,
    band: Band,
    songNow: number,
    until: number,
    toAudio: (songTime: number) => number,
  ): void {
    const amount = playing.song ? MIX[playing.song.id].crackle : 0;
    if (amount <= 0) return;
    if (playing.nextCrackle < songNow) playing.nextCrackle = songNow + Math.random() * 0.3;
    const { ctx, out } = band;
    if (!this.click) {
      this.click = ctx.createBuffer(1, 96, ctx.sampleRate);
      const data = this.click.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
      }
    }
    while (playing.nextCrackle < until) {
      const at = toAudio(playing.nextCrackle);
      const source = ctx.createBufferSource();
      source.buffer = this.click;
      source.playbackRate.value = 0.6 + Math.random() * 0.9;
      const gain = ctx.createGain();
      gain.gain.value = (0.02 + Math.random() * 0.05) * amount;
      source.connect(gain).connect(out);
      source.start(at);
      playing.nextCrackle += 0.05 + Math.random() * 0.45;
    }
  }
}
