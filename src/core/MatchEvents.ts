// ============================================================
// MatchEvents — What the core simulation tells the outside world.
// The core never plays sounds or touches the screen: it queues these
// events (MatchWorld.events) and the client turns them into sounds,
// banners and camera effects. A network host can forward them too.
// ============================================================

import type { MatchState } from './systems/MatchSystem';

/** Sound-worthy moments in play. */
export type SoundCue = 'pass' | 'kick' | 'shoot' | 'powerShot' | 'header' | 'tackle' | 'bounce' | 'save';

export type MatchEvent =
  | { type: 'sound'; cue: SoundCue }
  /** A match-state transition (pause and resume are not reported). */
  | { type: 'state'; from: MatchState; to: MatchState }
  /** A goal: the slow motion starts (the celebration follows). */
  | { type: 'goal'; team: number; ownGoal: boolean; x: number; y: number }
  /** The slow motion is over: banner, confetti, celebration. instant = cut short by a pause. */
  | { type: 'celebrate'; team: number; ownGoal: boolean; x: number; y: number; instant: boolean }
  /** Still level after extra time: the next goal wins. */
  | { type: 'goldenGoal' };

/**
 * Optional test metrics (the headless simulation test). The core reports
 * counters through this; the client's SimReport implements it.
 */
export interface Telemetry {
  event(name: string): void;
  add(name: string, value: number): void;
  /** Keep the largest value seen under `name`. */
  max(name: string, value: number): void;
  state(s: MatchState): void;
  goal(team: number, minute: number): void;
}
