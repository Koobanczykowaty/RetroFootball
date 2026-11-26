// ============================================================
// InputSystem — One human's input devices (keyboard, gamepad, test
// bot) merged into one RawInput per frame. Edge detection and
// charging happen in the core (core/systems/InputTracker), which
// only ever sees RawInput.
// ============================================================

import Phaser from 'phaser';
import { INPUT_MAP } from '../../core/config/GameplayConfig';
import { EMPTY_RAW, InputSource, RawInput } from '../../core/systems/InputTypes';

export { EMPTY_RAW };
export type { InputSource, RawInput };

export class KeyboardInput implements InputSource {
  private keys = new Map<string, Phaser.Input.Keyboard.Key>();

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (!kb) return;
    const names = new Set<string>();
    for (const list of Object.values(INPUT_MAP)) for (const k of list) names.add(k);
    for (const k of names) {
      const code = Phaser.Input.Keyboard.KeyCodes[k as keyof typeof Phaser.Input.Keyboard.KeyCodes];
      this.keys.set(k, kb.addKey(code, true, false));
    }
  }

  private down(names: string[]): boolean {
    return names.some((k) => this.keys.get(k)?.isDown ?? false);
  }

  read(): RawInput {
    return {
      moveX: (this.down(INPUT_MAP.right) ? 1 : 0) - (this.down(INPUT_MAP.left) ? 1 : 0),
      moveY: (this.down(INPUT_MAP.down) ? 1 : 0) - (this.down(INPUT_MAP.up) ? 1 : 0),
      sprint: this.down(INPUT_MAP.sprint),
      pass: this.down(INPUT_MAP.pass),
      shoot: this.down(INPUT_MAP.shoot),
      lob: this.down(INPUT_MAP.lob),
      switchPlayer: this.down(INPUT_MAP.switchPlayer),
    };
  }

  destroy(): void {
    this.keys.clear();
  }
}

export class InputSystem {
  private sources: InputSource[] = [];

  addSource(source: InputSource): void {
    this.sources.push(source);
  }

  /** Everything held right now on all of this human's devices. */
  read(): RawInput {
    const r: RawInput = { ...EMPTY_RAW };
    for (const s of this.sources) {
      const i = s.read();
      r.moveX += i.moveX;
      r.moveY += i.moveY;
      r.sprint ||= i.sprint;
      r.pass ||= i.pass;
      r.shoot ||= i.shoot;
      r.lob ||= i.lob;
      r.switchPlayer ||= i.switchPlayer;
    }
    r.moveX = Math.max(-1, Math.min(1, r.moveX));
    r.moveY = Math.max(-1, Math.min(1, r.moveY));
    return r;
  }

  destroy(): void {
    for (const s of this.sources) s.destroy?.();
    this.sources = [];
  }
}
