// ============================================================
// Tunes — Chiptune music and jingles as plain data (original
// compositions). Pure module: no Web Audio, unit-testable.
//
// Each voice is a string of space-separated tokens, one per step
// (an eighth note at the track's tempo):
//   note voices:  'C5', 'F#4' … start a note; '-' holds it; '.' rest
//   drum voice:   'k' kick, 's' snare, 'h' hi-hat, '.' rest
// Bars are written 8 tokens each; all voices of a track must have
// the same number of steps.
// ============================================================

export type VoiceWave = 'square' | 'triangle' | 'drums';

export interface Voice {
  wave: VoiceWave;
  /** Relative loudness of the voice (0..1). */
  gain: number;
  notes: string;
}

export interface Track {
  /** Beats per minute; one step is an eighth note. */
  bpm: number;
  voices: Voice[];
}

export type TrackId = 'menu' | 'match';
export type JingleId = 'goal' | 'halftime' | 'win' | 'lose' | 'draw';

const bars = (...b: string[]) => b.join(' ');

/** Bass: root, octave, root, octave … for each chord root (one bar each). */
const octaveBass = (...roots: Array<[string, string]>) =>
  roots.map(([lo, hi]) => `${lo} ${hi} ${lo} ${hi} ${lo} ${hi} ${lo} ${hi}`).join(' ');

/** Main menu: upbeat theme over G – Em – C – D, twice with a variation. */
const MENU: Track = {
  bpm: 138,
  voices: [
    {
      wave: 'square',
      gain: 0.5,
      notes: bars(
        'D5 - B4 D5 G5 - F#5 E5',
        'D5 - B4 G4 E4 - G4 B4',
        'C5 - E5 G5 E5 - C5 E5',
        'D5 - F#5 A5 F#5 - D5 -',
        'B5 - A5 G5 D5 - G5 -',
        'E5 - D5 B4 G4 - B4 -',
        'C5 E5 G5 C6 B5 - A5 -',
        'A5 - F#5 D5 F#5 - A5 .',
      ),
    },
    {
      wave: 'triangle',
      gain: 0.9,
      notes: octaveBass(
        ['G2', 'G3'], ['E2', 'E3'], ['C3', 'C4'], ['D3', 'D4'],
        ['G2', 'G3'], ['E2', 'E3'], ['C3', 'C4'], ['D3', 'D4'],
      ),
    },
    {
      wave: 'drums',
      gain: 0.7,
      notes: Array(8).fill('k h s h k k s h').join(' '),
    },
  ],
};

/** In-match background: calm groove over Am – F – C – G (played quietly). */
const MATCH: Track = {
  bpm: 112,
  voices: [
    {
      wave: 'square',
      gain: 0.3,
      notes: bars(
        'A4 C5 E5 C5 A4 C5 E5 C5',
        'F4 A4 C5 A4 F4 A4 C5 A4',
        'C5 E5 G5 E5 C5 E5 G5 E5',
        'G4 B4 D5 B4 G4 B4 D5 B4',
      ),
    },
    {
      wave: 'triangle',
      gain: 0.9,
      notes: bars(
        'A2 . A2 A3 . A2 E3 .',
        'F2 . F2 F3 . F2 C3 .',
        'C3 . C3 C4 . C3 G3 .',
        'G2 . G2 G3 . G2 D3 .',
      ),
    },
    {
      wave: 'drums',
      gain: 0.6,
      notes: Array(4).fill('k . h . s . h h').join(' '),
    },
  ],
};

export const TRACKS: Record<TrackId, Track> = { menu: MENU, match: MATCH };

export const JINGLES: Record<JingleId, Track> = {
  goal: {
    bpm: 220,
    voices: [
      { wave: 'square', gain: 0.6, notes: 'C5 E5 G5 C6 - G5 C6 E6 - - - .' },
      { wave: 'triangle', gain: 0.9, notes: 'C3 . C3 . G2 . C3 . - - - .' },
      { wave: 'drums', gain: 0.7, notes: 'k . k . k . k s . s s .' },
    ],
  },
  halftime: {
    bpm: 180,
    voices: [
      { wave: 'square', gain: 0.5, notes: 'G4 C5 E5 G5 - E5 G5 - - .' },
      { wave: 'triangle', gain: 0.9, notes: 'C3 . G2 . C3 . C3 - - .' },
    ],
  },
  win: {
    bpm: 200,
    voices: [
      { wave: 'square', gain: 0.6, notes: 'C5 E5 G5 C6 G5 C6 E6 - G6 - - - .' },
      { wave: 'triangle', gain: 0.9, notes: 'C3 . E3 . G3 . C4 - C3 - - - .' },
      { wave: 'drums', gain: 0.7, notes: 'k h k h k h s . k s s s .' },
    ],
  },
  lose: {
    bpm: 150,
    voices: [
      { wave: 'square', gain: 0.5, notes: 'E5 - D5 - C5 - B4 - A4 - - - .' },
      { wave: 'triangle', gain: 0.9, notes: 'A2 - - - F2 - - - E2 - A2 - .' },
    ],
  },
  draw: {
    bpm: 170,
    voices: [
      { wave: 'square', gain: 0.5, notes: 'C5 G4 C5 - E5 D5 C5 - - .' },
      { wave: 'triangle', gain: 0.9, notes: 'C3 . G2 . C3 . C3 - - .' },
    ],
  },
};

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Frequency (Hz) of a note name like 'A4' or 'F#3'; null for anything else. */
export function noteFrequency(name: string): number | null {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) return null;
  const semitone = NOTE_INDEX[m[1]] + (m[2] ? 1 : 0);
  const midi = (Number(m[3]) + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export interface ParsedVoice {
  wave: VoiceWave;
  gain: number;
  tokens: string[];
}

export function parseTrack(track: Track): { stepSec: number; steps: number; voices: ParsedVoice[] } {
  const voices = track.voices.map((v) => ({ wave: v.wave, gain: v.gain, tokens: v.notes.trim().split(/\s+/) }));
  return {
    stepSec: 60 / track.bpm / 2,
    steps: Math.max(...voices.map((v) => v.tokens.length)),
    voices,
  };
}

/** How many steps the note starting at `step` lasts (itself plus following '-'). */
export function noteLength(tokens: string[], step: number): number {
  let len = 1;
  while (tokens[step + len] === '-') len++;
  return len;
}
