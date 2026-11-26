// ============================================================
// PlayerView — Draws one core Player: sprite position and depth,
// animation frame from his pose and speed, and the selection marker
// of the human steering him.
// ============================================================

import Phaser from 'phaser';
import type { MarkerId } from '../assets/AssetGenerator';
import { PLAYER } from '../../core/config/GameplayConfig';
import type { Player } from '../../core/entities/Player';

/** Spritesheet frame indices (see AssetGenerator). */
export const PLAYER_FRAME = {
  idle: 0,
  run1: 1,
  run2: 2,
  kick: 3,
  dive: 4,
  celebrate: 5,
  idle2: 6,
} as const;

export class PlayerView {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private marker: Phaser.GameObjects.Image | null = null;
  private arrow: Phaser.GameObjects.Image | null = null;
  private markerId: MarkerId | null = null;
  private animTimer = 0;
  private runFrame: number = PLAYER_FRAME.run1;
  private idleTimer = Math.random() * 450; // players don't all idle in step
  private idleFrame: number = PLAYER_FRAME.idle;
  private celebrateTime = 0;
  private lastPose = 'none';
  private offsetY = 0;

  constructor(private readonly scene: Phaser.Scene, readonly player: Player) {
    const textureKey = player.role === 'goalkeeper' ? `player_gk${player.teamIndex}` : `player_team${player.teamIndex}`;
    this.sprite = scene.add.sprite(player.x, player.y, textureKey, PLAYER_FRAME.idle);
    this.update(0);
  }

  /** Show the marker of the human steering this player (null = none). */
  setMarker(id: MarkerId | null): void {
    if (id === this.markerId) return;
    this.marker?.destroy();
    this.arrow?.destroy();
    this.marker = null;
    this.arrow = null;
    this.markerId = id;
    if (id) {
      this.marker = this.scene.add.image(0, 0, `selection_circle_${id}`).setDepth(4);
      this.arrow = this.scene.add.image(0, 0, `direction_indicator_${id}`).setDepth(4);
    }
    this.sync();
  }

  /** @param ms game time since the last frame (0 while paused) */
  update(ms: number): void {
    this.animate(ms);
    this.sync();
  }

  private animate(ms: number): void {
    const p = this.player;
    const speed = p.getSpeed();
    let frame: number;
    let offsetY = 0;
    let flipY = false;
    if (p.pose === 'celebrate' && this.lastPose !== 'celebrate') this.celebrateTime = 0;
    this.lastPose = p.pose;

    switch (p.pose) {
      case 'celebrate':
        this.celebrateTime += ms;
        frame = PLAYER_FRAME.celebrate;
        offsetY = -Math.abs(Math.sin(this.celebrateTime / 120)) * 4;
        break;
      case 'header':
        // Jump with arms up (the celebrate frame), highest in the middle
        frame = PLAYER_FRAME.celebrate;
        offsetY = -Math.round(Math.sin(Math.min(1, p.poseTimer / 300) * Math.PI) * 5);
        break;
      case 'dive':
        frame = PLAYER_FRAME.dive;
        flipY = p.diveDir > 0;
        break;
      case 'kick':
      case 'tackle':
        frame = PLAYER_FRAME.kick;
        break;
      default:
        if (speed > 20) {
          this.animTimer += ms;
          const frameTime = 150 * (PLAYER.walkSpeed / Math.max(speed, 60));
          if (this.animTimer > frameTime) {
            this.animTimer = 0;
            this.runFrame = this.runFrame === PLAYER_FRAME.run1 ? PLAYER_FRAME.run2 : PLAYER_FRAME.run1;
          }
          frame = this.runFrame;
        } else {
          this.idleTimer += ms;
          if (this.idleTimer > 450) {
            this.idleTimer = 0;
            this.idleFrame = this.idleFrame === PLAYER_FRAME.idle ? PLAYER_FRAME.idle2 : PLAYER_FRAME.idle;
          }
          frame = this.idleFrame;
        }
    }

    this.sprite.setFrame(frame);
    this.sprite.setFlipX(p.facingX < 0);
    this.sprite.setFlipY(flipY);
    this.offsetY = offsetY;
  }

  private sync(): void {
    const p = this.player;
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    this.sprite.setPosition(x, y + this.offsetY);
    this.sprite.setDepth(5 + y * 0.001);
    this.marker?.setPosition(x, y + 9);
    if (this.arrow) {
      this.arrow.setPosition(x + p.facingX * 17, y + 4 + p.facingY * 13);
      this.arrow.setRotation(Math.atan2(p.facingY, p.facingX));
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.marker?.destroy();
    this.arrow?.destroy();
  }
}
