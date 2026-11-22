// ============================================================
// SettingsScene — Sound, volume, fullscreen.
// ============================================================

import Phaser from 'phaser';
import { DIFFICULTIES, Difficulty, GAME_WIDTH, GAME_HEIGHT } from '../config/GameplayConfig';
import { saveSettings, settings } from '../config/Settings';
import { soundManager } from '../systems/SoundManager';
import { Button } from '../ui/Button';
import { MenuNavigator } from '../ui/MenuNavigator';
import { OptionSelector } from '../ui/OptionSelector';
import { UI, textStyle, titleStyle } from '../ui/Theme';

const VOLUMES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SettingsScene' });
  }

  create(): void {
    const bg = this.add.graphics();
    bg.fillStyle(UI.background, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.add.text(GAME_WIDTH / 2, 60, 'SETTINGS', titleStyle(30)).setOrigin(0.5);

    const sound = new OptionSelector<boolean>(
      this, GAME_WIDTH / 2, 160, 'SOUND', [true, false], settings.soundEnabled ? 0 : 1,
      (v) => (v ? 'ON' : 'OFF'),
      (v) => {
        soundManager.setEnabled(v);
        if (v) soundManager.menuClick();
      },
    );

    const volIndex = VOLUMES.reduce((best, v, i) =>
      (Math.abs(v - settings.volume) < Math.abs(VOLUMES[best] - settings.volume) ? i : best), 0);
    const volume = new OptionSelector<number>(
      this, GAME_WIDTH / 2, 205, 'VOLUME', VOLUMES, volIndex,
      (v) => `${Math.round(v * 100)}%`,
      (v) => {
        soundManager.setVolume(v);
        soundManager.kick();
      },
    );

    const difficulty = new OptionSelector<Difficulty>(
      this, GAME_WIDTH / 2, 250, 'DIFFICULTY', DIFFICULTIES, Math.max(0, DIFFICULTIES.indexOf(settings.difficulty)),
      (v) => v.toUpperCase(),
      (v) => {
        settings.difficulty = v;
        saveSettings();
      },
    );

    const fullscreen = new Button(this, GAME_WIDTH / 2, 310, this.fsLabel(), () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    }, { width: 420, height: 34, fontSize: 16 });
    const updateFs = () => fullscreen.setText(this.fsLabel());
    this.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, updateFs);
    this.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, updateFs);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, updateFs);
      this.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, updateFs);
    });

    this.add.text(GAME_WIDTH / 2, 365, 'Settings are saved in this browser.', textStyle(11, UI.textMuted)).setOrigin(0.5);

    const back = () => this.scene.start('MenuScene');
    const backBtn = new Button(this, GAME_WIDTH / 2, GAME_HEIGHT - 60, 'BACK', back, { width: 160, height: 34, fontSize: 16 });
    new MenuNavigator(this, [sound, volume, difficulty, fullscreen, backBtn], back).activate(0);
  }

  private fsLabel(): string {
    return this.scale.isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
  }
}
