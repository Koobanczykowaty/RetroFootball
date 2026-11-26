import { describe, expect, it } from 'vitest';
import {
  createTournament, cupFirstRound, fixtureWinner, humanNumbers, leagueFixtures, nextFixtureIndex, parseTournament,
  recordResult, simulateResult, standings, Tournament, TournamentTeam,
} from '../src/core/logic/Tournament';

/** Deterministic pseudo-random numbers for repeatable tests. */
function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const IDS = ['a', 'b', 'c', 'd', 'e', 'f'];
const teams = (n: number, humans = 1): TournamentTeam[] =>
  IDS.slice(0, n).map((id, i) => ({ id, human: i < humans }));

/** Play every remaining fixture with a simulated result. */
function playAll(t: Tournament, rng = seeded(7)): void {
  for (let guard = 0; guard < 100; guard++) {
    const i = nextFixtureIndex(t);
    if (i < 0) return;
    const r = simulateResult(rng, t.kind === 'cup');
    recordResult(t, i, r.score, r.extraTime);
  }
  throw new Error('tournament did not finish');
}

describe('league', () => {
  for (let n = 3; n <= 6; n++) {
    it(`${n} teams: everyone meets everyone twice, once at home`, () => {
      const fixtures = leagueFixtures([...Array(n).keys()]);
      expect(fixtures.length).toBe(n * (n - 1));
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
          if (a === b) continue;
          expect(fixtures.filter((f) => f.home === a && f.away === b).length).toBe(1);
        }
      }
      // Nobody plays twice on one matchday
      const rounds = new Set(fixtures.map((f) => f.round));
      for (const r of rounds) {
        const playing = fixtures.filter((f) => f.round === r).flatMap((f) => [f.home, f.away]);
        expect(new Set(playing).size).toBe(playing.length);
      }
      // The return matches come after all first matches
      const firstHalfEnd = Math.max(...fixtures.slice(0, fixtures.length / 2).map((f) => f.round));
      expect(Math.min(...fixtures.slice(fixtures.length / 2).map((f) => f.round))).toBeGreaterThan(firstHalfEnd);
    });
  }

  it('awards 3 points for a win and 1 for a draw, sorted by points then goal difference', () => {
    const t = createTournament('league', teams(3), seeded(3));
    const order = t.fixtures.map((f, i) => ({ f, i }));
    // Team results: every home team wins 2-0 except one draw
    order.forEach(({ i }, k) => recordResult(t, i, k === 0 ? [1, 1] : [2, 0]));
    const table = standings(t);
    expect(table.reduce((s, r) => s + r.played, 0)).toBe(t.fixtures.length * 2);
    for (let k = 1; k < table.length; k++) {
      const a = table[k - 1];
      const b = table[k];
      expect(a.points > b.points || (a.points === b.points
        && a.goalsFor - a.goalsAgainst >= b.goalsFor - b.goalsAgainst)).toBe(true);
    }
    expect(table.reduce((s, r) => s + r.points, 0)).toBe((t.fixtures.length - 1) * 3 + 2);
    expect(t.champion).toBe(table[0].team);
  });

  it('has no champion until the last match is played', () => {
    const t = createTournament('league', teams(4), seeded(5));
    const last = t.fixtures.length - 1;
    for (let i = 0; i < last; i++) recordResult(t, i, [1, 0]);
    expect(t.champion).toBeNull();
    recordResult(t, last, [0, 0]);
    expect(t.champion).not.toBeNull();
    expect(nextFixtureIndex(t)).toBe(-1);
  });
});

describe('cup', () => {
  it('gives byes so that 3, 5 and 6 teams fill a 4 or 8 bracket', () => {
    expect(cupFirstRound([0, 1, 2], 4).filter((f) => f.away === null).length).toBe(1);
    expect(cupFirstRound([0, 1, 2, 3, 4], 8).filter((f) => f.away === null).length).toBe(3);
    const six = cupFirstRound([0, 1, 2, 3, 4, 5], 8);
    expect(six.filter((f) => f.away === null).length).toBe(2);
    // With 6 teams each bye team meets the winner of a played match next
    expect(six[0].away === null).not.toBe(six[1].away === null);
    expect(six[2].away === null).not.toBe(six[3].away === null);
  });

  for (let n = 3; n <= 6; n++) {
    it(`${n} teams: plays through to one champion`, () => {
      const t = createTournament('cup', teams(n), seeded(n));
      playAll(t);
      expect(t.champion).not.toBeNull();
      const final = t.fixtures[t.fixtures.length - 1];
      expect(final.round).toBe(t.rounds - 1);
      expect(fixtureWinner(final)).toBe(t.champion);
      // Every team except the champion lost exactly once
      const losers = t.fixtures.filter((f) => f.away !== null).map((f) => (fixtureWinner(f) === f.home ? f.away : f.home));
      expect(new Set(losers).size).toBe(n - 1);
      expect(losers).not.toContain(t.champion);
    });
  }

  it('refuses a draw and a result for an already played match', () => {
    const t = createTournament('cup', teams(4), seeded(2));
    const i = nextFixtureIndex(t);
    expect(() => recordResult(t, i, [1, 1])).toThrow();
    expect(recordResult(t, i, [2, 1])).toBe(true);
    expect(recordResult(t, i, [3, 0])).toBe(false);
  });
});

describe('simulated results', () => {
  it('always has a winner in the cup, marked as extra time when it was level', () => {
    const rng = seeded(11);
    let extra = 0;
    for (let k = 0; k < 500; k++) {
      const r = simulateResult(rng, true);
      expect(r.score[0]).not.toBe(r.score[1]);
      if (r.extraTime) extra++;
    }
    expect(extra).toBeGreaterThan(0);
  });

  it('allows draws in the league', () => {
    const rng = seeded(12);
    const results = Array.from({ length: 300 }, () => simulateResult(rng, false));
    expect(results.some((r) => r.score[0] === r.score[1])).toBe(true);
    expect(results.every((r) => !r.extraTime)).toBe(true);
  });
});

describe('save data', () => {
  it('round-trips through JSON and rejects broken or unknown data', () => {
    const t = createTournament('cup', teams(5, 2), seeded(4));
    recordResult(t, nextFixtureIndex(t), [3, 2]);
    const copy = parseTournament(JSON.parse(JSON.stringify(t)), IDS);
    expect(copy).toEqual(t);
    expect(parseTournament({ ...t, version: 2 }, IDS)).toBeNull();
    expect(parseTournament({ ...t, teams: [{ id: 'zzz', human: true }, ...t.teams.slice(1)] }, IDS)).toBeNull();
    expect(parseTournament({ ...t, fixtures: [{ round: 0, home: 9, away: 0, score: null }] }, IDS)).toBeNull();
    expect(parseTournament('nonsense', IDS)).toBeNull();
  });

  it('numbers the human players in team order', () => {
    const t = createTournament('league', [
      { id: 'a', human: false }, { id: 'b', human: true }, { id: 'c', human: true },
    ], seeded(1));
    expect(humanNumbers(t)).toEqual([0, 1, 2]);
  });
});
