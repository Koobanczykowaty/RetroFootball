// Smoke test of the desktop app: runs Electron (or, with --packaged, the
// built release-desktop/win-unpacked/RetroFootball.exe) with a bot-as-human
// simulation match and checks the result the app prints.
// Needs desktop/web first (npm run desktop / npm run build:desktop).
//   node scripts/desktop-test.mjs [--packaged] [minutes]
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const packaged = process.argv.includes('--packaged');
const minutes = Number(process.argv.find((a) => /^[\d.]+$/.test(a)) ?? 0.5);
const require = createRequire(import.meta.url);

let cmd;
let args;
if (packaged) {
  cmd = 'release-desktop/win-unpacked/RetroFootball.exe';
  args = [];
} else {
  cmd = require('electron'); // path of the Electron binary
  args = ['.'];
}
if (!existsSync(packaged ? cmd : 'desktop/web/index.html')) {
  console.error(packaged ? `missing ${cmd} (run npm run build:desktop)` : 'missing desktop/web (run npm run desktop)');
  process.exit(1);
}

console.log(`[desktop] ${packaged ? 'packaged app' : 'electron .'}: 1 bot-as-human match of ${minutes} min`);
const child = spawn(cmd, args, {
  env: { ...process.env, RF_QUERY: `?sim=1&minutes=${minutes}&human=1`, ELECTRON_ENABLE_LOGGING: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', (d) => { out += d; });
child.stderr.on('data', () => {});
child.on('exit', (code) => {
  const line = out.split('\n').find((l) => l.startsWith('RF_RESULT '));
  const failures = [];
  if (!out.includes('RF_BRIDGE function')) failures.push('window.retroDesktop.quit is missing (preload)');
  if (!line) failures.push(`no result (exit code ${code})${out.includes('RF_TIMEOUT') ? ', timed out' : ''}`);
  else {
    const r = JSON.parse(line.slice('RF_RESULT '.length));
    if (r.errors.length) failures.push(`runtime errors: ${r.errors.join(' | ')}`);
    const m = r.matches[0];
    if (!m) failures.push('no match recorded');
    else {
      console.log(`  ${m.score[0]}-${m.score[1]}, states ${m.states.join(' > ')}, ${m.realSeconds}s`);
      if (m.states[m.states.length - 1] !== 'fulltime') failures.push('did not reach full time');
      for (const e of ['humanPass', 'paused', 'resumed']) if (!m.events[e]) failures.push(`"${e}" never happened`);
    }
  }
  if (failures.length) {
    console.log('FAIL');
    for (const f of failures) console.log(`- ${f}`);
    process.exit(1);
  }
  console.log('PASS');
});
