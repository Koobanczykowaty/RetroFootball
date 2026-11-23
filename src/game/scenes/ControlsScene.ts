// ============================================================
// ControlsScene — Control reference screen.
// ============================================================

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/GameplayConfig';
import { t } from '../config/i18n';
import { soundManager } from '../systems/SoundManager';
import { Button } from '../ui/Button';
import { CONTROLS_PANEL_HEIGHT, createControlsPanel } from '../ui/ControlsPanel';
import { MenuNavigator } from '../ui/MenuNavigator';
import { UI, titleStyle } from '../ui/Theme';

export class ControlsScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ControlsScene' });
  }

  create(): void {
    soundManager.playMusic('menu');
    const bg = this.add.graphics();
    bg.fillStyle(UI.background, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.add.text(GAME_WIDTH / 2, 30, t().controls, titleStyle(26)).setOrigin(0.5);
    const top = 56;
    createControlsPanel(this, GAME_WIDTH / 2, top);

    const back = () => this.scene.start('MenuScene');
    const btn = new Button(this, GAME_WIDTH / 2, top + CONTROLS_PANEL_HEIGHT + 40, t().back, back, {
      width: 160, height: 34, fontSize: 16,
    });
    new MenuNavigator(this, [btn], back).activate(0);
  }
}
