// ============================================================
// sim-test — Automated smoke test of the real game in a headless
// Chromium browser (Chrome or Edge).
//
// Serves dist/ with `vite preview`, opens /?sim=N&minutes=M (AI vs
// AI, with a scene restart between matches), and checks that every
// match reaches full time without runtime errors.
//
// Usage: npm run build && npm run test:sim [-- matches minutes]
// Set CHROME_PATH to use a specific browser binary.
// ============================================================

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preview } from 'vite';

const matches = Number(process.argv[2] ?? 2);
const minutes = Number(process.argv[3] ?? 1);

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
  return candidates.find((p) => p && existsSync(p));
}

function runBrowser(browser, url, budgetMs) {
  const profile = mkdtempSync(join(tmpdir(), 'rf-sim-'));
  return new Promise((resolve, reject) => {
    const child = spawn(browser, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--mute-audio',
      `--user-data-dir=${profile}`,
      `--virtual-time-budget=${budgetMs}`,
      '--dump-dom',
      url,
    ]);
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', reject);
    child.on('close', () => {
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
      resolve(out);
    });
  });
}

function decode(s) {
  return s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

const browser = findBrowser();
if (!browser) {
  console.error('No Chrome/Edge found. Set CHROME_PATH.');
  process.exit(2);
}

const server = await preview({ preview: { port: 0, open: false }, logLevel: 'silent' });
const url = server.resolvedUrls?.local?.[0];
if (!url) {
  console.error('vite preview did not start');
  process.exit(2);
}

const failures = [];

async function runSim(label, human) {
  // Each match: real minutes + kickoff/halftime/goal pauses (each goal adds ~3.5 s)
  const budget = Math.ceil(matches * (minutes * 60 + 60) * 1000);
  console.log(`[${label}] ${matches} match(es) of ${minutes} min`);
  const query = `?sim=${matches}&minutes=${minutes}${human ? '&human=1' : ''}`;
  const dom = await runBrowser(browser, url + query, budget);

  const m = dom.match(/<pre id="sim-result"[^>]*>([\s\S]*?)<\/pre>/);
  if (!m) {
    failures.push(`[${label}] no simulation result found in the page (did the game boot?)`);
    return;
  }
  const result = JSON.parse(decode(m[1]));
  if (result.errors.length) failures.push(`[${label}] runtime errors: ${result.errors.join(' | ')}`);
  if (result.matches.length !== matches) {
    failures.push(`[${label}] expected ${matches} matches, got ${result.matches.length}`);
  }
  for (const r of result.matches) {
    const s = r.stats;
    const tag = `[${label}] match ${r.index + 1}`;
    console.log(
      `  match ${r.index + 1}: ${r.score[0]}-${r.score[1]}  shots ${s.shots.join('/')}  saves ${s.saves.join('/')}`
      + `  passes ${s.passes.join('/')}  tackles ${s.tackles.join('/')}  events ${JSON.stringify(r.events)}`,
    );
    if (!r.states.includes('halftime')) failures.push(`${tag}: never reached half time`);
    if (!r.events.swapOk || r.events.swapWrong) failures.push(`${tag}: teams did not change ends correctly at half time`);
    if (r.states[r.states.length - 1] !== 'fulltime') failures.push(`${tag}: did not end at full time`);
    if (s.passes[0] + s.passes[1] === 0) failures.push(`${tag}: no passes were made`);
    if (r.events.overspeed) {
      failures.push(`${tag}: players exceeded sprint speed in ${r.events.overspeed} frames (max ${r.events.maxSpeed} px/s)`);
    }
    if (s.shots[0] + s.shots[1] === 0) failures.push(`${tag}: no shots were taken`);
    if (human) {
      // Scripted every match: pause/resume via ESC and the keeper held-key scenario
      for (const e of ['paused', 'resumed', 'keeperHeldKeyOk']) {
        if (!r.events[e]) failures.push(`${tag}: scripted check "${e}" did not happen`);
      }
      // Forced: the keeper takes the ball while D is still held from a charging
      // shot. He must not kick (InputSystem.sync on keeper control).
      if (r.events.keeperHeldKeyFired) failures.push(`${tag}: keeper fired an action from a held key`);
      if (r.events.humanKeeperOwnGoal) {
        failures.push(`${tag}: ${r.events.humanKeeperOwnGoal} keeper own goal(s) from a held key`);
      }
    }
  }

  // Totals over all matches (rare actions may not happen in every short match)
  const total = (name) => result.matches.reduce((sum, r) => sum + (r.events[name] ?? 0), 0);
  if (human) {
    for (const e of ['humanShot', 'humanPass', 'humanLob', 'switchDirectional']) {
      if (!total(e)) failures.push(`[${label}] human action "${e}" never happened`);
    }
    // After a human pass the passer should keep joining the attack, not drop back
    if (total('passerBack') > total('passerForward')) {
      failures.push(`[${label}] human passer dropped back more often than he went forward`);
    }
  }
  // Same for AI passers (support run)
  const aiN = total('aiPasserForward') + total('aiPasserBack');
  if (aiN && total('aiPasserBack') > total('aiPasserForward')) {
    failures.push(`[${label}] AI passer dropped back more often than he went forward`);
  }
  if (aiN) console.log(`  AI passer: avg ${Math.round(total('aiPasserMovedPx') / aiN)} px forward 1 s after a pass`);

  // Informational metrics (spacing, contacts, keepers)
  const n = total('spacingN');
  const onTarget = result.matches.reduce((s, r) => s + r.stats.onTarget[0] + r.stats.onTarget[1], 0);
  const saves = result.matches.reduce((s, r) => s + r.stats.saves[0] + r.stats.saves[1], 0);
  const goals = result.matches.reduce((s, r) => s + r.score[0] + r.score[1], 0);
  if (n) {
    console.log(
      `  spacing: avg nearest teammate ${Math.round(total('spacingSum') / n)} px, `
      + `clumped (<40px) ${(100 * total('clumpPlayers') / n).toFixed(1)}% of samples, `
      + `contacts ${total('contactPairs')} | keepers: saves ${saves}/${onTarget} on target, goals ${goals}`,
    );
  }
}

console.log(`Browser: ${browser}`);
await runSim('AI vs AI', false);
await runSim('bot as human', true);
await server.close();

if (failures.length) {
  console.error(`FAIL\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('PASS');
