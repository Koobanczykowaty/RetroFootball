// After `vite build --mode single`: rename release/index.html to
// release/RetroFootball.html (the file testers open by double-click).
import { existsSync, renameSync, statSync } from 'node:fs';

const from = 'release/index.html';
const to = 'release/RetroFootball.html';
if (!existsSync(from)) {
  console.error(`missing ${from}`);
  process.exit(1);
}
renameSync(from, to);
console.log(`${to} (${(statSync(to).size / 1024).toFixed(0)} KB)`);
