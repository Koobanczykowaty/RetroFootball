// ============================================================
// OptionSelector — "LABEL   < VALUE >" row for cycling settings.
// Clickable arrows, keyboard Left/Right through MenuNavigator.
// ============================================================

import Phaser from 'phaser';
import type { Focusable } from './Button';
import { soundManager } from '../systems/SoundManager';
import { UI, textStyle } from './Theme';

export class OptionSelector<T> extends Phaser.GameObjects.Container implements Focusable {
  public onPointerFocus?: () => void;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly labelText: Phaser.GameObjects.Text;
  private readonly valueText: Phaser.GameObjects.Text;
  private readonly arrows: Phaser.GameObjects.Text[];
  private focused = false;
  private readonly rowWidth: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    private readonly options: T[],
    private index: number,
    private readonly format: (v: T) => string,
    private readonly onChange: (v: T) => void,
    width = 420,
  ) {
    super(scene, x, y);
    this.rowWidth = width;
    this.bg = scene.add.graphics();
    this.labelText = scene.add.text(-width / 2 + 16, 0, label, textStyle(16, UI.textSoft, true)).setOrigin(0, 0.5);
    this.valueText = scene.add.text(width / 2 - 80, 0, '', textStyle(16, UI.text, true)).setOrigin(0.5);

    const left = scene.add.text(width / 2 - 150, 0, '◀', textStyle(16, UI.accent, true)).setOrigin(0.5);
    const right = scene.add.text(width / 2 - 10, 0, '▶', textStyle(16, UI.accent, true)).setOrigin(0.5);
    this.arrows = [left, right];
    for (const [arrow, delta] of [[left, -1], [right, 1]] as const) {
      arrow.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.step(delta));
    }

    const zone = scene.add.zone(0, 0, width, 34).setInteractive();
    zone.on('pointerover', () => {
      this.setFocused(true);
      this.onPointerFocus?.();
    });
    // Clicking the row (not the arrows) cycles forward
    zone.on('pointerdown', () => this.step(1));

    this.add([this.bg, zone, this.labelText, this.valueText, left, right]);
    this.setSize(width, 34);
    this.refresh();
    scene.add.existing(this);
  }

  get value(): T {
    return this.options[this.index];
  }

  left(): void {
    this.step(-1);
  }

  right(): void {
    this.step(1);
  }

  activate(): void {
    this.step(1);
  }

  setFocused(focused: boolean): void {
    if (this.focused === focused) return;
    this.focused = focused;
    this.refresh();
  }

  private step(delta: number): void {
    this.index = (this.index + delta + this.options.length) % this.options.length;
    soundManager.menuClick();
    this.onChange(this.value);
    this.refresh();
  }

  private refresh(): void {
    const g = this.bg;
    g.clear();
    g.fillStyle(this.focused ? 0x2a4470 : UI.panel, 0.95);
    g.fillRect(-this.rowWidth / 2, -17, this.rowWidth, 34);
    if (this.focused) {
      g.fillStyle(0xffe14d, 1);
      g.fillRect(-this.rowWidth / 2, -17, 4, 34);
    }
    this.valueText.setText(this.format(this.value));
    this.labelText.setColor(this.focused ? UI.textHighlight : UI.textSoft);
    for (const a of this.arrows) a.setAlpha(this.focused ? 1 : 0.6);
  }
}
