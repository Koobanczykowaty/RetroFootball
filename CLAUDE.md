# CLAUDE.md

This file guides Claude Code (claude.ai/code) when working in this repository.

## How to work with the user (read first)

- **Do exactly the task you were asked to do.** Don't extend its scope with extra mechanics, "safety" changes, balance tweaks or UX changes the user didn't request. The user wants a challenging game, so don't make it easier on your own initiative.
- **Ideas and suggestions:** list them in your final message as proposals ("I could also…"). If an idea seems necessary to finish the task properly, ask the user and get approval before implementing it (AskUserQuestion), not after.
- Fixing a reported bug means fixing its actual cause with the smallest change that does it. Don't remove or redesign working mechanics around it without asking.
- The user writes in Polish; reply in Polish. Code, comments and this file stay in English.
- **The local PC version (`release/RetroFootball.html`, built with `npm run build:single`) is rebuilt only when the user explicitly asks.** Don't regenerate it as part of other tasks; the file the user has shared with testers must stay as it is until they request a new one.

## Project

RetroFootball is a 2D pixel-art arcade football (soccer) game: 6v6 (1 GK + 5 outfield), one human against AI, running in the browser. Stack: **Phaser 3.80 (Canvas renderer), TypeScript (strict, noUnused*), Vite 8 (Rolldown bundler: use `build.rolldownOptions`, not `rollupOptions`), Vitest 5; Node 22.12+ required**. There are no image or audio files: sprites are drawn at runtime with Canvas 2D in `AssetGenerator`, and sounds are synthesized with Web Audio in `SoundManager`. User-facing docs: README.md (Polish) and ROADMAP.md.

## Commands

```bash
npm run dev                 # Vite dev server, http://localhost:3000
npm run build               # tsc type-check (noEmit) + vite build -> dist/
npm test                    # Vitest unit tests in tests/
npm run test:sim -- 2 1     # needs a build first: headless Chrome/Edge plays 2 matches of 1 min, AI-vs-AI and bot-as-human
npm run build:single        # release/RetroFootball.html: the whole game in one file, runs by double-click (file://)
```

**Distribution:**
- `vite.config.ts` uses `base: './'` (relative paths) so the build works under a GitHub Pages sub-path and from disk.
- The web build puts Phaser in its own chunk (`rolldownOptions.output.codeSplitting`), so a game update re-downloads only the ~120 kB game chunk. `chunkSizeWarningLimit` is raised because Phaser alone is ~1.2 MB.
- `--mode single` adds `vite-plugin-singlefile` plus an inline-favicon plugin and writes to `release/` (git-ignored). `scripts/rename-single.mjs` renames the output to RetroFootball.html.
- `.github/workflows/deploy-pages.yml` runs unit tests, builds, runs `test:sim -- 2 1` (headless Chrome on the runner; `--no-sandbox` is added when `CI` is set) and only then deploys `dist/` to GitHub Pages on every push to `main`. A failing simulation blocks the deploy. The repo needs Pages → Source: GitHub Actions.
- **Published:** remote `origin` = https://github.com/Koobanczykowaty/RetroFootball (public). The live game is https://koobanczykowaty.github.io/RetroFootball/ (Pages source: GitHub Actions). Every push to `main` redeploys it, so **pushing publishes**: only push when the user asks. **Testers play the Pages version**, not the single file. The version number is `GAME_VERSION` in GameplayConfig (shown in the menu) plus `package.json`/`package-lock.json` and the README heading; bump it only on request. The first push needed the user's interactive GitHub login; Claude's shell can't show that prompt.
- Both builds were verified to run a full sim match: the single file from `file://`, and `dist/` served under `/RetroFootball/`.

Run `npm test` from **PowerShell**: under the Git Bash tool, Vitest 5 fails every suite at load ("Cannot read properties of undefined (reading 'config')") even though the tests pass. Build and `test:sim` work from both shells.

On this machine Node lives in `C:\Program Files\nodejs`, which may not be on the PowerShell PATH. Prefix commands with `$env:Path = "C:\Program Files\nodejs;$env:Path";`. Edge is at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.

**Verify gameplay changes** with `npm run build && npm test && npm run test:sim`. For visual checks, take a screenshot with `msedge --headless=new --virtual-time-budget=<ms> --window-size=960,540 --screenshot=<png> <url>` against `vite preview`.

Debug URL params (see `BootScene`):
- `?sim=N&minutes=M` runs AI-vs-AI matches; results go to `window.__RF_SIM__` and `<pre id="sim-result">`.
- `&human=1` makes team 0 driven by `debug/BotInput` through the real human input path, and pauses/resumes once with synthetic ESC key events.
- `&difficulty=easy|normal|hard` sets the CPU level for the run.
- `&stadium=narodowy|blokowisko` forces the stadium (normally random every match).
- `&p2=1` runs 2-player mode with a bot on each team.
- `?scene=<Key>[&mode=2p]` opens a scene directly.

Sim mode forces Phaser's `setTimeout` loop because rAF doesn't tick under headless virtual time.

## Architecture

`src/main.ts` sets up `Phaser.Scale.NONE` with its own `applyScale()`. It prefers integer zoom when that fills at least 85% of the window, otherwise it uses a fractional fit; both preserve 16:9.

Scenes: `BootScene` (generates textures) → `MenuScene` → `TeamSelectScene` (both teams, match length, difficulty, all stored in `Settings`) → `MatchScene` (`{ mode, playerTeam? }`). `KitEditorScene`, `ControlsScene` and `SettingsScene` are reached from the menu.

**Gameplay is split into systems that share one `MatchWorld`** ([src/game/logic/MatchWorld.ts](src/game/logic/MatchWorld.ts): ball, players, teams, `humanTeam`, `controlled` player, stats). `MatchScene` only orchestrates. Its per-frame `simulate()` runs:
1. `handleHumanInput` → `InputSystem.update()`, which is edge-triggered and must be called exactly once per frame.
2. `AISystem.updateTeam()` for both teams; the human's `controlled` player is skipped.
3. `Player.update()` for every player.
4. `CollisionSystem.update()`: separation, tackle resolution, ball control and interception, goalkeeper saves, and placing the carried ball.
5. `Ball.update()`.
6. `Ball.checkGoal()`.

- [config/GameplayConfig.ts](src/game/config/GameplayConfig.ts) holds **every tunable value**: speeds, ball physics, keeper, match timing, `AI_PROFILES` per difficulty, teams, formation, input map. Balance changes go here.
- `config/Settings.ts` holds persisted user prefs (localStorage, wrapped in try/catch), including `language` ('pl' | 'en'; default from the browser language, switchable in SETTINGS).
- `config/i18n.ts` holds every UI string in Polish and English (`t()` returns the current language's `Strings`). **Never hard-code user-facing text**: add a key to both tables. Texts are read when created, so a language change restarts `SettingsScene`. Team names and the RETRO GAŁA logo are not translated. `applyPageLanguage()` sets the browser tab title (PL "Retro Gała", EN "RetroFootball") and `<html lang>` at startup and on a language change. In Polish, the start button and the kickoff banner say "HARATAJMY!" (user's choice). For screenshots in a given language, run Edge with `--lang=pl-PL` and a fresh `--user-data-dir`.
- `logic/PitchGeometry.ts` contains pure helpers: pitch bounds, `attackDir`, goal X, lane clearance, line-crossing prediction, formation and kickoff positions. It has no Phaser import, so it is unit-testable. `systems/MatchSystem.ts` is also pure.
- `systems/ActionSystem.ts` implements pass, passTo, lob, lobTo, shoot and tackle. **Human and AI use the same actions.** Stats and sounds are updated here.
- `systems/CollisionSystem.ts` is the single place that changes possession (`givePossession`). It fires `onPossession`, `onSave` and `onTackle` callbacks.
- `systems/AISystem.ts`:
  - Exactly one chaser per team, with hysteresis. The pass receiver always counts as the chaser.
  - Other players re-think their formation position every `decisionInterval` and steer toward it every frame.
  - The ball carrier decides between shoot, pass and dribble.
  - The goalkeeper predicts where a shot crosses the line and dives.
- `systems/InputSystem.ts` merges `InputSource`s (`KeyboardInput`, `debug/BotInput`; gamepad would be a new source). It also handles shot charge, `consumeShoot()`, and `sync()` after closing menus.
- Entities are plain classes that wrap sprites, not GameObject subclasses. `Player` keeps its own `x/y/vx/vy`, steers toward a desired velocity (`steer`/`moveToward`), and has ms timers (kick cooldown, tackle, stun, pickup block, protect) and poses (kick, tackle, dive, celebrate). `Ball` has `z`/`vz` for lobs and a power-shot trail.
- UI ([src/game/ui/](src/game/ui/)): `Button` and `OptionSelector` implement `Focusable`, and `MenuNavigator` provides keyboard navigation (arrows, Enter/Space, Esc/Backspace). `Theme.ts` holds the palette and text styles. `HUD`, `MatchOverlay` (banners and full-time stats panel) and `PauseMenu` (with an embedded `ControlsPanel`) complete the set.

## Conventions and gotchas

- **Formations:** `FORMATIONS` in GameplayConfig has two shapes, `'2-3'` (2 defenders + 3 forwards) and `'3-2'` (3 defenders + 2 forwards). There are no midfielders, by the user's choice. Index 0 is always the keeper and `TEAM_SIZE` = 6.
  - The human's formation is `settings.formation`, chosen on QUICK MATCH and changeable in the pause menu. A pause-menu change also updates the setting.
  - The CPU picks one at random every match. `MatchScene.formations` holds each team's current shape.
  - `changeFormation` keeps player indices and calls `Player.setFormationSlot`, so role and home can change mid-match.
  - At kickoff only `kickoffTakerIndex` (the most central forward) stands on the centre spot. `kickoffPositions(team, kicking, formation)` needs the formation.
  - The bot-as-human sim changes formation through the pause menu with real arrow keys (`formationChangeOk`).
- **Phaser key events can be delivered twice.** `KeyboardPlugin` re-processes the whole frame queue on each new DOM key event, and its duplicate check only catches an immediate repeat. So two different keys within one frame re-emit the earlier event object. Every key listener must dedupe with its own `createEventDeduper()` (see `MenuNavigator`, and `MatchScene` for ESC/P/M). Don't share one deduper between listeners, or one listener swallows the event for the others.
- **Human players / 2 PLAYERS mode:** all human control lives in `scenes/HumanController.ts`, one instance per human with its own `InputSystem`, charge state, hints and keeper countdown. `MatchScene.humans` is the list and `humanTeams` gives the team per player (P1 first). `MatchWorld.controlled` is per team (`[Player | null, Player | null]`).
  - Quick Match (`mode: '1p'`): one human with keyboard + pad sources.
  - 2 PLAYERS (`mode: '2p'`, menu button): P1 picks the team (`settings.playerTeam`) and P2 plays the other. Devices come from `Gamepad.padForPlayer`, which is re-evaluated every frame and unit-tested: with one pad, P1 = keyboard and P2 = pad 1; with two pads, P1 = keyboard + pad 1 and P2 = pad 2. Menus and pause (`PadEdges`) react to any connected pad (`connectedPads`). Formations are `settings.formation` / `formationP2`, and the pause menu has a formation row per human. Both human teams use `TEAMMATE_PROFILE` for their AI teammates.
  - Marker colours: p1 yellow, p2 green (`AssetGenerator.MARKER_COLORS`). **The renderer is Canvas, so `setTint` does nothing.** Coloured variants must be separate textures.
  - The sim `&p2=1` runs 2p mode with one `BotInput` per team (`BotInput` takes a team) and checks that both humans pass and shoot.
- **Xbox controller** (`systems/Gamepad.ts`, browser Gamepad API, "standard" layout):
  - Gameplay mapping: stick/D-pad move, RT sprint, A pass, B shoot, X lob/tackle, LB switch. `GamepadInput` is just another `InputSource` (alongside `KeyboardInput`), so charging and every mechanic work unchanged.
  - `PadEdges` turns held buttons into one-shot commands (up/down/left/right/confirm/back/pause/mute). `MenuNavigator` polls one on the scene `UPDATE` event while active, syncing on activate so a held A doesn't re-trigger. `MatchScene.update` polls one for Menu (pause) and View (mute).
  - Mapping and edges are pure and unit-tested (`tests/Gamepad.test.ts`). The input types live in `systems/InputTypes.ts` (no Phaser import).
  - The bot sim uses the `window.__RF_FAKE_PAD__` hook to press Menu and B (`padPaused`/`padResumed`).
  - Not tested with a physical controller by Claude.
- **No throw-ins, corners, offside or fouls, by design.** The user considers the bouncing boards a core feature (it keeps play fast). Don't propose adding set pieces. The user also considers the current balance OK, so don't retune it unasked.
- **Desktop browser only.** There are no touch or mobile controls (the user decided this); don't add them.
- **Controls:** arrows move, Shift sprints, S passes (hold to charge; without the ball it switches player), A lobs (hold to charge; without the ball it tackles), D shoots (hold to charge; without the ball it does nothing), W switches player, but only without the ball: with the ball W / pad LB do nothing (the user asked for this) (Space is no longer a gameplay key), Esc/P pause, M mutes. All charged actions reach full power after `BALL.maxChargeMs` (350 ms). These are defined in `INPUT_MAP`. Menus use arrows, Enter/Space and Esc only, because A/S/D are gameplay keys.
- **Key-event ordering:** Phaser emits `keydown-<KEY>` before the generic `keydown` for the same DOM event. A listener added while handling the first (e.g. the pause menu opened by ESC) still receives the second. `MenuNavigator.activate(i, openedBy)` ignores that exact event object; pass it whenever a key opens a menu.
- **Directional switching:** with an arrow held, W (pad LB, or S / pad A without the ball) uses `pickPlayerInDirection` from the current player, which looks within a ~70° cone and prefers players straight ahead. `MatchScene.switchTarget()` is side-effect-free and also drives the blue "next switch" hint arrow in `drawFx`. With the ball, a yellow hint arrow marks the pass receiver from `ActionSystem.passTarget()`, the same side-effect-free lookup `pass()` uses, so the hint always matches the real pass. While the human's keeper holds the ball, `drawFx` shows a countdown (text + bar) to the auto-kick.
- **Player switching** (Space, S without the ball, auto-switch after losing the ball) without a held direction uses `logic/PlayerSelection.pickPlayerForBall`. It is pure and unit-tested. Against an opponent carrier it prefers goal-side defenders over chasers, but that penalty scales with how fast the carrier runs at our goal (only 25% against a carrier standing or feinting, so a player right next to him is picked); for a loose ball it picks the player nearest where the ball is going.
- **Goalkeepers:** a keeper holding the ball can't be tackled (`CollisionSystem`), and AI chasers don't press him (`AISystem.updateOffBall`). When the human team's keeper gains the ball, the human controls him. He auto-lobs after `GOALKEEPER.humanHoldMax`, and control returns to a field player once he releases the ball (`MatchScene.handleHumanInput`).
- **Charged actions (human):** S, D and A are all "hold to charge, release to play". `InputSystem` tracks each with a `ChargeButton`; `MatchScene.chargeKind` says which one is charging, and only one charges at a time (`fireCharged`).
  - **Pass:** `ActionSystem.pass/passTo(…, power)` scales the normal speed by `1 ± BALL.passPowerRange`, so 0.5 = normal. The AI omits `power`. Normal pass speed is `passBaseSpeed + dist·passDistanceFactor`, clamped to 300–480 px/s, for everyone.
  - **Lob (human):** `ActionSystem.lobToSpot(p, dir, power)` has no auto-target. It flies along the input or facing direction and power sets the landing distance (`lobMinDistance..lobMaxDistance`). The teammate nearest the landing spot (within `lobReceiveRadius`) becomes the receiver. The AI and the keeper auto-kick still use the auto-targeted `lob`/`lobTo`.
  - Covered by `tests/ActionSystem.test.ts`.
- **AI spacing:** shape targets are pushed at least `AI_SPACING` (70 px) from teammates' targets or positions (`AISystem.spreadFromTeammates`, also applied to support-run targets), and a player re-thinks early when a teammate gets within ~40 px.
- **Keeper prediction:** `PitchGeometry.predictBallCrossing` simulates friction and touchline bounces (unit-tested). The keeper only reacts to a new kick after `AIProfile.gkReactionMs` (`Ball.kickAgeMs`).
- **Contact sliding:** in `CollisionSystem.separatePlayers`, the part of a player's velocity going into another player is turned sideways (`PLAYER.contactSlide`). Tackling and stunned players are excluded. The result is capped at the speed before the contact. Without that cap, sideways speed stacked up every frame of a long contact and players shot off toward the corners (fixed bug). The sim fails on any `overspeed` (a non-tackling, non-stunned player faster than 1.1× his sprint speed).
- The sim prints spacing / contacts / keeper metrics; these are informational, not pass/fail.
- **Support run after a pass (human and AI):** `MatchScene.startSupportRun` sets `Player.supportRunTimer` (`PLAYER.supportRunMax`) on the passer, for field players only. It is called after the human's S/A passes and, through `AISystem.onFieldPass`, after AI passes from `tryPass`. While the timer runs and the team has the ball, `AISystem.supportRun` moves the passer ahead of the ball in his lane instead of back to formation shape. Losing the ball ends it. The sim records `passerForward/Back` (human) and `aiPasserForward/Back` plus `aiPasserMovedPx` (AI), and fails if passers drop back more often than they go forward.
  - **Defenders** (user report: both defenders ran forward and the back line was empty): only one defender per team is on a support run at a time (a new defender run cancels the others), and a defender runs at most `PLAYER.defenderSupportRunLimit` past halfway. The sim counts `backLineEmpty` (informational).
- **Stamina** is fully restored for everyone at the kickoff after a goal or half time (`onStateChange`).
- **Keeper held-key sim test:** `MatchScene.keeperHeldKeyTest` runs in the bot-as-human sim. The forward charges a shot, the keeper takes the ball mid-charge, and the keeper must still hold the ball 1 s later (`keeperHeldKeyOk`). `BotInput.override` scripts the keys. With `InputSystem.sync()` removed this test fails (verified).
- The sim checks per match only scripted events (pause/resume, keeper test, change of ends). Rare human actions (shot, pass, lob, directional switch) are checked over the whole run, because a short match may not contain them.
- **Own goals are allowed by design** (the user wants it that way). `shoot()` with the movement input pointing back toward your own goal strikes the ball along the input (a clearance; it can go in your own net). Passes and lobs into space follow the input too. This applies to everyone, including the keeper. Do not add own-goal protection.
- The only keeper-specific input rule: when the human takes control of the keeper, `InputSystem.sync()` swallows keys still held from defending (e.g. A used for a tackle, or D from an interrupted shot charge), so a keeper action needs a fresh press. The bot-as-human sim fails on `humanKeeperOwnGoal` (a keeper own goal while the bot only holds keys from before the catch).
- Difficulty: `AI_PROFILES` (easy/normal/hard) control the CPU team only. The human's AI teammates use `TEAMMATE_PROFILE`. The current level is shown in the HUD as `CPU: …`.
  - **Feints** (`feintReactionMs/feintBite/feintCommitMs`, `AISystem.readCarrier`): on easy and normal, a pressing CPU defender re-reads the carrier's direction only periodically. A sharp turn can fool him: he follows the old direction and does not tackle. Hard and `TEAMMATE_PROFILE` read every frame, exactly as before (the user asked to keep hard unchanged). The sim records `feintBites`.
  - CPU keepers on normal and hard were weakened at the user's request (`gkSaveChance`, `gkReactionMs`). `TEAMMATE_PROFILE` pins the old normal keeper values, so the human's keeper is unchanged.
- **Role traits** (`ROLE_TRAITS`, for everyone, kept subtle on purpose):
  - Forwards: +5% speed, +30% sprint stamina drain, +25% stamina regeneration, +0.08 shot accuracy, +5% shot speed.
  - Defenders: +0.08 tackle success.
  - Applied in `Player.update`, `ActionSystem.shoot` and the tackle resolution in `CollisionSystem`. The sim overspeed limit includes the role speed.

- **Teams change ends at half time.** In the first half team 0 attacks right; in the second half it attacks left. The state lives in `PitchGeometry` (`setSidesSwapped`). `MatchScene` resets it to false in `create()`, and `changeEnds()` sets it on the halftime → kickoff transition and recomputes formation homes. **Never check `teamIndex === 0` for direction**: always use `attackDir(team)`, `opponentGoalX(team)` and `ownGoalX(team)`. `Ball.checkGoal()` returns the goal *side* (0 = left); the conceding team is `teamDefendingSide(side)`. The HUD keeps team 0 on the left in both halves. The sim fails if teams aren't correctly lined up after the change (`swapOk`).
- Player ids are `teamIndex * 10 + formationIndex`. `homeX/homeY` is the formation position, not the kickoff position.
- Time units: the systems take `dt` in **seconds**. Player timers and config durations are in **ms**. `MatchSystem.update` takes ms. `MatchScene` clamps a frame to 50 ms.
- Match clock: `MATCH.fullTimeMinutes` (90) of game time over `settings.matchMinutes` real minutes. Half time is at 45.
- State transitions are handled in `MatchScene.onStateChange` (kickoff → reset positions, half time, full time). Goals are handled immediately in `onGoal`. Pause and resume are not treated as transitions.
- **Main menu background** (`MenuScene.drawBackground`), Polish accents at the user's request:
  - Warsaw's National Stadium (`drawNationalStadium`): an oval bowl with horizontal white-red facade bands, every other panel column shifted by 30% of a band. It has a crown of masts with a cable roof, a spire with a waving white-red flag (`addSpireFlag`) and a grass embankment sloping down behind the stands.
  - The Palace of Culture and Science (`drawPalaceOfCulture`) has flickering windows. These are separate rectangles, so `standTopAt(x)` leaves out windows the stands would cover.
  - Proportions follow the real buildings. Don't use the national emblem.
- **Audio** (`systems/SoundManager.ts`, all synthesized, 8-bit style at the user's request):
  - Every source goes through one master gain (volume, and mute via `soundEnabled`/M). Music has its own gain under it (`settings.musicEnabled`, the MUSIC row in SETTINGS).
  - Music and jingles are note data in `audio/Tunes.ts` (original compositions, pure and unit-tested). A look-ahead scheduler plays them.
  - Menu scenes call `playMusic('menu')`; it does nothing if that track is already playing. `MatchScene` plays `'match'` quietly plus the crowd (`startCrowd`/`stopCrowd`: murmur that swells on shots, saves and goals; no periodic chant, the user found it distracting).
  - At full time the music stops and a result jingle plays.
  - The AudioContext resumes on the first key or click; browsers block audio until then.
- **Headers and volleys** (`logic/Aerial.ts`, pure and unit-tested; tunables in `AERIAL`):
  - Ball height zones: below `volleyMinZ` (= `BALL.playerReachHeight`) is normal ground control, then volley, then header up to `headerMaxZ`.
  - A lob crosses these zones in ~0.06–0.1 s, too short to hit a key on. So the human presses D (shot) or S (pass) while the ball is on its way: `predictAerialContact` looks `pressWindowSec` ahead, and `HumanController.updateAerial` keeps a pending strike that fires when the ball is in reach. `timingQuality` rewards late presses.
  - `ActionSystem.aerial` is shared by human and AI: headers are weaker and pushed down, a badly timed volley rises over the bar. With the ball in the air, S becomes a header pass instead of a switch.
  - The AI (`AISystem.tryAerial`) decides once per ball flight (`Ball.kickId`) with `aerialChance` / `aerialSkill` per profile.
  - A marker above the controlled player's head shows the chance: cyan for a header, green for a volley, white once pressed.
  - The bot presses too. The sim fails if no header or volley happens in the whole run (`aiAerial`, `humanHeader`, `humanVolley`).
- **Teams and kits:** `TEAMS` in GameplayConfig is the roster (6 teams with stable `id`s; Polish names stay untranslated). A match is between two of them, by side:
  - Side 0 is `settings.teamP1` (the left card: the human, or P1) and side 1 is `settings.teamP2` (the opponent or P2). The sim picks a random pair.
  - `settings.playerTeam` no longer exists. `MatchSceneData.playerTeam` (default 0) is only which side the keyboard human plays (the UI flow test uses it).
  - `config/Teams.ts` (pure, tested) applies the user's kit colours (`settings.kits`, from the kit editor) with `teamWithKits`. Changed kits get their UI colours derived from the shirt, or the stripe if the shirt is too dark. `matchTeam(side)` / `setMatchTeams` hold the current match's teams for the HUD.
  - Textures: `kit_<id>` / `kit_gk_<id>` for every team (cards, editor), regenerated on a kit change. `player_team0/1` / `player_gk0/1` for the two sides, regenerated by `MatchScene.create` before the players exist.
  - **Never index `TEAMS` by side**: use `this.teams[side]` (MatchScene) or `matchTeam(side)`.
  - `KitEditorScene` (menu: KITS) offers the team's own default colour plus `KIT_PALETTE` for shirt, stripe, shorts, socks and keeper. `OptionSelector` has an optional colour swatch for this.
- **Stadiums** (`STADIUMS` in GameplayConfig) are picked at random every match (the user's choice): `narodowy` (the original stadium) and `blokowisko` (housing estate). The estate has worn grass with bald patches, chalk lines, prefab blocks, a fence, a carpet beater, benches, trees and pipe goals, drawn in `Pitch.drawEstate`, and it uses the rag ball texture `ball_rag`.
  - Only the look differs: geometry and physics are identical (the user wanted the rag ball to look different only).
  - The kickoff banner shows the stadium name.
  - `?stadium=narodowy|blokowisko` forces one for testing. The sim records `stadium_<id>`.
- **Goal slow motion** (`MatchScene.onGoal` → `endGoalSlowMo`): `MATCH.goalSlowMoMs` real ms at `goalSlowMoScale` with the camera zoomed on the ball (camera bounds = game area). The match timers wait meanwhile; the banner, fanfare, confetti and celebration come after.
  - The HUD shares the camera, so it is hidden during the zoom.
  - Pausing ends the slow motion instantly.
  - The sim fails on `goalZoomStuck` (zoom or HUD not restored by the next kickoff).
- **Main menu players** (`MenuScene.update`, timeline `DUEL`) run a dribbling duel: run-in, feints, the cut past a lunging defender, then a chase. Roles and direction swap every round. To screenshot any animation under headless virtual time, the game loop must use setTimeout. Only the `sim`/`uitest` params force that (`main.ts`), so add a temporary param for the shot.
- In-match HUD: no "ESC pause" corner box (the user found it tacky). Only the mute indicator appears there, and only while muted.
- Depth layers: pitch 0, ball shadow 3, selection ring 4, players and low ball 5 + y·0.001, ball trail 9, high ball 10, fx bars 60, HUD 100, banners 190–201, panels 300, pause 400.
- Scene teardown: `MatchScene.onShutdown` (bound to the `SHUTDOWN` event) removes keyboard and game listeners. `MenuNavigator` unbinds itself on shutdown.
- **Encoding:** source files are UTF-8 and some contain non-ASCII characters (—, ◀, ↑). Edit them with the Edit/Write tools. PowerShell 5.1 `Get-Content`/`Set-Content` round-trips corrupt them.
- **Git:** repository on branch `main`, remote `origin` on GitHub (see Distribution; pushing publishes the site). Git is installed at `C:\Program Files\Git\cmd` and may not be on the PATH: prefix with `$env:Path = "C:\Program Files\Git\cmd;$env:Path";`. The commit author is configured locally as "RetroFootball Dev <dev@retrofootball.local>". Pass multi-line commit messages with `git commit -F <file>`; a PowerShell here-string piped to `-F -` doesn't work. `README.zip` in the root is the user's file; it is listed in `.gitignore`.

## Pixel font (approved by the user, merged)

- `assets/PixelFontGlyphs.ts`: hand-drawn 5-px glyphs (ASCII, Polish letters, arrows, ◀ ▶, — •), loosely inspired by Ubuntu.
- `assets/PixelFont.ts` builds a TrueType font from them in memory and registers it as `RetroGala` (FontFace API, normal and bold), so all Phaser texts keep colours, strokes and sizes. No font file ships. `BootScene` waits for it before the first text; if the browser rejects it, monospace is used.
- `Theme.UI.font` = `RetroGala, monospace`. One font pixel = 1/10 em, and **every font size is snapped** (`pixelFontSize`: 10, 20, 30…) so a font pixel is exactly 1, 2, 3… game pixels, on the sprites' grid. Strokes use `pixelStroke` (one font pixel). The user found unsnapped sizes "too high resolution", without pixel-art charm. Use `textStyle`/`titleStyle`/Button `fontSize` (all snapped); call `pixelFontSize` for any `setFontSize`.
- `tests/PixelFont.test.ts` checks that every UI character has a glyph and that the font file is structurally valid (checksum).
