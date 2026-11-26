// ============================================================
// InputTypes — Device-independent input types (no Phaser import,
// so input mapping code can be unit-tested in Node).
// ============================================================

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

/** Any device that can report RawInput (keyboard, gamepad, test bot...). */
export interface InputSource {
  read(): RawInput;
  destroy?(): void;
}

export const EMPTY_RAW: RawInput = {
  moveX: 0, moveY: 0, sprint: false, pass: false, shoot: false, lob: false, switchPlayer: false,
};
