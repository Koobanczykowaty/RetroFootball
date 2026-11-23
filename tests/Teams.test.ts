import { describe, expect, it } from 'vitest';
import { KIT_PALETTE, TEAMS } from '../src/game/config/GameplayConfig';
import { applyKit, baseTeam, cycleTeam, lighten, luminance, teamWithKits } from '../src/game/config/Teams';

describe('team roster', () => {
  it('has unique ids, names and short names', () => {
    for (const key of ['id', 'name', 'shortName'] as const) {
      expect(new Set(TEAMS.map((t) => t[key])).size).toBe(TEAMS.length);
    }
    expect(TEAMS.length).toBeGreaterThanOrEqual(6);
  });

  it('every team colour for the UI shows on the dark background', () => {
    for (const t of TEAMS) expect(luminance(t.uiColor)).toBeGreaterThan(0.15);
  });

  it('palette colours are distinct', () => {
    expect(new Set(KIT_PALETTE.map((c) => c.color)).size).toBe(KIT_PALETTE.length);
  });
});

describe('kits', () => {
  it('no overrides = the team as defined', () => {
    const t = TEAMS[0];
    expect(applyKit(t, undefined)).toBe(t);
    expect(applyKit(t, {})).toBe(t);
  });

  it('applies overrides and derives readable UI colours', () => {
    const t = applyKit(TEAMS[0], { primaryColor: 0x3a8ae0 });
    expect(t.primaryColor).toBe(0x3a8ae0);
    expect(t.uiColor).toBe(0x3a8ae0);
    expect(luminance(t.textColor)).toBeGreaterThan(luminance(t.uiColor));
    expect(TEAMS[0].primaryColor).toBe(0xdd2222); // the roster is not modified
  });

  it('a dark shirt uses the stripe as UI colour', () => {
    const t = applyKit(TEAMS[0], { primaryColor: 0x1c1c22, secondaryColor: 0xe0b020 });
    expect(t.uiColor).toBe(0xe0b020);
  });

  it('teamWithKits picks the saved kit of that team only', () => {
    const kits = { smoki: { sockColor: 0xffffff } };
    expect(teamWithKits('smoki', kits).sockColor).toBe(0xffffff);
    expect(teamWithKits('orly', kits).sockColor).toBe(baseTeam('orly').sockColor);
  });
});

describe('cycleTeam', () => {
  it('cycles through the roster and wraps', () => {
    const last = TEAMS[TEAMS.length - 1].id;
    expect(cycleTeam(TEAMS[0].id, -1)).toBe(last);
    expect(cycleTeam(last, 1)).toBe(TEAMS[0].id);
  });

  it('skips the team picked on the other side', () => {
    expect(cycleTeam(TEAMS[0].id, 1, TEAMS[1].id)).toBe(TEAMS[2].id);
  });
});

describe('colour helpers', () => {
  it('luminance and lighten', () => {
    expect(luminance(0x000000)).toBe(0);
    expect(luminance(0xffffff)).toBeCloseTo(1, 5);
    expect(lighten(0x000000, 1)).toBe(0xffffff);
    expect(lighten(0x204060, 0)).toBe(0x204060);
  });
});
