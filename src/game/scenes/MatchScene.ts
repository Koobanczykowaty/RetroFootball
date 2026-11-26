// ============================================================
// MatchScene — The client of one match. The match itself runs in the
// core (core/MatchSimulation: no Phaser). This scene sets the match
// up (teams, kits, stadium, formations, humans and their devices),
// feeds the simulation each frame with the elapsed time and every
// human's raw input, draws the world (PlayerView, BallView, HumanHud,
// HUD) and turns the simulation's events into sounds, banners,
// camera effects and the full-time panel. Pause menu, tournament
// results and the scripted simulation tests live here too.
// ============================================================

import Phaser from 'phaser';
import {
  AI_PROFILES, FORMATION_IDS, FORMATIONS, FormationId, GAME_HEIGHT, GAME_SPEED_SCALE, GAME_WIDTH, MATCH, STADIUMS, StadiumId,
  TEAMMATE_PROFILE, TEAMS, TeamConfig,
} from '../../core/config/GameplayConfig';
import type { MatchEvent } from '../../core/MatchEvents';
import { MatchSimulation } from '../../core/MatchSimulation';
import { recordResult } from '../../core/logic/Tournament';
import type { MatchState } from '../../core/systems/MatchSystem';
import type { InputSource, RawInput } from '../../core/systems/InputTypes';
import { AssetGenerator } from '../assets/AssetGenerator';
import { BotInput } from '../debug/BotInput';
import { SimReport, recordSimMatch } from '../debug/SimReport';
import { saveSettings, settings } from '../config/Settings';
import { cycleTeam, setMatchTeams, teamWithKits } from '../config/Teams';
import { t } from '../config/i18n';
import { loadTournament, recordAndSave } from '../config/TournamentStore';
import { Pitch } from '../entities/Pitch';
import { GamepadInput, PAD, PadEdges, PadState, connectedPads, padForPlayer } from '../systems/Gamepad';
import { InputSystem, KeyboardInput } from '../systems/InputSystem';
import { soundManager } from '../systems/SoundManager';
import { HUD } from '../ui/HUD';
import { FulltimeInfo, MatchOverlay } from '../ui/MatchOverlay';
import { createEventDeduper } from '../ui/MenuNavigator';
import { PauseMenu } from '../ui/PauseMenu';
import { BallView } from '../view/BallView';
import { HumanHud } from '../view/HumanHud';
import { PlayerView } from '../view/PlayerView';

/** '1p' Quick Match, '2p' P1 against P2, 'coop' P1 and P2 together against the CPU. */
export type GameMode = '1p' | '2p' | 'coop';

export interface MatchSceneData {
  /**
   * Side the keyboard human plays (default 0). The teams on the sides come
   * from settings.teamP1 (side 0) and settings.teamP2 (side 1).
   */
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
  /** In simulation, co-op mode with two bots on team 0 against the CPU. */
  simCoop?: boolean;
  /** In simulation, play as a cup match (a draw goes to extra time and a golden goal). */
  simCup?: boolean;
  /** Fixed seed for the match (testing); otherwise a random one. */
  seed?: number;
  /** A tournament match (see TournamentScene); the result is saved at full time. */
  tournament?: TournamentMatch;
}

/** A tournament fixture to play: home team on side 0. */
export interface TournamentMatch {
  /** Index into Tournament.fixtures. */
  fixture: number;
  home: string;
  away: string;
  /** Sides played by people: none (watch), one (vs CPU) or both (P1 home, P2 away). */
  humanSides: number[];
  /** Cup match: must have a winner. */
  cup: boolean;
}

/** A fresh random seed for a new match (the core itself never uses Math.random). */
function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
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
  private simulation!: MatchSimulation;
  private playerViews: PlayerView[] = [];
  private ballView!: BallView;
  private huds: HumanHud[] = [];
  private hud!: HUD;
  private overlay!: MatchOverlay;
  private pauseMenu!: PauseMenu;
  private fx!: Phaser.GameObjects.Graphics;

  private sceneData: MatchSceneData = {};
  private mode: GameMode = '1p';
  /** Teams controlled by humans, in player order (P1 first; the same team twice in co-op). */
  private humanTeams: number[] = [];
  /** Each human's input devices, in player order. */
  private devices: InputSystem[] = [];
  private resumedAt = 0;
  private wasPowerShot = false;
  private stadium: StadiumId = 'narodowy';
  /** The two teams of this match by side, with the user's kits. */
  private teams!: [TeamConfig, TeamConfig];
  private sim: SimReport | null = null;
  private bot: BotInput | null = null;
  /** Controller Menu/View presses (pause, mute) — any controller. */
  private readonly padEdges = new PadEdges();

  constructor() {
    super({ key: 'MatchScene' });
  }

  init(data: MatchSceneData): void {
    this.sceneData = { ...data };
    this.mode = data.sim ? (data.simTwoPlayer ? '2p' : data.simCoop ? 'coop' : '1p') : (data.mode ?? '1p');
    const keyboardTeam = data.playerTeam ?? 0;
    const tour = data.tournament;
    if (tour) {
      // One human plays against the CPU like Quick Match; two play each other (P1 = home)
      this.humanTeams = [...tour.humanSides].sort();
      this.mode = this.humanTeams.length === 2 ? '2p' : '1p';
    } else if (data.sim && data.simTwoPlayer) this.humanTeams = [0, 1];
    else if (data.sim && data.simCoop) this.humanTeams = [0, 0];
    else if (data.sim) this.humanTeams = data.simHuman ? [0] : [];
    else if (this.mode === '2p') this.humanTeams = [keyboardTeam, 1 - keyboardTeam];
    else if (this.mode === 'coop') this.humanTeams = [keyboardTeam, keyboardTeam];
    else this.humanTeams = [keyboardTeam];
    this.devices = [];
    this.huds = [];
    this.playerViews = [];
    this.wasPowerShot = false;
    this.bot = null;
  }

  private get world() {
    return this.simulation.world;
  }

  create(): void {
    // A restart from the pause menu must not inherit paused tweens
    this.tweens.resumeAll();
    // The goal zoom must not show anything outside the game area
    this.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    // The two teams (with the user's kits) and their match sprites, before any player exists
    // (the simulation picks two random teams, so every team gets played)
    let ids = [settings.teamP1, settings.teamP2];
    if (this.sceneData.tournament) {
      ids = [this.sceneData.tournament.home, this.sceneData.tournament.away];
    } else if (this.sceneData.sim) {
      const a = TEAMS[Math.floor(Math.random() * TEAMS.length)].id;
      ids = [a, cycleTeam(a, 1 + Math.floor(Math.random() * (TEAMS.length - 1)))];
    }
    this.teams = [teamWithKits(ids[0], settings.kits), teamWithKits(ids[1], settings.kits)];
    setMatchTeams(this.teams);
    AssetGenerator.generatePlayerSprites(this, this.teams);
    // A random stadium every match (?stadium=narodowy|blokowisko forces one, for testing)
    const forced = new URLSearchParams(window.location.search).get('stadium');
    this.stadium = (STADIUMS as readonly string[]).includes(forced ?? '')
      ? (forced as StadiumId)
      : STADIUMS[Math.floor(Math.random() * STADIUMS.length)];
    new Pitch(this, this.stadium);

    // Humans use their chosen formations; a CPU team picks one at random each match
    // (co-op: one shared formation, settings.formation)
    const randomFormation = () => FORMATION_IDS[Math.floor(Math.random() * FORMATION_IDS.length)];
    const formationFor = (team: number): FormationId => {
      const playerIndex = this.humanTeams.indexOf(team);
      if (playerIndex === 0) return settings.formation;
      if (playerIndex === 1) return settings.formationP2;
      return randomFormation();
    };
    const difficulty = AI_PROFILES[settings.difficulty];
    const profileFor = (team: number) => (this.humanTeams.includes(team) ? TEAMMATE_PROFILE : difficulty);

    if (this.sceneData.sim) this.sim = new SimReport(this.sceneData.simIndex ?? 0);

    // The match itself (core)
    this.simulation = new MatchSimulation({
      seed: this.sceneData.seed ?? randomSeed(),
      minutes: this.sceneData.sim ? (this.sceneData.simMinutes ?? 1) : settings.matchMinutes,
      mustHaveWinner: this.sceneData.tournament?.cup ?? !!this.sceneData.simCup,
      formations: [formationFor(0), formationFor(1)],
      profiles: [profileFor(0), profileFor(1)],
      humans: this.humanTeams.map((team, i) => ({
        team,
        marker: i === 1 ? 'p2' : 'p1',
        passAssist: settings.passAssist,
        lobAssist: settings.lobAssist,
      })),
      speedScale: GAME_SPEED_SCALE[settings.gameSpeed],
      telemetry: this.sim,
    });

    // Views
    this.playerViews = this.world.players.map((p) => new PlayerView(this, p));
    this.ballView = new BallView(this, this.world.ball, this.stadium === 'blokowisko' ? 'ball_rag' : 'ball');

    // Each human's input devices
    const inputFrom = (...sources: InputSource[]) => {
      const input = new InputSystem();
      for (const s of sources) input.addSource(s);
      return input;
    };
    this.devices = this.humanTeams.map((team, i) => {
      if (this.sceneData.simTwoPlayer || this.sceneData.simCoop) {
        // Test: one bot per human, each through its own HumanControl
        return inputFrom(new BotInput(() => this.world, undefined, team,
          () => this.simulation.humans[i]?.controlled ?? null));
      }
      if (this.mode === '2p' || this.mode === 'coop') {
        // P1 = keyboard (+ pad 1 when two pads are connected), P2 = pad 2 (or pad 1
        // when only one is connected). Re-evaluated every frame, so plugging a pad
        // in mid-match works.
        return i === 0
          ? inputFrom(new KeyboardInput(this), new GamepadInput(() => padForPlayer(connectedPads(), 1)))
          : inputFrom(new GamepadInput(() => padForPlayer(connectedPads(), 2)));
      }
      const input = inputFrom(new KeyboardInput(this), new GamepadInput());
      if (this.sceneData.simHuman) {
        this.bot = new BotInput(() => this.world, () => this.sim?.event('keeperHeldShoot'));
        input.addSource(this.bot);
      }
      return input;
    });
    this.huds = this.simulation.humans.map((h) => new HumanHud(this, this.simulation, h));
    this.padEdges.sync();

    // UI
    const tags = this.simulation.humans.map((h, i) => ({ team: h.team, label: `P${i + 1}` }));
    this.hud = new HUD(this, tags, this.mode !== '2p' && this.humanTeams.length > 0 ? settings.difficulty : undefined);
    this.overlay = new MatchOverlay(this);
    const humans = this.simulation.humans;
    this.pauseMenu = new PauseMenu(this, {
      onResume: () => this.resume(),
      onRestart: () => this.restartMatch(),
      onMainMenu: () => this.scene.start('MenuScene'),
      // Co-op: one row for the shared formation (either player can change it)
      formations: (this.mode === 'coop' ? humans.slice(0, 1) : humans).map((h, i) => ({
        label: this.mode === '2p' ? t().playerFormation(i + 1) : t().formation,
        value: this.simulation.formations[h.team],
        onChange: (id: FormationId) => {
          this.simulation.changeFormation(h.team, id);
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

    if (this.sceneData.simHuman) this.scheduleScriptedTests();

    this.syncMarkers();
    this.overlay.showBanner(t().kickOffBanner, t().stadiumName(this.stadium));
    this.sim?.event(`stadium_${this.stadium}`);
    this.sim?.event(`teams_${this.teams[0].id}_${this.teams[1].id}`);
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

    this.simulation.step(Math.min(delta, 50), this.readInputs());
    this.processEvents();

    // Power shot feedback
    const ball = this.world.ball;
    if (ball.isPowerShot && !this.wasPowerShot) this.cameras.main.shake(120, 0.003);
    this.wasPowerShot = ball.isPowerShot;

    // Draw
    const dt = this.simulation.lastDt;
    this.syncMarkers();
    for (const v of this.playerViews) v.update(dt * 1000);
    this.ballView.update(dt);
    const m = this.simulation.match;
    this.hud.update(m.data, m.getFormattedTime(), !soundManager.enabled);
    this.fx.clear();
    for (const h of this.huds) h.draw(this.fx);
  }

  /** What every human holds right now, in player order. */
  private readInputs(): RawInput[] {
    return this.devices.map((d) => d.read());
  }

  /** Selection markers follow whoever each human steers. */
  private syncMarkers(): void {
    const marks = new Map<number, 'p1' | 'p2'>();
    for (const h of this.simulation.humans) if (h.controlled) marks.set(h.controlled.id, h.marker);
    for (const v of this.playerViews) v.setMarker(marks.get(v.player.id) ?? null);
  }

  // =========================================================== events

  private processEvents(): void {
    for (const e of this.simulation.drainEvents()) this.onEvent(e);
  }

  private onEvent(e: MatchEvent): void {
    switch (e.type) {
      case 'sound':
        soundManager[e.cue]();
        break;
      case 'state':
        this.onStateChange(e.from, e.to);
        break;
      case 'goal':
        this.onGoal(e.x, e.y);
        break;
      case 'celebrate':
        this.celebrate(e.team, e.ownGoal, e.x, e.y, e.instant);
        break;
      case 'goldenGoal':
        this.overlay.showBanner(t().goldenGoal, t().nextGoalWins);
        soundManager.whistle();
        this.time.delayedCall(2200, () => {
          if (this.simulation.state === 'playing') this.overlay.hideBanner();
        });
        break;
    }
  }

  private onStateChange(from: MatchState, to: MatchState): void {
    switch (to) {
      case 'kickoff':
        this.ballView.clearTrail();
        // Test check: the goal slow-motion zoom has ended before the restart
        if (this.sim && from === 'goal_scored') {
          this.sim.event(this.cameras.main.zoom === 1 && this.hud.visible ? 'goalSlowMoOk' : 'goalZoomStuck');
        }
        this.overlay.setDim(0);
        this.overlay.showBanner(
          t().kickOffBanner,
          from === 'halftime' ? t().secondHalf : from === 'extratime' ? t().extraTime : '',
        );
        soundManager.whistle();
        break;
      case 'playing':
        this.overlay.hideBanner();
        this.overlay.setDim(0);
        break;
      case 'halftime': {
        const [a, b] = this.simulation.match.data.score;
        this.overlay.setDim(0.35);
        this.overlay.showBanner(t().halfTime, `${this.teams[0].shortName} ${a} - ${b} ${this.teams[1].shortName}`);
        soundManager.whistleLong();
        this.time.delayedCall(1600, () => soundManager.jingle('halftime'));
        break;
      }
      case 'extratime': {
        const [a, b] = this.simulation.match.data.score;
        this.overlay.setDim(0.35);
        this.overlay.showBanner(t().extraTime, `${this.teams[0].shortName} ${a} - ${b} ${this.teams[1].shortName}`);
        soundManager.whistleLong();
        break;
      }
      case 'fulltime':
        this.onFulltime();
        break;
      default:
        break;
    }
  }

  /**
   * Goal: slow motion with the camera zoomed on the ball first; the banner,
   * confetti and celebration follow in celebrate(). The HUD would be zoomed
   * with the world, so it is hidden meanwhile.
   */
  private onGoal(x: number, y: number): void {
    soundManager.goal();
    this.hud.setVisible(false);
    const cam = this.cameras.main;
    cam.flash(120, 255, 255, 255);
    cam.zoomTo(MATCH.goalSlowMoZoom, 300, 'Sine.easeOut');
    cam.pan(x, y, 300, 'Sine.easeOut');
  }

  /** @param instant snap the camera back (when pausing) instead of easing */
  private celebrate(team: number, ownGoal: boolean, x: number, y: number, instant: boolean): void {
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

    this.overlay.setDim(0.2);
    this.overlay.showGoal(ownGoal ? t().ownGoal(this.teams[team].name) : this.teams[team].name);
    if (!instant) cam.shake(300, 0.008);
    soundManager.jingle('goal');
    this.burstConfetti(x, y, this.teams[team].uiColor);
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
    const m = this.simulation.match;
    const d = m.data;
    const s = this.world.stats;
    const winner = m.getWinner();
    const humans = this.simulation.humans;

    let resultText: string;
    let resultColor = '#ffffff';
    if (this.mode === '2p') {
      if (winner === -1) resultText = t().draw;
      else {
        resultText = t().playerWins(this.humanTeams.indexOf(winner) + 1, this.teams[winner].name);
        resultColor = '#66ff88';
      }
    } else if (humans.length > 0) {
      if (winner === -1) resultText = t().draw;
      else if (winner === humans[0].team) {
        resultText = t().youWin;
        resultColor = '#66ff88';
      } else {
        resultText = t().youLose;
        resultColor = '#ff7766';
      }
    } else {
      resultText = winner === -1 ? t().draw : t().teamWins(this.teams[winner].name);
    }

    // Music stops; after the whistles a jingle for the result
    soundManager.stopMusic();
    const lost = this.mode !== '2p' && humans.length > 0 && winner !== -1 && winner !== humans[0].team;
    const jingle = winner === -1 ? 'draw' : lost ? 'lose' : 'win';
    this.time.delayedCall(1600, () => soundManager.jingle(jingle));

    if (d.extraTime) resultText = `${resultText} (${t().afterExtraTimeShort})`;
    const totalPoss = s.possessionMs[0] + s.possessionMs[1] || 1;
    const poss0 = Math.round((s.possessionMs[0] / totalPoss) * 100);
    const info: FulltimeInfo = {
      title: t().fullTime,
      scoreLine: `${this.teams[0].shortName}  ${d.score[0]} - ${d.score[1]}  ${this.teams[1].shortName}`,
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
    if (this.sceneData.tournament) {
      // Save the result; the first button goes back to the tournament
      this.recordTournamentResult(this.sceneData.tournament);
      this.overlay.showFulltime(info, () => this.scene.start('TournamentScene'), () => this.scene.start('MenuScene'),
        t().continueButton);
    } else {
      this.overlay.showFulltime(info, () => this.restartMatch(), () => this.scene.start('MenuScene'));
    }

    if (this.sim) {
      const ai = this.simulation.ai;
      if (ai.feintBites) this.sim.add('feintBites', ai.feintBites);
      if (ai.aerialStrikes) this.sim.add('aiAerial', ai.aerialStrikes);
      const more = recordSimMatch(this.sim, d.score, s);
      const total = this.sceneData.simMatches ?? 1;
      const next = (this.sceneData.simIndex ?? 0) + 1;
      if (more && next < total) {
        this.time.delayedCall(300, () => this.scene.restart({ ...this.sceneData, simIndex: next }));
      }
    }
  }

  /** Store this match's result in the saved tournament (home = side 0). */
  private recordTournamentResult(match: TournamentMatch): void {
    const tour = loadTournament();
    if (!tour) return;
    const f = tour.fixtures[match.fixture];
    // Only if the saved tournament still has this fixture waiting
    if (!f || f.away === null || tour.teams[f.home].id !== match.home || tour.teams[f.away].id !== match.away) return;
    const d = this.simulation.match.data;
    recordAndSave(tour, (x) => recordResult(x, match.fixture, [d.score[0], d.score[1]], d.extraTime));
  }

  // ================================================================ pause

  // Each shortcut handles a given key event only once (see createEventDeduper)
  private readonly escOnce = createEventDeduper();
  private readonly pauseKeyOnce = createEventDeduper();
  private readonly muteOnce = createEventDeduper();

  private onEscKey(event?: KeyboardEvent): void {
    if (event && !this.escOnce(event)) return;
    // While paused the pause menu handles ESC itself
    if (!this.simulation.isPaused()) this.pause(event);
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
    if (this.humanTeams.length > 0 && !this.sceneData.sim && this.scene.isActive()) this.pause();
  }

  private togglePause(event?: KeyboardEvent): void {
    if (this.simulation.isPaused()) this.resume();
    else this.pause(event);
  }

  /** @param openedBy key event that triggered the pause (the menu ignores it). */
  private pause(openedBy?: KeyboardEvent): void {
    // Ignore the same key event that just closed the menu
    if (performance.now() - this.resumedAt < 150) return;
    if (!this.simulation.pause()) return;
    // A goal slow motion is cut short: the pause menu must not be zoomed
    this.processEvents();
    this.pauseMenu.show(openedBy);
    this.tweens.pauseAll();
  }

  private resume(): void {
    if (!this.simulation.isPaused()) return;
    // Keys held while the menu was open need a fresh press
    this.simulation.resume(this.readInputs());
    this.pauseMenu.hide();
    this.tweens.resumeAll();
    this.resumedAt = performance.now();
  }

  private restartMatch(): void {
    this.scene.restart({ ...this.sceneData, simIndex: this.sceneData.simIndex });
  }

  // ===================================================== scripted tests

  /** Bot-as-human sim only: scripted checks of pause, formation change, keeper and pad. */
  private scheduleScriptedTests(): void {
    const human = this.simulation.humans[0];
    // Pause with real ESC key events, change formation in the pause menu
    // (↓ to FORMATION, → to switch), then ESC again to resume.
    this.time.delayedCall(4000, () => {
      pressKey('Escape', 27);
      this.time.delayedCall(500, () => {
        if (this.simulation.isPaused()) this.sim?.event('paused');
        const team = human.team;
        const before = this.simulation.formations[team];
        pressKey('ArrowDown', 40);
        pressKey('ArrowRight', 39);
        // Phaser handles queued key events on the next frame
        this.time.delayedCall(150, () => {
          const after = this.simulation.formations[team];
          const slots = FORMATIONS[after];
          const rolesOk = this.world.teams[team].every((p, i) => p.role === slots[i].role);
          this.sim?.event(after !== before && rolesOk ? 'formationChangeOk' : 'formationChangeWrong');
          pressKey('Escape', 27);
          this.time.delayedCall(300, () => {
            if (!this.simulation.isPaused()) this.sim?.event('resumed');
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
   * kick (the hold is swallowed by the input sync when control passes to him).
   */
  private keeperHeldKeyTest(attempt: number): void {
    const bot = this.bot;
    const human = this.simulation.humans[0];
    if (!bot || !human || attempt > 6) return;
    const retry = () => {
      bot.override = null;
      this.time.delayedCall(1000, () => this.keeperHeldKeyTest(attempt + 1));
    };
    if (this.simulation.state !== 'playing') return retry();

    const team = this.world.teams[human.team];
    const forward = team.find((q) => q.role === 'forward');
    const keeper = team.find((q) => q.role === 'goalkeeper');
    if (!forward || !keeper) return;

    bot.override = 'release'; // make sure the next shoot press is a fresh one
    this.time.delayedCall(100, () => {
      if (this.simulation.state !== 'playing') return retry();
      this.simulation.collisions.givePossession(forward);
      bot.override = 'holdShoot';
      this.time.delayedCall(250, () => {
        const charging = human.chargeKind === 'shoot' && forward.hasBall;
        if (!charging || this.simulation.state !== 'playing') return retry();
        this.simulation.collisions.givePossession(keeper);
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
    if (this.simulation.state !== 'playing') {
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
      if (this.simulation.isPaused()) this.sim?.event('padPaused');
      press(PAD.B, () => {
        if (!this.simulation.isPaused()) this.sim?.event('padResumed');
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
    for (const d of this.devices) d.destroy();
    this.devices = [];
    for (const h of this.huds) h.destroy();
    this.huds = [];
    this.sim = null;
    soundManager.stopCrowd();
  }
}
