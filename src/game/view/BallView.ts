// ============================================================
// BallView — Draws the core Ball: sprite (lifted by its height),
// rolling animation, shadow and the power-shot trail.
// ============================================================

import Phaser from 'phaser';
import { BALL } from '../../core/config/GameplayConfig';
import type { Ball } from '../../core/entities/Ball';

const TRAIL_LENGTH = 7;

export class BallView {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly trail: Phaser.GameObjects.Graphics;
  private trailPoints: Array<{ x: number; y: number }> = [];
  private rollDistance = 0;

  /** @param texture 'ball', or 'ball_rag' on the housing-estate pitch */
  constructor(scene: Phaser.Scene, private readonly ball: Ball, texture = 'ball') {
    this.trail = scene.add.graphics().setDepth(9);
    this.shadow = scene.add.image(ball.x, ball.y + 3, 'ball_shadow').setDepth(3);
    this.sprite = scene.add.sprite(ball.x, ball.y, texture, 0).setDepth(6);
    this.update(0);
  }

  /** @param dt game time since the last frame (seconds; 0 while paused) */
  update(dt: number): void {
    const b = this.ball;
    const free = b.ownerId === null;
    const speed = free ? b.getSpeed() : 0;
    if (free) this.rollDistance += speed * dt;
    const x = Math.round(b.x);
    const y = Math.round(b.y);

    this.sprite.setPosition(x, Math.round(b.y - b.z));
    // Low ball is y-sorted with players; high ball is drawn above them
    this.sprite.setDepth(b.z > 6 ? 10 : 5 + y * 0.001 + 0.0005);
    this.sprite.setFrame(speed > BALL.trailSpeed ? 2 : Math.floor(this.rollDistance / 6) % 2);

    const shadowScale = 1 - Math.min(b.z / 80, 0.5);
    this.shadow.setPosition(x, y + 3).setScale(shadowScale).setAlpha(0.9 - Math.min(b.z / 60, 0.5));

    // Trail for power shots / very fast balls (only advances while time runs)
    if (dt > 0) {
      if (free && (b.isPowerShot || speed > BALL.trailSpeed)) {
        this.trailPoints.push({ x: b.x, y: b.y - b.z });
        if (this.trailPoints.length > TRAIL_LENGTH) this.trailPoints.shift();
      } else if (this.trailPoints.length > 0) {
        this.trailPoints.shift();
      }
    }
    this.trail.clear();
    const n = this.trailPoints.length;
    for (let i = 0; i < n - 1; i++) {
      const p = this.trailPoints[i];
      const t = (i + 1) / n;
      this.trail.fillStyle(b.isPowerShot ? 0xffdd55 : 0xffffff, 0.45 * t);
      const s = Math.max(1, Math.round(4 * t));
      this.trail.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
    }
  }

  /** Drop the trail (kickoff reset). */
  clearTrail(): void {
    this.trailPoints = [];
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    this.trail.destroy();
  }
}
