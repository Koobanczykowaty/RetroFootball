// ============================================================
// BotInput — Scripted "human" used by the simulation test
// (?sim=N&human=1). It produces RawInput exactly like a keyboard,
// so the real human-control code path (charged shots, passes,
// tackles, player switching) gets exercised automatically.
// ============================================================

import { predictAerialContact } from '../logic/Aerial';
import type { MatchWorld } from '../logic/MatchWorld';
import { PITCH_CY, attackDir, distance, normalize, opponentGoalX } from '../logic/PitchGeometry';
import { EMPTY_RAW, InputSource, RawInput } from '../systems/InputSystem';

export class BotInput implements InputSource {
  private frame = 0;
  private shootHold = 0;
  private lobHoldLeft = 0;
  private keeperFrames = 0;
  private keeperHoldShoot = false;
  private lastShoot = false;
  /** Ball flight (Ball.kickId) the bot already went for in the air. */
  private aerialKick = -1;

  constructor(
    private readonly getWorld: () => MatchWorld | null,
    /** Called when the keeper caught the ball while the shoot key was held. */
    private readonly onHeldAtCatch?: () => void,
    /** Team this bot plays (two bots play each other in the 2-player sim). */
    private readonly team = 0,
  ) {}

  /**
   * Scripted test override: 'release' = no keys at all; 'holdShoot' = only the
   * shoot key held, with the arrow pointing toward our own goal.
   */
  public override: 'release' | 'holdShoot' | null = null;

  read(): RawInput {
    let r: RawInput;
    if (this.override === 'release') {
      r = { ...EMPTY_RAW };
    } else if (this.override === 'holdShoot') {
      const team = this.team;
      r = { ...EMPTY_RAW, shoot: true, moveX: -attackDir(team) };
    } else {
      r = this.decide();
    }
    this.lastShoot = r.shoot;
    return r;
  }

  private decide(): RawInput {
    const r: RawInput = { ...EMPTY_RAW };
    const w = this.getWorld();
    const p = w?.controlled[this.team];
    if (!w || !p) return r;
    this.frame++;
    const ball = w.ball;

    if (p.hasBall && p.role === 'goalkeeper') {
      // Regression check for "held tackle key fires the keeper's shot": keep
      // holding the arrow toward OUR goal and whatever shoot state was held
      // at the moment of the catch, never pressing anything new. The keeper
      // must not kick (the game auto-kicks forward after the hold timer).
      if (this.keeperFrames === 0) this.keeperHoldShoot = this.lastShoot;
      this.keeperFrames++;
      r.moveX = -attackDir(p.teamIndex);
      r.shoot = this.keeperHoldShoot;
      if (this.keeperFrames === 1 && r.shoot) this.onHeldAtCatch?.();
      return r;
    }
    this.keeperFrames = 0;

    if (p.hasBall) {
      const gx = opponentGoalX(p.teamIndex);
      const toGoal = normalize(gx - p.x, PITCH_CY - p.y);
      r.moveX = toGoal.x;
      r.moveY = toGoal.y;
      if (this.lobHoldLeft > 0) {
        // Charging a lob: keep A held for the chosen number of frames, then release
        this.lobHoldLeft--;
        r.lob = this.lobHoldLeft > 0;
      } else if (distance(p.x, p.y, gx, PITCH_CY) < 230) {
        // Hold shoot ~20 frames, then release (charged shot), aiming low
        this.shootHold++;
        r.shoot = this.shootHold < 20;
        r.moveY = 1;
      } else if (this.frame % 90 === 0) {
        r.pass = true;
      } else if (this.frame % 200 === 0) {
        // Lob with a random charge: from a tap to longer than full power (auto-fire)
        this.lobHoldLeft = 2 + Math.floor(Math.random() * 40);
        r.lob = true;
      }
      return r;
    }

    this.shootHold = 0;
    this.lobHoldLeft = 0;

    // Header / volley: press shortly before an airborne ball arrives (once per
    // flight): shoot near the opponent's goal, otherwise pass it on
    if (ball.isFree && p.role !== 'goalkeeper' && this.aerialKick !== ball.kickId) {
      const contact = predictAerialContact(ball, p);
      if (contact && contact.t < 0.2) {
        this.aerialKick = ball.kickId;
        const nearGoal = distance(p.x, p.y, opponentGoalX(p.teamIndex), PITCH_CY) < 260;
        if (nearGoal) r.shoot = true;
        else r.pass = true;
        r.moveX = attackDir(p.teamIndex);
        return r;
      }
    }

    const toBall = normalize(ball.x - p.x, ball.y - p.y);
    r.moveX = toBall.x;
    r.moveY = toBall.y;
    r.sprint = toBall.len > 60;
    const opponentHasBall = ball.ownerTeam !== null && ball.ownerTeam !== p.teamIndex;
    if (opponentHasBall && toBall.len < 24) r.lob = this.frame % 10 < 5; // tap lob = tackle
    if (this.frame % 150 === 0) r.switchPlayer = true;
    return r;
  }
}
