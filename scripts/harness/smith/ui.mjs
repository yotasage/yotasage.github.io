// Runs every browser check of the Smith chart in turn (npm run ui with --prod, npm run ui:dev without): a script that fails does not stop the others; the
// failures are listed at the end and the exit code is 1 if any failed. Arguments are passed on to every script.
//   node ui.mjs [--prod] [screenshot folder] [base URL]
// --prod (M9.3): `next build`, then size.mjs on it (the script size per route against its budget), then every script
// against `next start` on port 3021, stopped at the end; next-env.d.ts is written back as it was before the build.
// The timing checks then hold the production budgets of timing.mjs (on a dev server they are × devFactor).

import { spawn, spawnSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const SCRIPTS = ['ui-grid.mjs', 'ui-chart.mjs', 'ui-strip.mjs', 'ui-path.mjs', 'ui-drag.mjs', 'ui-trace.mjs', 'ui-plot.mjs', 'ui-report.mjs', 'ui-export.mjs', 'ui-files.mjs', 'ui-edit.mjs', 'ui-theory.mjs', 'ui-why.mjs', 'ui-solve.mjs', 'ui-math.mjs', 'ui-math-link.mjs', 'ui-derive.mjs', 'ui-explain.mjs', 'ui-learn.mjs', 'ui-challenge.mjs', 'ui-a11y.mjs', 'ui-browsers.mjs'];
const PROD_PORT = 3021;
let args = process.argv.slice(2);
const prod = args.includes('--prod');
args = args.filter((a) => a !== '--prod');
const failed = [];

let server = null;
const stopServer = () => {
  if (!server) return;
  try { execSync(process.platform === 'win32' ? `taskkill /pid ${server.pid} /T /F` : `kill ${server.pid}`, { stdio: 'ignore' }); } catch { /* gone */ }
  server = null;
};
if (prod) {
  const envFile = join(repo, 'next-env.d.ts'), env = readFileSync(envFile, 'utf8');
  console.log('\n=== next build');
  const b = spawnSync('npm', ['run', 'build'], { cwd: repo, stdio: 'inherit', shell: true });
  writeFileSync(envFile, env);
  if (b.status !== 0) { console.log('FAILED next build'); process.exit(1); }
  console.log('\n=== size.mjs');
  if (spawnSync('node', ['size.mjs'], { cwd: here, stdio: 'inherit', shell: true }).status !== 0) failed.push('size.mjs (script size over budget)');
  const base = `http://localhost:${PROD_PORT}`;
  const up = async () => { try { return (await fetch(`${base}/smith-chart/main`)).ok; } catch { return false; } };
  if (await up()) { console.log(`Port ${PROD_PORT} is taken: stop what serves it first.`); process.exit(1); }
  server = spawn('npx', ['next', 'start', '-p', String(PROD_PORT)], { cwd: repo, shell: true, stdio: 'ignore' });
  const until = Date.now() + 60000;
  while (!(await up())) {
    if (Date.now() > until) { console.log('FAILED next start did not answer'); stopServer(); process.exit(1); }
    await new Promise((r) => setTimeout(r, 500));
  }
  args = [args[0] ?? '-', base];
}

for (const script of SCRIPTS) {
  // ui-grid and ui-strip take a screenshot folder as their first argument; '-' means none.
  const extra = args.length ? args : (script === 'ui-grid.mjs' || script === 'ui-strip.mjs' ? ['-'] : []);
  console.log(`\n=== ${script}`);
  const t = Date.now();
  const r = spawnSync('npx', ['tsx', script, ...extra], { cwd: here, stdio: 'inherit', shell: true });
  const s = ((Date.now() - t) / 1000).toFixed(0);
  if (r.status !== 0) failed.push(`${script} (exit ${r.status ?? r.signal}, ${s} s)`);
  else console.log(`=== ${script} passed in ${s} s`);
}
stopServer();
console.log(`\n${SCRIPTS.length - failed.filter((f) => f.startsWith('ui-')).length} of ${SCRIPTS.length} UI scripts passed${prod ? ` on a production build (port ${PROD_PORT})` : ''}.`);
for (const f of failed) console.log(`FAILED ${f}`);
process.exit(failed.length ? 1 : 0);
