// ============================================================
// PauseMenu — RESUME / FORMATION / RESTART MATCH / CONTROLS /
// MAIN MENU, with an in-place controls reference view.
// ============================================================

import Phaser from 'phaser';
import { FORMATION_IDS, FormationId, GAME_WIDTH, GAME_HEIGHT } from '../config/GameplayConfig';
import { Button } from './Button';
import { CONTROLS_PANEL_HEIGHT, createControlsPanel } from './ControlsPanel';
import { MenuNavigator } from './MenuNavigator';
import { OptionSelector } from './OptionSelector';
import { drawPanel, titleStyle } from './Theme';

export interface PauseHandlers {
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  /** One formation row per human player (none in AI-only simulations). */
  formations: Array<{
    label: string;
    /** Formation selected when the menu is created. */
    value: FormationId;
    onChange: (id: FormationId) => void;
  }>;
}

const CX = GAME_WIDTH / 2;
const CY = GAME_HEIGHT / 2;

export class PauseMenu {
  private readonly root: Phaser.GameObjects.Container;
  private readonly main: Phaser.GameObjects.Container;
  private readonly controls: Phaser.GameObjects.Container;
  private readonly mainNav: MenuNavigator;
  private readonly controlsNav: MenuNavigator;
  private shown = false;

  constructor(scene: Phaser.Scene, handlers: PauseHandlers) {
    this.root = scene.add.container(0, 0).setDepth(400).setVisible(false);
    const dim = scene.add.rectangle(CX, CY, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setInteractive();
    this.root.add(dim);

    // --- Main pause panel (height grows with the number of formation rows)
    const rowH = 48;
    const rows = 4 + handlers.formations.length;
    const panelH = 80 + rows * rowH;
    const top = CY - panelH / 2;
    this.main = scene.add.container(0, 0);
    const g = scene.add.graphics();
    drawPanel(g, CX - 180, top, 360, panelH);
    this.main.add(g);
    this.main.add(scene.add.text(CX, top + 34, 'PAUSED', titleStyle(30)).setOrigin(0.5));

    const opts = { width: 220, height: 38, fontSize: 16 };
    let y = top + 90;
    const next = () => {
      const current = y;
      y += rowH;
      return current;
    };
    const items = [
      new Button(scene, CX, next(), 'RESUME', handlers.onResume, opts),
      ...handlers.formations.map((f) => new OptionSelector<FormationId>(
        scene, CX, next(), f.label, FORMATION_IDS, Math.max(0, FORMATION_IDS.indexOf(f.value)),
        (v) => v, f.onChange, 320,
      )),
      new Button(scene, CX, next(), 'RESTART MATCH', handlers.onRestart, opts),
      new Button(scene, CX, next(), 'CONTROLS', () => this.showControls(true), opts),
      new Button(scene, CX, next(), 'MAIN MENU', handlers.onMainMenu, opts),
    ];
    this.main.add(items);
    this.mainNav = new MenuNavigator(scene, items, handlers.onResume);

    // --- Controls view
    this.controls = scene.add.container(0, 0).setVisible(false);
    const controlsTop = 30;
    this.controls.add(createControlsPanel(scene, CX, controlsTop));
    const back = new Button(
      scene, CX, controlsTop + CONTROLS_PANEL_HEIGHT + 40, 'BACK', () => this.showControls(false), opts,
    );
    this.controls.add(back);
    this.controlsNav = new MenuNavigator(scene, [back], () => this.showControls(false));

    this.root.add([this.main, this.controls]);
  }

  get visible(): boolean {
    return this.shown;
  }

  /** @param openedBy key event that opened the menu (ignored by the menu itself). */
  show(openedBy?: KeyboardEvent): void {
    this.shown = true;
    this.root.setVisible(true);
    this.showControls(false, openedBy);
  }

  hide(): void {
    this.shown = false;
    this.root.setVisible(false);
    this.mainNav.deactivate();
    this.controlsNav.deactivate();
  }

  private showControls(on: boolean, openedBy?: KeyboardEvent): void {
    this.main.setVisible(!on);
    this.controls.setVisible(on);
    if (on) {
      this.mainNav.deactivate();
      this.controlsNav.activate(0, openedBy);
    } else {
      this.controlsNav.deactivate();
      this.mainNav.activate(0, openedBy);
    }
  }

  destroy(): void {
    this.hide();
    this.root.destroy();
  }
}
