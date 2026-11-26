// ============================================================
// TournamentStore — Saves the running tournament (one at a time)
// and the trophy count in localStorage. Every access is wrapped in
// try/catch: without storage the game simply doesn't remember.
// ============================================================

import { parseTournament, Tournament, TournamentKind } from '../logic/Tournament';
import { TEAMS } from './GameplayConfig';

const TOURNAMENT_KEY = 'retrofootball.tournament.v1';
const TROPHIES_KEY = 'retrofootball.trophies.v1';

export type Trophies = Record<TournamentKind, number>;

export function loadTournament(): Tournament | null {
  try {
    const raw = window.localStorage.getItem(TOURNAMENT_KEY);
    if (!raw) return null;
    return parseTournament(JSON.parse(raw), TEAMS.map((t) => t.id));
  } catch {
    return null;
  }
}

export function saveTournament(t: Tournament): void {
  try {
    window.localStorage.setItem(TOURNAMENT_KEY, JSON.stringify(t));
  } catch {
    // Ignore — progress simply won't persist.
  }
}

/** A saved tournament that is not finished yet (menu: CONTINUE). */
export function hasTournamentInProgress(): boolean {
  const t = loadTournament();
  return t !== null && t.champion === null;
}

export function loadTrophies(): Trophies {
  const trophies: Trophies = { league: 0, cup: 0 };
  try {
    const raw = JSON.parse(window.localStorage.getItem(TROPHIES_KEY) ?? '{}') as Partial<Trophies>;
    for (const k of ['league', 'cup'] as const) {
      const v = raw[k];
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0) trophies[k] = v;
    }
  } catch {
    // Corrupt or unavailable: start from zero.
  }
  return trophies;
}

export function addTrophy(kind: TournamentKind): void {
  const trophies = loadTrophies();
  trophies[kind]++;
  try {
    window.localStorage.setItem(TROPHIES_KEY, JSON.stringify(trophies));
  } catch {
    // Ignore.
  }
}

/**
 * Record a result, save, and count a trophy if that finished the competition
 * with a human team on top. Returns false if the fixture was already played.
 */
export function recordAndSave(
  t: Tournament,
  record: (t: Tournament) => boolean,
): boolean {
  const wasOver = t.champion !== null;
  if (!record(t)) return false;
  if (!wasOver && t.champion !== null && t.teams[t.champion].human) addTrophy(t.kind);
  saveTournament(t);
  return true;
}
