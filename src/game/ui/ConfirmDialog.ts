// ============================================================
// ConfirmDialog — Modal "question? YES / NO" panel over a scene.
// Keyboard (←→ / ↑↓, Enter, Esc = NO), mouse and pad all work;
// the scene's own menu should be deactivated while it is open.
// ============================================================

import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../core/config/GameplayConfig';
import { t } from '../config/i18n';
import { Button } from './Button';
import { MenuNavigator } from './MenuNavigator';
import { drawPanel, titleStyle } from './Theme';

export class ConfirmDialog {
  private readonly container: Phaser.GameObjects.Container;
  private readonly nav: MenuNavigator;

  constructor(
    scene: Phaser.Scene,
    question: string,
    private readonly onYes: () => void,
    private readonly onNo: () => void,
  ) {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const dim = scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setInteractive();
    const g = scene.add.graphics();
    drawPanel(g, cx - 170, cy - 70, 340, 140);
    const text = scene.add.text(cx, cy - 28, question, titleStyle(20)).setOrigin(0.5);
    const yes = new Button(scene, cx - 80, cy + 32, t().yes, () => this.close(true), {
      width: 130, height: 36, fontSize: 16, color: 0x9a2222, focusColor: 0xd23a3a,
    });
    const no = new Button(scene, cx + 80, cy + 32, t().no, () => this.close(false), {
      width: 130, height: 36, fontSize: 16,
    });
    this.container = scene.add.container(0, 0, [dim, g, text, yes, no]).setDepth(500);
    this.nav = new MenuNavigator(scene, [yes, no], () => this.close(false));
    yes.right = () => this.nav.focus(1);
    no.left = () => this.nav.focus(0);
  }

  /** @param openedBy the key event that opened the dialog (ignored by it). */
  show(openedBy?: KeyboardEvent): void {
    this.nav.activate(1, openedBy); // NO first: Enter twice doesn't quit by accident
  }

  private close(yes: boolean): void {
    this.nav.deactivate();
    this.container.destroy();
    if (yes) this.onYes();
    else this.onNo();
  }
}
