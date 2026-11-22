// ============================================================
// SoundManager — Procedural sound effects using the Web Audio API.
// No audio files: every effect is a short synthesized recipe.
// Mute/volume are stored in Settings.
// ============================================================

import { settings, saveSettings } from '../config/Settings';

type Recipe = (ctx: AudioContext, out: GainNode, t: number) => void;

export class SoundManager {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private failed = false;

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
      this.ctx = new Ctor();
    } catch {
      this.failed = true;
      console.warn('Web Audio API not available — sound disabled');
    }
    return this.ctx;
  }

  get enabled(): boolean {
    return settings.soundEnabled;
  }

  setEnabled(enabled: boolean): void {
    settings.soundEnabled = enabled;
    saveSettings();
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
  }

  private play(recipe: Recipe): void {
    if (!settings.soundEnabled || settings.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    const out = ctx.createGain();
    out.gain.value = settings.volume;
    out.connect(ctx.destination);
    recipe(ctx, out, ctx.currentTime);
  }

  /** Simple oscillator blip with an exponential pitch and volume envelope. */
  private tone(
    type: OscillatorType, f0: number, f1: number, peak: number, dur: number, delay = 0,
  ): Recipe {
    return (ctx, out, t0) => {
      const t = t0 + delay;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    };
  }

  private noise(dur: number, peak: number, filterFreq: number, attack = 0.01, delay = 0): Recipe {
    return (ctx, out, t0) => {
      const t = t0 + delay;
      if (!this.noiseBuffer) {
        const len = ctx.sampleRate * 2;
        this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = filterFreq;
      filter.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter).connect(g).connect(out);
      src.start(t);
      src.stop(t + dur + 0.05);
    };
  }

  kick(): void {
    this.play(this.tone('sine', 300, 100, 0.45, 0.15));
  }

  pass(): void {
    this.play(this.tone('sine', 420, 200, 0.35, 0.1));
  }

  shoot(): void {
    this.play(this.tone('sawtooth', 500, 80, 0.4, 0.22));
  }

  powerShot(): void {
    this.play((ctx, out, t) => {
      this.tone('sawtooth', 620, 60, 0.45, 0.3)(ctx, out, t);
      this.noise(0.2, 0.35, 1800)(ctx, out, t);
    });
  }

  tackle(): void {
    this.play(this.noise(0.12, 0.3, 900));
  }

  bounce(): void {
    this.play(this.tone('sine', 250, 140, 0.22, 0.08));
  }

  save(): void {
    this.play((ctx, out, t) => {
      this.tone('square', 180, 90, 0.2, 0.12)(ctx, out, t);
      this.noise(0.1, 0.2, 700)(ctx, out, t);
    });
  }

  goal(): void {
    this.play((ctx, out, t) => {
      [523, 659, 784, 1047].forEach((f, i) => {
        this.tone('square', f, f, 0.18, 0.28, i * 0.13)(ctx, out, t);
      });
      // Crowd roar
      this.noise(1.6, 0.25, 1100, 0.25, 0.05)(ctx, out, t);
    });
  }

  whistle(): void {
    this.play((ctx, out, t) => {
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 2400;
      lfo.frequency.value = 28;
      lfoGain.gain.value = 120;
      lfo.connect(lfoGain).connect(osc.frequency);
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.setValueAtTime(0.18, t + 0.35);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(g).connect(out);
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
    this.play(this.tone('square', 660, 660, 0.12, 0.06));
  }

  menuHover(): void {
    this.play(this.tone('sine', 500, 500, 0.07, 0.03));
  }
}

// Global singleton
export const soundManager = new SoundManager();
