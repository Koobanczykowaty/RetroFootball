// ============================================================
// TournamentSetupScene — Start a league or a cup: the type, which
// teams take part (each played by a person or the CPU, 3-6 teams),
// CPU difficulty and match length. Starting replaces the saved
// tournament (the menu's CONTINUE resumes a saved one).
// ============================================================

import Phaser from 'phaser';
import { DIFFICULTIES, Difficulty, GAME_HEIGHT, GAME_WIDTH, MATCH, TEAMS } from '../config/GameplayConfig';
import { saveSettings, settings } from '../config/Settings';
import { t } from '../config/i18n';
import { hasTournamentInProgress, loadTrophies, saveTournament } from '../config/TournamentStore';
import { createTournament, MIN_TEAMS, TournamentKind } from '../logic/Tournament';
import { soundManager } from '../systems/SoundManager';
import { Button } from '../ui/Button';
import { MenuNavigator } from '../ui/MenuNavigator';
import { OptionSelector } from '../ui/OptionSelector';
import { UI, textStyle, titleStyle } from '../ui/Theme';

type Slot = 'human' | 'cpu' | 'out';
const SLOTS: Slot[] = ['human', 'cpu', 'out'];
const KINDS: TournamentKind[] = ['league', 'cup'];

export class TournamentSetupScene extends Phaser.Scene {
  private kind: TournamentKind = 'league';
  /** Per team id: played by a person, by the CPU, or not taking part. */
  private slots = new Map<string, Slot>();
  private message!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'TournamentSetupScene' });
  }

  create(): void {
    soundManager.playMusic('menu');
    const bg = this.add.graphics();
    bg.fillStyle(UI.background, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.add.text(GAME_WIDTH / 2, 30, t().tournament, titleStyle(30)).setOrigin(0.5);
    const trophies = loadTrophies();
    this.add.text(GAME_WIDTH / 2, 58, t().trophies(trophies.league, trophies.cup), textStyle(10, UI.textHighlight, true))
      .setOrigin(0.5);

    // Defaults: player 1's team is played by a person, the rest by the CPU
    this.slots = new Map(TEAMS.map((team) => [team.id, team.id === settings.teamP1 ? 'human' : 'cpu']));

    const cx = GAME_WIDTH / 2;
    const rowY = (i: number) => 84 + i * 36;
    const kind = new OptionSelector<TournamentKind>(
      this, cx, rowY(0), t().tournamentKind, KINDS, KINDS.indexOf(this.kind),
      (v) => t().kindName(v), (v) => { this.kind = v; },
    );
    const teamRows = TEAMS.map((team, i) => new OptionSelector<Slot>(
      this, cx, rowY(1 + i), team.name.toUpperCase(), SLOTS, SLOTS.indexOf(this.slots.get(team.id)!),
      (v) => t().slotValue(v),
      (v) => {
        this.slots.set(team.id, v);
        this.showMessage();
      },
    ));
    const difficulty = new OptionSelector<Difficulty>(
      this, cx, rowY(7), t().difficulty,
      DIFFICULTIES, Math.max(0, DIFFICULTIES.indexOf(settings.difficulty)),
      (v) => t().difficultyName(v),
      (v) => {
        settings.difficulty = v;
        saveSettings();
      },
    );
    const length = new OptionSelector<number>(
      this, cx, rowY(8), t().matchLength,
      MATCH.durationOptions, Math.max(0, MATCH.durationOptions.indexOf(settings.matchMinutes)),
      (v) => `${v} MIN`,
      (v) => {
        settings.matchMinutes = v;
        saveSettings();
      },
    );

    const start = new Button(this, cx, 418, t().startTournament, () => this.start(), {
      width: 240, height: 40, fontSize: 20, color: 0x2a8a4a, focusColor: 0x3fb066,
    });
    const back = new Button(this, cx, 462, t().back, () => this.scene.start('MenuScene'), {
      width: 140, height: 30, fontSize: 16,
    });
    this.message = this.add.text(cx, 494, '', textStyle(10, UI.textMuted, true)).setOrigin(0.5);
    this.showMessage();

    const items = [kind, ...teamRows, difficulty, length, start, back];
    new MenuNavigator(this, items, () => this.scene.start('MenuScene')).activate(items.indexOf(start));

    this.add.text(cx, GAME_HEIGHT - 16, t().setupHint, textStyle(11, UI.textMuted)).setOrigin(0.5);
  }

  private playing(): number {
    return [...this.slots.values()].filter((s) => s !== 'out').length;
  }

  /** Too few teams (red), or a reminder that a saved tournament will be replaced. */
  private showMessage(error = false): void {
    if (this.playing() < MIN_TEAMS) {
      this.message.setText(t().tooFewTeams).setColor(error ? '#ff7766' : UI.textMuted);
    } else {
      this.message.setText(hasTournamentInProgress() ? t().replacesSaved : '').setColor(UI.textMuted);
    }
  }

  private start(): void {
    if (this.playing() < MIN_TEAMS) {
      this.showMessage(true);
      return;
    }
    const teams = TEAMS
      .filter((team) => this.slots.get(team.id) !== 'out')
      .map((team) => ({ id: team.id, human: this.slots.get(team.id) === 'human' }));
    saveTournament(createTournament(this.kind, teams));
    this.scene.start('TournamentScene');
  }
}
