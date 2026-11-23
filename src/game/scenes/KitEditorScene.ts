// ============================================================
// KitEditorScene — Change any team's kit colours (shirt, stripe,
// shorts, socks, goalkeeper) from a palette, with a live preview.
// Saved per team in settings.kits; used everywhere (team cards,
// matches, HUD colours).
// ============================================================

import Phaser from 'phaser';
import { AssetGenerator } from '../assets/AssetGenerator';
import { GAME_WIDTH, GAME_HEIGHT, KIT_PALETTE, TEAMS } from '../config/GameplayConfig';
import { saveSettings, settings } from '../config/Settings';
import { KitField, baseTeam, teamWithKits } from '../config/Teams';
import { t } from '../config/i18n';
import { soundManager } from '../systems/SoundManager';
import { Button } from '../ui/Button';
import { MenuNavigator } from '../ui/MenuNavigator';
import { OptionSelector } from '../ui/OptionSelector';
import { UI, drawPanel, textStyle, titleStyle } from '../ui/Theme';

export class KitEditorScene extends Phaser.Scene {
  private teamId = TEAMS[0].id;

  constructor() {
    super({ key: 'KitEditorScene' });
  }

  init(data?: { team?: string }): void {
    if (data?.team && TEAMS.some((tm) => tm.id === data.team)) this.teamId = data.team;
  }

  create(data?: { focus?: number }): void {
    soundManager.playMusic('menu');
    const s = t();
    const bg = this.add.graphics();
    bg.fillStyle(UI.background, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.add.text(GAME_WIDTH / 2, 40, s.kits, titleStyle(30)).setOrigin(0.5);

    // Preview on the left
    const px = 200;
    const panel = this.add.graphics();
    const team = () => teamWithKits(this.teamId, settings.kits);
    const player = this.add.sprite(px - 30, 215, `kit_${this.teamId}`, 0).setScale(6);
    const keeper = this.add.sprite(px + 55, 230, `kit_gk_${this.teamId}`, 0).setScale(4);
    const name = this.add.text(px, 315, '', textStyle(16, UI.text, true)).setOrigin(0.5);
    const refreshPreview = () => {
      AssetGenerator.generateTeamKit(this, this.teamId);
      // The textures were replaced: point the sprites at the new ones
      player.setTexture(`kit_${this.teamId}`, 0);
      keeper.setTexture(`kit_gk_${this.teamId}`, 0);
      panel.clear();
      drawPanel(panel, px - 130, 110, 260, 230, 0x22365a, team().uiColor);
      name.setText(team().name.toUpperCase()).setColor(`#${team().textColor.toString(16).padStart(6, '0')}`);
    };

    // Rows on the right
    const rx = 620;
    const teamRow = new OptionSelector<string>(
      this, rx, 120, s.kitTeam, TEAMS.map((tm) => tm.id), Math.max(0, TEAMS.findIndex((tm) => tm.id === this.teamId)),
      (id) => baseTeam(id).shortName, // the full name is under the preview
      (id) => this.scene.restart({ team: id, focus: 0 }),
      440,
    );

    const fields: Array<[KitField, string]> = [
      ['primaryColor', s.kitShirt],
      ['secondaryColor', s.kitStripe],
      ['shortsColor', s.kitShorts],
      ['sockColor', s.kitSocks],
      ['goalkeeperColor', s.kitKeeper],
    ];
    const rows = fields.map(([field, label], i) => {
      // The team's own default colour first, then the palette
      const def = baseTeam(this.teamId)[field];
      const options = [def, ...KIT_PALETTE.map((c) => c.color).filter((c) => c !== def)];
      const current = team()[field];
      return new OptionSelector<number>(
        this, rx, 175 + i * 45, label, options, Math.max(0, options.indexOf(current)),
        () => '',
        (color) => {
          const kit = { ...(settings.kits[this.teamId] ?? {}) };
          if (color === def) delete kit[field];
          else kit[field] = color;
          if (Object.keys(kit).length > 0) settings.kits[this.teamId] = kit;
          else delete settings.kits[this.teamId];
          saveSettings();
          refreshPreview();
        },
        440,
        (color) => color,
      );
    });

    const reset = new Button(this, rx, 415, s.kitReset, () => {
      delete settings.kits[this.teamId];
      saveSettings();
      AssetGenerator.generateTeamKit(this, this.teamId);
      this.scene.restart({ team: this.teamId, focus: 6 });
    }, { width: 300, height: 34, fontSize: 15 });

    this.add.text(GAME_WIDTH / 2, 452, s.settingsSaved, textStyle(11, UI.textMuted)).setOrigin(0.5);

    const back = () => this.scene.start('MenuScene');
    const backBtn = new Button(this, GAME_WIDTH / 2, GAME_HEIGHT - 50, s.back, back, { width: 160, height: 34, fontSize: 16 });
    new MenuNavigator(this, [teamRow, ...rows, reset, backBtn], back).activate(data?.focus ?? 0);
    refreshPreview();
  }
}
