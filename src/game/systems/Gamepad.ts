// ============================================================
// Gamepad — Xbox controller support via the browser Gamepad API
// ("standard" button layout used by Chrome, Edge and Firefox).
//
// Gameplay mapping (football-game style):
//   left stick / D-pad  move           RT  sprint
//   A  pass (hold = power; no ball: switch player)
//   B  shoot (hold = power)
//   X  lob (hold = power; no ball: tackle)   LB  switch player
//   Menu  pause                        View  mute
// Menus: stick / D-pad navigate, A confirm, B back (any controller).
// 2 PLAYERS: see padForPlayer() for which controller each player uses.
//
// Mapping and edge detection are pure functions over a PadState so
// they can be unit-tested without a browser.
// ============================================================

import { EMPTY_RAW, InputSource, RawInput } from './InputTypes';

/** Indices of the W3C "standard" gamepad layout (Xbox names). */
export const PAD = {
  A: 0, B: 1, X: 2, Y: 3,
  LB: 4, RB: 5, LT: 6, RT: 7,
  VIEW: 8, MENU: 9, LS: 10, RS: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
} as const;

/** The subset of the browser Gamepad object we use. */
export interface PadState {
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
  axes: ReadonlyArray<number>;
}

/** Stick values inside this radius count as centred. */
export const STICK_DEADZONE = 0.25;
/** Stick deflection that counts as a menu "press". */
const MENU_STICK_THRESHOLD = 0.6;

/**
 * All connected controllers, in the browser's order (pad 1, pad 2, ...).
 * Test hooks: window.__RF_FAKE_PADS__ (list) or __RF_FAKE_PAD__ (one pad).
 */
export function connectedPads(): PadState[] {
  const w = window as unknown as { __RF_FAKE_PADS__?: PadState[]; __RF_FAKE_PAD__?: PadState };
  if (w.__RF_FAKE_PADS__) return w.__RF_FAKE_PADS__;
  if (w.__RF_FAKE_PAD__) return [w.__RF_FAKE_PAD__];
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return [];
  const pads: PadState[] = [];
  for (const p of navigator.getGamepads()) {
    if (p && p.connected) pads.push(p);
  }
  return pads;
}

/** First connected controller, if any. */
export function readPad(): PadState | null {
  return connectedPads()[0] ?? null;
}

/**
 * Which controller each player uses in 2-player mode:
 * - one pad:  P1 = keyboard only, P2 = pad 1
 * - two pads: P1 = keyboard + pad 1, P2 = pad 2
 */
export function padForPlayer(pads: readonly PadState[], player: 1 | 2): PadState | null {
  if (player === 1) return pads.length >= 2 ? pads[0] : null;
  return pads.length >= 2 ? pads[1] : (pads[0] ?? null);
}

export function isDown(pad: PadState, button: number): boolean {
  const b = pad.buttons[button];
  return !!b && (b.pressed || b.value > 0.5);
}

/** Movement from the left stick (radial dead zone, rescaled) or else the D-pad. */
export function padMove(pad: PadState): { x: number; y: number } {
  const ax = pad.axes[0] ?? 0;
  const ay = pad.axes[1] ?? 0;
  const len = Math.hypot(ax, ay);
  if (len > STICK_DEADZONE) {
    const k = Math.min(1, (len - STICK_DEADZONE) / (1 - STICK_DEADZONE)) / len;
    return { x: ax * k, y: ay * k };
  }
  const x = (isDown(pad, PAD.RIGHT) ? 1 : 0) - (isDown(pad, PAD.LEFT) ? 1 : 0);
  const y = (isDown(pad, PAD.DOWN) ? 1 : 0) - (isDown(pad, PAD.UP) ? 1 : 0);
  return { x, y };
}

/** Gameplay mapping of a controller state. */
export function mapPadToRaw(pad: PadState): RawInput {
  const move = padMove(pad);
  return {
    moveX: move.x,
    moveY: move.y,
    sprint: isDown(pad, PAD.RT),
    pass: isDown(pad, PAD.A),
    shoot: isDown(pad, PAD.B),
    lob: isDown(pad, PAD.X),
    switchPlayer: isDown(pad, PAD.LB),
  };
}

/** InputSource for the gameplay InputSystem. */
export class GamepadInput implements InputSource {
  constructor(private readonly reader: () => PadState | null = readPad) {}

  read(): RawInput {
    const pad = this.reader();
    return pad ? mapPadToRaw(pad) : { ...EMPTY_RAW };
  }
}

/** Buttons as menus and the match scene see them. */
export type PadCommand = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause' | 'mute';

function commandsDown(pad: PadState): Set<PadCommand> {
  const s = new Set<PadCommand>();
  const ax = pad.axes[0] ?? 0;
  const ay = pad.axes[1] ?? 0;
  if (isDown(pad, PAD.UP) || ay < -MENU_STICK_THRESHOLD) s.add('up');
  if (isDown(pad, PAD.DOWN) || ay > MENU_STICK_THRESHOLD) s.add('down');
  if (isDown(pad, PAD.LEFT) || ax < -MENU_STICK_THRESHOLD) s.add('left');
  if (isDown(pad, PAD.RIGHT) || ax > MENU_STICK_THRESHOLD) s.add('right');
  if (isDown(pad, PAD.A)) s.add('confirm');
  if (isDown(pad, PAD.B)) s.add('back');
  if (isDown(pad, PAD.MENU)) s.add('pause');
  if (isDown(pad, PAD.VIEW)) s.add('mute');
  return s;
}

/**
 * Edge detector for menu-style commands. Each consumer (a menu, the match
 * scene) owns one, polls it once per frame and gets the commands that were
 * pressed since the previous poll. A held stick/button fires only once.
 * Any connected controller counts (both players can drive menus and pause).
 */
export class PadEdges {
  private prev = new Set<PadCommand>();

  constructor(private readonly reader: () => readonly PadState[] = connectedPads) {}

  private current(): Set<PadCommand> {
    const all = new Set<PadCommand>();
    for (const pad of this.reader()) for (const c of commandsDown(pad)) all.add(c);
    return all;
  }

  /** Treat everything currently held as already handled (e.g. when a menu opens). */
  sync(): void {
    this.prev = this.current();
  }

  poll(): PadCommand[] {
    const now = this.current();
    const pressed = [...now].filter((c) => !this.prev.has(c));
    this.prev = now;
    return pressed;
  }
}
