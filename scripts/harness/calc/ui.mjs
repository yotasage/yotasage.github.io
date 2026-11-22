// UI smoke harness for Smart Calculator (/calculator/main).
// Verifies live HTTP 200 on `/` and `/calculator/main`, Design System v2 markup,
// SSR default evaluation readout, workspace/workflow tabs, and optional static export output.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const baseUrl = (process.argv[2] || process.env.CALC_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

async function fetchHtml(path) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url);
  assert.equal(res.status, 200, `Expected HTTP 200 from ${url}, got ${res.status}`);
  return res.text();
}

let checks = 0;
function check(label, fn) {
  fn();
  checks += 1;
  console.log(`  ✓ ${label}`);
}

console.log(`Smart Calculator UI smoke checks against ${baseUrl}:`);

const homeHtml = await fetchHtml('/');
check('Home page links to /calculator/main', () => {
  assert.match(homeHtml, /href="\/calculator\/main"/, 'Home page must contain a card link to /calculator/main');
});

const calcHtml = await fetchHtml('/calculator/main');
check('Calculator page uses Design System v2 and renders title', () => {
  assert.match(calcHtml, /data-ds="v2"/, 'Missing data-ds="v2" attribute');
  assert.match(calcHtml, /Smart Calculator/, 'Missing Smart Calculator heading/title');
});

check('Calculator page renders all three workspaces', () => {
  assert.match(calcHtml, /Calculator/, 'Missing Calculator workspace');
  assert.match(calcHtml, /Equation Layouts/, 'Missing Equation Layouts workspace');
  assert.match(calcHtml, /Guide/, 'Missing Guide workspace');
});

check('Calculator page renders all three workflow modes', () => {
  assert.match(calcHtml, /Hybrid \+ Tape/, 'Missing Hybrid + Tape tab');
  assert.match(calcHtml, /Notebook/, 'Missing Notebook tab');
  assert.match(calcHtml, /Quick Bar/, 'Missing Quick Bar tab');
});

check('Calculator SSR evaluates default RC cutoff expression with KaTeX MathML', () => {
  assert.match(calcHtml, /159\.155 kHz/, 'Missing SSR evaluation readout (159.155 kHz)');
  assert.match(calcHtml, /<math /, 'Missing KaTeX MathML output');
});

check('Calculator page renders Variables panel and History tape', () => {
  assert.match(calcHtml, /Variables/, 'Missing Variables panel');
  assert.match(calcHtml, /History tape/, 'Missing History tape');
});

const exportCandidates = [
  join(root, 'out', 'calculator', 'main.html'),
  join(root, 'out', 'calculator', 'main', 'index.html'),
];
const exportFile = exportCandidates.find((p) => existsSync(p));
if (exportFile) {
  const exported = readFileSync(exportFile, 'utf8');
  check('Static export contains /calculator/main HTML with SSR readout', () => {
    assert.match(exported, /Smart Calculator/);
    assert.match(exported, /159\.155 kHz/);
  });
}

console.log(`\nPASS: ${checks} Smart Calculator UI checks passed.`);
