// ============================================================
// SettingsScene — Language, sound, volume, difficulty, fullscreen.
// ============================================================

import Phaser from 'phaser';
import { DIFFICULTIES, Difficulty, GAME_SPEEDS, GAME_WIDTH, GAME_HEIGHT, GameSpeed } from '../../core/config/GameplayConfig';
import { ASSIST_MODES, AssistMode, LANGUAGES, Language, saveSettings, settings } from '../config/Settings';
import { applyPageLanguage, t } from '../config/i18n';
import { soundManager } from '../systems/SoundManager';
import { Button } from '../ui/Button';
import { MenuNavigator } from '../ui/MenuNavigator';
import { OptionSelector } from '../ui/OptionSelector';
import { UI, textStyle, titleStyle } from '../ui/Theme';

/** Each language is named in itself, so it can be found from either one. */
const LANGUAGE_NAMES: Record<Language, string> = { pl: 'POLSKI', en: 'ENGLISH' };

const VOLUMES =[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SettingsScene' });
  }

  create(data?: { focus?: number }): void {
    soundManager.playMusic('menu');
    const bg = this.add.graphics();
    bg.fillStyle(UI.background, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const s = t();
    this.add.text(GAME_WIDTH / 2, 44, s.settings, titleStyle(30)).setOrigin(0.5);

    const language = new OptionSelector<Language>(
      this, GAME_WIDTH / 2, 100, s.language, LANGUAGES, Math.max(0, LANGUAGES.indexOf(settings.language)),
      (v) => LANGUAGE_NAMES[v],
      (v) => {
        settings.language = v;
        saveSettings();
        applyPageLanguage();
        // Rebuild the screen in the new language, keeping focus on this row
        this.scene.restart({ focus: 0 });
      },
    );

    const sound = new OptionSelector<boolean>(
      this, GAME_WIDTH / 2, 136, s.sound, [true, false], settings.soundEnabled ? 0 : 1,
      (v) => (v ? s.on : s.off),
      (v) => {
        soundManager.setEnabled(v);
        if (v) soundManager.menuClick();
      },
    );

    const music = new OptionSelector<boolean>(
      this, GAME_WIDTH / 2, 172, s.music, [true, false], settings.musicEnabled ? 0 : 1,
      (v) => (v ? s.on : s.off),
      (v) => soundManager.setMusicEnabled(v),
    );

    const volIndex = VOLUMES.reduce((best, v, i) =>
      (Math.abs(v - settings.volume) < Math.abs(VOLUMES[best] - settings.volume) ? i : best), 0);
    const volume = new OptionSelector<number>(
      this, GAME_WIDTH / 2, 208, s.volume, VOLUMES, volIndex,
      (v) => `${Math.round(v * 100)}%`,
      (v) => {
        soundManager.setVolume(v);
        soundManager.kick();
      },
    );

    const difficulty = new OptionSelector<Difficulty>(
      this, GAME_WIDTH / 2, 244, s.difficulty, DIFFICULTIES, Math.max(0, DIFFICULTIES.indexOf(settings.difficulty)),
      (v) => s.difficultyName(v),
      (v) => {
        settings.difficulty = v;
        saveSettings();
      },
    );

    // Game settings: tempo and aim assists for the human players
    const speed = new OptionSelector<GameSpeed>(
      this, GAME_WIDTH / 2, 280, s.gameSpeed, [...GAME_SPEEDS], Math.max(0, GAME_SPEEDS.indexOf(settings.gameSpeed)),
      (v) => s.gameSpeedName(v),
      (v) => {
        settings.gameSpeed = v;
        saveSettings();
      },
    );
    const passes = new OptionSelector<AssistMode>(
      this, GAME_WIDTH / 2, 316, s.passAssist, [...ASSIST_MODES], Math.max(0, ASSIST_MODES.indexOf(settings.passAssist)),
      (v) => s.assistName(v),
      (v) => {
        settings.passAssist = v;
        saveSettings();
      },
    );
    const lob = new OptionSelector<AssistMode>(
      this, GAME_WIDTH / 2, 352, s.lobAssist, [...ASSIST_MODES], Math.max(0, ASSIST_MODES.indexOf(settings.lobAssist)),
      (v) => s.assistName(v),
      (v) => {
        settings.lobAssist = v;
        saveSettings();
      },
    );

    const fullscreen = new Button(this, GAME_WIDTH / 2, 396, this.fsLabel(), () => {
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

    this.add.text(GAME_WIDTH / 2, 432, s.settingsSaved, textStyle(11, UI.textMuted)).setOrigin(0.5);

    const back = () => this.scene.start('MenuScene');
    const backBtn = new Button(this, GAME_WIDTH / 2, GAME_HEIGHT - 60, s.back, back, { width: 160, height: 34, fontSize: 16 });
    new MenuNavigator(this, [language, sound, music, volume, difficulty, speed, passes, lob, fullscreen, backBtn], back).activate(data?.focus ?? 0);
  }

  private fsLabel(): string {
    return this.scale.isFullscreen ? t().exitFullscreen : t().fullscreen;
  }
}
