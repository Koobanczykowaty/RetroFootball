// ============================================================
// TeamSelectScene — Quick Match setup: pick a team, match length
// and difficulty, then kick off.
// ============================================================

import Phaser from 'phaser';
import {
  DIFFICULTIES, Difficulty, FORMATION_IDS, FormationId, GAME_WIDTH, GAME_HEIGHT, MATCH,
} from '../config/GameplayConfig';
import { TWO_PLAYER_MODES, TwoPlayerMode, saveSettings, settings } from '../config/Settings';
import { t } from '../config/i18n';
import { cycleTeam, teamWithKits } from '../config/Teams';
import { soundManager } from '../systems/SoundManager';
import { Button, Focusable } from '../ui/Button';
import { MenuNavigator } from '../ui/MenuNavigator';
import { OptionSelector } from '../ui/OptionSelector';
import { connectedPads } from '../systems/Gamepad';
import type { GameMode, MatchSceneData } from './MatchScene';
import { UI, drawPanel, textStyle, titleStyle } from '../ui/Theme';

/**
 * One team card (left = player 1, right = opponent / player 2). Left/Right
 * (or the ◀ ▶ arrows, or a click) cycles through the teams, skipping the
 * team picked on the other card.
 */
class TeamCard implements Focusable {
  public onPointerFocus?: () => void;
  private readonly card: Phaser.GameObjects.Graphics;
  private readonly player: Phaser.GameObjects.Sprite;
  private readonly keeper: Phaser.GameObjects.Sprite;
  private readonly name: Phaser.GameObjects.Text;
  private readonly arrows: Phaser.GameObjects.Text[];
  private focused = false;

  constructor(
    scene: Phaser.Scene,
    private readonly x: number,
    private id: string,
    tagText: string,
    /** Tag colour: P1 yellow, P2 green, CPU opponent grey. */
    private readonly tagColor: number,
    private readonly otherId: () => string,
    private readonly onChange: (id: string) => void,
  ) {
    const y = CARD_Y;
    this.card = scene.add.graphics();
    this.player = scene.add.sprite(x - 26, y - 14, `kit_${id}`, 0).setScale(4);
    this.keeper = scene.add.sprite(x + 34, y - 6, `kit_gk_${id}`, 0).setScale(2.5);
    this.name = scene.add.text(x, y + 42, '', textStyle(16, UI.text, true)).setOrigin(0.5);
    // Tag above the card (drawn over the coloured bar from redraw)
    scene.add.text(x, y - 82, tagText, textStyle(11, '#0b0f1c', true)).setOrigin(0.5).setDepth(1);
    this.arrows = [[-1, x - 96], [1, x + 96]].map(([delta, ax]) => {
      const a = scene.add.text(ax, y + 42, delta < 0 ? '◀' : '▶', textStyle(16, UI.accent, true)).setOrigin(0.5);
      a.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.step(delta));
      return a;
    });
    const zone = scene.add.zone(x, y - 10, 160, 120).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => this.step(1));
    zone.on('pointerover', () => {
      this.setFocused(true);
      this.onPointerFocus?.();
    });
    this.redraw();
  }

  left(): void {
    this.step(-1);
  }

  right(): void {
    this.step(1);
  }

  activate(): void {
    this.step(1);
  }

  setFocused(f: boolean): void {
    this.focused = f;
    this.redraw();
  }

  private step(delta: number): void {
    const next = cycleTeam(this.id, delta, this.otherId());
    if (next === this.id) return;
    soundManager.menuClick();
    this.id = next;
    this.onChange(next);
    this.redraw();
  }

  private redraw(): void {
    const team = teamWithKits(this.id, settings.kits);
    const g = this.card;
    const y = CARD_Y;
    g.clear();
    drawPanel(g, this.x - 110, y - 80, 220, 160, this.focused ? 0x2a4470 : 0x22365a, team.uiColor);
    g.fillStyle(this.tagColor, 1);
    g.fillRect(this.x - 60, y - 90, 120, 18);
    if (this.focused) {
      g.fillStyle(0xffe14d, 1);
      g.fillRect(this.x - 110, y + 76, 220, 4);
    }
    this.player.setTexture(`kit_${this.id}`, 0);
    this.keeper.setTexture(`kit_gk_${this.id}`, 0);
    this.name.setText(team.name.toUpperCase());
    for (const a of this.arrows) a.setAlpha(this.focused ? 1 : 0.6);
  }
}

const CARD_Y = 170;

const formationLabel = (v: FormationId) => t().formationValue(v);

/**
 * Match setup. Quick Match (1p): team, length, difficulty, formation.
 * 2 PLAYERS (2p): a MODE row picks versus or co-op (settings.twoPlayerMode).
 * Versus: P1's team (left) against P2's (right), match length and both
 * formations. Co-op: P1 and P2 share the left team against the CPU on the
 * right, with match length, difficulty and the shared formation.
 */
export class TeamSelectScene extends Phaser.Scene {
  /** '1p' Quick Match or '2p' 2 PLAYERS (versus or co-op, see settings.twoPlayerMode). */
  private mode: '1p' | '2p' = '1p';
  /** Row focused when the scene opens (kept when the MODE row restarts the scene). */
  private focusIndex: number | null = null;

  constructor() {
    super({ key: 'TeamSelectScene' });
  }

  init(data: { mode?: GameMode; focus?: number }): void {
    if (data?.mode === 'coop') settings.twoPlayerMode = 'coop';
    this.mode = data?.mode === '2p' || data?.mode === 'coop' ? '2p' : '1p';
    this.focusIndex = data?.focus ?? null;
  }

  create(): void {
    soundManager.playMusic('menu');
    const twoPlayer = this.mode === '2p';
    const coop = twoPlayer && settings.twoPlayerMode === 'coop';
    // Versus: the right card is player 2; otherwise it is the CPU opponent
    const versus = twoPlayer && !coop;
    const bg = this.add.graphics();
    bg.fillStyle(UI.background, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.add.text(GAME_WIDTH / 2, 44, twoPlayer ? t().twoPlayers : t().quickMatch, titleStyle(30)).setOrigin(0.5);

    // Team cards: left = player 1 (side 0), right = opponent / player 2 (side 1)
    const cardP1 = new TeamCard(
      this, GAME_WIDTH / 2 - 150, settings.teamP1, coop ? t().coopTeam : twoPlayer ? t().player1 : t().yourTeam, 0xffcc00,
      () => settings.teamP2,
      (id) => {
        settings.teamP1 = id;
        saveSettings();
      },
    );
    const cardP2 = new TeamCard(
      this, GAME_WIDTH / 2 + 150, settings.teamP2, versus ? t().player2 : t().opponent, versus ? 0x6dff7a : 0x9aa8bb,
      () => settings.teamP1,
      (id) => {
        settings.teamP2 = id;
        saveSettings();
      },
    );
    this.add.text(GAME_WIDTH / 2, CARD_Y, 'VS', titleStyle(28)).setOrigin(0.5);

    // Row positions: Quick Match has 3 rows, 2 PLAYERS 4 (MODE first)
    const rowY = twoPlayer ? [282, 318, 354, 390] : [288, 328, 368];
    const startY = twoPlayer ? 436 : 425;
    const backY = twoPlayer ? 484 : 478;
    const extra: Focusable[] = [];
    if (twoPlayer) {
      extra.push(new OptionSelector<TwoPlayerMode>(
        this, GAME_WIDTH / 2, rowY.shift()!, t().twoPlayerMode,
        [...TWO_PLAYER_MODES], Math.max(0, TWO_PLAYER_MODES.indexOf(settings.twoPlayerMode)),
        (v) => t().twoPlayerModeValue(v),
        (v) => {
          settings.twoPlayerMode = v;
          saveSettings();
          // Cards and rows differ between the modes: rebuild, keep the focus on MODE
          this.scene.restart({ mode: '2p', focus: 2 });
        },
      ));
    }

    const length = new OptionSelector<number>(
      this, GAME_WIDTH / 2, rowY[0], t().matchLength,
      MATCH.durationOptions, Math.max(0, MATCH.durationOptions.indexOf(settings.matchMinutes)),
      (v) => `${v} MIN`,
      (v) => {
        settings.matchMinutes = v;
        saveSettings();
      },
    );

    let rows: Focusable[];
    if (versus) {
      const p1 = new OptionSelector<FormationId>(
        this, GAME_WIDTH / 2, rowY[1], t().playerFormation(1),
        FORMATION_IDS, Math.max(0, FORMATION_IDS.indexOf(settings.formation)), formationLabel,
        (v) => {
          settings.formation = v;
          saveSettings();
        },
      );
      const p2 = new OptionSelector<FormationId>(
        this, GAME_WIDTH / 2, rowY[2], t().playerFormation(2),
        FORMATION_IDS, Math.max(0, FORMATION_IDS.indexOf(settings.formationP2)), formationLabel,
        (v) => {
          settings.formationP2 = v;
          saveSettings();
        },
      );
      rows = [p1, p2];
    } else {
      const difficulty = new OptionSelector<Difficulty>(
        this, GAME_WIDTH / 2, rowY[1], t().difficulty,
        DIFFICULTIES, Math.max(0, DIFFICULTIES.indexOf(settings.difficulty)),
        (v) => t().difficultyName(v),
        (v) => {
          settings.difficulty = v;
          saveSettings();
        },
      );
      const formation = new OptionSelector<FormationId>(
        this, GAME_WIDTH / 2, rowY[2], t().formation,
        FORMATION_IDS, Math.max(0, FORMATION_IDS.indexOf(settings.formation)), formationLabel,
        (v) => {
          settings.formation = v;
          saveSettings();
        },
      );
      rows = [difficulty, formation];
    }

    if (twoPlayer) {
      // Which device each player uses with the controllers connected right now
      const status = this.add.text(GAME_WIDTH / 2, 258, '', textStyle(11, UI.textMuted, true)).setOrigin(0.5);
      const refresh = () => {
        const pads = connectedPads().length;
        let text: string;
        if (pads >= 2) text = t().padsTwo;
        else if (pads === 1) text = t().padsOne;
        else text = t().padsNone;
        status.setText(text).setColor(pads > 0 ? '#6dff7a' : '#ff9977');
      };
      refresh();
      this.events.on(Phaser.Scenes.Events.UPDATE, refresh);
      // Scene event listeners survive leaving the scene: without this, the
      // next visit (e.g. pressing PLAY) ran refresh() on the destroyed text
      // and crashed the game.
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.events.off(Phaser.Scenes.Events.UPDATE, refresh);
      });
    }

    const start = new Button(this, GAME_WIDTH / 2, startY, t().kickOffButton, () => this.startMatch(), {
      width: 240, height: 44, fontSize: 20, color: 0x2a8a4a, focusColor: 0x3fb066,
    });
    const back = new Button(this, GAME_WIDTH / 2, backY, t().back, () => this.scene.start('MenuScene'), {
      width: 140, height: 30, fontSize: 16,
    });

    const items = [cardP1, cardP2, ...extra, length, ...rows, start, back];
    new MenuNavigator(this, items, () => this.scene.start('MenuScene'))
      .activate(this.focusIndex ?? items.indexOf(start)); // KICK OFF

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 20, t().setupHint, textStyle(11, UI.textMuted))
      .setOrigin(0.5);
  }

  private startMatch(): void {
    const mode: GameMode = this.mode === '2p' && settings.twoPlayerMode === 'coop' ? 'coop' : this.mode;
    const data: MatchSceneData = { mode };
    this.scene.start('MatchScene', data);
  }
}
