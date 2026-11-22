// ============================================================
// MatchScene — Orchestrates a match: builds the world, runs the
// per-frame pipeline (input → AI → movement → collisions → ball →
// goal check) and reacts to match-state transitions.
// Gameplay rules live in the systems; this scene only wires them.
// ============================================================

import Phaser from 'phaser';
import {
  AI_PROFILES, AIProfile, BALL, FORMATION, GOALKEEPER, MATCH, PLAYER, TEAMMATE_PROFILE, TEAMS,
} from '../config/GameplayConfig';
import { pickPlayerForBall, pickPlayerInDirection } from '../logic/PlayerSelection';
import { settings } from '../config/Settings';
import { Ball } from '../entities/Ball';
import { Pitch } from '../entities/Pitch';
import { Player } from '../entities/Player';
import { ballOwner, createStats, MatchWorld } from '../logic/MatchWorld';
import {
  PITCH_CX, PITCH_CY, attackDir, formationPosition, kickoffPositions, setSidesSwapped, teamDefendingSide,
} from '../logic/PitchGeometry';
import { ActionSystem } from '../systems/ActionSystem';
import { AISystem } from '../systems/AISystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { InputSystem, KeyboardInput } from '../systems/InputSystem';
import { MatchState, MatchSystem } from '../systems/MatchSystem';
import { soundManager } from '../systems/SoundManager';
import { HUD } from '../ui/HUD';
import { FulltimeInfo, MatchOverlay } from '../ui/MatchOverlay';
import { PauseMenu } from '../ui/PauseMenu';
import { textStyle } from '../ui/Theme';
import { BotInput } from '../debug/BotInput';
import { SimReport, recordSimMatch } from '../debug/SimReport';

export interface MatchSceneData {
  playerTeam?: number;
  /** Simulation mode: both teams AI-controlled (automated testing). */
  sim?: boolean;
  simMatches?: number;
  simIndex?: number;
  simMinutes?: number;
  /** In simulation, team 0 is driven by a scripted bot through the human input path. */
  simHuman?: boolean;
}

/** Dispatch a synthetic key press on window (used by the simulation test). */
function pressKey(code: string, keyCode: number): void {
  for (const type of ['keydown', 'keyup']) {
    const e = new KeyboardEvent(type, { code, key: code, bubbles: true });
    Object.defineProperty(e, 'keyCode', { get: () => keyCode });
    Object.defineProperty(e, 'which', { get: () => keyCode });
    window.dispatchEvent(e);
  }
}

export class MatchScene extends Phaser.Scene {
  private world!: MatchWorld;
  private ball!: Ball;
  private match!: MatchSystem;
  private actions!: ActionSystem;
  private collisions!: CollisionSystem;
  private ai!: AISystem;
  private playerInput!: InputSystem;
  private hud!: HUD;
  private overlay!: MatchOverlay;
  private pauseMenu!: PauseMenu;
  private fx!: Phaser.GameObjects.Graphics;
  /** Countdown above the human's keeper while he holds the ball. */
  private keeperTimer!: Phaser.GameObjects.Text;

  private sceneData: MatchSceneData = {};
  private humanTeam: number | null = 0;
  private profiles!: [AIProfile, AIProfile];
  private lastState: MatchState = 'kickoff';
  /** What the human is currently charging (hold S = pass, D = shot, A = lob). */
  private chargeKind: 'pass' | 'shoot' | 'lob' | null = null;
  private chargeMs = 0;
  private resumedAt = 0;
  private wasPowerShot = false;
  /** Arrow direction held this frame (for the switch-target hint). */
  private heldDir = { x: 0, y: 0 };
  private sim: SimReport | null = null;
  private bot: BotInput | null = null;

  constructor() {
    super({ key: 'MatchScene' });
  }

  init(data: MatchSceneData): void {
    this.sceneData = { ...data };
    if (data.sim) this.humanTeam = data.simHuman ? 0 : null;
    else this.humanTeam = data.playerTeam ?? settings.playerTeam;
    this.lastState = 'kickoff';
    this.chargeKind = null;
    this.chargeMs = 0;
    this.wasPowerShot = false;
    this.bot = null;
  }

  create(): void {
    // A restart from the pause menu must not inherit paused tweens
    this.tweens.resumeAll();
    // First half: team 0 attacks right (also resets after a restart mid-match)
    setSidesSwapped(false);
    new Pitch(this);
    this.ball = new Ball(this, PITCH_CX, PITCH_CY);

    const teams: [Player[], Player[]] = [[], []];
    for (let t = 0; t < 2; t++) {
      FORMATION.forEach((pos, i) => {
        const home = formationPosition(t, pos);
        teams[t].push(new Player(this, t * 10 + i, t, pos, home.x, home.y));
      });
    }
    this.world = {
      ball: this.ball,
      players: [...teams[0], ...teams[1]],
      teams,
      humanTeam: this.humanTeam,
      controlled: null,
      stats: createStats(),
    };

    const difficulty = AI_PROFILES[settings.difficulty];
    this.profiles = [
      this.humanTeam === 0 ? TEAMMATE_PROFILE : difficulty,
      this.humanTeam === 1 ? TEAMMATE_PROFILE : difficulty,
    ];

    const minutes = this.sceneData.sim ? (this.sceneData.simMinutes ?? 1) : settings.matchMinutes;
    this.match = new MatchSystem(minutes, Math.random() < 0.5 ? 0 : 1);
    this.actions = new ActionSystem(this.world);
    this.ai = new AISystem(this.world, this.actions);
    this.ai.onFieldPass = (passer) => this.startSupportRun(passer, 'ai');
    this.collisions = new CollisionSystem(this.world, {
      onPossession: (p, prev) => this.onPossession(p, prev),
      onSave: (gk) => {
        this.world.stats.onTarget[1 - gk.teamIndex]++;
        this.sim?.event('save');
      },
      onTackle: () => this.sim?.event('tackle'),
    });
    this.collisions.gkSaveChance = [this.profiles[0].gkSaveChance, this.profiles[1].gkSaveChance];
    this.collisions.tackleSuccess = [this.profiles[0].tackleSuccess, this.profiles[1].tackleSuccess];

    // Input
    this.playerInput = new InputSystem();
    this.playerInput.addSource(new KeyboardInput(this));
    if (this.sceneData.simHuman) {
      this.bot = new BotInput(() => this.world, () => this.sim?.event('keeperHeldShoot'));
      this.playerInput.addSource(this.bot);
    }

    // UI
    this.hud = new HUD(this, this.humanTeam, this.humanTeam !== null ? settings.difficulty : undefined);
    this.overlay = new MatchOverlay(this);
    this.pauseMenu = new PauseMenu(this, {
      onResume: () => this.resume(),
      onRestart: () => this.restartMatch(),
      onMainMenu: () => this.scene.start('MenuScene'),
    });
    this.fx = this.add.graphics().setDepth(60);
    this.keeperTimer = this.add.text(0, 0, '', {
      ...textStyle(11, '#ffffff', true),
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(61).setVisible(false);

    const kb = this.input.keyboard;
    kb?.on('keydown-ESC', this.onEscKey, this);
    kb?.on('keydown-P', this.togglePause, this);
    kb?.on('keydown-M', this.onMuteKey, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    if (this.sceneData.sim) {
      this.sim = new SimReport(this.sceneData.simIndex ?? 0);
      if (this.sceneData.simHuman) {
        // Exercise pausing with real ESC key events: press ESC, check the game
        // stays paused, press ESC again, check it resumed.
        this.time.delayedCall(4000, () => {
          pressKey('Escape', 27);
          this.time.delayedCall(500, () => {
            if (this.match.isPaused()) this.sim?.event('paused');
            pressKey('Escape', 27);
            this.time.delayedCall(300, () => {
              if (!this.match.isPaused()) this.sim?.event('resumed');
              else this.resume();
            });
          });
        });
        this.time.delayedCall(6000, () => this.keeperHeldKeyTest(0));
      }
    }

    this.resetPositions();
    this.match.startKickoff();
    this.overlay.showBanner('KICK OFF');
    soundManager.whistle();
  }

  // ================================================================ frame

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    const state = this.match.update(dt * 1000);
    if (state !== this.lastState) {
      const from = this.lastState;
      this.lastState = state;
      this.onStateChange(from, state);
    }

    switch (state) {
      case 'playing':
        this.simulate(dt);
        break;
      case 'goal_scored':
        for (const p of this.world.players) p.updateIdle(dt);
        this.ball.update(dt);
        break;
      case 'kickoff':
      case 'halftime':
      case 'fulltime':
        for (const p of this.world.players) p.updateIdle(dt);
        this.collisions.placeCarriedBall();
        this.ball.render();
        break;
      case 'paused':
        break;
    }

    this.hud.update(this.match.data, this.match.getFormattedTime(), !soundManager.enabled);
    this.drawFx();
  }

  private simulate(dt: number): void {
    if (this.humanTeam !== null) this.handleHumanInput(dt);

    for (let t = 0; t < 2; t++) {
      const controlled = t === this.humanTeam ? this.world.controlled : null;
      this.ai.updateTeam(t, dt, this.profiles[t], controlled);
    }
    for (const p of this.world.players) p.update(dt);
    this.collisions.update(dt);
    this.ball.update(dt, (strength) => {
      if (strength > 0.2) soundManager.bounce();
    });

    // Power shot feedback
    if (this.ball.isPowerShot && !this.wasPowerShot) this.cameras.main.shake(120, 0.003);
    this.wasPowerShot = this.ball.isPowerShot;

    const side = this.ball.checkGoal();
    // The team defending that goal concedes (sides change at half time)
    if (side >= 0) this.onGoal(1 - teamDefendingSide(side));

    if (this.sim) {
      this.sampleSimMetrics(dt);
      // Test check: nobody may move faster than his sprint speed outside a tackle
      // dash (stunned players may still carry a decaying dash from a missed tackle)
      for (const p of this.world.players) {
        if (p.isTackling || p.isStunned) continue;
        const limit = PLAYER.sprintSpeed * Math.max(1, p.speedFactor) * 1.1 + 5;
        if (p.getSpeed() > limit) {
          this.sim.event('overspeed');
          this.sim.events.maxSpeed = Math.max(this.sim.events.maxSpeed ?? 0, Math.round(p.getSpeed()));
        }
      }
    }
  }

  private simSampleMs = 0;

  /** Test metrics (sim only), sampled every 0.5 s: team spacing and player contacts. */
  private sampleSimMetrics(dt: number): void {
    this.simSampleMs += dt * 1000;
    if (this.simSampleMs < 500) return;
    this.simSampleMs = 0;
    const sim = this.sim!;
    for (const team of this.world.teams) {
      const field = team.filter((q) => q.role !== 'goalkeeper');
      for (const a of field) {
        let nearest = Infinity;
        for (const b of field) if (a !== b) nearest = Math.min(nearest, a.distanceTo(b.x, b.y));
        sim.add('spacingSum', Math.round(nearest));
        sim.event('spacingN');
        if (nearest < 40) sim.event('clumpPlayers');
      }
    }
    const ps = this.world.players;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        if (ps[i].distanceTo(ps[j].x, ps[j].y) < PLAYER.separationDistance + 0.5) sim.event('contactPairs');
      }
    }
  }

  // ========================================================= human control

  private handleHumanInput(dt: number): void {
    const input = this.playerInput.update(dt * 1000);
    this.heldDir = { x: input.moveX, y: input.moveY };
    if (input.switchPressed) this.switchPlayer(false, input.moveX, input.moveY);

    // The human only controls the keeper while he holds the ball
    if (this.world.controlled?.role === 'goalkeeper' && !this.world.controlled.hasBall) {
      this.switchPlayer(false);
    }

    const p = this.world.controlled;
    if (!p) return;

    // Don't let the game stall if the player never releases the keeper's ball
    if (p.role === 'goalkeeper' && p.hasBall && p.possessionTime > GOALKEEPER.humanHoldMax && p.canKick()) {
      this.playerInput.consumeShoot();
      const receiver = this.actions.lob(p, attackDir(p.teamIndex), 0);
      if (receiver) this.setControlled(receiver);
      else this.switchPlayer(false);
      return;
    }

    p.steer(input.moveX, input.moveY, input.sprint, dt);
    const hasDir = input.moveX !== 0 || input.moveY !== 0;
    const dirX = hasDir ? input.moveX : 0;
    const dirY = hasDir ? input.moveY : 0;

    if (p.hasBall) {
      // Pass (S), shot (D) and lob (A) are all "hold to charge, release to play".
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
      if (input.shootPressed) {
        if (this.actions.tackle(p)) this.sim?.event('humanTackle');
        this.playerInput.consumeShoot();
      }
      // A without the ball does nothing; don't let the hold carry over into possession
      if (input.lobPressed) this.playerInput.consumeLob();
      if (input.passPressed) {
        this.playerInput.consumePass(); // S here means "switch", not a pass to charge later
        this.switchPlayer(true, dirX, dirY);
      }
    }
  }

  private fireCharged(
    p: Player, kind: 'pass' | 'shoot' | 'lob', charge: number, aimY: number, dirX: number, dirY: number,
  ): void {
    if (kind === 'pass') this.firePass(p, charge, dirX, dirY);
    else if (kind === 'shoot') this.fireShot(p, charge, aimY, dirX, dirY);
    else this.fireLob(p, charge, dirX, dirY);
  }

  private consumeCharge(kind: 'pass' | 'shoot' | 'lob'): void {
    if (kind === 'pass') this.playerInput.consumePass();
    else if (kind === 'shoot') this.playerInput.consumeShoot();
    else this.playerInput.consumeLob();
  }

  private firePass(p: Player, charge: number, dirX: number, dirY: number): void {
    this.chargeKind = null;
    const receiver = this.actions.pass(p, dirX, dirY, Phaser.Math.Clamp(charge, 0, 1));
    this.sim?.event('humanPass');
    this.startSupportRun(p);
    if (receiver) this.setControlled(receiver);
  }

  private fireLob(p: Player, charge: number, dirX: number, dirY: number): void {
    this.chargeKind = null;
    const power = Phaser.Math.Clamp(charge, 0, 1);
    const receiver = this.actions.lobToSpot(p, dirX, dirY, power);
    this.sim?.event('humanLob');
    this.sim?.event(power >= 0.99 ? 'humanLobFull' : power < 0.33 ? 'humanLobWeak' : 'humanLobMid');
    this.startSupportRun(p);
    if (receiver) this.setControlled(receiver);
  }

  /**
   * After a pass, the passer keeps joining the attack (see AISystem.supportRun).
   * Used for the human's passes and for AI passes (via AISystem.onFieldPass).
   */
  private startSupportRun(passer: Player, by: 'human' | 'ai' = 'human'): void {
    if (passer.hasBall || passer.role === 'goalkeeper') return; // pass didn't happen / keeper
    passer.supportRunTimer = PLAYER.supportRunMax;
    if (this.sim) {
      // Test metric: 1 s later, has the passer moved forward (while his team still has the ball)?
      const x0 = passer.x;
      const team = passer.teamIndex;
      const prefix = by === 'ai' ? 'aiPasser' : 'passer';
      this.time.delayedCall(1000, () => {
        const b = this.ball;
        const stillOurs = b.ownerTeam === team || (b.isFree && b.lastTouchTeam === team);
        if (!stillOurs || this.match.state !== 'playing') return;
        const moved = (passer.x - x0) * attackDir(team);
        this.sim?.event(moved >= 0 ? `${prefix}Forward` : `${prefix}Back`);
        this.sim?.add(`${prefix}MovedPx`, Math.round(moved));
      });
    }
  }

  private fireShot(p: Player, charge: number, aimY: number, dirX: number, dirY: number): void {
    this.chargeKind = null;
    const power = 0.2 + 0.8 * Phaser.Math.Clamp(charge, 0, 1);
    this.actions.shoot(p, power, aimY, dirX, dirY, 0.85);
    this.sim?.event('humanShot');
  }

  /**
   * Switch player. With a direction held (dirX/dirY from the arrows) it picks
   * the teammate in that direction from the current player; otherwise the best
   * player for the situation (pass receiver, goal-side defender, or whoever
   * reaches a loose ball first). See logic/PlayerSelection.ts.
   */
  private switchPlayer(includeCurrent: boolean, dirX = 0, dirY = 0): void {
    if (this.humanTeam === null) return;
    this.sim?.event(dirX !== 0 || dirY !== 0 ? 'switchDirectional' : 'switch');
    const target = this.switchTarget(includeCurrent, dirX, dirY);
    if (target) this.setControlled(target);
  }

  /** Who switchPlayer() would select right now (no side effects). */
  private switchTarget(includeCurrent: boolean, dirX = 0, dirY = 0): Player | null {
    if (this.humanTeam === null) return null;
    const ball = this.ball;
    const current = this.world.controlled;
    const mates = this.world.teams[this.humanTeam];

    // Explicit direction from the arrows wins
    if (current && (dirX !== 0 || dirY !== 0)) {
      const inDirection = pickPlayerInDirection(mates, current, dirX, dirY, current);
      if (inDirection) return inDirection;
    }

    const receiver = ball.isFree ? mates.find((p) => p.id === ball.passTargetId) : undefined;
    if (receiver && receiver !== current) return receiver;

    const carrier = ballOwner(this.world);
    const opponentCarrier = carrier && carrier.teamIndex !== this.humanTeam ? carrier : null;
    // Never stay on a goalkeeper who no longer has the ball
    const exclude = includeCurrent && current?.role !== 'goalkeeper' ? null : current;
    return pickPlayerForBall(mates, this.humanTeam, ball, opponentCarrier, exclude);
  }

  private setControlled(p: Player): void {
    const current = this.world.controlled;
    if (current === p) return;
    current?.setSelected(this, false);
    p.setSelected(this, true);
    this.world.controlled = p;
    this.chargeKind = null;
  }

  private onPossession(p: Player, previousTeam: number | null): void {
    this.sim?.event('possession');
    if (this.humanTeam === null) return;
    if (p.teamIndex === this.humanTeam) {
      // Includes our goalkeeper: the human decides where he plays the ball
      this.setControlled(p);
      if (p.role === 'goalkeeper') {
        // Keys still held from defending (e.g. D for a tackle) must not
        // immediately fire a keeper action: require a fresh press.
        this.playerInput.sync();
        this.sim?.event('humanKeeper');
      }
    } else if (previousTeam === this.humanTeam || this.world.controlled?.role === 'goalkeeper') {
      // We lost the ball: take the defender best placed to stop the carrier
      this.switchPlayer(true);
    }
  }

  // ========================================================== match flow

  private onStateChange(from: MatchState, to: MatchState): void {
    // Pausing/resuming is not a real transition
    if (from === 'paused' || to === 'paused') return;
    this.sim?.state(to);

    switch (to) {
      case 'kickoff':
        if (from === 'halftime') this.changeEnds();
        this.resetPositions();
        if (from === 'halftime' && this.sim) {
          // Test check: everyone lines up in their (new) own half, team 0's keeper on the right
          const inOwnHalf = this.world.players.every((q) => (q.x - PITCH_CX) * attackDir(q.teamIndex) <= 0);
          const keeper0Right = this.world.teams[0][0].x > PITCH_CX;
          this.sim.event(inOwnHalf && keeper0Right ? 'swapOk' : 'swapWrong');
        }
        this.overlay.setDim(0);
        this.overlay.showBanner('KICK OFF', from === 'halftime' ? 'SECOND HALF' : '');
        soundManager.whistle();
        break;
      case 'playing':
        this.overlay.hideBanner();
        this.overlay.setDim(0);
        break;
      case 'halftime': {
        const [a, b] = this.match.data.score;
        this.overlay.setDim(0.35);
        this.overlay.showBanner('HALF TIME', `${TEAMS[0].shortName} ${a} - ${b} ${TEAMS[1].shortName}`);
        soundManager.whistleLong();
        break;
      }
      case 'fulltime':
        this.onFulltime();
        break;
    }
  }

  private onGoal(scoringTeam: number): void {
    const ownGoal = this.ball.lastTouchTeam !== null && this.ball.lastTouchTeam !== scoringTeam;
    this.match.scoreGoal(scoringTeam);
    this.lastState = 'goal_scored';
    this.sim?.goal(scoringTeam, this.match.data.time);
    if (!ownGoal) this.world.stats.onTarget[scoringTeam]++;
    else if (1 - scoringTeam === this.humanTeam) {
      const kicker = this.world.players.find((q) => q.id === this.ball.lastKickerId);
      if (kicker?.role === 'goalkeeper') this.sim?.event('humanKeeperOwnGoal');
    }

    soundManager.goal();
    this.overlay.setDim(0.2);
    this.overlay.showGoal(ownGoal ? `OWN GOAL — ${TEAMS[scoringTeam].name}` : TEAMS[scoringTeam].name);
    this.cameras.main.shake(300, 0.008);
    this.cameras.main.flash(180, 255, 255, 255);
    this.chargeKind = null;

    for (const p of this.world.teams[scoringTeam]) p.setPose('celebrate', MATCH.goalCelebrationDuration);
    this.burstConfetti(this.ball.x, this.ball.y, TEAMS[scoringTeam].primaryColor);
  }

  private burstConfetti(x: number, y: number, teamColor: number): void {
    const emitter = this.add.particles(x, y, 'pixel', {
      speed: { min: 80, max: 260 },
      angle: { min: 0, max: 360 },
      lifespan: 1300,
      gravityY: 240,
      scale: { start: 1, end: 0.5 },
      tint: [teamColor, 0xffffff, 0xffcc00],
      emitting: false,
    });
    emitter.setDepth(195);
    emitter.explode(70);
    this.time.delayedCall(1600, () => emitter.destroy());
  }

  private onFulltime(): void {
    soundManager.whistleLong();
    this.chargeKind = null;
    const d = this.match.data;
    const s = this.world.stats;
    const winner = this.match.getWinner();

    let resultText: string;
    let resultColor = '#ffffff';
    if (this.humanTeam !== null) {
      if (winner === -1) resultText = 'DRAW';
      else if (winner === this.humanTeam) {
        resultText = 'YOU WIN!';
        resultColor = '#66ff88';
      } else {
        resultText = 'YOU LOSE';
        resultColor = '#ff7766';
      }
    } else {
      resultText = winner === -1 ? 'DRAW' : `${TEAMS[winner].name} WIN`;
    }

    const totalPoss = s.possessionMs[0] + s.possessionMs[1] || 1;
    const poss0 = Math.round((s.possessionMs[0] / totalPoss) * 100);
    const info: FulltimeInfo = {
      title: 'FULL TIME',
      scoreLine: `${TEAMS[0].shortName}  ${d.score[0]} - ${d.score[1]}  ${TEAMS[1].shortName}`,
      resultText,
      resultColor,
      statLines: [
        [`${poss0}%`, 'POSSESSION', `${100 - poss0}%`],
        [`${s.shots[0]}`, 'SHOTS', `${s.shots[1]}`],
        [`${s.onTarget[0]}`, 'ON TARGET', `${s.onTarget[1]}`],
        [`${s.passes[0]}`, 'PASSES', `${s.passes[1]}`],
        [`${s.tackles[0]}`, 'TACKLES WON', `${s.tackles[1]}`],
      ],
    };
    this.overlay.showFulltime(info, () => this.restartMatch(), () => this.scene.start('MenuScene'));

    if (this.sim) {
      const more = recordSimMatch(this.sim, d.score, s);
      const total = this.sceneData.simMatches ?? 1;
      const next = (this.sceneData.simIndex ?? 0) + 1;
      if (more && next < total) {
        this.time.delayedCall(300, () => this.scene.restart({ ...this.sceneData, simIndex: next }));
      }
    }
  }

  /**
   * Scripted test (bot-as-human sim only): our forward gets the ball and starts
   * charging a shot (D held); mid-charge our keeper takes the ball. Because D is
   * still held from the forward's charge, the keeper must NOT kick (the hold is
   * swallowed by InputSystem.sync when control passes to the keeper).
   */
  private keeperHeldKeyTest(attempt: number): void {
    const bot = this.bot;
    if (!bot || this.humanTeam === null || attempt > 6) return;
    const retry = () => {
      bot.override = null;
      this.time.delayedCall(1000, () => this.keeperHeldKeyTest(attempt + 1));
    };
    if (this.match.state !== 'playing') return retry();

    const team = this.world.teams[this.humanTeam];
    const forward = team.find((q) => q.role === 'forward');
    const keeper = team.find((q) => q.role === 'goalkeeper');
    if (!forward || !keeper) return;

    bot.override = 'release'; // make sure the next D press is a fresh one
    this.time.delayedCall(100, () => {
      if (this.match.state !== 'playing') return retry();
      this.collisions.givePossession(forward);
      bot.override = 'holdShoot';
      this.time.delayedCall(250, () => {
        const charging = this.chargeKind === 'shoot' && forward.hasBall;
        if (!charging || this.match.state !== 'playing') return retry();
        this.collisions.givePossession(keeper);
        this.time.delayedCall(1000, () => {
          // Still holding the ball = the held key was ignored; otherwise he kicked it
          this.sim?.event(keeper.hasBall ? 'keeperHeldKeyOk' : 'keeperHeldKeyFired');
          bot.override = null;
        });
      });
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
    this.sim?.event('sidesSwapped');
  }

  private resetPositions(): void {
    const kickoffTeam = this.match.data.kickoffTeam;
    for (let t = 0; t < 2; t++) {
      const positions = kickoffPositions(t, t === kickoffTeam);
      this.world.teams[t].forEach((p, i) => p.placeAt(positions[i].x, positions[i].y));
    }

    this.ball.reset(PITCH_CX, PITCH_CY);
    const taker = this.world.teams[kickoffTeam].find((p) => p.role === 'forward');
    if (taker) {
      taker.gainPossession(800);
      this.ball.setOwner(taker.id, kickoffTeam);
      this.collisions.placeCarriedBall();
    }
    this.ai.reset();

    if (this.humanTeam !== null) {
      const fwd = this.world.teams[this.humanTeam].find((p) => p.role === 'forward');
      if (fwd) this.setControlled(fwd);
    }
    this.playerInput.sync();
    this.chargeKind = null;
  }

  // ================================================================ pause

  private onEscKey(event?: KeyboardEvent): void {
    // While paused the pause menu handles ESC itself
    if (!this.match.isPaused()) this.pause(event);
  }

  private onMuteKey(): void {
    soundManager.toggle();
  }

  private onBlur(): void {
    // Auto-pause when the window loses focus
    if (this.humanTeam !== null && !this.sceneData.sim && this.scene.isActive()) this.pause();
  }

  private togglePause(event?: KeyboardEvent): void {
    if (this.match.isPaused()) this.resume();
    else this.pause(event);
  }

  /** @param openedBy key event that triggered the pause (the menu ignores it). */
  private pause(openedBy?: KeyboardEvent): void {
    const st = this.match.state;
    if (st === 'fulltime' || st === 'paused') return;
    // Ignore the same key event that just closed the menu
    if (performance.now() - this.resumedAt < 150) return;
    this.match.pause();
    this.lastState = 'paused';
    this.pauseMenu.show(openedBy);
    this.tweens.pauseAll();
  }

  private resume(): void {
    if (!this.match.isPaused()) return;
    this.match.resume();
    this.lastState = this.match.state;
    this.pauseMenu.hide();
    this.tweens.resumeAll();
    this.playerInput.sync();
    this.resumedAt = performance.now();
  }

  private restartMatch(): void {
    this.scene.restart({ ...this.sceneData, simIndex: this.sceneData.simIndex });
  }

  // ================================================================= fx

  private drawFx(): void {
    const g = this.fx;
    g.clear();
    this.keeperTimer.setVisible(false);
    const p = this.world.controlled;
    if (!p || this.humanTeam === null) return;
    const x = Math.round(p.x);
    const y = Math.round(p.y);

    // Countdown to the keeper's automatic kick
    if (p.role === 'goalkeeper' && p.hasBall) {
      const left = Math.max(0, GOALKEEPER.humanHoldMax - p.possessionTime);
      const k = left / GOALKEEPER.humanHoldMax;
      const color = k > 0.5 ? 0x66ff66 : k > 0.25 ? 0xffdd33 : 0xff4433;
      // Drawn above the shot-power bar so both stay visible while charging a kick
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

    // Power bar while charging a shot or a lob
    if (this.chargeKind !== null && p.hasBall) {
      const k = Phaser.Math.Clamp(this.chargeMs / BALL.maxChargeMs, 0, 1);
      const color = k < 0.5 ? 0x66ff66 : k < 0.8 ? 0xffdd33 : 0xff4433;
      g.fillStyle(0x000000, 0.7);
      g.fillRect(x - 13, y - 22, 26, 6);
      g.fillStyle(color, 1);
      g.fillRect(x - 12, y - 21, Math.round(24 * k), 4);
    }

    if (this.match.state === 'playing') {
      if (p.hasBall) {
        // Yellow hint: who an S pass would go to (follows the held arrow direction)
        const t = this.actions.passTarget(p, this.heldDir.x, this.heldDir.y);
        if (t) this.drawHintArrow(g, t, 0xffe14d);
      } else {
        // Blue hint: who SPACE would switch to
        const t = this.switchTarget(false, this.heldDir.x, this.heldDir.y);
        if (t && t !== p) this.drawHintArrow(g, t, 0x7fd8ff);
      }
    }
  }

  /** Small down-pointing pixel arrow with a dark outline above a player. */
  private drawHintArrow(g: Phaser.GameObjects.Graphics, target: Player, color: number): void {
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

  // ============================================================= teardown

  private onShutdown(): void {
    const kb = this.input.keyboard;
    kb?.off('keydown-ESC', this.onEscKey, this);
    kb?.off('keydown-P', this.togglePause, this);
    kb?.off('keydown-M', this.onMuteKey, this);
    this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.playerInput.destroy();
    this.sim = null;
    this.world.controlled = null;
  }
}
