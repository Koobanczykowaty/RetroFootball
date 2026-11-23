// ============================================================
// Teams — The playable teams with the user's own kit colours
// applied (kit editor), and the two teams of the current match.
// Pure module (no Phaser): unit-testable.
// ============================================================

import { TEAMS, TeamConfig } from './GameplayConfig';

/** Kit colours the user can change in the kit editor. */
export const KIT_FIELDS = ['primaryColor', 'secondaryColor', 'shortsColor', 'sockColor', 'goalkeeperColor'] as const;
export type KitField = (typeof KIT_FIELDS)[number];
export type KitOverrides = Partial<Record<KitField, number>>;

/** Relative luminance 0..1 of a 0xRRGGBB colour (sRGB approximation). */
export function luminance(c: number): number {
  const r = ((c >> 16) & 0xff) / 255;
  const g = ((c >> 8) & 0xff) / 255;
  const b = (c & 0xff) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Mix a colour toward white by `k` (0..1). */
export function lighten(c: number, k: number): number {
  const ch = (shift: number) => {
    const v = (c >> shift) & 0xff;
    return Math.round(v + (255 - v) * k);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * The team with the user's kit overrides applied. When anything was changed,
 * the UI colours are derived from the new kit: the shirt colour, or the
 * stripe when the shirt is too dark to show on the dark UI.
 */
export function applyKit(base: TeamConfig, kit: KitOverrides | undefined): TeamConfig {
  if (!kit || Object.keys(kit).length === 0) return base;
  const team: TeamConfig = { ...base, ...kit };
  const MIN_LUM = 0.18;
  let ui = team.primaryColor;
  if (luminance(ui) < MIN_LUM) ui = luminance(team.secondaryColor) >= MIN_LUM ? team.secondaryColor : 0x8899aa;
  team.uiColor = ui;
  team.textColor = lighten(ui, 0.35);
  return team;
}

/** Team by id from the roster (first team if the id is unknown). */
export function baseTeam(id: string): TeamConfig {
  return TEAMS.find((t) => t.id === id) ?? TEAMS[0];
}

/** Team by id with the given saved kits applied. */
export function teamWithKits(id: string, kits: Record<string, KitOverrides>): TeamConfig {
  return applyKit(baseTeam(id), kits[id]);
}

/** Next / previous roster team id, skipping `skip` (the other side's team). */
export function cycleTeam(id: string, delta: number, skip?: string): string {
  const n = TEAMS.length;
  let i = Math.max(0, TEAMS.findIndex((t) => t.id === id));
  for (let k = 0; k < n; k++) {
    i = (i + delta + n) % n;
    if (TEAMS[i].id !== skip) return TEAMS[i].id;
  }
  return id;
}

/**
 * The two teams of the current match, by side (0 = left in the first half).
 * Set by MatchScene before anything reads it.
 */
let active: [TeamConfig, TeamConfig] = [TEAMS[0], TEAMS[1]];

export function setMatchTeams(teams: [TeamConfig, TeamConfig]): void {
  active = teams;
}

export function matchTeam(side: number): TeamConfig {
  return active[side];
}
