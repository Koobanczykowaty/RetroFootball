// ============================================================
// MatchScene — Orchestrates a match: builds the world, runs the
// per-frame pipeline (human input → AI → movement → collisions →
// ball → goal check) and reacts to match-state transitions.
// Gameplay rules live in the systems; human control lives in
// HumanController (one per human: Quick Match = 1, 2 PLAYERS = 2).
// ============================================================

import Phaser from 'phaser';
import {
  AI_PROFILES, AIProfile, FORMATION_IDS, FORMATIONS, FormationId, GAME_HEIGHT, GAME_WIDTH, MATCH, PLAYER,
  STADIUMS, StadiumId, TEAMMATE_PROFILE, TEAMS,
} from '../config/GameplayConfig';
import { saveSettings, settings } from '../config/Settings';
import { t } from '../config/i18n';
import { Ball } from '../entities/Ball';
import { Pitch } from '../entities/Pitch';
import { Player } from '../entities/Player';
import { createStats, MatchWorld } from '../logic/MatchWorld';
import {
  PITCH_CX, PITCH_CY, attackDir, formationPosition, kickoffPositions, kickoffTakerIndex, setSidesSwapped,
  teamDefendingSide,
} from '../logic/PitchGeometry';
import { ActionSystem } from '../systems/ActionSystem';
import { AISystem } from '../systems/AISystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { GamepadInput, PAD, PadEdges, PadState, connectedPads, padForPlayer } from '../systems/Gamepad';
import { InputSystem, KeyboardInput } from '../systems/InputSystem';
import type { InputSource } from '../systems/InputTypes';
import { MatchState, MatchSystem } from '../systems/MatchSystem';
import { soundManager } from '../systems/SoundManager';
import { HUD } from '../ui/HUD';
import { FulltimeInfo, MatchOverlay } from '../ui/MatchOverlay';
import { createEventDeduper } from '../ui/MenuNavigator';
import { PauseMenu } from '../ui/PauseMenu';
import { BotInput } from '../debug/BotInput';
import { SimReport, recordSimMatch } from '../debug/SimReport';
import { HumanContext, HumanController } from './HumanController';

export type GameMode = '1p' | '2p';

export interface MatchSceneData {
  /** 1p: the human's team. 2p: the KEYBOARD player's team (the pad player gets the other). */
  playerTeam?: number;
  mode?: GameMode;
  /** Simulation mode: both teams AI-controlled (automated testing). */
  sim?: boolean;
  simMatches?: number;
  simIndex?: number;
  simMinutes?: number;
  /** In simulation, team 0 is driven by a scripted bot through the human input path. */
  simHuman?: boolean;
  /** In simulation, 2-player mode with a bot playing each team as P1 and P2. */
  simTwoPlayer?: boolean;
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
  private hud!: HUD;
  private overlay!: MatchOverlay;
  private pauseMenu!: PauseMenu;
  private fx!: Phaser.GameObjects.Graphics;

  private sceneData: MatchSceneData = {};
  private mode: GameMode = '1p';
  /** Teams controlled by humans, in player order (P1 first). */
  private humanTeams: number[] = [];
  private humans: HumanController[] = [];
  private profiles!: [AIProfile, AIProfile];
  private lastState: MatchState = 'kickoff';
  private resumedAt = 0;
  private wasPowerShot = false;
  /** Goal waiting for its celebration while the slow motion runs. */
  private pendingGoal: { team: number; ownGoal: boolean } | null = null;
  private slowMoMs = 0;
  private stadium: StadiumId = 'narodowy';
  private sim: SimReport | null = null;
  private bot: BotInput | null = null;
  /** Controller Menu/View presses (pause, mute) — any controller. */
  private readonly padEdges = new PadEdges();
  /** Formation of each team in this match. */
  private formations: [FormationId, FormationId] = ['2-3', '2-3'];

  constructor() {
    super({ key: 'MatchScene' });
  }

  init(data: MatchSceneData): void {
    this.sceneData = { ...data };
    this.mode = data.sim ? (data.simTwoPlayer ? '2p' : '1p') : (data.mode ?? '1p');
    const keyboardTeam = data.playerTeam ?? settings.playerTeam;
    if (data.sim && data.simTwoPlayer) this.humanTeams = [0, 1];
    else if (data.sim) this.humanTeams = data.simHuman ? [0] : [];
    else if (this.mode === '2p') this.humanTeams = [keyboardTeam, 1 - keyboardTeam];
    else this.humanTeams = [keyboardTeam];
    this.humans = [];
    this.lastState = 'kickoff';
    this.wasPowerShot = false;
    this.pendingGoal = null;
    this.slowMoMs = 0;
    this.bot = null;
  }

  create(): void {
    // A restart from the pause menu must not inherit paused tweens
    this.tweens.resumeAll();
    // The goal zoom must not show anything outside the game area
    this.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    // First half: team 0 attacks right (also resets after a restart mid-match)
    setSidesSwapped(false);
    // A random stadium every match (?stadium=narodowy|blokowisko forces one, for testing)
    const forced = new URLSearchParams(window.location.search).get('stadium');
    this.stadium = (STADIUMS as readonly string[]).includes(forced ?? '')
      ? (forced as StadiumId)
      : STADIUMS[Math.floor(Math.random() * STADIUMS.length)];
    new Pitch(this, this.stadium);
    this.ball = new Ball(this, PITCH_CX, PITCH_CY, this.stadium === 'blokowisko' ? 'ball_rag' : 'ball');

    // Humans use their chosen formations; a CPU team picks one at random each match
    const randomFormation = () => FORMATION_IDS[Math.floor(Math.random() * FORMATION_IDS.length)];
    const formationFor = (team: number): FormationId => {
      const playerIndex = this.humanTeams.indexOf(team);
      if (playerIndex === 0) return settings.formation;
      if (playerIndex === 1) return settings.formationP2;
      return randomFormation();
    };
    this.formations = [formationFor(0), formationFor(1)];

    const teams: [Player[], Player[]] = [[], []];
    for (let t = 0; t < 2; t++) {
      FORMATIONS[this.formations[t]].forEach((pos, i) => {
        const home = formationPosition(t, pos);
        teams[t].push(new Player(this, t * 10 + i, t, pos, home.x, home.y));
      });
    }
    this.world = {
      ball: this.ball,
      players: [...teams[0], ...teams[1]],
      teams,
      controlled: [null, null],
      stats: createStats(),
    };

    const difficulty = AI_PROFILES[settings.difficulty];
    const profileFor = (team: number) => (this.humanTeams.includes(team) ? TEAMMATE_PROFILE : difficulty);
    this.profiles = [profileFor(0), profileFor(1)];

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

    // Humans and their input devices
    const ctx: HumanContext = {
      scene: this,
      world: this.world,
      actions: this.actions,
      matchState: () => this.match.state,
      sim: () => this.sim,
      startSupportRun: (p) => this.startSupportRun(p, 'human'),
    };
    const inputFrom = (...sources: InputSource[]) => {
      const input = new InputSystem();
      for (const s of sources) input.addSource(s);
      return input;
    };
    this.humans = this.humanTeams.map((team, i) => {
      let input: InputSystem;
      if (this.sceneData.simTwoPlayer) {
        // Test: one bot per team, each through its own HumanController
        input = inputFrom(new BotInput(() => this.world, undefined, team));
      } else if (this.mode === '2p') {
        // P1 = keyboard (+ pad 1 when two pads are connected), P2 = pad 2 (or pad 1
        // when only one is connected). Re-evaluated every frame, so plugging a pad
        // in mid-match works.
        input = i === 0
          ? inputFrom(new KeyboardInput(this), new GamepadInput(() => padForPlayer(connectedPads(), 1)))
          : inputFrom(new GamepadInput(() => padForPlayer(connectedPads(), 2)));
      } else {
        input = inputFrom(new KeyboardInput(this), new GamepadInput());
        if (this.sceneData.simHuman) {
          this.bot = new BotInput(() => this.world, () => this.sim?.event('keeperHeldShoot'));
          input.addSource(this.bot);
        }
      }
      return new HumanController(ctx, team, input, i === 1 ? 'p2' : 'p1');
    });
    this.padEdges.sync();

    // UI
    const tags = this.humans.map((h, i) => ({ team: h.team, label: `P${i + 1}` }));
    this.hud = new HUD(this, tags, this.mode === '1p' && this.humans.length > 0 ? settings.difficulty : undefined);
    this.overlay = new MatchOverlay(this);
    this.pauseMenu = new PauseMenu(this, {
      onResume: () => this.resume(),
      onRestart: () => this.restartMatch(),
      onMainMenu: () => this.scene.start('MenuScene'),
      formations: this.humans.map((h, i) => ({
        label: this.mode === '2p' ? t().playerFormation(i + 1) : t().formation,
        value: this.formations[h.team],
        onChange: (id: FormationId) => {
          this.changeFormation(h.team, id);
          // Also used for the next matches
          if (i === 0) settings.formation = id;
          else settings.formationP2 = id;
          saveSettings();
        },
      })),
    });
    this.fx = this.add.graphics().setDepth(60);

    const kb = this.input.keyboard;
    kb?.on('keydown-ESC', this.onEscKey, this);
    kb?.on('keydown-P', this.onPauseKey, this);
    kb?.on('keydown-M', this.onMuteKey, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    if (this.sceneData.sim) {
      this.sim = new SimReport(this.sceneData.simIndex ?? 0);
      if (this.sceneData.simHuman) this.scheduleScriptedTests();
    }

    this.resetPositions();
    this.match.startKickoff();
    this.overlay.showBanner(t().kickOffBanner, t().stadiumName(this.stadium));
    this.sim?.event(`stadium_${this.stadium}`);
    soundManager.playMusic('match');
    soundManager.startCrowd();
    soundManager.whistle();
  }

  // ================================================================ frame

  update(_time: number, delta: number): void {
    // Controller Menu / View buttons (pause, mute). While paused, the pause
    // menu itself handles A/B and the stick; Menu toggles back to the game.
    for (const cmd of this.padEdges.poll()) {
      if (cmd === 'pause') this.togglePause();
      else if (cmd === 'mute') soundManager.toggle();
    }

    let dt = Math.min(delta, 50) / 1000;
    // Goal slow motion: the world runs slower and the match timers wait
    // (the celebration starts only after it)
    let matchMs = dt * 1000;
    if (this.pendingGoal) {
      this.slowMoMs -= dt * 1000;
      if (this.slowMoMs <= 0) this.endGoalSlowMo();
      else {
        dt *= MATCH.goalSlowMoScale;
        matchMs = 0;
      }
    }
    const state = this.match.update(matchMs);
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
    this.fx.clear();
    for (const h of this.humans) h.drawFx(this.fx);
  }

  private simulate(dt: number): void {
    for (const h of this.humans) h.update(dt);

    for (let t = 0; t < 2; t++) {
      this.ai.updateTeam(t, dt, this.profiles[t], this.world.controlled[t]);
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

  /**
   * After a pass, the passer keeps joining the attack (see AISystem.supportRun).
   * Used for human passes and for AI passes (via AISystem.onFieldPass).
   */
  private startSupportRun(passer: Player, by: 'human' | 'ai'): void {
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

  private onPossession(p: Player, previousTeam: number | null): void {
    this.sim?.event('possession');
    for (const h of this.humans) h.onPossession(p, previousTeam);
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
        // Test check: the goal slow-motion zoom has ended before the restart
        if (this.sim && from === 'goal_scored') {
          this.sim.event(this.cameras.main.zoom === 1 && this.hudVisible() ? 'goalSlowMoOk' : 'goalZoomStuck');
        }
        if (from === 'halftime' && this.sim) {
          // Test check: everyone lines up in their (new) own half, team 0's keeper on the right
          const inOwnHalf = this.world.players.every((q) => (q.x - PITCH_CX) * attackDir(q.teamIndex) <= 0);
          const keeper0Right = this.world.teams[0][0].x > PITCH_CX;
          this.sim.event(inOwnHalf && keeper0Right ? 'swapOk' : 'swapWrong');
        }
        this.overlay.setDim(0);
        this.overlay.showBanner(t().kickOffBanner, from === 'halftime' ? t().secondHalf : '');
        soundManager.whistle();
        break;
      case 'playing':
        this.overlay.hideBanner();
        this.overlay.setDim(0);
        break;
      case 'halftime': {
        const [a, b] = this.match.data.score;
        this.overlay.setDim(0.35);
        this.overlay.showBanner(t().halfTime, `${TEAMS[0].shortName} ${a} - ${b} ${TEAMS[1].shortName}`);
        soundManager.whistleLong();
        this.time.delayedCall(1600, () => soundManager.jingle('halftime'));
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
    else if (this.humanTeams.includes(1 - scoringTeam)) {
      const kicker = this.world.players.find((q) => q.id === this.ball.lastKickerId);
      if (kicker?.role === 'goalkeeper') this.sim?.event('humanKeeperOwnGoal');
    }

    soundManager.goal();
    for (const h of this.humans) h.chargeKind = null;

    // Slow motion with the camera zoomed on the goal first; the banner,
    // confetti and celebration follow in celebrateGoal(). The HUD would be
    // zoomed with the world, so it is hidden meanwhile.
    this.pendingGoal = { team: scoringTeam, ownGoal };
    this.slowMoMs = MATCH.goalSlowMoMs;
    this.hud.setVisible(false);
    const cam = this.cameras.main;
    cam.flash(120, 255, 255, 255);
    cam.zoomTo(MATCH.goalSlowMoZoom, 300, 'Sine.easeOut');
    cam.pan(this.ball.x, this.ball.y, 300, 'Sine.easeOut');
  }

  private hudVisible(): boolean {
    return this.hud.visible;
  }

  /**
   * Ends the goal slow motion and starts the celebration.
   * @param instant snap the camera back (when pausing) instead of easing
   */
  private endGoalSlowMo(instant = false): void {
    const goal = this.pendingGoal;
    if (!goal) return;
    this.pendingGoal = null;
    this.slowMoMs = 0;
    const cam = this.cameras.main;
    if (instant) {
      cam.panEffect.reset();
      cam.zoomEffect.reset();
      cam.setZoom(1);
      cam.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    } else {
      cam.zoomTo(1, 350, 'Sine.easeInOut');
      cam.pan(GAME_WIDTH / 2, GAME_HEIGHT / 2, 350, 'Sine.easeInOut');
    }
    this.hud.setVisible(true);

    const team = goal.team;
    this.overlay.setDim(0.2);
    this.overlay.showGoal(goal.ownGoal ? t().ownGoal(TEAMS[team].name) : TEAMS[team].name);
    if (!instant) cam.shake(300, 0.008);
    soundManager.jingle('goal');
    for (const p of this.world.teams[team]) p.setPose('celebrate', MATCH.goalCelebrationDuration);
    this.burstConfetti(this.ball.x, this.ball.y, TEAMS[team].uiColor);
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
    for (const h of this.humans) h.chargeKind = null;
    const d = this.match.data;
    const s = this.world.stats;
    const winner = this.match.getWinner();

    let resultText: string;
    let resultColor = '#ffffff';
    if (this.mode === '2p') {
      if (winner === -1) resultText = t().draw;
      else {
        resultText = t().playerWins(this.humanTeams.indexOf(winner) + 1, TEAMS[winner].name);
        resultColor = '#66ff88';
      }
    } else if (this.humans.length > 0) {
      if (winner === -1) resultText = t().draw;
      else if (winner === this.humans[0].team) {
        resultText = t().youWin;
        resultColor = '#66ff88';
      } else {
        resultText = t().youLose;
        resultColor = '#ff7766';
      }
    } else {
      resultText = winner === -1 ? t().draw : t().teamWins(TEAMS[winner].name);
    }

    // Music stops; after the whistles a jingle for the result
    soundManager.stopMusic();
    const lost = this.mode === '1p' && this.humans.length > 0 && winner !== -1 && winner !== this.humans[0].team;
    const jingle = winner === -1 ? 'draw' : lost ? 'lose' : 'win';
    this.time.delayedCall(1600, () => soundManager.jingle(jingle));

    const totalPoss = s.possessionMs[0] + s.possessionMs[1] || 1;
    const poss0 = Math.round((s.possessionMs[0] / totalPoss) * 100);
    const info: FulltimeInfo = {
      title: t().fullTime,
      scoreLine: `${TEAMS[0].shortName}  ${d.score[0]} - ${d.score[1]}  ${TEAMS[1].shortName}`,
      resultText,
      resultColor,
      statLines: [
        [`${poss0}%`, t().statPossession, `${100 - poss0}%`],
        [`${s.shots[0]}`, t().statShots, `${s.shots[1]}`],
        [`${s.onTarget[0]}`, t().statOnTarget, `${s.onTarget[1]}`],
        [`${s.passes[0]}`, t().statPasses, `${s.passes[1]}`],
        [`${s.tackles[0]}`, t().statTackles, `${s.tackles[1]}`],
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

  /**
   * Switch a team to another formation mid-match: each player keeps his index
   * and takes over that slot's role and home position.
   */
  private changeFormation(team: number, id: FormationId): void {
    if (this.formations[team] === id) return;
    this.formations[team] = id;
    const slots = FORMATIONS[id];
    this.world.teams[team].forEach((p, i) => p.setFormationSlot(slots[i], formationPosition(team, slots[i])));
    this.ai.reset(); // re-think shape positions right away
    this.sim?.event('formationChanged');
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

    // Each human starts on his team's kickoff taker / most central forward
    for (const h of this.humans) {
      const idx = kickoffTakerIndex(FORMATIONS[this.formations[h.team]]);
      h.resetForKickoff(this.world.teams[h.team][idx]);
    }
  }

  // ================================================================ pause

  // Each shortcut handles a given key event only once (see createEventDeduper)
  private readonly escOnce = createEventDeduper();
  private readonly pauseKeyOnce = createEventDeduper();
  private readonly muteOnce = createEventDeduper();

  private onEscKey(event?: KeyboardEvent): void {
    if (event && !this.escOnce(event)) return;
    // While paused the pause menu handles ESC itself
    if (!this.match.isPaused()) this.pause(event);
  }

  private onPauseKey(event?: KeyboardEvent): void {
    if (event && !this.pauseKeyOnce(event)) return;
    this.togglePause(event);
  }

  private onMuteKey(event?: KeyboardEvent): void {
    if (event && !this.muteOnce(event)) return;
    soundManager.toggle();
  }

  private onBlur(): void {
    // Auto-pause when the window loses focus
    if (this.humans.length > 0 && !this.sceneData.sim && this.scene.isActive()) this.pause();
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
    this.endGoalSlowMo(true); // the pause menu must not be zoomed
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
    for (const h of this.humans) h.input.sync();
    this.resumedAt = performance.now();
  }

  private restartMatch(): void {
    this.scene.restart({ ...this.sceneData, simIndex: this.sceneData.simIndex });
  }

  // ===================================================== scripted tests

  /** Bot-as-human sim only: scripted checks of pause, formation change, keeper and pad. */
  private scheduleScriptedTests(): void {
    const human = this.humans[0];
    // Pause with real ESC key events, change formation in the pause menu
    // (↓ to FORMATION, → to switch), then ESC again to resume.
    this.time.delayedCall(4000, () => {
      pressKey('Escape', 27);
      this.time.delayedCall(500, () => {
        if (this.match.isPaused()) this.sim?.event('paused');
        const team = human.team;
        const before = this.formations[team];
        pressKey('ArrowDown', 40);
        pressKey('ArrowRight', 39);
        // Phaser handles queued key events on the next frame
        this.time.delayedCall(150, () => {
          const after = this.formations[team];
          const slots = FORMATIONS[after];
          const rolesOk = this.world.teams[team].every((p, i) => p.role === slots[i].role);
          this.sim?.event(after !== before && rolesOk ? 'formationChangeOk' : 'formationChangeWrong');
          pressKey('Escape', 27);
          this.time.delayedCall(300, () => {
            if (!this.match.isPaused()) this.sim?.event('resumed');
            else this.resume();
          });
        });
      });
    });
    this.time.delayedCall(6000, () => this.keeperHeldKeyTest(0));
    this.time.delayedCall(15000, () => this.padPauseTest(0));
  }

  /**
   * Our forward gets the ball and starts charging a shot (shoot held); mid-charge
   * our keeper takes the ball. Because the key is still held, the keeper must NOT
   * kick (the hold is swallowed by InputSystem.sync when control passes to him).
   */
  private keeperHeldKeyTest(attempt: number): void {
    const bot = this.bot;
    const human = this.humans[0];
    if (!bot || !human || attempt > 6) return;
    const retry = () => {
      bot.override = null;
      this.time.delayedCall(1000, () => this.keeperHeldKeyTest(attempt + 1));
    };
    if (this.match.state !== 'playing') return retry();

    const team = this.world.teams[human.team];
    const forward = team.find((q) => q.role === 'forward');
    const keeper = team.find((q) => q.role === 'goalkeeper');
    if (!forward || !keeper) return;

    bot.override = 'release'; // make sure the next shoot press is a fresh one
    this.time.delayedCall(100, () => {
      if (this.match.state !== 'playing') return retry();
      this.collisions.givePossession(forward);
      bot.override = 'holdShoot';
      this.time.delayedCall(250, () => {
        const charging = human.chargeKind === 'shoot' && forward.hasBall;
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

  /** A fake Xbox controller presses Menu (must pause), then B (pause menu "back" must resume). */
  private padPauseTest(attempt: number): void {
    if (attempt > 6) return;
    if (this.match.state !== 'playing') {
      this.time.delayedCall(1000, () => this.padPauseTest(attempt + 1));
      return;
    }
    const w = window as unknown as { __RF_FAKE_PAD__?: PadState };
    const fakePad = (held: number[]): PadState => ({
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: held.includes(i), value: held.includes(i) ? 1 : 0 })),
      axes: [0, 0, 0, 0],
    });
    const press = (button: number, then: () => void) => {
      w.__RF_FAKE_PAD__ = fakePad([button]);
      this.time.delayedCall(100, () => {
        w.__RF_FAKE_PAD__ = fakePad([]);
        this.time.delayedCall(100, then);
      });
    };
    w.__RF_FAKE_PAD__ = fakePad([]);
    this.time.delayedCall(50, () => press(PAD.MENU, () => {
      if (this.match.isPaused()) this.sim?.event('padPaused');
      press(PAD.B, () => {
        if (!this.match.isPaused()) this.sim?.event('padResumed');
        else this.resume();
        delete w.__RF_FAKE_PAD__;
      });
    }));
  }

  // ============================================================= teardown

  private onShutdown(): void {
    const kb = this.input.keyboard;
    kb?.off('keydown-ESC', this.onEscKey, this);
    kb?.off('keydown-P', this.onPauseKey, this);
    kb?.off('keydown-M', this.onMuteKey, this);
    this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
    for (const h of this.humans) h.destroy();
    this.humans = [];
    this.sim = null;
    soundManager.stopCrowd();
  }
}
