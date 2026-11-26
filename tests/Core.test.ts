import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AI_PROFILES, TEAMMATE_PROFILE } from '../src/core/config/GameplayConfig';
import { MatchOptions, MatchSimulation } from '../src/core/MatchSimulation';
import { Rng } from '../src/core/Rng';
import { EMPTY_RAW, RawInput } from '../src/core/systems/InputTypes';

/** Every .ts file under a directory. */
function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('core boundary', () => {
  it('src/core uses no Phaser, no browser APIs and nothing from the client', () => {
    const files = tsFiles(join(__dirname, '../src/core'));
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const code = readFileSync(f, 'utf-8');
      expect(code, f).not.toMatch(/from ['"]phaser['"]/);
      expect(code, f).not.toMatch(/from ['"][./]*\/game\//);
      expect(code, f).not.toMatch(/\b(window|document|localStorage|navigator)\.\w/);
      expect(code, f).not.toMatch(/Math\.random\(/);
    }
  });
});

describe('Rng', () => {
  it('repeats for the same seed and stays in [0, 1)', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const xs = Array.from({ length: 1000 }, () => a.next());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b.next()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(new Rng(43).next()).not.toBe(new Rng(42).next());
  });
});

/** A scripted human: changing directions, sprinting, and every button now and then. */
function scriptedInput(frame: number): RawInput {
  const phase = Math.floor(frame / 40);
  return {
    ...EMPTY_RAW,
    moveX: [1, 1, 0, -1, 1, 0][phase % 6],
    moveY: [0, 1, -1, 0, -1, 1][phase % 6],
    sprint: phase % 3 === 0,
    pass: frame % 90 < 8,
    shoot: frame % 170 > 150,
    lob: frame % 230 < 12,
    switchPlayer: frame % 300 === 0,
  };
}

function options(seed: number): MatchOptions {
  return {
    seed,
    minutes: 0.5,
    mustHaveWinner: true,
    formations: ['2-3', '3-2'],
    profiles: [TEAMMATE_PROFILE, AI_PROFILES.normal],
    humans: [{ team: 0, marker: 'p1', passAssist: 'auto', lobAssist: 'manual' }],
    speedScale: 1,
  };
}

/** Play a whole match headless (uneven frame times, like a real browser) and fingerprint it. */
function playMatch(seed: number): { fingerprint: string; frames: number; states: string[] } {
  const sim = new MatchSimulation(options(seed));
  const states: string[] = [];
  let frame = 0;
  while (sim.state !== 'fulltime' && frame < 40_000) {
    const ms = 14 + (frame % 5); // 14..18 ms
    sim.step(ms, [scriptedInput(frame)]);
    for (const e of sim.drainEvents()) if (e.type === 'state') states.push(e.to);
    frame++;
  }
  const w = sim.world;
  const fingerprint = JSON.stringify({
    score: sim.match.data.score,
    stats: w.stats,
    ball: [w.ball.x, w.ball.y, w.ball.vx, w.ball.vy],
    players: w.players.map((p) => [p.x, p.y, p.vx, p.vy, p.stamina]),
    rng: w.rng.seed,
  });
  return { fingerprint, frames: frame, states };
}

describe('MatchSimulation (headless)', () => {
  it('plays a whole match without a browser, through half time to full time', () => {
    const r = playMatch(7);
    expect(r.states).toContain('playing');
    expect(r.states).toContain('halftime');
    expect(r.states[r.states.length - 1]).toBe('fulltime');
  });

  it('is deterministic: the same seed and inputs give exactly the same match', () => {
    const a = playMatch(12345);
    const b = playMatch(12345);
    expect(b.frames).toBe(a.frames);
    expect(b.fingerprint).toBe(a.fingerprint);
  });

  it('a different seed gives a different match', () => {
    expect(playMatch(1).fingerprint).not.toBe(playMatch(2).fingerprint);
  });
});
