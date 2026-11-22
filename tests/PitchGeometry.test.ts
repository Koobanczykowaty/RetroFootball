import { afterEach, describe, expect, it } from 'vitest';
import { FORMATION, PITCH } from '../src/game/config/GameplayConfig';
import {
  GOAL_BOTTOM, GOAL_TOP, PITCH_CX, PITCH_CY, PITCH_LEFT, PITCH_RIGHT,
  attackDir, distToSegment, kickoffPositions, laneClearance, opponentGoalX, ownGoalX, predictLineCrossing,
  setSidesSwapped, teamDefendingSide, predictBallCrossing, PITCH_TOP,
} from '../src/game/logic/PitchGeometry';

describe('PitchGeometry', () => {
  it('team 0 attacks right, team 1 attacks left', () => {
    expect(attackDir(0)).toBe(1);
    expect(attackDir(1)).toBe(-1);
    expect(opponentGoalX(0)).toBe(PITCH_RIGHT);
    expect(ownGoalX(0)).toBe(PITCH_LEFT);
    expect(opponentGoalX(1)).toBe(PITCH_LEFT);
  });

  it('goal mouth is centred on the pitch', () => {
    expect(GOAL_BOTTOM - GOAL_TOP).toBe(PITCH.goalWidth);
    expect((GOAL_TOP + GOAL_BOTTOM) / 2).toBe(PITCH_CY);
  });

  it('measures distance to a segment', () => {
    expect(distToSegment(5, 5, 0, 0, 10, 0)).toBe(5);
    expect(distToSegment(-3, 4, 0, 0, 10, 0)).toBe(5); // beyond the end point
  });

  it('detects a blocked passing lane and ignores players behind the passer', () => {
    const blocker = [{ x: 50, y: 3 }];
    expect(laneClearance(0, 0, 100, 0, blocker)).toBe(3);
    const behind = [{ x: -20, y: 0 }];
    expect(laneClearance(0, 0, 100, 0, behind)).toBe(Infinity);
  });

  it('predicts where a moving ball crosses a goal line', () => {
    expect(predictLineCrossing(100, 270, -200, 50, 80)).toBeCloseTo(275);
    expect(predictLineCrossing(100, 270, 200, 0, 80)).toBeNull(); // moving away
  });

  describe('predictBallCrossing (keeper prediction)', () => {
    it('finds where a fast straight shot crosses the goal line', () => {
      const y = predictBallCrossing(PITCH_LEFT + 200, PITCH_CY, -500, 0, PITCH_LEFT);
      expect(y).not.toBeNull();
      expect(y!).toBeCloseTo(PITCH_CY, 0);
    });

    it('returns null when friction stops the ball before the line', () => {
      expect(predictBallCrossing(PITCH_CX, PITCH_CY, -60, 0, PITCH_LEFT)).toBeNull();
    });

    it('returns null for a ball moving away from the line', () => {
      expect(predictBallCrossing(PITCH_CX, PITCH_CY, 400, 0, PITCH_LEFT)).toBeNull();
    });

    it('follows a bounce off the touchline (the naive straight line would miss)', () => {
      // Aimed up at the top touchline from near the left goal: it bounces back down
      const x0 = PITCH_LEFT + 160;
      const y0 = PITCH_TOP + 40;
      const vx = -400;
      const vy = -260;
      const naive = predictLineCrossing(x0, y0, vx, vy, PITCH_LEFT)!;
      const real = predictBallCrossing(x0, y0, vx, vy, PITCH_LEFT)!;
      expect(naive).toBeLessThan(PITCH_TOP); // straight line ends outside the pitch
      expect(real).toBeGreaterThan(PITCH_TOP); // the real ball bounced back in
    });
  });

  describe('change of ends at half time', () => {
    afterEach(() => setSidesSwapped(false));

    it('reverses directions and goals in the second half', () => {
      setSidesSwapped(true);
      expect(attackDir(0)).toBe(-1);
      expect(attackDir(1)).toBe(1);
      expect(opponentGoalX(0)).toBe(PITCH_LEFT);
      expect(ownGoalX(0)).toBe(PITCH_RIGHT);
      expect(ownGoalX(1)).toBe(PITCH_LEFT);
    });

    it('credits a goal to the right team in each half', () => {
      // First half: team 0 defends the left goal
      expect(teamDefendingSide(0)).toBe(0);
      expect(teamDefendingSide(1)).toBe(1);
      setSidesSwapped(true);
      // Second half: team 1 defends the left goal
      expect(teamDefendingSide(0)).toBe(1);
      expect(teamDefendingSide(1)).toBe(0);
    });

    it('lines teams up in their new halves', () => {
      setSidesSwapped(true);
      for (const p of kickoffPositions(0, true)) expect(p.x).toBeGreaterThanOrEqual(PITCH_CX);
      for (const p of kickoffPositions(1, false)) expect(p.x).toBeLessThanOrEqual(PITCH_CX);
    });
  });

  it('places both teams in their own half with the kicker at the centre', () => {
    for (const team of [0, 1]) {
      const kicking = kickoffPositions(team, true);
      const defending = kickoffPositions(team, false);
      expect(kicking).toHaveLength(FORMATION.length);
      for (const p of [...kicking, ...defending]) {
        expect((p.x - PITCH_CX) * attackDir(team)).toBeLessThanOrEqual(0);
      }
      const fwd = FORMATION.findIndex((f) => f.role === 'forward');
      expect(Math.abs(kicking[fwd].x - PITCH_CX)).toBeLessThan(20);
      // The defending forward waits outside the centre circle
      expect(Math.abs(defending[fwd].x - PITCH_CX)).toBeGreaterThan(PITCH.centerCircleRadius);
    }
  });
});
