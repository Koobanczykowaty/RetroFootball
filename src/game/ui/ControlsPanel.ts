// ============================================================
// ControlsPanel — Control reference, shared by ControlsScene and
// the in-match pause menu.
// ============================================================

import Phaser from 'phaser';
import { UI, drawPanel, textStyle } from './Theme';

interface Row {
  keys: string;
  action: string;
}

const SECTIONS: Array<{ title: string; rows: Row[] }> = [
  {
    title: 'MOVEMENT',
    rows: [
      { keys: 'ARROWS', action: 'Move (8 directions)' },
      { keys: 'SHIFT', action: 'Sprint (uses stamina)' },
      { keys: 'SPACE (+ARROW)', action: 'Switch player (toward arrow)' },
    ],
  },
  {
    title: 'WITH THE BALL',
    rows: [
      { keys: 'S (hold)', action: 'Pass — longer hold = faster' },
      { keys: 'D (hold)', action: 'Shoot — hold longer for power' },
      { keys: '↑ / ↓ + D', action: 'Aim at top / bottom corner' },
      { keys: 'A (hold)', action: 'Lob toward arrow — hold = further' },
    ],
  },
  {
    title: 'WITHOUT THE BALL',
    rows: [
      { keys: 'D', action: 'Tackle' },
      { keys: 'S', action: 'Switch to best-placed player' },
    ],
  },
  {
    title: 'MATCH',
    rows: [
      { keys: 'ESC / P', action: 'Pause' },
      { keys: 'M', action: 'Mute sound' },
    ],
  },
];

export const CONTROLS_PANEL_HEIGHT = 392;

export function createControlsPanel(scene: Phaser.Scene, cx: number, top: number): Phaser.GameObjects.Container {
  const width = 560;
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  drawPanel(g, cx - width / 2, top, width, CONTROLS_PANEL_HEIGHT);
  c.add(g);

  let y = top + 16;
  const keyX = cx - width / 2 + 24;
  const actionX = cx - width / 2 + 200;

  for (const section of SECTIONS) {
    c.add(scene.add.text(keyX, y, section.title, textStyle(12, UI.accent, true)));
    y += 20;
    for (const row of section.rows) {
      const badge = scene.add.graphics();
      badge.fillStyle(0x334466, 1);
      badge.fillRect(keyX, y - 1, 160, 20);
      badge.fillStyle(0xffffff, 0.12);
      badge.fillRect(keyX, y - 1, 160, 2);
      c.add(badge);
      c.add(scene.add.text(keyX + 80, y + 9, row.keys, textStyle(12, UI.textHighlight, true)).setOrigin(0.5));
      c.add(scene.add.text(actionX, y + 9, row.action, textStyle(13, UI.textSoft)).setOrigin(0, 0.5));
      y += 24;
    }
    y += 6;
  }
  return c;
}
