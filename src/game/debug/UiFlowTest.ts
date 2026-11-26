// ============================================================
// UiFlowTest — Automated walk through the menus (URL: ?uitest=1),
// used by scripts/sim-test.mjs to catch crashes when switching
// screens (e.g. leftover listeners from a previous visit).
// Runtime errors are collected by initSimGlobal / writeSimResult.
// ============================================================

import Phaser from 'phaser';
import { saveTournament } from '../config/TournamentStore';
import { createTournament, nextFixtureIndex } from '../logic/Tournament';
import { writeSimResult } from './SimReport';

/** Menu → 2 PLAYERS → back → PLAY → back → 2 PLAYERS → match → menu → PLAY → match → controls, settings, kits → co-op setup → co-op match. */
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
  ['KitEditorScene', { team: 'zubry' }],
  ['TeamSelectScene', { mode: '1p' }],
  ['KitEditorScene'],
  ['TeamSelectScene', { mode: 'coop' }],
  ['MatchScene', { mode: 'coop', playerTeam: 0 }],
  ['MenuScene'],
  ['TournamentSetupScene'],
  ['TournamentScene'],
  ['MatchScene', { tournament: 'next' }],
  ['TournamentScene'],
  ['MenuScene'],
];

const STEP_MS = 400;

export function runUiFlowTest(game: Phaser.Game): void {
  const g = window.__RF_SIM__;
  if (!g) return;
  // A saved cup with every kind of player for the tournament screens
  // (replaces any saved tournament in this browser profile)
  const tour = createTournament('cup', [
    { id: 'orly', human: true }, { id: 'bociany', human: false }, { id: 'zubry', human: true },
    { id: 'rysie', human: false }, { id: 'smoki', human: false },
  ]);
  saveTournament(tour);
  let i = 0;
  const next = () => {
    if (i >= STEPS.length) {
      g.done = true;
      g.uiSteps = i;
      writeSimResult();
      return;
    }
    let [key, data] = STEPS[i++];
    if (data && (data as { tournament?: string }).tournament === 'next') {
      // The saved cup's next match, played by its human side(s)
      const index = nextFixtureIndex(tour);
      const f = tour.fixtures[index];
      const humanSides = [f.home, f.away!].map((x, side) => (tour.teams[x].human ? side : -1)).filter((s) => s >= 0);
      data = {
        tournament: {
          fixture: index, home: tour.teams[f.home].id, away: tour.teams[f.away!].id, humanSides, cup: true,
        },
      };
    }
    // Switch from whatever scene is running now (like pressing a menu button)
    const current = game.scene.getScenes(true)[0];
    current?.scene.start(key, data);
    setTimeout(next, STEP_MS);
  };
  setTimeout(next, STEP_MS);
}
