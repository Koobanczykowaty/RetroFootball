import { describe, expect, it } from 'vitest';
import { MATCH } from '../src/game/config/GameplayConfig';
import { MatchSystem } from '../src/game/systems/MatchSystem';

/** Advance the match by `ms` in 16 ms steps. */
function run(m: MatchSystem, ms: number): void {
  for (let t = 0; t < ms; t += 16) m.update(16);
}

describe('MatchSystem', () => {
  it('starts in kickoff and begins play after the kickoff delay', () => {
    const m = new MatchSystem(2, 0);
    m.startKickoff();
    expect(m.state).toBe('kickoff');
    run(m, MATCH.kickoffDelay + 50);
    expect(m.state).toBe('playing');
  });

  it('maps the real match length onto a 90 minute clock', () => {
    const m = new MatchSystem(2, 0);
    m.startKickoff();
    run(m, MATCH.kickoffDelay + 50);
    run(m, 30_000); // a quarter of a 2-minute match
    expect(m.data.time).toBeGreaterThan(21);
    expect(m.data.time).toBeLessThan(24);
  });

  it('goes to half time at 45 minutes and lets the other team kick off', () => {
    const m = new MatchSystem(1, 0);
    m.startKickoff();
    run(m, MATCH.kickoffDelay + 50);
    run(m, 31_000);
    expect(m.state).toBe('halftime');
    expect(m.data.half).toBe(2);
    expect(m.data.time).toBe(45);
    run(m, MATCH.halftimeDelay + 50);
    expect(m.state).toBe('kickoff');
    expect(m.data.kickoffTeam).toBe(1);
  });

  it('ends at full time and stops the clock', () => {
    const m = new MatchSystem(1, 1);
    m.startKickoff();
    run(m, 200_000);
    expect(m.state).toBe('fulltime');
    expect(m.data.time).toBe(MATCH.fullTimeMinutes);
    run(m, 5_000);
    expect(m.data.time).toBe(MATCH.fullTimeMinutes);
  });

  it('scores a goal, celebrates, then the conceding team kicks off', () => {
    const m = new MatchSystem(2, 0);
    m.startKickoff();
    run(m, MATCH.kickoffDelay + 50);
    m.scoreGoal(0);
    expect(m.data.score).toEqual([1, 0]);
    expect(m.state).toBe('goal_scored');
    expect(m.data.kickoffTeam).toBe(1);
    run(m, MATCH.goalCelebrationDuration + 50);
    expect(m.state).toBe('kickoff');
  });

  it('ignores goals outside open play (e.g. during the celebration)', () => {
    const m = new MatchSystem(2, 0);
    m.startKickoff();
    run(m, MATCH.kickoffDelay + 50);
    m.scoreGoal(1);
    m.scoreGoal(1);
    expect(m.data.score).toEqual([0, 1]);
  });

  it('freezes everything while paused and resumes the previous state', () => {
    const m = new MatchSystem(2, 0);
    m.startKickoff();
    run(m, MATCH.kickoffDelay + 50);
    run(m, 5_000);
    const t = m.data.time;
    m.pause();
    run(m, 10_000);
    expect(m.state).toBe('paused');
    expect(m.data.time).toBe(t);
    m.resume();
    expect(m.state).toBe('playing');
  });

  it('cannot pause after full time', () => {
    const m = new MatchSystem(1, 0);
    m.startKickoff();
    run(m, 200_000);
    m.pause();
    expect(m.state).toBe('fulltime');
  });

  it('reports the winner and formats the clock', () => {
    const m = new MatchSystem(2, 0);
    expect(m.getWinner()).toBe(-1);
    m.data.score = [2, 3];
    expect(m.getWinner()).toBe(1);
    m.data.time = 45.5;
    expect(m.getFormattedTime()).toBe('45:30');
  });
});

describe('MatchSystem extra time (cup)', () => {
  /** Play a 1-minute match until it leaves 'playing' at full time or the given state. */
  function toFullTime(m: MatchSystem): void {
    m.startKickoff();
    for (let k = 0; k < 20000 && !['fulltime', 'extratime'].includes(m.state); k++) m.update(16);
  }

  it('a league match ends level at full time', () => {
    const m = new MatchSystem(1, 0, false);
    toFullTime(m);
    expect(m.state).toBe('fulltime');
    expect(m.data.extraTime).toBe(false);
  });

  it('a cup match level at full time goes to extra time, then a golden goal ends it', () => {
    const m = new MatchSystem(1, 0, true);
    toFullTime(m);
    expect(m.state).toBe('extratime');
    expect(m.data.extraTime).toBe(true);
    run(m, MATCH.halftimeDelay + MATCH.kickoffDelay + 50);
    expect(m.state).toBe('playing');
    // Play through extra time still level: the golden goal starts, the clock runs on
    const etMs = (MATCH.extraTimeMinutes / MATCH.fullTimeMinutes) * 60_000;
    run(m, etMs + 500);
    expect(m.state).toBe('playing');
    expect(m.data.goldenGoal).toBe(true);
    expect(m.data.time).toBeGreaterThan(MATCH.fullTimeMinutes + MATCH.extraTimeMinutes);
    m.scoreGoal(1);
    run(m, MATCH.goalCelebrationDuration + 50);
    expect(m.state).toBe('fulltime');
    expect(m.getWinner()).toBe(1);
  });

  it('a goal in extra time is not golden: the match ends when extra time is over', () => {
    const m = new MatchSystem(1, 0, true);
    toFullTime(m);
    run(m, MATCH.halftimeDelay + MATCH.kickoffDelay + 50);
    m.scoreGoal(0);
    run(m, MATCH.goalCelebrationDuration + 50);
    expect(m.state).toBe('kickoff');
    for (let k = 0; k < 20000 && m.state !== 'fulltime'; k++) m.update(16);
    expect(m.state).toBe('fulltime');
    expect(m.data.goldenGoal).toBe(false);
    expect(m.data.time).toBe(MATCH.fullTimeMinutes + MATCH.extraTimeMinutes);
  });
});
