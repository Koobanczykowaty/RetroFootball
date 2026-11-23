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

    // Logo: "RETRO GAŁA" on one line, both words the same size and style,
    // in the colours of the Polish flag (white / red) with a matching stripe
    const logo = this.add.container(GAME_WIDTH / 2, 118);
    const size = 60;
    const white = '#ffffff';
    const red = '#dc143c';
    const retro = this.add.text(0, 0, 'RETRO', { ...titleStyle(size), color: white }).setOrigin(0, 0.5);
    const gala = this.add.text(0, 0, 'GAŁA', { ...titleStyle(size), color: red }).setOrigin(0, 0.5);
    const space = Math.round(size * 0.35);
    const total = retro.width + space + gala.width;
    retro.x = -total / 2;
    gala.x = -total / 2 + retro.width + space;

    // White-red stripe under the whole name, with the same dark outline as the letters
    const barW = Math.round(total);
    const barY = Math.round(size * 0.62);
    const bar = this.add.graphics();
    bar.fillStyle(0x000000, 1);
    bar.fillRect(-barW / 2 - 2, barY - 2, barW + 4, 14);
    bar.fillStyle(0xffffff, 1);
    bar.fillRect(-barW / 2, barY, barW, 5);
    bar.fillStyle(0xdc143c, 1);
    bar.fillRect(-barW / 2, barY + 5, barW, 5);

    logo.add([bar, retro, gala]);
    // The whole logo pulses together
    this.tweens.add({
      targets: logo, scaleX: 1.03, scaleY: 1.03, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Buttons
    const y0 = 232;
    const gap = 50;
    const buttons = [
      new Button(this, GAME_WIDTH / 2, y0, 'PLAY', () => this.scene.start('TeamSelectScene', { mode: '1p' }), {
        width: 220, height: 42, fontSize: 20,
      }),
      new Button(this, GAME_WIDTH / 2, y0 + gap, '2 PLAYERS', () => this.scene.start('TeamSelectScene', { mode: '2p' }), {
        width: 220,
      }),
      new Button(this, GAME_WIDTH / 2, y0 + gap * 2, 'CONTROLS', () => this.scene.start('ControlsScene'), { width: 220 }),
      new Button(this, GAME_WIDTH / 2, y0 + gap * 3, 'SETTINGS', () => this.scene.start('SettingsScene'), { width: 220 }),
    ];
    new MenuNavigator(this, buttons).activate(0);

    this.add.text(GAME_WIDTH / 2, y0 + gap * 3 + 40, '↑↓ choose   ENTER select', textStyle(11, UI.textMuted)).setOrigin(0.5);
    this.add.text(GAME_WIDTH - 10, GAME_HEIGHT - 14, `v${GAME_VERSION}`, textStyle(10, '#7788aa')).setOrigin(1, 0.5);
    this.add.text(10, GAME_HEIGHT - 14, 'QUICK MATCH  •  6 v 6', textStyle(10, '#7788aa')).setOrigin(0, 0.5);
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
