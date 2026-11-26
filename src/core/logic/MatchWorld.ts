// ============================================================
// MatchWorld — Shared, mutable state of a running match that the
// gameplay systems (actions, collisions, AI) operate on.
// ============================================================

import type { Ball } from '../entities/Ball';
import type { Player } from '../entities/Player';
import type { MatchEvent } from '../MatchEvents';
import type { Rng } from '../Rng';

export interface MatchStats {
  shots: [number, number];
  onTarget: [number, number];
  passes: [number, number];
  tackles: [number, number];
  saves: [number, number];
  /** Milliseconds each team had the ball. */
  possessionMs: [number, number];
}

export interface MatchWorld {
  ball: Ball;
  players: Player[];
  teams: [Player[], Player[]];
  /**
   * Players currently controlled by humans, per team (index = team).
   * Empty for a CPU team; one per human (two on one team in co-op).
   * Maintained by HumanControl.setControlled / release.
   */
  controlled: [Player[], Player[]];
  stats: MatchStats;
  /** Seeded randomness for everything that affects play. */
  rng: Rng;
  /** Events for the client (sounds, banners...); drained every frame. */
  events: MatchEvent[];
}

export function createStats(): MatchStats {
  return {
    shots: [0, 0],
    onTarget: [0, 0],
    passes: [0, 0],
    tackles: [0, 0],
    saves: [0, 0],
    possessionMs: [0, 0],
  };
}

export function findPlayer(world: MatchWorld, id: number | null): Player | null {
  if (id === null) return null;
  return world.players.find((p) => p.id === id) ?? null;
}

export function ballOwner(world: MatchWorld): Player | null {
  return findPlayer(world, world.ball.ownerId);
}
