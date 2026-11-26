// ============================================================
// Player — One footballer's state and movement (core, no
// rendering: the client's PlayerView draws him and picks the
// animation frame from his pose and speed).
// ============================================================

import {
  PLAYER, GOALKEEPER, FormationPosition, PlayerRole, ROLE_TRAITS,
} from '../config/GameplayConfig';
import {
  GOAL_TOP, GOAL_BOTTOM, PITCH_LEFT, PITCH_RIGHT, PITCH_TOP, PITCH_BOTTOM,
  attackDir, clamp, distance, normalize, ownGoalX,
} from '../logic/PitchGeometry';

export type { PlayerRole };
export type Pose = 'none' | 'kick' | 'tackle' | 'dive' | 'celebrate' | 'header';

export class Player {
  public readonly id: number;
  public readonly teamIndex: number;
  /** Can change when the team switches formation mid-match (setFormationSlot). */
  public role: PlayerRole;
  public formation: FormationPosition;

  public x: number;
  public y: number;
  public vx = 0;
  public vy = 0;
  public facingX: number;
  public facingY = 0;

  public hasBall = false;
  public isSprinting = false;
  public stamina = 1;
  /** Multiplier applied to max speed (AI difficulty). */
  public speedFactor = 1;

  // Timers (ms)
  public kickCooldownTimer = 0;
  public tackleTimer = 0;
  public tackleCooldownTimer = 0;
  public tackleResolved = true;
  public stunTimer = 0;
  public pickupBlockTimer = 0;
  public protectTimer = 0;
  /** How long this player has had the ball (ms). */
  public possessionTime = 0;
  /** >0 while the player keeps joining the attack after passing (ms). */
  public supportRunTimer = 0;

  /** Formation home position (absolute). */
  public homeX: number;
  public homeY: number;

  /** Current pose and how long it lasts (ms); the view animates it. */
  public pose: Pose = 'none';
  public poseTimer = 0;
  /** Dive direction for the 'dive' pose: -1 up, 1 down. */
  public diveDir = 0;

  constructor(id: number, teamIndex: number, formation: FormationPosition, x: number, y: number) {
    this.id = id;
    this.teamIndex = teamIndex;
    this.role = formation.role;
    this.formation = formation;
    this.x = x;
    this.y = y;
    this.homeX = x;
    this.homeY = y;
    this.facingX = attackDir(teamIndex);
  }

  /**
   * Take over a slot of a (new) formation: role and formation home change.
   * Goalkeeper slots stay goalkeeper slots (index 0 in every formation).
   */
  setFormationSlot(pos: FormationPosition, home: { x: number; y: number }): void {
    this.formation = pos;
    this.role = pos.role;
    this.homeX = home.x;
    this.homeY = home.y;
  }

  get isTackling(): boolean {
    return this.tackleTimer > 0;
  }

  get isStunned(): boolean {
    return this.stunTimer > 0;
  }

  /**
   * Accelerate toward a desired velocity. (dirX, dirY) need not be normalised;
   * a zero vector decelerates. speedScale (0..1) slows down for arrivals.
   */
  steer(dirX: number, dirY: number, sprint: boolean, dt: number, speedScale = 1): void {
    if (this.tackleTimer > 0) return; // committed to the tackle dash
    const dir = normalize(dirX, dirY);
    const moving = dir.len > 0.01 && this.stunTimer <= 0;

    const wantSprint = sprint && moving && this.stamina > PLAYER.minSprintStamina;
    this.isSprinting = wantSprint;

    let maxSpeed = (wantSprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed) * this.speedFactor * ROLE_TRAITS[this.role].speed;
    if (this.hasBall) maxSpeed *= PLAYER.dribbleSpeedFactor;
    maxSpeed *= clamp(speedScale, 0, 1);

    // Analog input (gamepad stick) scales speed too
    const analog = Math.min(1, dir.len);
    const targetVx = moving ? dir.x * maxSpeed * analog : 0;
    const targetVy = moving ? dir.y * maxSpeed * analog : 0;

    const rate = (moving ? PLAYER.acceleration : PLAYER.deceleration) * dt;
    const dvx = targetVx - this.vx;
    const dvy = targetVy - this.vy;
    const dv = Math.hypot(dvx, dvy);
    if (dv <= rate) {
      this.vx = targetVx;
      this.vy = targetVy;
    } else {
      this.vx += (dvx / dv) * rate;
      this.vy += (dvy / dv) * rate;
    }
  }

  /** Steer toward a point, slowing down on arrival. */
  moveToward(tx: number, ty: number, sprint: boolean, dt: number): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 3) {
      this.steer(0, 0, false, dt);
      return;
    }
    const scale = dist < 30 ? Math.max(0.25, dist / 30) : 1;
    this.steer(dx, dy, sprint, dt, scale);
  }

  decelerate(dt: number): void {
    this.steer(0, 0, false, dt);
  }

  /** Turn to face a point without moving. */
  faceToward(tx: number, ty: number): void {
    const d = normalize(tx - this.x, ty - this.y);
    if (d.len > 0) {
      this.facingX = d.x;
      this.facingY = d.y;
    }
  }

  canTackle(): boolean {
    return this.tackleCooldownTimer <= 0 && this.tackleTimer <= 0 && this.stunTimer <= 0 && !this.hasBall;
  }

  startTackle(dirX: number, dirY: number): void {
    const d = normalize(dirX, dirY);
    const nx = d.len > 0 ? d.x : this.facingX;
    const ny = d.len > 0 ? d.y : this.facingY;
    this.vx = nx * PLAYER.tackleDashSpeed;
    this.vy = ny * PLAYER.tackleDashSpeed;
    this.facingX = nx;
    this.facingY = ny;
    this.tackleTimer = PLAYER.tackleDuration;
    this.tackleCooldownTimer = PLAYER.tackleCooldown;
    this.tackleResolved = false;
    this.setPose('tackle', PLAYER.tackleDuration);
  }

  stun(ms: number): void {
    this.stunTimer = Math.max(this.stunTimer, ms);
    this.tackleTimer = 0;
  }

  setPose(pose: Pose, ms: number, diveDir = 0): void {
    this.pose = pose;
    this.poseTimer = ms;
    this.diveDir = diveDir;
  }

  get currentPose(): Pose {
    return this.pose;
  }

  // ------------------------------------------------------------------ state

  canKick(): boolean {
    return this.kickCooldownTimer <= 0;
  }

  /** Whether this player is currently able to touch / receive the ball. */
  canTouchBall(): boolean {
    return this.kickCooldownTimer <= 0 && this.stunTimer <= 0 && this.pickupBlockTimer <= 0;
  }

  startKickCooldown(): void {
    this.kickCooldownTimer = PLAYER.kickCooldown;
    this.setPose('kick', 200);
  }

  gainPossession(protectMs: number = PLAYER.possessionProtect): void {
    this.hasBall = true;
    this.possessionTime = 0;
    this.protectTimer = protectMs;
  }

  getSpeed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  distanceTo(ox: number, oy: number): number {
    return distance(this.x, this.y, ox, oy);
  }

  /** Teleport (kickoff reset). */
  placeAt(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.hasBall = false;
    this.isSprinting = false;
    this.tackleTimer = 0;
    this.stunTimer = 0;
    this.pickupBlockTimer = 0;
    this.kickCooldownTimer = 0;
    this.possessionTime = 0;
    this.supportRunTimer = 0;
    this.pose = 'none';
    this.facingX = attackDir(this.teamIndex);
    this.facingY = 0;
  }

  // ----------------------------------------------------------------- update

  update(dt: number): void {
    const ms = dt * 1000;

    this.kickCooldownTimer = Math.max(0, this.kickCooldownTimer - ms);
    this.tackleCooldownTimer = Math.max(0, this.tackleCooldownTimer - ms);
    this.pickupBlockTimer = Math.max(0, this.pickupBlockTimer - ms);
    this.protectTimer = Math.max(0, this.protectTimer - ms);
    this.supportRunTimer = Math.max(0, this.supportRunTimer - ms);
    this.tickPose(ms);
    this.possessionTime = this.hasBall ? this.possessionTime + ms : 0;

    if (this.tackleTimer > 0) {
      this.tackleTimer -= ms;
      // Dash slows down quickly
      const f = Math.pow(0.08, dt);
      this.vx *= f;
      this.vy *= f;
    } else if (this.stunTimer > 0) {
      this.stunTimer -= ms;
      const f = Math.pow(0.02, dt);
      this.vx *= f;
      this.vy *= f;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.constrainToBounds();

    const speed = this.getSpeed();
    if (speed > 15 && this.tackleTimer <= 0) {
      this.facingX = this.vx / speed;
      this.facingY = this.vy / speed;
    }

    if (this.isSprinting && speed > 10) {
      this.stamina = Math.max(0, this.stamina - PLAYER.sprintStaminaDrain * ROLE_TRAITS[this.role].staminaDrain * dt);
    } else {
      this.stamina = Math.min(1, this.stamina + PLAYER.staminaRegen * ROLE_TRAITS[this.role].staminaRegen * dt);
    }
  }

  /** While play is stopped: slow down, keep poses running. */
  updateIdle(dt: number): void {
    this.tickPose(dt * 1000);
    this.decelerate(dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.constrainToBounds();
  }

  private tickPose(ms: number): void {
    if (this.poseTimer > 0) {
      this.poseTimer -= ms;
      if (this.poseTimer <= 0) this.pose = 'none';
    }
  }

  constrainToBounds(): void {
    if (this.role === 'goalkeeper') {
      const a = this.getGoalkeeperArea();
      this.x = clamp(this.x, a.minX, a.maxX);
      this.y = clamp(this.y, a.minY, a.maxY);
    } else {
      const m = PLAYER.radius;
      this.x = clamp(this.x, PITCH_LEFT + m, PITCH_RIGHT - m);
      this.y = clamp(this.y, PITCH_TOP + m, PITCH_BOTTOM - m);
    }
  }

  /** Area the goalkeeper may move in (in front of his own goal). */
  getGoalkeeperArea(): { minX: number; maxX: number; minY: number; maxY: number } {
    const minY = GOAL_TOP - GOALKEEPER.boxMarginY;
    const maxY = GOAL_BOTTOM + GOALKEEPER.boxMarginY;
    if (ownGoalX(this.teamIndex) === PITCH_LEFT) {
      return { minX: PITCH_LEFT + 8, maxX: PITCH_LEFT + GOALKEEPER.boxDepth, minY, maxY };
    }
    return { minX: PITCH_RIGHT - GOALKEEPER.boxDepth, maxX: PITCH_RIGHT - 8, minY, maxY };
  }
}
