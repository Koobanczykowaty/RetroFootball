// ============================================================
// RetroFootball — Main Entry Point
// ============================================================

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './game/config/GameplayConfig';
import { BootScene } from './game/scenes/BootScene';
import { MenuScene } from './game/scenes/MenuScene';
import { TeamSelectScene } from './game/scenes/TeamSelectScene';
import { MatchScene } from './game/scenes/MatchScene';
import { ControlsScene } from './game/scenes/ControlsScene';
import { SettingsScene } from './game/scenes/SettingsScene';

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
  scene: [BootScene, MenuScene, TeamSelectScene, MatchScene, ControlsScene, SettingsScene],
  // The ?sim test mode runs in headless browsers where requestAnimationFrame may not tick
  fps: { target: 60, forceSetTimeOut: new URLSearchParams(window.location.search).has('sim') },
  input: {
    keyboard: true,
    mouse: true,
    touch: false,
  },
  disableContextMenu: true,
};

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
