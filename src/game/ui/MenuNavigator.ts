// ============================================================
// MenuNavigator — Keyboard navigation for a list of Focusables.
// Up/Down arrows move focus, Left/Right change options,
// Enter/Space activate, Escape/Backspace trigger an optional back action.
// (WASD are deliberately not used: A/S/D are gameplay action keys.)
// ============================================================

import Phaser from 'phaser';
import type { Focusable } from './Button';

export class MenuNavigator {
  private index = -1;
  private active = false;
  private ignoreEvent: KeyboardEvent | null = null;
  private readonly handler: (e: KeyboardEvent) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly items: Focusable[],
    private readonly onBack?: () => void,
  ) {
    this.handler = (e) => this.onKey(e);
    items.forEach((item, i) => {
      item.onPointerFocus = () => {
        if (this.index !== i && this.index >= 0) this.items[this.index].setFocused(false);
        this.index = i;
      };
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.deactivate());
  }

  /**
   * @param openedBy the key event that opened this menu, if any. Phaser emits
   *   'keydown-ESC' before 'keydown', so a listener added while handling the
   *   former also receives the same event — it must be ignored, otherwise ESC
   *   would pause and instantly resume.
   */
  activate(initialIndex = 0, openedBy?: KeyboardEvent): this {
    this.ignoreEvent = openedBy ?? null;
    if (!this.active) {
      this.scene.input.keyboard?.on('keydown', this.handler);
      this.active = true;
    }
    this.focus(initialIndex);
    return this;
  }

  deactivate(): void {
    if (!this.active) return;
    this.scene.input.keyboard?.off('keydown', this.handler);
    this.active = false;
  }

  focus(i: number): void {
    if (this.items.length === 0) return;
    if (this.index >= 0) this.items[this.index]?.setFocused(false);
    this.index = (i + this.items.length) % this.items.length;
    this.items[this.index].setFocused(true);
  }

  private onKey(e: KeyboardEvent): void {
    if (e === this.ignoreEvent) return;
    if (e.repeat && (e.code === 'Enter' || e.code === 'Space')) return;
    const current = this.index >= 0 ? this.items[this.index] : undefined;
    switch (e.code) {
      case 'ArrowUp':
        this.focus(this.index - 1);
        break;
      case 'ArrowDown':
        this.focus(this.index + 1);
        break;
      case 'ArrowLeft':
        current?.left?.();
        break;
      case 'ArrowRight':
        current?.right?.();
        break;
      case 'Enter':
      case 'Space':
        current?.activate?.();
        break;
      case 'Escape':
      case 'Backspace':
        this.onBack?.();
        break;
    }
  }
}
