import { describe, expect, it } from 'vitest';
import { JINGLES, TRACKS, noteFrequency, noteLength, parseTrack } from '../src/game/audio/Tunes';

describe('Tunes', () => {
  it('computes note frequencies', () => {
    expect(noteFrequency('A4')).toBeCloseTo(440, 5);
    expect(noteFrequency('A3')).toBeCloseTo(220, 5);
    expect(noteFrequency('C4')).toBeCloseTo(261.63, 1);
    expect(noteFrequency('F#4')).toBeCloseTo(369.99, 1);
    expect(noteFrequency('-')).toBeNull();
    expect(noteFrequency('k')).toBeNull();
  });

  it('measures held notes', () => {
    const tokens = 'C5 - - E5 . G5 -'.split(' ');
    expect(noteLength(tokens, 0)).toBe(3);
    expect(noteLength(tokens, 3)).toBe(1);
    expect(noteLength(tokens, 5)).toBe(2);
  });

  const all = { ...TRACKS, ...JINGLES };
  for (const [id, track] of Object.entries(all)) {
    it(`"${id}" has voices of equal length with valid tokens`, () => {
      const parsed = parseTrack(track);
      for (const v of parsed.voices) {
        expect(v.tokens.length).toBe(parsed.steps);
        // A voice must not start by holding a note it never played
        expect(v.tokens[0]).not.toBe('-');
        for (const tok of v.tokens) {
          if (tok === '-' || tok === '.') continue;
          if (v.wave === 'drums') expect(['k', 's', 'h']).toContain(tok);
          else expect(noteFrequency(tok)).not.toBeNull();
        }
      }
    });
  }

  it('loops are whole bars', () => {
    for (const track of Object.values(TRACKS)) expect(parseTrack(track).steps % 8).toBe(0);
  });
});
