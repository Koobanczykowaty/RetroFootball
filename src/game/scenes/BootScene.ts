// ============================================================
// BootScene — Generates all procedural assets, then opens the menu
// (or starts an AI-vs-AI simulation when the URL has ?sim=N).
// ============================================================

import Phaser from 'phaser';
import { AssetGenerator } from '../assets/AssetGenerator';
import { DIFFICULTIES, Difficulty } from '../config/GameplayConfig';
import { settings } from '../config/Settings';
import { initSimGlobal } from '../debug/SimReport';
import type { MatchSceneData } from './MatchScene';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    AssetGenerator.generateAll(this);

    const params = new URLSearchParams(window.location.search);
    const sim = params.get('sim');
    if (sim !== null) {
      const matches = Math.max(1, Number.parseInt(sim, 10) || 1);
      const minutes = Number.parseFloat(params.get('minutes') ?? '') || 1;
      initSimGlobal(matches);
      // Optional &difficulty=easy|normal|hard (not saved)
      const diff = params.get('difficulty') as Difficulty | null;
      if (diff && DIFFICULTIES.includes(diff)) settings.difficulty = diff;
      const data: MatchSceneData = {
        sim: true,
        simMatches: matches,
        simIndex: 0,
        simMinutes: minutes,
        simHuman: params.get('human') === '1',
        simTwoPlayer: params.get('p2') === '1',
      };
      this.scene.start('MatchScene', data);
      return;
    }

    // Dev shortcut: ?scene=TeamSelectScene opens a screen directly
    const direct = params.get('scene');
    if (direct && direct !== 'BootScene' && this.scene.get(direct)) {
      // Optional &mode=2p for the setup / match screens
      this.scene.start(direct, { mode: params.get('mode') === '2p' ? '2p' : '1p' });
      return;
    }

    this.scene.start('MenuScene');
  }
}
