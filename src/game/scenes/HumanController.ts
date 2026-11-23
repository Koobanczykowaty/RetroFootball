// ============================================================
// HumanController — Everything one human player does with his team:
// reading his input device, steering the controlled player, charged
// pass / shot / lob, tackles, player switching, keeper control, and
// the on-pitch hints (power bar, stamina, keeper countdown, arrows).
// One instance per human: one in Quick Match, two in 2-player mode.
// ============================================================

import Phaser from 'phaser';
import type { MarkerId } from '../assets/AssetGenerator';
import { BALL, GOALKEEPER } from '../config/GameplayConfig';
import type { SimReport } from '../debug/SimReport';
import type { Player } from '../entities/Player';
import { predictAerialContact, timingQuality } from '../logic/Aerial';
import { ballOwner, MatchWorld } from '../logic/MatchWorld';
import { attackDir } from '../logic/PitchGeometry';
import { pickPlayerForBall, pickPlayerInDirection } from '../logic/PlayerSelection';
import type { ActionSystem } from '../systems/ActionSystem';
import type { InputSystem } from '../systems/InputSystem';
import type { MatchState } from '../systems/MatchSystem';
import { pixelStroke, textStyle } from '../ui/Theme';

export type ChargeKind = 'pass' | 'shoot' | 'lob';

/** What a HumanController needs from the match scene. */
export interface HumanContext {
  scene: Phaser.Scene;
  world: MatchWorld;
  actions: ActionSystem;
  matchState(): MatchState;
  sim(): SimReport | null;
  /** The passer keeps joining the attack after a pass. */
  startSupportRun(passer: Player): void;
}

export class HumanController {
  /** What is currently charging (hold pass / shoot / lob). */
  chargeKind: ChargeKind | null = null;
  chargeMs = 0;
  /** Direction held this frame (for the hint arrows). */
  private heldDir = { x: 0, y: 0 };
  /** Header / volley waiting for the ball to arrive (see updateAerial). */
  private pendingAerial: {
    kind: 'shot' | 'pass'; quality: number; kickId: number; player: Player; deadlineMs: number;
  } | null = null;
  /** Match time seen by this controller (ms), for the aerial deadline. */
  private clockMs = 0;
  /** Countdown above our keeper while he holds the ball. */
  private readonly keeperTimer: Phaser.GameObjects.Text;

  constructor(
    private readonly ctx: HumanContext,
    readonly team: number,
    readonly input: InputSystem,
    /** Selection-marker colour: p1 yellow, p2 green. */
    private readonly marker: MarkerId = 'p1',
  ) {
    this.keeperTimer = ctx.scene.add.text(0, 0, '', {
      ...textStyle(11, '#ffffff', true),
      stroke: '#000000',
      strokeThickness: pixelStroke(11),
    }).setOrigin(0.5, 1).setDepth(61).setVisible(false);
  }

  get controlled(): Player | null {
    return this.ctx.world.controlled[this.team];
  }

  // ============================================================ per frame

  update(dt: number): void {
    const { actions } = this.ctx;
    const input = this.input.update(dt * 1000);
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
        if (actions.tackle(p)) this.ctx.sim()?.event('humanTackle');
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
      const sim = this.ctx.sim();
      sim?.event(zone === 'header' ? 'humanHeader' : 'humanVolley');
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
    const receiver = this.ctx.actions.pass(p, dirX, dirY, Phaser.Math.Clamp(charge, 0, 1));
    this.ctx.sim()?.event('humanPass');
    this.ctx.sim()?.event(`humanPassTeam${this.team}`);
    this.ctx.startSupportRun(p);
    if (receiver) this.setControlled(receiver);
  }

  private fireLob(p: Player, charge: number, dirX: number, dirY: number): void {
    this.chargeKind = null;
    const power = Phaser.Math.Clamp(charge, 0, 1);
    const receiver = this.ctx.actions.lobToSpot(p, dirX, dirY, power);
    const sim = this.ctx.sim();
    sim?.event('humanLob');
    sim?.event(power >= 0.99 ? 'humanLobFull' : power < 0.33 ? 'humanLobWeak' : 'humanLobMid');
    this.ctx.startSupportRun(p);
    if (receiver) this.setControlled(receiver);
  }

  private fireShot(p: Player, charge: number, aimY: number, dirX: number, dirY: number): void {
    this.chargeKind = null;
    const power = 0.2 + 0.8 * Phaser.Math.Clamp(charge, 0, 1);
    this.ctx.actions.shoot(p, power, aimY, dirX, dirY, 0.85);
    this.ctx.sim()?.event('humanShot');
    this.ctx.sim()?.event(`humanShotTeam${this.team}`);
  }

  // ======================================================= player switch

  /**
   * Switch player. With a direction held it picks the teammate in that
   * direction from the current player; otherwise the best player for the
   * situation (pass receiver, goal-side defender, or whoever reaches a loose
   * ball first). See logic/PlayerSelection.ts.
   */
  switchPlayer(includeCurrent: boolean, dirX = 0, dirY = 0): void {
    this.ctx.sim()?.event(dirX !== 0 || dirY !== 0 ? 'switchDirectional' : 'switch');
    const target = this.switchTarget(includeCurrent, dirX, dirY);
    if (target) this.setControlled(target);
    // Sim metric: how far the selected player is from the opponent's ball carrier
    const sim = this.ctx.sim();
    const carrier = ballOwner(this.ctx.world);
    if (sim && target && carrier && carrier.teamIndex !== this.team && carrier.role !== 'goalkeeper') {
      sim.add('defSwitchDist', Math.round(target.distanceTo(carrier.x, carrier.y)));
      sim.event('defSwitchN');
    }
  }

  /** Who switchPlayer() would select right now (no side effects). */
  switchTarget(includeCurrent: boolean, dirX = 0, dirY = 0): Player | null {
    const { world } = this.ctx;
    const ball = world.ball;
    const current = this.controlled;
    const mates = world.teams[this.team];

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

  setControlled(p: Player): void {
    const current = this.controlled;
    if (current === p) return;
    current?.setSelected(this.ctx.scene, false);
    p.setSelected(this.ctx.scene, true, this.marker);
    this.ctx.world.controlled[this.team] = p;
    this.chargeKind = null;
  }

  /** Called by the scene whenever any player gains the ball. */
  onPossession(p: Player, previousTeam: number | null): void {
    if (p.teamIndex === this.team) {
      // Includes our goalkeeper: the human decides where he plays the ball
      this.setControlled(p);
      if (p.role === 'goalkeeper') {
        // Keys still held from defending (e.g. lob used for a tackle) must
        // not immediately fire a keeper action: require a fresh press.
        this.input.sync();
        this.ctx.sim()?.event('humanKeeper');
      }
    } else if (previousTeam === this.team || this.controlled?.role === 'goalkeeper') {
      // We lost the ball: take the defender best placed to stop the carrier
      this.switchPlayer(true);
    }
  }

  /** Kickoff: start on the given player with a clean input state. */
  resetForKickoff(startOn: Player): void {
    this.setControlled(startOn);
    this.input.sync();
    this.chargeKind = null;
  }

  // =================================================================== fx

  drawFx(g: Phaser.GameObjects.Graphics): void {
    this.keeperTimer.setVisible(false);
    const p = this.controlled;
    if (!p) return;
    const x = Math.round(p.x);
    const y = Math.round(p.y);

    // Countdown to the keeper's automatic kick
    if (p.role === 'goalkeeper' && p.hasBall) {
      const left = Math.max(0, GOALKEEPER.humanHoldMax - p.possessionTime);
      const k = left / GOALKEEPER.humanHoldMax;
      const color = k > 0.5 ? 0x66ff66 : k > 0.25 ? 0xffdd33 : 0xff4433;
      // Drawn above the power bar so both stay visible while charging a kick
      g.fillStyle(0x000000, 0.7);
      g.fillRect(x - 13, y - 30, 26, 5);
      g.fillStyle(color, 1);
      g.fillRect(x - 12, y - 29, Math.round(24 * k), 3);
      this.keeperTimer
        .setText((left / 1000).toFixed(1))
        .setColor(`#${color.toString(16).padStart(6, '0')}`)
        .setPosition(x, y - 31)
        .setVisible(true);
    }

    // Stamina bar under the controlled player
    if (p.stamina < 0.99) {
      g.fillStyle(0x000000, 0.6);
      g.fillRect(x - 9, y + 15, 18, 4);
      g.fillStyle(p.stamina > 0.3 ? 0x44dd66 : 0xff5544, 1);
      g.fillRect(x - 8, y + 16, Math.round(16 * p.stamina), 2);
    }

    // Power bar while charging
    if (this.chargeKind !== null && p.hasBall) {
      const k = Phaser.Math.Clamp(this.chargeMs / BALL.maxChargeMs, 0, 1);
      const color = k < 0.5 ? 0x66ff66 : k < 0.8 ? 0xffdd33 : 0xff4433;
      g.fillStyle(0x000000, 0.7);
      g.fillRect(x - 13, y - 22, 26, 6);
      g.fillStyle(color, 1);
      g.fillRect(x - 12, y - 21, Math.round(24 * k), 4);
    }

    if (this.ctx.matchState() === 'playing') {
      if (p.hasBall) {
        // Yellow hint: who a pass would go to (follows the held direction)
        const t = this.ctx.actions.passTarget(p, this.heldDir.x, this.heldDir.y);
        if (t) drawHintArrow(g, t, 0xffe14d);
      } else {
        // Blue hint: who a switch would select
        const t = this.switchTarget(false, this.heldDir.x, this.heldDir.y);
        if (t && t !== p) drawHintArrow(g, t, 0x7fd8ff);
        // Header / volley chance: a small marker above the head (cyan header,
        // green volley; white once D or S was pressed for it)
        const ball = this.ctx.world.ball;
        const contact = ball.isFree && p.role !== 'goalkeeper' ? predictAerialContact(ball, p) : null;
        if (contact || this.pendingAerial) {
          const color = this.pendingAerial ? 0xffffff : contact?.zone === 'header' ? 0x5fe0ff : 0x7dff6a;
          g.fillStyle(0x000000, 0.8);
          g.fillTriangle(x - 5, y - 26, x + 5, y - 26, x, y - 33);
          g.fillStyle(color, 1);
          g.fillTriangle(x - 3, y - 27, x + 3, y - 27, x, y - 31);
        }
      }
    }
  }

  destroy(): void {
    this.input.destroy();
    this.ctx.world.controlled[this.team] = null;
  }
}

/** Small down-pointing pixel arrow with a dark outline above a player. */
function drawHintArrow(g: Phaser.GameObjects.Graphics, target: Player, color: number): void {
  const tx = Math.round(target.x);
  const ty = Math.round(target.y) - 17;
  g.fillStyle(0x0b0f1c, 0.9);
  g.fillRect(tx - 4, ty - 1, 9, 2);
  g.fillRect(tx - 3, ty + 1, 7, 2);
  g.fillRect(tx - 2, ty + 3, 5, 2);
  g.fillRect(tx - 1, ty + 5, 3, 1);
  g.fillStyle(color, 1);
  g.fillRect(tx - 3, ty, 7, 1);
  g.fillRect(tx - 2, ty + 1, 5, 2);
  g.fillRect(tx - 1, ty + 3, 3, 1);
  g.fillRect(tx, ty + 4, 1, 1);
}
