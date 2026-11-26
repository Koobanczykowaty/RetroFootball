// ============================================================
// Tournament — League and cup competitions (pure logic, no Phaser,
// unit-tested). The state is plain JSON so it can be saved as is.
//
// League: every team plays every other twice (home and away), 3 points
// for a win, 1 for a draw. Cup: single knockout matches; with a team
// count that is not 4 or 8, some teams get a bye in the first round.
// A cup match always has a winner (extra time + golden goal).
// ============================================================

export type TournamentKind = 'league' | 'cup';

export interface TournamentTeam {
  /** TEAMS id. */
  id: string;
  /** Played by a person (otherwise by the CPU). */
  human: boolean;
}

export interface Fixture {
  /** 0-based round (league matchday or cup round). */
  round: number;
  /** Index into Tournament.teams; the home team plays on side 0. */
  home: number;
  /** null = a cup bye: the home team goes through without playing. */
  away: number | null;
  /** null until played. */
  score: [number, number] | null;
  /** Decided in extra time (cup). */
  extraTime?: boolean;
}

export interface Tournament {
  version: 1;
  kind: TournamentKind;
  teams: TournamentTeam[];
  /** League: all matches from the start. Cup: rounds are added as they finish. */
  fixtures: Fixture[];
  /** Number of rounds in the whole competition. */
  rounds: number;
  /** Winner (index into teams) once the competition is over. */
  champion: number | null;
}

export type Rng = () => number;

export const MIN_TEAMS = 3;
export const MAX_TEAMS = 6;

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createTournament(kind: TournamentKind, teams: TournamentTeam[], rng: Rng = Math.random): Tournament {
  if (teams.length < MIN_TEAMS || teams.length > MAX_TEAMS) {
    throw new Error(`A tournament needs ${MIN_TEAMS}-${MAX_TEAMS} teams`);
  }
  const t: Tournament = { version: 1, kind, teams: [...teams], fixtures: [], rounds: 0, champion: null };
  const order = shuffled(teams.map((_, i) => i), rng);
  if (kind === 'league') {
    t.fixtures = leagueFixtures(order);
    t.rounds = Math.max(...t.fixtures.map((f) => f.round)) + 1;
  } else {
    const size = cupBracketSize(teams.length);
    t.fixtures = cupFirstRound(order, size);
    t.rounds = Math.log2(size);
    advanceCup(t);
  }
  return t;
}

/**
 * Double round robin (circle method). With an odd number of teams one team
 * rests each matchday. The second half repeats the first with home and away
 * swapped.
 */
export function leagueFixtures(order: readonly number[]): Fixture[] {
  const slots: Array<number | null> = [...order];
  if (slots.length % 2 === 1) slots.push(null); // the resting team
  const n = slots.length;
  const firstHalf: Fixture[] = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = slots[i];
      const b = slots[n - 1 - i];
      if (a === null || b === null) continue;
      // Alternate who is at home so nobody plays only home or only away
      const swap = i === 0 ? r % 2 === 1 : (r + i) % 2 === 1;
      firstHalf.push({ round: r, home: swap ? b : a, away: swap ? a : b, score: null });
    }
    // Rotate every slot except the first
    slots.splice(1, 0, slots.pop()!);
  }
  const secondHalf = firstHalf.map((f) => ({ round: f.round + n - 1, home: f.away!, away: f.home, score: null }));
  return [...firstHalf, ...secondHalf];
}

/** Bracket size for a cup: 4 for up to 4 teams, otherwise 8. */
export function cupBracketSize(teams: number): number {
  return teams <= 4 ? 4 : 8;
}

/**
 * First cup round. Byes are spread so that, where possible, a team with a bye
 * meets the winner of a played match in the next round.
 */
export function cupFirstRound(order: readonly number[], size: number): Fixture[] {
  const pairs = size / 2;
  const byes = size - order.length;
  const byeSlots = (pairs === 2 ? [0, 1] : [0, 2, 1, 3]).slice(0, byes);
  const fixtures: Fixture[] = [];
  let next = 0;
  for (let p = 0; p < pairs; p++) {
    if (byeSlots.includes(p)) {
      fixtures.push({ round: 0, home: order[next++], away: null, score: null });
    } else {
      fixtures.push({ round: 0, home: order[next++], away: order[next++], score: null });
    }
  }
  return fixtures;
}

/** Winner of a played (or bye) cup fixture, or null if not decided yet. */
export function fixtureWinner(f: Fixture): number | null {
  if (f.away === null) return f.home;
  if (!f.score) return null;
  if (f.score[0] === f.score[1]) return null;
  return f.score[0] > f.score[1] ? f.home : f.away;
}

export function isDone(f: Fixture): boolean {
  return f.away === null || f.score !== null;
}

/** Cup: once a round is complete, draw the next one from its winners (in bracket order). */
function advanceCup(t: Tournament): void {
  for (;;) {
    const round = Math.max(...t.fixtures.map((f) => f.round));
    const current = t.fixtures.filter((f) => f.round === round);
    if (!current.every(isDone)) return;
    const winners = current.map((f) => fixtureWinner(f)!);
    if (winners.length === 1) {
      t.champion = winners[0];
      return;
    }
    for (let i = 0; i < winners.length; i += 2) {
      t.fixtures.push({ round: round + 1, home: winners[i], away: winners[i + 1], score: null });
    }
  }
}

/** Index of the next fixture to play, or -1 when the competition is over. */
export function nextFixtureIndex(t: Tournament): number {
  return t.fixtures.findIndex((f) => !isDone(f));
}

/**
 * Store a result. A cup result must have a winner (extra time and a golden
 * goal make sure of that). Returns false if the fixture was already played.
 */
export function recordResult(t: Tournament, index: number, score: [number, number], extraTime = false): boolean {
  const f = t.fixtures[index];
  if (!f || isDone(f)) return false;
  if (t.kind === 'cup' && score[0] === score[1]) throw new Error('A cup match needs a winner');
  f.score = [score[0], score[1]];
  if (extraTime) f.extraTime = true;
  if (t.kind === 'cup') advanceCup(t);
  else if (nextFixtureIndex(t) === -1) t.champion = standings(t)[0].team;
  return true;
}

export interface StandingRow {
  team: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

/** League table: points, then goal difference, then goals scored. */
export function standings(t: Tournament): StandingRow[] {
  const rows: StandingRow[] = t.teams.map((_, team) => ({
    team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
  }));
  for (const f of t.fixtures) {
    if (!f.score || f.away === null) continue;
    const [hs, as] = f.score;
    const home = rows[f.home];
    const away = rows[f.away];
    home.played++;
    away.played++;
    home.goalsFor += hs;
    home.goalsAgainst += as;
    away.goalsFor += as;
    away.goalsAgainst += hs;
    if (hs > as) {
      home.won++;
      away.lost++;
      home.points += 3;
    } else if (hs < as) {
      away.won++;
      home.lost++;
      away.points += 3;
    } else {
      home.drawn++;
      away.drawn++;
      home.points++;
      away.points++;
    }
  }
  return rows.sort((a, b) =>
    b.points - a.points
    || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
    || b.goalsFor - a.goalsFor
    || a.team - b.team);
}

// Goals per team in a simulated match (0, 1, 2, 3, 4)
const GOAL_WEIGHTS = [0.26, 0.34, 0.23, 0.12, 0.05];
// Extra time is a third of a match: fewer goals
const EXTRA_TIME_GOAL_WEIGHTS = [0.65, 0.28, 0.07];

function weighted(weights: readonly number[], rng: Rng): number {
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/**
 * Result of a skipped CPU-vs-CPU match. Teams have no ratings, so it is
 * random. With `mustHaveWinner` (cup) a draw goes to extra time and, if
 * still level, a golden goal for a random side.
 */
export function simulateResult(rng: Rng, mustHaveWinner: boolean): { score: [number, number]; extraTime: boolean } {
  const score: [number, number] = [weighted(GOAL_WEIGHTS, rng), weighted(GOAL_WEIGHTS, rng)];
  if (!mustHaveWinner || score[0] !== score[1]) return { score, extraTime: false };
  score[0] += weighted(EXTRA_TIME_GOAL_WEIGHTS, rng);
  score[1] += weighted(EXTRA_TIME_GOAL_WEIGHTS, rng);
  if (score[0] === score[1]) score[rng() < 0.5 ? 0 : 1]++;
  return { score, extraTime: true };
}

/** Cup round label key: how many rounds are left including this one (1 = final). */
export function roundsLeft(t: Tournament, round: number): number {
  return t.rounds - round;
}

/** Player number (1, 2, ...) of each human team in team order; 0 for CPU teams. */
export function humanNumbers(t: Tournament): number[] {
  let n = 0;
  return t.teams.map((team) => (team.human ? ++n : 0));
}

/**
 * Check data loaded from storage. Returns the tournament if it is
 * structurally valid and only uses known team ids, otherwise null.
 */
export function parseTournament(raw: unknown, knownTeamIds: readonly string[]): Tournament | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Partial<Tournament>;
  if (t.version !== 1 || (t.kind !== 'league' && t.kind !== 'cup')) return null;
  if (!Array.isArray(t.teams) || t.teams.length < MIN_TEAMS || t.teams.length > MAX_TEAMS) return null;
  const n = t.teams.length;
  if (!t.teams.every((x) => x && knownTeamIds.includes(x.id) && typeof x.human === 'boolean')) return null;
  if (new Set(t.teams.map((x) => x.id)).size !== n) return null;
  if (!Array.isArray(t.fixtures) || typeof t.rounds !== 'number') return null;
  const isTeam = (i: unknown) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < n;
  for (const f of t.fixtures) {
    if (!f || !Number.isInteger(f.round) || !isTeam(f.home)) return null;
    if (f.away !== null && !isTeam(f.away)) return null;
    if (f.score !== null && !(Array.isArray(f.score) && f.score.length === 2
      && f.score.every((g) => Number.isInteger(g) && g >= 0))) return null;
  }
  if (t.champion !== null && !isTeam(t.champion)) return null;
  return t as Tournament;
}
