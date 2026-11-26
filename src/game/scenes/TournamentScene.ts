// ============================================================
// TournamentScene — The saved tournament: league table (with the
// current matchday's results) or cup bracket, the next match and
// what to do with it. A match with a person in it is played (vs the
// CPU like Quick Match; person vs person like 2 PLAYERS, P1 = home).
// A CPU-vs-CPU match can be watched or skipped (random result).
// ============================================================

import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../core/config/GameplayConfig';
import { t } from '../config/i18n';
import { teamWithKits } from '../config/Teams';
import { settings } from '../config/Settings';
import { loadTournament, recordAndSave } from '../config/TournamentStore';
import {
  Fixture, fixtureWinner, humanNumbers, nextFixtureIndex, recordResult, roundsLeft, simulateResult, standings,
  Tournament,
} from '../../core/logic/Tournament';
import { soundManager } from '../systems/SoundManager';
import { Button } from '../ui/Button';
import { MenuNavigator } from '../ui/MenuNavigator';
import { UI, drawPanel, hexColor, textStyle, titleStyle } from '../ui/Theme';
import type { MatchSceneData } from './MatchScene';

export class TournamentScene extends Phaser.Scene {
  private tour!: Tournament;
  /** Player number per team (0 = CPU). */
  private humanNo: number[] = [];

  constructor() {
    super({ key: 'TournamentScene' });
  }

  create(): void {
    soundManager.playMusic('menu');
    const bg = this.add.graphics();
    bg.fillStyle(UI.background, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const tour = loadTournament();
    if (!tour) {
      this.scene.start('MenuScene');
      return;
    }
    this.tour = tour;
    this.humanNo = humanNumbers(tour);

    this.add.text(GAME_WIDTH / 2, 26, t().kindName(tour.kind), titleStyle(30)).setOrigin(0.5);
    if (tour.kind === 'league') this.drawLeague();
    else this.drawCup();
    this.drawNext();
  }

  private name(team: number): string {
    return teamWithKits(this.tour.teams[team].id, settings.kits).name.toUpperCase();
  }

  private shortName(team: number): string {
    return teamWithKits(this.tour.teams[team].id, settings.kits).shortName;
  }

  private colorOf(team: number): string {
    return hexColor(teamWithKits(this.tour.teams[team].id, settings.kits).textColor);
  }

  /** "P1" for a person's team, "CPU" otherwise. */
  private tag(team: number): string {
    return this.humanNo[team] ? `P${this.humanNo[team]}` : 'CPU';
  }

  // ============================================================== league

  private drawLeague(): void {
    const table = standings(this.tour);
    const g = this.add.graphics();
    const left = 24;
    const top = 56;
    drawPanel(g, left, top, 600, 36 + table.length * 26);
    const cols = [44, 76, 356, 396, 436, 476, 530, 594];
    const headers = t().tableHeaders;
    headers.forEach((h, i) => {
      this.add.text(cols[i], top + 16, h, textStyle(10, UI.textMuted, true)).setOrigin(i === 1 ? 0 : 0.5, 0.5);
    });
    table.forEach((row, k) => {
      const y = top + 44 + k * 26;
      const human = this.humanNo[row.team] > 0;
      const color = human ? UI.textHighlight : UI.text;
      const cells = [
        `${k + 1}`, this.name(row.team), `${row.played}`, `${row.won}`, `${row.drawn}`, `${row.lost}`,
        `${row.goalsFor}:${row.goalsAgainst}`, `${row.points}`,
      ];
      cells.forEach((c, i) => {
        const text = this.add.text(cols[i], y, c, textStyle(i === 1 ? 20 : 10, i === 1 ? this.colorOf(row.team) : color, true))
          .setOrigin(i === 1 ? 0 : 0.5, 0.5);
        if (i === 1 && human) {
          this.add.text(text.x + text.width + 6, y, this.tag(row.team), textStyle(10, UI.textHighlight, true))
            .setOrigin(0, 0.5);
        }
      });
    });

    // Right: the matchday in progress (or the last one), with results so far
    const next = nextFixtureIndex(this.tour);
    const round = next >= 0 ? this.tour.fixtures[next].round : this.tour.rounds - 1;
    const fixtures = this.tour.fixtures.filter((f) => f.round === round);
    const px = 644;
    drawPanel(g, px, top, 292, 36 + Math.max(3, fixtures.length) * 30);
    this.add.text(px + 146, top + 16, t().matchday(round + 1, this.tour.rounds), textStyle(10, UI.textMuted, true))
      .setOrigin(0.5);
    fixtures.forEach((f, k) => this.drawFixtureLine(f, px + 146, top + 46 + k * 30));
  }

  /** "ORŁ  2 - 1  BOC" centred at x (score "-" when not played yet). */
  private drawFixtureLine(f: Fixture, x: number, y: number): void {
    const away = f.away!;
    const score = f.score ? `${f.score[0]} - ${f.score[1]}` : '-';
    this.add.text(x - 40, y, this.shortName(f.home), textStyle(20, this.colorOf(f.home), true)).setOrigin(1, 0.5);
    this.add.text(x, y, score, textStyle(20, f.score ? UI.text : UI.textMuted, true)).setOrigin(0.5);
    this.add.text(x + 40, y, this.shortName(away), textStyle(20, this.colorOf(away), true)).setOrigin(0, 0.5);
  }

  // ================================================================= cup

  private drawCup(): void {
    const tour = this.tour;
    const g = this.add.graphics();
    const top = 64;
    const bottom = 370;
    const colW = (GAME_WIDTH - 48) / tour.rounds;
    for (let r = 0; r < tour.rounds; r++) {
      const x = 24 + colW * r + colW / 2;
      this.add.text(x, top, t().cupRound(roundsLeft(tour, r)), textStyle(10, UI.textMuted, true)).setOrigin(0.5);
      const boxes = 2 ** (tour.rounds - 1 - r);
      const fixtures = tour.fixtures.filter((f) => f.round === r);
      const slotH = (bottom - top - 16) / boxes;
      for (let k = 0; k < boxes; k++) {
        const y = top + 16 + slotH * k + slotH / 2;
        this.drawCupBox(g, x, y, Math.min(260, colW - 20), fixtures[k]);
      }
    }
  }

  private drawCupBox(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, f: Fixture | undefined): void {
    const h = 56;
    drawPanel(g, x - w / 2, y - h / 2, w, h, UI.panel, f && !f.score && f.away !== null ? 0xffcc00 : UI.panelBorder);
    if (!f) {
      this.add.text(x, y, '?', textStyle(20, UI.textMuted, true)).setOrigin(0.5);
      return;
    }
    const winner = fixtureWinner(f);
    const line = (team: number | null, goals: string, dy: number) => {
      const lost = winner !== null && team !== winner;
      const label = team === null ? t().bye : this.name(team);
      const color = team === null || lost ? UI.textMuted : this.colorOf(team);
      this.add.text(x - w / 2 + 10, y + dy, label, textStyle(team === null ? 10 : 20, color, true)).setOrigin(0, 0.5);
      if (goals) this.add.text(x + w / 2 - 10, y + dy, goals, textStyle(20, lost ? UI.textMuted : UI.text, true)).setOrigin(1, 0.5);
    };
    line(f.home, f.score ? `${f.score[0]}` : '', -13);
    line(f.away, f.score ? `${f.score[1]}` : '', 13);
    if (f.extraTime) {
      this.add.text(x + w / 2 - 34, y, t().afterExtraTimeShort, textStyle(10, UI.textMuted, true)).setOrigin(1, 0.5);
    }
  }

  // ======================================================== next match

  private drawNext(): void {
    const tour = this.tour;
    const cx = GAME_WIDTH / 2;
    const index = nextFixtureIndex(tour);
    const back = () => this.scene.start('MenuScene');
    let buttons: Button[];

    if (index < 0) {
      // Finished: the champion
      const champ = tour.champion!;
      this.add.text(cx, 412, t().champion(tour.kind, this.name(champ)), titleStyle(20)).setOrigin(0.5);
      if (tour.teams[champ].human) soundManager.jingle('win');
      buttons = [
        new Button(this, cx - 110, 470, t().newTournament, () => this.scene.start('TournamentSetupScene'), { width: 200 }),
        new Button(this, cx + 110, 470, t().mainMenu, back, { width: 200 }),
      ];
    } else {
      const f = tour.fixtures[index];
      const away = f.away!;
      const stage = tour.kind === 'league'
        ? t().matchday(f.round + 1, tour.rounds)
        : t().cupRound(roundsLeft(tour, f.round));
      this.add.text(cx, 396, `${t().nextMatch}  •  ${stage}`, textStyle(10, UI.textMuted, true)).setOrigin(0.5);
      const line = `${this.name(f.home)} (${this.tag(f.home)})   -   ${this.name(away)} (${this.tag(away)})`;
      this.add.text(cx, 422, line, textStyle(20, UI.text, true)).setOrigin(0.5);

      const humanSides = [f.home, away].map((team, side) => (tour.teams[team].human ? side : -1)).filter((s) => s >= 0);
      const play = (sides: number[]) => {
        const data: MatchSceneData = {
          tournament: {
            fixture: index, home: tour.teams[f.home].id, away: tour.teams[away].id, humanSides: sides, cup: tour.kind === 'cup',
          },
        };
        this.scene.start('MatchScene', data);
      };
      if (humanSides.length > 0) {
        buttons = [
          new Button(this, cx - 110, 470, t().play, () => play(humanSides), {
            width: 200, color: 0x2a8a4a, focusColor: 0x3fb066,
          }),
          new Button(this, cx + 110, 470, t().mainMenu, back, { width: 200 }),
        ];
      } else {
        buttons = [
          new Button(this, cx - 220, 470, t().watch, () => play([]), { width: 200 }),
          new Button(this, cx, 470, t().skip, () => this.skip(index), { width: 200, color: 0x2a8a4a, focusColor: 0x3fb066 }),
          new Button(this, cx + 220, 470, t().mainMenu, back, { width: 200 }),
        ];
      }
    }

    const nav = new MenuNavigator(this, buttons, back);
    // The buttons sit in a row: Left/Right move between them too
    buttons.forEach((b, i) => {
      b.left = () => nav.focus(i - 1);
      b.right = () => nav.focus(i + 1);
    });
    nav.activate(buttons.length === 3 ? 1 : 0);
    this.add.text(cx, GAME_HEIGHT - 16, t().menuHint, textStyle(11, UI.textMuted)).setOrigin(0.5);
  }

  /** CPU vs CPU without watching: a random result. */
  private skip(index: number): void {
    const r = simulateResult(Math.random, this.tour.kind === 'cup');
    recordAndSave(this.tour, (x) => recordResult(x, index, r.score, r.extraTime));
    this.scene.restart();
  }
}
