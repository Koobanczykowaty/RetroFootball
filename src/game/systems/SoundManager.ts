// ============================================================
// SoundManager — Procedural 8-bit audio with the Web Audio API.
// No audio files: effects are short synthesized recipes, music and
// jingles come from note data in audio/Tunes.ts, and the crowd is
// filtered noise with retro chants.
//
// Signal chain: every source → master gain (volume, mute) → output.
// Music has its own gain under the master (on/off, per-track level,
// ducking during goals). Mute, volume and music on/off live in Settings.
// ============================================================

import { settings, saveSettings } from '../config/Settings';
import {
  JINGLES, JingleId, TRACKS, Track, TrackId, noteFrequency, noteLength, parseTrack,
} from '../audio/Tunes';

type Recipe = (ctx: AudioContext, out: AudioNode, t: number) => void;

/** Music level relative to the master volume, per track. */
const MUSIC_LEVEL: Record<TrackId, number> = { menu: 0.5, match: 0.16 };
const CROWD_BASE = 0.03;
const SCHEDULE_AHEAD = 0.2; // s of music scheduled in advance
const CHANT_EVERY_MS = 24000;

interface MusicState {
  id: TrackId;
  parsed: ReturnType<typeof parseTrack>;
  step: number;
  nextTime: number;
  timer: ReturnType<typeof setInterval>;
}

export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private whiteNoise: AudioBuffer | null = null;
  private crunchNoise: AudioBuffer | null = null;
  private failed = false;

  private music: MusicState | null = null;
  /** Track that should play when music is (re-)enabled. */
  private wantedTrack: TrackId | null = null;
  private duckUntil = 0;

  private crowd: { src: AudioBufferSourceNode; gain: GainNode; chantTimer: ReturnType<typeof setInterval> } | null = null;

  /** Creates the AudioContext lazily; browsers only start it after a user gesture. */
  init(): void {
    this.ensureContext();
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx || this.failed) return this.ctx;
    try {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('no AudioContext');
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);
      this.applyMaster();
      // Browsers keep audio suspended until the first user gesture (the menu
      // music starts before it): resume on the first key / click.
      const unlock = () => {
        if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      };
      window.addEventListener('keydown', unlock);
      window.addEventListener('pointerdown', unlock);
    } catch {
      this.failed = true;
      console.warn('Web Audio API not available — sound disabled');
    }
    return this.ctx;
  }

  private applyMaster(): void {
    if (!this.ctx || !this.master) return;
    const v = settings.soundEnabled ? settings.volume : 0;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  get enabled(): boolean {
    return settings.soundEnabled;
  }

  setEnabled(enabled: boolean): void {
    settings.soundEnabled = enabled;
    saveSettings();
    this.applyMaster();
  }

  toggle(): boolean {
    this.setEnabled(!settings.soundEnabled);
    return settings.soundEnabled;
  }

  get volume(): number {
    return settings.volume;
  }

  setVolume(vol: number): void {
    settings.volume = Math.max(0, Math.min(1, Math.round(vol * 10) / 10));
    saveSettings();
    this.applyMaster();
  }

  get musicEnabled(): boolean {
    return settings.musicEnabled;
  }

  setMusicEnabled(enabled: boolean): void {
    settings.musicEnabled = enabled;
    saveSettings();
    const wanted = this.wantedTrack;
    if (!enabled) this.stopScheduler();
    else if (wanted) this.playMusic(wanted);
  }

  // ------------------------------------------------------------ building blocks

  private play(recipe: Recipe): void {
    if (!settings.soundEnabled || settings.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    recipe(ctx, this.master, ctx.currentTime);
  }

  /** Note with a fixed pitch and a short 8-bit style envelope. */
  private note(
    ctx: AudioContext, out: AudioNode, type: OscillatorType, freq: number, t: number, dur: number, peak: number,
  ): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.setValueAtTime(peak, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Pitch slide in audible steps (like old sound chips), f0 → f1. */
  private chirp(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, steps = 6, delay = 0): Recipe {
    return (ctx, out, t0) => {
      const t = t0 + delay;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      for (let i = 0; i < steps; i++) {
        const f = f0 * Math.pow(f1 / f0, i / Math.max(1, steps - 1));
        osc.frequency.setValueAtTime(f, t + (dur * i) / steps);
      }
      g.gain.setValueAtTime(peak, t);
      g.gain.setValueAtTime(peak, t + dur * 0.6);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    };
  }

  /** Fast sequence of fixed notes (arpeggio). */
  private arp(type: OscillatorType, freqs: number[], stepDur: number, peak: number, delay = 0): Recipe {
    return (ctx, out, t0) => {
      freqs.forEach((f, i) => this.note(ctx, out, type, f, t0 + delay + i * stepDur, stepDur, peak));
    };
  }

  private noiseBuffer(ctx: AudioContext, crunchy: boolean): AudioBuffer {
    const existing = crunchy ? this.crunchNoise : this.whiteNoise;
    if (existing) return existing;
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // "Crunchy" noise holds each random value for a few samples, like the
    // noise channel of an old console
    const hold = crunchy ? 12 : 1;
    let v = 0;
    for (let i = 0; i < len; i++) {
      if (i % hold === 0) v = Math.random() * 2 - 1;
      data[i] = v;
    }
    if (crunchy) this.crunchNoise = buf;
    else this.whiteNoise = buf;
    return buf;
  }

  private noise(
    dur: number, peak: number, opts: { crunchy?: boolean; filter?: BiquadFilterType; freq?: number; delay?: number } = {},
  ): Recipe {
    return (ctx, out, t0) => {
      const t = t0 + (opts.delay ?? 0);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(ctx, opts.crunchy ?? true);
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = opts.filter ?? 'lowpass';
      filter.frequency.value = opts.freq ?? 4000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter).connect(g).connect(out);
      src.start(t);
      src.stop(t + dur + 0.02);
    };
  }

  // ------------------------------------------------------------ effects

  kick(): void {
    this.play((ctx, out, t) => {
      this.chirp('square', 260, 90, 0.09, 0.22, 4)(ctx, out, t);
      this.noise(0.04, 0.15, { freq: 2500 })(ctx, out, t);
    });
  }

  pass(): void {
    this.play(this.chirp('square', 520, 390, 0.07, 0.16, 3));
  }

  shoot(): void {
    this.play((ctx, out, t) => {
      this.chirp('square', 700, 140, 0.18, 0.22, 8)(ctx, out, t);
      this.noise(0.12, 0.18, { freq: 3000 })(ctx, out, t);
    });
    this.crowdSwell(0.09, 0.6);
  }

  powerShot(): void {
    this.play((ctx, out, t) => {
      this.arp('square', [880, 660, 440, 220], 0.04, 0.22)(ctx, out, t);
      this.noise(0.22, 0.25, { freq: 3500 })(ctx, out, t);
    });
    this.crowdSwell(0.12, 0.8);
  }

  tackle(): void {
    this.play((ctx, out, t) => {
      this.noise(0.14, 0.28, { freq: 1800 })(ctx, out, t);
      this.chirp('triangle', 200, 80, 0.12, 0.3, 4)(ctx, out, t);
    });
  }

  bounce(): void {
    this.play(this.chirp('triangle', 300, 200, 0.06, 0.28, 2));
  }

  save(): void {
    this.play((ctx, out, t) => {
      this.arp('square', [392, 330, 262], 0.05, 0.18)(ctx, out, t);
      this.noise(0.08, 0.15, { freq: 1500 })(ctx, out, t);
    });
    this.crowdSwell(0.08, 0.5); // "oooh"
  }

  /** The moment the ball goes in: net swoosh and crowd roar (fanfare follows). */
  goal(): void {
    this.play((ctx, out, t) => {
      this.chirp('square', 880, 110, 0.35, 0.18, 10)(ctx, out, t);
      this.noise(0.5, 0.25, { freq: 2200 })(ctx, out, t);
    });
    this.crowdSwell(0.22, 3);
    this.duckMusic(4);
  }

  whistle(): void {
    this.play((ctx, out, t) => {
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 2000;
      lfo.type = 'square'; // trill jumps between two pitches, chip style
      lfo.frequency.value = 24;
      lfoGain.gain.value = 120;
      lfo.connect(lfoGain).connect(osc.frequency);
      filter.type = 'lowpass';
      filter.frequency.value = 3200;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.02);
      g.gain.setValueAtTime(0.07, t + 0.35);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(filter).connect(g).connect(out);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + 0.5);
      lfo.stop(t + 0.5);
    });
  }

  whistleLong(): void {
    this.whistle();
    setTimeout(() => this.whistle(), 550);
    setTimeout(() => this.whistle(), 1100);
  }

  menuClick(): void {
    this.play(this.arp('square', [660, 990], 0.03, 0.1));
  }

  menuHover(): void {
    this.play(this.chirp('square', 880, 880, 0.03, 0.05, 1));
  }

  // ------------------------------------------------------------ music

  /** Starts a looping track (no-op if it already plays). */
  playMusic(id: TrackId): void {
    this.wantedTrack = id;
    if (this.music?.id === id) return;
    this.stopScheduler();
    if (!settings.musicEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.musicGain) return;
    this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
    this.musicGain.gain.setTargetAtTime(MUSIC_LEVEL[id], ctx.currentTime, 0.1);
    const state: MusicState = {
      id,
      parsed: parseTrack(TRACKS[id]),
      step: 0,
      nextTime: ctx.currentTime + 0.1,
      timer: setInterval(() => this.scheduleMusic(), 40),
    };
    this.music = state;
    this.scheduleMusic();
  }

  /** Stops the music (e.g. at full time, before the result jingle). */
  stopMusic(): void {
    this.wantedTrack = null;
    this.stopScheduler();
  }

  private stopScheduler(): void {
    if (!this.music) return;
    clearInterval(this.music.timer);
    this.music = null;
    if (this.ctx && this.musicGain) {
      // Fade out what is already scheduled
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  private scheduleMusic(): void {
    const m = this.music;
    const ctx = this.ctx;
    if (!m || !ctx || !this.musicGain) return;
    // After a long stall (hidden tab) restart from now instead of catching up
    if (m.nextTime < ctx.currentTime - 0.5) m.nextTime = ctx.currentTime + 0.05;
    while (m.nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(ctx, this.musicGain, m.parsed, m.step, m.nextTime);
      m.nextTime += m.parsed.stepSec;
      m.step = (m.step + 1) % m.parsed.steps;
    }
  }

  private scheduleStep(
    ctx: AudioContext, out: AudioNode, parsed: ReturnType<typeof parseTrack>, step: number, t: number,
  ): void {
    for (const v of parsed.voices) {
      const token = v.tokens[step];
      if (!token || token === '.' || token === '-') continue;
      if (v.wave === 'drums') {
        this.drum(ctx, out, token, t, v.gain);
        continue;
      }
      const f = noteFrequency(token);
      if (f === null) continue;
      const dur = noteLength(v.tokens, step) * parsed.stepSec * 0.92;
      // Square waves are much louder than triangles at the same amplitude
      const peak = (v.wave === 'square' ? 0.09 : 0.3) * v.gain;
      this.note(ctx, out, v.wave, f, t, dur, peak);
    }
  }

  private drum(ctx: AudioContext, out: AudioNode, token: string, t: number, gain: number): void {
    if (token === 'k') this.chirp('triangle', 160, 45, 0.1, 0.55 * gain, 5)(ctx, out, t);
    else if (token === 's') this.noise(0.12, 0.22 * gain, { crunchy: true, filter: 'highpass', freq: 1200 })(ctx, out, t);
    else if (token === 'h') this.noise(0.03, 0.1 * gain, { crunchy: false, filter: 'highpass', freq: 6000 })(ctx, out, t);
  }

  /** Lowers the music for a while (goal roar, fanfare). */
  private duckMusic(seconds: number): void {
    const ctx = this.ctx;
    const m = this.music;
    if (!ctx || !this.musicGain || !m) return;
    const now = ctx.currentTime;
    this.duckUntil = now + seconds;
    const level = MUSIC_LEVEL[m.id];
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setTargetAtTime(level * 0.2, now, 0.05);
    this.musicGain.gain.setTargetAtTime(level, this.duckUntil, 0.4);
  }

  /** One-shot tune: goal fanfare, half time, full-time result. */
  jingle(id: JingleId): void {
    const track: Track = JINGLES[id];
    this.play((ctx, out, t0) => {
      const parsed = parseTrack(track);
      for (let s = 0; s < parsed.steps; s++) this.scheduleStep(ctx, out, parsed, s, t0 + 0.02 + s * parsed.stepSec);
    });
    if (id === 'goal' || id === 'halftime') this.duckMusic(2.5);
  }

  // ------------------------------------------------------------ crowd

  /** Background crowd murmur with an occasional retro chant (match only). */
  startCrowd(): void {
    if (this.crowd) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx, false);
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 600;
    band.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = CROWD_BASE;
    src.connect(band).connect(gain).connect(this.master);
    src.start();
    const chantTimer = setInterval(() => this.chant(), CHANT_EVERY_MS);
    this.crowd = { src, gain, chantTimer };
  }

  stopCrowd(): void {
    if (!this.crowd) return;
    clearInterval(this.crowd.chantTimer);
    try {
      this.crowd.src.stop();
    } catch {
      // already stopped
    }
    this.crowd = null;
  }

  /** The crowd gets louder for a moment (shot, save, goal). */
  crowdSwell(peak: number, seconds: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.crowd) return;
    const g = this.crowd.gain.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(peak, now, 0.08);
    g.setTargetAtTime(CROWD_BASE, now + seconds, 0.5);
  }

  /** Clap-clap, clap-clap-clap with chanted voices, twice. */
  private chant(): void {
    if (!this.crowd) return;
    this.play((ctx, out, t0) => {
      const beat = 0.28;
      const claps = [0, 2, 4, 5, 6];
      for (let rep = 0; rep < 2; rep++) {
        const base = t0 + rep * beat * 8;
        for (const c of claps) {
          this.noise(0.05, 0.07, { crunchy: false, filter: 'bandpass', freq: 1500, delay: base + c * beat - t0 })(ctx, out, t0);
        }
        // Voices: two slightly detuned squares through a low-pass, far away
        const voice = ctx.createBiquadFilter();
        voice.type = 'lowpass';
        voice.frequency.value = 900;
        voice.connect(out);
        const tune: Array<[number, number, number]> = [[330, 0, 1.6], [262, 2, 1.6], [330, 4, 0.8], [330, 5, 0.8], [294, 6, 1.6]];
        for (const [f, at, len] of tune) {
          for (const detune of [0, 3]) this.note(ctx, voice, 'square', f + detune, base + at * beat, len * beat, 0.03);
        }
      }
    });
  }
}

// Global singleton
export const soundManager = new SoundManager();
