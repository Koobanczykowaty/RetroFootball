// ============================================================
// RetroFootball — Gameplay Configuration
// All tunable gameplay parameters live here for easy balancing.
// Speeds are in px/s, durations in ms unless stated otherwise.
// ============================================================

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
export const GAME_VERSION = '0.3.0';

// ---- Pitch ----
export const PITCH = {
  x: 80,
  y: 40,
  width: 800,
  height: 460,
  lineColor: 0xffffff,
  lineAlpha: 0.9,
  lineWidth: 2,
  grassColor1: 0x2d8a4e,
  grassColor2: 0x34a058,
  stripeWidth: 40,
  goalWidth: 120,
  goalDepth: 24,
  goalColor: 0xffffff,
  goalNetColor: 0xcccccc,
  penaltyAreaWidth: 220,
  penaltyAreaHeight: 140,
  goalAreaWidth: 130,
  goalAreaHeight: 70,
  centerCircleRadius: 55,
  cornerArcRadius: 12,
  /** Ball higher than this (px) passes over the goal. */
  crossbarHeight: 22,
};

// ---- Headers and volleys ----
/**
 * Striking an airborne ball (logic/Aerial.ts). The human presses shoot (D)
 * or pass (S) while the ball is on its way; the player strikes it when it
 * arrives. The later the press (closer to the contact), the better the
 * timing quality, which sets power and accuracy.
 */
export const AERIAL = {
  /** Ball height (px) from which it is a volley (below = at the feet). */
  volleyMinZ: 9,
  /** From here on it is a header… */
  headerMinZ: 18,
  /** …up to here (higher flies over the player). */
  headerMaxZ: 34,
  /** Horizontal reach to the ball (px). */
  reach: 20,
  /** A press counts if the ball will be in reach within this time (s). */
  pressWindowSec: 0.45,
  /** Quality of a press at the very start of the window. */
  minQuality: 0.35,
  headerSpeedMin: 240,
  headerSpeedMax: 400,
  /** A header is pushed down (keeps it under the bar). */
  headerVz: -70,
  volleySpeedMin: 380,
  volleySpeedMax: 580,
  /** Upward speed of a volley at quality 0; badly timed volleys fly over. */
  volleyMissLift: 170,
  headerPassSpeed: 260,
  volleyPassSpeed: 330,
  volleyPassLift: 60,
};

// ---- Stadiums ----
/**
 * Where a match is played; picked at random for every match. Only the look
 * changes (pitch, surroundings, ball sprite); the geometry and physics are
 * the same everywhere.
 */
export const STADIUMS = ['narodowy', 'blokowisko'] as const;
export type StadiumId = (typeof STADIUMS)[number];

// ---- Player ----
export const PLAYER = {
  radius: 10,
  // Player movement speeds were reduced by 20% (was 135 / 205 / 270) at the user's request
  walkSpeed: 108,
  sprintSpeed: 164,
  /** Speed multiplier while dribbling. */
  dribbleSpeedFactor: 0.9,
  /** How fast velocity approaches the desired velocity (px/s²). */
  acceleration: 1000,
  deceleration: 1200,
  /** Stamina is 0..1. Drain/regen are per second. */
  sprintStaminaDrain: 0.3,
  staminaRegen: 0.18,
  minSprintStamina: 0.05,
  /** Players closer than this are pushed apart. */
  separationDistance: 15,
  /**
   * On contact, this fraction of the speed going into the other player is
   * turned into sideways movement, so players slide around each other.
   */
  contactSlide: 0.8,
  ballPickupRadius: 14,
  /** Distance of a carried ball in front of the player. */
  ballCarryOffset: 11,
  kickCooldown: 300,
  /** Short immunity from tackles right after winning the ball. */
  possessionProtect: 350,
  tackleRange: 20,
  tackleDuration: 220,
  tackleCooldown: 800,
  tackleDashSpeed: 216,
  tackleSuccess: 0.65,
  /** On a successful tackle: chance the tackler keeps the ball (otherwise it pops loose). */
  tackleWinBallChance: 0.55,
  stunDuration: 450,
  missStunDuration: 300,
  /** After a failed first touch the player cannot touch the ball for this long. */
  deflectBlock: 250,
  /**
   * After the human passes, the passer keeps joining the attack (runs ahead of
   * the ball) while his team has the ball, for at most this long (ms).
   */
  supportRunMax: 6000,
  /** How far ahead of the ball the supporting runner aims (px). */
  supportRunLead: 70,
  /**
   * A defender's support run stops this far past the halfway line (px), and
   * only one defender per team makes one at a time, so the back line is never
   * left empty.
   */
  defenderSupportRunLimit: 70,
};

// ---- Ball ----
export const BALL = {
  radius: 5,
  /** Ground friction multiplier per 1/60 s. */
  friction: 0.985,
  airFriction: 0.995,
  minSpeed: 3,
  maxSpeed: 580,
  bounceRestitution: 0.6,
  gravity: 520,
  groundBounce: 0.35,
  passBaseSpeed: 240,
  passDistanceFactor: 0.9,
  passSpeedMin: 300,
  passSpeedMax: 480,
  /**
   * Charged pass (human, hold S): power 0..1 scales the pass speed between
   * (1 - range) and (1 + range) of the normal speed; 0.5 = normal.
   */
  passPowerRange: 0.3,
  shootSpeedMin: 340,
  shootSpeedMax: 560,
  /** Holding a charged action key (pass / shoot / lob) this long fires at full power. */
  maxChargeMs: 350,
  /** Shots at or above this power are "power shots" (trail + shake). */
  powerShotThreshold: 0.8,
  lobLift: 200,
  lobSpeedMin: 170,
  lobSpeedMax: 360,
  /**
   * Human lob (hold A): no auto-target. It flies in the arrow (or facing)
   * direction and power 0..1 sets where it first lands, between these distances (px).
   */
  lobMinDistance: 90,
  lobMaxDistance: 380,
  /** A teammate within this distance of the landing spot becomes the receiver. */
  lobReceiveRadius: 110,
  /** Above this speed a first touch can fail. */
  controlSpeed: 330,
  controlChance: 0.45,
  receiverControlChance: 0.85,
  /** Field players can only touch the ball below this height. */
  playerReachHeight: 9,
  trailSpeed: 380,
};

// ---- Goalkeeper ----
export const GOALKEEPER = {
  reach: 22,
  reachHeight: 24,
  /** Shots slower than this are always caught. */
  catchSpeed: 330,
  /** How far in front of the goal line the keeper may go. */
  boxDepth: 70,
  /** How far above/below the goal mouth the keeper may go. */
  boxMarginY: 40,
  /** AI keeper holds the ball this long before distributing (ms). */
  holdTime: 700,
  /** Human-controlled keeper auto-kicks after holding the ball this long (ms). */
  humanHoldMax: 3500,
  diveDuration: 450,
  rushDistance: 75,
};

// ---- Match ----
export const MATCH = {
  /** Selectable real-time match lengths in minutes. */
  durationOptions: [2, 4, 6],
  defaultDuration: 4,
  /** The match clock runs from 0 to this many game minutes. */
  fullTimeMinutes: 90,
  goalCelebrationDuration: 2200,
  /** Slow motion right after a goal (real ms; the celebration follows it). */
  goalSlowMoMs: 1500,
  /** Game speed during the goal slow motion. */
  goalSlowMoScale: 0.3,
  /** Camera zoom on the goal during the slow motion. */
  goalSlowMoZoom: 1.6,
  kickoffDelay: 1200,
  halftimeDelay: 2500,
  /**
   * Cup matches drawn at full time: extra time of this many game minutes
   * (same clock speed as the match), then a golden goal (next goal wins).
   */
  extraTimeMinutes: 30,
};

// ---- AI ----
export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export interface AIProfile {
  /** How often off-ball players re-think their position (ms). */
  decisionInterval: number;
  /** Delay before a player who just got the ball makes a decision (ms). */
  reactionTime: number;
  /** Tackle attempts per second while in range. */
  tackleRate: number;
  /** Chance to pass when under pressure. */
  passChance: number;
  shootRange: number;
  /** 0..1, higher = more accurate shots. */
  shotAccuracy: number;
  gkSaveChance: number;
  /** Delay before the keeper starts reacting to a new kick toward his goal (ms). */
  gkReactionMs: number;
  /** Chance that a tackle by this team wins the ball. */
  tackleSuccess: number;
  speedFactor: number;
  /**
   * Feints (dribbling direction changes). A pressing defender only re-reads
   * the carrier's direction every feintReactionMs; when it turned sharply he
   * falls for it with chance feintBite and keeps following the old direction
   * for feintCommitMs, without tackling. 0 = reads the carrier perfectly.
   */
  feintReactionMs: number;
  feintBite: number;
  feintCommitMs: number;
  /** Chance that a field player goes for a header / volley when the ball comes to him in the air. */
  aerialChance: number;
  /** Lowest timing quality of those strikes (0..1; the rest is random up to 1). */
  aerialSkill: number;
}

export const AI_PROFILES: Record<Difficulty, AIProfile> = {
  // Slow to react, rarely tackles, wild shots, leaky keeper
  easy: {
    decisionInterval: 800,
    reactionTime: 650,
    tackleRate: 0.5,
    passChance: 0.35,
    shootRange: 170,
    shotAccuracy: 0.4,
    gkSaveChance: 0.45,
    gkReactionMs: 280,
    tackleSuccess: 0.45,
    speedFactor: 0.8,
    feintReactionMs: 260,
    feintBite: 0.55,
    feintCommitMs: 550,
    aerialChance: 0.45,
    aerialSkill: 0.35,
  },
  normal: {
    decisionInterval: 500,
    reactionTime: 300,
    tackleRate: 1.6,
    passChance: 0.6,
    shootRange: 215,
    shotAccuracy: 0.72,
    gkSaveChance: 0.62, // was 0.7 (keepers weakened at the user's request)
    gkReactionMs: 195, // was 170
    tackleSuccess: 0.65,
    speedFactor: 0.95,
    feintReactionMs: 170,
    feintBite: 0.3,
    feintCommitMs: 400,
    aerialChance: 0.7,
    aerialSkill: 0.5,
  },
  // Quick, aggressive pressing, accurate finishing, strong keeper
  hard: {
    decisionInterval: 320,
    reactionTime: 140,
    tackleRate: 3.2,
    passChance: 0.75,
    shootRange: 250,
    shotAccuracy: 0.9,
    gkSaveChance: 0.78, // was 0.85 (keepers weakened at the user's request)
    gkReactionMs: 110, // was 90
    tackleSuccess: 0.8,
    speedFactor: 1.06,
    // Hard reads every feint (unchanged at the user's request)
    feintReactionMs: 0,
    feintBite: 0,
    feintCommitMs: 0,
    aerialChance: 0.9,
    aerialSkill: 0.7,
  },
};

/**
 * AI players never pick a shape position closer than this to a teammate's
 * position or chosen target (px), so they don't bunch up.
 */
export const AI_SPACING = 70;

/** Profile for the AI-driven teammates of the human player. */
export const TEAMMATE_PROFILE: AIProfile = {
  ...AI_PROFILES.normal,
  tackleRate: 1.2,
  speedFactor: 1.0,
  // The human's own keeper and AI teammates keep their previous strength:
  // only the CPU keepers and CPU defenders were weakened
  gkSaveChance: 0.7,
  gkReactionMs: 170,
  feintReactionMs: 0,
  feintBite: 0,
  feintCommitMs: 0,
};

// ---- Teams ----
export interface TeamConfig {
  /** Stable id (settings, saved kits); never shown. */
  id: string;
  name: string;
  shortName: string;
  /** Shirt colour. */
  primaryColor: number;
  /** Shirt stripe colour. */
  secondaryColor: number;
  shortsColor: number;
  sockColor: number;
  skinColor: number;
  goalkeeperColor: number;
  /** Team colour in the UI (HUD chip, card border, confetti); must show on dark backgrounds. */
  uiColor: number;
  /** Lighter shade of the team colour, readable on dark UI. */
  textColor: number;
}

/**
 * All teams that can be picked. A match is played between two of them (side
 * 0 = left in the first half, side 1); kit colours can be changed by the user
 * in the kit editor (config/Teams.ts applies those changes).
 */
export const TEAMS: TeamConfig[] = [
  {
    id: 'orly',
    name: 'Czerwone Orły',
    shortName: 'ORŁ',
    primaryColor: 0xdd2222,
    secondaryColor: 0xffffff,
    shortsColor: 0xf2f2f2,
    sockColor: 0xdd2222,
    skinColor: 0xf5c5a3,
    goalkeeperColor: 0xffcc00,
    uiColor: 0xdd2222,
    textColor: 0xff6655,
  },
  {
    // Stork colours: black shirt with a beak-orange stripe, beak-orange socks,
    // white shorts (the white plumage)
    id: 'bociany',
    name: 'Białe Bociany',
    shortName: 'BOC',
    primaryColor: 0x1c1c22,
    secondaryColor: 0xf0642a,
    shortsColor: 0xf4f4f4,
    sockColor: 0xf0642a,
    skinColor: 0xd4a574,
    goalkeeperColor: 0x00cc44,
    uiColor: 0xf0642a,
    textColor: 0xff9a5c,
  },
  {
    // Bison: gold shirt, brown stripe and shorts
    id: 'zubry',
    name: 'Złote Żubry',
    shortName: 'ŻUB',
    primaryColor: 0xe0b020,
    secondaryColor: 0x5a3a1a,
    shortsColor: 0x5a3a1a,
    sockColor: 0xe0b020,
    skinColor: 0xf0c8a0,
    goalkeeperColor: 0x3a8ae0,
    uiColor: 0xe0b020,
    textColor: 0xffd860,
  },
  {
    // The Wawel dragon: green with a fiery yellow stripe
    id: 'smoki',
    name: 'Zielone Smoki',
    shortName: 'SMO',
    primaryColor: 0x2a9a3a,
    secondaryColor: 0xffd23a,
    shortsColor: 0x1d5a26,
    sockColor: 0x2a9a3a,
    skinColor: 0xe8b890,
    goalkeeperColor: 0xe86aa0,
    uiColor: 0x2a9a3a,
    textColor: 0x6ee07a,
  },
  {
    // Warsaw's mermaid: sky blue and white
    id: 'syreny',
    name: 'Niebieskie Syreny',
    shortName: 'SYR',
    primaryColor: 0x3a8ae0,
    secondaryColor: 0xf4f4f4,
    shortsColor: 0xf4f4f4,
    sockColor: 0x3a8ae0,
    skinColor: 0xc68a5e,
    goalkeeperColor: 0xff8800,
    uiColor: 0x3a8ae0,
    textColor: 0x8cc4ff,
  },
  {
    id: 'rysie',
    name: 'Fioletowe Rysie',
    shortName: 'RYS',
    primaryColor: 0x7a3ab0,
    secondaryColor: 0xd8c0ff,
    shortsColor: 0x2c1a44,
    sockColor: 0x7a3ab0,
    skinColor: 0xf5c5a3,
    goalkeeperColor: 0x22cc55,
    uiColor: 0x9a5ad0,
    textColor: 0xc79cff,
  },
];

/** Colours offered in the kit editor (name keys are in i18n). */
export const KIT_PALETTE: Array<{ id: string; color: number }> = [
  { id: 'red', color: 0xdd2222 },
  { id: 'maroon', color: 0x8e1b1b },
  { id: 'orange', color: 0xf0642a },
  { id: 'gold', color: 0xe0b020 },
  { id: 'yellow', color: 0xffe14d },
  { id: 'green', color: 0x2a9a3a },
  { id: 'darkGreen', color: 0x1d5a26 },
  { id: 'teal', color: 0x1f9a9a },
  { id: 'sky', color: 0x3a8ae0 },
  { id: 'navy', color: 0x1f3a7a },
  { id: 'purple', color: 0x7a3ab0 },
  { id: 'pink', color: 0xe86aa0 },
  { id: 'white', color: 0xf4f4f4 },
  { id: 'grey', color: 0x8a8f99 },
  { id: 'black', color: 0x1c1c22 },
  { id: 'brown', color: 0x6b4423 },
];

// ---- Formations (6v6: 1 GK + 5 field) ----
export type PlayerRole = 'goalkeeper' | 'defender' | 'midfielder' | 'forward';

export interface FormationPosition {
  role: PlayerRole;
  x: number; // 0 = center line, 1 = own goal line
  y: number; // -1 = top, 1 = bottom
}

export type FormationId = '2-3' | '3-2';
export const FORMATION_IDS: FormationId[] = ['2-3', '3-2'];

/** Number of players per team (all formations have the same size). */
export const TEAM_SIZE = 6;

/**
 * Index 0 is always the goalkeeper. A formation change during the match keeps
 * each player's index and gives him the role of the new formation's slot.
 */
export const FORMATIONS: Record<FormationId, FormationPosition[]> = {
  // Attacking: 2 defenders + 3 forwards
  '2-3': [
    { role: 'goalkeeper', x: 0.95, y: 0 },
    { role: 'defender', x: 0.62, y: -0.45 },
    { role: 'defender', x: 0.62, y: 0.45 },
    { role: 'forward', x: 0.16, y: -0.6 },
    { role: 'forward', x: 0.1, y: 0 },
    { role: 'forward', x: 0.16, y: 0.6 },
  ],
  // Defensive: 3 defenders + 2 forwards
  '3-2': [
    { role: 'goalkeeper', x: 0.95, y: 0 },
    { role: 'defender', x: 0.62, y: -0.6 },
    { role: 'defender', x: 0.7, y: 0 },
    { role: 'defender', x: 0.62, y: 0.6 },
    { role: 'forward', x: 0.14, y: -0.35 },
    { role: 'forward', x: 0.14, y: 0.35 },
  ],
};

/**
 * Subtle differences between roles, for everyone (human, teammates, CPU):
 * forwards are a bit faster, tire sooner but also recover sooner, and finish
 * better; defenders win the ball more often. 1 / 0 = no change.
 */
export interface RoleTraits {
  /** Multiplier on walk/sprint speed. */
  speed: number;
  /** Multiplier on stamina used while sprinting. */
  staminaDrain: number;
  /** Multiplier on stamina recovered while not sprinting. */
  staminaRegen: number;
  /** Added to shot accuracy (0..1). */
  shotAccuracy: number;
  /** Multiplier on shot speed. */
  shotSpeed: number;
  /** Added to the chance that this player's tackle wins the ball. */
  tackleSuccess: number;
}

const NO_TRAITS: RoleTraits = { speed: 1, staminaDrain: 1, staminaRegen: 1, shotAccuracy: 0, shotSpeed: 1, tackleSuccess: 0 };

export const ROLE_TRAITS: Record<PlayerRole, RoleTraits> = {
  goalkeeper: NO_TRAITS,
  midfielder: NO_TRAITS,
  defender: { ...NO_TRAITS, tackleSuccess: 0.08 },
  forward: { ...NO_TRAITS, speed: 1.05, staminaDrain: 1.3, staminaRegen: 1.25, shotAccuracy: 0.08, shotSpeed: 1.05 },
};

/** How far (fraction of half-pitch) each role pushes up when its team attacks. */
export const ATTACK_PUSH: Record<PlayerRole, number> = {
  goalkeeper: 0,
  defender: 0.2,
  midfielder: 0.4,
  forward: 0.55,
};

// ---- Input ----
// Movement is on the arrow keys; A/S/D are the action buttons.
export const INPUT_MAP = {
  up: ['UP'],
  down: ['DOWN'],
  left: ['LEFT'],
  right: ['RIGHT'],
  sprint: ['SHIFT'],
  /** Short pass (without the ball: switch to the player nearest the ball). */
  pass: ['S'],
  /** Shoot, hold to charge (without the ball: nothing). */
  shoot: ['D'],
  /** Lob / long pass, hold to charge (without the ball: tackle). */
  lob: ['A'],
  switchPlayer: ['W'],
};

// ---- Audio ----
export const AUDIO = {
  /** Volume for new players (0..1); a saved volume is kept. */
  defaultVolume: 0.1,
};
