// ============================================================
// MatchWorld — Shared, mutable state of a running match that the
// gameplay systems (actions, collisions, AI) operate on.
// ============================================================

import type { Ball } from '../entities/Ball';
import type { Player } from '../entities/Player';

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
   * Player currently controlled by a human, per team (index = team).
   * null for a CPU team. Both are set in 2-player mode.
   */
  controlled: [Player | null, Player | null];
  stats: MatchStats;
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
