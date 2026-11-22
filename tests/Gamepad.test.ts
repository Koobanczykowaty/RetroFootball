import { describe, expect, it } from 'vitest';
import { GamepadInput, PAD, PadEdges, PadState, STICK_DEADZONE, mapPadToRaw, padMove } from '../src/game/systems/Gamepad';

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

describe('menu edges (PadEdges)', () => {
  it('reports a press once, not every frame it is held', () => {
    let state = pad();
    const edges = new PadEdges(() => state);
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
    const edges = new PadEdges(() => state);
    edges.poll();
    state = pad([PAD.B, PAD.MENU, PAD.VIEW, PAD.DOWN]);
    expect(edges.poll().sort()).toEqual(['back', 'down', 'mute', 'pause']);
    state = pad([], 0.9, 0);
    expect(edges.poll()).toEqual(['right']);
  });

  it('sync() swallows buttons already held when a menu opens', () => {
    const state = pad([PAD.A]);
    const edges = new PadEdges(() => state);
    edges.sync();
    expect(edges.poll()).toEqual([]);
  });
});
