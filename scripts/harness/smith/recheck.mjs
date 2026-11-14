// npm run recheck (M9.4): every "done when" of docs/smith-chart/milestones.md M1–M9, run again, in one summary.
// Runs the engine checks (check.mjs, with the TikZ compiles), the resistor harness (M1 keeps it passing) and the
// production UI suite (ui.mjs --prod: next build, size.mjs, all 22 browser scripts against next start), then prints
// per milestone each "done when" item with the checks that prove it (the roll-ups of notes-M3.5, M4.4b, M5.4, M6.3b,
// M7.4b, M8.3b and notes-M9.x), pass or fail. Exit 1 if any item fails or a check it needs did not run.
//   node recheck.mjs [--no-ui] [--memory]
// --no-ui: engine and resistor checks only (the UI items then read "not run", which fails).
// --memory: also ui-memory.mjs (10 minutes) for M9's memory budget.
// Items marked "record" are a reading or a look by a person or an agent, done once and written down in the file named;
// they are listed, not run, and do not fail.

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const withUi = !args.includes('--no-ui');
const withMemory = args.includes('--memory');

/** Runs a command, its output shown as it comes and kept for parsing. */
function run(cmd, cmdArgs, cwd) {
  return new Promise((done) => {
    let text = '';
    const t = Date.now();
    const p = spawn(cmd, cmdArgs, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const take = (to) => (b) => { text += b.toString('utf8'); to.write(b); };
    p.stdout.on('data', take(process.stdout));
    p.stderr.on('data', take(process.stderr));
    p.on('close', (code) => done({ code, text, s: Math.round((Date.now() - t) / 1000) }));
  });
}

// --- What each check reports --------------------------------------------------------------------------------------
// e: a section of check.mjs (pass when it ran and no FAIL line names it); ui: a script of ui.mjs (pass when ui.mjs
// printed "=== <script> passed"); size: size.mjs inside ui.mjs; r: the resistor harness; mem: ui-memory.mjs; rec: record.
const e = (name) => ({ e: name });
const ui = (name) => ({ ui: `ui-${name}.mjs` });
const rec = (file) => ({ rec: file });

const ITEMS = {
  M1: [
    ['Every facts.md case reproduced to the digits the source gives', [e('facts-cases C1–C11'), e('network cases C12–C28')]],
    ['A second computation agrees to 1e-12 on 10,000 random circuits', [e('network vs impedances')]],
    ['Round trips (Γ → z → Γ, y = 1/z) to 1e-12', [e('round trips')]],
    ['A fuzz of 100,000 circuits with 0, ∞, open and short gives no NaN or ∞', [e('no NaN'), e('network fuzz 0 and ∞'), e('geometry fuzz 0 and ∞')]],
    ['Direction of travel of every part; λ/8, λ/4 with Zt ≠ Z0, line periodicity', [e('network direction and lines'), e('geometry direction')]],
    ['Every arc starts and ends on its nodes, its midpoint on the locus', [e('geometry arcs')]],
    ['Value → point → value to 1e-9 for every part kind', [e('geometry values')]],
    ['Every registry equation and derivation step against the engine', [e('equations registry'), e('equations vs engine')]],
    ['The resistor harness still passes', [{ r: 'resistor check.mjs' }]],
    ['Time of 10 parts at 2,000 frequencies recorded', [e('network timing')]],
  ],
  M2: [
    ['Grid circles read back from the DOM lie on their circles to 1e-9', [e('grid: circles and ends'), ui('grid')]],
    ['No overlapping labels at five zoom levels', [e('grid: labels'), ui('grid')]],
    ['The readout matches the engine at 20 points', [ui('chart')]],
    ['Frame time within budget while zooming at 1× and 4× (production budgets of timing.mjs)', [ui('chart')]],
    ['Pinch and drag work in touch emulation', [ui('chart'), ui('browsers')]],
    ['Usable at 320 px', [ui('grid'), ui('chart')]],
  ],
  M3: [
    ['Typing a value and dragging to it agree to the shown digits', [ui('drag')]],
    ['Edit → chart → drag back gives the same value to 1e-9', [ui('drag')]],
    ['Undo and redo hold under random sequences', [ui('edit')]],
    ['Scripted drags on every part kind, by mouse and by touch', [ui('drag'), ui('edit')]],
    ['The link round-trips', [e('state: link round trip'), ui('strip'), ui('edit')]],
    ['The main tasks work by keyboard alone', [ui('strip'), ui('edit'), ui('why'), ui('a11y')]],
    ['Every live number in the theory equals the engine\'s', [ui('theory')]],
    ['Every citation resolves', [ui('theory')]],
    ['Every claim has a source or a derivation', [rec('claims.md; sample read again in notes-M9.4.md')]],
    ['The layout holds at 320 and 390 px', [ui('strip'), ui('path'), ui('drag'), ui('edit'), ui('theory'), ui('why')]],
  ],
  M4: [
    ['Exact cases have a residual below 1e-9', [e('validate closed-form cases'), e('validate regressions'), e('suggest: re-evaluated, singles vs scan, pairs vs solve'), ui('solve')]],
    ['Brute force finds no missed solution on 200+ random problems of each kind', [e('validate two unknowns, point target'), e('validate one unknown, circle goal'), e('validate one unknown, best value'), e('validate one unknown, ranges'), e('validate two unknowns, family'), e('validate fallback, one unknown'), e('validate fallback, two unknowns')]],
    ['The same input gives the same order', [e('validate determinism')]],
    ['Time within budget (slow solves in the worker)', [e('solve timing'), e('solve M4.1b timing'), e('suggest: timing'), ui('solve')]],
    ['A scripted case reaches every message of the counting table', [ui('solve')]],
  ],
  M5: [
    ['Every equation on screen passes the numeric check', [e('equations vs engine'), e('explain: parts'), ui('math'), ui('derive'), ui('explain')]],
    ['TeX renders with errors turned on', [ui('math'), ui('derive'), ui('explain')]],
    ['Screenshots in Edge, Firefox and WebKit (MathML laid out)', [ui('browsers')]],
    ['The panel within budget at 1× and 4×', [ui('math'), ui('drag')]],
    ['A fresh reading agent reads every derivation through', [rec('notes-M5.3.md "Read-through"')]],
    ['No number below the rounding floor of D20 in scientific notation', [e('quantity: rounding level (D20)'), ui('math')]],
  ],
  M6: [
    ['Every example\'s stated answer reproduced by the engine', [e('teach: examples')]],
    ['Three examples by keyboard, three by touch, "done" at each step', [ui('learn')]],
    ['1,000 challenges per kind solvable and in range; same seed, same problem', [e('teach: challenges'), ui('challenge')]],
    ['A challenge is reached by the revealed solution, not by the start state', [e('teach: challenges'), ui('challenge')]],
    ['Lesson links round-trip (every lock, hidden panel, any text)', [e('teach: lesson links'), ui('challenge')]],
    ['A locked control cannot be changed from the page', [ui('challenge')]],
    ['Layouts hold at 320 and 390 px', [ui('learn'), ui('challenge')]],
  ],
  M7: [
    ['Every swept point equals the point engine to 1e-12', [e('sweep vs point engine'), ui('trace')]],
    ['Band figures match a 10⁶-point brute force and the closed forms', [e('sweep figures vs brute force'), e('sweep closed forms')]],
    ['A 10,000-point trace redraws within budget at 1× and 4× while dragging', [ui('trace'), ui('drag')]],
    ['Plot and chart point at the same frequency both ways, mouse and touch', [ui('plot')]],
    ['The printed report fits A4 and Letter in both themes, nothing cut', [ui('report')]],
  ],
  M8: [
    ['The LaTeX export\'s checks (read-back, compile, MediaBox, pixels, text, palettes)', [e('tikz read-back'), e('tikz text and linewidth'), e('tikz compile'), e('tikz pixels'), e('figure text and palettes')]],
    ['The standalone SVG matches the on-screen geometry', [e('figure geometry'), ui('export')]],
    ['PNG at 1×, 2× and 8× has the expected pixel size', [ui('export')]],
    ['The .s1p is read back by a reference parser to 1e-12', [e('export touchstone reader'), e('export touchstone'), ui('files')]],
    ['CSVs read back to the shown digits', [e('export csv'), ui('files')]],
    ['The project file round-trips; a version-0 file migrates', [e('export project'), ui('files')]],
    ['The preview\'s frame is the chosen width in CSS mm at three sizes', [ui('export')]],
    ['Layouts hold at 320 and 390 px', [ui('export'), ui('files'), ui('edit')]],
  ],
  M9: [
    ['No contrast pair under WCAG AA, in both themes', [ui('a11y')]],
    ['Every task by keyboard alone and by touch emulation in three browsers', [ui('a11y'), ui('browsers')]],
    ['Budgets met: frames at 1× and 4×, script size', [{ size: true }, ui('drag'), ui('chart'), ui('trace'), ui('path')]],
    ...(withMemory ? [['Memory over a 10-minute session', [{ mem: true }]]] : []),
    ['Screenshots at 320, 390, 768 and 1440 px in both themes looked at', [rec('notes-M9.1.md, notes-M9.2.md')]],
    ['The status note says what the tool does now', [rec('notes-M9.4.md (fresh reading check)')]],
  ],
};

// --- Run ------------------------------------------------------------------------------------------------------------
const t0 = Date.now();
console.log('\n##### recheck: engine checks (check.mjs)');
const engine = await run('npx', ['tsx', 'check.mjs'], here);
console.log('\n##### recheck: resistor harness');
const resistor = await run('npx', ['tsx', 'check.mjs'], resolve(here, '../resistor'));
let uiRun = null, memRun = null;
if (withUi) { console.log('\n##### recheck: production UI suite (ui.mjs --prod)'); uiRun = await run('node', ['ui.mjs', '--prod'], here); }
if (withMemory) { console.log('\n##### recheck: memory (ui-memory.mjs)'); memRun = await run('npx', ['tsx', 'ui-memory.mjs'], here); }

// --- Parse ----------------------------------------------------------------------------------------------------------
const groupLine = engine.text.split(/\r?\n/).find((l) => / · /.test(l) && /complex \d+/.test(l)) ?? '';
const groups = new Map(groupLine.split(' · ').map((g) => { const m = g.match(/^(.*) (\d+)$/); return m ? [m[1], Number(m[2])] : [g, 0]; }));
const failedGroups = new Set([...engine.text.matchAll(/^FAIL \[([^\]]+)\]/gm)].map((m) => m[1]));
const truncated = /… and \d+ more failures/.test(engine.text);
const tikzSkipped = /tikz compile: skipped/.test(engine.text);
const uiPassed = new Set(uiRun ? [...uiRun.text.matchAll(/^=== (ui-[\w-]+\.mjs) passed/gm)].map((m) => m[1]) : []);
const sizeRan = uiRun ? /=== size\.mjs/.test(uiRun.text) : false;
const sizeFailed = uiRun ? /FAILED size\.mjs/.test(uiRun.text) : true;

/** pass | fail | not run | skipped | record, for one check. */
function status(c) {
  if (c.rec) return 'record';
  if (c.e) {
    if (c.e.startsWith('tikz compile') || c.e.startsWith('tikz pixels')) { if (tikzSkipped) return 'skipped'; }
    if (!groups.has(c.e)) return engine.code === 0 ? 'not run' : 'fail';
    if (failedGroups.has(c.e) || (truncated && engine.code !== 0)) return 'fail';
    return 'pass';
  }
  if (c.r) return resistor.code === 0 ? 'pass' : 'fail';
  if (c.ui) return !uiRun ? 'not run' : uiPassed.has(c.ui) ? 'pass' : 'fail';
  if (c.size) return !uiRun ? 'not run' : sizeRan && !sizeFailed ? 'pass' : 'fail';
  if (c.mem) return memRun?.code === 0 ? 'pass' : 'fail';
  return 'fail';
}
const label = (c) => c.e ? `check "${c.e}"` : c.r ? c.r : c.ui ? c.ui : c.size ? 'size.mjs' : c.mem ? 'ui-memory.mjs' : `record: ${c.rec}`;

// --- Summary --------------------------------------------------------------------------------------------------------
console.log(`\n${'='.repeat(100)}\nRECHECK SUMMARY: every "done when" of milestones.md M1–M9\n${'='.repeat(100)}`);
let items = 0, bad = 0, records = 0;
for (const [m, list] of Object.entries(ITEMS)) {
  const results = list.map(([what, checks]) => {
    const st = checks.map((c) => [c, status(c)]);
    const fails = st.filter(([, s]) => s !== 'pass' && s !== 'record');
    const isRecord = st.every(([, s]) => s === 'record');
    return { what, st, fails, verdict: isRecord ? 'RECORD' : fails.length ? 'FAIL' : 'pass' };
  });
  const mBad = results.filter((r) => r.verdict === 'FAIL').length;
  console.log(`\n${m}: ${mBad ? `${mBad} of ${results.length} items FAIL` : `all ${results.length} items pass or on record`}`);
  for (const r of results) {
    items++;
    if (r.verdict === 'FAIL') bad++;
    if (r.verdict === 'RECORD') records++;
    console.log(`  ${r.verdict.padEnd(6)} ${r.what}`);
    console.log(`         ${r.st.map(([c, s]) => s === 'pass' || s === 'record' ? label(c) : `${label(c)} [${s.toUpperCase()}]`).join('; ')}`);
  }
}
const engineLine = engine.text.match(/smith library: .*/)?.[0] ?? 'smith library: no summary';
const uiLine = uiRun ? uiRun.text.match(/\d+ of \d+ UI scripts passed.*/)?.[0] ?? 'UI suite: no summary' : 'UI suite: not run (--no-ui)';
console.log(`\n${engineLine} (${engine.s} s)\nresistor harness: exit ${resistor.code} (${resistor.s} s)\n${uiLine}${uiRun ? ` (${uiRun.s} s)` : ''}`);
if (tikzSkipped) console.log('The TikZ compiles were skipped (no pdflatex): install TeX Live to run them.');
console.log(`\n${items - bad} of ${items} "done when" items pass (${records} on record), ${bad} fail; ${Math.round((Date.now() - t0) / 60000)} min.`);
process.exit(bad || engine.code !== 0 || resistor.code !== 0 || (uiRun && uiRun.code !== 0) ? 1 : 0);
