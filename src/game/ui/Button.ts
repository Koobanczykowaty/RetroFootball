// ============================================================
// Button — Pixel-styled clickable button with hover/focus states.
// Works with the mouse and with MenuNavigator (keyboard).
// ============================================================

import Phaser from 'phaser';
import { soundManager } from '../systems/SoundManager';
import { UI } from './Theme';

export interface Focusable {
  setFocused(focused: boolean): void;
  activate?(): void;
  left?(): void;
  right?(): void;
  /** Called by the button when the pointer hovers it, so navigators can sync focus. */
  onPointerFocus?: () => void;
}

export interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: number;
  color?: number;
  focusColor?: number;
  textColor?: string;
}

export class Button extends Phaser.GameObjects.Container implements Focusable {
  public onPointerFocus?: () => void;
  /** Optional Left/Right handlers for keyboard navigation. */
  public left?: () => void;
  public right?: () => void;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly bw: number;
  private readonly bh: number;
  private readonly color: number;
  private readonly focusColor: number;
  private readonly textColor: string;
  private focused = false;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    private readonly onClick: () => void,
    opts: ButtonOptions = {},
  ) {
    super(scene, x, y);
    this.bw = opts.width ?? 200;
    this.bh = opts.height ?? 38;
    this.color = opts.color ?? UI.button;
    this.focusColor = opts.focusColor ?? UI.buttonFocus;
    this.textColor = opts.textColor ?? '#ffffff';

    this.bg = scene.add.graphics();
    this.label = scene.add.text(0, 0, text, {
      fontFamily: UI.font,
      fontSize: `${opts.fontSize ?? 18}px`,
      color: this.textColor,
      fontStyle: 'bold',
      padding: { x: 2, y: 1 },
    }).setOrigin(0.5);

    const zone = scene.add.zone(0, 0, this.bw, this.bh).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      if (!this.enabled) return;
      if (!this.focused) soundManager.menuHover();
      this.setFocused(true);
      this.onPointerFocus?.();
    });
    zone.on('pointerout', () => this.setFocused(false));
    zone.on('pointerdown', () => this.activate());

    this.add([this.bg, this.label, zone]);
    this.setSize(this.bw, this.bh);
    this.redraw();
    scene.add.existing(this);
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.45);
    return this;
  }

  setFocused(focused: boolean): void {
    if (this.focused === focused) return;
    this.focused = focused;
    this.redraw();
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this,
      scaleX: focused ? 1.06 : 1,
      scaleY: focused ? 1.06 : 1,
      duration: 90,
    });
  }

  activate(): void {
    if (!this.enabled) return;
    soundManager.menuClick();
    this.scene.tweens.add({
      targets: this,
      scaleX: 0.94,
      scaleY: 0.94,
      duration: 60,
      yoyo: true,
    });
    this.onClick();
  }

  private redraw(): void {
    const g = this.bg;
    const w = this.bw;
    const h = this.bh;
    const x = -w / 2;
    const y = -h / 2;
    const fill = this.focused ? this.focusColor : this.color;
    g.clear();
    // Drop shadow
    g.fillStyle(0x000000, 0.45);
    g.fillRect(x + 3, y + 3, w, h);
    // Border
    g.fillStyle(UI.outline, 1);
    g.fillRect(x - 2, y - 2, w + 4, h + 4);
    // Body
    g.fillStyle(fill, 1);
    g.fillRect(x, y, w, h);
    // Bevel
    g.fillStyle(0xffffff, this.focused ? 0.35 : 0.2);
    g.fillRect(x, y, w, 3);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(x, y + h - 3, w, 3);
    this.label.setColor(this.focused ? UI.textHighlight : this.textColor);
  }
}
