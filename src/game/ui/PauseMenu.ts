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
  /** Change the human team's formation mid-match. */
  onFormationChange: (id: FormationId) => void;
  /** Formation selected when the menu is created. */
  formation: FormationId;
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

    // --- Main pause panel
    this.main = scene.add.container(0, 0);
    const g = scene.add.graphics();
    drawPanel(g, CX - 170, CY - 170, 340, 340);
    this.main.add(g);
    this.main.add(scene.add.text(CX, CY - 136, 'PAUSED', titleStyle(30)).setOrigin(0.5));

    const opts = { width: 220, height: 38, fontSize: 16 };
    const resume = new Button(scene, CX, CY - 80, 'RESUME', handlers.onResume, opts);
    const formation = new OptionSelector<FormationId>(
      scene, CX, CY - 32, 'FORMATION', FORMATION_IDS, Math.max(0, FORMATION_IDS.indexOf(handlers.formation)),
      (v) => v, handlers.onFormationChange, 300,
    );
    const restart = new Button(scene, CX, CY + 16, 'RESTART MATCH', handlers.onRestart, opts);
    const controls = new Button(scene, CX, CY + 64, 'CONTROLS', () => this.showControls(true), opts);
    const menu = new Button(scene, CX, CY + 112, 'MAIN MENU', handlers.onMainMenu, opts);
    const items = [resume, formation, restart, controls, menu];
    this.main.add(items);
    this.mainNav = new MenuNavigator(scene, items, handlers.onResume);

    // --- Controls view
    this.controls = scene.add.container(0, 0).setVisible(false);
    const top = 30;
    this.controls.add(createControlsPanel(scene, CX, top));
    const back = new Button(scene, CX, top + CONTROLS_PANEL_HEIGHT + 40, 'BACK', () => this.showControls(false), opts);
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
