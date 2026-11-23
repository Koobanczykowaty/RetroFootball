// ============================================================
// ControlsPanel — Control reference (keyboard + Xbox controller),
// shared by ControlsScene and the in-match pause menu.
// ============================================================

import Phaser from 'phaser';
import { t } from '../config/i18n';
import { UI, drawPanel, textStyle } from './Theme';

interface Row {
  keys: string;
  pad: string;
  action: string;
}

/** Control reference in the current language. */
function sections(): Array<{ title: string; rows: Row[] }> {
  const s = t();
  return [
    {
      title: s.secMovement,
      rows: [
        { keys: s.keyArrows, pad: 'L-STICK / D-PAD', action: s.actMove },
        { keys: 'SHIFT', pad: 'RT', action: s.actSprint },
        { keys: s.keyWithArrow('W'), pad: s.padWithStick('LB'), action: s.actSwitchToward },
      ],
    },
    {
      title: s.secWithBall,
      rows: [
        { keys: s.keyHold('S'), pad: s.keyHold('A'), action: s.actPass },
        { keys: s.keyHold('D'), pad: s.keyHold('B'), action: s.actShoot },
        { keys: '↑ / ↓ + D', pad: '↑ / ↓ + B', action: s.actAim },
        { keys: s.keyHold('A'), pad: s.keyHold('X'), action: s.actLob },
      ],
    },
    {
      title: s.secWithoutBall,
      rows: [
        { keys: 'A', pad: 'X', action: s.actTackle },
        { keys: 'S', pad: 'A', action: s.actSwitchBest },
        { keys: 'D / S', pad: 'B / A', action: s.actAerial },
      ],
    },
    {
      title: s.secMatch,
      rows: [
        { keys: 'ESC / P', pad: 'MENU', action: s.actPause },
        { keys: 'M', pad: 'VIEW', action: s.actMute },
      ],
    },
  ];
}

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
  c.add(scene.add.text(keyX + keyW / 2, y, t().colKeyboard, textStyle(10, UI.textMuted, true)).setOrigin(0.5, 0));
  c.add(scene.add.text(padX + padW / 2, y, t().colPad, textStyle(10, UI.textMuted, true)).setOrigin(0.5, 0));
  y += 18;

  const badge = (x: number, w: number) => {
    const b = scene.add.graphics();
    b.fillStyle(0x334466, 1);
    b.fillRect(x, y - 1, w, 20);
    b.fillStyle(0xffffff, 0.12);
    b.fillRect(x, y - 1, w, 2);
    c.add(b);
  };

  for (const section of sections()) {
    c.add(scene.add.text(keyX, y, section.title, textStyle(12, UI.accent, true)));
    y += 20;
    for (const row of section.rows) {
      badge(keyX, keyW);
      badge(padX, padW);
      c.add(scene.add.text(keyX + keyW / 2, y + 9, row.keys, textStyle(12, UI.textHighlight, true)).setOrigin(0.5));
      c.add(scene.add.text(padX + padW / 2, y + 9, row.pad, textStyle(12, '#9fe0a0', true)).setOrigin(0.5));
      c.add(scene.add.text(actionX, y + 9, row.action, textStyle(13, UI.textSoft)).setOrigin(0, 0.5));
      y += 22;
    }
    y += 6;
  }
  return c;
}
