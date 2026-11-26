// ============================================================
// BootScene — Generates all procedural assets, then opens the menu
// (or starts an AI-vs-AI simulation when the URL has ?sim=N).
// ============================================================

import Phaser from 'phaser';
import { AssetGenerator } from '../assets/AssetGenerator';
import { loadPixelFont } from '../assets/PixelFont';
import { DIFFICULTIES, Difficulty, GAME_SPEEDS, GameSpeed } from '../config/GameplayConfig';
import { ASSIST_MODES, AssistMode, settings } from '../config/Settings';
import { initSimGlobal } from '../debug/SimReport';
import { runUiFlowTest } from '../debug/UiFlowTest';
import type { MatchSceneData } from './MatchScene';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    // Texts may only be created once the pixel font is ready
    void loadPixelFont().then(() => this.start());
  }

  private start(): void {
    AssetGenerator.generateAll(this);

    const params = new URLSearchParams(window.location.search);

    // Automated menu walk-through (crash test), see debug/UiFlowTest
    if (params.has('uitest')) {
      initSimGlobal(0);
      runUiFlowTest(this.game);
      return;
    }
    const sim = params.get('sim');
    if (sim !== null) {
      const matches = Math.max(1, Number.parseInt(sim, 10) || 1);
      const minutes = Number.parseFloat(params.get('minutes') ?? '') || 1;
      initSimGlobal(matches);
      // Optional &difficulty=easy|normal|hard (not saved)
      const diff = params.get('difficulty') as Difficulty | null;
      if (diff && DIFFICULTIES.includes(diff)) settings.difficulty = diff;
      // Optional &speed=slow|normal|fast, &passes=auto|manual, &lob=auto|manual (not saved)
      const speed = params.get('speed') as GameSpeed | null;
      if (speed && GAME_SPEEDS.includes(speed)) settings.gameSpeed = speed;
      const passes = params.get('passes') as AssistMode | null;
      if (passes && ASSIST_MODES.includes(passes)) settings.passAssist = passes;
      const lob = params.get('lob') as AssistMode | null;
      if (lob && ASSIST_MODES.includes(lob)) settings.lobAssist = lob;
      const data: MatchSceneData = {
        sim: true,
        simMatches: matches,
        simIndex: 0,
        simMinutes: minutes,
        simHuman: params.get('human') === '1',
        simTwoPlayer: params.get('p2') === '1',
        simCoop: params.get('coop') === '1',
        simCup: params.get('cup') === '1',
      };
      this.scene.start('MatchScene', data);
      return;
    }

    // Dev shortcut: ?scene=TeamSelectScene opens a screen directly
    const direct = params.get('scene');
    if (direct && direct !== 'BootScene' && this.scene.get(direct)) {
      // Optional &mode=2p|coop for the setup / match screens
      const mode = params.get('mode');
      this.scene.start(direct, { mode: mode === '2p' || mode === 'coop' ? mode : '1p' });
      return;
    }

    this.scene.start('MenuScene');
  }
}
