import { describe, expect, it } from 'vitest';
import { AI_PROFILES, ROLE_TRAITS, TEAMMATE_PROFILE } from '../src/core/config/GameplayConfig';

describe('AI profiles', () => {
  it('hard and the human\'s teammates read every feint', () => {
    for (const p of [AI_PROFILES.hard, TEAMMATE_PROFILE]) {
      expect(p.feintReactionMs).toBe(0);
      expect(p.feintBite).toBe(0);
    }
  });

  it('easy falls for feints more than normal', () => {
    expect(AI_PROFILES.easy.feintBite).toBeGreaterThan(AI_PROFILES.normal.feintBite);
    expect(AI_PROFILES.easy.feintReactionMs).toBeGreaterThan(AI_PROFILES.normal.feintReactionMs);
    expect(AI_PROFILES.normal.feintBite).toBeGreaterThan(0);
  });

  it('keepers get stronger with difficulty', () => {
    expect(AI_PROFILES.easy.gkSaveChance).toBeLessThan(AI_PROFILES.normal.gkSaveChance);
    expect(AI_PROFILES.normal.gkSaveChance).toBeLessThan(AI_PROFILES.hard.gkSaveChance);
  });
});

describe('role traits', () => {
  it('forwards are faster, tire and recover sooner, finish better; defenders tackle better', () => {
    const f = ROLE_TRAITS.forward;
    const d = ROLE_TRAITS.defender;
    expect(f.speed).toBeGreaterThan(d.speed);
    expect(f.staminaDrain).toBeGreaterThan(d.staminaDrain);
    expect(f.staminaRegen).toBeGreaterThan(d.staminaRegen);
    expect(f.shotAccuracy).toBeGreaterThan(d.shotAccuracy);
    expect(d.tackleSuccess).toBeGreaterThan(f.tackleSuccess);
  });

  it('differences stay subtle', () => {
    for (const t of Object.values(ROLE_TRAITS)) {
      expect(Math.abs(t.speed - 1)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(t.shotSpeed - 1)).toBeLessThanOrEqual(0.1);
      expect(t.shotAccuracy).toBeLessThanOrEqual(0.15);
      expect(t.tackleSuccess).toBeLessThanOrEqual(0.15);
    }
  });
});
