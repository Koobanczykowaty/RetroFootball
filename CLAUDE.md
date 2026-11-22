# CLAUDE.md

This file guides Claude Code (claude.ai/code) when working in this repository.

## How to work with the user (read first)

- **Do exactly the task you were asked to do.** Don't extend its scope with extra mechanics, "safety" changes, balance tweaks or UX changes the user didn't request. The user wants a challenging game, so don't make it easier on your own initiative.
- **Ideas and suggestions:** list them in your final message as proposals ("I could also…"). If an idea seems necessary to finish the task properly, ask the user and get approval before implementing it (AskUserQuestion), not after.
- Fixing a reported bug means fixing its actual cause with the smallest change that does it. Don't remove or redesign working mechanics around it without asking.
- The user writes in Polish; reply in Polish. Code, comments and this file stay in English.
- **The local PC version (`release/RetroFootball.html`, built with `npm run build:single`) is rebuilt only when the user explicitly asks.** Don't regenerate it as part of other tasks; the file the user has shared with testers must stay as it is until they request a new one.

## Project

RetroFootball is a 2D pixel-art arcade football (soccer) game: 6v6 (1 GK + 5 outfield), one human against AI, running in the browser. Stack: **Phaser 3.80 (Canvas renderer), TypeScript (strict, noUnused*), Vite 5, Vitest**. There are no image or audio files: sprites are drawn at runtime with Canvas 2D in `AssetGenerator`, and sounds are synthesized with Web Audio in `SoundManager`. User-facing docs: README.md (Polish) and ROADMAP.md.

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
- `--mode single` adds `vite-plugin-singlefile` plus an inline-favicon plugin and writes to `release/` (git-ignored). `scripts/rename-single.mjs` renames the output to RetroFootball.html.
- `.github/workflows/deploy-pages.yml` runs unit tests, builds and deploys `dist/` to GitHub Pages on every push to `main`. The repo needs Pages → Source: GitHub Actions.
- The repo has no remote yet; the user creates the GitHub repo and pushes.
- Both builds were verified to run a full sim match: the single file from `file://`, and `dist/` served under `/RetroFootball/`.

On this machine Node lives in `C:\Program Files\nodejs`, which may not be on the PowerShell PATH. Prefix commands with `$env:Path = "C:\Program Files\nodejs;$env:Path";`. Edge is at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.

**Verify gameplay changes** with `npm run build && npm test && npm run test:sim`. For visual checks, take a screenshot with `msedge --headless=new --virtual-time-budget=<ms> --window-size=960,540 --screenshot=<png> <url>` against `vite preview`.

Debug URL params (see `BootScene`):
- `?sim=N&minutes=M` runs AI-vs-AI matches; results go to `window.__RF_SIM__` and `<pre id="sim-result">`.
- `&human=1` makes team 0 driven by `debug/BotInput` through the real human input path, and pauses/resumes once with synthetic ESC key events.
- `&difficulty=easy|normal|hard` sets the CPU level for the run.
- `&p2=1` runs 2-player mode with a bot on each team.
- `?scene=<Key>[&mode=2p]` opens a scene directly.

Sim mode forces Phaser's `setTimeout` loop because rAF doesn't tick under headless virtual time.

## Architecture

`src/main.ts` sets up `Phaser.Scale.NONE` with its own `applyScale()`. It prefers integer zoom when that fills at least 85% of the window, otherwise it uses a fractional fit; both preserve 16:9.

Scenes: `BootScene` (generates textures and animations) → `MenuScene` → `TeamSelectScene` (team, match length, difficulty, all stored in `Settings`) → `MatchScene` (`{ playerTeam }`). `ControlsScene` and `SettingsScene` are reached from the menu.

**Gameplay is split into systems that share one `MatchWorld`** ([src/game/logic/MatchWorld.ts](src/game/logic/MatchWorld.ts): ball, players, teams, `humanTeam`, `controlled` player, stats). `MatchScene` only orchestrates. Its per-frame `simulate()` runs:
1. `handleHumanInput` → `InputSystem.update()`, which is edge-triggered and must be called exactly once per frame.
2. `AISystem.updateTeam()` for both teams; the human's `controlled` player is skipped.
3. `Player.update()` for every player.
4. `CollisionSystem.update()`: separation, tackle resolution, ball control and interception, goalkeeper saves, and placing the carried ball.
5. `Ball.update()`.
6. `Ball.checkGoal()`.

- [config/GameplayConfig.ts](src/game/config/GameplayConfig.ts) holds **every tunable value**: speeds, ball physics, keeper, match timing, `AI_PROFILES` per difficulty, teams, formation, input map. Balance changes go here.
- `config/Settings.ts` holds persisted user prefs (localStorage, wrapped in try/catch).
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
- **Controls:** arrows move, Shift sprints, S passes (hold to charge; without the ball it switches player), A lobs (hold to charge; without the ball it tackles), D shoots (hold to charge; without the ball it does nothing), Space switches player, Esc/P pause, M mutes. All charged actions reach full power after `BALL.maxChargeMs` (350 ms). These are defined in `INPUT_MAP`. Menus use arrows, Enter/Space and Esc only, because A/S/D are gameplay keys.
- **Key-event ordering:** Phaser emits `keydown-<KEY>` before the generic `keydown` for the same DOM event. A listener added while handling the first (e.g. the pause menu opened by ESC) still receives the second. `MenuNavigator.activate(i, openedBy)` ignores that exact event object; pass it whenever a key opens a menu.
- **Directional switching:** with an arrow held, Space (or S without the ball) uses `pickPlayerInDirection` from the current player, which looks within a ~70° cone and prefers players straight ahead. `MatchScene.switchTarget()` is side-effect-free and also drives the blue "next switch" hint arrow in `drawFx`. With the ball, a yellow hint arrow marks the pass receiver from `ActionSystem.passTarget()`, the same side-effect-free lookup `pass()` uses, so the hint always matches the real pass. While the human's keeper holds the ball, `drawFx` shows a countdown (text + bar) to the auto-kick.
- **Player switching** (Space, S without the ball, auto-switch after losing the ball) without a held direction uses `logic/PlayerSelection.pickPlayerForBall`. It is pure and unit-tested. Against an opponent carrier it prefers goal-side defenders over chasers; for a loose ball it picks the player nearest where the ball is going.
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
- **Keeper held-key sim test:** `MatchScene.keeperHeldKeyTest` runs in the bot-as-human sim. The forward charges a shot, the keeper takes the ball mid-charge, and the keeper must still hold the ball 1 s later (`keeperHeldKeyOk`). `BotInput.override` scripts the keys. With `InputSystem.sync()` removed this test fails (verified).
- The sim checks per match only scripted events (pause/resume, keeper test, change of ends). Rare human actions (shot, pass, lob, directional switch) are checked over the whole run, because a short match may not contain them.
- **Own goals are allowed by design** (the user wants it that way). `shoot()` with the movement input pointing back toward your own goal strikes the ball along the input (a clearance; it can go in your own net). Passes and lobs into space follow the input too. This applies to everyone, including the keeper. Do not add own-goal protection.
- The only keeper-specific input rule: when the human takes control of the keeper, `InputSystem.sync()` swallows keys still held from defending (e.g. A used for a tackle, or D from an interrupted shot charge), so a keeper action needs a fresh press. The bot-as-human sim fails on `humanKeeperOwnGoal` (a keeper own goal while the bot only holds keys from before the catch).
- Difficulty: `AI_PROFILES` (easy/normal/hard) control the CPU team only. The human's AI teammates use `TEAMMATE_PROFILE`. The current level is shown in the HUD as `CPU: …`.

- **Teams change ends at half time.** In the first half team 0 attacks right; in the second half it attacks left. The state lives in `PitchGeometry` (`setSidesSwapped`). `MatchScene` resets it to false in `create()`, and `changeEnds()` sets it on the halftime → kickoff transition and recomputes formation homes. **Never check `teamIndex === 0` for direction**: always use `attackDir(team)`, `opponentGoalX(team)` and `ownGoalX(team)`. `Ball.checkGoal()` returns the goal *side* (0 = left); the conceding team is `teamDefendingSide(side)`. The HUD keeps team 0 on the left in both halves. The sim fails if teams aren't correctly lined up after the change (`swapOk`).
- Player ids are `teamIndex * 10 + formationIndex`. `homeX/homeY` is the formation position, not the kickoff position.
- Time units: the systems take `dt` in **seconds**. Player timers and config durations are in **ms**. `MatchSystem.update` takes ms. `MatchScene` clamps a frame to 50 ms.
- Match clock: `MATCH.fullTimeMinutes` (90) of game time over `settings.matchMinutes` real minutes. Half time is at 45.
- State transitions are handled in `MatchScene.onStateChange` (kickoff → reset positions, half time, full time). Goals are handled immediately in `onGoal`. Pause and resume are not treated as transitions.
- Depth layers: pitch 0, ball shadow 3, selection ring 4, players and low ball 5 + y·0.001, ball trail 9, high ball 10, fx bars 60, HUD 100, banners 190–201, panels 300, pause 400.
- Scene teardown: `MatchScene.onShutdown` (bound to the `SHUTDOWN` event) removes keyboard and game listeners. `MenuNavigator` unbinds itself on shutdown.
- **Encoding:** source files are UTF-8 and some contain non-ASCII characters (—, ◀, ↑). Edit them with the Edit/Write tools. PowerShell 5.1 `Get-Content`/`Set-Content` round-trips corrupt them.
- **Git:** local repository on branch `main` (no remote). Git is installed at `C:\Program Files\Git\cmd` and may not be on the PATH: prefix with `$env:Path = "C:\Program Files\Git\cmd;$env:Path";`. The commit author is configured locally as "RetroFootball Dev <dev@retrofootball.local>". Pass multi-line commit messages with `git commit -F <file>`; a PowerShell here-string piped to `-F -` doesn't work. `README.zip` in the root is the user's file; it is listed in `.gitignore`.
