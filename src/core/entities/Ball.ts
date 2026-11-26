// ============================================================
// Ball — Arcade physics and state for the football (core, no
// rendering: the client's BallView draws it).
// x/y are ground coordinates; z is height above the pitch (lobs).
// ============================================================

import { BALL, PITCH } from '../config/GameplayConfig';
import {
  GOAL_TOP, GOAL_BOTTOM, PITCH_LEFT, PITCH_RIGHT, PITCH_TOP, PITCH_BOTTOM,
} from '../logic/PitchGeometry';

export interface KickOptions {
  /** Initial upward speed (px/s) for lobs. */
  lift?: number;
  /** Mark as a power shot (visual trail). */
  power?: boolean;
}

export type BounceCallback = (strength: number) => void;

export class Ball {
  public x: number;
  public y: number;
  public z = 0;
  public vx = 0;
  public vy = 0;
  public vz = 0;

  public ownerId: number | null = null;
  public ownerTeam: number | null = null;
  /** Team that touched the ball last (null before kickoff). */
  public lastTouchTeam: number | null = null;
  public lastKickerId: number | null = null;
  /** Intended receiver of the current pass. */
  public passTargetId: number | null = null;
  public isPowerShot = false;
  /** True from a shot until someone touches the ball. */
  public isShot = false;
  /** Time since the last kick while the ball is free (ms); used for keeper reaction time. */
  public kickAgeMs = 0;
  /** Increments on every kick: identifies one flight of the ball. */
  public kickId = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.ownerId = null;
    this.ownerTeam = null;
    this.lastTouchTeam = null;
    this.lastKickerId = null;
    this.passTargetId = null;
    this.isPowerShot = false;
    this.isShot = false;
  }

  get isFree(): boolean {
    return this.ownerId === null;
  }

  setOwner(playerId: number, teamIndex: number): void {
    this.ownerId = playerId;
    this.ownerTeam = teamIndex;
    this.lastTouchTeam = teamIndex;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.z = 0;
    this.passTargetId = null;
    this.isPowerShot = false;
    this.isShot = false;
  }

  release(): void {
    this.ownerId = null;
    this.ownerTeam = null;
  }

  kick(vx: number, vy: number, opts: KickOptions = {}): void {
    this.kickId++;
    this.release();
    const speed = Math.hypot(vx, vy);
    const scale = speed > BALL.maxSpeed ? BALL.maxSpeed / speed : 1;
    this.vx = vx * scale;
    this.vy = vy * scale;
    this.vz = opts.lift ?? 0;
    this.isPowerShot = opts.power ?? false;
    this.passTargetId = null;
    this.isShot = false;
    this.kickAgeMs = 0;
  }

  getSpeed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  update(dt: number, onBounce?: BounceCallback): void {
    if (this.ownerId !== null) return;

    this.kickAgeMs += dt * 1000;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Height (lobs)
    if (this.z > 0 || this.vz > 0) {
      this.vz -= BALL.gravity * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        if (this.vz < -60) {
          onBounce?.(Math.min(1, -this.vz / 200));
          this.vz = -this.vz * BALL.groundBounce;
        } else {
          this.vz = 0;
        }
      }
    }

    const friction = this.z > 0 ? BALL.airFriction : BALL.friction;
    const f = Math.pow(friction, dt * 60);
    this.vx *= f;
    this.vy *= f;

    const speed = this.getSpeed();
    if (speed < BALL.minSpeed) {
      this.vx = 0;
      this.vy = 0;
    }
    if (speed < BALL.trailSpeed * 0.7) this.isPowerShot = false;

    this.handleBoundaryCollisions(onBounce);
  }

  private inGoalMouth(): boolean {
    return this.y > GOAL_TOP && this.y < GOAL_BOTTOM && this.z < PITCH.crossbarHeight;
  }

  private handleBoundaryCollisions(onBounce?: BounceCallback): void {
    const r = BALL.radius;
    const rest = BALL.bounceRestitution;
    const bounce = (v: number) => {
      if (Math.abs(v) > 60) onBounce?.(Math.min(1, Math.abs(v) / 400));
    };

    // Left / right: open where the goal mouth is
    if (this.x - r < PITCH_LEFT) {
      if (this.inGoalMouth()) {
        if (this.x < PITCH_LEFT) {
          this.y = Math.min(Math.max(this.y, GOAL_TOP + r), GOAL_BOTTOM - r);
          const back = PITCH_LEFT - PITCH.goalDepth + r;
          if (this.x < back) { this.x = back; this.vx = 0; }
        }
      } else if (this.vx < 0 || this.x < PITCH_LEFT + r) {
        this.x = PITCH_LEFT + r;
        bounce(this.vx);
        this.vx = Math.abs(this.vx) * rest;
      }
    }
    if (this.x + r > PITCH_RIGHT) {
      if (this.inGoalMouth()) {
        if (this.x > PITCH_RIGHT) {
          this.y = Math.min(Math.max(this.y, GOAL_TOP + r), GOAL_BOTTOM - r);
          const back = PITCH_RIGHT + PITCH.goalDepth - r;
          if (this.x > back) { this.x = back; this.vx = 0; }
        }
      } else if (this.vx > 0 || this.x > PITCH_RIGHT - r) {
        this.x = PITCH_RIGHT - r;
        bounce(this.vx);
        this.vx = -Math.abs(this.vx) * rest;
      }
    }

    if (this.y - r < PITCH_TOP) {
      this.y = PITCH_TOP + r;
      bounce(this.vy);
      this.vy = Math.abs(this.vy) * rest;
    }
    if (this.y + r > PITCH_BOTTOM) {
      this.y = PITCH_BOTTOM - r;
      bounce(this.vy);
      this.vy = -Math.abs(this.vy) * rest;
    }
  }

  /**
   * Returns 0 if the ball is in the left goal (team 1 scores),
   * 1 if it is in the right goal (team 0 scores), otherwise -1.
   */
  checkGoal(): number {
    if (this.ownerId !== null) return -1;
    if (this.y <= GOAL_TOP || this.y >= GOAL_BOTTOM) return -1;
    if (this.x < PITCH_LEFT - BALL.radius) return 0;
    if (this.x > PITCH_RIGHT + BALL.radius) return 1;
    return -1;
  }
}
