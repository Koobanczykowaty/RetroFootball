// ============================================================
// RetroFootball — Main Entry Point
// ============================================================

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './core/config/GameplayConfig';
import { applyPageLanguage } from './game/config/i18n';
import { BootScene } from './game/scenes/BootScene';
import { MenuScene } from './game/scenes/MenuScene';
import { TeamSelectScene } from './game/scenes/TeamSelectScene';
import { MatchScene } from './game/scenes/MatchScene';
import { ControlsScene } from './game/scenes/ControlsScene';
import { SettingsScene } from './game/scenes/SettingsScene';
import { KitEditorScene } from './game/scenes/KitEditorScene';
import { TournamentSetupScene } from './game/scenes/TournamentSetupScene';
import { TournamentScene } from './game/scenes/TournamentScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#1a1a2e',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    // We compute the zoom ourselves to prefer integer scaling (see applyScale)
    mode: Phaser.Scale.NONE,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    fullscreenTarget: 'game-container',
  },
  scene: [
    BootScene, MenuScene, TeamSelectScene, MatchScene, ControlsScene, SettingsScene, KitEditorScene,
    TournamentSetupScene, TournamentScene,
  ],
  // The ?sim test mode runs in headless browsers where requestAnimationFrame may not tick
  fps: {
    target: 60,
    forceSetTimeOut: ['sim', 'uitest'].some((p) => new URLSearchParams(window.location.search).has(p)),
  },
  input: {
    keyboard: true,
    mouse: true,
    touch: false,
  },
  disableContextMenu: true,
};

applyPageLanguage();
const game = new Phaser.Game(config);

/**
 * Pixel-perfect scaling: use the largest integer zoom that fits when it fills
 * at least 85% of the available space; otherwise fall back to fractional
 * fit (still nearest-neighbour thanks to image-rendering: pixelated).
 * Aspect ratio is always preserved.
 */
function applyScale(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const fit = Math.min(w / GAME_WIDTH, h / GAME_HEIGHT);
  const integer = Math.floor(fit);
  const zoom = integer >= 1 && integer / fit >= 0.85 ? integer : fit;
  game.scale.setZoom(Math.max(0.25, zoom));
}

let pending = 0;
function scheduleScale(): void {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(applyScale);
}

window.addEventListener('resize', scheduleScale);
document.addEventListener('fullscreenchange', scheduleScale);
game.events.once(Phaser.Core.Events.READY, applyScale);

export default game;
