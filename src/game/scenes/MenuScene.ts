// ============================================================
// MenuScene — Main menu: logo, PLAY / CONTROLS / SETTINGS,
// pixel-art stadium at night with players running on the grass.
// ============================================================

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, GAME_VERSION } from '../config/GameplayConfig';
import { t } from '../config/i18n';
import { Button } from '../ui/Button';
import { MenuNavigator } from '../ui/MenuNavigator';
import { UI, textStyle, titleStyle } from '../ui/Theme';

/** Small deterministic PRNG (0..1) for fixed decorative patterns. */
function rngWindows(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Top of the stands silhouette in the menu background, at screen x. */
function standTopAt(x: number): number {
  const block = Math.floor(x / 16) * 16;
  const h = 70 + Math.round(Math.sin(block * 0.012) * 14);
  return GAME_HEIGHT - 190 + 70 - h;
}

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
    const s = t();
    const buttons = [
      new Button(this, GAME_WIDTH / 2, y0, s.play, () => this.scene.start('TeamSelectScene', { mode: '1p' }), {
        width: 220, height: 42, fontSize: 20,
      }),
      new Button(this, GAME_WIDTH / 2, y0 + gap, s.twoPlayers, () => this.scene.start('TeamSelectScene', { mode: '2p' }), {
        width: 220,
      }),
      new Button(this, GAME_WIDTH / 2, y0 + gap * 2, s.controls, () => this.scene.start('ControlsScene'), { width: 220 }),
      new Button(this, GAME_WIDTH / 2, y0 + gap * 3, s.settings, () => this.scene.start('SettingsScene'), { width: 220 }),
    ];
    new MenuNavigator(this, buttons).activate(0);

    this.add.text(GAME_WIDTH / 2, y0 + gap * 3 + 40, s.menuHint, textStyle(11, UI.textMuted)).setOrigin(0.5);
    this.add.text(GAME_WIDTH - 10, GAME_HEIGHT - 14, `v${GAME_VERSION}`, textStyle(10, '#7788aa')).setOrigin(1, 0.5);
    this.add.text(10, GAME_HEIGHT - 14, s.menuFooter, textStyle(10, '#7788aa')).setOrigin(0, 0.5);
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

    // Warsaw's National Stadium on the horizon, behind the stands
    this.drawNationalStadium(g, 190, standTop - 14);
    // ...and the Palace of Culture and Science further away on the right
    this.drawPalaceOfCulture(g, 780, standTop + 4);
    for (let x = 0; x < GAME_WIDTH; x += 16) {
      const top = standTopAt(x);
      g.fillStyle(0x1a2a44, 1);
      g.fillRect(x, top, 16, standTop + 90 - top);
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

  /**
   * Pixel-art silhouette of the National Stadium in Warsaw: a round bowl with
   * a white-red striped facade, a lit roof rim and the central spire held by
   * cables.
   * @param cx centre x  @param baseY bottom of the facade
   */
  private drawNationalStadium(g: Phaser.GameObjects.Graphics, cx: number, baseY: number): void {
    // Real proportions (approx.): 314 x 279 m bowl, masts 67 m, spire 108 m
    const S = 1.3; // overall size
    const halfW = Math.round(104 * S);
    const facadeH = Math.round(34 * S); // front of the facade, base to rim
    const ry = Math.round(7 * S); // rim ellipse half-height (seen from slightly above)
    const rimY = baseY - facadeH - ry; // rim ellipse centre
    const mastH = Math.round(16 * S);
    const lean = Math.round(5 * S); // masts lean outwards
    // Spire top / mast top ≈ 108 m / 67 m above the ground
    const spireTop = Math.round(baseY - (baseY - (rimY - mastH)) * 1.6);
    const cableY = rimY - mastH + 3; // central cable ring, a bit below the mast tops

    const masts: Array<{ bx: number; by: number; tx: number; ty: number; front: boolean }> = [];
    const n = 44; // the real roof hangs from 72 masts
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const bx = cx + Math.cos(a) * halfW;
      const by = rimY + Math.sin(a) * ry;
      masts.push({ bx, by, tx: cx + Math.cos(a) * (halfW + lean), ty: by - mastH, front: Math.sin(a) > 0 });
    }

    // Back masts and their cables (behind the roof)
    g.lineStyle(1, 0xaab4c8, 0.5);
    for (const m of masts) if (!m.front) g.lineBetween(m.bx, m.by, m.tx, m.ty);
    g.lineStyle(1, 0xc8d0e0, 0.18);
    for (const m of masts) if (!m.front) g.lineBetween(m.tx, m.ty, cx, cableY);

    // Roof membrane with the open centre over the pitch
    g.fillStyle(0xcfd6e2, 0.9);
    g.fillEllipse(cx, rimY, halfW * 2, ry * 2);
    g.fillStyle(0x223452, 1);
    g.fillEllipse(cx, rimY + 1, halfW * 0.9, ry * 0.8);

    // Facade: horizontal white and red bands following the curve of the bowl,
    // with faint panel joints (offset every band); darker towards the sides
    const bandH = 7;
    const panelW = 8;
    for (let x = -halfW; x < halfW; x++) {
      const t = (x + 0.5) / halfW;
      const s = Math.sqrt(Math.max(0, 1 - t * t));
      const top = Math.round(rimY + ry * s);
      const bottom = Math.round(baseY + ry * s);
      for (let y = top; y < bottom; y += bandH) {
        const band = Math.floor((y - top) / bandH);
        const h = Math.min(bandH, bottom - y);
        g.fillStyle(band % 2 === 0 ? 0xd5dae4 : 0xc8102e, 1);
        g.fillRect(cx + x, y, 1, h);
        const joint = (x + halfW + (band % 2) * (panelW / 2)) % panelW === 0;
        if (joint) {
          g.fillStyle(0x000000, 0.14);
          g.fillRect(cx + x, y, 1, h);
        }
      }
      g.fillStyle(0x0a1628, 0.6 * t * t);
      g.fillRect(cx + x, top, 1, bottom - top);
    }
    // Lit rim along the front
    g.fillStyle(0xfff3c4, 0.85);
    for (let x = -halfW + 4; x < halfW - 4; x++) {
      const t = (x + 0.5) / halfW;
      g.fillRect(cx + x, Math.round(rimY + ry * Math.sqrt(1 - t * t)) - 1, 1, 1);
    }

    // Grass embankment the stadium stands on (the old 10th-Anniversary
    // Stadium), cut off by a flat strip of distant ground so its foot is clean
    const groundY = baseY + 4;
    g.fillStyle(0x2a5a3c, 1);
    g.fillEllipse(cx, groundY, halfW * 2.5, 22);
    g.fillStyle(0x1b3d2e, 1);
    g.fillEllipse(cx, groundY + 2, halfW * 2.44, 20);
    g.fillStyle(0x13203a, 1);
    g.fillRect(0, groundY, GAME_WIDTH, 40);

    // Spire: tapering needle on the central cable ring, red warning light on top
    g.fillStyle(0xb8c0d0, 1);
    const spireLen = cableY - spireTop;
    for (let i = 0; i < spireLen; i++) {
      const w = i < spireLen * 0.45 ? 1 : 2;
      g.fillRect(cx - Math.floor(w / 2), spireTop + i, w, 1);
    }
    g.fillRect(cx - 1, cableY, 2, rimY - cableY); // hanger down to the roof
    g.fillStyle(0xe8ecf4, 1);
    g.fillRect(cx - 4, cableY - 1, 8, 2); // central ring
    g.fillStyle(0xff3030, 1);
    g.fillRect(cx, spireTop - 2, 1, 2);

    // Front masts and their cables
    g.lineStyle(1, 0xc8d0e0, 0.25);
    for (const m of masts) if (m.front) g.lineBetween(m.tx, m.ty, cx, cableY);
    g.lineStyle(1, 0xd8dee8, 1);
    for (const m of masts) if (m.front) g.lineBetween(m.bx, m.by, m.tx, m.ty);
  }

  /**
   * Distant silhouette of the Palace of Culture and Science in Warsaw: wide
   * lower wings, a stepped tower with pinnacles at every setback, the clock
   * level and the spire. Lit windows and a glowing clock for the night scene.
   * @param cx centre x  @param baseY ground line (hidden by the stands)
   */
  private drawPalaceOfCulture(g: Phaser.GameObjects.Graphics, cx: number, baseY: number): void {
    const body = 0x2b3a5a;
    const edge = 0x3d4f75;
    // [half width, top above the ground] from the wings up to the lantern
    const tiers: Array<[number, number]> = [[58, 26], [30, 84], [24, 104], [18, 118], [13, 130], [8, 139]];
    tiers.forEach(([hw, h], i) => {
      const top = baseY - h;
      g.fillStyle(body, 1);
      g.fillRect(cx - hw, top, hw * 2, baseY - top);
      g.fillStyle(edge, 1);
      g.fillRect(cx - hw, top, hw * 2, 1); // lit cornice
      // Pinnacles on the corners of every setback
      if (i > 0) {
        g.fillStyle(body, 1);
        g.fillRect(cx - hw, top - 4, 2, 4);
        g.fillRect(cx + hw - 2, top - 4, 2, 4);
        if (hw > 14) {
          g.fillRect(cx - hw / 2 - 1, top - 3, 2, 3);
          g.fillRect(cx + hw / 2 - 1, top - 3, 2, 3);
        }
      }
    });
    // Side wings step down towards the ends
    g.fillStyle(body, 1);
    g.fillRect(cx - 74, baseY - 16, 16, 16);
    g.fillRect(cx + 58, baseY - 16, 16, 16);

    // Spire with a warning light
    const lanternTop = baseY - 139;
    g.fillStyle(edge, 1);
    g.fillRect(cx - 1, lanternTop - 28, 2, 28);
    g.fillRect(cx - 2, lanternTop - 10, 4, 10);
    g.fillStyle(0xff3030, 1);
    g.fillRect(cx - 1, lanternTop - 30, 2, 2);

    // Clock faces on the clock level
    g.fillStyle(0xf2e6b0, 0.9);
    g.fillRect(cx - 4, baseY - 126, 8, 6);
    g.fillStyle(body, 1);
    g.fillRect(cx, baseY - 125, 1, 3);

    // Lit windows (fixed pattern). They are separate objects so they can
    // flicker; the ones the stands would cover are left out, because these
    // objects are drawn on top of the background graphics.
    const lit = rngWindows(7);
    const spots: Array<[number, number]> = [];
    for (let y = baseY - 80; y < baseY - 8; y += 5) {
      for (let x = cx - 26; x < cx + 26; x += 4) if (lit() < 0.22) spots.push([x, y]);
    }
    for (let y = baseY - 22; y < baseY - 4; y += 5) {
      const reach = y < baseY - 15 ? 56 : 72; // the end wings are lower
      for (let x = cx - reach; x < cx + reach - 2; x += 4) {
        if (Math.abs(x - cx) > 30 && lit() < 0.2) spots.push([x, y]);
      }
    }
    const windows = spots
      .filter(([x, y]) => y + 2 <= standTopAt(x) && y + 2 <= standTopAt(x + 1))
      .map(([x, y]) => this.add.rectangle(x, y, 2, 2, 0xffe9a0, 0.7).setOrigin(0));
    if (windows.length === 0) return;
    // Flicker: every few frames a couple of random windows dim, light up or go dark
    this.time.addEvent({
      delay: 90,
      loop: true,
      callback: () => {
        for (let k = 0; k < 2; k++) {
          const w = windows[Math.floor(Math.random() * windows.length)];
          w.setAlpha(Math.random() < 0.3 ? 0.08 : 0.35 + Math.random() * 0.6);
        }
      },
    });
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
