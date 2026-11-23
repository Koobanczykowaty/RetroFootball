import { describe, expect, it } from 'vitest';
import { pickPlayerForBall, pickPlayerInDirection, SelectablePlayer } from '../src/game/logic/PlayerSelection';
import { PITCH_CX, PITCH_CY } from '../src/game/logic/PitchGeometry';

function player(x: number, y: number, role = 'defender', teamIndex = 0): SelectablePlayer {
  return { x, y, vx: 0, vy: 0, role, teamIndex };
}

describe('pickPlayerForBall', () => {
  // Team 0 defends the LEFT goal and attacks right.
  it('prefers a goal-side defender over the nearest player chasing from behind', () => {
    const carrier = player(PITCH_CX - 60, PITCH_CY, 'forward', 1);
    carrier.vx = -150; // running at our goal
    const chaser = player(carrier.x + 25, PITCH_CY + 5); // right behind him
    const goalSide = player(carrier.x - 140, PITCH_CY + 20); // between him and our goal
    const picked = pickPlayerForBall([chaser, goalSide], 0, carrier, carrier);
    expect(picked).toBe(goalSide);
  });

  it('picks a player right behind a carrier who is not running at goal', () => {
    // Carrier stands still (e.g. feinting): the chaser next to him can tackle,
    // a far goal-side defender would only lose time
    const carrier = player(PITCH_CX, PITCH_CY, 'forward', 1);
    const chaser = player(carrier.x + 25, PITCH_CY + 15);
    const deepDefender = player(PITCH_CX - 280, PITCH_CY + 10);
    expect(pickPlayerForBall([chaser, deepDefender], 0, carrier, carrier)).toBe(chaser);
  });

  it('still picks the nearest player when nobody is goal-side', () => {
    const carrier = player(PITCH_CX - 300, PITCH_CY, 'forward', 1);
    const near = player(carrier.x + 30, PITCH_CY);
    const far = player(carrier.x + 250, PITCH_CY);
    expect(pickPlayerForBall([far, near], 0, carrier, carrier)).toBe(near);
  });

  it('mirrors correctly for team 1 (defends the right goal)', () => {
    const carrier = player(PITCH_CX + 60, PITCH_CY, 'forward', 0);
    const chaser = player(carrier.x - 25, PITCH_CY, 'defender', 1);
    const goalSide = player(carrier.x + 140, PITCH_CY, 'defender', 1);
    expect(pickPlayerForBall([chaser, goalSide], 1, carrier, carrier)).toBe(goalSide);
  });

  it('for a loose ball, picks whoever is closest to where the ball is going', () => {
    const ball = { x: PITCH_CX, y: PITCH_CY, vx: 300, vy: 0 };
    const behindBall = player(PITCH_CX - 40, PITCH_CY);
    const aheadOfBall = player(PITCH_CX + 110, PITCH_CY);
    expect(pickPlayerForBall([behindBall, aheadOfBall], 0, ball, null)).toBe(aheadOfBall);
  });

  describe('pickPlayerInDirection', () => {
    const me = player(400, 270);
    const above = player(410, 150);
    const below = player(390, 400);
    const left = player(250, 280);
    const right = player(560, 260);
    const all = [me, above, below, left, right];

    it('picks the teammate in the held arrow direction', () => {
      expect(pickPlayerInDirection(all, me, 0, -1, me)).toBe(above);
      expect(pickPlayerInDirection(all, me, 0, 1, me)).toBe(below);
      expect(pickPlayerInDirection(all, me, -1, 0, me)).toBe(left);
      expect(pickPlayerInDirection(all, me, 1, 0, me)).toBe(right);
    });

    it('prefers a player straight ahead over a closer one off to the side', () => {
      const straightUp = player(400, 120); // 150 above
      const diagonal = player(470, 200); // ~99 away at 45°
      expect(pickPlayerInDirection([me, straightUp, diagonal], me, 0, -1, me)).toBe(straightUp);
    });

    it('handles diagonals', () => {
      const upRight = player(500, 170);
      expect(pickPlayerInDirection([me, upRight, left, below], me, 1, -1, me)).toBe(upRight);
    });

    it('returns null when nobody is in that direction, and ignores the goalkeeper', () => {
      const gkAbove = player(400, 100, 'goalkeeper');
      expect(pickPlayerInDirection([me, gkAbove, below], me, 0, -1, me)).toBeNull();
      expect(pickPlayerInDirection([me], me, 1, 0, me)).toBeNull();
    });
  });

  it('never selects the goalkeeper and respects the exclude option', () => {
    const ball = { x: PITCH_CX, y: PITCH_CY, vx: 0, vy: 0 };
    const gk = player(PITCH_CX, PITCH_CY, 'goalkeeper');
    const a = player(PITCH_CX + 10, PITCH_CY);
    const b = player(PITCH_CX + 200, PITCH_CY);
    expect(pickPlayerForBall([gk, a, b], 0, ball, null)).toBe(a);
    expect(pickPlayerForBall([gk, a, b], 0, ball, null, a)).toBe(b);
  });
});
