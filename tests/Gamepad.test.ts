import { describe, expect, it } from 'vitest';
import {
  GamepadInput, PAD, PadEdges, PadState, STICK_DEADZONE, mapPadToRaw, padForPlayer, padMove,
} from '../src/game/systems/Gamepad';

/** A standard-layout controller state with the given buttons held and stick axes. */
function pad(held: number[] = [], lx = 0, ly = 0): PadState {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: held.includes(i), value: held.includes(i) ? 1 : 0 }));
  return { buttons, axes: [lx, ly, 0, 0] };
}

describe('Xbox controller mapping', () => {
  it('maps the football-style buttons', () => {
    expect(mapPadToRaw(pad([PAD.A])).pass).toBe(true);
    expect(mapPadToRaw(pad([PAD.B])).shoot).toBe(true);
    expect(mapPadToRaw(pad([PAD.X])).lob).toBe(true);
    expect(mapPadToRaw(pad([PAD.LB])).switchPlayer).toBe(true);
    expect(mapPadToRaw(pad([PAD.RT])).sprint).toBe(true);
    const idle = mapPadToRaw(pad());
    expect([idle.pass, idle.shoot, idle.lob, idle.switchPlayer, idle.sprint]).toEqual([false, false, false, false, false]);
  });

  it('treats a half-pressed analog trigger as sprint', () => {
    const p = pad();
    (p.buttons as Array<{ pressed: boolean; value: number }>)[PAD.RT] = { pressed: false, value: 0.7 };
    expect(mapPadToRaw(p).sprint).toBe(true);
  });

  it('ignores stick drift inside the dead zone', () => {
    expect(padMove(pad([], STICK_DEADZONE * 0.8, 0))).toEqual({ x: 0, y: 0 });
  });

  it('uses the left stick with full range after the dead zone', () => {
    const full = padMove(pad([], 1, 0));
    expect(full.x).toBeCloseTo(1);
    const half = padMove(pad([], 0, -0.6));
    expect(half.y).toBeLessThan(0);
    expect(half.y).toBeGreaterThan(-1);
  });

  it('falls back to the D-pad (diagonals too)', () => {
    expect(padMove(pad([PAD.UP, PAD.LEFT]))).toEqual({ x: -1, y: -1 });
  });

  it('GamepadInput reads nothing when no controller is connected', () => {
    const raw = new GamepadInput(() => null).read();
    expect(raw.moveX).toBe(0);
    expect(raw.pass).toBe(false);
  });
});

describe('2 PLAYERS controller assignment (padForPlayer)', () => {
  const pad1 = pad([PAD.A]);
  const pad2 = pad([PAD.B]);

  it('no controller: nobody gets one (P1 keeps the keyboard)', () => {
    expect(padForPlayer([], 1)).toBeNull();
    expect(padForPlayer([], 2)).toBeNull();
  });

  it('one controller: P2 gets it, P1 plays on the keyboard only', () => {
    expect(padForPlayer([pad1], 1)).toBeNull();
    expect(padForPlayer([pad1], 2)).toBe(pad1);
  });

  it('two controllers: P1 gets pad 1, P2 gets pad 2', () => {
    expect(padForPlayer([pad1, pad2], 1)).toBe(pad1);
    expect(padForPlayer([pad1, pad2], 2)).toBe(pad2);
  });

  it("one player's buttons never reach the other player's input", () => {
    const p1 = new GamepadInput(() => padForPlayer([pad1, pad2], 1)).read();
    const p2 = new GamepadInput(() => padForPlayer([pad1, pad2], 2)).read();
    expect([p1.pass, p1.shoot]).toEqual([true, false]); // pad 1 holds A
    expect([p2.pass, p2.shoot]).toEqual([false, true]); // pad 2 holds B
  });
});

describe('menu edges (PadEdges)', () => {
  it('reacts to any connected controller', () => {
    let pads = [pad(), pad()];
    const edges = new PadEdges(() => pads);
    edges.poll();
    pads = [pad(), pad([PAD.MENU])]; // second pad presses Menu
    expect(edges.poll()).toEqual(['pause']);
  });

  it('reports a press once, not every frame it is held', () => {
    let state = pad();
    const edges = new PadEdges(() => [state]);
    expect(edges.poll()).toEqual([]);
    state = pad([PAD.A]);
    expect(edges.poll()).toEqual(['confirm']);
    expect(edges.poll()).toEqual([]); // still held
    state = pad();
    edges.poll();
    state = pad([PAD.A]);
    expect(edges.poll()).toEqual(['confirm']); // pressed again
  });

  it('maps stick, D-pad, B, Menu and View to commands', () => {
    let state = pad();
    const edges = new PadEdges(() => [state]);
    edges.poll();
    state = pad([PAD.B, PAD.MENU, PAD.VIEW, PAD.DOWN]);
    expect(edges.poll().sort()).toEqual(['back', 'down', 'mute', 'pause']);
    state = pad([], 0.9, 0);
    expect(edges.poll()).toEqual(['right']);
  });

  it('sync() swallows buttons already held when a menu opens', () => {
    const state = pad([PAD.A]);
    const edges = new PadEdges(() => [state]);
    edges.sync();
    expect(edges.poll()).toEqual([]);
  });
});
