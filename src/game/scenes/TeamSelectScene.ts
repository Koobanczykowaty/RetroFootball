// ============================================================
// TeamSelectScene — Quick Match setup: pick a team, match length
// and difficulty, then kick off.
// ============================================================

import Phaser from 'phaser';
import {
  DIFFICULTIES, Difficulty, FORMATION_IDS, FormationId, GAME_WIDTH, GAME_HEIGHT, MATCH, TEAMS,
} from '../config/GameplayConfig';
import { saveSettings, settings } from '../config/Settings';
import { soundManager } from '../systems/SoundManager';
import { Button, Focusable } from '../ui/Button';
import { MenuNavigator } from '../ui/MenuNavigator';
import { OptionSelector } from '../ui/OptionSelector';
import { connectedPads } from '../systems/Gamepad';
import type { GameMode, MatchSceneData } from './MatchScene';
import { UI, drawPanel, textStyle, titleStyle } from '../ui/Theme';

/** Row with both team cards; Left/Right switches the selected team. */
class TeamPicker implements Focusable {
  public onPointerFocus?: () => void;
  private readonly cards: Phaser.GameObjects.Graphics[] = [];
  private readonly tags: Phaser.GameObjects.Text[] = [];
  private focused = false;

  /**
   * @param twoPlayer 2-player mode: the selected card is the keyboard player's
   *   (P1), the other card the controller player's (P2).
   */
  constructor(
    scene: Phaser.Scene,
    private selected: number,
    private readonly onChange: (i: number) => void,
    private readonly twoPlayer = false,
  ) {
    TEAMS.forEach((team, i) => {
      const x = GAME_WIDTH / 2 + (i === 0 ? -150 : 150);
      const y = 170;
      const card = scene.add.graphics();
      this.cards.push(card);

      scene.add.sprite(x - 26, y - 14, `player_team${i}`, 0).setScale(4);
      scene.add.sprite(x + 34, y - 6, `player_gk${i}`, 0).setScale(2.5);
      scene.add.text(x, y + 42, team.name.toUpperCase(), textStyle(16, UI.text, true)).setOrigin(0.5);
      this.tags.push(scene.add.text(x, y - 82, '', textStyle(11, '#0b0f1c', true)).setOrigin(0.5));

      const zone = scene.add.zone(x, y, 220, 160).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this.select(i));
      zone.on('pointerover', () => {
        this.setFocused(true);
        this.onPointerFocus?.();
      });
    });
    scene.add.text(GAME_WIDTH / 2, 170, 'VS', titleStyle(28)).setOrigin(0.5);
    this.redraw();
  }

  left(): void {
    this.select(0);
  }

  right(): void {
    this.select(1);
  }

  activate(): void {
    this.select(1 - this.selected);
  }

  setFocused(f: boolean): void {
    this.focused = f;
    this.redraw();
  }

  private select(i: number): void {
    if (i !== this.selected) soundManager.menuClick();
    this.selected = i;
    this.onChange(i);
    this.redraw();
  }

  private redraw(): void {
    TEAMS.forEach((team, i) => {
      const g = this.cards[i];
      const x = GAME_WIDTH / 2 + (i === 0 ? -150 : 150);
      const sel = i === this.selected;
      g.clear();
      const highlighted = sel || this.twoPlayer; // in 2P both teams are played by humans
      drawPanel(g, x - 110, 170 - 80, 220, 160, highlighted ? 0x22365a : UI.panel, highlighted ? team.primaryColor : 0x334466);
      if (sel) {
        g.fillStyle(this.focused ? 0xffe14d : 0xffcc00, 1);
        g.fillRect(x - 55, 170 - 90, 110, 18);
        this.tags[i].setText(this.twoPlayer ? 'PLAYER 1' : 'YOUR TEAM');
      } else if (this.twoPlayer) {
        g.fillStyle(0x6dff7a, 1); // P2 colour
        g.fillRect(x - 55, 170 - 90, 110, 18);
        this.tags[i].setText('PLAYER 2');
      }
      this.tags[i].setVisible(sel || this.twoPlayer);
    });
  }
}

const formationLabel = (v: FormationId) => (v === '2-3' ? '2-3 ATT' : '3-2 DEF');

/**
 * Match setup. Quick Match (1p): team, length, difficulty, formation.
 * 2 PLAYERS (2p): the keyboard player picks his team (the controller player
 * gets the other), match length and both formations.
 */
export class TeamSelectScene extends Phaser.Scene {
  private mode: GameMode = '1p';

  constructor() {
    super({ key: 'TeamSelectScene' });
  }

  init(data: { mode?: GameMode }): void {
    this.mode = data?.mode ?? '1p';
  }

  create(): void {
    const twoPlayer = this.mode === '2p';
    const bg = this.add.graphics();
    bg.fillStyle(UI.background, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.add.text(GAME_WIDTH / 2, 44, twoPlayer ? '2 PLAYERS' : 'QUICK MATCH', titleStyle(30)).setOrigin(0.5);

    const picker = new TeamPicker(this, settings.playerTeam, (i) => {
      settings.playerTeam = i;
      saveSettings();
    }, twoPlayer);

    const length = new OptionSelector<number>(
      this, GAME_WIDTH / 2, 288, 'MATCH LENGTH',
      MATCH.durationOptions, Math.max(0, MATCH.durationOptions.indexOf(settings.matchMinutes)),
      (v) => `${v} MIN`,
      (v) => {
        settings.matchMinutes = v;
        saveSettings();
      },
    );

    let rows: Focusable[];
    if (twoPlayer) {
      const p1 = new OptionSelector<FormationId>(
        this, GAME_WIDTH / 2, 328, 'P1 FORMATION',
        FORMATION_IDS, Math.max(0, FORMATION_IDS.indexOf(settings.formation)), formationLabel,
        (v) => {
          settings.formation = v;
          saveSettings();
        },
      );
      const p2 = new OptionSelector<FormationId>(
        this, GAME_WIDTH / 2, 368, 'P2 FORMATION',
        FORMATION_IDS, Math.max(0, FORMATION_IDS.indexOf(settings.formationP2)), formationLabel,
        (v) => {
          settings.formationP2 = v;
          saveSettings();
        },
      );
      rows = [p1, p2];

      // Which device each player uses with the controllers connected right now
      const status = this.add.text(GAME_WIDTH / 2, 258, '', textStyle(11, UI.textMuted, true)).setOrigin(0.5);
      const refresh = () => {
        const pads = connectedPads().length;
        let text: string;
        if (pads >= 2) text = 'P1: KEYBOARD + PAD 1   •   P2: PAD 2';
        else if (pads === 1) text = 'P1: KEYBOARD   •   P2: PAD 1';
        else text = 'P1: KEYBOARD   •   P2: CONNECT AN XBOX CONTROLLER AND PRESS ANY BUTTON';
        status.setText(text).setColor(pads > 0 ? '#6dff7a' : '#ff9977');
      };
      refresh();
      this.events.on(Phaser.Scenes.Events.UPDATE, refresh);
    } else {
      const difficulty = new OptionSelector<Difficulty>(
        this, GAME_WIDTH / 2, 328, 'DIFFICULTY',
        DIFFICULTIES, Math.max(0, DIFFICULTIES.indexOf(settings.difficulty)),
        (v) => v.toUpperCase(),
        (v) => {
          settings.difficulty = v;
          saveSettings();
        },
      );
      const formation = new OptionSelector<FormationId>(
        this, GAME_WIDTH / 2, 368, 'FORMATION',
        FORMATION_IDS, Math.max(0, FORMATION_IDS.indexOf(settings.formation)), formationLabel,
        (v) => {
          settings.formation = v;
          saveSettings();
        },
      );
      rows = [difficulty, formation];
    }

    const start = new Button(this, GAME_WIDTH / 2, 425, 'KICK OFF!', () => this.startMatch(), {
      width: 240, height: 44, fontSize: 20, color: 0x2a8a4a, focusColor: 0x3fb066,
    });
    const back = new Button(this, GAME_WIDTH / 2, 478, 'BACK', () => this.scene.start('MenuScene'), {
      width: 140, height: 30, fontSize: 14,
    });

    new MenuNavigator(this, [picker, length, ...rows, start, back], () => this.scene.start('MenuScene'))
      .activate(4);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 20, '←→ change   ↑↓ move   ENTER confirm   ESC back', textStyle(11, UI.textMuted))
      .setOrigin(0.5);
  }

  private startMatch(): void {
    const data: MatchSceneData = { playerTeam: settings.playerTeam, mode: this.mode };
    this.scene.start('MatchScene', data);
  }
}
