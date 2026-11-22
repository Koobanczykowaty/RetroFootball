// ============================================================
// SimReport — Collects results of AI-vs-AI simulation matches
// (URL: ?sim=1). Used for automated smoke testing in a headless
// browser: results are written to <pre id="sim-result"> as JSON.
// ============================================================

import type { MatchStats } from '../logic/MatchWorld';
import type { MatchState } from '../systems/MatchSystem';

export interface SimMatchResult {
  index: number;
  score: [number, number];
  goals: Array<{ team: number; minute: number }>;
  states: MatchState[];
  events: Record<string, number>;
  stats: MatchStats;
  realSeconds: number;
}

interface SimGlobal {
  matches: SimMatchResult[];
  errors: string[];
  expected: number;
  done: boolean;
  /** UI flow test: number of screen switches performed. */
  uiSteps?: number;
}

declare global {
  interface Window {
    __RF_SIM__?: SimGlobal;
  }
}

export function initSimGlobal(expected: number): void {
  const g: SimGlobal = { matches: [], errors: [], expected, done: false };
  window.__RF_SIM__ = g;
  const push = (msg: string) => {
    g.errors.push(msg);
    writeSimResult();
  };
  window.addEventListener('error', (e) => push(`${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => push(`unhandled rejection: ${String(e.reason)}`));
  writeSimResult();
}

export function writeSimResult(): void {
  const g = window.__RF_SIM__;
  if (!g) return;
  let el = document.getElementById('sim-result');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'sim-result';
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  el.textContent = JSON.stringify(g);
}

export class SimReport {
  readonly goals: Array<{ team: number; minute: number }> = [];
  readonly states: MatchState[] = [];
  readonly events: Record<string, number> = {};
  private readonly startedAt = performance.now();

  constructor(readonly index: number) {}

  state(s: MatchState): void {
    this.states.push(s);
  }

  event(name: string): void {
    this.add(name, 1);
  }

  /** Accumulate a value (e.g. a distance) under `name`. */
  add(name: string, value: number): void {
    this.events[name] = (this.events[name] ?? 0) + value;
  }

  goal(team: number, minute: number): void {
    this.goals.push({ team, minute: Math.round(minute) });
  }

  get realSeconds(): number {
    return (performance.now() - this.startedAt) / 1000;
  }
}

/** Stores the finished match. Returns true if the simulation should continue. */
export function recordSimMatch(r: SimReport, score: [number, number], stats: MatchStats): boolean {
  const g = window.__RF_SIM__;
  if (!g) return false;
  g.matches.push({
    index: r.index,
    score: [score[0], score[1]],
    goals: r.goals,
    states: r.states,
    events: r.events,
    stats: JSON.parse(JSON.stringify(stats)) as MatchStats,
    realSeconds: Math.round(r.realSeconds * 10) / 10,
  });
  g.done = g.matches.length >= g.expected;
  writeSimResult();
  return !g.done;
}
