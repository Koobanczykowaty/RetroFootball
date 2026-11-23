// ============================================================
// ActionSystem — Ball actions (pass, shoot, lob, tackle) shared by
// the human player and the AI so both play by the same rules.
// ============================================================

import { BALL, PITCH, ROLE_TRAITS } from '../config/GameplayConfig';
import type { Player } from '../entities/Player';
import type { MatchWorld } from '../logic/MatchWorld';
import {
  PITCH_CY, attackDir, clamp, distance, laneClearance, normalize, opponentGoalX,
} from '../logic/PitchGeometry';
import { soundManager } from './SoundManager';

/** Minimum gap between a passing lane and an opponent to count as open. */
const LANE_OPEN = 18;

/** Charged-pass speed multiplier: power 0..1 → (1-range)..(1+range); undefined = 1. */
function passPowerScale(power?: number): number {
  if (power === undefined) return 1;
  const r = BALL.passPowerRange;
  return 1 - r + 2 * r * clamp(power, 0, 1);
}

export class ActionSystem {
  constructor(private readonly world: MatchWorld) {}

  // ------------------------------------------------------------------ pass

  /**
   * Short pass in the given direction (falls back to facing). Picks the best
   * teammate inside a cone around that direction; passes into space if none.
   * Returns the intended receiver, if any.
   * @param power 0..1 from charging (human): scales the speed, 0.5 = normal.
   *   Omitted (AI) = normal speed.
   */
  pass(p: Player, dirX: number, dirY: number, power?: number): Player | null {
    if (!this.canAct(p)) return null;
    const target = this.passTarget(p, dirX, dirY);
    if (target) {
      this.passTo(p, target, power);
      return target;
    }
    const dir = this.resolveDir(p, dirX, dirY);
    const speed = (BALL.passSpeedMin + 40) * passPowerScale(power);
    this.release(p);
    this.world.ball.kick(dir.x * speed, dir.y * speed);
    this.world.stats.passes[p.teamIndex]++;
    soundManager.pass();
    return null;
  }

  /**
   * Who pass() would pick right now (no side effects). Used for the on-pitch
   * hint, so the hint always matches the real pass. Null = pass into space.
   */
  passTarget(p: Player, dirX: number, dirY: number): Player | null {
    const dir = this.resolveDir(p, dirX, dirY);
    return this.findTargetInCone(p, dir.x, dir.y, 25, 420, 0.35, false);
  }

  /** Ground pass to a specific teammate, leading a moving receiver. */
  passTo(p: Player, target: Player, power?: number): void {
    if (!this.canAct(p)) return;
    const dist = p.distanceTo(target.x, target.y);
    const speed = clamp(BALL.passBaseSpeed + dist * BALL.passDistanceFactor, BALL.passSpeedMin, BALL.passSpeedMax)
      * passPowerScale(power);
    const travel = dist / (speed * 0.8);
    const aimX = target.x + target.vx * travel * 0.5;
    const aimY = target.y + target.vy * travel * 0.5;
    const d = normalize(aimX - p.x, aimY - p.y);

    this.release(p);
    this.world.ball.kick(d.x * speed, d.y * speed);
    this.world.ball.passTargetId = target.id;
    this.world.stats.passes[p.teamIndex]++;
    soundManager.pass();
  }

  // ------------------------------------------------------------------- lob

  /**
   * AI / keeper auto-kick lob: lofted long pass over defenders toward the most
   * advanced teammate in that direction (auto-targeted).
   */
  lob(p: Player, dirX: number, dirY: number): Player | null {
    if (!this.canAct(p)) return null;
    const dir = this.resolveDir(p, dirX, dirY);
    const target = this.findTargetInCone(p, dir.x, dir.y, 80, 480, 0.2, true);
    if (target) {
      this.lobTo(p, target);
      return target;
    }
    this.release(p);
    const lift = BALL.lobLift;
    this.world.ball.kick(dir.x * 260, dir.y * 260, { lift });
    this.world.stats.passes[p.teamIndex]++;
    soundManager.kick();
    return null;
  }

  /**
   * Human lob: no auto-target. Flies in the input (or facing) direction; power
   * 0..1 sets where it first lands (BALL.lobMinDistance..lobMaxDistance). The
   * teammate nearest the landing spot (within lobReceiveRadius) becomes the
   * receiver; returns him, or null if nobody is near.
   */
  lobToSpot(p: Player, dirX: number, dirY: number, power: number): Player | null {
    if (!this.canAct(p)) return null;
    const dir = this.resolveDir(p, dirX, dirY);
    const dist = BALL.lobMinDistance + (BALL.lobMaxDistance - BALL.lobMinDistance) * clamp(power, 0, 1);
    const landX = p.x + dir.x * dist;
    const landY = p.y + dir.y * dist;

    let receiver: Player | null = null;
    let best = BALL.lobReceiveRadius;
    for (const t of this.world.teams[p.teamIndex]) {
      if (t === p || t.role === 'goalkeeper') continue;
      const d = t.distanceTo(landX, landY);
      if (d < best) {
        best = d;
        receiver = t;
      }
    }

    const lift = BALL.lobLift;
    const airTime = (2 * lift) / BALL.gravity;
    // Air friction slows the ball by ~11% over the flight; compensate
    const speed = (dist / airTime) * 1.12;
    this.release(p);
    this.world.ball.kick(dir.x * speed, dir.y * speed, { lift });
    this.world.ball.passTargetId = receiver ? receiver.id : null;
    this.world.stats.passes[p.teamIndex]++;
    soundManager.kick();
    return receiver;
  }

  lobTo(p: Player, target: Player): void {
    if (!this.canAct(p)) return;
    const lift = BALL.lobLift;
    const airTime = (2 * lift) / BALL.gravity;
    const aimX = target.x + target.vx * airTime * 0.6;
    const aimY = target.y + target.vy * airTime * 0.6;
    const d = normalize(aimX - p.x, aimY - p.y);
    const speed = clamp((d.len / airTime) * 1.1, BALL.lobSpeedMin, BALL.lobSpeedMax);

    this.release(p);
    this.world.ball.kick(d.x * speed, d.y * speed, { lift });
    this.world.ball.passTargetId = target.id;
    this.world.stats.passes[p.teamIndex]++;
    soundManager.kick();
  }

  // ------------------------------------------------------------------ shoot

  /**
   * Shot at the opponent's goal.
   * @param power 0..1 (charge)
   * @param aimY -1 (top corner) .. 1 (bottom corner)
   * @param dirX/dirY current movement input; if it points back toward your own
   *   goal the ball is struck along it instead (clearances, own goals possible).
   * @param accuracy 0..1, scales random error
   */
  shoot(p: Player, power: number, aimY: number, dirX = 0, dirY = 0, accuracy = 0.8): void {
    if (!this.canAct(p)) return;
    power = clamp(power, 0, 1);
    const goalX = opponentGoalX(p.teamIndex);
    const input = normalize(dirX, dirY);

    let angle: number;
    // Pulling back toward your own goal = clearance along the input direction.
    // Pure up/down input only picks the corner (handled by aimY below).
    if (input.len > 0 && input.x * attackDir(p.teamIndex) < -0.3) {
      angle = Math.atan2(input.y, input.x);
    } else {
      const halfMouth = PITCH.goalWidth / 2 - 8;
      const dist = distance(p.x, p.y, goalX, PITCH_CY);
      accuracy = Math.min(1, accuracy + ROLE_TRAITS[p.role].shotAccuracy); // forwards finish better
      const error = (1 - accuracy * 0.85) * halfMouth * (0.6 + power * 0.8) * (0.6 + dist / 400);
      const ty = PITCH_CY + clamp(aimY, -1, 1) * halfMouth * 0.85 + (Math.random() - 0.5) * 2 * error;
      angle = Math.atan2(ty - p.y, goalX - p.x);
    }

    const speed = (BALL.shootSpeedMin + (BALL.shootSpeedMax - BALL.shootSpeedMin) * power) * ROLE_TRAITS[p.role].shotSpeed;
    this.release(p);
    const ball = this.world.ball;
    ball.kick(Math.cos(angle) * speed, Math.sin(angle) * speed, {
      power: power >= BALL.powerShotThreshold,
    });
    ball.isShot = true;
    this.world.stats.shots[p.teamIndex]++;
    if (power >= BALL.powerShotThreshold) soundManager.powerShot();
    else soundManager.shoot();
  }

  // ----------------------------------------------------------------- tackle

  /** Start a tackle dash toward the ball. Resolved by CollisionSystem. */
  tackle(p: Player): boolean {
    if (!p.canTackle()) return false;
    const ball = this.world.ball;
    const toBall = normalize(ball.x - p.x, ball.y - p.y);
    if (toBall.len < 70 && toBall.len > 0) p.startTackle(toBall.x, toBall.y);
    else p.startTackle(p.facingX, p.facingY);
    soundManager.tackle();
    return true;
  }

  // ---------------------------------------------------------------- helpers

  /** Best pass target in a cone; prefers forward players when preferForward is set. */
  findTargetInCone(
    p: Player, dirX: number, dirY: number,
    minDist: number, maxDist: number, minCos: number, preferForward: boolean,
  ): Player | null {
    const opponents = this.world.teams[1 - p.teamIndex];
    const fwd = attackDir(p.teamIndex);
    let best: Player | null = null;
    let bestScore = -Infinity;

    for (const t of this.world.teams[p.teamIndex]) {
      if (t === p || t.role === 'goalkeeper') continue;
      const dx = t.x - p.x;
      const dy = t.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < minDist || dist > maxDist) continue;
      const cos = (dx * dirX + dy * dirY) / dist;
      if (cos < minCos) continue;

      const open = laneClearance(p.x, p.y, t.x, t.y, opponents) >= LANE_OPEN;
      let score = cos * 140 - dist * 0.22 - (open ? 0 : 50);
      if (preferForward) score += dx * fwd * 0.4 + dist * 0.2 + (open ? 0 : 40);
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  private canAct(p: Player): boolean {
    return p.hasBall && p.canKick() && this.world.ball.ownerId === p.id;
  }

  private resolveDir(p: Player, dirX: number, dirY: number): { x: number; y: number } {
    const d = normalize(dirX, dirY);
    if (d.len > 0) return d;
    const f = normalize(p.facingX, p.facingY);
    if (f.len > 0) return f;
    return { x: attackDir(p.teamIndex), y: 0 };
  }

  private release(p: Player): void {
    const ball = this.world.ball;
    p.hasBall = false;
    p.startKickCooldown();
    ball.release();
    ball.lastKickerId = p.id;
    ball.lastTouchTeam = p.teamIndex;
    // Start the ball just in front of the kicker so it doesn't snag on him
    ball.x = p.x + p.facingX * 8;
    ball.y = p.y + 5 + p.facingY * 6;
  }
}
