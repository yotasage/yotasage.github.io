// Runs every browser check of the Smith chart in turn (npm run ui): a script that fails does not stop the others; the
// failures are listed at the end and the exit code is 1 if any failed. Arguments are passed on to every script.
//   node ui.mjs [screenshot folder] [base URL]

import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = ['ui-grid.mjs', 'ui-chart.mjs', 'ui-strip.mjs', 'ui-path.mjs', 'ui-drag.mjs', 'ui-edit.mjs', 'ui-theory.mjs', 'ui-why.mjs'];
// ui-grid and ui-strip take a screenshot folder as their first argument; '-' means none.
const args = process.argv.slice(2);
const failed = [];
for (const script of SCRIPTS) {
  const extra = args.length ? args : (script === 'ui-grid.mjs' || script === 'ui-strip.mjs' ? ['-'] : []);
  console.log(`\n=== ${script}`);
  const t = Date.now();
  const r = spawnSync('npx', ['tsx', script, ...extra], { cwd: here, stdio: 'inherit', shell: true });
  const s = ((Date.now() - t) / 1000).toFixed(0);
  if (r.status !== 0) failed.push(`${script} (exit ${r.status ?? r.signal}, ${s} s)`);
  else console.log(`=== ${script} passed in ${s} s`);
}
console.log(`\n${SCRIPTS.length - failed.length} of ${SCRIPTS.length} UI scripts passed.`);
for (const f of failed) console.log(`FAILED ${f}`);
process.exit(failed.length ? 1 : 0);
