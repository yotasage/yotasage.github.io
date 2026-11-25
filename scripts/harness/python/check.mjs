// Python Playground Engine Harness (`npm run check` in scripts/harness/python/).
// Runs:
//   Part A: Pure-Node unit checks for lib/python/{network,protocol,tiers}.ts + coi-sw.js parity.
//   Part B: 3-browser static-export verification (Edge msedge, Firefox, WebKit) against
//           http://localhost:3023 (zero custom headers) + http://127.0.0.1:3024 (second origin).
// Flags:
//   --no-build              Skip running `npm run build:export` when out/python/harness.html exists
//   PYTHON_BROWSERS=edge,firefox,webkit  Restrict browser list (default: all 3)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, firefox, webkit } from 'playwright-core';

import { runCorpusChecks } from './corpus-checks.mjs';
import { runFsChecks } from './fs-checks.mjs';
import { runSecurityChecks } from './security-checks.mjs';
import { startHarnessServers } from './servers.mjs';
import { runUnitChecks } from './unit-checks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const outDir = join(repoRoot, 'out');
const argv = process.argv.slice(2);
const noBuild = argv.includes('--no-build');
const BROWSERS = (process.env.PYTHON_BROWSERS || 'edge,firefox,webkit')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const table = new Map();
const allFailures = [];
let totalPassed = 0;
let totalFailed = 0;

function setCell(feature, browser, val) {
  const row = table.get(feature) || {};
  row[browser] = val;
  table.set(feature, row);
}

async function record(browser, name, fn, note = '') {
  let res;
  let timer = null;
  try {
    res = await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out after 60s')), 60000);
      }),
    ]);
  } catch (err) {
    res = `threw ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (res === true) {
    totalPassed += 1;
    setCell(name, browser, note ? `ok (${note})` : 'ok');
    console.log(`  PASS [${browser}] ${name}${note ? ` (${note})` : ''}`);
    return true;
  }
  totalFailed += 1;
  const reason = typeof res === 'string' ? res : 'failed';
  setCell(name, browser, `FAIL`);
  allFailures.push(`[${browser}] ${name}: ${reason}`);
  console.log(`  FAIL [${browser}] ${name}: ${reason}`);
  return false;
}

async function launchBrowser(name) {
  if (name === 'edge' || name === 'msedge' || name === 'chromium') {
    return chromium.launch({ channel: 'msedge' });
  }
  if (name === 'firefox') {
    return firefox.launch();
  }
  if (name === 'webkit') {
    return webkit.launch();
  }
  throw new Error(`Unknown browser: ${name}`);
}

console.log('=== Part A: Pure-Node Unit Checks ===');
const unit = await runUnitChecks();
totalPassed += unit.passed;
totalFailed += unit.failed;
allFailures.push(...unit.failures);

if (!noBuild || !existsSync(join(outDir, 'python', 'harness.html'))) {
  console.log('\n=== Building Static Export (npm run build:export) ===');
  const build = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'build-export.mjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (build.status !== 0) {
    console.error('FAILED: build-export.mjs');
    process.exit(1);
  }
} else {
  console.log('\n=== Reusing existing static export in out/ (--no-build) ===');
}

const servers = await startHarnessServers(outDir, { primaryPort: 3023, secondaryPort: 3024 });
const browserMetrics = {};

try {
  for (const b of BROWSERS) {
    console.log(`\n=== Part B: Browser Verification (${b}) ===`);
    let browser = null;
    try {
      browser = await launchBrowser(b);
      const version = browser.version();
      console.log(`  Launched ${b} ${version}`);
      setCell('Browser version', b, version);

      const metrics = await runCorpusChecks(b, browser, {
        primaryOrigin: servers.primaryOrigin,
        record,
      });
      browserMetrics[b] = { version, ...metrics };

      await runSecurityChecks(b, browser, {
        primaryOrigin: servers.primaryOrigin,
        secondaryOrigin: servers.secondaryOrigin,
        getHits: servers.getHits,
        resetHits: servers.resetHits,
        record,
      });

      await runFsChecks(b, browser, {
        primaryOrigin: servers.primaryOrigin,
        record,
      });
    } catch (err) {
      totalFailed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      allFailures.push(`[${b}] browser run crashed: ${msg}`);
      console.log(`  FAIL [${b}] browser run crashed: ${msg}`);
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }
} finally {
  await servers.stop();
}

console.log('\n=== Summary Table ===');
console.log(`| Check | ${BROWSERS.join(' | ')} |`);
console.log(`| --- | ${BROWSERS.map(() => '---').join(' | ')} |`);
for (const [feat, row] of table) {
  console.log(`| ${feat} | ${BROWSERS.map((b) => row[b] || '–').join(' | ')} |`);
}

console.log('\n=== Latency & Recovery Metrics ===');
for (const [b, m] of Object.entries(browserMetrics)) {
  const fmt = (v) => (typeof v === 'number' ? `${v.toFixed(1)} ms` : 'n/a');
  console.log(
    `  ${b} (${m.version}): SoftStop(20) min=${fmt(m.stopMinMs)} median=${fmt(m.stopMedianMs)} p95=${fmt(m.stopP95Ms)} max=${fmt(m.stopMaxMs)} | sleepStop=${fmt(m.sleepStopMs)} | asyncioStop=${fmt(m.asyncioStopMs)} | forceStopTotal=${fmt(m.forceStopTotalMs)} restart=${fmt(m.forceStopRestartMs)} | Tier2=${m.tier2Tier}`,
  );
}

console.log(`\nTotal: ${totalPassed} passed, ${totalFailed} failed.`);
if (allFailures.length > 0) {
  console.log('\nFailures:');
  for (const f of allFailures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
