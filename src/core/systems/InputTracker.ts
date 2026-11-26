// ============================================================
// InputTracker — Turns one human's raw input (held keys / buttons,
// one RawInput per frame) into an InputState with edge detection and
// charging of pass / shot / lob. Core: it only sees RawInput, so the
// same code runs for a local keyboard, a gamepad, a test bot or
// inputs arriving over the network.
// ============================================================

import { EMPTY_RAW, RawInput } from './InputTypes';

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

export class InputTracker {
  private prev: RawInput = { ...EMPTY_RAW };
  private readonly pass = new ChargeButton();
  private readonly shoot = new ChargeButton();
  private readonly lob = new ChargeButton();

  /** Call exactly once per gameplay frame with that frame's raw input. */
  update(raw: RawInput, deltaMs: number): InputState {
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
    this.prev = { ...raw };
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
   * Treat everything currently held as already handled, so a key still held
   * from before (closing a menu, the keeper taking over) needs a fresh press.
   * @param raw what is held right now (default: the last frame's input)
   */
  sync(raw: RawInput = this.prev): void {
    this.prev = { ...raw };
    if (raw.pass) this.pass.consumed = true;
    if (raw.shoot) this.shoot.consumed = true;
    if (raw.lob) this.lob.consumed = true;
  }
}
