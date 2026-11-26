// ============================================================
// MatchSimulation — One whole match without any rendering: builds
// the world, runs the per-frame pipeline (human input → AI →
// movement → collisions → ball → goal check), the match flow
// (kickoffs, half time, change of ends, extra time, goals with slow
// motion) and formation changes. It is fed only the elapsed real
// time and each human's RawInput, and reports what happened as
// MatchWorld.events. Same seed + same inputs = same match.
//
// The client (MatchScene) draws the world, plays sounds and shows
// banners from the events; a network host could run this directly.
// ============================================================

import {
  AIProfile, FORMATIONS, FormationId, MATCH, PLAYER, ROLE_TRAITS,
} from './config/GameplayConfig';
import { Ball } from './entities/Ball';
import { Player } from './entities/Player';
import { HumanControl, HumanOptions } from './HumanControl';
import { createStats, MatchWorld } from './logic/MatchWorld';
import {
  PITCH_CX, PITCH_CY, attackDir, formationPosition, kickoffPositions, kickoffTakerIndex, ownGoalX, setSidesSwapped,
  teamDefendingSide,
} from './logic/PitchGeometry';
import type { MatchEvent, Telemetry } from './MatchEvents';
import { Rng } from './Rng';
import { ActionSystem } from './systems/ActionSystem';
import { AISystem } from './systems/AISystem';
import { CollisionSystem } from './systems/CollisionSystem';
import { EMPTY_RAW, RawInput } from './systems/InputTypes';
import { MatchState, MatchSystem } from './systems/MatchSystem';

export interface MatchOptions {
  /** Seed for every random decision in the match. */
  seed: number;
  /** Real minutes for the 90-minute clock. */
  minutes: number;
  /** Cup match: a draw goes to extra time and a golden goal. */
  mustHaveWinner: boolean;
  formations: [FormationId, FormationId];
  /** AI profile per team (the CPU difficulty, or TEAMMATE_PROFILE for a human team). */
  profiles: [AIProfile, AIProfile];
  /** The humans, in player order (P1 first). */
  humans: HumanOptions[];
  /** Game speed: world time per real time (1 = normal). */
  speedScale: number;
  /** Test metrics (headless simulation test only). */
  telemetry?: Telemetry | null;
}

export class MatchSimulation {
  readonly world: MatchWorld;
  readonly ball: Ball;
  readonly match: MatchSystem;
  readonly actions: ActionSystem;
  readonly collisions: CollisionSystem;
  readonly ai: AISystem;
  readonly humans: HumanControl[];
  /** Formation of each team (can change mid-match). */
  readonly formations: [FormationId, FormationId];

  private readonly profiles: [AIProfile, AIProfile];
  private readonly speedScale: number;
  private readonly telemetry: Telemetry | null;
  private lastState: MatchState = 'kickoff';
  /** Goal waiting for its celebration while the slow motion runs. */
  private pendingGoal: { team: number; ownGoal: boolean } | null = null;
  private slowMoMs = 0;
  private goldenGoalReported = false;
  /** Game-time delayed checks (test metrics). */
  private timers: Array<{ leftMs: number; run: () => void }> = [];
  private metricsMs = 0;
  /** Game time of the last step (seconds; slowed in the goal slow motion, 0 while paused): for animations. */
  lastDt = 0;

  constructor(opts: MatchOptions) {
    // First half: team 0 attacks right
    setSidesSwapped(false);
    this.profiles = opts.profiles;
    this.speedScale = opts.speedScale;
    this.telemetry = opts.telemetry ?? null;
    this.formations = [...opts.formations];
    const rng = new Rng(opts.seed);

    this.ball = new Ball(PITCH_CX, PITCH_CY);
    const teams: [Player[], Player[]] = [[], []];
    for (let t = 0; t < 2; t++) {
      FORMATIONS[this.formations[t]].forEach((pos, i) => {
        const home = formationPosition(t, pos);
        teams[t].push(new Player(t * 10 + i, t, pos, home.x, home.y));
      });
    }
    this.world = {
      ball: this.ball,
      players: [...teams[0], ...teams[1]],
      teams,
      controlled: [[], []],
      stats: createStats(),
      rng,
      events: [],
    };

    this.match = new MatchSystem(opts.minutes, rng.int(2), opts.mustHaveWinner);
    this.actions = new ActionSystem(this.world);
    this.ai = new AISystem(this.world, this.actions);
    this.ai.onFieldPass = (passer) => this.startSupportRun(passer, 'ai');
    this.collisions = new CollisionSystem(this.world, {
      onPossession: (p, prev) => this.onPossession(p, prev),
      onSave: (gk) => {
        this.world.stats.onTarget[1 - gk.teamIndex]++;
        this.telemetry?.event('save');
      },
      onTackle: () => this.telemetry?.event('tackle'),
    });
    this.collisions.gkSaveChance = [this.profiles[0].gkSaveChance, this.profiles[1].gkSaveChance];
    this.collisions.tackleSuccess = [this.profiles[0].tackleSuccess, this.profiles[1].tackleSuccess];

    this.humans = opts.humans.map((h) => new HumanControl({
      world: this.world,
      actions: this.actions,
      telemetry: this.telemetry,
      startSupportRun: (p) => this.startSupportRun(p, 'human'),
    }, h));

    this.resetPositions();
    this.match.startKickoff();
  }

  get state(): MatchState {
    return this.match.state;
  }

  /** Events since the last call (sounds, state changes, goals...). */
  drainEvents(): MatchEvent[] {
    const events = this.world.events;
    this.world.events = [];
    return events;
  }

  // ================================================================ frame

  /**
   * Advance one frame.
   * @param realMs real time since the last frame (already clamped by the caller)
   * @param inputs each human's raw input this frame, in player order
   */
  step(realMs: number, inputs: readonly RawInput[]): void {
    this.humans.forEach((h, i) => h.setRaw(inputs[i] ?? EMPTY_RAW));

    // Game speed scales the world; the match clock and timers stay in real time
    let dt = (realMs / 1000) * this.speedScale;
    // Goal slow motion: the world runs slower and the match timers wait
    // (the celebration starts only after it)
    let matchMs = realMs;
    if (this.pendingGoal) {
      this.slowMoMs -= realMs;
      if (this.slowMoMs <= 0) this.endGoalSlowMo(false);
      else {
        dt *= MATCH.goalSlowMoScale;
        matchMs = 0;
      }
    }
    const state = this.match.update(matchMs);
    this.lastDt = state === 'paused' ? 0 : dt;
    if (state !== this.lastState) {
      const from = this.lastState;
      this.lastState = state;
      this.onStateChange(from, state);
    }

    switch (state) {
      case 'playing':
        this.simulate(dt, realMs);
        // Still level after extra time: the next goal wins
        if (this.match.data.goldenGoal && !this.goldenGoalReported) {
          this.goldenGoalReported = true;
          this.telemetry?.event('goldenGoal');
          this.world.events.push({ type: 'goldenGoal' });
        }
        break;
      case 'goal_scored':
        for (const p of this.world.players) p.updateIdle(dt);
        this.ball.update(dt);
        break;
      case 'kickoff':
      case 'halftime':
      case 'extratime':
      case 'fulltime':
        for (const p of this.world.players) p.updateIdle(dt);
        this.collisions.placeCarriedBall();
        break;
      case 'paused':
        break;
    }
  }

  private simulate(dt: number, inputMs: number): void {
    for (const h of this.humans) h.update(dt, inputMs);
    if (this.telemetry && this.humans.length === 2 && this.humans[0].team === this.humans[1].team) {
      // Test check: the two co-op humans never steer the same player
      const [a, b] = this.humans;
      if (a.controlled && a.controlled === b.controlled) this.telemetry.event('coopSamePlayer');
    }

    for (let t = 0; t < 2; t++) {
      this.ai.updateTeam(t, dt, this.profiles[t], this.world.controlled[t]);
    }
    for (const p of this.world.players) p.update(dt);
    this.collisions.update(dt);
    this.ball.update(dt, (strength) => {
      if (strength > 0.2) this.world.events.push({ type: 'sound', cue: 'bounce' });
    });

    const side = this.ball.checkGoal();
    // The team defending that goal concedes (sides change at half time)
    if (side >= 0) this.onGoal(1 - teamDefendingSide(side));

    this.tickTimers(dt * 1000);
    if (this.telemetry) {
      this.sampleMetrics(dt);
      // Test check: nobody may move faster than his sprint speed outside a tackle
      // dash (stunned players may still carry a decaying dash from a missed tackle)
      for (const p of this.world.players) {
        if (p.isTackling || p.isStunned) continue;
        const limit = PLAYER.sprintSpeed * Math.max(1, p.speedFactor) * ROLE_TRAITS[p.role].speed * 1.1 + 5;
        if (p.getSpeed() > limit) {
          this.telemetry.event('overspeed');
          this.telemetry.max('maxSpeed', Math.round(p.getSpeed()));
        }
      }
    }
  }

  private tickTimers(ms: number): void {
    if (this.timers.length === 0) return;
    const due = this.timers.filter((t) => (t.leftMs -= ms) <= 0);
    this.timers = this.timers.filter((t) => t.leftMs > 0);
    for (const t of due) t.run();
  }

  /** Test metrics, sampled every 0.5 s of game time: team spacing and player contacts. */
  private sampleMetrics(dt: number): void {
    const tel = this.telemetry!;
    this.metricsMs += dt * 1000;
    if (this.metricsMs < 500) return;
    this.metricsMs = 0;
    for (const team of this.world.teams) {
      const field = team.filter((q) => q.role !== 'goalkeeper');
      // Defensive cover: are all of this team's defenders in the opponent's half?
      const dir = attackDir(team[0].teamIndex);
      const defenders = field.filter((q) => q.role === 'defender');
      if (defenders.length > 0 && defenders.every((q) => (q.x - PITCH_CX) * dir > 20)) tel.event('backLineEmpty');
      for (const a of field) {
        let nearest = Infinity;
        for (const b of field) if (a !== b) nearest = Math.min(nearest, a.distanceTo(b.x, b.y));
        tel.add('spacingSum', Math.round(nearest));
        tel.event('spacingN');
        if (nearest < 40) tel.event('clumpPlayers');
      }
    }
    const ps = this.world.players;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        if (ps[i].distanceTo(ps[j].x, ps[j].y) < PLAYER.separationDistance + 0.5) tel.event('contactPairs');
      }
    }
  }

  /**
   * After a pass, the passer keeps joining the attack (see AISystem.supportRun).
   * Used for human passes and for AI passes (via AISystem.onFieldPass).
   */
  private startSupportRun(passer: Player, by: 'human' | 'ai'): void {
    if (passer.hasBall || passer.role === 'goalkeeper') return; // pass didn't happen / keeper
    passer.supportRunTimer = PLAYER.supportRunMax;
    // Only one defender joins the attack at a time: the others go back to the back line
    if (passer.role === 'defender') {
      for (const q of this.world.teams[passer.teamIndex]) {
        if (q !== passer && q.role === 'defender') q.supportRunTimer = 0;
      }
    }
    if (this.telemetry) {
      // Test metric: 1 s later, has the passer moved forward (while his team still has the ball)?
      const x0 = passer.x;
      const team = passer.teamIndex;
      const prefix = by === 'ai' ? 'aiPasser' : 'passer';
      this.timers.push({
        leftMs: 1000,
        run: () => {
          const b = this.ball;
          const stillOurs = b.ownerTeam === team || (b.isFree && b.lastTouchTeam === team);
          if (!stillOurs || this.match.state !== 'playing') return;
          const moved = (passer.x - x0) * attackDir(team);
          this.telemetry?.event(moved >= 0 ? `${prefix}Forward` : `${prefix}Back`);
          this.telemetry?.add(`${prefix}MovedPx`, Math.round(moved));
        },
      });
    }
  }

  private onPossession(p: Player, previousTeam: number | null): void {
    this.telemetry?.event('possession');
    const taker = this.ballTaker(p);
    for (const h of this.humans) h.onPossession(p, previousTeam, h === taker);
  }

  /**
   * Which human takes over a player of his team who just gained the ball.
   * With one human on that team it is him. In co-op: whoever already steers
   * that player; for the keeper the human whose player is nearer our goal;
   * otherwise the human whose player is nearer the new carrier.
   */
  private ballTaker(p: Player): HumanControl | null {
    const mine = this.humans.filter((h) => h.team === p.teamIndex);
    if (mine.length <= 1) return mine[0] ?? null;
    const steering = mine.find((h) => h.controlled === p);
    if (steering) return steering;
    const ref = p.role === 'goalkeeper' ? { x: ownGoalX(p.teamIndex), y: PITCH_CY } : p;
    let best: HumanControl | null = null;
    let bestD = Infinity;
    for (const h of mine) {
      const d = h.controlled ? h.controlled.distanceTo(ref.x, ref.y) : Infinity;
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    if (p.role === 'goalkeeper') this.telemetry?.event(`coopKeeper${best === mine[0] ? 'P1' : 'P2'}`);
    return best ?? mine[0];
  }

  // ========================================================== match flow

  private onStateChange(from: MatchState, to: MatchState): void {
    // Pausing/resuming is not a real transition
    if (from === 'paused' || to === 'paused') return;
    this.telemetry?.state(to);

    if (to === 'kickoff') {
      if (from === 'halftime') this.changeEnds();
      // Everyone gets their breath back for the restart after a goal, half time or before extra time
      if (from === 'goal_scored' || from === 'halftime' || from === 'extratime') {
        for (const q of this.world.players) q.stamina = 1;
      }
      this.resetPositions();
      if (from === 'halftime' && this.telemetry) {
        // Test check: everyone lines up in their (new) own half, team 0's keeper on the right
        const inOwnHalf = this.world.players.every((q) => (q.x - PITCH_CX) * attackDir(q.teamIndex) <= 0);
        const keeper0Right = this.world.teams[0][0].x > PITCH_CX;
        this.telemetry.event(inOwnHalf && keeper0Right ? 'swapOk' : 'swapWrong');
      }
    } else if (to === 'extratime') {
      this.telemetry?.event('extraTime');
    } else if (to === 'fulltime') {
      for (const h of this.humans) h.chargeKind = null;
    }
    this.world.events.push({ type: 'state', from, to });
  }

  private onGoal(scoringTeam: number): void {
    const ball = this.ball;
    const ownGoal = ball.lastTouchTeam !== null && ball.lastTouchTeam !== scoringTeam;
    this.match.scoreGoal(scoringTeam);
    this.lastState = 'goal_scored';
    this.telemetry?.goal(scoringTeam, this.match.data.time);
    if (!ownGoal) this.world.stats.onTarget[scoringTeam]++;
    else if (this.humans.some((h) => h.team === 1 - scoringTeam)) {
      const kicker = this.world.players.find((q) => q.id === ball.lastKickerId);
      if (kicker?.role === 'goalkeeper') this.telemetry?.event('humanKeeperOwnGoal');
    }
    for (const h of this.humans) h.chargeKind = null;

    // Slow motion first; the celebration follows in endGoalSlowMo()
    this.pendingGoal = { team: scoringTeam, ownGoal };
    this.slowMoMs = MATCH.goalSlowMoMs;
    this.world.events.push({ type: 'goal', team: scoringTeam, ownGoal, x: ball.x, y: ball.y });
  }

  /**
   * Ends the goal slow motion and starts the celebration.
   * @param instant cut short (pausing) instead of running out
   */
  private endGoalSlowMo(instant: boolean): void {
    const goal = this.pendingGoal;
    if (!goal) return;
    this.pendingGoal = null;
    this.slowMoMs = 0;
    for (const p of this.world.teams[goal.team]) p.setPose('celebrate', MATCH.goalCelebrationDuration);
    this.world.events.push({
      type: 'celebrate', team: goal.team, ownGoal: goal.ownGoal, x: this.ball.x, y: this.ball.y, instant,
    });
  }

  /** Second half: teams swap ends; formation homes are mirrored accordingly. */
  private changeEnds(): void {
    setSidesSwapped(true);
    for (const p of this.world.players) {
      const home = formationPosition(p.teamIndex, p.formation);
      p.homeX = home.x;
      p.homeY = home.y;
    }
    this.telemetry?.event('sidesSwapped');
  }

  /**
   * Switch a team to another formation mid-match: each player keeps his index
   * and takes over that slot's role and home position.
   */
  changeFormation(team: number, id: FormationId): void {
    if (this.formations[team] === id) return;
    this.formations[team] = id;
    const slots = FORMATIONS[id];
    this.world.teams[team].forEach((p, i) => p.setFormationSlot(slots[i], formationPosition(team, slots[i])));
    this.ai.reset(); // re-think shape positions right away
    this.telemetry?.event('formationChanged');
  }

  private resetPositions(): void {
    const kickoffTeam = this.match.data.kickoffTeam;
    for (let t = 0; t < 2; t++) {
      const positions = kickoffPositions(t, t === kickoffTeam, FORMATIONS[this.formations[t]]);
      this.world.teams[t].forEach((p, i) => p.placeAt(positions[i].x, positions[i].y));
    }

    this.ball.reset(PITCH_CX, PITCH_CY);
    const taker = this.world.teams[kickoffTeam][kickoffTakerIndex(FORMATIONS[this.formations[kickoffTeam]])];
    if (taker) {
      taker.gainPossession(800);
      this.ball.setOwner(taker.id, kickoffTeam);
      this.collisions.placeCarriedBall();
    }
    this.ai.reset();

    // Each human starts on his team's kickoff taker / most central forward;
    // in co-op the second human takes the forward nearest to him
    for (const h of this.humans) h.release();
    for (const h of this.humans) h.resetForKickoff(this.kickoffStartFor(h.team));
  }

  /** Free (not human-steered) player a human starts a kickoff on. */
  private kickoffStartFor(team: number): Player {
    const mates = this.world.teams[team];
    const central = mates[kickoffTakerIndex(FORMATIONS[this.formations[team]])];
    const taken = this.world.controlled[team];
    if (!taken.includes(central)) return central;
    const free = mates.filter((q) => q.role !== 'goalkeeper' && !taken.includes(q));
    const rank = (q: Player) => (q.role === 'forward' ? 0 : 10000) + q.distanceTo(central.x, central.y);
    free.sort((a, b) => rank(a) - rank(b));
    return free[0] ?? central;
  }

  // ================================================================ pause

  isPaused(): boolean {
    return this.match.isPaused();
  }

  /** Returns false if the match can't be paused now (full time / already paused). */
  pause(): boolean {
    const st = this.match.state;
    if (st === 'fulltime' || st === 'paused') return false;
    this.endGoalSlowMo(true);
    this.match.pause();
    this.lastState = 'paused';
    return true;
  }

  /** @param inputs what each human holds now: those keys need a fresh press. */
  resume(inputs: readonly RawInput[]): void {
    if (!this.match.isPaused()) return;
    this.match.resume();
    this.lastState = this.match.state;
    this.humans.forEach((h, i) => {
      h.setRaw(inputs[i] ?? EMPTY_RAW);
      h.syncInput();
    });
  }
}
