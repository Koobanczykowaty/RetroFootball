// ============================================================
// Pitch — Renders the pitch, markings, goals and surroundings
// (stands, crowd, advertising boards) once into Graphics.
// ============================================================

import Phaser from 'phaser';
import { PITCH, GAME_WIDTH, GAME_HEIGHT } from '../config/GameplayConfig';
import { GOAL_TOP, PITCH_CX, PITCH_CY } from '../logic/PitchGeometry';

/** Small deterministic PRNG so the crowd looks the same every match. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const CROWD_COLORS = [0xdd2222, 0xffffff, 0x2255dd, 0xffcc00, 0x99aabb, 0x334455, 0xf5c5a3, 0xd4a574];
const BOARD_COLORS = [0x223a7a, 0xb83030, 0x1f7a4a, 0xd08a1a, 0x5a2a8a];

export class Pitch {
  private graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(0);
    this.draw();
  }

  draw(): void {
    const g = this.graphics;
    const p = PITCH;

    // Surroundings: running track / dark grass
    g.fillStyle(0x1a5c32, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.drawStands(g);

    // Grass stripes
    for (let i = 0; i < Math.ceil(p.width / p.stripeWidth); i++) {
      g.fillStyle(i % 2 === 0 ? p.grassColor1 : p.grassColor2, 1);
      const sx = p.x + i * p.stripeWidth;
      g.fillRect(sx, p.y, Math.min(p.stripeWidth, p.x + p.width - sx), p.height);
    }

    g.lineStyle(p.lineWidth, p.lineColor, p.lineAlpha);
    g.strokeRect(p.x, p.y, p.width, p.height);

    // Halfway line, centre circle and spot
    g.lineBetween(PITCH_CX, p.y, PITCH_CX, p.y + p.height);
    g.strokeCircle(PITCH_CX, PITCH_CY, p.centerCircleRadius);
    g.fillStyle(p.lineColor, p.lineAlpha);
    g.fillCircle(PITCH_CX, PITCH_CY, 3);

    // Penalty and goal areas
    const paTop = PITCH_CY - p.penaltyAreaWidth / 2;
    const gaTop = PITCH_CY - p.goalAreaWidth / 2;
    const right = p.x + p.width;
    g.strokeRect(p.x, paTop, p.penaltyAreaHeight, p.penaltyAreaWidth);
    g.strokeRect(p.x, gaTop, p.goalAreaHeight, p.goalAreaWidth);
    g.strokeRect(right - p.penaltyAreaHeight, paTop, p.penaltyAreaHeight, p.penaltyAreaWidth);
    g.strokeRect(right - p.goalAreaHeight, gaTop, p.goalAreaHeight, p.goalAreaWidth);

    // Penalty spots and arcs
    const spot = p.penaltyAreaHeight * 0.75;
    g.fillCircle(p.x + spot, PITCH_CY, 2);
    g.fillCircle(right - spot, PITCH_CY, 2);
    const arcR = 45;
    const arcA = Math.acos((p.penaltyAreaHeight - spot) / arcR);
    g.beginPath();
    g.arc(p.x + spot, PITCH_CY, arcR, -arcA, arcA, false);
    g.strokePath();
    g.beginPath();
    g.arc(right - spot, PITCH_CY, arcR, Math.PI - arcA, Math.PI + arcA, false);
    g.strokePath();

    // Corner arcs
    const r = p.cornerArcRadius;
    const bottom = p.y + p.height;
    const corners: Array<[number, number, number]> = [
      [p.x, p.y, 0], [right, p.y, Math.PI * 0.5], [p.x, bottom, Math.PI * 1.5], [right, bottom, Math.PI],
    ];
    for (const [cx, cy, a] of corners) {
      g.beginPath();
      g.arc(cx, cy, r, a, a + Math.PI * 0.5, false);
      g.strokePath();
    }

    this.drawGoal(g, true);
    this.drawGoal(g, false);

    for (const [cx, cy] of corners) this.drawCornerFlag(g, cx, cy);
  }

  private drawStands(g: Phaser.GameObjects.Graphics): void {
    const rand = rng(1234);
    const bands: Array<[number, number]> = [[0, 22], [GAME_HEIGHT - 22, 22]];

    for (const [y0, h] of bands) {
      g.fillStyle(0x23263a, 1);
      g.fillRect(0, y0, GAME_WIDTH, h);
      // Crowd: rows of 2x2 "heads"
      for (let y = y0 + 2; y < y0 + h - 2; y += 4) {
        for (let x = 2; x < GAME_WIDTH - 2; x += 4) {
          if (rand() < 0.12) continue;
          g.fillStyle(CROWD_COLORS[Math.floor(rand() * CROWD_COLORS.length)], 0.85);
          g.fillRect(x + Math.floor(rand() * 2), y, 2, 2);
        }
      }
    }

    // Advertising boards along both touchlines
    const boardH = 8;
    const boardsY = [PITCH.y - 15, PITCH.y + PITCH.height + 7];
    for (const by of boardsY) {
      let x = PITCH.x - 20;
      let i = by > PITCH_CY ? 2 : 0;
      while (x < PITCH.x + PITCH.width + 20) {
        const w = 70;
        g.fillStyle(BOARD_COLORS[i % BOARD_COLORS.length], 1);
        g.fillRect(x, by, w - 2, boardH);
        // Abstract "logo" marks (no real brands)
        g.fillStyle(0xffffff, 0.75);
        g.fillRect(x + 8, by + 3, 18, 2);
        g.fillRect(x + 30, by + 2, 4, 4);
        g.fillRect(x + 38, by + 3, 22, 2);
        x += w;
        i++;
      }
    }

    // Benches / dugouts on the bottom side
    g.fillStyle(0x2b2f45, 1);
    g.fillRect(PITCH_CX - 150, PITCH.y + PITCH.height + 17, 90, 4);
    g.fillRect(PITCH_CX + 60, PITCH.y + PITCH.height + 17, 90, 4);
  }

  private drawGoal(g: Phaser.GameObjects.Graphics, left: boolean): void {
    const depth = PITCH.goalDepth;
    const w = PITCH.goalWidth;
    const gx = left ? PITCH.x - depth : PITCH.x + PITCH.width;

    // Net background
    g.fillStyle(0x0f3a22, 0.6);
    g.fillRect(gx, GOAL_TOP, depth, w);

    // Net mesh
    g.lineStyle(1, PITCH.goalNetColor, 0.35);
    for (let ny = GOAL_TOP + 6; ny < GOAL_TOP + w; ny += 6) g.lineBetween(gx, ny, gx + depth, ny);
    for (let nx = 4; nx < depth; nx += 5) g.lineBetween(gx + nx, GOAL_TOP, gx + nx, GOAL_TOP + w);

    // Frame: back bar, side bars and thick posts on the goal line
    g.lineStyle(2, 0xdddddd, 1);
    g.strokeRect(gx, GOAL_TOP, depth, w);
    const lineX = left ? PITCH.x : PITCH.x + PITCH.width;
    g.fillStyle(PITCH.goalColor, 1);
    g.fillRect(lineX - 2, GOAL_TOP - 3, 4, 5);
    g.fillRect(lineX - 2, GOAL_TOP + w - 2, 4, 5);
  }

  private drawCornerFlag(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.lineStyle(1, 0xdddddd, 0.9);
    g.lineBetween(x, y, x, y - 9);
    g.fillStyle(0xffcc00, 0.95);
    g.fillTriangle(x, y - 9, x + 6, y - 7, x, y - 5);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
