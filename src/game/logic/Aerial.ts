// ============================================================
// Aerial — Headers and volleys: height zones, predicting when an
// airborne ball reaches a player, and the timing quality of the
// press. Pure logic (no Phaser) so it is unit-testable.
//
// Ball height z (px): below AERIAL.volleyMinZ it is at the feet
// (normal control), volleyMinZ..headerMinZ = volley (knee/waist),
// headerMinZ..headerMaxZ = header, above that it flies over.
// ============================================================

import { AERIAL, BALL } from '../config/GameplayConfig';

export type AerialZone = 'volley' | 'header';

export interface AerialBall {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export function aerialZone(z: number): AerialZone | null {
  if (z >= AERIAL.headerMinZ && z <= AERIAL.headerMaxZ) return 'header';
  if (z >= AERIAL.volleyMinZ && z < AERIAL.headerMinZ) return 'volley';
  return null;
}

/** Whether the player can strike the ball right now (in reach and in a zone). */
export function canStrikeNow(ball: AerialBall, px: number, py: number): AerialZone | null {
  if (Math.hypot(ball.x - px, ball.y - py) > AERIAL.reach) return null;
  return aerialZone(ball.z);
}

/**
 * Simulates the ball's flight (gravity, air friction) and the player running
 * on at his current velocity, and returns the first moment within
 * `horizonSec` when the ball is in reach and at volley or header height.
 */
export function predictAerialContact(
  ball: AerialBall,
  player: { x: number; y: number; vx: number; vy: number },
  horizonSec: number = AERIAL.pressWindowSec,
): { t: number; zone: AerialZone; z: number } | null {
  if (ball.z <= 0 && ball.vz <= 0) return null;
  const step = 1 / 60;
  let { x, y, z, vx, vy, vz } = ball;
  let px = player.x;
  let py = player.y;
  const f = Math.pow(BALL.airFriction, step * 60);
  for (let t = 0; t <= horizonSec + 1e-9; t += step) {
    const zone = canStrikeNow({ x, y, z, vx, vy, vz }, px, py);
    if (zone) return { t, zone, z };
    vz -= BALL.gravity * step;
    z += vz * step;
    if (z <= 0) return null; // lands first: normal ground control
    x += vx * step;
    y += vy * step;
    vx *= f;
    vy *= f;
    px += player.vx * step;
    py += player.vy * step;
  }
  return null;
}

/**
 * Timing quality 0..1 of a press made `secondsEarly` before the contact:
 * pressing right at the contact is perfect, pressing at the start of the
 * window is weak (AERIAL.minQuality).
 */
export function timingQuality(secondsEarly: number): number {
  const k = 1 - Math.max(0, secondsEarly) / AERIAL.pressWindowSec;
  return Math.max(AERIAL.minQuality, Math.min(1, AERIAL.minQuality + (1 - AERIAL.minQuality) * k));
}
