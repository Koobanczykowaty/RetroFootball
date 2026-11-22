// ============================================================
// ControlsPanel — Control reference (keyboard + Xbox controller),
// shared by ControlsScene and the in-match pause menu.
// ============================================================

import Phaser from 'phaser';
import { UI, drawPanel, textStyle } from './Theme';

interface Row {
  keys: string;
  pad: string;
  action: string;
}

const SECTIONS: Array<{ title: string; rows: Row[] }> = [
  {
    title: 'MOVEMENT',
    rows: [
      { keys: 'ARROWS', pad: 'L-STICK / D-PAD', action: 'Move (8 directions)' },
      { keys: 'SHIFT', pad: 'RT', action: 'Sprint (uses stamina)' },
      { keys: 'SPACE (+ARROW)', pad: 'LB (+STICK)', action: 'Switch player (toward arrow)' },
    ],
  },
  {
    title: 'WITH THE BALL',
    rows: [
      { keys: 'S (hold)', pad: 'A (hold)', action: 'Pass — longer hold = faster' },
      { keys: 'D (hold)', pad: 'B (hold)', action: 'Shoot — hold longer for power' },
      { keys: '↑ / ↓ + D', pad: '↑ / ↓ + B', action: 'Aim at top / bottom corner' },
      { keys: 'A (hold)', pad: 'X (hold)', action: 'Lob toward arrow — hold = further' },
    ],
  },
  {
    title: 'WITHOUT THE BALL',
    rows: [
      { keys: 'A', pad: 'X', action: 'Tackle' },
      { keys: 'S', pad: 'A', action: 'Switch to best-placed player' },
    ],
  },
  {
    title: 'MATCH',
    rows: [
      { keys: 'ESC / P', pad: 'MENU', action: 'Pause' },
      { keys: 'M', pad: 'VIEW', action: 'Mute sound' },
    ],
  },
];

export const CONTROLS_PANEL_HEIGHT = 408;

export function createControlsPanel(scene: Phaser.Scene, cx: number, top: number): Phaser.GameObjects.Container {
  const width = 640;
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  drawPanel(g, cx - width / 2, top, width, CONTROLS_PANEL_HEIGHT);
  c.add(g);

  const keyX = cx - width / 2 + 20;
  const keyW = 150;
  const padX = keyX + keyW + 8;
  const padW = 130;
  const actionX = padX + padW + 14;

  // Column headers
  let y = top + 12;
  c.add(scene.add.text(keyX + keyW / 2, y, 'KEYBOARD', textStyle(10, UI.textMuted, true)).setOrigin(0.5, 0));
  c.add(scene.add.text(padX + padW / 2, y, 'XBOX PAD', textStyle(10, UI.textMuted, true)).setOrigin(0.5, 0));
  y += 18;

  const badge = (x: number, w: number) => {
    const b = scene.add.graphics();
    b.fillStyle(0x334466, 1);
    b.fillRect(x, y - 1, w, 20);
    b.fillStyle(0xffffff, 0.12);
    b.fillRect(x, y - 1, w, 2);
    c.add(b);
  };

  for (const section of SECTIONS) {
    c.add(scene.add.text(keyX, y, section.title, textStyle(12, UI.accent, true)));
    y += 20;
    for (const row of section.rows) {
      badge(keyX, keyW);
      badge(padX, padW);
      c.add(scene.add.text(keyX + keyW / 2, y + 9, row.keys, textStyle(12, UI.textHighlight, true)).setOrigin(0.5));
      c.add(scene.add.text(padX + padW / 2, y + 9, row.pad, textStyle(12, '#9fe0a0', true)).setOrigin(0.5));
      c.add(scene.add.text(actionX, y + 9, row.action, textStyle(13, UI.textSoft)).setOrigin(0, 0.5));
      y += 24;
    }
    y += 6;
  }
  return c;
}
