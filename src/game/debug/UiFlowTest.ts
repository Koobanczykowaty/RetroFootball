// ============================================================
// UiFlowTest — Automated walk through the menus (URL: ?uitest=1),
// used by scripts/sim-test.mjs to catch crashes when switching
// screens (e.g. leftover listeners from a previous visit).
// Runtime errors are collected by initSimGlobal / writeSimResult.
// ============================================================

import Phaser from 'phaser';
import { writeSimResult } from './SimReport';

/** Menu → 2 PLAYERS → back → PLAY → back → 2 PLAYERS → match → menu → PLAY → match. */
const STEPS: Array<[string, object?]> = [
  ['MenuScene'],
  ['TeamSelectScene', { mode: '2p' }],
  ['MenuScene'],
  ['TeamSelectScene', { mode: '1p' }],
  ['MenuScene'],
  ['TeamSelectScene', { mode: '2p' }],
  ['MatchScene', { mode: '2p', playerTeam: 0 }],
  ['MenuScene'],
  ['TeamSelectScene', { mode: '1p' }],
  ['MatchScene', { mode: '1p', playerTeam: 1 }],
  ['ControlsScene'],
  ['SettingsScene'],
  ['MenuScene'],
];

const STEP_MS = 400;

export function runUiFlowTest(game: Phaser.Game): void {
  const g = window.__RF_SIM__;
  if (!g) return;
  let i = 0;
  const next = () => {
    if (i >= STEPS.length) {
      g.done = true;
      g.uiSteps = i;
      writeSimResult();
      return;
    }
    const [key, data] = STEPS[i++];
    // Switch from whatever scene is running now (like pressing a menu button)
    const current = game.scene.getScenes(true)[0];
    current?.scene.start(key, data);
    setTimeout(next, STEP_MS);
  };
  setTimeout(next, STEP_MS);
}
