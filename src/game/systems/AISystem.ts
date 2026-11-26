// ============================================================
// AISystem — Computer-controlled player behaviour.
// Drives every non-human player of a team: one chaser/presser,
// formation-based support/cover for the rest, and the goalkeeper.
// ============================================================

import {
  AERIAL, AIProfile, AI_SPACING, ATTACK_PUSH, GOALKEEPER, PITCH, PLAYER,
} from '../config/GameplayConfig';
import type { Player } from '../entities/Player';
import { canStrikeNow } from '../logic/Aerial';
import { ballOwner, MatchWorld } from '../logic/MatchWorld';
import {
  GOAL_BOTTOM, GOAL_TOP, PITCH_BOTTOM, PITCH_CX, PITCH_CY, PITCH_LEFT, PITCH_RIGHT, PITCH_TOP,
  attackDir, clamp, distance, laneClearance, normalize, opponentGoalX, ownGoalX, predictBallCrossing,
} from '../logic/PitchGeometry';
import type { ActionSystem } from './ActionSystem';

interface Mind {
  /** Time until the next positional re-think (ms). */
  timer: number;
  tx: number;
  ty: number;
  sprint: boolean;
  /** Time until the next on-ball decision (ms). */
  thinkTimer: number;
  /** Carrier velocity as last read by this player when pressing (feints). */
  seenVx: number;
  seenVy: number;
  /** Time until the next read of the carrier's direction (ms). */
  readMs: number;
  /** Clock (ms) of the last read; a fresh press starts with a clean read. */
  lastReadAt: number;
  /** > 0 while fooled by a feint (ms). */
  fooledMs: number;
  /** Ball flight (Ball.kickId) this player already decided about in the air. */
  aerialKick: number;
}

export class AISystem {
  private minds = new Map<number, Mind>();
  private chasers: [Player | null, Player | null] = [null, null];
  /** How many times a presser fell for a feint (sim metric). */
  public feintBites = 0;
  /** Headers / volleys struck by AI players (sim metric). */
  public aerialStrikes = 0;
  /** AI clock (ms), advanced once per frame. */
  private clockMs = 0;
  /** Called after an AI field player passes or lobs to a teammate. */
  public onFieldPass?: (passer: Player) => void;

  constructor(
    private readonly world: MatchWorld,
    private readonly actions: ActionSystem,
  ) {}

  reset(): void {
    this.minds.clear();
    this.chasers = [null, null];
  }

  /**
   * Update all players of `team` except `controlled` (the humans' players:
   * none for a CPU team, two in co-op).
   */
  updateTeam(team: number, dt: number, profile: AIProfile, controlled: readonly Player[]): void {
    if (team === 0) this.clockMs += dt * 1000;
    const mates = this.world.teams[team];
    const chaser = this.pickChaser(team, controlled);

    for (const p of mates) {
      p.speedFactor = profile.speedFactor;
      if (controlled.includes(p)) continue;

      if (p.role === 'goalkeeper') this.updateGoalkeeper(p, dt, profile);
      else if (this.tryAerial(p, profile)) continue;
      else if (p.hasBall) this.updateCarrier(p, dt, profile);
      else this.updateOffBall(p, dt, profile, p === chaser);
    }
  }

  // ------------------------------------------------------------- chaser

  /** One player per team goes for the ball; the rest hold shape. */
  private pickChaser(team: number, controlled: readonly Player[]): Player | null {
    const ball = this.world.ball;
    if (ball.ownerTeam === team) {
      this.chasers[team] = null;
      return null;
    }
    const mates = this.world.teams[team].filter((p) => p.role !== 'goalkeeper');

    // The intended receiver of a pass always goes for it
    const receiver = mates.find((p) => p.id === ball.passTargetId);
    if (receiver && ball.isFree) {
      this.chasers[team] = receiver;
      return controlled.includes(receiver) ? null : receiver;
    }

    let best: Player | null = null;
    let bestD = Infinity;
    for (const p of mates) {
      if (p.isStunned) continue;
      const d = p.distanceTo(ball.x, ball.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    // Hysteresis: keep the current chaser unless someone is clearly closer
    const current = this.chasers[team];
    if (current && best && current !== best && !current.isStunned) {
      if (current.distanceTo(ball.x, ball.y) < bestD + 25) best = current;
    }
    this.chasers[team] = best;
    // If a human's player is the closest, no AI teammate chases
    return best && controlled.includes(best) ? null : best;
  }

  // ------------------------------------------------------ headers / volleys

  /**
   * A free ball at head or knee height in reach: once per flight the player
   * decides (profile.aerialChance) to strike it. Near the opponent's goal he
   * shoots, elsewhere he heads / volleys it on to a teammate ahead (or into
   * space ahead: a clearance in his own half). Returns true if he struck it.
   */
  private tryAerial(p: Player, profile: AIProfile): boolean {
    const ball = this.world.ball;
    if (!ball.isFree || ball.z < AERIAL.volleyMinZ || !canStrikeNow(ball, p.x, p.y)) return false;
    const m = this.mind(p);
    if (m.aerialKick === ball.kickId) return false;
    m.aerialKick = ball.kickId;
    if (Math.random() >= profile.aerialChance) return false;

    const quality = profile.aerialSkill + Math.random() * (1 - profile.aerialSkill);
    const fwd = attackDir(p.teamIndex);
    const nearGoal = distance(p.x, p.y, opponentGoalX(p.teamIndex), PITCH_CY) < profile.shootRange * 1.1;
    const kind = nearGoal ? 'shot' : 'pass';
    const aimY = (Math.random() - 0.5) * 1.6;
    const zone = this.actions.aerial(p, kind, quality, aimY, nearGoal ? 0 : fwd, 0, profile.shotAccuracy);
    if (!zone) return false;
    if (kind === 'pass') this.onFieldPass?.(p);
    this.aerialStrikes++;
    return true;
  }

  // ---------------------------------------------------------- off the ball

  private updateOffBall(p: Player, dt: number, profile: AIProfile, isChaser: boolean): void {
    const ball = this.world.ball;
    const carrier = ballOwner(this.world);
    const oppHasBall = carrier !== null && carrier.teamIndex !== p.teamIndex;
    // A keeper holding the ball can't be challenged: drop back into shape instead
    const keeperHasBall = oppHasBall && carrier?.role === 'goalkeeper';

    if (isChaser && !keeperHasBall) {
      if (oppHasBall && carrier) {
        // Press the carrier, anticipating his run as the presser reads it
        const read = this.readCarrier(p, carrier, dt, profile);
        const lead = read.fooled ? 0.5 : 0.2; // fooled: commits to the old direction
        const tx = carrier.x + read.vx * lead;
        const ty = carrier.y + read.vy * lead;
        const d = p.distanceTo(carrier.x, carrier.y);
        p.moveToward(tx, ty, d > 40, dt);
        if (!read.fooled && d < PLAYER.tackleRange + 8 && carrier.protectTimer <= 0
          && Math.random() < profile.tackleRate * dt) {
          this.actions.tackle(p);
        }
      } else {
        // Loose ball: run to where it will be
        const d = p.distanceTo(ball.x, ball.y);
        const lead = Math.min(d / 220, 0.6);
        p.moveToward(ball.x + ball.vx * lead, ball.y + ball.vy * lead, d > 50, dt);
      }
      return;
    }

    // After passing, keep joining the attack instead of dropping back
    if (p.supportRunTimer > 0) {
      const teamHasBall = ball.ownerTeam === p.teamIndex || (ball.isFree && ball.lastTouchTeam === p.teamIndex);
      if (teamHasBall) {
        this.supportRun(p, dt);
        return;
      }
      p.supportRunTimer = 0; // attack over: back to normal shape
    }

    const mind = this.mind(p);
    mind.timer -= dt * 1000;
    // A teammate ran into our spot: re-think soon instead of waiting the full interval
    if (this.teammateTooClose(p)) mind.timer = Math.min(mind.timer, 120);
    if (mind.timer <= 0) {
      mind.timer = profile.decisionInterval * (0.7 + Math.random() * 0.6);
      this.chooseShapePosition(p, mind);
    }

    if (p.distanceTo(mind.tx, mind.ty) < 6) {
      p.decelerate(dt);
      p.faceToward(ball.x, ball.y);
    } else {
      p.moveToward(mind.tx, mind.ty, mind.sprint, dt);
    }
  }

  /**
   * Run ahead of the ball in the player's own lane, offering a pass, without
   * running past the edge of the opponent's penalty area.
   */
  private supportRun(p: Player, dt: number): void {
    const ball = this.world.ball;
    const dir = attackDir(p.teamIndex);
    // Forwards may go up to the edge of the box; a defender only just past halfway
    const limitX = p.role === 'defender'
      ? PITCH_CX + dir * PLAYER.defenderSupportRunLimit
      : opponentGoalX(p.teamIndex) - dir * (PITCH.penaltyAreaHeight * 0.6);
    let tx = Math.max((ball.x + dir * PLAYER.supportRunLead) * dir, (p.x + dir * 40) * dir) * dir;
    if ((tx - limitX) * dir > 0) tx = limitX;
    let ty = clamp(p.y, PITCH_TOP + 30, PITCH_BOTTOM - 30);
    // Don't run into a teammate's space
    ({ x: tx, y: ty } = this.spreadFromTeammates(p, tx, ty));
    ty = clamp(ty, PITCH_TOP + 30, PITCH_BOTTOM - 30);
    const behindBall = (ball.x - p.x) * dir > 0;
    p.moveToward(tx, ty, behindBall && p.stamina > 0.3, dt);
  }

  /** Formation position shifted by ball position and phase of play. */
  private chooseShapePosition(p: Player, mind: Mind): void {
    const ball = this.world.ball;
    const team = p.teamIndex;
    const dir = attackDir(team);
    const halfW = PITCH.width / 2;
    const carrier = ballOwner(this.world);
    const teamHasBall = ball.ownerTeam === team || (ball.isFree && ball.lastTouchTeam === team);
    const oppHasBall = carrier !== null && carrier.teamIndex !== team;

    let x = p.homeX;
    let y = p.homeY;

    if (teamHasBall) {
      x += dir * ATTACK_PUSH[p.role] * halfW;
      x += (ball.x - PITCH_CX) * 0.35;
      y += (ball.y - PITCH_CY) * 0.3;
      // Forwards stay ahead of the ball to offer a pass
      if (p.role === 'forward' && (x - ball.x) * dir < 70) x = ball.x + dir * 70;
      // Midfielders offer a lateral option
      if (p.role === 'midfielder') y += (ball.y < PITCH_CY ? 1 : -1) * 50;
    } else {
      x += (ball.x - PITCH_CX) * 0.3;
      y += (ball.y - PITCH_CY) * 0.35;
      // Drop deeper when the ball is in our half
      const ballInOurHalf = (ball.x - PITCH_CX) * dir < 0;
      if (ballInOurHalf) x -= dir * 25;

      // The nearest defender covers between the carrier and our goal
      if (oppHasBall && carrier && p.role === 'defender' && this.isNearestDefender(p, carrier)) {
        const gx = ownGoalX(team);
        if (Math.abs(carrier.x - gx) < 380) {
          x = gx + (carrier.x - gx) * 0.45;
          y = PITCH_CY + (carrier.y - PITCH_CY) * 0.6;
        }
      }
    }

    x += (Math.random() - 0.5) * 20;
    y += (Math.random() - 0.5) * 20;
    ({ x, y } = this.spreadFromTeammates(p, x, y));
    mind.tx = clamp(x, PITCH_LEFT + 16, PITCH_RIGHT - 16);
    mind.ty = clamp(y, PITCH_TOP + 16, PITCH_BOTTOM - 16);
    mind.sprint = p.distanceTo(mind.tx, mind.ty) > 120 && p.stamina > 0.4;
  }

  /**
   * Push a candidate shape position away from teammates so the team doesn't
   * bunch up. Teammates that are themselves holding shape are represented by
   * their chosen target; the ball carrier, chaser and human-controlled player
   * by where they actually are.
   */
  private spreadFromTeammates(p: Player, x: number, y: number): { x: number; y: number } {
    const team = p.teamIndex;
    const others = this.world.teams[team].filter((o) => o !== p && o.role !== 'goalkeeper');
    for (let pass = 0; pass < 2; pass++) {
      for (const o of others) {
        const m = this.minds.get(o.id);
        const holdsShape = m && !o.hasBall && !this.world.controlled[team].includes(o) && o !== this.chasers[team];
        const ox = holdsShape ? m.tx : o.x;
        const oy = holdsShape ? m.ty : o.y;
        let dx = x - ox;
        let dy = y - oy;
        let d = Math.hypot(dx, dy);
        if (d >= AI_SPACING) continue;
        if (d < 1) {
          // Exactly on top of each other: separate vertically (toward the wider side)
          dx = 0;
          dy = y < PITCH_CY ? -1 : 1;
          d = 1;
        }
        const push = AI_SPACING - d;
        x += (dx / d) * push;
        y += (dy / d) * push;
      }
    }
    return { x, y };
  }

  private teammateTooClose(p: Player): boolean {
    const limit = AI_SPACING * 0.55;
    return this.world.teams[p.teamIndex].some(
      (o) => o !== p && o.role !== 'goalkeeper' && p.distanceTo(o.x, o.y) < limit,
    );
  }

  private isNearestDefender(p: Player, carrier: Player): boolean {
    const d = p.distanceTo(carrier.x, carrier.y);
    return !this.world.teams[p.teamIndex].some(
      (o) => o !== p && o.role === 'defender' && o.distanceTo(carrier.x, carrier.y) < d,
    );
  }

  // ----------------------------------------------------------- on the ball

  private updateCarrier(p: Player, dt: number, profile: AIProfile): void {
    const team = p.teamIndex;
    const dir = attackDir(team);
    const goalX = opponentGoalX(team);
    const opponents = this.world.teams[1 - team];
    const mind = this.mind(p);
    const distGoal = distance(p.x, p.y, goalX, PITCH_CY);

    let nearestOpp: Player | null = null;
    let oppDist = Infinity;
    for (const o of opponents) {
      const d = p.distanceTo(o.x, o.y);
      if (d < oppDist) {
        oppDist = d;
        nearestOpp = o;
      }
    }

    mind.thinkTimer -= dt * 1000;
    if (p.possessionTime > profile.reactionTime && p.canKick() && mind.thinkTimer <= 0) {
      mind.thinkTimer = 220 + Math.random() * 160;

      // Shoot when in range and at a sensible angle
      if (distGoal < profile.shootRange && Math.abs(p.y - PITCH_CY) < 150) {
        const chance = 0.25 + (1 - distGoal / profile.shootRange) * 0.6;
        if (Math.random() < chance) {
          const gk = opponents.find((o) => o.role === 'goalkeeper');
          const side = gk && gk.y < PITCH_CY ? 1 : -1;
          const aim = side * (0.6 + Math.random() * 0.4);
          this.actions.shoot(p, 0.65 + Math.random() * 0.35, aim, 0, 0, profile.shotAccuracy);
          return;
        }
      }

      // Pass when pressed
      if (oppDist < 55 && Math.random() < profile.passChance) {
        if (this.tryPass(p, -20)) return;
      }

      // Occasional progressive pass to keep the ball moving
      if (Math.random() < 0.12 && this.tryPass(p, 40)) return;
    }

    // Dribble toward goal, swerving around the nearest opponent
    let d = normalize(goalX - p.x, PITCH_CY - p.y);
    if (nearestOpp && oppDist < 80) {
      const ahead = (nearestOpp.x - p.x) * d.x + (nearestOpp.y - p.y) * d.y;
      if (ahead > 0) {
        const away = normalize(p.x - nearestOpp.x, p.y - nearestOpp.y);
        // Perpendicular component pointing away from the opponent
        const side = -d.y * away.x + d.x * away.y >= 0 ? 1 : -1;
        const px = -d.y * side;
        const py = d.x * side;
        d = normalize(d.x + px * 0.9, d.y + py * 0.9);
      }
    }
    // Keep away from the touchlines
    if (p.y < PITCH_TOP + 40) d = normalize(d.x, d.y + 0.6);
    if (p.y > PITCH_BOTTOM - 40) d = normalize(d.x, d.y - 0.6);
    // Never dribble backward toward own goal for long
    if (d.x * dir < -0.2) d = normalize(dir * 0.3, d.y);

    p.moveToward(p.x + d.x * 50, p.y + d.y * 50, oppDist < 90 && p.stamina > 0.3, dt);
  }

  /** Pass (or lob if the lane is blocked) to the best teammate. Returns true if done. */
  private tryPass(p: Player, minScore: number): boolean {
    const target = this.bestPassTarget(p);
    if (!target || target.score < minScore) return false;
    const opponents = this.world.teams[1 - p.teamIndex];
    const clear = laneClearance(p.x, p.y, target.player.x, target.player.y, opponents);
    if (clear < 18 && target.dist > 120) this.actions.lobTo(p, target.player);
    else this.actions.passTo(p, target.player);
    // The passer keeps joining the attack (MatchScene starts the support run)
    if (!p.hasBall) this.onFieldPass?.(p);
    return true;
  }

  private bestPassTarget(p: Player): { player: Player; score: number; dist: number } | null {
    const team = p.teamIndex;
    const dir = attackDir(team);
    const opponents = this.world.teams[1 - team];
    let best: { player: Player; score: number; dist: number } | null = null;

    for (const t of this.world.teams[team]) {
      if (t === p || t.role === 'goalkeeper') continue;
      const dist = p.distanceTo(t.x, t.y);
      if (dist < 50 || dist > 380) continue;
      const forwardness = (t.x - p.x) * dir;
      let openness = Infinity;
      for (const o of opponents) openness = Math.min(openness, t.distanceTo(o.x, o.y));
      const lane = laneClearance(p.x, p.y, t.x, t.y, opponents);
      const score = forwardness * 0.5 + Math.min(openness, 120) * 0.6 - dist * 0.1 - (lane < 18 ? 80 : 0);
      if (!best || score > best.score) best = { player: t, score, dist };
    }
    return best;
  }

  // ------------------------------------------------------------ goalkeeper

  private updateGoalkeeper(gk: Player, dt: number, profile: AIProfile): void {
    const ball = this.world.ball;
    const team = gk.teamIndex;
    const lineX = ownGoalX(team);
    const out = attackDir(team);

    if (gk.hasBall) {
      gk.decelerate(dt);
      gk.faceToward(PITCH_CX, PITCH_CY);
      if (gk.possessionTime > GOALKEEPER.holdTime && gk.canKick()) {
        const target = this.bestPassTarget(gk);
        if (target && target.dist < 260 && target.score > 0) this.actions.passTo(gk, target.player);
        else if (target) this.actions.lobTo(gk, target.player);
        else this.actions.lob(gk, out, (Math.random() - 0.5) * 0.6);
      }
      return;
    }

    const area = gk.getGoalkeeperArea();
    let tx: number;
    let ty: number;
    let sprint = false;

    // Predict the real path (friction + touchline bounces). The keeper only
    // reacts to a new kick after his reaction time (depends on difficulty).
    const crossing = ball.isFree ? predictBallCrossing(ball.x, ball.y, ball.vx, ball.vy, lineX) : null;
    const reacted = ball.kickAgeMs >= profile.gkReactionMs;
    const incoming = reacted && crossing !== null && Math.abs(ball.vx) > 120
      && crossing > GOAL_TOP - 20 && crossing < GOAL_BOTTOM + 20;
    const ballDist = gk.distanceTo(ball.x, ball.y);

    if (incoming && crossing !== null) {
      // Shot on goal: get across to where it will cross the line
      ty = clamp(crossing, GOAL_TOP + 6, GOAL_BOTTOM - 6);
      tx = lineX + out * 12;
      sprint = true;
      if (ballDist < 120 && Math.abs(ty - gk.y) > 12 && gk.currentPose !== 'dive') {
        gk.setPose('dive', GOALKEEPER.diveDuration, Math.sign(ty - gk.y));
      }
    } else if (
      ball.isFree && ball.getSpeed() < 220 && ball.z < GOALKEEPER.reachHeight
      && Math.abs(ball.x - lineX) < GOALKEEPER.boxDepth + 10
      && ball.y > area.minY && ball.y < area.maxY
      && ballDist < GOALKEEPER.rushDistance
    ) {
      // Loose ball in the box: claim it
      tx = ball.x;
      ty = ball.y;
      sprint = true;
    } else {
      // Stay on the line between ball and goal centre, coming out a little
      const v = normalize(ball.x - lineX, ball.y - PITCH_CY);
      const depth = clamp(v.len * 0.12, 10, 34);
      tx = lineX + Math.abs(v.x) * depth * out;
      ty = clamp(PITCH_CY + v.y * depth * 2.2, GOAL_TOP + 8, GOAL_BOTTOM - 8);
    }

    // Keepers react a little slower on easier difficulties
    gk.speedFactor = 0.85 + profile.gkSaveChance * 0.3;
    if (gk.distanceTo(tx, ty) > 3) gk.moveToward(tx, ty, sprint, dt);
    else {
      gk.decelerate(dt);
      gk.faceToward(ball.x, ball.y);
    }
  }

  /**
   * How a pressing defender reads the carrier's direction (feints). With
   * feintReactionMs = 0 he sees it perfectly every frame (hard, teammates).
   * Otherwise he re-reads it only every feintReactionMs; a sharp turn since
   * the last read fools him with chance feintBite, and he keeps following the
   * old direction for feintCommitMs.
   */
  private readCarrier(p: Player, carrier: Player, dt: number, profile: AIProfile): { vx: number; vy: number; fooled: boolean } {
    const m = this.mind(p);
    if (profile.feintReactionMs <= 0) {
      m.seenVx = carrier.vx;
      m.seenVy = carrier.vy;
      return { vx: carrier.vx, vy: carrier.vy, fooled: false };
    }
    const ms = dt * 1000;
    if (this.clockMs - m.lastReadAt > 300) {
      // Just started pressing: read the carrier as he is now
      m.seenVx = carrier.vx;
      m.seenVy = carrier.vy;
      m.readMs = profile.feintReactionMs;
      m.fooledMs = 0;
    }
    m.lastReadAt = this.clockMs;
    m.fooledMs = Math.max(0, m.fooledMs - ms);
    m.readMs -= ms;
    if (m.fooledMs <= 0 && m.readMs <= 0) {
      m.readMs = profile.feintReactionMs;
      const now = Math.hypot(carrier.vx, carrier.vy);
      const seen = Math.hypot(m.seenVx, m.seenVy);
      const turned = now > 50 && seen > 50
        && (carrier.vx * m.seenVx + carrier.vy * m.seenVy) / (now * seen) < 0.3;
      if (turned && Math.random() < profile.feintBite) {
        m.fooledMs = profile.feintCommitMs;
        this.feintBites++;
      } else {
        m.seenVx = carrier.vx;
        m.seenVy = carrier.vy;
      }
    }
    return { vx: m.seenVx, vy: m.seenVy, fooled: m.fooledMs > 0 };
  }

  private mind(p: Player): Mind {
    let m = this.minds.get(p.id);
    if (!m) {
      m = {
        timer: 0, tx: p.homeX, ty: p.homeY, sprint: false, thinkTimer: 0, seenVx: 0, seenVy: 0, readMs: 0, fooledMs: 0, lastReadAt: -1e9, aerialKick: -1,
      };
      this.minds.set(p.id, m);
    }
    return m;
  }
}
