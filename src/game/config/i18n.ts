// ============================================================
// i18n — UI strings in Polish and English. The language lives in
// settings.language (default from the browser, switchable in SETTINGS).
// Team names and the RETRO GAŁA logo are not translated.
// ============================================================

import type { Difficulty, FormationId, GameSpeed, StadiumId } from './GameplayConfig';
import type { TournamentKind } from '../logic/Tournament';
import { settings, type AssistMode, type Language, type TwoPlayerMode } from './Settings';

export interface Strings {
  /** Browser tab title. */
  pageTitle: string;
  // Main menu
  play: string;
  twoPlayers: string;
  controls: string;
  settings: string;
  kits: string;
  kitTeam: string;
  kitShirt: string;
  kitStripe: string;
  kitShorts: string;
  kitSocks: string;
  kitKeeper: string;
  kitReset: string;
  menuHint: string;
  menuFooter: string;
  // Match setup
  quickMatch: string;
  yourTeam: string;
  opponent: string;
  player1: string;
  player2: string;
  matchLength: string;
  difficulty: string;
  formation: string;
  playerFormation: (n: number) => string;
  twoPlayerMode: string;
  twoPlayerModeValue: (m: TwoPlayerMode) => string;
  coopTeam: string;
  formationValue: (f: FormationId) => string;
  difficultyName: (d: Difficulty) => string;
  padsTwo: string;
  padsOne: string;
  padsNone: string;
  kickOffButton: string;
  back: string;
  setupHint: string;
  // Settings
  sound: string;
  music: string;
  on: string;
  off: string;
  volume: string;
  language: string;
  fullscreen: string;
  exitFullscreen: string;
  settingsSaved: string;
  // Controls reference
  colKeyboard: string;
  colPad: string;
  secMovement: string;
  secWithBall: string;
  secWithoutBall: string;
  secMatch: string;
  keyArrows: string;
  keyHold: (key: string) => string;
  keyWithArrow: (key: string) => string;
  padWithStick: (button: string) => string;
  actMove: string;
  actSprint: string;
  actSwitchToward: string;
  actPass: string;
  actShoot: string;
  actAim: string;
  actLob: string;
  actTackle: string;
  actSwitchBest: string;
  actAerial: string;
  actPause: string;
  actMute: string;
  // Pause menu
  paused: string;
  resume: string;
  restartMatch: string;
  mainMenu: string;
  // In-match
  kickOffBanner: string;
  secondHalf: string;
  stadiumName: (s: StadiumId) => string;
  halfTime: string;
  goal: string;
  ownGoal: (team: string) => string;
  fullTime: string;
  youWin: string;
  youLose: string;
  draw: string;
  playerWins: (n: number, team: string) => string;
  teamWins: (team: string) => string;
  statPossession: string;
  statShots: string;
  statOnTarget: string;
  statPasses: string;
  statTackles: string;
  rematch: string;
  hudMuted: string;
  hudCpu: (d: Difficulty) => string;
  hudHalf: (half: number) => string;
  hudExtraTime: string;
  // Tournament
  tournament: string;
  continueTournament: string;
  tournamentKind: string;
  kindName: (k: TournamentKind) => string;
  slotValue: (v: 'human' | 'cpu' | 'out') => string;
  startTournament: string;
  tooFewTeams: string;
  replacesSaved: string;
  trophies: (league: number, cup: number) => string;
  matchday: (n: number, total: number) => string;
  cupRound: (roundsLeft: number) => string;
  bye: string;
  nextMatch: string;
  watch: string;
  skip: string;
  champion: (k: TournamentKind, team: string) => string;
  newTournament: string;
  tableHeaders: [string, string, string, string, string, string, string, string];
  lastResults: string;
  afterExtraTimeShort: string;
  extraTime: string;
  goldenGoal: string;
  nextGoalWins: string;
  continueButton: string;
  // Game settings
  gameSpeed: string;
  gameSpeedName: (v: GameSpeed) => string;
  passAssist: string;
  lobAssist: string;
  assistName: (v: AssistMode) => string;
}

const EN: Strings = {
  pageTitle: 'RetroFootball',
  play: 'PLAY',
  twoPlayers: '2 PLAYERS',
  controls: 'CONTROLS',
  settings: 'SETTINGS',
  kits: 'KITS',
  kitTeam: 'TEAM',
  kitShirt: 'SHIRT',
  kitStripe: 'STRIPE',
  kitShorts: 'SHORTS',
  kitSocks: 'SOCKS',
  kitKeeper: 'GOALKEEPER',
  kitReset: 'RESET TO DEFAULT',
  menuHint: '↑↓ choose   ENTER select',
  menuFooter: 'QUICK MATCH  •  6 v 6',
  quickMatch: 'QUICK MATCH',
  yourTeam: 'YOUR TEAM',
  opponent: 'OPPONENT',
  player1: 'PLAYER 1',
  player2: 'PLAYER 2',
  matchLength: 'MATCH LENGTH',
  difficulty: 'DIFFICULTY',
  formation: 'FORMATION',
  playerFormation: (n) => `P${n} FORMATION`,
  twoPlayerMode: 'MODE',
  twoPlayerModeValue: (m) => (m === 'coop' ? 'CO-OP' : 'VERSUS'),
  coopTeam: 'P1 + P2',
  formationValue: (f) => (f === '2-3' ? '2-3 ATT' : '3-2 DEF'),
  difficultyName: (d) => d.toUpperCase(),
  padsTwo: 'P1: KEYBOARD + PAD 1   •   P2: PAD 2',
  padsOne: 'P1: KEYBOARD   •   P2: PAD 1',
  padsNone: 'P1: KEYBOARD   •   P2: CONNECT AN XBOX CONTROLLER AND PRESS ANY BUTTON',
  kickOffButton: 'KICK OFF!',
  back: 'BACK',
  setupHint: '←→ change   ↑↓ move   ENTER confirm   ESC back',
  sound: 'SOUND',
  music: 'MUSIC',
  on: 'ON',
  off: 'OFF',
  volume: 'VOLUME',
  language: 'LANGUAGE',
  fullscreen: 'FULLSCREEN',
  exitFullscreen: 'EXIT FULLSCREEN',
  settingsSaved: 'Settings are saved in this browser.',
  colKeyboard: 'KEYBOARD',
  colPad: 'XBOX PAD',
  secMovement: 'MOVEMENT',
  secWithBall: 'WITH THE BALL',
  secWithoutBall: 'WITHOUT THE BALL',
  secMatch: 'MATCH',
  keyArrows: 'ARROWS',
  keyHold: (k) => `${k} (hold)`,
  keyWithArrow: (k) => `${k} (+ARROW)`,
  padWithStick: (b) => `${b} (+STICK)`,
  actMove: 'Move (8 directions)',
  actSprint: 'Sprint (uses stamina)',
  actSwitchToward: 'Switch player, no ball (to arrow)',
  actPass: 'Pass — longer hold = faster',
  actShoot: 'Shoot — hold longer for power',
  actAim: 'Aim at top / bottom corner',
  actLob: 'Lob toward arrow — hold = further',
  actTackle: 'Tackle',
  actSwitchBest: 'Switch to best-placed player',
  actAerial: 'Header / volley (ball in the air)',
  actPause: 'Pause',
  actMute: 'Mute sound',
  paused: 'PAUSED',
  resume: 'RESUME',
  restartMatch: 'RESTART MATCH',
  mainMenu: 'MAIN MENU',
  kickOffBanner: 'KICK OFF',
  secondHalf: 'SECOND HALF',
  stadiumName: (s) => (s === 'narodowy' ? 'NATIONAL STADIUM' : 'HOUSING ESTATE'),
  halfTime: 'HALF TIME',
  goal: 'GOOOAL!',
  ownGoal: (team) => `OWN GOAL — ${team}`,
  fullTime: 'FULL TIME',
  youWin: 'YOU WIN!',
  youLose: 'YOU LOSE',
  draw: 'DRAW',
  playerWins: (n, team) => `P${n} WINS — ${team.toUpperCase()}`,
  teamWins: (team) => `${team} WIN`,
  statPossession: 'POSSESSION',
  statShots: 'SHOTS',
  statOnTarget: 'ON TARGET',
  statPasses: 'PASSES',
  statTackles: 'TACKLES WON',
  rematch: 'REMATCH',
  hudMuted: 'SOUND OFF (M)',
  hudCpu: (d) => `CPU: ${d.toUpperCase()}`,
  hudHalf: (h) => (h === 1 ? '1ST' : '2ND'),
  hudExtraTime: 'ET',
  tournament: 'TOURNAMENT',
  continueTournament: 'CONTINUE',
  tournamentKind: 'TYPE',
  kindName: (k) => (k === 'league' ? 'LEAGUE' : 'CUP'),
  slotValue: (v) => (v === 'human' ? 'PLAYER' : v === 'cpu' ? 'CPU' : 'OUT'),
  startTournament: 'START',
  tooFewTeams: 'PICK AT LEAST 3 TEAMS',
  replacesSaved: 'A NEW TOURNAMENT REPLACES THE SAVED ONE',
  trophies: (l, c) => `TROPHIES   LEAGUES: ${l}   •   CUPS: ${c}`,
  matchday: (n, total) => `MATCHDAY ${n}/${total}`,
  cupRound: (left) => (left <= 1 ? 'FINAL' : left === 2 ? 'SEMI-FINALS' : 'QUARTER-FINALS'),
  bye: 'BYE',
  nextMatch: 'NEXT MATCH',
  watch: 'WATCH',
  skip: 'SKIP',
  champion: (k, team) => (k === 'league' ? `CHAMPIONS: ${team}` : `CUP WINNERS: ${team}`),
  newTournament: 'NEW TOURNAMENT',
  tableHeaders: ['#', 'TEAM', 'P', 'W', 'D', 'L', 'GOALS', 'PTS'],
  lastResults: 'RESULTS',
  afterExtraTimeShort: 'AET',
  extraTime: 'EXTRA TIME',
  goldenGoal: 'GOLDEN GOAL',
  nextGoalWins: 'NEXT GOAL WINS',
  continueButton: 'CONTINUE',
  gameSpeed: 'GAME SPEED',
  gameSpeedName: (v) => (v === 'slow' ? 'SLOW' : v === 'fast' ? 'FAST' : 'NORMAL'),
  passAssist: 'PASSES',
  lobAssist: 'LOB',
  assistName: (v) => (v === 'auto' ? 'AUTO' : 'MANUAL'),
};

const PL_DIFFICULTY: Record<Difficulty, string> = { easy: 'ŁATWY', normal: 'NORMALNY', hard: 'TRUDNY' };

const PL: Strings = {
  pageTitle: 'Retro Gała',
  play: 'GRAJ',
  twoPlayers: '2 GRACZY',
  controls: 'STEROWANIE',
  settings: 'USTAWIENIA',
  kits: 'STROJE',
  kitTeam: 'DRUŻYNA',
  kitShirt: 'KOSZULKA',
  kitStripe: 'PAS',
  kitShorts: 'SPODENKI',
  kitSocks: 'GETRY',
  kitKeeper: 'BRAMKARZ',
  kitReset: 'PRZYWRÓĆ DOMYŚLNE',
  menuHint: '↑↓ wybór   ENTER zatwierdź',
  menuFooter: 'SZYBKI MECZ  •  6 na 6',
  quickMatch: 'SZYBKI MECZ',
  yourTeam: 'TWOJA DRUŻYNA',
  opponent: 'PRZECIWNIK',
  player1: 'GRACZ 1',
  player2: 'GRACZ 2',
  matchLength: 'DŁUGOŚĆ MECZU',
  difficulty: 'TRUDNOŚĆ',
  formation: 'FORMACJA',
  playerFormation: (n) => `FORMACJA P${n}`,
  twoPlayerMode: 'TRYB',
  twoPlayerModeValue: (m) => (m === 'coop' ? 'RAZEM' : 'RYWALE'),
  coopTeam: 'P1 + P2',
  formationValue: (f) => (f === '2-3' ? '2-3 ATAK' : '3-2 OBRONA'),
  difficultyName: (d) => PL_DIFFICULTY[d],
  padsTwo: 'P1: KLAWIATURA + PAD 1   •   P2: PAD 2',
  padsOne: 'P1: KLAWIATURA   •   P2: PAD 1',
  padsNone: 'P1: KLAWIATURA   •   P2: PODŁĄCZ PAD XBOX I NACIŚNIJ DOWOLNY PRZYCISK',
  kickOffButton: 'HARATAJMY!',
  back: 'WSTECZ',
  setupHint: '←→ zmiana   ↑↓ ruch   ENTER zatwierdź   ESC wstecz',
  sound: 'DŹWIĘK',
  music: 'MUZYKA',
  on: 'WŁ.',
  off: 'WYŁ.',
  volume: 'GŁOŚNOŚĆ',
  language: 'JĘZYK',
  fullscreen: 'PEŁNY EKRAN',
  exitFullscreen: 'WYJDŹ Z PEŁNEGO EKRANU',
  settingsSaved: 'Ustawienia są zapisywane w tej przeglądarce.',
  colKeyboard: 'KLAWIATURA',
  colPad: 'PAD XBOX',
  secMovement: 'RUCH',
  secWithBall: 'Z PIŁKĄ',
  secWithoutBall: 'BEZ PIŁKI',
  secMatch: 'MECZ',
  keyArrows: 'STRZAŁKI',
  keyHold: (k) => `${k} (przytrzymaj)`,
  keyWithArrow: (k) => `${k} (+STRZAŁKA)`,
  padWithStick: (b) => `${b} (+GAŁKA)`,
  actMove: 'Ruch (8 kierunków)',
  actSprint: 'Sprint (zużywa kondycję)',
  actSwitchToward: 'Zmiana zawodnika bez piłki (wg strzałki)',
  actPass: 'Podanie — dłużej = mocniej',
  actShoot: 'Strzał — dłużej = mocniej',
  actAim: 'Celuj w górny / dolny róg',
  actLob: 'Lob za strzałką — dłużej = dalej',
  actTackle: 'Wślizg',
  actSwitchBest: 'Zmiana na najlepiej ustawionego',
  actAerial: 'Główka / wolej (piłka w górze)',
  actPause: 'Pauza',
  actMute: 'Wycisz dźwięk',
  paused: 'PAUZA',
  resume: 'WZNÓW',
  restartMatch: 'RESTART MECZU',
  mainMenu: 'MENU GŁÓWNE',
  kickOffBanner: 'HARATAJMY!',
  secondHalf: 'DRUGA POŁOWA',
  stadiumName: (s) => (s === 'narodowy' ? 'STADION NARODOWY' : 'BLOKOWISKO'),
  halfTime: 'PRZERWA',
  goal: 'GOOOL!',
  ownGoal: (team) => `SAMOBÓJ — ${team}`,
  fullTime: 'KONIEC MECZU',
  youWin: 'WYGRANA!',
  youLose: 'PORAŻKA',
  draw: 'REMIS',
  playerWins: (n, team) => `WYGRYWA P${n} — ${team.toUpperCase()}`,
  teamWins: (team) => `WYGRYWAJĄ ${team}`,
  statPossession: 'POSIADANIE',
  statShots: 'STRZAŁY',
  statOnTarget: 'CELNE',
  statPasses: 'PODANIA',
  statTackles: 'ODBIORY',
  rematch: 'REWANŻ',
  hudMuted: 'WYCISZONO (M)',
  hudCpu: (d) => `CPU: ${PL_DIFFICULTY[d]}`,
  hudHalf: (h) => (h === 1 ? '1 POŁ.' : '2 POŁ.'),
  hudExtraTime: 'DOGR.',
  tournament: 'TURNIEJ',
  continueTournament: 'KONTYNUUJ',
  tournamentKind: 'RODZAJ',
  kindName: (k) => (k === 'league' ? 'LIGA' : 'PUCHAR'),
  slotValue: (v) => (v === 'human' ? 'GRACZ' : v === 'cpu' ? 'CPU' : 'NIE GRA'),
  startTournament: 'ROZPOCZNIJ',
  tooFewTeams: 'WYBIERZ CO NAJMNIEJ 3 DRUŻYNY',
  replacesSaved: 'NOWY TURNIEJ ZASTĄPI ZAPISANY',
  trophies: (l, c) => `TROFEA   LIGI: ${l}   •   PUCHARY: ${c}`,
  matchday: (n, total) => `KOLEJKA ${n}/${total}`,
  cupRound: (left) => (left <= 1 ? 'FINAŁ' : left === 2 ? 'PÓŁFINAŁY' : 'ĆWIERĆFINAŁY'),
  bye: 'WOLNY LOS',
  nextMatch: 'NASTĘPNY MECZ',
  watch: 'OGLĄDAJ',
  skip: 'POMIŃ',
  champion: (k, team) => (k === 'league' ? `MISTRZ LIGI: ${team}` : `ZDOBYWCA PUCHARU: ${team}`),
  newTournament: 'NOWY TURNIEJ',
  tableHeaders: ['#', 'DRUŻYNA', 'M', 'Z', 'R', 'P', 'BRAMKI', 'PKT'],
  lastResults: 'WYNIKI',
  afterExtraTimeShort: 'DOGR.',
  extraTime: 'DOGRYWKA',
  goldenGoal: 'ZŁOTY GOL',
  nextGoalWins: 'NASTĘPNY GOL WYGRYWA',
  continueButton: 'DALEJ',
  gameSpeed: 'PRĘDKOŚĆ GRY',
  gameSpeedName: (v) => (v === 'slow' ? 'WOLNA' : v === 'fast' ? 'SZYBKA' : 'NORMALNA'),
  passAssist: 'PODANIA',
  lobAssist: 'LOB',
  assistName: (v) => (v === 'auto' ? 'AUTO' : 'RĘCZNE'),
};

export const STRINGS: Record<Language, Strings> = { pl: PL, en: EN };

/** Strings in the current language (read at the time a text is created). */
export function t(): Strings {
  return STRINGS[settings.language];
}

/** Sets the browser tab title and the page's lang attribute to the current language. */
export function applyPageLanguage(): void {
  if (typeof document === 'undefined') return;
  document.title = t().pageTitle;
  document.documentElement.lang = settings.language;
}
