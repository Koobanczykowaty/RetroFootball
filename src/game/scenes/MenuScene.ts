// ============================================================
// MenuScene — Main menu: logo, PLAY / CONTROLS / SETTINGS,
// pixel-art stadium at night with players running on the grass.
// ============================================================

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, GAME_VERSION } from '../config/GameplayConfig';
import { Button } from '../ui/Button';
import { MenuNavigator } from '../ui/MenuNavigator';
import { UI, textStyle, titleStyle } from '../ui/Theme';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    this.drawBackground();
    this.addRunners();

    // Logo
    const logo = this.add.container(GAME_WIDTH / 2, 110);
    const retro = this.add.text(0, -26, 'RETRO', titleStyle(64)).setOrigin(0.5);
    const football = this.add.text(0, 30, 'FOOTBALL', {
      ...titleStyle(40), color: '#ffffff',
    }).setOrigin(0.5);
    const bar = this.add.graphics();
    bar.fillStyle(0xffcc00, 1);
    bar.fillRect(-150, 56, 300, 4);
    bar.fillStyle(0xdd2222, 1);
    bar.fillRect(-150, 60, 150, 3);
    bar.fillStyle(0x2255dd, 1);
    bar.fillRect(0, 60, 150, 3);
    logo.add([retro, football, bar]);
    this.tweens.add({
      targets: retro, scaleX: 1.04, scaleY: 1.04, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Buttons
    const y0 = 240;
    const gap = 56;
    const buttons = [
      new Button(this, GAME_WIDTH / 2, y0, 'PLAY', () => this.scene.start('TeamSelectScene'), { width: 220, height: 42, fontSize: 20 }),
      new Button(this, GAME_WIDTH / 2, y0 + gap, 'CONTROLS', () => this.scene.start('ControlsScene'), { width: 220 }),
      new Button(this, GAME_WIDTH / 2, y0 + gap * 2, 'SETTINGS', () => this.scene.start('SettingsScene'), { width: 220 }),
    ];
    new MenuNavigator(this, buttons).activate(0);

    this.add.text(GAME_WIDTH / 2, y0 + gap * 2 + 46, '↑↓ choose   ENTER select', textStyle(11, UI.textMuted)).setOrigin(0.5);
    this.add.text(GAME_WIDTH - 10, GAME_HEIGHT - 14, `v${GAME_VERSION}`, textStyle(10, '#7788aa')).setOrigin(1, 0.5);
    this.add.text(10, GAME_HEIGHT - 14, 'QUICK MATCH  •  5 v 5', textStyle(10, '#7788aa')).setOrigin(0, 0.5);
  }

  private drawBackground(): void {
    const g = this.add.graphics();
    // Night sky gradient
    const bands = [0x070f1f, 0x0a1628, 0x0d1c33, 0x10223d];
    bands.forEach((c, i) => {
      g.fillStyle(c, 1);
      g.fillRect(0, i * 70, GAME_WIDTH, 70);
    });
    g.fillStyle(0x10223d, 1);
    g.fillRect(0, 280, GAME_WIDTH, GAME_HEIGHT - 280);

    // Stars
    for (let i = 0; i < 60; i++) {
      g.fillStyle(0xffffff, 0.25 + Math.random() * 0.5);
      g.fillRect(Math.floor(Math.random() * GAME_WIDTH), Math.floor(Math.random() * 120), 1 + (i % 3 === 0 ? 1 : 0), 1);
    }

    // Stands silhouette with crowd specks
    const standTop = GAME_HEIGHT - 190;
    for (let x = 0; x < GAME_WIDTH; x += 16) {
      const h = 70 + Math.round(Math.sin(x * 0.012) * 14);
      g.fillStyle(0x1a2a44, 1);
      g.fillRect(x, standTop + 70 - h, 16, h + 20);
    }
    for (let i = 0; i < 380; i++) {
      const colors = [0xdd2222, 0x2255dd, 0xffffff, 0xffcc00, 0x556688];
      g.fillStyle(colors[i % colors.length], 0.55);
      g.fillRect(Math.floor(Math.random() * GAME_WIDTH), standTop + 20 + Math.floor(Math.random() * 60), 2, 2);
    }

    // Floodlights
    for (const lx of [70, 300, 660, 890]) {
      g.fillStyle(0x3a4a66, 1);
      g.fillRect(lx, 40, 4, standTop - 10);
      g.fillStyle(0x556688, 1);
      g.fillRect(lx - 12, 30, 28, 12);
      g.fillStyle(0xffffcc, 0.9);
      for (let k = 0; k < 4; k++) g.fillRect(lx - 10 + k * 7, 32, 5, 4);
      g.fillStyle(0xffffaa, 0.06);
      g.fillCircle(lx + 2, 36, 60);
    }

    // Pitch at the bottom
    const grassTop = GAME_HEIGHT - 100;
    for (let x = 0; x < GAME_WIDTH; x += 40) {
      g.fillStyle((x / 40) % 2 === 0 ? 0x2d8a4e : 0x34a058, 1);
      g.fillRect(x, grassTop, 40, 100);
    }
    g.fillStyle(0xffffff, 0.8);
    g.fillRect(0, grassTop, GAME_WIDTH, 2);
  }

  /** A player dribbling across the grass, chased by an opponent. */
  private addRunners(): void {
    const y = GAME_HEIGHT - 50;
    const runner = this.add.sprite(-40, y, 'player_team0', 1).play('player_team0_run').setScale(2);
    const chaser = this.add.sprite(-110, y + 6, 'player_team1', 1).play('player_team1_run').setScale(2);
    const ball = this.add.sprite(-16, y + 14, 'ball', 0).setScale(2);
    const shadow = this.add.image(-16, y + 20, 'ball_shadow').setScale(2);

    const duration = 6500;
    for (const [obj, offset] of [[runner, 0], [ball, 24], [shadow, 24], [chaser, -70]] as const) {
      this.tweens.add({
        targets: obj,
        x: GAME_WIDTH + 140 + offset,
        duration,
        repeat: -1,
        repeatDelay: 1200,
        onRepeat: () => obj.setFrame(obj === ball ? 0 : 1),
      });
    }
    this.tweens.add({ targets: ball, angle: 360, duration: 500, repeat: -1 });
  }
}
