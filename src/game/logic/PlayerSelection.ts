// ============================================================
// PlayerSelection — Which field player the human should control
// when switching. Pure logic (no Phaser) so it is unit-testable.
//
// Defending: prefer a player who is goal-side of the ball carrier
// (between him and our goal) and can cut him off, instead of the
// nearest player who is usually chasing from behind.
// Loose ball: the player who reaches where the ball is going first.
// Holding a direction while switching picks the player that way instead.
// ============================================================

import { PITCH_CY, attackDir, distance, normalize, ownGoalX } from './PitchGeometry';

export interface SelectablePlayer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  role: string;
  teamIndex: number;
}

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Players must be within this cone (cos of the angle) of the held direction. */
const DIRECTION_MIN_COS = 0.35; // ~70°

/**
 * Directional switching: the field player lying in direction (dirX, dirY)
 * from `from` (e.g. holding Up picks a player above). Players straight along
 * the direction are preferred over closer ones off to the side.
 * Returns null if nobody is in that direction.
 */
export function pickPlayerInDirection<P extends SelectablePlayer>(
  candidates: readonly P[],
  from: { x: number; y: number },
  dirX: number,
  dirY: number,
  exclude: P | null = null,
): P | null {
  const dir = normalize(dirX, dirY);
  if (dir.len === 0) return null;

  let best: P | null = null;
  let bestScore = Infinity;
  for (const p of candidates) {
    if (p === exclude || p.role === 'goalkeeper') continue;
    const dx = p.x - from.x;
    const dy = p.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) continue;
    const cos = (dx * dir.x + dy * dir.y) / dist;
    if (cos < DIRECTION_MIN_COS) continue;
    const score = dist * (1 + 2 * (1 - cos));
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/** Extra "distance" for a defender who is behind the carrier (chasing). */
const BEHIND_PENALTY = 140;

export function pickPlayerForBall<P extends SelectablePlayer>(
  candidates: readonly P[],
  team: number,
  ball: BallState,
  opponentCarrier: SelectablePlayer | null,
  exclude: P | null = null,
): P | null {
  const field = candidates.filter((p) => p.role !== 'goalkeeper' && p !== exclude);
  if (field.length === 0) return null;

  let tx: number;
  let ty: number;
  if (opponentCarrier) {
    // Interception point: a bit in front of the carrier, toward our goal
    const c = opponentCarrier;
    const toGoal = normalize(ownGoalX(team) - c.x, PITCH_CY - c.y);
    const lead = Math.min(70, toGoal.len * 0.35);
    tx = c.x + c.vx * 0.3 + toGoal.x * lead;
    ty = c.y + c.vy * 0.3 + toGoal.y * lead;
  } else {
    tx = ball.x + ball.vx * 0.35;
    ty = ball.y + ball.vy * 0.35;
  }

  const dir = attackDir(team);
  let best: P | null = null;
  let bestScore = Infinity;
  for (const p of field) {
    let score = distance(p.x, p.y, tx, ty);
    if (opponentCarrier) {
      // >0 means the player is further up the pitch than the carrier = behind the play
      const behind = (p.x - opponentCarrier.x) * dir;
      if (behind > 10) score += BEHIND_PENALTY + behind * 0.5;
    }
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}
