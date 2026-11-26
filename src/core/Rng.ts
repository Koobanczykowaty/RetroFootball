// ============================================================
// Rng — Seeded pseudo-random numbers (mulberry32) for everything
// that affects gameplay. The same seed and the same inputs give the
// same match: needed for networking and replays. Cosmetic randomness
// in the client (animations, stars) keeps using Math.random.
// ============================================================

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Current internal state (for snapshots / determinism checks). */
  get seed(): number {
    return this.state;
  }
}
