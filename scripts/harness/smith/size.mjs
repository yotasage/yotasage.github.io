// The Smith chart's script size (step M9.3, engine.md §9): reads the last `next build` (.next/build-manifest.json and
// the chunks under .next/static) and reports, raw and gzip -9, the JavaScript a first visit of /smith-chart/main loads
// before the page runs (the app's and the route's chunks) and the chunks it loads later (workers and `import()`ed
// chunks named in the route's chunks), next to the resistor page's first load. Fails if the first load is over SIZE.
//   node size.mjs [repo]          (ui.mjs --prod runs it after its build)

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Budgets in kB (1024 bytes) of gzip -9: the first load of /smith-chart/main and everything it can load later (M9.3:
 * 423.1 and 36.3 kB. The resistor page loads 278.6 kB with the same KaTeX and app chunks: the 145 kB more are the Smith
 * page's own code: engine, solver, equations, theory, Learn, report and export; notes-M9.3.md). */
export const SIZE = { firstGz: 430, laterGz: 45 };

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(process.argv[2] ?? join(here, '../../..'));
const next = join(repo, '.next');
if (!existsSync(join(next, 'build-manifest.json'))) { console.error('No production build: run npm run build first.'); process.exit(1); }
const manifest = JSON.parse(readFileSync(join(next, 'build-manifest.json'), 'utf8'));

const cache = new Map();
function sizeOf(file) {
  if (!cache.has(file)) {
    const b = readFileSync(join(next, file));
    cache.set(file, { raw: b.length, gz: gzipSync(b, { level: 9 }).length, text: b.toString('utf8') });
  }
  return cache.get(file);
}
const firstOf = (route) => [...new Set([...(manifest.polyfillFiles ?? []), ...(manifest.rootMainFiles ?? []), ...(manifest.pages['/_app'] ?? []), ...(manifest.pages[route] ?? [])])].filter((f) => f.endsWith('.js'));
const kb = (n) => (n / 1024).toFixed(1);
const total = (files) => files.reduce((a, f) => { const s = sizeOf(f); a.raw += s.raw; a.gz += s.gz; return a; }, { raw: 0, gz: 0 });

/** Chunks named inside the given ones (workers, import()), followed transitively, less those already loaded. */
function laterOf(first) {
  const seen = new Set(first), out = [], todo = [...first];
  while (todo.length) {
    const f = todo.pop();
    for (const m of sizeOf(f).text.matchAll(/static\/chunks\/[\w.-]+\.js/g)) {
      const g = m[0];
      if (seen.has(g) || !existsSync(join(next, g))) continue;
      seen.add(g); out.push(g); todo.push(g);
    }
  }
  return out;
}

const smithFirst = firstOf('/smith-chart/main'), smithLater = laterOf(smithFirst);
const first = total(smithFirst), later = total(smithLater), resistor = total(firstOf('/resistor/main')), app = total(firstOf('/_app'));
console.log(`/smith-chart/main first load: ${smithFirst.length} chunks, ${kb(first.raw)} kB, ${kb(first.gz)} kB gzip (the app's own ${kb(app.raw)} / ${kb(app.gz)}); budget ${SIZE.firstGz} kB gzip`);
for (const f of smithFirst.slice().sort((a, b) => sizeOf(b).raw - sizeOf(a).raw)) console.log(`  ${f}: ${kb(sizeOf(f).raw)} kB, ${kb(sizeOf(f).gz)} kB gzip`);
console.log(`loaded later (workers, import()): ${smithLater.length} chunks, ${kb(later.raw)} kB, ${kb(later.gz)} kB gzip; budget ${SIZE.laterGz} kB gzip`);
for (const f of smithLater.slice().sort((a, b) => sizeOf(b).raw - sizeOf(a).raw)) console.log(`  ${f}: ${kb(sizeOf(f).raw)} kB, ${kb(sizeOf(f).gz)} kB gzip`);
console.log(`/resistor/main first load for comparison: ${kb(resistor.raw)} kB, ${kb(resistor.gz)} kB gzip`);
const over = [];
if (first.gz / 1024 > SIZE.firstGz) over.push(`first load ${kb(first.gz)} > ${SIZE.firstGz} kB gzip`);
if (later.gz / 1024 > SIZE.laterGz) over.push(`later chunks ${kb(later.gz)} > ${SIZE.laterGz} kB gzip`);
for (const o of over) console.log(`FAIL ${o}`);
console.log(`script size: ${over.length ? 'over budget' : 'within budget'}`);
process.exitCode = over.length ? 1 : 0;
