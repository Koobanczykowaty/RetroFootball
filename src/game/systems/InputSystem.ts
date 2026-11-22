// ============================================================
// InputSystem — Merges raw input sources (keyboard, test bot, later
// gamepad) into one per-frame InputState with edge detection and
// shot charging.
// ============================================================

import Phaser from 'phaser';
import { INPUT_MAP } from '../config/GameplayConfig';

/** Level (held) state reported by an input device. */
export interface RawInput {
  moveX: number; // -1..1
  moveY: number; // -1..1
  sprint: boolean;
  pass: boolean;
  shoot: boolean;
  lob: boolean;
  switchPlayer: boolean;
}

/** Any device that can report RawInput (keyboard, gamepad...). */
export interface InputSource {
  read(): RawInput;
  destroy?(): void;
}

export interface InputState {
  moveX: number;
  moveY: number;
  sprint: boolean;
  /** Edge-triggered: true only on the frame the button went down. */
  passPressed: boolean;
  lobPressed: boolean;
  switchPressed: boolean;
  shootPressed: boolean;
  /** Shoot button is held and the hold hasn't been consumed. */
  shootHeld: boolean;
  /** How long the current shoot hold has lasted (ms). */
  shootHeldMs: number;
  /** Edge-triggered: shoot button released after an unconsumed hold. */
  shootReleased: boolean;
  /** Pass button is held and the hold hasn't been consumed (charging). */
  passHeld: boolean;
  /** How long the current pass hold has lasted (ms). */
  passHeldMs: number;
  /** Edge-triggered: pass button released after an unconsumed hold. */
  passReleased: boolean;
  /** Lob button is held and the hold hasn't been consumed (charging). */
  lobHeld: boolean;
  /** How long the current lob hold has lasted (ms). */
  lobHeldMs: number;
  /** Edge-triggered: lob button released after an unconsumed hold. */
  lobReleased: boolean;
}

/** Tracks a "hold to charge, release to fire" button. */
class ChargeButton {
  heldMs = 0;
  consumed = false;

  /** Returns whether the button was released this frame after an unconsumed hold. */
  update(down: boolean, wasDown: boolean, deltaMs: number): boolean {
    if (down) {
      if (!wasDown) {
        this.heldMs = 0;
        this.consumed = false;
      } else {
        this.heldMs += deltaMs;
      }
      return false;
    }
    if (wasDown) {
      const released = !this.consumed;
      this.consumed = false;
      return released;
    }
    return false;
  }
}

export const EMPTY_RAW: RawInput = {
  moveX: 0, moveY: 0, sprint: false, pass: false, shoot: false, lob: false, switchPlayer: false,
};

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
  private prev: RawInput = { ...EMPTY_RAW };
  private readonly pass = new ChargeButton();
  private readonly shoot = new ChargeButton();
  private readonly lob = new ChargeButton();

  addSource(source: InputSource): void {
    this.sources.push(source);
  }

  private readRaw(): RawInput {
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

  /** Call exactly once per gameplay frame. */
  update(deltaMs: number): InputState {
    const raw = this.readRaw();
    const prev = this.prev;

    const passReleased = this.pass.update(raw.pass, prev.pass, deltaMs);
    const shootReleased = this.shoot.update(raw.shoot, prev.shoot, deltaMs);
    const lobReleased = this.lob.update(raw.lob, prev.lob, deltaMs);

    const state: InputState = {
      moveX: raw.moveX,
      moveY: raw.moveY,
      sprint: raw.sprint,
      passPressed: raw.pass && !prev.pass,
      lobPressed: raw.lob && !prev.lob,
      switchPressed: raw.switchPlayer && !prev.switchPlayer,
      shootPressed: raw.shoot && !prev.shoot,
      shootHeld: raw.shoot && !this.shoot.consumed,
      shootHeldMs: this.shoot.heldMs,
      shootReleased,
      passHeld: raw.pass && !this.pass.consumed,
      passHeldMs: this.pass.heldMs,
      passReleased,
      lobHeld: raw.lob && !this.lob.consumed,
      lobHeldMs: this.lob.heldMs,
      lobReleased,
    };
    this.prev = raw;
    return state;
  }

  /** The current shoot hold has been used (e.g. for a tackle or an auto-fired shot). */
  consumeShoot(): void {
    this.shoot.consumed = true;
  }

  /** The current pass hold has been used (e.g. auto-fired, or used to switch player). */
  consumePass(): void {
    this.pass.consumed = true;
  }

  /** The current lob hold has been used (e.g. auto-fired at full charge). */
  consumeLob(): void {
    this.lob.consumed = true;
  }

  /**
   * Treat everything currently held as already handled — used after closing
   * a menu so the key that confirmed it doesn't trigger a game action.
   */
  sync(): void {
    this.prev = this.readRaw();
    if (this.prev.pass) this.pass.consumed = true;
    if (this.prev.shoot) this.shoot.consumed = true;
    if (this.prev.lob) this.lob.consumed = true;
  }

  destroy(): void {
    for (const s of this.sources) s.destroy?.();
    this.sources = [];
  }
}
