// ============================================================
// MatchOverlay — Centre banners (KICK OFF / GOAL! / HALF TIME)
// and the full-time results panel.
// ============================================================

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../../core/config/GameplayConfig';
import { t } from '../config/i18n';
import { Button } from './Button';
import { MenuNavigator } from './MenuNavigator';
import { UI, drawPanel, pixelFontSize, pixelStroke, textStyle, titleStyle } from './Theme';

export interface FulltimeInfo {
  title: string;
  scoreLine: string;
  resultText: string;
  resultColor: string;
  statLines: Array<[string, string, string]>; // [left value, label, right value]
}

const CX = GAME_WIDTH / 2;
const CY = GAME_HEIGHT / 2;

export class MatchOverlay {
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly banner: Phaser.GameObjects.Text;
  private readonly sub: Phaser.GameObjects.Text;
  private panel: Phaser.GameObjects.Container | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    this.dim = scene.add.rectangle(CX, CY, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0).setDepth(190);
    this.banner = scene.add.text(CX, CY - 20, '', titleStyle(40)).setOrigin(0.5).setDepth(201).setVisible(false);
    this.sub = scene.add.text(CX, CY + 24, '', {
      ...textStyle(18, UI.text, true), stroke: '#000000', strokeThickness: pixelStroke(18),
    }).setOrigin(0.5).setDepth(201).setVisible(false);
  }

  setDim(alpha: number): void {
    this.dim.setFillStyle(0x000000, alpha);
  }

  showBanner(text: string, sub = '', color: string = UI.text, size = 40): void {
    this.scene.tweens.killTweensOf(this.banner);
    this.banner.setText(text).setColor(color).setFontSize(pixelFontSize(size)).setStroke('#000000', pixelStroke(size)).setScale(0.6).setAlpha(0).setVisible(true);
    this.sub.setText(sub).setVisible(sub !== '');
    this.scene.tweens.add({
      targets: this.banner, scaleX: 1, scaleY: 1, alpha: 1, duration: 220, ease: 'Back.easeOut',
    });
  }

  showGoal(teamName: string): void {
    this.showBanner(t().goal, teamName, UI.accent, 72);
    this.scene.tweens.add({
      targets: this.banner,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 260,
      delay: 240,
      yoyo: true,
      repeat: 2,
    });
  }

  hideBanner(): void {
    this.scene.tweens.killTweensOf(this.banner);
    this.banner.setVisible(false);
    this.sub.setVisible(false);
  }

  /** @param firstLabel label of the first button (default REMATCH; tournaments: CONTINUE). */
  showFulltime(info: FulltimeInfo, onRematch: () => void, onMenu: () => void, firstLabel = t().rematch): void {
    if (this.panel) return;
    this.hideBanner();
    this.setDim(0.65);

    const s = this.scene;
    const c = s.add.container(0, 0).setDepth(300);
    const w = 460;
    const h = 330;
    const top = CY - h / 2;
    const g = s.add.graphics();
    drawPanel(g, CX - w / 2, top, w, h);
    c.add(g);

    c.add(s.add.text(CX, top + 28, info.title, titleStyle(30)).setOrigin(0.5));
    c.add(s.add.text(CX, top + 70, info.scoreLine, textStyle(28, UI.text, true)).setOrigin(0.5));
    c.add(s.add.text(CX, top + 104, info.resultText, textStyle(18, info.resultColor, true)).setOrigin(0.5));

    let y = top + 136;
    for (const [l, label, r] of info.statLines) {
      c.add(s.add.text(CX - 120, y, l, textStyle(13, UI.text, true)).setOrigin(0.5));
      c.add(s.add.text(CX, y, label, textStyle(12, UI.textMuted)).setOrigin(0.5));
      c.add(s.add.text(CX + 120, y, r, textStyle(13, UI.text, true)).setOrigin(0.5));
      y += 20;
    }

    const rematch = new Button(s, CX - 105, top + h - 36, firstLabel, onRematch, { width: 180, height: 36, fontSize: 16 });
    const menu = new Button(s, CX + 105, top + h - 36, t().mainMenu, onMenu, { width: 180, height: 36, fontSize: 16 });
    c.add([rematch, menu]);
    this.panel = c;

    // Left/Right also move between the two buttons
    const nav = new MenuNavigator(s, [rematch, menu]);
    rematch.right = () => nav.focus(1);
    menu.left = () => nav.focus(0);
    // Delay keyboard control so keys still mashed from gameplay don't trigger a button
    s.time.delayedCall(800, () => nav.activate(0));

    c.setAlpha(0);
    s.tweens.add({ targets: c, alpha: 1, duration: 300 });
  }

  destroy(): void {
    this.panel?.destroy();
    this.dim.destroy();
    this.banner.destroy();
    this.sub.destroy();
  }
}
