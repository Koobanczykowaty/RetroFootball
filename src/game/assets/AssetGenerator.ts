// ============================================================
// Asset Generator — Programmatic pixel art sprite generation.
// Creates all game textures at runtime with Canvas 2D, so the game
// ships without image files. Team colours come from TEAMS config
// with the user's kit colours applied (config/Teams.ts).
// ============================================================

import Phaser from 'phaser';
import { TEAMS, TeamConfig } from '../config/GameplayConfig';
import { settings } from '../config/Settings';
import { teamWithKits } from '../config/Teams';

/** Selection-marker colour per human player (texture suffix → CSS colour). */
export const MARKER_COLORS = { p1: '#ffe14d', p2: '#6dff7a' } as const;
export type MarkerId = keyof typeof MARKER_COLORS;

const PLAYER_SIZE = 20;
const PLAYER_FRAMES = 7; // idle, run1, run2, kick, dive, celebrate, idle2
const BALL_SIZE = 10;
const OUTLINE = [18, 20, 32, 220] as const;

interface Kit {
  shirt: number;
  detail: number;
  shorts: number;
  socks: number;
  skin: number;
  hands: number;
}

type Px = (x: number, y: number, w: number, h: number, color: number | string) => void;

export class AssetGenerator {
  static generateAll(scene: Phaser.Scene): void {
    this.generatePlayerSprites(scene);
    this.generateRosterSprites(scene);
    this.generateBallSprite(scene);
    this.generateUISprites(scene);
  }

  // ---------------------------------------------------------------- players

  /**
   * Match sprites for both sides (`player_team0/1`, `player_gk0/1`). The
   * MatchScene calls this with the two chosen teams before creating players;
   * at boot it uses the teams last picked in the settings.
   */
  static generatePlayerSprites(
    scene: Phaser.Scene,
    teams: [TeamConfig, TeamConfig] = [teamWithKits(settings.teamP1, settings.kits), teamWithKits(settings.teamP2, settings.kits)],
  ): void {
    teams.forEach((team, i) => this.generateTeamSheets(scene, team, `player_team${i}`, `player_gk${i}`));
  }

  /** Preview sprites of every team with the user's kits: `kit_<id>`, `kit_gk_<id>`. */
  static generateRosterSprites(scene: Phaser.Scene): void {
    for (const t of TEAMS) this.generateTeamKit(scene, t.id);
  }

  /** (Re)generates one team's preview sprites, e.g. after a kit change. */
  static generateTeamKit(scene: Phaser.Scene, id: string): void {
    this.generateTeamSheets(scene, teamWithKits(id, settings.kits), `kit_${id}`, `kit_gk_${id}`);
  }

  private static generateTeamSheets(scene: Phaser.Scene, team: TeamConfig, key: string, gkKey: string): void {
    this.addSheet(scene, key, {
      shirt: team.primaryColor,
      detail: team.secondaryColor,
      shorts: team.shortsColor,
      socks: team.sockColor,
      skin: team.skinColor,
      hands: team.skinColor,
    });
    this.addSheet(scene, gkKey, {
      shirt: team.goalkeeperColor,
      detail: 0x222222,
      shorts: 0x222222,
      socks: team.goalkeeperColor,
      skin: team.skinColor,
      hands: 0xf4f4f4, // gloves
    });
  }

  private static addSheet(scene: Phaser.Scene, key: string, kit: Kit): void {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const canvas = document.createElement('canvas');
    canvas.width = PLAYER_SIZE * PLAYER_FRAMES;
    canvas.height = PLAYER_SIZE;
    const ctx = canvas.getContext('2d')!;

    for (let f = 0; f < PLAYER_FRAMES; f++) {
      const ox = f * PLAYER_SIZE;
      const px: Px = (x, y, w, h, c) => {
        ctx.fillStyle = typeof c === 'number' ? this.css(c) : c;
        ctx.fillRect(ox + x, y, w, h);
      };
      this.drawPlayerFrame(px, kit, f);
    }
    this.outline(ctx, canvas.width, canvas.height, PLAYER_SIZE);

    const tex = scene.textures.addCanvas(key, canvas);
    if (tex) {
      for (let f = 0; f < PLAYER_FRAMES; f++) {
        tex.add(f, 0, f * PLAYER_SIZE, 0, PLAYER_SIZE, PLAYER_SIZE);
      }
    }
  }

  /** Player drawn facing right; the game flips the sprite for left. */
  private static drawPlayerFrame(px: Px, k: Kit, frame: number): void {
    const hair = '#2a1a10';
    const boot = '#1d1d24';

    if (frame === 4) {
      // Dive / full stretch: arms reaching up, legs spread
      px(7, 3, 6, 2, hair);
      px(7, 5, 6, 4, k.skin);
      px(11, 6, 1, 1, '#222');
      px(6, 9, 8, 5, k.shirt);
      px(9, 9, 2, 5, k.detail);
      px(5, 6, 2, 4, k.shirt);
      px(13, 6, 2, 4, k.shirt);
      px(5, 2, 2, 4, k.skin);
      px(13, 2, 2, 4, k.skin);
      px(5, 0, 2, 2, k.hands);
      px(13, 0, 2, 2, k.hands);
      px(6, 14, 8, 2, k.shorts);
      px(5, 16, 2, 2, k.socks);
      px(13, 16, 2, 2, k.socks);
      px(4, 18, 3, 2, boot);
      px(13, 18, 3, 2, boot);
      return;
    }

    const u = frame === 6 ? 1 : 0; // idle "breathing" frame
    const leg = frame === 1 ? -1 : frame === 2 ? 1 : 0;
    const arm = frame === 1 ? 1 : frame === 2 ? -1 : 0;

    // Head
    px(7, 1 + u, 6, 2, hair);
    px(7, 3 + u, 6, 4, k.skin);
    px(7, 3 + u, 1, 2, hair); // back of the hair
    px(11, 4 + u, 1, 1, '#222'); // eye (facing right)

    // Torso
    px(6, 7 + u, 8, 5, k.shirt);
    px(9, 7 + u, 2, 5, k.detail);

    // Arms
    if (frame === 5) {
      // Celebrate: both arms up
      px(4, 5, 2, 3, k.shirt);
      px(14, 5, 2, 3, k.shirt);
      px(4, 2, 2, 3, k.skin);
      px(14, 2, 2, 3, k.skin);
      px(4, 1, 2, 1, k.hands);
      px(14, 1, 2, 1, k.hands);
    } else if (frame === 3) {
      // Kick: arms out for balance
      px(3, 7, 3, 2, k.shirt);
      px(14, 7, 3, 2, k.shirt);
      px(2, 8, 1, 2, k.hands);
      px(17, 8, 1, 2, k.hands);
    } else {
      px(4, 7 + u + arm, 2, 2, k.shirt);
      px(14, 7 + u - arm, 2, 2, k.shirt);
      px(4, 9 + u + arm, 2, 2, k.hands);
      px(14, 9 + u - arm, 2, 2, k.hands);
    }

    // Shorts
    px(6, 12, 8, 3, k.shorts);

    // Legs
    if (frame === 3) {
      // Planted left leg, right leg swinging through the ball
      px(7, 15, 2, 1, k.skin);
      px(7, 16, 2, 1, k.socks);
      px(6, 17, 3, 2, boot);
      px(13, 13, 2, 2, k.skin);
      px(15, 13, 2, 2, k.socks);
      px(17, 12, 3, 3, boot);
      return;
    }
    px(7 + leg, 15, 2, 1, k.skin);
    px(7 + leg, 16, 2, 1, k.socks);
    px(7 + leg, 17, 3, 2, boot);
    px(11 - leg, 15, 2, 1, k.skin);
    px(11 - leg, 16, 2, 1, k.socks);
    px(11 - leg, 17, 3, 2, boot);
  }

  // ------------------------------------------------------------------- ball

  static generateBallSprite(scene: Phaser.Scene): void {
    if (scene.textures.exists('ball')) scene.textures.remove('ball');
    const frames = 3; // roll A, roll B, fast
    const canvas = document.createElement('canvas');
    canvas.width = BALL_SIZE * frames;
    canvas.height = BALL_SIZE;
    const ctx = canvas.getContext('2d')!;

    const mask = [
      '..XXXX..',
      '.XXXXXX.',
      'XXXXXXXX',
      'XXXXXXXX',
      'XXXXXXXX',
      'XXXXXXXX',
      '.XXXXXX.',
      '..XXXX..',
    ];
    const panels = [
      [[2, 2], [3, 2], [5, 4], [2, 5], [6, 1]],
      [[4, 1], [1, 3], [5, 5], [6, 3], [3, 6]],
      [[3, 3], [4, 4]],
    ];

    for (let f = 0; f < frames; f++) {
      const ox = f * BALL_SIZE + 1;
      mask.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (row[x] !== 'X') continue;
          // Simple shading: lower-right is darker
          ctx.fillStyle = x + y > 9 ? '#cfd3da' : '#ffffff';
          ctx.fillRect(ox + x, 1 + y, 1, 1);
        }
      });
      ctx.fillStyle = f === 2 ? '#8a8f99' : '#2a2a33';
      for (const [x, y] of panels[f]) ctx.fillRect(ox + x, 1 + y, 1, 1);
    }
    this.outline(ctx, canvas.width, canvas.height, BALL_SIZE);

    const tex = scene.textures.addCanvas('ball', canvas);
    if (tex) {
      for (let f = 0; f < frames; f++) tex.add(f, 0, f * BALL_SIZE, 0, BALL_SIZE, BALL_SIZE);
    }
    this.generateRagBallSprite(scene);
  }

  /**
   * Rag ball for the housing-estate pitch: a lumpy bundle of cloth patches
   * tied with string. Same size and frames as the normal ball.
   */
  private static generateRagBallSprite(scene: Phaser.Scene): void {
    if (scene.textures.exists('ball_rag')) scene.textures.remove('ball_rag');
    const frames = 3; // roll A, roll B, fast
    const canvas = document.createElement('canvas');
    canvas.width = BALL_SIZE * frames;
    canvas.height = BALL_SIZE;
    const ctx = canvas.getContext('2d')!;

    // Slightly irregular silhouette (cloth, not a sphere)
    const mask = [
      '..XXX...',
      '.XXXXXX.',
      'XXXXXXX.',
      'XXXXXXXX',
      'XXXXXXXX',
      '.XXXXXXX',
      '.XXXXXX.',
      '...XXX..',
    ];
    // Cloth patches: grey-beige base, a faded red and a blue rag
    const patchA = ['aaabbbcc', 'aaabbbcc', 'aaaabbcc', 'ddaabbcc', 'dddaaccc', 'dddaaacc', 'ddaaaacc', 'ddaaaacc'];
    const patchB = ['ccaaabbb', 'ccaaabbb', 'cccaaabb', 'ccddaabb', 'cdddaaab', 'cdddaaaa', 'ccddaaaa', 'ccddaaaa'];
    const colors: Record<string, [string, string]> = {
      a: ['#cbbf9f', '#a89c7e'], // beige cloth (light, shaded)
      b: ['#b5483f', '#8e3530'], // faded red
      c: ['#9a9a90', '#7a7a72'], // grey
      d: ['#4f6a8f', '#3d5372'], // blue
    };
    for (let f = 0; f < frames; f++) {
      const ox = f * BALL_SIZE + 1;
      const patches = f === 1 ? patchB : patchA;
      mask.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (row[x] !== 'X') continue;
          const [light, dark] = colors[patches[y][x]];
          ctx.fillStyle = f === 2 ? '#a89c7e' : x + y > 9 ? dark : light; // fast: blurred into one colour
          ctx.fillRect(ox + x, 1 + y, 1, 1);
        }
      });
      // String tied around the bundle
      ctx.fillStyle = '#3a2a1a';
      if (f === 0) {
        for (let i = 1; i < 7; i++) ctx.fillRect(ox + i, 1 + i, 1, 1);
        for (let x = 1; x < 7; x++) ctx.fillRect(ox + x, 1 + 4, 1, 1);
      } else if (f === 1) {
        for (let i = 1; i < 7; i++) ctx.fillRect(ox + 7 - i, 1 + i, 1, 1);
        for (let y = 1; y < 7; y++) ctx.fillRect(ox + 3, 1 + y, 1, 1);
      } else {
        ctx.fillRect(ox + 3, 1 + 3, 2, 1);
      }
    }
    this.outline(ctx, canvas.width, canvas.height, BALL_SIZE);

    const tex = scene.textures.addCanvas('ball_rag', canvas);
    if (tex) {
      for (let f = 0; f < frames; f++) tex.add(f, 0, f * BALL_SIZE, 0, BALL_SIZE, BALL_SIZE);
    }
  }

  // --------------------------------------------------------------------- UI

  static generateUISprites(scene: Phaser.Scene): void {
    // Ball shadow
    this.canvasTexture(scene, 'ball_shadow', 12, 6, (ctx) => {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(2, 1, 8, 4);
      ctx.fillRect(1, 2, 10, 2);
    });

    // Selection ring + direction arrow of the controlled player, one colour per
    // human (the Canvas renderer can't tint, so each colour is its own texture)
    for (const [id, color] of Object.entries(MARKER_COLORS)) {
      // Pixel ellipse under the player's feet
      this.canvasTexture(scene, `selection_circle_${id}`, 24, 10, (ctx) => {
        const cx = 11.5;
        const cy = 4.5;
        ctx.fillStyle = color;
        for (let y = 0; y < 10; y++) {
          for (let x = 0; x < 24; x++) {
            const d = ((x - cx) / 11.5) ** 2 + ((y - cy) / 4.5) ** 2;
            if (d <= 1 && d > 0.55) ctx.fillRect(x, y, 1, 1);
          }
        }
      });
      // Arrow (points right; rotated in game)
      this.canvasTexture(scene, `direction_indicator_${id}`, 6, 7, (ctx) => {
        ctx.fillStyle = color;
        const rows = [1, 3, 5, 6, 5, 3, 1];
        rows.forEach((w, y) => ctx.fillRect(0, y, Math.min(w, 6), 1));
      });
    }

    // Confetti / particle pixel
    this.canvasTexture(scene, 'pixel', 3, 3, (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 3, 3);
    });
  }

  // ------------------------------------------------------------- animations


  // ---------------------------------------------------------------- helpers

  private static canvasTexture(
    scene: Phaser.Scene, key: string, w: number, h: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
  ): void {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    draw(ctx);
    scene.textures.addCanvas(key, canvas);
  }

  /** Adds a 1px dark outline around opaque pixels, never crossing frame borders. */
  private static outline(ctx: CanvasRenderingContext2D, w: number, h: number, frameW: number): void {
    const img = ctx.getImageData(0, 0, w, h);
    const src = new Uint8ClampedArray(img.data);
    const alpha = (x: number, y: number) => src[(y * w + x) * 4 + 3];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (alpha(x, y) > 0) continue;
        const frame = Math.floor(x / frameW);
        const neighbours: Array<[number, number]> = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        const touching = neighbours.some(([nx, ny]) =>
          nx >= 0 && ny >= 0 && nx < w && ny < h
          && Math.floor(nx / frameW) === frame && alpha(nx, ny) > 0);
        if (touching) {
          const i = (y * w + x) * 4;
          img.data[i] = OUTLINE[0];
          img.data[i + 1] = OUTLINE[1];
          img.data[i + 2] = OUTLINE[2];
          img.data[i + 3] = OUTLINE[3];
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  private static css(hex: number): string {
    return `#${hex.toString(16).padStart(6, '0')}`;
  }
}
