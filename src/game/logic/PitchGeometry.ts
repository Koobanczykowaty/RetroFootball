// ============================================================
// PitchGeometry — Pure helpers for pitch coordinates and vectors.
// No Phaser dependency so it can be unit-tested in Node.
// ============================================================

import { BALL, PITCH, FormationPosition } from '../config/GameplayConfig';

export const PITCH_LEFT = PITCH.x;
export const PITCH_RIGHT = PITCH.x + PITCH.width;
export const PITCH_TOP = PITCH.y;
export const PITCH_BOTTOM = PITCH.y + PITCH.height;
export const PITCH_CX = PITCH.x + PITCH.width / 2;
export const PITCH_CY = PITCH.y + PITCH.height / 2;
export const GOAL_TOP = PITCH_CY - PITCH.goalWidth / 2;
export const GOAL_BOTTOM = PITCH_CY + PITCH.goalWidth / 2;

/**
 * Teams change ends at half time. First half: team 0 attacks right, team 1
 * left. Second half: reversed. All direction helpers below respect this, so
 * gameplay code must use them instead of checking team indices.
 */
let sidesSwapped = false;

export function setSidesSwapped(swapped: boolean): void {
  sidesSwapped = swapped;
}

export function areSidesSwapped(): boolean {
  return sidesSwapped;
}

/** +1 if the team attacks to the right, -1 if to the left (depends on the half). */
export function attackDir(team: number): number {
  const dir = team === 0 ? 1 : -1;
  return sidesSwapped ? -dir : dir;
}

/** X of the goal line this team attacks. */
export function opponentGoalX(team: number): number {
  return attackDir(team) > 0 ? PITCH_RIGHT : PITCH_LEFT;
}

/** X of the goal line this team defends. */
export function ownGoalX(team: number): number {
  return attackDir(team) > 0 ? PITCH_LEFT : PITCH_RIGHT;
}

/** Team defending the goal on `side` (0 = left goal, 1 = right goal). */
export function teamDefendingSide(side: number): number {
  const leftDefender = attackDir(0) > 0 ? 0 : 1;
  return side === 0 ? leftDefender : 1 - leftDefender;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function normalize(x: number, y: number): { x: number; y: number; len: number } {
  const len = Math.hypot(x, y);
  if (len < 1e-6) return { x: 0, y: 0, len: 0 };
  return { x: x / len, y: y / len, len };
}

/** Shortest distance from point P to segment AB. */
export function distToSegment(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return distance(px, py, ax, ay);
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / lenSq, 0, 1);
  return distance(px, py, ax + abx * t, ay + aby * t);
}

/**
 * Smallest distance from any of `points` to the segment A→B, ignoring points
 * behind A. Used to judge whether a passing lane is blocked.
 */
export function laneClearance(
  ax: number, ay: number, bx: number, by: number,
  points: ReadonlyArray<{ x: number; y: number }>,
): number {
  let min = Infinity;
  const dx = bx - ax;
  const dy = by - ay;
  for (const p of points) {
    if ((p.x - ax) * dx + (p.y - ay) * dy < 0) continue; // behind the passer
    min = Math.min(min, distToSegment(p.x, p.y, ax, ay, bx, by));
  }
  return min;
}

/**
 * If a ball at (bx,by) moving with (vx,vy) is heading to the vertical line x=lineX,
 * returns the y where it crosses it; otherwise null. Ignores friction.
 */
export function predictLineCrossing(
  bx: number, by: number, vx: number, vy: number, lineX: number,
): number | null {
  if (Math.abs(vx) < 1e-6) return null;
  const t = (lineX - bx) / vx;
  if (t < 0) return null;
  return by + vy * t;
}

/**
 * Where a free ball will cross the vertical line x=lineX, simulating the same
 * rules as Ball.update: ground friction and bounces off the top/bottom
 * touchlines. Returns null if the ball stops (or takes longer than maxTime)
 * before reaching the line, or is moving away from it.
 */
export function predictBallCrossing(
  bx: number, by: number, vx: number, vy: number, lineX: number, maxTime = 3,
): number | null {
  if ((lineX - bx) * vx <= 0) return null;
  const step = 1 / 60;
  const f = BALL.friction;
  const top = PITCH_TOP + BALL.radius;
  const bottom = PITCH_BOTTOM - BALL.radius;
  let x = bx;
  let y = by;
  for (let t = 0; t < maxTime; t += step) {
    const nx = x + vx * step;
    const ny = y + vy * step;
    if ((nx - lineX) * (x - lineX) <= 0) {
      // Crossed this step: interpolate
      const k = (lineX - x) / (nx - x);
      return y + (ny - y) * k;
    }
    x = nx;
    y = ny;
    if (y < top) { y = top; vy = Math.abs(vy) * BALL.bounceRestitution; }
    if (y > bottom) { y = bottom; vy = -Math.abs(vy) * BALL.bounceRestitution; }
    vx *= f;
    vy *= f;
    if (Math.hypot(vx, vy) < BALL.minSpeed) return null;
  }
  return null;
}

/** Absolute formation position for a team (team 0 on the left). */
export function formationPosition(team: number, pos: FormationPosition): { x: number; y: number } {
  const halfW = PITCH.width / 2;
  const halfH = PITCH.height / 2;
  return {
    x: PITCH_CX - attackDir(team) * pos.x * halfW,
    y: PITCH_CY + pos.y * halfH * 0.7,
  };
}

/** Index of the player who takes the kickoff: the most central forward. */
export function kickoffTakerIndex(formation: readonly FormationPosition[]): number {
  let best = -1;
  for (let i = 0; i < formation.length; i++) {
    const pos = formation[i];
    if (pos.role !== 'forward') continue;
    if (best < 0 || Math.abs(pos.y) < Math.abs(formation[best].y)) best = i;
  }
  return best >= 0 ? best : formation.length - 1;
}

/** Starting positions for all of a team's players at kickoff. */
export function kickoffPositions(
  team: number, isKickingOff: boolean, formation: readonly FormationPosition[],
): Array<{ x: number; y: number }> {
  const taker = kickoffTakerIndex(formation);
  const dir = attackDir(team);
  const r = PITCH.centerCircleRadius;
  return formation.map((pos, i) => {
    const p = formationPosition(team, pos);
    if (isKickingOff && i === taker) {
      // The taker stands on the ball at the centre spot
      p.x = PITCH_CX - dir * 14;
      p.y = PITCH_CY;
    } else if (!isKickingOff && pos.role === 'forward' && Math.abs(p.y - PITCH_CY) < r + 10) {
      // Defending team waits outside the centre circle
      p.x = PITCH_CX - dir * (r + 14);
    }
    return p;
  });
}
