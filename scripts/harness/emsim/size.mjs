// The EM simulation page's first-load size (M0.5 item 7, set by M2.1a): reads the last `next build`
// (.next/build-manifest.json, the chunks under .next/static and the prerendered HTML) and reports, raw and gzip -9, the
// JavaScript and CSS a first visit of /em-sim/main loads, and the chunks it can load later (workers, `import()`).
// Fails if the first load is over its budget.
//   node size.mjs [repo]          (ui.mjs runs it after its build)

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Budgets in kB (1024 bytes) of gzip -9 (notes-M0.5.md item 7): JS 200 after M2.1a, 380 for the whole phase-1 page. */
export const SIZE = { firstJsGz: 200, cssGz: 30 };
const ROUTE = '/em-sim/main';

const here = dirname(fileURLToPath(import.meta.url));
const repoArg = process.argv.slice(2).find((a) => !a.startsWith('-'));
const repo = resolve(repoArg ?? join(here, '../../..'));
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
const kb = (n) => (n / 1024).toFixed(1);
const total = (files) => files.reduce((a, f) => { const s = sizeOf(f); a.raw += s.raw; a.gz += s.gz; return a; }, { raw: 0, gz: 0 });
const entries = (route) => [...new Set([...(manifest.polyfillFiles ?? []), ...(manifest.rootMainFiles ?? []), ...(manifest.pages['/_app'] ?? []), ...(manifest.pages[route] ?? [])])];

// The prerendered HTML names the scripts and stylesheets a first visit loads; the manifest is the fallback.
const htmlFile = [join(next, 'server/pages/em-sim/main.html'), join(next, 'server/pages/em-sim/main/index.html')].find(existsSync);
const fromHtml = (re) => (htmlFile ? [...readFileSync(htmlFile, 'utf8').matchAll(re)].map((m) => m[1]).filter((f) => existsSync(join(next, f))) : []);
const jsHtml = fromHtml(/\/_next\/(static\/[^"'?]+\.js)/g);
const cssHtml = fromHtml(/\/_next\/(static\/[^"'?]+\.css)/g);
const first = [...new Set([...jsHtml, ...entries(ROUTE).filter((f) => f.endsWith('.js'))])];
const css = [...new Set([...cssHtml, ...entries(ROUTE).filter((f) => f.endsWith('.css'))])];

/** Chunks named inside the given ones (workers, import()), followed transitively, less those already loaded. */
function laterOf(firstFiles) {
  const seen = new Set(firstFiles), out = [], todo = [...firstFiles];
  while (todo.length) {
    const f = todo.pop();
    if (/_buildManifest.js$/.test(f)) continue; // names every route's chunks, not what this page loads
    for (const m of sizeOf(f).text.matchAll(/static\/chunks\/[\w.-]+\.js/g)) {
      const g = m[0];
      if (seen.has(g) || !existsSync(join(next, g))) continue;
      seen.add(g); out.push(g); todo.push(g);
    }
  }
  return out;
}

const later = laterOf(first);
const js = total(first), cs = total(css), lt = total(later);
const verbose = process.argv.includes('-v');
console.log(`${ROUTE} first load: JS ${first.length} chunks, ${kb(js.raw)} kB, ${kb(js.gz)} kB gzip (budget ${SIZE.firstJsGz}); CSS ${css.length} files, ${kb(cs.raw)} kB, ${kb(cs.gz)} kB gzip (budget ${SIZE.cssGz}); later ${later.length} chunks, ${kb(lt.gz)} kB gzip${htmlFile ? '' : ' (no prerendered HTML: manifest only)'}`);
if (verbose) for (const f of [...first, ...css, ...later]) console.log(`  ${f}: ${kb(sizeOf(f).raw)} kB, ${kb(sizeOf(f).gz)} kB gzip`);
const over = [];
if (js.gz / 1024 > SIZE.firstJsGz) over.push(`first-load JS ${kb(js.gz)} > ${SIZE.firstJsGz} kB gzip`);
if (cs.gz / 1024 > SIZE.cssGz) over.push(`CSS ${kb(cs.gz)} > ${SIZE.cssGz} kB gzip`);
for (const o of over) console.log(`FAIL ${o}`);
process.exitCode = over.length ? 1 : 0;
