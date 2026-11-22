// ============================================================
// MenuNavigator — Keyboard navigation for a list of Focusables.
// Up/Down arrows move focus, Left/Right change options,
// Enter/Space activate, Escape/Backspace trigger an optional back action.
// (WASD are deliberately not used: A/S/D are gameplay action keys.)
// ============================================================

import Phaser from 'phaser';
import type { Focusable } from './Button';

/**
 * Phaser's KeyboardPlugin processes the whole queue of the current frame every
 * time a new DOM key event arrives, and its duplicate check only catches an
 * immediate repeat. With two different keys in one frame (~16 ms) the earlier
 * event object is emitted again. Each listener creates its own deduper so it
 * acts on every event once (separate listeners still all see the event).
 * The returned function returns true the first time it sees an event.
 */
export function createEventDeduper(): (e: Event) => boolean {
  const seen = new WeakSet<Event>();
  return (e) => {
    if (seen.has(e)) return false;
    seen.add(e);
    return true;
  };
}

export class MenuNavigator {
  private index = -1;
  private active = false;
  private ignoreEvent: KeyboardEvent | null = null;
  private readonly firstTime = createEventDeduper();
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
    // Phaser re-processes all key events of the current frame whenever a new one
    // arrives, so the same event object can reach us twice: handle it only once.
    if (!this.firstTime(e)) return;
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
