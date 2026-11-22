// ============================================================
// Settings — User preferences shared by all scenes.
// Persisted to localStorage when available (falls back to memory).
// ============================================================

import { AUDIO, Difficulty, DIFFICULTIES, FORMATION_IDS, FormationId, MATCH } from './GameplayConfig';

export interface GameSettings {
  soundEnabled: boolean;
  /** 0..1 */
  volume: number;
  /** Real-time match length in minutes. */
  matchMinutes: number;
  difficulty: Difficulty;
  /** Index of the team the human controls in Quick Match. */
  playerTeam: number;
  /** The human team's formation. */
  formation: FormationId;
}

const STORAGE_KEY = 'retrofootball.settings.v1';

const DEFAULTS: GameSettings = {
  soundEnabled: true,
  volume: AUDIO.defaultVolume,
  matchMinutes: MATCH.defaultDuration,
  difficulty: 'normal',
  playerTeam: 0,
  formation: '2-3',
};

function load(): GameSettings {
  const s = { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return s;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    if (typeof parsed.soundEnabled === 'boolean') s.soundEnabled = parsed.soundEnabled;
    if (typeof parsed.volume === 'number') s.volume = Math.max(0, Math.min(1, parsed.volume));
    if (typeof parsed.matchMinutes === 'number' && MATCH.durationOptions.includes(parsed.matchMinutes)) {
      s.matchMinutes = parsed.matchMinutes;
    }
    if (parsed.difficulty && DIFFICULTIES.includes(parsed.difficulty)) s.difficulty = parsed.difficulty;
    if (parsed.playerTeam === 0 || parsed.playerTeam === 1) s.playerTeam = parsed.playerTeam;
    if (parsed.formation && FORMATION_IDS.includes(parsed.formation)) s.formation = parsed.formation;
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
