// ============================================================
// HumanHud — The on-pitch hints for one human, drawn from the core
// HumanControl state: power bar, stamina bar, keeper countdown,
// pass-receiver and switch arrows, header / volley marker.
// ============================================================

import Phaser from 'phaser';
import { BALL, GOALKEEPER } from '../../core/config/GameplayConfig';
import type { Player } from '../../core/entities/Player';
import type { HumanControl } from '../../core/HumanControl';
import { predictAerialContact } from '../../core/logic/Aerial';
import type { MatchSimulation } from '../../core/MatchSimulation';
import { pixelStroke, textStyle } from '../ui/Theme';

export class HumanHud {
  /** Countdown above our keeper while he holds the ball. */
  private readonly keeperTimer: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    private readonly sim: MatchSimulation,
    readonly human: HumanControl,
  ) {
    this.keeperTimer = scene.add.text(0, 0, '', {
      ...textStyle(11, '#ffffff', true),
      stroke: '#000000',
      strokeThickness: pixelStroke(11),
    }).setOrigin(0.5, 1).setDepth(61).setVisible(false);
  }

  draw(g: Phaser.GameObjects.Graphics): void {
    this.keeperTimer.setVisible(false);
    const h = this.human;
    const p = h.controlled;
    if (!p) return;
    const x = Math.round(p.x);
    const y = Math.round(p.y);

    // Countdown to the keeper's automatic kick
    if (p.role === 'goalkeeper' && p.hasBall) {
      const left = Math.max(0, GOALKEEPER.humanHoldMax - p.possessionTime);
      const k = left / GOALKEEPER.humanHoldMax;
      const color = k > 0.5 ? 0x66ff66 : k > 0.25 ? 0xffdd33 : 0xff4433;
      // Drawn above the power bar so both stay visible while charging a kick
      g.fillStyle(0x000000, 0.7);
      g.fillRect(x - 13, y - 30, 26, 5);
      g.fillStyle(color, 1);
      g.fillRect(x - 12, y - 29, Math.round(24 * k), 3);
      this.keeperTimer
        .setText((left / 1000).toFixed(1))
        .setColor(`#${color.toString(16).padStart(6, '0')}`)
        .setPosition(x, y - 31)
        .setVisible(true);
    }

    // Stamina bar under the controlled player
    if (p.stamina < 0.99) {
      g.fillStyle(0x000000, 0.6);
      g.fillRect(x - 9, y + 15, 18, 4);
      g.fillStyle(p.stamina > 0.3 ? 0x44dd66 : 0xff5544, 1);
      g.fillRect(x - 8, y + 16, Math.round(16 * p.stamina), 2);
    }

    // Power bar while charging
    if (h.chargeKind !== null && p.hasBall) {
      const k = Phaser.Math.Clamp(h.chargeMs / BALL.maxChargeMs, 0, 1);
      const color = k < 0.5 ? 0x66ff66 : k < 0.8 ? 0xffdd33 : 0xff4433;
      g.fillStyle(0x000000, 0.7);
      g.fillRect(x - 13, y - 22, 26, 6);
      g.fillStyle(color, 1);
      g.fillRect(x - 12, y - 21, Math.round(24 * k), 4);
    }

    if (this.sim.state === 'playing') {
      if (p.hasBall) {
        // Yellow hint: who a pass would go to (follows the held direction;
        // none with manual passes, which have no receiver)
        const t = h.options.passAssist === 'auto' ? this.sim.actions.passTarget(p, h.heldDir.x, h.heldDir.y) : null;
        if (t) drawHintArrow(g, t, 0xffe14d);
      } else {
        // Blue hint: who a switch would select
        const t = h.switchTarget(false, h.heldDir.x, h.heldDir.y);
        if (t && t !== p) drawHintArrow(g, t, 0x7fd8ff);
        // Header / volley chance: a small marker above the head (cyan header,
        // green volley; white once D or S was pressed for it)
        const ball = this.sim.ball;
        const contact = ball.isFree && p.role !== 'goalkeeper' ? predictAerialContact(ball, p) : null;
        if (contact || h.pendingAerial) {
          const color = h.pendingAerial ? 0xffffff : contact?.zone === 'header' ? 0x5fe0ff : 0x7dff6a;
          g.fillStyle(0x000000, 0.8);
          g.fillTriangle(x - 5, y - 26, x + 5, y - 26, x, y - 33);
          g.fillStyle(color, 1);
          g.fillTriangle(x - 3, y - 27, x + 3, y - 27, x, y - 31);
        }
      }
    }
  }

  destroy(): void {
    this.keeperTimer.destroy();
  }
}

/** Small down-pointing pixel arrow with a dark outline above a player. */
function drawHintArrow(g: Phaser.GameObjects.Graphics, target: Player, color: number): void {
  const tx = Math.round(target.x);
  const ty = Math.round(target.y) - 17;
  g.fillStyle(0x0b0f1c, 0.9);
  g.fillRect(tx - 4, ty - 1, 9, 2);
  g.fillRect(tx - 3, ty + 1, 7, 2);
  g.fillRect(tx - 2, ty + 3, 5, 2);
  g.fillRect(tx - 1, ty + 5, 3, 1);
  g.fillStyle(color, 1);
  g.fillRect(tx - 3, ty, 7, 1);
  g.fillRect(tx - 2, ty + 1, 5, 2);
  g.fillRect(tx - 1, ty + 3, 3, 1);
  g.fillRect(tx, ty + 4, 1, 1);
}
