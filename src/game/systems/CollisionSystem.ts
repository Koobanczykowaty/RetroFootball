// ============================================================
// CollisionSystem — Player separation, tackles, ball control,
// interceptions and goalkeeper saves. Decides who has the ball.
// ============================================================

import { BALL, GOALKEEPER, PLAYER } from '../config/GameplayConfig';
import type { Player } from '../entities/Player';
import { ballOwner, MatchWorld } from '../logic/MatchWorld';
import {
  PITCH_LEFT, PITCH_RIGHT, PITCH_TOP, PITCH_BOTTOM, attackDir, clamp, normalize,
} from '../logic/PitchGeometry';
import { soundManager } from './SoundManager';

export interface CollisionEvents {
  /** A player gained possession (previousTeam = team that touched it last). */
  onPossession?: (p: Player, previousTeam: number | null) => void;
  /** A goalkeeper stopped a shot. */
  onSave?: (gk: Player, caught: boolean) => void;
  /** A tackle won the ball. */
  onTackle?: (tackler: Player, victim: Player) => void;
}

export class CollisionSystem {
  /** Per-team goalkeeper save chance (from AI profile). */
  public gkSaveChance: [number, number] = [0.6, 0.6];
  /** Per-team tackle success chance (from AI profile). */
  public tackleSuccess: [number, number] = [PLAYER.tackleSuccess, PLAYER.tackleSuccess];

  constructor(
    private readonly world: MatchWorld,
    private readonly events: CollisionEvents = {},
  ) {}

  update(dt: number): void {
    this.separatePlayers();
    this.resolveTackles();
    this.resolveBallContacts();
    this.placeCarriedBall();
    this.trackPossession(dt);
  }

  // ------------------------------------------------------------ separation

  private separatePlayers(): void {
    const ps = this.world.players;
    const min = PLAYER.separationDistance;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i];
        const b = ps[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < 0.01) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          d = Math.hypot(dx, dy);
        }
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        // The ball carrier is harder to push around
        const wa = a.hasBall ? 0.3 : 1;
        const wb = b.hasBall ? 0.3 : 1;
        const sum = wa + wb;
        a.x -= nx * push * 2 * (wa / sum);
        a.y -= ny * push * 2 * (wa / sum);
        b.x += nx * push * 2 * (wb / sum);
        b.y += ny * push * 2 * (wb / sum);
        a.constrainToBounds();
        b.constrainToBounds();
        // Slide around each other instead of pushing head-on
        this.slideAlong(a, nx, ny, b.id);
        this.slideAlong(b, -nx, -ny, a.id);
      }
    }
  }

  /**
   * If `p` is moving into a contact (n = unit vector from p toward the other
   * player), turn the part of his velocity that goes into the other player into
   * sideways movement along the contact, so he slides past instead of getting
   * stuck. Tackling and stunned players are left alone.
   */
  private slideAlong(p: Player, nx: number, ny: number, otherId: number): void {
    if (p.isTackling || p.isStunned) return;
    const into = p.vx * nx + p.vy * ny;
    if (into <= 0) return;
    // Remove the component going into the other player...
    p.vx -= nx * into;
    p.vy -= ny * into;
    // ...and redirect it sideways, keeping the side he was already drifting to
    let tx = -ny;
    let ty = nx;
    const side = p.vx * tx + p.vy * ty;
    if (Math.abs(side) < 1e-3 ? (p.id + otherId) % 2 === 0 : side < 0) {
      tx = -tx;
      ty = -ty;
    }
    p.vx += tx * into * PLAYER.contactSlide;
    p.vy += ty * into * PLAYER.contactSlide;
  }

  // ---------------------------------------------------------------- tackles

  private resolveTackles(): void {
    const ball = this.world.ball;
    for (const t of this.world.players) {
      if (!t.isTackling || t.tackleResolved) continue;
      const carrier = ballOwner(this.world);
      if (!carrier || carrier.teamIndex === t.teamIndex) continue;
      // A goalkeeper holding the ball can't be challenged
      if (carrier.role === 'goalkeeper') continue;
      if (t.distanceTo(ball.x, ball.y) > PLAYER.tackleRange) continue;

      t.tackleResolved = true;
      if (carrier.protectTimer > 0 || Math.random() > this.tackleSuccess[t.teamIndex]) {
        // Missed — the tackler loses balance briefly
        t.stun(PLAYER.missStunDuration);
        continue;
      }

      carrier.hasBall = false;
      carrier.stun(PLAYER.stunDuration);
      this.world.stats.tackles[t.teamIndex]++;
      soundManager.kick();

      if (Math.random() < PLAYER.tackleWinBallChance) {
        this.givePossession(t);
      } else {
        // Ball pops loose in the tackle direction
        ball.release();
        ball.lastTouchTeam = t.teamIndex;
        const d = normalize(t.facingX, t.facingY);
        const spread = (Math.random() - 0.5) * 0.8;
        const ang = Math.atan2(d.y, d.x) + spread;
        ball.vx = Math.cos(ang) * 150;
        ball.vy = Math.sin(ang) * 150;
        t.pickupBlockTimer = 120;
      }
      this.events.onTackle?.(t, carrier);
    }
  }

  // ------------------------------------------------------------ ball contact

  private resolveBallContacts(): void {
    const ball = this.world.ball;
    if (!ball.isFree) return;

    const speed = ball.getSpeed();
    // Candidates sorted by distance
    const candidates = this.world.players
      .map((p) => ({ p, d: p.distanceTo(ball.x, ball.y) }))
      .filter(({ p, d }) => {
        if (!p.canTouchBall()) return false;
        if (p.role === 'goalkeeper') return d < GOALKEEPER.reach && ball.z < GOALKEEPER.reachHeight;
        return d < PLAYER.ballPickupRadius && ball.z < BALL.playerReachHeight;
      })
      .sort((a, b) => a.d - b.d);

    for (const { p } of candidates) {
      if (p.role === 'goalkeeper') {
        if (this.resolveKeeper(p, speed)) return;
        continue;
      }

      // First touch on a slow ball always works
      let controlled = speed < BALL.controlSpeed;
      if (!controlled) {
        const chance = ball.passTargetId === p.id ? BALL.receiverControlChance : BALL.controlChance;
        controlled = Math.random() < chance;
      }
      if (controlled) {
        this.givePossession(p);
        return;
      }
      // Failed control — ball deflects off the player
      const ang = Math.atan2(ball.vy, ball.vx) + (Math.random() - 0.5) * 1.2;
      const s = speed * 0.55;
      ball.vx = Math.cos(ang) * s;
      ball.vy = Math.sin(ang) * s;
      ball.lastTouchTeam = p.teamIndex;
      ball.passTargetId = null;
      ball.isShot = false;
      p.pickupBlockTimer = PLAYER.deflectBlock;
      soundManager.bounce();
      return;
    }
  }

  /** Returns true if the keeper dealt with the ball (caught or parried). */
  private resolveKeeper(gk: Player, speed: number): boolean {
    const ball = this.world.ball;
    const isOpponentShot = ball.isShot && ball.lastTouchTeam !== gk.teamIndex;

    if (speed < GOALKEEPER.catchSpeed || !isOpponentShot) {
      if (isOpponentShot) this.world.stats.saves[gk.teamIndex]++;
      this.givePossession(gk);
      if (isOpponentShot) this.events.onSave?.(gk, true);
      return true;
    }

    // Fast shot: save attempt
    const saveChance = this.gkSaveChance[gk.teamIndex] * clamp(1.25 - (speed - GOALKEEPER.catchSpeed) / 500, 0.4, 1.1);
    if (Math.random() < saveChance) {
      this.world.stats.saves[gk.teamIndex]++;
      if (speed < GOALKEEPER.catchSpeed * 1.25 && Math.random() < 0.5) {
        this.givePossession(gk);
        this.events.onSave?.(gk, true);
      } else {
        // Parry: push the ball back out and to the side
        const outX = attackDir(gk.teamIndex);
        const side = ball.vy !== 0 ? Math.sign(ball.vy) : (Math.random() < 0.5 ? -1 : 1);
        ball.vx = outX * (90 + Math.random() * 90);
        ball.vy = side * (80 + Math.random() * 120);
        ball.vz = 60;
        ball.lastTouchTeam = gk.teamIndex;
        ball.isShot = false;
        ball.isPowerShot = false;
        gk.pickupBlockTimer = 350;
        gk.setPose('dive', GOALKEEPER.diveDuration, side);
        soundManager.save();
        this.events.onSave?.(gk, false);
      }
      return true;
    }

    // Beaten — don't let him try again on this shot
    gk.pickupBlockTimer = 400;
    return false;
  }

  /** Give the ball to `p` (also used by scripted test scenarios). */
  givePossession(p: Player): void {
    const ball = this.world.ball;
    const previousTeam = ball.lastTouchTeam;
    for (const other of this.world.players) other.hasBall = false;
    p.gainPossession();
    ball.setOwner(p.id, p.teamIndex);
    this.placeCarriedBall();
    this.events.onPossession?.(p, previousTeam);
  }

  // --------------------------------------------------------------- carrying

  placeCarriedBall(): void {
    const ball = this.world.ball;
    if (ball.ownerId === null) return;
    const owner = ballOwner(this.world);
    if (!owner || !owner.hasBall) {
      ball.release();
      return;
    }
    const off = PLAYER.ballCarryOffset;
    const r = BALL.radius;
    ball.x = clamp(owner.x + owner.facingX * off, PITCH_LEFT + r, PITCH_RIGHT - r);
    ball.y = clamp(owner.y + 5 + owner.facingY * off * 0.6, PITCH_TOP + r, PITCH_BOTTOM - r);
    ball.z = 0;
  }

  private trackPossession(dt: number): void {
    const team = this.world.ball.ownerTeam ?? this.world.ball.lastTouchTeam;
    if (team === 0 || team === 1) this.world.stats.possessionMs[team] += dt * 1000;
  }
}
