// ============================================================
// MenuScene — Main menu: logo, PLAY / CONTROLS / SETTINGS,
// pixel-art stadium at night with players running on the grass.
// ============================================================

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, GAME_VERSION } from '../../core/config/GameplayConfig';
import { t } from '../config/i18n';
import { hasTournamentInProgress } from '../config/TournamentStore';
import { desktopApp } from '../platform/Desktop';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { soundManager } from '../systems/SoundManager';
import { PLAYER_FRAME } from '../view/PlayerView';
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

/** Menu dribbling duel timeline (ms): run-in, feints, the cut, run off. */
const DUEL = { RUN_IN: 2600, FEINT: 4600, CUT: 5000, CYCLE: 9000 };

export class MenuScene extends Phaser.Scene {
  private duel?: {
    players: [Phaser.GameObjects.Sprite, Phaser.GameObjects.Sprite];
    ball: Phaser.GameObjects.Sprite;
    shadow: Phaser.GameObjects.Image;
    t: number;
    round: number;
  };

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    soundManager.playMusic('menu');
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

    // Buttons (CONTINUE only while a saved tournament is unfinished)
    const s = t();
    const entries: Array<[string, () => void]> = [
      [s.play, () => this.scene.start('TeamSelectScene', { mode: '1p' })],
      [s.twoPlayers, () => this.scene.start('TeamSelectScene', { mode: '2p' })],
      [s.tournament, () => this.scene.start('TournamentSetupScene')],
      // The kit editor (KitEditorScene) is switched off for now at the user's request
      [s.controls, () => this.scene.start('ControlsScene')],
      [s.settings, () => this.scene.start('SettingsScene')],
    ];
    if (hasTournamentInProgress()) entries.unshift([s.continueTournament, () => this.scene.start('TournamentScene')]);
    const y0 = 214;
    const gap = entries.length > 6 ? 40 : 44;
    const buttons = entries.map(([label, action], i) => new Button(this, GAME_WIDTH / 2, y0 + gap * i, label, action, i === 0
      ? { width: 220, height: 40, fontSize: 20 }
      : { width: 220 }));
    // Desktop app: a red X in the top-right corner quits (after a YES / NO
    // question). It is the last menu item, so ↑ from the first button and
    // a gamepad reach it too; Esc / pad B ask the same question.
    const desktop = desktopApp();
    // Switching between the menu and the dialog waits for the next frame, so
    // the Enter / Esc that did it can't also reach the other one.
    let nav: MenuNavigator;
    const nextFrame = (fn: () => void) => this.time.delayedCall(1, fn);
    const askQuit = () => {
      if (!desktop) return;
      nav.deactivate();
      nextFrame(() => new ConfirmDialog(this, s.quitConfirm, () => desktop.quit(),
        () => nextFrame(() => nav.activate(buttons.length - 1))).show());
    };
    if (desktop) {
      buttons.push(new Button(this, GAME_WIDTH - 26, 26, 'X', askQuit, {
        width: 36, height: 36, fontSize: 20, color: 0xb02424, focusColor: 0xe03a3a,
      }));
    }
    nav = new MenuNavigator(this, buttons, desktop ? askQuit : undefined).activate(0);

    this.add.text(GAME_WIDTH / 2, y0 + gap * (entries.length - 1) + 36, s.menuHint, textStyle(11, UI.textMuted))
      .setOrigin(0.5);
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
    const spire = this.drawNationalStadium(g, 190, standTop - 14);
    this.addSpireFlag(spire.x, spire.y);
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
   * @returns top of the spire (where the flag is attached)
   */
  private drawNationalStadium(g: Phaser.GameObjects.Graphics, cx: number, baseY: number): { x: number; y: number } {
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
      // Every other column of panels is shifted down by 30% of a band
      const panel = Math.floor((x + halfW) / panelW);
      const shift = panel % 2 === 1 ? Math.round(bandH * 0.3) : 0;
      for (let y = top - shift, band = 0; y < bottom; y += bandH, band++) {
        const y0 = Math.max(y, top);
        const h = Math.min(y + bandH, bottom) - y0;
        if (h <= 0) continue;
        g.fillStyle(band % 2 === 0 ? 0xd5dae4 : 0xc8102e, 1);
        g.fillRect(cx + x, y0, 1, h);
      }
      if ((x + halfW) % panelW === 0) {
        g.fillStyle(0x000000, 0.14); // joint between panel columns
        g.fillRect(cx + x, top, 1, bottom - top);
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
    // Stadium): a rounded top that slopes on down behind the stands
    const groundY = baseY + 4;
    const moundW = halfW * 1.25;
    const slopeW = 70;
    const hillBottom = baseY + 120; // well below the stands' top edge
    for (let x = Math.floor(-moundW - slopeW); x <= moundW + slopeW; x++) {
      const ax = Math.abs(x);
      const top = ax < moundW
        ? groundY - 11 * Math.sqrt(1 - (ax / moundW) ** 2)
        : groundY + (ax - moundW) * 0.45;
      const y = Math.round(top);
      g.fillStyle(0x2a5a3c, 1);
      g.fillRect(cx + x, y, 1, 2); // lit grass edge
      g.fillStyle(0x1b3d2e, 1);
      g.fillRect(cx + x, y + 2, 1, hillBottom - y - 2);
    }

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

    // Front masts and their cables
    g.lineStyle(1, 0xc8d0e0, 0.25);
    for (const m of masts) if (m.front) g.lineBetween(m.tx, m.ty, cx, cableY);
    g.lineStyle(1, 0xd8dee8, 1);
    for (const m of masts) if (m.front) g.lineBetween(m.bx, m.by, m.tx, m.ty);

    return { x: cx, y: spireTop };
  }

  /** Small white-red flag waving from the top of the stadium's spire. */
  private addSpireFlag(poleX: number, poleTop: number): void {
    const flag = this.add.graphics();
    const w = 10;
    const h = 6;
    let phase = 0;
    const draw = () => {
      flag.clear();
      for (let i = 0; i < w; i++) {
        // The wave grows towards the free end of the flag
        const dy = Math.round(Math.sin(phase - i * 0.7) * (i / w) * 1.6);
        const x = poleX + 1 + i;
        const y = poleTop + dy;
        flag.fillStyle(0x000000, 0.5);
        flag.fillRect(x, y - 1, 1, h + 2);
        flag.fillStyle(0xffffff, 1);
        flag.fillRect(x, y, 1, h / 2);
        flag.fillStyle(0xdc143c, 1);
        flag.fillRect(x, y + h / 2, 1, h / 2);
      }
      phase += 0.6;
    };
    draw();
    this.time.addEvent({ delay: 110, loop: true, callback: draw });
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
      g.fillRect(cx - hw, top, hw * 2, baseY - top + 40); // continues down behind the stands
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
    g.fillRect(cx - 74, baseY - 16, 16, 56);
    g.fillRect(cx + 58, baseY - 16, 16, 56);

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

  /**
   * Two players on the grass: one dribbles in, the other runs to meet him,
   * they jockey with feints, the attacker cuts past the lunging defender and
   * runs off while the defender turns and chases. The roles and direction
   * swap every round.
   */
  private addRunners(): void {
    const y = GAME_HEIGHT - 50;
    this.duel = {
      players: [
        this.add.sprite(-60, y, 'player_team0', PLAYER_FRAME.run1).setScale(2),
        this.add.sprite(GAME_WIDTH + 60, y, 'player_team1', PLAYER_FRAME.run1).setScale(2),
      ],
      ball: this.add.sprite(-60, y + 14, 'ball', 0).setScale(2),
      shadow: this.add.image(-60, y + 20, 'ball_shadow').setScale(2),
      t: 0,
      round: 0,
    };
  }

  update(_time: number, delta: number): void {
    const d = this.duel;
    if (!d) return;
    const { RUN_IN, FEINT, CUT, CYCLE } = DUEL;
    d.t += Math.min(delta, 50);
    if (d.t >= CYCLE) {
      d.t -= CYCLE;
      d.round++;
    }
    const t = d.t;
    const dir = d.round % 2 === 0 ? 1 : -1; // team 0 attacks right, then team 1 attacks left
    const attacker = d.players[d.round % 2];
    const defender = d.players[1 - (d.round % 2)];
    const X = (u: number) => (dir > 0 ? u : GAME_WIDTH - u);
    const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.min(1, Math.max(0, k));
    const runFrame = (period: number): number =>
      Math.floor(t / period) % 2 === 0 ? PLAYER_FRAME.run1 : PLAYER_FRAME.run2;
    const feintA = (time: number) => 12 * Math.sin((2 * Math.PI * time) / 750);
    const feintD = (time: number) => 11 * Math.sin((2 * Math.PI * (time - 200)) / 750);

    // Attacker (au, ay), defender (du, dy), ball lead in front of the attacker
    let au: number, ay: number, du: number, dy: number, lead: number;
    let aFrame = runFrame(130);
    let dFrame = runFrame(130);
    let dFacing = -dir; // towards the attacker
    let spin = 0.6; // ball rotation speed (deg/ms)
    if (t < RUN_IN) {
      const k = t / RUN_IN;
      au = lerp(-60, 380, k);
      ay = 0;
      du = lerp(1040, 500, k);
      dy = 0;
      lead = 14 + 8 * ((t % 380) / 380); // touch, ball rolls ahead, catch up
    } else if (t < FEINT) {
      // Jockeying: the attacker shimmies left/right, the defender mirrors late
      const k = (t - RUN_IN) / (FEINT - RUN_IN);
      au = lerp(380, 425, k);
      ay = feintA(t - RUN_IN);
      du = lerp(500, 462, k);
      dy = feintD(t - RUN_IN);
      lead = 10;
      aFrame = runFrame(200);
      dFrame = runFrame(220);
      spin = 0.15;
    } else if (t < CUT) {
      // The cut: ball pushed past on one side, defender lunges to the other
      const k = (t - FEINT) / (CUT - FEINT);
      au = lerp(425, 470, k);
      ay = lerp(feintA(FEINT - RUN_IN), 16, k);
      du = lerp(462, 452, k);
      dy = lerp(feintD(FEINT - RUN_IN), -14, k);
      lead = lerp(10, 40, k);
      dFrame = PLAYER_FRAME.kick;
      spin = 1;
    } else {
      const k = (t - CUT) / (CYCLE - CUT);
      au = lerp(470, 1120, k);
      ay = 16 * (1 - Math.min(1, k * 3));
      lead = lerp(40, 16, k * 4);
      if (t < CUT + 500) {
        // Defender off balance for a moment...
        du = 452;
        dy = -14;
        dFrame = PLAYER_FRAME.kick;
      } else {
        // ...then turns and chases
        const kk = (t - CUT - 500) / (CYCLE - CUT - 500);
        du = lerp(452, 1000, kk);
        dy = lerp(-14, 0, kk * 2);
        dFacing = dir;
      }
    }

    const baseY = GAME_HEIGHT - 50;
    attacker.setPosition(X(au), baseY + ay).setFrame(aFrame).setFlipX(dir < 0);
    defender.setPosition(X(du), baseY + dy).setFrame(dFrame).setFlipX(dFacing < 0);
    attacker.setDepth(attacker.y);
    defender.setDepth(defender.y);
    const hop = t < RUN_IN || t > CUT ? Math.abs(Math.sin(t / 190)) * 2 : 0;
    d.ball.setPosition(X(au + lead), baseY + ay + 14 - hop).setDepth(baseY + ay + 15);
    d.ball.angle += dir * spin * Math.min(delta, 50);
    d.shadow.setPosition(X(au + lead), baseY + ay + 20).setDepth(baseY + ay + 14);
  }
}
