// ============================================================
// HumanControl — Everything one human player does with his team
// (core, no rendering): steering the controlled player, charged
// pass / shot / lob, tackles, player switching, keeper control and
// headers / volleys. It only sees RawInput, one per frame, so the
// input can come from a keyboard, a pad, a test bot or the network.
// One instance per human: one in Quick Match, two in 2-player mode
// (on opposite teams in versus, on the same team in co-op).
// The client's HumanHud draws the hints from this state.
// ============================================================

import { BALL, GOALKEEPER } from './config/GameplayConfig';
import type { Player } from './entities/Player';
import { predictAerialContact, timingQuality } from './logic/Aerial';
import { ballOwner, MatchWorld } from './logic/MatchWorld';
import { attackDir } from './logic/PitchGeometry';
import { pickPlayerForBall, pickPlayerInDirection } from './logic/PlayerSelection';
import type { Telemetry } from './MatchEvents';
import type { ActionSystem } from './systems/ActionSystem';
import { InputTracker } from './systems/InputTracker';
import { EMPTY_RAW, RawInput } from './systems/InputTypes';

export type ChargeKind = 'pass' | 'shoot' | 'lob';
/** Which human: P1 (yellow marker) or P2 (green). */
export type HumanMarker = 'p1' | 'p2';
/** Aim assist for a human action. */
export type AssistMode = 'auto' | 'manual';

export interface HumanOptions {
  team: number;
  marker: HumanMarker;
  /** Ground passes: 'auto' aims at a teammate, 'manual' goes exactly along the input. */
  passAssist: AssistMode;
  /** Lobs: 'manual' lands where the charge says, 'auto' aims at a teammate. */
  lobAssist: AssistMode;
}

/** What a HumanControl needs from the match. */
export interface HumanContext {
  world: MatchWorld;
  actions: ActionSystem;
  telemetry: Telemetry | null;
  /** The passer keeps joining the attack after a pass. */
  startSupportRun(passer: Player): void;
}

export interface PendingAerial {
  kind: 'shot' | 'pass';
  quality: number;
  kickId: number;
  player: Player;
  deadlineMs: number;
}

export class HumanControl {
  readonly team: number;
  readonly marker: HumanMarker;
  /** What is currently charging (hold pass / shoot / lob). */
  chargeKind: ChargeKind | null = null;
  chargeMs = 0;
  /** Direction held this frame (for the hint arrows). */
  heldDir = { x: 0, y: 0 };
  /** Header / volley waiting for the ball to arrive (see updateAerial). */
  pendingAerial: PendingAerial | null = null;
  readonly input = new InputTracker();
  /** The latest raw input, also while play is stopped (for sync). */
  private raw: RawInput = { ...EMPTY_RAW };
  /** Match time seen by this controller (ms), for the aerial deadline. */
  private clockMs = 0;
  /** The player this human steers (null only before the first kickoff). */
  private current: Player | null = null;

  constructor(private readonly ctx: HumanContext, readonly options: HumanOptions) {
    this.team = options.team;
    this.marker = options.marker;
  }

  get controlled(): Player | null {
    return this.current;
  }

  /** Telemetry suffix for this human: 'P1' or 'P2'. */
  private get tag(): string {
    return this.marker.toUpperCase();
  }

  private event(name: string): void {
    this.ctx.telemetry?.event(name);
  }

  /** Is `p` steered by another human (the co-op partner)? */
  private isPartners(p: Player): boolean {
    return p !== this.current && this.ctx.world.controlled[this.team].includes(p);
  }

  /** This frame's raw input (every frame, also while play is stopped). */
  setRaw(raw: RawInput): void {
    this.raw = { ...raw };
  }

  /** Treat everything currently held as already handled (needs a fresh press). */
  syncInput(): void {
    this.input.sync(this.raw);
  }

  // ============================================================ per frame

  /**
   * @param dt game time (seconds; scaled by the game speed)
   * @param inputMs real time for the input (key charge always takes the same real time)
   */
  update(dt: number, inputMs = dt * 1000): void {
    const { actions } = this.ctx;
    const input = this.input.update(this.raw, inputMs);
    this.clockMs += dt * 1000;
    this.heldDir = { x: input.moveX, y: input.moveY };
    // No switching while our player has the ball (W / pad LB do nothing then)
    if (input.switchPressed && !this.controlled?.hasBall) this.switchPlayer(false, input.moveX, input.moveY);

    // The human only controls the keeper while he holds the ball
    if (this.controlled?.role === 'goalkeeper' && !this.controlled.hasBall) this.switchPlayer(false);

    const p = this.controlled;
    if (!p) return;

    // Don't let the game stall if the player never releases the keeper's ball
    if (p.role === 'goalkeeper' && p.hasBall && p.possessionTime > GOALKEEPER.humanHoldMax && p.canKick()) {
      this.input.consumeShoot();
      const receiver = actions.lob(p, attackDir(p.teamIndex), 0);
      if (receiver) this.setControlled(receiver);
      else this.switchPlayer(false);
      return;
    }

    p.steer(input.moveX, input.moveY, input.sprint, dt);
    const hasDir = input.moveX !== 0 || input.moveY !== 0;
    const dirX = hasDir ? input.moveX : 0;
    const dirY = hasDir ? input.moveY : 0;

    if (p.hasBall) {
      // Pass, shot and lob are all "hold to charge, release to play".
      // Only one charges at a time; the first key held wins.
      const held = { pass: input.passHeld, shoot: input.shootHeld, lob: input.lobHeld };
      const heldMs = { pass: input.passHeldMs, shoot: input.shootHeldMs, lob: input.lobHeldMs };
      const released = { pass: input.passReleased, shoot: input.shootReleased, lob: input.lobReleased };
      if (this.chargeKind === null) {
        this.chargeKind = held.pass ? 'pass' : held.shoot ? 'shoot' : held.lob ? 'lob' : null;
      }
      const kind = this.chargeKind;
      if (kind && held[kind]) {
        this.chargeMs = heldMs[kind];
        if (this.chargeMs >= BALL.maxChargeMs) {
          this.fireCharged(p, kind, 1, input.moveY, dirX, dirY);
          this.consumeCharge(kind);
        }
      } else if (kind && released[kind]) {
        this.fireCharged(p, kind, this.chargeMs / BALL.maxChargeMs, input.moveY, dirX, dirY);
      } else {
        this.chargeKind = null;
      }
    } else {
      this.chargeKind = null;
      // Header / volley: D or S pressed while the ball comes in the air
      if (this.updateAerial(p, input.shootPressed, input.passPressed, input.moveY, dirX, dirY)) return;
      // Without the ball the lob button tackles (keyboard A, pad X)
      if (input.lobPressed) {
        if (actions.tackle(p)) this.event('humanTackle');
        this.input.consumeLob();
      }
      // Shoot without the ball does nothing; don't let the hold carry over into possession
      if (input.shootPressed) this.input.consumeShoot();
      if (input.passPressed) {
        this.input.consumePass(); // pass key here means "switch", not a pass to charge later
        this.switchPlayer(true, dirX, dirY);
      }
    }
  }

  /**
   * Headers and volleys. A press of D (shot) or S (pass) while a free ball
   * will come into reach at head or knee height within AERIAL.pressWindowSec
   * is remembered; the strike happens when the ball arrives. Timing quality
   * comes from how early the press was. Returns true if the press was used
   * for that (so S does not also switch player).
   */
  private updateAerial(
    p: Player, shootPressed: boolean, passPressed: boolean, aimY: number, dirX: number, dirY: number,
  ): boolean {
    const { world, actions } = this.ctx;
    const ball = world.ball;
    let used = false;
    if ((shootPressed || passPressed) && ball.isFree && p.role !== 'goalkeeper') {
      const contact = predictAerialContact(ball, p);
      if (contact) {
        this.pendingAerial = {
          kind: shootPressed ? 'shot' : 'pass',
          quality: timingQuality(contact.t),
          kickId: ball.kickId,
          player: p,
          deadlineMs: this.clockMs + contact.t * 1000 + 200,
        };
        if (shootPressed) this.input.consumeShoot();
        if (passPressed) this.input.consumePass();
        used = true;
      }
    }

    const pending = this.pendingAerial;
    if (!pending) return used;
    if (pending.player !== p || ball.kickId !== pending.kickId || !ball.isFree || this.clockMs > pending.deadlineMs) {
      this.pendingAerial = null; // swung and missed, or the moment is gone
      return used;
    }
    const zone = actions.aerial(p, pending.kind, pending.quality, aimY, dirX, dirY, 0.85);
    if (zone) {
      this.pendingAerial = null;
      this.event(zone === 'header' ? 'humanHeader' : 'humanVolley');
      if (pending.kind === 'pass') {
        this.ctx.startSupportRun(p);
        const receiver = world.teams[this.team].find((q) => q.id === ball.passTargetId);
        if (receiver) this.setControlled(receiver);
      }
    }
    return true;
  }

  private fireCharged(p: Player, kind: ChargeKind, charge: number, aimY: number, dirX: number, dirY: number): void {
    if (kind === 'pass') this.firePass(p, charge, dirX, dirY);
    else if (kind === 'shoot') this.fireShot(p, charge, aimY, dirX, dirY);
    else this.fireLob(p, charge, dirX, dirY);
  }

  private consumeCharge(kind: ChargeKind): void {
    if (kind === 'pass') this.input.consumePass();
    else if (kind === 'shoot') this.input.consumeShoot();
    else this.input.consumeLob();
  }

  private firePass(p: Player, charge: number, dirX: number, dirY: number): void {
    this.chargeKind = null;
    const assisted = this.options.passAssist === 'auto';
    const receiver = this.ctx.actions.pass(p, dirX, dirY, clamp01(charge), assisted);
    this.event('humanPass');
    this.event(`humanPassTeam${this.team}`);
    this.event(`humanPass${this.tag}`);
    this.ctx.startSupportRun(p);
    if (receiver) this.setControlled(receiver);
  }

  private fireLob(p: Player, charge: number, dirX: number, dirY: number): void {
    this.chargeKind = null;
    const power = clamp01(charge);
    // LOB: AUTO aims at a teammate like the AI's lob (the charge doesn't matter then)
    const receiver = this.options.lobAssist === 'auto'
      ? this.ctx.actions.lob(p, dirX, dirY)
      : this.ctx.actions.lobToSpot(p, dirX, dirY, power);
    this.event('humanLob');
    this.event(power >= 0.99 ? 'humanLobFull' : power < 0.33 ? 'humanLobWeak' : 'humanLobMid');
    this.ctx.startSupportRun(p);
    if (receiver) this.setControlled(receiver);
  }

  private fireShot(p: Player, charge: number, aimY: number, dirX: number, dirY: number): void {
    this.chargeKind = null;
    const power = 0.2 + 0.8 * clamp01(charge);
    this.ctx.actions.shoot(p, power, aimY, dirX, dirY, 0.85);
    this.event('humanShot');
    this.event(`humanShotTeam${this.team}`);
    this.event(`humanShot${this.tag}`);
  }

  // ======================================================= player switch

  /**
   * Switch player. With a direction held it picks the teammate in that
   * direction from the current player; otherwise the best player for the
   * situation (pass receiver, goal-side defender, or whoever reaches a loose
   * ball first). See logic/PlayerSelection.ts.
   */
  switchPlayer(includeCurrent: boolean, dirX = 0, dirY = 0): void {
    this.event(dirX !== 0 || dirY !== 0 ? 'switchDirectional' : 'switch');
    const target = this.switchTarget(includeCurrent, dirX, dirY);
    if (target) this.setControlled(target);
    // Test metric: how far the selected player is from the opponent's ball carrier
    const t = this.ctx.telemetry;
    const carrier = ballOwner(this.ctx.world);
    if (t && target && carrier && carrier.teamIndex !== this.team && carrier.role !== 'goalkeeper') {
      t.add('defSwitchDist', Math.round(target.distanceTo(carrier.x, carrier.y)));
      t.event('defSwitchN');
    }
  }

  /** Who switchPlayer() would select right now (no side effects). */
  switchTarget(includeCurrent: boolean, dirX = 0, dirY = 0): Player | null {
    const { world } = this.ctx;
    const ball = world.ball;
    const current = this.controlled;
    // Never the co-op partner's player
    const mates = world.teams[this.team].filter((q) => !this.isPartners(q));

    // Explicit direction wins
    if (current && (dirX !== 0 || dirY !== 0)) {
      const inDirection = pickPlayerInDirection(mates, current, dirX, dirY, current);
      if (inDirection) return inDirection;
    }

    const receiver = ball.isFree ? mates.find((p) => p.id === ball.passTargetId) : undefined;
    if (receiver && receiver !== current) return receiver;

    const carrier = ballOwner(world);
    const opponentCarrier = carrier && carrier.teamIndex !== this.team ? carrier : null;
    // Never stay on a goalkeeper who no longer has the ball
    const exclude = includeCurrent && current?.role !== 'goalkeeper' ? null : current;
    return pickPlayerForBall(mates, this.team, ball, opponentCarrier, exclude);
  }

  /**
   * Take control of `p`. Does nothing if the co-op partner steers him (e.g. a
   * pass to the partner's player: the partner receives, we keep ours).
   */
  setControlled(p: Player): void {
    const current = this.controlled;
    if (current === p || this.isPartners(p)) return;
    this.release();
    this.current = p;
    this.ctx.world.controlled[this.team].push(p);
    this.chargeKind = null;
  }

  /** Let go of the current player (he goes back to the AI). */
  release(): void {
    const list = this.ctx.world.controlled[this.team];
    const i = this.current ? list.indexOf(this.current) : -1;
    if (i >= 0) list.splice(i, 1);
    this.current = null;
  }

  /**
   * Called whenever any player gains the ball.
   * @param takesBall this human takes over `p` (the match decides which human
   *   of the team does: in co-op only one of the two).
   */
  onPossession(p: Player, previousTeam: number | null, takesBall: boolean): void {
    if (p.teamIndex === this.team) {
      if (!takesBall) return;
      // Includes our goalkeeper: the human decides where he plays the ball
      this.setControlled(p);
      if (p.role === 'goalkeeper') {
        // Keys still held from defending (e.g. lob used for a tackle) must
        // not immediately fire a keeper action: require a fresh press.
        this.syncInput();
        this.event('humanKeeper');
      }
    } else if (previousTeam === this.team || this.controlled?.role === 'goalkeeper') {
      // We lost the ball: take the defender best placed to stop the carrier
      this.switchPlayer(true);
    }
  }

  /** Kickoff: start on the given player with a clean input state (call release() on every human first). */
  resetForKickoff(startOn: Player): void {
    this.setControlled(startOn);
    this.syncInput();
    this.chargeKind = null;
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
