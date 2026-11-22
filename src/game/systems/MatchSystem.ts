// ============================================================
// MatchSystem — Match state machine, score and clock.
// Pure logic (no Phaser) so it can be unit-tested.
// ============================================================

import { MATCH } from '../config/GameplayConfig';

export type MatchState =
  | 'kickoff'
  | 'playing'
  | 'goal_scored'
  | 'halftime'
  | 'fulltime'
  | 'paused';

export interface MatchData {
  score: [number, number];
  /** Game minutes elapsed, 0..MATCH.fullTimeMinutes */
  time: number;
  half: 1 | 2;
  state: MatchState;
  lastScorer: number;
  /** Team that kicks off next */
  kickoffTeam: number;
}

export class MatchSystem {
  public data: MatchData;
  private stateTimer = 0;
  private previousState: MatchState = 'kickoff';
  /** Game minutes per real second */
  private readonly timeScale: number;

  constructor(
    matchMinutes: number = MATCH.defaultDuration,
    public readonly firstKickoffTeam = 0,
  ) {
    this.timeScale = MATCH.fullTimeMinutes / (Math.max(0.1, matchMinutes) * 60);
    this.data = {
      score: [0, 0],
      time: 0,
      half: 1,
      state: 'kickoff',
      lastScorer: -1,
      kickoffTeam: firstKickoffTeam,
    };
  }

  get state(): MatchState {
    return this.data.state;
  }

  update(deltaMs: number): MatchState {
    const d = this.data;
    if (d.state === 'paused' || d.state === 'fulltime') return d.state;

    this.stateTimer -= deltaMs;
    const halfTime = MATCH.fullTimeMinutes / 2;

    switch (d.state) {
      case 'kickoff':
        if (this.stateTimer <= 0) d.state = 'playing';
        break;

      case 'playing':
        d.time += (deltaMs / 1000) * this.timeScale;
        if (d.half === 1 && d.time >= halfTime) {
          d.time = halfTime;
          d.half = 2;
          d.state = 'halftime';
          this.stateTimer = MATCH.halftimeDelay;
        } else if (d.time >= MATCH.fullTimeMinutes) {
          d.time = MATCH.fullTimeMinutes;
          d.state = 'fulltime';
        }
        break;

      case 'goal_scored':
        if (this.stateTimer <= 0) {
          d.state = 'kickoff';
          this.stateTimer = MATCH.kickoffDelay;
        }
        break;

      case 'halftime':
        if (this.stateTimer <= 0) {
          d.kickoffTeam = 1 - this.firstKickoffTeam;
          d.state = 'kickoff';
          this.stateTimer = MATCH.kickoffDelay;
        }
        break;
    }

    return d.state;
  }

  scoreGoal(teamIndex: number): void {
    if (this.data.state !== 'playing') return;
    this.data.score[teamIndex]++;
    this.data.lastScorer = teamIndex;
    this.data.state = 'goal_scored';
    this.stateTimer = MATCH.goalCelebrationDuration;
    // The conceding team kicks off
    this.data.kickoffTeam = 1 - teamIndex;
  }

  startKickoff(): void {
    this.data.state = 'kickoff';
    this.stateTimer = MATCH.kickoffDelay;
  }

  pause(): void {
    if (this.data.state !== 'fulltime' && this.data.state !== 'paused') {
      this.previousState = this.data.state;
      this.data.state = 'paused';
    }
  }

  resume(): void {
    if (this.data.state === 'paused') {
      this.data.state = this.previousState;
    }
  }

  isPaused(): boolean {
    return this.data.state === 'paused';
  }

  getFormattedTime(): string {
    const minutes = Math.floor(this.data.time);
    const seconds = Math.floor((this.data.time % 1) * 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  /** -1 = draw, otherwise the winning team index. */
  getWinner(): number {
    const [s0, s1] = this.data.score;
    if (s0 > s1) return 0;
    if (s1 > s0) return 1;
    return -1;
  }
}
