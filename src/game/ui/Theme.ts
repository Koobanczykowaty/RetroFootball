// ============================================================
// Theme — Shared UI palette and text styles.
// ============================================================

import Phaser from 'phaser';

export const UI = {
  // The game's own pixel font (assets/PixelFont.ts), monospace as a fallback
  font: "RetroGala, monospace",
  background: 0x0a1628,
  panel: 0x1a2a44,
  panelBorder: 0x4488cc,
  outline: 0x0b0f1c,
  button: 0x224488,
  buttonFocus: 0x3a6fc4,
  accent: '#ffcc00',
  text: '#ffffff',
  textMuted: '#8899aa',
  textSoft: '#ccddee',
  textHighlight: '#ffe14d',
};

/**
 * Font size snapped to the pixel font's grid: one font pixel is 1/10 em, so
 * sizes of 10, 20, 30… px make every font pixel exactly 1, 2, 3… game pixels,
 * on the same grid as the sprites. Other sizes would give soft, "high
 * resolution" letters.
 */
export function pixelFontSize(size: number): number {
  return Math.max(10, Math.round(size / 10) * 10);
}

/** Outline thickness of one font pixel at that (snapped) size. */
export function pixelStroke(size: number): number {
  return (pixelFontSize(size) / 10) * 2; // a canvas stroke is half outside the glyph
}

export function titleStyle(size = 28): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: UI.font,
    fontSize: `${pixelFontSize(size)}px`,
    color: UI.accent,
    fontStyle: 'bold',
    stroke: '#000000',
    strokeThickness: pixelStroke(size),
    padding: { x: 4, y: 2 },
  };
}

export function textStyle(size = 14, color = UI.text, bold = false): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: UI.font,
    fontSize: `${pixelFontSize(size)}px`,
    color,
    fontStyle: bold ? 'bold' : 'normal',
    // Bold monospace glyphs overhang their measured width; pad to avoid clipping
    padding: { x: 2, y: 1 },
  };
}

/** Pixel-style panel with border and drop shadow. */
export function drawPanel(
  g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number,
  fill = UI.panel, border = UI.panelBorder, alpha = 0.95,
): void {
  g.fillStyle(0x000000, 0.4);
  g.fillRect(x + 4, y + 4, w, h);
  g.fillStyle(UI.outline, 1);
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle(border, 1);
  g.fillRect(x, y, w, h);
  g.fillStyle(fill, alpha);
  g.fillRect(x + 2, y + 2, w - 4, h - 4);
}

export function hexColor(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}
