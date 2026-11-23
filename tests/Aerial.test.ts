import { describe, expect, it } from 'vitest';
import { AERIAL, BALL } from '../src/game/config/GameplayConfig';
import { aerialZone, canStrikeNow, predictAerialContact, timingQuality } from '../src/game/logic/Aerial';

describe('aerial zones', () => {
  it('feet below the volley height, then volley, header, and over the head', () => {
    expect(aerialZone(0)).toBeNull();
    expect(aerialZone(AERIAL.volleyMinZ - 1)).toBeNull();
    expect(aerialZone(AERIAL.volleyMinZ)).toBe('volley');
    expect(aerialZone(AERIAL.headerMinZ - 1)).toBe('volley');
    expect(aerialZone(AERIAL.headerMinZ)).toBe('header');
    expect(aerialZone(AERIAL.headerMaxZ)).toBe('header');
    expect(aerialZone(AERIAL.headerMaxZ + 1)).toBeNull();
  });

  it('the feet zone matches the ground-control height', () => {
    expect(AERIAL.volleyMinZ).toBe(BALL.playerReachHeight);
  });

  it('needs the ball within reach', () => {
    const ball = { x: 100, y: 100, z: 25, vx: 0, vy: 0, vz: 0 };
    expect(canStrikeNow(ball, 100 + AERIAL.reach - 1, 100)).toBe('header');
    expect(canStrikeNow(ball, 100 + AERIAL.reach + 5, 100)).toBeNull();
  });
});

describe('predictAerialContact', () => {
  const still = { vx: 0, vy: 0 };

  it('finds the header moment of a dropping ball coming at the player', () => {
    // Ball 60 px away at 40 px height, falling, moving toward the player
    const ball = { x: 0, y: 0, z: 40, vx: 300, vy: 0, vz: -20 };
    const c = predictAerialContact(ball, { x: 60, y: 0, ...still });
    expect(c).not.toBeNull();
    expect(c!.zone).toBe('header');
    expect(c!.t).toBeGreaterThan(0.05);
    expect(c!.t).toBeLessThan(AERIAL.pressWindowSec);
  });

  it('returns null when the ball lands before reaching the player', () => {
    const ball = { x: 0, y: 0, z: 12, vx: 100, vy: 0, vz: -150 };
    expect(predictAerialContact(ball, { x: 150, y: 0, ...still })).toBeNull();
  });

  it('returns null for a ball rolling on the ground', () => {
    const ball = { x: 0, y: 0, z: 0, vx: 300, vy: 0, vz: 0 };
    expect(predictAerialContact(ball, { x: 30, y: 0, ...still })).toBeNull();
  });

  it('returns null when the ball passes too far to the side', () => {
    const ball = { x: 0, y: 0, z: 30, vx: 300, vy: 0, vz: 0 };
    expect(predictAerialContact(ball, { x: 60, y: 60, ...still })).toBeNull();
  });

  it('a ball in reach right now is contact at t = 0', () => {
    const ball = { x: 0, y: 0, z: 14, vx: 0, vy: 0, vz: -50 };
    const c = predictAerialContact(ball, { x: 5, y: 0, ...still });
    expect(c?.t).toBe(0);
    expect(c?.zone).toBe('volley');
  });
});

describe('timingQuality', () => {
  it('is best at the contact and weakest at the start of the window', () => {
    expect(timingQuality(0)).toBe(1);
    expect(timingQuality(AERIAL.pressWindowSec)).toBeCloseTo(AERIAL.minQuality, 5);
    expect(timingQuality(0.1)).toBeGreaterThan(timingQuality(0.3));
    expect(timingQuality(10)).toBe(AERIAL.minQuality);
  });
});
