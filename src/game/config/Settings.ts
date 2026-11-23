// ============================================================
// Settings — User preferences shared by all scenes.
// Persisted to localStorage when available (falls back to memory).
// ============================================================

import { AUDIO, Difficulty, DIFFICULTIES, FORMATION_IDS, FormationId, MATCH, TEAMS } from './GameplayConfig';
import { KIT_FIELDS, KitOverrides } from './Teams';

export type Language = 'pl' | 'en';
export const LANGUAGES: Language[] = ['pl', 'en'];

/** Polish when the browser prefers Polish, English otherwise. */
export function browserLanguage(): Language {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    return langs[0]?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
  } catch {
    return 'en';
  }
}

export interface GameSettings {
  soundEnabled: boolean;
  /** Chiptune music in menus and (quietly) in matches. */
  musicEnabled: boolean;
  /** 0..1 */
  volume: number;
  /** Real-time match length in minutes. */
  matchMinutes: number;
  difficulty: Difficulty;
  /** Team of player 1 (left card, side 0) and of the opponent / player 2 (side 1). */
  teamP1: string;
  teamP2: string;
  /** The user's kit colours per team id (kit editor). */
  kits: Record<string, KitOverrides>;
  /** The human team's formation (player 1 / keyboard in 2-player mode). */
  formation: FormationId;
  /** Player 2's (controller) formation in 2-player mode. */
  formationP2: FormationId;
  /** UI language. */
  language: Language;
}

const STORAGE_KEY = 'retrofootball.settings.v1';

const DEFAULTS: GameSettings = {
  soundEnabled: true,
  musicEnabled: true,
  volume: AUDIO.defaultVolume,
  matchMinutes: MATCH.defaultDuration,
  difficulty: 'normal',
  teamP1: 'orly',
  teamP2: 'bociany',
  kits: {},
  formation: '2-3',
  formationP2: '2-3',
  language: 'en',
};

/** Saved kit colours: only known teams and fields with valid colour numbers. */
function loadKits(raw: unknown): Record<string, KitOverrides> {
  const kits: Record<string, KitOverrides> = {};
  if (!raw || typeof raw !== 'object') return kits;
  for (const team of TEAMS) {
    const k = (raw as Record<string, unknown>)[team.id];
    if (!k || typeof k !== 'object') continue;
    const clean: KitOverrides = {};
    for (const field of KIT_FIELDS) {
      const v = (k as Record<string, unknown>)[field];
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff) clean[field] = v;
    }
    if (Object.keys(clean).length > 0) kits[team.id] = clean;
  }
  return kits;
}

function load(): GameSettings {
  const s: GameSettings = { ...DEFAULTS, language: browserLanguage(), kits: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return s;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    if (typeof parsed.soundEnabled === 'boolean') s.soundEnabled = parsed.soundEnabled;
    if (typeof parsed.musicEnabled === 'boolean') s.musicEnabled = parsed.musicEnabled;
    if (typeof parsed.volume === 'number') s.volume = Math.max(0, Math.min(1, parsed.volume));
    if (typeof parsed.matchMinutes === 'number' && MATCH.durationOptions.includes(parsed.matchMinutes)) {
      s.matchMinutes = parsed.matchMinutes;
    }
    if (parsed.difficulty && DIFFICULTIES.includes(parsed.difficulty)) s.difficulty = parsed.difficulty;
    const isTeam = (id: unknown): id is string => typeof id === 'string' && TEAMS.some((t) => t.id === id);
    if (isTeam(parsed.teamP1)) s.teamP1 = parsed.teamP1;
    if (isTeam(parsed.teamP2) && parsed.teamP2 !== s.teamP1) s.teamP2 = parsed.teamP2;
    if (s.teamP2 === s.teamP1) s.teamP2 = TEAMS.find((t) => t.id !== s.teamP1)!.id;
    s.kits = loadKits(parsed.kits);
    if (parsed.formation && FORMATION_IDS.includes(parsed.formation)) s.formation = parsed.formation;
    if (parsed.formationP2 && FORMATION_IDS.includes(parsed.formationP2)) s.formationP2 = parsed.formationP2;
    if (parsed.language && LANGUAGES.includes(parsed.language)) s.language = parsed.language;
  } catch {
    // Storage unavailable or corrupt — use defaults.
  }
  return s;
}

export const settings: GameSettings = load();

export function saveSettings(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore — settings simply won't persist.
  }
}
