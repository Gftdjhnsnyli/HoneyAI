// Smoke test: boots the packaged build with --smoke-test, which verifies
// both renderers and exits 0 (PASS) or 1 (FAIL). Usage: npm run smoke
// (requires a previous `npm run dist` so win-unpacked exists).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const exe = path.join(root, 'release', 'win-unpacked', 'Honey.exe');
if (!fs.existsSync(exe)) {
  console.error('smoke: packaged exe missing — run `npm run dist` first');
  process.exit(2);
}
const logFile = path.join(os.homedir(), 'AppData', 'Roaming', 'Honey', 'logs', 'startup.log');
let mark = 0;
try { mark = fs.statSync(logFile).size; } catch { /* first run */ }

console.log('smoke: launching packaged build…');
const child = spawn(exe, ['--smoke-test'], { stdio: 'ignore' });
const kill = setTimeout(() => {
  try { child.kill(); } catch { /* already gone */ }
}, 55000);
child.on('exit', (code) => {
  clearTimeout(kill);
  let tail = '';
  try {
    const full = fs.readFileSync(logFile, 'utf8');
    tail = full.slice(mark).trim().split(/\r?\n/).slice(-12).join('\n');
  } catch { /* log unreadable */ }
  if (tail) console.log('--- log tail ---\n' + tail);
  if (code === 0) console.log('smoke: PASS');
  else console.log(`smoke: FAIL (exit ${code})`);
  process.exit(code === 0 ? 0 : 1);
});
child.on('error', (err) => {
  clearTimeout(kill);
  console.error('smoke: could not launch:', err.message);
  process.exit(2);
});
