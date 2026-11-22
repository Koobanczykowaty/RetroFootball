// ============================================================
// HUD — In-match scoreboard: teams, score, clock, half, hints.
// ============================================================

import Phaser from 'phaser';
import { TEAMS, GAME_WIDTH } from '../config/GameplayConfig';
import type { MatchData } from '../systems/MatchSystem';
import { UI, hexColor, textStyle } from './Theme';

export class HUD {
  private container: Phaser.GameObjects.Container;
  private scoreText: Phaser.GameObjects.Text;
  private timeText: Phaser.GameObjects.Text;
  private halfText: Phaser.GameObjects.Text;
  private muteText: Phaser.GameObjects.Text;
  private lastScore = '';

  /**
   * @param playerTags which team each human plays ('P1', 'P2'); empty in AI-only sims
   * @param difficulty CPU level, shown in single-player matches
   */
  constructor(scene: Phaser.Scene, playerTags: Array<{ team: number; label: string }>, difficulty?: string) {
    this.container = scene.add.container(0, 0).setDepth(100);
    const cx = GAME_WIDTH / 2;

    const bg = scene.add.graphics();
    bg.fillStyle(UI.outline, 0.9);
    bg.fillRect(cx - 172, 2, 344, 34);
    bg.fillStyle(0x16213a, 0.95);
    bg.fillRect(cx - 170, 4, 340, 30);
    // Team colour chips
    bg.fillStyle(TEAMS[0].primaryColor, 1);
    bg.fillRect(cx - 164, 9, 8, 20);
    bg.fillStyle(TEAMS[1].primaryColor, 1);
    bg.fillRect(cx + 156, 9, 8, 20);
    this.container.add(bg);

    const nameStyle = textStyle(15, UI.text, true);
    const t0 = scene.add.text(cx - 148, 10, TEAMS[0].shortName, { ...nameStyle, color: hexColor(TEAMS[0].textColor) });
    const t1 = scene.add.text(cx + 148, 10, TEAMS[1].shortName, { ...nameStyle, color: hexColor(TEAMS[1].textColor) })
      .setOrigin(1, 0);
    this.container.add([t0, t1]);

    for (const { team, label } of playerTags) {
      const tagX = team === 0 ? cx - 148 : cx + 148;
      // P1 yellow, P2 green: same colours as their selection markers on the pitch
      const color = label === 'P2' ? '#6dff7a' : UI.textHighlight;
      const tag = scene.add.text(tagX, 26, label, textStyle(8, color, true)).setOrigin(team === 0 ? 0 : 1, 0);
      this.container.add(tag);
    }

    this.scoreText = scene.add.text(cx, 6, '0 - 0', textStyle(20, UI.text, true)).setOrigin(0.5, 0);
    this.timeText = scene.add.text(cx - 62, 12, '00:00', textStyle(12, '#cfe3ff', true)).setOrigin(0.5, 0);
    this.halfText = scene.add.text(cx + 62, 12, '1ST', textStyle(12, '#cfe3ff', true)).setOrigin(0.5, 0);
    this.container.add([this.scoreText, this.timeText, this.halfText]);

    // Corner hints
    const hintBg = scene.add.graphics();
    hintBg.fillStyle(UI.outline, 0.75);
    hintBg.fillRect(GAME_WIDTH - 96, 3, 93, 31);
    this.container.add(hintBg);
    const hint = scene.add.text(GAME_WIDTH - 8, 6, 'ESC  PAUSE', textStyle(10, '#d0d8e8', true)).setOrigin(1, 0);
    hint.setAlpha(0.8);
    this.muteText = scene.add.text(GAME_WIDTH - 8, 20, 'SOUND OFF (M)', textStyle(10, '#ff8877', true)).setOrigin(1, 0);
    this.container.add([hint, this.muteText]);

    if (difficulty) {
      const colors: Record<string, string> = { easy: '#66ff88', normal: '#ffe14d', hard: '#ff7766' };
      const bgDiff = scene.add.graphics();
      bgDiff.fillStyle(UI.outline, 0.75);
      bgDiff.fillRect(3, 3, 86, 18);
      const diff = scene.add.text(8, 6, `CPU: ${difficulty.toUpperCase()}`, textStyle(10, colors[difficulty] ?? UI.text, true));
      this.container.add([bgDiff, diff]);
    }
  }

  update(data: MatchData, formattedTime: string, muted: boolean): void {
    const score = `${data.score[0]} - ${data.score[1]}`;
    if (score !== this.lastScore) {
      this.scoreText.setText(score);
      if (this.lastScore !== '') {
        this.scoreText.scene.tweens.add({
          targets: this.scoreText, scaleX: 1.35, scaleY: 1.35, duration: 150, yoyo: true, repeat: 1,
        });
      }
      this.lastScore = score;
    }
    this.timeText.setText(formattedTime);
    this.halfText.setText(data.half === 1 ? '1ST' : '2ND');
    this.muteText.setVisible(muted);
  }

  destroy(): void {
    this.container.destroy();
  }
}
