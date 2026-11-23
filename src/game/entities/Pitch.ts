// ============================================================
// Pitch — Renders the pitch, markings, goals and surroundings
// (stands, crowd, advertising boards) once into Graphics.
// ============================================================

import Phaser from 'phaser';
import { PITCH, GAME_WIDTH, GAME_HEIGHT, type StadiumId } from '../config/GameplayConfig';
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

  constructor(scene: Phaser.Scene, private readonly stadium: StadiumId = 'narodowy') {
    this.graphics = scene.add.graphics().setDepth(0);
    this.draw();
  }

  draw(): void {
    if (this.stadium === 'blokowisko') {
      this.drawEstate();
      return;
    }
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

    const corners = this.drawMarkings(g, p.lineColor, p.lineAlpha);

    this.drawGoal(g, true);
    this.drawGoal(g, false);

    for (const [cx, cy] of corners) this.drawCornerFlag(g, cx, cy);
  }

  /** Pitch lines; returns the four corners. */
  private drawMarkings(g: Phaser.GameObjects.Graphics, color: number, alpha: number): Array<[number, number, number]> {
    const p = PITCH;
    g.lineStyle(p.lineWidth, color, alpha);
    g.strokeRect(p.x, p.y, p.width, p.height);

    // Halfway line, centre circle and spot
    g.lineBetween(PITCH_CX, p.y, PITCH_CX, p.y + p.height);
    g.strokeCircle(PITCH_CX, PITCH_CY, p.centerCircleRadius);
    g.fillStyle(color, alpha);
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
    return corners;
  }

  // ======================================================== housing estate

  /**
   * "Blokowisko": a worn grass pitch between prefab apartment blocks, with a
   * chain-link fence, a pavement, a carpet-beater frame, benches and trees,
   * chalk lines and goals made of pipes. Same geometry as the stadium.
   */
  private drawEstate(): void {
    const g = this.graphics;
    const p = PITCH;
    const rand = rng(4242);

    // Grass verge around everything
    g.fillStyle(0x3d6230, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    for (let i = 0; i < 260; i++) {
      g.fillStyle(rand() < 0.5 ? 0x36592b : 0x456b36, 1);
      g.fillRect(Math.floor(rand() * GAME_WIDTH), Math.floor(rand() * GAME_HEIGHT), 3 + Math.floor(rand() * 5), 2);
    }

    // Blocks along the top and bottom, pavement in front of them
    this.drawBlocks(g, 0, 22, rand);
    this.drawBlocks(g, GAME_HEIGHT - 22, 22, rand);
    g.fillStyle(0x6f7277, 1);
    g.fillRect(0, 22, GAME_WIDTH, 7);
    g.fillRect(0, GAME_HEIGHT - 29, GAME_WIDTH, 7);
    g.fillStyle(0x5d6065, 1);
    for (let x = 0; x < GAME_WIDTH; x += 12) {
      g.fillRect(x, 22, 1, 7); // pavement slab joints
      g.fillRect(x + 6, GAME_HEIGHT - 29, 1, 7);
    }

    // Worn grass on the pitch: patchy greens, no mowing stripes
    g.fillStyle(0x4c8a3c, 1);
    g.fillRect(p.x, p.y, p.width, p.height);
    for (let i = 0; i < 900; i++) {
      const c = [0x437d35, 0x55963f, 0x3f7432, 0x5a9a45][Math.floor(rand() * 4)];
      g.fillStyle(c, 1);
      g.fillRect(p.x + Math.floor(rand() * (p.width - 12)), p.y + Math.floor(rand() * (p.height - 6)),
        4 + Math.floor(rand() * 12), 2 + Math.floor(rand() * 5));
    }

    // Chalk lines, a bit faint
    this.drawMarkings(g, 0xf2f0e4, 0.6);

    // Bald, sandy patches where everybody runs: goal mouths, centre, random
    const bald = (x: number, y: number, rx: number, ry: number) => {
      g.fillStyle(0x9c8454, 1);
      g.fillEllipse(x, y, rx * 2 + 4, ry * 2 + 4);
      g.fillStyle(0xb59a68, 1);
      g.fillEllipse(x, y, rx * 2, ry * 2);
      g.fillStyle(0xc7ad7a, 1);
      for (let k = 0; k < (rx * ry) / 40; k++) {
        g.fillRect(x - rx * 0.7 + rand() * rx * 1.4, y - ry * 0.6 + rand() * ry * 1.2, 2, 1);
      }
      // Grass tufts on the edge
      g.fillStyle(0x3f7432, 1);
      for (let k = 0; k < 10; k++) {
        const a = rand() * Math.PI * 2;
        g.fillRect(x + Math.cos(a) * rx, y + Math.sin(a) * ry, 2, 2);
      }
    };
    bald(p.x + 22, PITCH_CY, 26, 44);
    bald(p.x + p.width - 22, PITCH_CY, 26, 44);
    bald(PITCH_CX, PITCH_CY, 34, 22);
    for (let i = 0; i < 9; i++) {
      bald(p.x + 60 + rand() * (p.width - 120), p.y + 30 + rand() * (p.height - 60), 6 + rand() * 12, 4 + rand() * 7);
    }

    // Chain-link fence instead of advertising boards
    this.drawFence(g, p.y - 12);
    this.drawFence(g, p.y + p.height + 4);

    // Props on the side verges (clear of the goals)
    this.drawCarpetBeater(g, 18, 92);
    this.drawTree(g, 40, 430, rand);
    this.drawBench(g, GAME_WIDTH - 66, 100);
    this.drawBin(g, GAME_WIDTH - 30, 140);
    this.drawTree(g, GAME_WIDTH - 40, 420, rand);
    this.drawBench(g, 16, 160);

    this.drawPipeGoal(g, true, rand);
    this.drawPipeGoal(g, false, rand);
  }

  /** A row of prefab blocks seen from the pitch: panels, windows, balconies. */
  private drawBlocks(g: Phaser.GameObjects.Graphics, y0: number, h: number, rand: () => number): void {
    g.fillStyle(0x7d93ad, 1); // sky between blocks
    g.fillRect(0, y0, GAME_WIDTH, h);
    const pastel = [0xd8cfa0, 0xb9c4c9, 0xd9a58e, 0xc7c9b5, 0xa9b8a0, 0xe0d2b4];
    let x = -10;
    while (x < GAME_WIDTH) {
      const w = 110 + Math.floor(rand() * 90);
      const base = pastel[Math.floor(rand() * pastel.length)];
      g.fillStyle(base, 1);
      g.fillRect(x, y0, w, h);
      g.fillStyle(0x000000, 0.12); // panel seams
      for (let sx = x + 10; sx < x + w; sx += 10) g.fillRect(sx, y0, 1, h);
      for (let sy = y0 + 5; sy < y0 + h; sy += 6) g.fillRect(x, sy, w, 1);
      // Windows (some lit) and balconies
      for (let sy = y0 + 1; sy < y0 + h - 2; sy += 6) {
        for (let sx = x + 3; sx < x + w - 5; sx += 10) {
          g.fillStyle(rand() < 0.25 ? 0xf3dc8a : 0x2c3a55, 1);
          g.fillRect(sx, sy, 4, 3);
          if (rand() < 0.3) {
            g.fillStyle(0x6c6f74, 1);
            g.fillRect(sx - 1, sy + 3, 6, 1);
          }
        }
      }
      // Darker edge between neighbouring blocks
      g.fillStyle(0x000000, 0.25);
      g.fillRect(x + w - 2, y0, 2, h);
      x += w + 4 + Math.floor(rand() * 18);
    }
  }

  /** Chain-link fence along a touchline: posts with a diamond mesh. */
  private drawFence(g: Phaser.GameObjects.Graphics, y: number): void {
    const h = 8;
    const x0 = PITCH.x - 30;
    const x1 = PITCH.x + PITCH.width + 30;
    g.lineStyle(1, 0xb8bec6, 0.35);
    for (let x = x0; x < x1; x += 4) {
      g.lineBetween(x, y, x + h, y + h);
      g.lineBetween(x + h, y, x, y + h);
    }
    g.fillStyle(0x8f969e, 1);
    g.fillRect(x0, y, x1 - x0, 1); // top wire
    for (let x = x0; x <= x1; x += 48) {
      g.fillStyle(0x4b5058, 1);
      g.fillRect(x, y - 2, 2, h + 3);
    }
  }

  private drawCarpetBeater(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    // Two posts, the top bar and a rug hung over it
    g.fillStyle(0x3d4a5c, 1);
    g.fillRect(x, y, 2, 26);
    g.fillRect(x + 40, y, 2, 26);
    g.fillRect(x, y, 42, 2);
    g.fillStyle(0x8e2f2f, 1);
    g.fillRect(x + 8, y + 2, 18, 12);
    g.fillStyle(0xd8b04a, 1);
    for (let i = 0; i < 4; i++) g.fillRect(x + 10 + i * 4, y + 5, 2, 6);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(x - 2, y + 26, 46, 2); // shadow
  }

  private drawBench(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x6b4a2b, 1);
    g.fillRect(x, y, 44, 3);
    g.fillRect(x, y + 5, 44, 3);
    g.fillStyle(0x2f3338, 1);
    g.fillRect(x + 4, y + 8, 2, 5);
    g.fillRect(x + 38, y + 8, 2, 5);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(x, y + 13, 44, 2);
  }

  private drawBin(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x2f6b3a, 1);
    g.fillRect(x, y, 12, 14);
    g.fillStyle(0x24532d, 1);
    g.fillRect(x - 1, y, 14, 3);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(x, y + 14, 12, 2);
  }

  private drawTree(g: Phaser.GameObjects.Graphics, x: number, y: number, rand: () => number): void {
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(x + 6, y + 30, 46, 14); // shadow
    g.fillStyle(0x5b4128, 1);
    g.fillRect(x - 2, y + 10, 5, 20); // trunk
    g.fillStyle(0x2c5424, 1);
    g.fillCircle(x, y, 22);
    g.fillStyle(0x386b2d, 1);
    g.fillCircle(x - 5, y - 5, 15);
    g.fillStyle(0x4a8239, 1);
    for (let i = 0; i < 14; i++) g.fillRect(x - 14 + rand() * 22, y - 14 + rand() * 18, 3, 2);
  }

  /** Goal made of grey pipes with a torn net. */
  private drawPipeGoal(g: Phaser.GameObjects.Graphics, left: boolean, rand: () => number): void {
    const depth = PITCH.goalDepth;
    const w = PITCH.goalWidth;
    const gx = left ? PITCH.x - depth : PITCH.x + PITCH.width;

    // Torn net: mesh with missing pieces
    g.lineStyle(1, 0xd8d8d0, 0.3);
    for (let ny = GOAL_TOP + 6; ny < GOAL_TOP + w; ny += 6) {
      if (rand() < 0.2) continue;
      g.lineBetween(gx, ny, gx + depth, ny);
    }
    for (let nx = 4; nx < depth; nx += 5) {
      const gap = rand() < 0.4 ? GOAL_TOP + 20 + rand() * (w - 40) : -1;
      if (gap < 0) g.lineBetween(gx + nx, GOAL_TOP, gx + nx, GOAL_TOP + w);
      else {
        g.lineBetween(gx + nx, GOAL_TOP, gx + nx, gap);
        g.lineBetween(gx + nx, gap + 14, gx + nx, GOAL_TOP + w);
      }
    }

    // Pipe frame with chipped paint
    g.lineStyle(2, 0x9aa0a8, 1);
    g.strokeRect(gx, GOAL_TOP, depth, w);
    const lineX = left ? PITCH.x : PITCH.x + PITCH.width;
    g.fillStyle(0xc9ccd0, 1);
    g.fillRect(lineX - 2, GOAL_TOP - 3, 4, 5);
    g.fillRect(lineX - 2, GOAL_TOP + w - 2, 4, 5);
    g.fillStyle(0x8a5a36, 1); // rust spots
    for (let i = 0; i < 5; i++) g.fillRect(gx + rand() * depth, rand() < 0.5 ? GOAL_TOP - 1 : GOAL_TOP + w - 1, 2, 2);
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

      // White-red flags waved in the crowd (top band: not under the HUD / corner hints)
      for (let x = 36; x < GAME_WIDTH - 30; x += 92) {
        const underHud = y0 === 0
          && (x < 100 || (x > PITCH_CX - 190 && x < PITCH_CX + 190) || x > GAME_WIDTH - 110);
        if (underHud) continue;
        this.drawPolishFlag(g, x, y0 + 3);
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
        if (i % 4 === 0) {
          // Every fourth board in white and red
          g.fillStyle(0xffffff, 1);
          g.fillRect(x, by, w - 2, boardH / 2);
          g.fillStyle(0xdc143c, 1);
          g.fillRect(x, by + boardH / 2, w - 2, boardH / 2);
        } else {
          g.fillStyle(BOARD_COLORS[i % BOARD_COLORS.length], 1);
          g.fillRect(x, by, w - 2, boardH);
          // Abstract "logo" marks (no real brands)
          g.fillStyle(0xffffff, 0.75);
          g.fillRect(x + 8, by + 3, 18, 2);
          g.fillRect(x + 30, by + 2, 4, 4);
          g.fillRect(x + 38, by + 3, 22, 2);
        }
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
    g.lineBetween(x, y, x, y - 10);
    // White-red corner flag
    g.fillStyle(0xffffff, 1);
    g.fillRect(x + 1, y - 10, 6, 2);
    g.fillStyle(0xdc143c, 1);
    g.fillRect(x + 1, y - 8, 6, 2);
  }

  /** Small white-red flag on a pole, held up in the crowd. */
  private drawPolishFlag(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x0b0f1c, 1);
    g.fillRect(x - 1, y - 1, 13, 8); // dark outline so it stands out from the crowd
    g.fillRect(x - 1, y, 2, 16); // pole
    g.fillStyle(0xbbbbbb, 1);
    g.fillRect(x - 1, y + 7, 1, 9);
    g.fillStyle(0xffffff, 1);
    g.fillRect(x, y, 11, 3);
    g.fillStyle(0xdc143c, 1);
    g.fillRect(x, y + 3, 11, 3);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
