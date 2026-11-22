import { describe, expect, it } from 'vitest';
import { BALL } from '../src/game/config/GameplayConfig';
import type { Ball } from '../src/game/entities/Ball';
import type { Player } from '../src/game/entities/Player';
import { createStats, MatchWorld } from '../src/game/logic/MatchWorld';
import { ActionSystem } from '../src/game/systems/ActionSystem';

/** Minimal stand-ins: ActionSystem only touches these fields/methods. */
function fakePlayer(id: number, x: number, y: number, role = 'midfielder'): Player {
  return {
    id, teamIndex: 0, role, x, y, vx: 0, vy: 0, facingX: 1, facingY: 0, hasBall: false,
    canKick: () => true,
    startKickCooldown() { /* noop */ },
    distanceTo(ox: number, oy: number) { return Math.hypot(this.x - ox, this.y - oy); },
  } as unknown as Player;
}

type FakeBall = Ball & { kicked: { vx: number; vy: number; lift: number } | null };

function fakeBall(): FakeBall {
  const b = {
    x: 0, y: 0, ownerId: null as number | null, passTargetId: null as number | null,
    lastKickerId: null as number | null, lastTouchTeam: null as number | null,
    kicked: null as { vx: number; vy: number; lift: number } | null,
    release() { b.ownerId = null; },
    kick(vx: number, vy: number, opts: { lift?: number } = {}) {
      b.kicked = { vx, vy, lift: opts.lift ?? 0 };
      b.passTargetId = null;
    },
  };
  return b as unknown as FakeBall;
}

/** Passer at (200,270) with the ball, plus the given teammates. */
function setup(mates: Player[]): { actions: ActionSystem; passer: Player; ball: FakeBall } {
  const passer = fakePlayer(1, 200, 270);
  const ball = fakeBall();
  passer.hasBall = true;
  ball.ownerId = passer.id;
  const team = [passer, ...mates];
  const world: MatchWorld = {
    ball, players: team, teams: [team, []], humanTeam: 0, controlled: passer, stats: createStats(),
  };
  return { actions: new ActionSystem(world), passer, ball };
}

const speedOf = (b: FakeBall) => Math.hypot(b.kicked!.vx, b.kicked!.vy);

describe('charged pass (S)', () => {
  function passSpeed(power?: number): number {
    const { actions, passer, ball } = setup([fakePlayer(2, 400, 270)]);
    actions.pass(passer, 1, 0, power);
    return speedOf(ball);
  }

  it('power scales the speed: 0 → 70%, 0.5 → normal, 1 → 130%', () => {
    const normal = passSpeed(undefined);
    expect(passSpeed(0.5)).toBeCloseTo(normal, 5);
    expect(passSpeed(0)).toBeCloseTo(normal * (1 - BALL.passPowerRange), 5);
    expect(passSpeed(1)).toBeCloseTo(normal * (1 + BALL.passPowerRange), 5);
  });

  it('normal passes are faster than before (300–480 px/s)', () => {
    expect(passSpeed(undefined)).toBeGreaterThanOrEqual(BALL.passSpeedMin);
    expect(passSpeed(undefined)).toBeLessThanOrEqual(BALL.passSpeedMax);
  });
});

describe('human lob (A) without auto-target', () => {
  it('flies along the held direction even if a teammate is elsewhere', () => {
    const { actions, passer, ball } = setup([fakePlayer(2, 400, 270)]); // teammate to the right
    actions.lobToSpot(passer, 0, 1, 0.5); // but we lob downward
    expect(Math.abs(ball.kicked!.vx)).toBeLessThan(1e-6);
    expect(ball.kicked!.vy).toBeGreaterThan(0);
    expect(ball.kicked!.lift).toBe(BALL.lobLift);
  });

  it('more power = further', () => {
    const speed = (power: number) => {
      const { actions, passer, ball } = setup([]);
      actions.lobToSpot(passer, 1, 0, power);
      return speedOf(ball);
    };
    expect(speed(0)).toBeLessThan(speed(0.5));
    expect(speed(0.5)).toBeLessThan(speed(1));
  });

  it('the teammate nearest the landing spot becomes the receiver', () => {
    // Full power lands 380px ahead → around x=580
    const near = fakePlayer(2, 570, 280);
    const far = fakePlayer(3, 300, 270);
    const { actions, passer, ball } = setup([near, far]);
    const receiver = actions.lobToSpot(passer, 1, 0, 1);
    expect(receiver).toBe(near);
    expect(ball.passTargetId).toBe(near.id);
  });

  it('no receiver when nobody is near the landing spot', () => {
    const { actions, passer, ball } = setup([fakePlayer(2, 200, 100)]);
    expect(actions.lobToSpot(passer, 1, 0, 1)).toBeNull();
    expect(ball.passTargetId).toBeNull();
  });
});
