// Runs the EM simulation page's browser checks (npm run ui): `next build` (next-env.d.ts written back as it was),
// size.mjs on it, then `next start` on port 3022 and every page script against it, the server stopped in `finally`.
// A script that fails does not stop the others; the failures are listed at the end and the exit code is 1 if any failed.
//   node ui.mjs [screenshot folder | -] [--no-build] [--base http://…]
// With --base the build and server are skipped and the scripts run against that address.

import { spawn, spawnSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const SCRIPTS = ['ui-stackup.mjs', 'ui-trace.mjs', 'ui-jlcpcb.mjs', 'ui-drag.mjs', 'ui-general.mjs', 'ui-fields.mjs', 'ui-tools.mjs', 'ui-calc.mjs', 'ui-theory.mjs', 'ui-via.mjs', 'ui-viadrag.mjs', 'ui-why.mjs', 'ui-release.mjs'];
const PORT = 3022;
const argv = process.argv.slice(2);
const noBuild = argv.includes('--no-build');
const bi = argv.indexOf('--base');
const given = bi >= 0 ? argv[bi + 1] : null;
const shots = argv.find((a, i) => !a.startsWith('--') && (bi < 0 || i !== bi + 1)) ?? '-';
const failed = [];

let server = null;
const stopServer = () => {
  if (!server) return;
  try { execSync(process.platform === 'win32' ? `taskkill /pid ${server.pid} /T /F` : `kill ${server.pid}`, { stdio: 'ignore' }); } catch { /* gone */ }
  server = null;
};

try {
  let base = given;
  if (!base) {
    if (!noBuild) {
      const envFile = join(repo, 'next-env.d.ts'), env = readFileSync(envFile, 'utf8');
      console.log('=== next build');
      const b = spawnSync('npm', ['run', 'build'], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'], shell: true, encoding: 'utf8' });
      writeFileSync(envFile, env);
      if (b.status !== 0) { console.log(`${b.stdout}\n${b.stderr}`.slice(-4000)); console.log('FAILED next build'); process.exit(1); }
    }
    console.log('=== size.mjs');
    if (spawnSync('node', ['size.mjs'], { cwd: here, stdio: 'inherit', shell: true }).status !== 0) failed.push('size.mjs (over budget)');
    base = `http://localhost:${PORT}`;
    const up = async () => { try { return (await fetch(`${base}/em-sim/main`)).ok; } catch { return false; } };
    if (await up()) { console.log(`Port ${PORT} is taken: stop what serves it first.`); process.exit(1); }
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], { cwd: repo, shell: true, stdio: 'ignore' });
    const until = Date.now() + 60000;
    while (!(await up())) {
      if (Date.now() > until) { console.log('FAILED next start did not answer'); stopServer(); process.exit(1); }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  for (const script of SCRIPTS) {
    console.log(`=== ${script}`);
    const t = Date.now();
    const r = spawnSync('npx', ['tsx', script, shots, base], { cwd: here, stdio: 'inherit', shell: true });
    const s = ((Date.now() - t) / 1000).toFixed(0);
    if (r.status !== 0) failed.push(`${script} (exit ${r.status ?? r.signal}, ${s} s)`);
    else console.log(`=== ${script} passed in ${s} s`);
  }
} finally {
  stopServer();
}
console.log(`\n${SCRIPTS.length - failed.filter((f) => f.startsWith('ui-')).length} of ${SCRIPTS.length} UI scripts passed.`);
for (const f of failed) console.log(`FAILED ${f}`);
process.exit(failed.length ? 1 : 0);
