// ============================================================
// TeamSelectScene — Quick Match setup: pick a team, match length
// and difficulty, then kick off.
// ============================================================

import Phaser from 'phaser';
import {
  DIFFICULTIES, Difficulty, GAME_WIDTH, GAME_HEIGHT, MATCH, TEAMS,
} from '../config/GameplayConfig';
import { saveSettings, settings } from '../config/Settings';
import { soundManager } from '../systems/SoundManager';
import { Button, Focusable } from '../ui/Button';
import { MenuNavigator } from '../ui/MenuNavigator';
import { OptionSelector } from '../ui/OptionSelector';
import { UI, drawPanel, textStyle, titleStyle } from '../ui/Theme';

/** Row with both team cards; Left/Right switches the selected team. */
class TeamPicker implements Focusable {
  public onPointerFocus?: () => void;
  private readonly cards: Phaser.GameObjects.Graphics[] = [];
  private readonly tags: Phaser.GameObjects.Text[] = [];
  private focused = false;

  constructor(scene: Phaser.Scene, private selected: number, private readonly onChange: (i: number) => void) {
    TEAMS.forEach((team, i) => {
      const x = GAME_WIDTH / 2 + (i === 0 ? -150 : 150);
      const y = 170;
      const card = scene.add.graphics();
      this.cards.push(card);

      scene.add.sprite(x - 26, y - 14, `player_team${i}`, 0).setScale(4);
      scene.add.sprite(x + 34, y - 6, `player_gk${i}`, 0).setScale(2.5);
      scene.add.text(x, y + 42, team.name.toUpperCase(), textStyle(16, UI.text, true)).setOrigin(0.5);
      this.tags.push(scene.add.text(x, y - 82, 'YOUR TEAM', textStyle(11, '#0b0f1c', true)).setOrigin(0.5));

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
      drawPanel(g, x - 110, 170 - 80, 220, 160, sel ? 0x22365a : UI.panel, sel ? team.primaryColor : 0x334466);
      if (sel) {
        g.fillStyle(this.focused ? 0xffe14d : 0xffcc00, 1);
        g.fillRect(x - 50, 170 - 90, 100, 18);
      }
      this.tags[i].setVisible(sel);
    });
  }
}

export class TeamSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TeamSelectScene' });
  }

  create(): void {
    const bg = this.add.graphics();
    bg.fillStyle(UI.background, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.add.text(GAME_WIDTH / 2, 44, 'QUICK MATCH', titleStyle(30)).setOrigin(0.5);

    const picker = new TeamPicker(this, settings.playerTeam, (i) => {
      settings.playerTeam = i;
      saveSettings();
    });

    const length = new OptionSelector<number>(
      this, GAME_WIDTH / 2, 300, 'MATCH LENGTH',
      MATCH.durationOptions, Math.max(0, MATCH.durationOptions.indexOf(settings.matchMinutes)),
      (v) => `${v} MIN`,
      (v) => {
        settings.matchMinutes = v;
        saveSettings();
      },
    );
    const difficulty = new OptionSelector<Difficulty>(
      this, GAME_WIDTH / 2, 342, 'DIFFICULTY',
      DIFFICULTIES, Math.max(0, DIFFICULTIES.indexOf(settings.difficulty)),
      (v) => v.toUpperCase(),
      (v) => {
        settings.difficulty = v;
        saveSettings();
      },
    );

    const start = new Button(this, GAME_WIDTH / 2, 410, 'KICK OFF!', () => this.startMatch(), {
      width: 240, height: 44, fontSize: 20, color: 0x2a8a4a, focusColor: 0x3fb066,
    });
    const back = new Button(this, GAME_WIDTH / 2, 470, 'BACK', () => this.scene.start('MenuScene'), {
      width: 140, height: 30, fontSize: 14,
    });

    new MenuNavigator(this, [picker, length, difficulty, start, back], () => this.scene.start('MenuScene')).activate(3);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 20, '←→ change   ↑↓ move   ENTER confirm   ESC back', textStyle(11, UI.textMuted))
      .setOrigin(0.5);
  }

  private startMatch(): void {
    this.scene.start('MatchScene', { playerTeam: settings.playerTeam });
  }
}
