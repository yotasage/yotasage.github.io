// Checks of lib/emsim (EM simulation tool). Run with `npm run check` in this folder (tsx reads the TypeScript of the
// site as it is). Each check-*.mjs module exports `run(t)`; this file runs them, prints the failures, the notes and
// one summary table; the exit code is 1 when a check fails.
//
// Environment: EMSIM_KICAD_OLD = a folder with KiCad 5–8 demo boards (pic_programmer-<tag>.kicad_pcb, …) fetched from
// KiCad's GitLab (docs/pcb-viewer/test-files.md); without it those boards are skipped with a note.

import { performance } from 'node:perf_hooks';

const MODULES = [
  ['Units', './check-units.mjs'],
  ['Stackup presets', './check-stackup.mjs'],
  ['Structure geometry', './check-geometry.mjs'],
  ['Via structures', './check-via.mjs'],
  ['KiCad reader', './check-kicad.mjs'],
  ['Link and project', './check-link.mjs'],
  ['2D solver (BEM)', './check-bem.mjs'],
  ['Modes and impedances', './check-modes.mjs'],
  ['Target, sweeps, tolerance', './check-vary.mjs'],
  ['FD reference (M1.4a)', './check-fd.mjs'],
];

const failures = [];
const notes = [];
const rows = [];

function checker(group) {
  const g = { group, total: 0, failed: 0, ms: 0 };
  const fail = (what) => { g.failed += 1; failures.push(`[${group}] ${what}`); };
  const t = {
    ok(cond, what) { g.total += 1; if (!cond) fail(typeof what === 'function' ? what() : what); return !!cond; },
    eq(actual, expected, what) {
      return t.ok(actual === expected, () => `${what}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`);
    },
    near(actual, expected, what, tol = 1e-12) {
      const good = actual === expected || Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));
      return t.ok(good, () => `${what}: got ${actual}, wanted ${expected}`);
    },
    note(text) { notes.push(`[${group}] ${text}`); },
  };
  return { g, t };
}

const t0 = performance.now();
for (const [group, path] of MODULES) {
  const { g, t } = checker(group);
  const start = performance.now();
  try {
    const m = await import(path);
    await m.run(t);
  } catch (e) {
    g.total += 1;
    g.failed += 1;
    failures.push(`[${group}] threw: ${e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e}`);
  }
  g.ms = performance.now() - start;
  rows.push(g);
}

if (notes.length) {
  console.log('Notes:');
  for (const n of notes) console.log(`  ${n}`);
}
if (failures.length) {
  console.log(`\nFailures (${failures.length}${failures.length > 60 ? ', first 60' : ''}):`);
  for (const f of failures.slice(0, 60)) console.log(`  ${f}`);
}
const w = Math.max(...rows.map((r) => r.group.length), 5);
console.log(`\n${'Group'.padEnd(w)}  Checks  Failed      ms`);
for (const r of rows) console.log(`${r.group.padEnd(w)}  ${String(r.total).padStart(6)}  ${String(r.failed).padStart(6)}  ${r.ms.toFixed(0).padStart(6)}`);
const total = rows.reduce((a, r) => a + r.total, 0);
const failed = rows.reduce((a, r) => a + r.failed, 0);
console.log(`${'All'.padEnd(w)}  ${String(total).padStart(6)}  ${String(failed).padStart(6)}  ${(performance.now() - t0).toFixed(0).padStart(6)}`);
console.log(failed ? `\nFAILED: ${failed} of ${total} checks.` : `\nPassed: all ${total} checks.`);
process.exitCode = failed ? 1 : 0;
