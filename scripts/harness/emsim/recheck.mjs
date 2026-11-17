// npm run recheck (M9.3a): every "done when" of docs/em-sim/milestones.md M0.1–M9.2 (with the split and fix steps), run
// again or read from where it is recorded, as one Markdown table with totals. As the Smith chart's recheck.mjs.
//
// It runs, each once: the engine checks (check.mjs), the Smith chart's engine checks and its five browser scripts on
// the shared equation engine, dialog, MathML and theory (lib/equations/, lib/complex.ts, components/Equations/,
// KatexSpan: shared since M2.4b and M4.3a), `next build` (again once if it stops, as Next.js's security notice now and
// then makes it), size.mjs, `next start` on port 3022, every page script of ui.mjs against it (a script that fails is
// run once more alone; the row then says "on retry"), then stops the server. It parses their output and does not run
// anything twice. A few done-whens about the docs (file sizes, the cases, the claims' form, references.bib) it checks
// itself. Each step's parts are: pass / fail (a known miss with its backlog id does not fail the exit code) / not
// checked (with the reason and backlog id) / recorded (a measurement or reading done once, with where it is written) /
// owner (needs the owner). The steps are compared with milestones.md's headings, bold sub-steps and notes files: a step
// without a row fails the recheck.
//
//   npx tsx recheck.mjs [--no-build] [--long] [--no-smith] [--out <file.md>] [--logs <dir>]
//
// --no-build  reuse the last `next build` (.next/BUILD_ID must exist), for a build just made.
// --long      also the long runs: EMSIM_FDTD_LONG=1 (check.mjs), EMSIM_WAVES_LONG=1 and EMSIM_SESSION_LONG=1 (ui.mjs),
//             and the FD fuzz of 500 structures (fd/fuzz.mts, about 15 min); without it their rows give the last
//             recorded result from the notes.
// --no-smith  leave out the Smith chart's checks (their parts read "not run", which fails).
// --out       where the table goes (default: <tmp>/emsim-recheck/recheck.md, never the repo).
// --logs      parse the logs of an earlier run in that folder (written there by every run, with codes.json) instead
//             of running anything; for work on this parser.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const smithDir = resolve(here, '../smith');
const docs = join(repo, 'docs/em-sim');
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const LONG = argv.includes('--long');
const NO_BUILD = argv.includes('--no-build');
const NO_SMITH = argv.includes('--no-smith');
const fromLogs = opt('--logs');
const outFile = resolve(opt('--out') ?? join(tmpdir(), 'emsim-recheck', 'recheck.md'));
const logDir = fromLogs ? resolve(fromLogs) : join(dirname(outFile), 'recheck-logs');
const PORT = 3022;
const BASE = `http://localhost:${PORT}`;
// The Smith chart's browser scripts on the shared modules (its notes-M9.4.md lists what each covers).
const SMITH_UI = ['ui-math.mjs', 'ui-math-link.mjs', 'ui-derive.mjs', 'ui-explain.mjs', 'ui-theory.mjs'];

// --- What each step's done-when is and what checks it ---------------------------------------------------------------
// e: a group of check.mjs (pass when it ran without a failure; `skip` a regex on its notes that means a part did not
// run); ui: a script of ui.mjs; perf: a row of ui-perf.mjs's budget table ('1x', '4x' or 'all' of its verdict); size:
// size.mjs; build: next build; smith: the Smith chart's check.mjs or one of its scripts; doc: a check of the docs made
// here; fuzz: the FD fuzz (--long); rec: done once, written where named; owner; none: not checked now (reason, backlog);
// long: a long run behind a flag, its recorded result unless --long; known: a known miss (fail without failing the run).
const e = (group, skip) => ({ e: group, skip });
const ui = (name) => ({ ui: `ui-${name}.mjs` });
const perf = (task, which = 'all') => ({ perf: task, which });
const size = { size: true };
const build = { build: true };
const smith = (what) => ({ smith: what });
const doc = (what) => ({ doc: what });
const rec = (where) => ({ rec: where });
const owner = (why) => ({ owner: why });
const none = (why) => ({ none: why });
const long = (flag, recorded, ...checks) => ({ long: flag, recorded, checks });
const known = (bl) => ({ known: bl });
const fuzz = { fuzz: true };
const P = (what, ...checks) => ({ what, checks });
const R = (id, title, ...parts) => ({ id, title, parts });

const PERF = {
  solve: 'one 2D solve, microstrip with mask (C39): worker',
  solvePair: 'one 2D solve, pair with mask and coplanar ground (pair-cpw): worker',
  inverse: 'inverse solve (width for a Z0 target)',
  sweep: 'sweep of 100 points',
  mc: 'Monte Carlo, 1,000 samples',
  mapFirst: 'field map, 1440 px view: first picture',
  mapFull: 'field map, 1440 px view: full',
  dragMs: 'drag: trace width, microstrip',
  dragPair: 'drag: trace width, pair-cpw',
  dragMap: 'drag: trace width, microstrip with the field map (|E|)',
  dragVia: 'drag: via side antipad (C44)',
  viaDrill: 'via model (segments, pads, feeds, cascade, TDR), C44, after a new drill: worker',
  viaTrace: 'via model (segments, pads, feeds, cascade, TDR), C44, after a new trace width (feeds solved again): worker',
  fw: 'full-wave run, via C44 on WebGPU: estimate against real time',
};
const FUZZ_REC = '0 of 3678 quantities over the bar in 500 structures, 885 s (notes-M1.4a-fix.md; M1.2c\'s bench the same)';

const ROWS = [
  R('M0.1', 'Plan review',
    P('The v2 draft reviewed, this plan written', rec('plan.md, notes-M0.1.md'))),
  R('M0.2a', 'Theory, formulas, exact cases, sources',
    P('Every formula the engine or theory uses in facts.md with a source or a derivation', rec('facts.md, facts-formulas.md, sources.md; claims.md for the theory')),
    P('The exact cases (10 digits) reproduced by the solvers', e('2D solver (BEM)'), e('Axisymmetric solver (M1.6)')),
    P('Each file under 40 kB', doc('docsize')),
    P('Open questions listed', rec('notes-M0.2a.md'))),
  R('M0.2b', 'JLCPCB, KiCad fields, the owner\'s cases',
    P('facts-cases.md has at least 25 cases, the owner\'s C38–C43 among them', doc('cases')),
    P('Every JLCPCB number has a date and URL', e('Stackup presets'), e('JLCPCB stackups (M1.8b)'), rec('facts-fab.md for the numbers in the text')),
    P('The owner\'s boards read as facts-cases.md says', e('KiCad reader'))),
  R('M0.2c', 'Formulas checked against the original papers',
    P('Every closed form equal to its published numbers', e('Closed forms (M1.4b)')),
    P('The papers opened and what they confirm', rec('notes-M0.2c.md, sources.md "Opened in M0.2c"'))),
  R('M0.2d', 'Literature pointers',
    P('references.bib parses, keys unique', doc('bib')),
    P('57 papers with what each is for', rec('literature.md'))),
  R('M0.2e', 'Literature findings',
    P('references.bib parses, keys unique', doc('bib')),
    P('36 findings with their numbers', rec('literature.md "Findings with numbers (M0.2e)"'))),
  R('M0.3', 'Static solvers: formulation and spikes',
    P('0.1 % on the exact cases with a measured order (now 0.05 % by the product\'s solver)', e('2D solver (BEM)'), rec('solver.md; the spike kept in spikes/ (npm run spike, not run)')),
    P('The budget of engine.md §10 reachable', e('2D solver (BEM)'), perf(PERF.solve), perf(PERF.solvePair)),
    P('Every "M0.3 decides" answered', rec('solver.md'))),
  R('M0.4a', 'Full-wave design, WebGPU runner, Yee spike',
    P('WebGPU and JavaScript rates give a via run\'s time (now the calibrated estimate against real runs)', rec('fullwave.md §9, notes-M0.4a.md'), e('FDTD WebGPU (M6.3)', /skipped/), perf(PERF.fw)),
    P('Every "M0.4 decides" answered', rec('fullwave.md'))),
  R('M0.4b', 'openEMS installed, the first two fixtures',
    P('The two openEMS fixtures exist with their provenance', e('openEMS fixtures (M6.4a)')),
    P('openEMS installed and run', rec('fullwave.md §14, notes-M0.4b.md (measured once; openEMS is not run by the recheck)'))),
  R('M0.5', 'Site infrastructure review',
    P('Each item has a decision and a step', rec('notes-M0.5.md')),
    P('The first-load budget it set', size)),
  R('M1.1', 'Model, presets, KiCad reader, link',
    P('The owner\'s two boards\' stackups and net classes as facts-cases.md says', e('KiCad reader', /\.kicad_pcb not found|\.kicad_pro not found/)),
    P('KiCad 10\'s demos read or refused with a reason', e('KiCad reader', /KiCad 10's demos skipped/)),
    P('KiCad 5–8 demo boards read or refused with a reason (skipped without EMSIM_KICAD_OLD: BL201)',e('KiCad reader', /EMSIM_KICAD_OLD not set/)),
    P('Every preset\'s geometry passes the invariants', e('Structure geometry'), e('Stackup presets'), e('Via structures'), e('Units')),
    P('Link and project round trips exact', e('Link and project'))),
  R('M1.2a', '2D boundary-element core: correctness',
    P('Every exact case within 0.05 % with its measured order; C, L symmetric; invariance; homogeneous identities', e('2D solver (BEM)'))),
  R('M1.2b', '2D core: speed',
    P('Budgets of engine.md §10 met in Node', e('2D solver (BEM)')),
    P('The same budgets on the page (worker)', perf(PERF.solve), perf(PERF.solvePair))),
  R('M1.2c', 'Per-corner grading',
    P('Triple points converge, estimates tight', e('2D solver (BEM)'), e('FD reference (M1.4a)')),
    P('The full fuzz against the FD reference still clean', long('--long', FUZZ_REC, fuzz))),
  R('M1.3', 'Modes, target, sweeps, tolerance',
    P('Cohn\'s coupled stripline exact; Zdiff = 2·Zodd, Zcm = Zeven/2; asymmetric pairs as facts.md', e('Modes and impedances')),
    P('Inverse round trips to 1e-6; Monte Carlo deterministic; budgets met', e('Target, sweeps, tolerance'), perf(PERF.inverse), perf(PERF.sweep), perf(PERF.mc))),
  R('M1.4a', 'FD reference and fuzz',
    P('The FD reference on the exact cases; 16 fuzz structures against the BEM', e('FD reference (M1.4a)')),
    P('The fuzz of 500 structures within the combined estimates', long('--long', FUZZ_REC, fuzz)),
    P('Written without reading the solver', rec('notes-M1.4a.md, solver-fd.md'))),
  R('M1.4a-fix', 'The BEM at triple points',
    P('Copper on a high-εr slab within the FD reference\'s estimate', e('2D solver (BEM)'), e('FD reference (M1.4a)')),
    P('The fuzz clean (159 quantities over the bar before)', long('--long', FUZZ_REC, fuzz))),
  R('M1.4b', 'Closed forms against the field solver',
    P('Closed forms within their published accuracy inside their ranges', e('Closed forms (M1.4b)')),
    P('The validation table filled, every difference explained', rec('facts-cases.md validation table, notes-M1.4b.md'))),
  R('M1.4c', 'Reconciled with JLCPCB',
    P('JLCPCB\'s 50 Ω and 100 Ω widths reproduced by the named assumptions', e('JLCPCB calculator (M2.3b)'))),
  R('M1.5', 'Fields and the static worker',
    P('Fields equal exact coax and two-wire to 1e-4; Gauss; φ on conductors', e('Fields (M1.5)')),
    P('The worker: cancel, cache by hash', e('Static worker (M1.5)')),
    P('The field-map budgets', e('Fields (M1.5)'), perf(PERF.mapFirst), perf(PERF.mapFull))),
  R('M1.6', 'Axisymmetric solver and via cut',
    P('Exact cases (coax, disk 8ε0a, sphere); pad and antipad capacitances', e('Axisymmetric solver (M1.6)')),
    P('The quasi-coaxial barrel with N returns against facts.md and the 2D core', e('Via cut (M1.6)'))),
  R('M1.7', 'Via model, TDR, N-port',
    P('A uniform line\'s TDR = Z0; passive and reciprocal to 1e-12; stub resonance; every flag on its case', e('Via model (M1.7)')),
    P('Budget ≤ 30 ms', e('Via model (M1.7)'), perf(PERF.viaDrill))),
  R('M1.8a', 'JLCPCB stackup fetcher',
    P('The fetcher and converter, tried on a handful of requests; the fetch of 2–4 hours', rec('notes-M1.8a.md (measured once; JLCPCB\'s server is not asked again)'))),
  R('M1.8b', 'All JLCPCB stackups as data',
    P('Every stackup\'s invariants; hand presets equal their entries; no static import of the data', e('JLCPCB stackups (M1.8b)'))),
  R('M1.8c', 'The preset picker',
    P('The picker by mouse, keys and touch; the list loaded on opening; the link', ui('jlcpcb')),
    P('The first-load budget kept', size)),
  R('M2.1a', 'Page shell and stackup',
    P('The owner\'s board opens with its stackup and net classes; the link restores everything', ui('stackup')),
    P('320, 390 and 1440 px in both themes without sideways scroll', ui('stackup')),
    P('Those widths look right', rec('screenshots looked at, notes-M2.1a.md; again in M9.1a')),
    P('First-load size within M0.5\'s budget', size, build)),
  R('M2.1b', 'Trace section and results',
    P('Every preset opens and equals the engine; the owner\'s 50R_SE and LVDS_100R open from their board', ui('trace')),
    P('Keyboard and touch do every task', ui('trace'), ui('access')),
    P('Screenshots in both themes at both widths', rec('notes-M2.1b.md (screenshots are made only with a folder: npm run ui <folder>)'))),
  R('M2.1b-fix', 'Status on ordinary structures',
    P('C39 and C41 regular, with their value and error', e('2D solver (BEM)'), ui('trace'))),
  R('M2.1c', 'Drag handles, pan and zoom',
    P('A drag updates the result within budget at 1×', ui('drag'), perf(PERF.dragMs, '1x'), perf(PERF.dragPair, '1x')),
    P('The same at 4×', known('BL99'), perf(PERF.dragMs, '4x'), perf(PERF.dragPair, '4x')),
    P('Mouse, touch and keys; one undo per drag', ui('drag'))),
  R('M2.1d', 'The general editor',
    P('Add, move, remove traces, grounds and planes by mouse, touch and keys; the link', ui('general'))),
  R('M2.2', 'Field view',
    P('Fields follow a drag within budget', ui('fields'), perf(PERF.dragMap, '1x')),
    P('No main-thread frame over budget at 4×', known('BL101'), perf(PERF.dragMap, '4x')),
    P('The probe by hover, keys and tap', ui('fields')),
    P('The map legible in both themes', e('Fields (M1.5)'), ui('access'), rec('screenshots, notes-M2.2.md'))),
  R('M2.3a', 'Target, sweeps, tolerance on the page',
    P('Target width, sweeps that draw as they go and cancel, tolerance band; touch and keys', ui('tools'), e('Target, sweeps, tolerance'), e('Plot (M2.3a)'))),
  R('M2.3b', 'Calculator comparison',
    P('The owner\'s two cases: closed forms, JLCPCB\'s number, each difference explained', ui('calc'), e('JLCPCB calculator (M2.3b)'), e('Closed forms (M1.4b)'))),
  R('M2.4a', 'First theory (content)',
    P('Every claim has a source or a derivation (form: numbered, kind, source, keys in references.bib)', doc('claims'), rec('claims.md; the reading again in M9.3b')),
    P('Every number in the text checked against the engine', e('Equations (M2.4b)'))),
  R('M2.4b', 'Shared equation engine, EM equations',
    P('Every equation evaluates to the engine\'s number', e('Equations (M2.4b)')),
    P('The Smith chart still passes with the shared engine (a failing ui-math: BL202)', smith('check'), ...SMITH_UI.map((s) => smith(s)))),
  R('M2.4c', 'Theory and References on the page',
    P('Live numbers follow the editor; citations resolve', ui('theory')),
    P('/em-sim/main builds as a static page', build)),
  R('M2.4d', 'Short lines',
    P('Every short line links to its topic', ui('why'))),
  R('M2.5', 'Release',
    P('The card, the status note, npm run ui on a production build', ui('release'), build),
    P('README and CLAUDE.md lines', doc('release')),
    P('Owner checkpoint 1', owner('the owner tries the released trace tool'))),
  R('M3.1a', 'Via section',
    P('The owner\'s LVDS via pair (C45) and C44 open, equal to the engine; flags; link', ui('via'), e('Via structures'), e('Via model (M1.7)')),
    P('Solve within budget', ui('via'), perf(PERF.viaDrill))),
  R('M3.1b', 'Via handles',
    P('Every drag updates within budget at 1×; touch and keys; both themes and widths', ui('viadrag'), perf(PERF.dragVia, '1x')),
    P('The same at 4×', known('BL115'), perf(PERF.dragVia, '4x'))),
  R('M3.2a', 'Via plots',
    P('Feeds on both sides: the TDR\'s flat parts equal the traces\' Z0; cursors shared', ui('viaplots'))),
  R('M3.2b', 'Via fields and target',
    P('Fields legible, equal to the engine; the target', ui('viafields'), e('Via fields (M3.2b)')),
    P('Owner checkpoint 2', owner('the owner looks at the via tool (may reorder M4–M8)'))),
  R('M4.1', 'Teaching content: vias, equations, examples',
    P('Every claim sourced (claims 134–241)', doc('claims'), rec('claims.md')),
    P('The examples\' numbers as the engine gives them', e('Equations and derivations (M4.2)'))),
  R('M4.2', 'Equation layer engine',
    P('Every equation equal to the engine within 1e-9; every derivation step checks', e('Equations and derivations (M4.2)'))),
  R('M4.3a', 'Equation panel and derivation dialog',
    P('Every number in the results has an equation one click away; keys, touch, both themes', ui('equations')),
    P('The Smith chart\'s checks pass with the shared dialog (a failing ui-math: BL202)',smith('check'), smith('ui-derive.mjs'), smith('ui-math.mjs'), smith('ui-explain.mjs'))),
  R('M4.3b', 'Via theory and examples on the page',
    P('Examples open their states; keyboard, touch, both themes', ui('examples')),
    P('The via topics with live numbers', ui('theory'))),
  R('M5.1', '3D view',
    P('Opens within 1 s, orbits at 60 fps, touch at 390 px', ui('via3d'), e('Scene 3D (M5.1)')),
    P('The first load does not grow (no three.js in it)', size, ui('perf'))),
  R('M6.1', 'Mesh, materials, ports, estimator',
    P('Mesh invariants on every preset; estimate within 10 % of the buffers', e('FDTD mesh (M6.1)'))),
  R('M6.2a', 'CPU FDTD: the time loop',
    P('Cavity resonances; CPML reflection; energy without sources (300 steps)', e('FDTD CPU loop (M6.2a)')),
    P('Energy constant over a full run (7 645 steps)', long('EMSIM_FDTD_LONG', '4.6·10⁻¹⁴ over 7 645 steps on the closed C44 via (notes-M6.2a.md)', e('FDTD CPU loop (M6.2a)')))),
  R('M6.2b', 'Ports, S-parameters, TDR, the worker',
    P('Microstrip TDR within 1 % of the 2D solver; matched S11 under −30 dB; reciprocity', e('FDTD runs (M6.2b)')),
    P('The 12 mm section and the coupled pair', long('EMSIM_FDTD_LONG', '12 mm: 51.577 Ω (+0.15 %); pair: −24.9 dB at Zodd, reciprocity 6.7·10⁻⁷ (notes-M6.2b.md)', e('FDTD runs (M6.2b)')))),
  R('M6.3', 'WebGPU backend',
    P('WebGPU and CPU agree within the f32 bar; lost device or no adapter falls back', e('FDTD WebGPU (M6.3)', /skipped/)),
    P('Both C44 runs to the cap', long('EMSIM_FDTD_LONG', 'signals 5.2·10⁻⁷, |ΔS| 1.3·10⁻⁶, TDR 1.3·10⁻⁶ Ω over 15 290 steps (notes-M6.3.md)', e('FDTD WebGPU (M6.3)', /skipped/))),
    P('A via run\'s time within 2× of the estimate (C45 pair and C44 stand in)', e('FDTD WebGPU (M6.3)', /skipped/), perf(PERF.fw)),
    P('The 2 M-cell via run itself', none('no mesh option makes a 2 M-cell via; C45 (0.52 M cells per run) stands in (notes-M6.3.md); BL200'))),
  R('M6.4a', 'openEMS fixtures',
    P('The fixtures with their provenance, passive and reciprocal', e('openEMS fixtures (M6.4a)')),
    P('The openEMS runs', rec('notes-M6.4a.md, fullwave-verify.md (hours on the owner\'s PC; measured once)'))),
  R('M6.4b', 'FDTD εeff fixed (BL150)',
    P('The microstrip\'s εeff within 1.5 % of the 2D solver; the GPU agreement kept', e('FDTD runs (M6.2b)'), e('FDTD WebGPU (M6.3)', /skipped/))),
  R('M6.4c', 'FDTD against openEMS',
    P('FDTD within the frozen limits of openEMS on every fixture (stored numbers re-read)', e('Full-wave against openEMS (M6.4c)')),
    P('Our FDTD run again on every fixture', rec('compare-openems.mjs writes openems/compare.json (measured once, about an hour on WebGPU; not re-run)')),
    P('The table and flag thresholds in fullwave.md and the notes', rec('fullwave-verify.md, notes-M6.4c.md'))),
  R('M6.5', 'Via model corrected from the verification',
    P('C44\'s section Z and TDR peak within the frozen limits; the band where it leaves full-wave', e('Full-wave against openEMS (M6.4c)'), e('Via model (M1.7)')),
    P('The page\'s numbers that moved updated', e('Equations and derivations (M4.2)'), ui('examples'), ui('via'))),
  R('M7.1a', 'Waves section: runs',
    P('C45 on WebGPU within the estimate; a trace on the CPU within its estimate; cancel frees the GPU memory', ui('waves')),
    P('C45 on the CPU fallback to the end', long('EMSIM_WAVES_LONG', '10.1 min against 9.9 min calibrated (notes-M7.1b.md)', ui('waves')))),
  R('M7.1b', 'The 2D player',
    P('Plays smoothly at 1440 and 390 px; cancel frees the frames', ui('player'))),
  R('M7.2a', 'Pair modes',
    P('Differential and common drive; frames as A ∓ B', e('Waves drive (M7.2a)'), ui('player'), e('FDTD WebGPU (M6.3)', /skipped/))),
  R('M7.2b', 'Waves in 3D',
    P('The 3D animation at the 2D player\'s frame rate', ui('waves3d'), e('Waves 3D (M7.2b)'))),
  R('M7.2c', 'Full-wave topic (content)',
    P('The topic\'s claims sourced (242–313)', doc('claims'), rec('claims.md, sources.md'))),
  R('M7.2d', 'Full-wave topic on the page',
    P('Live numbers equal the engine; figures; links to Waves', ui('theory'), e('Equations and derivations (M4.2)'))),
  R('M8.1a', 'Figure model, SVG, PNG, TikZ',
    P('Figures read back from SVG and TikZ; TikZ compiled by TeX Live', e('Figures (M8.1a)', /compile: skipped/))),
  R('M8.1b', 'Export section',
    P('True-size preview, Copy and Save equal to the model', ui('export'))),
  R('M8.2a', 'Data, Touchstone, project file',
    P('CSV and Touchstone read back; the project file round trip', e('Data export (M8.2a)'), ui('data'), e('Link and project'))),
  R('M8.2b', 'Printable report',
    P('A4 and Letter, light, vectors', ui('report'))),
  R('M9.1a', 'Access in Edge',
    P('Keyboard, touch, names, contrast AA, reduced motion, 200 % zoom', ui('access'))),
  R('M9.1b', 'Firefox and WebKit',
    P('Every feature in three browsers; the CPU fallback\'s message', ui('browsers'))),
  R('M9.2', 'Performance, size, memory',
    P('engine.md §10\'s budgets at 1× on a production build', ui('perf'), perf(PERF.solve), perf(PERF.mapFirst), perf(PERF.dragMs, '1x'), perf(PERF.dragVia, '1x'), perf(PERF.fw)),
    P('The drag budgets at 4×', known('BL99, BL101, BL115'), perf(PERF.dragMs, '4x'), perf(PERF.dragMap, '4x'), perf(PERF.dragVia, '4x')),
    P('The first-load budget', size),
    P('A session without growing memory (2 minutes)', ui('session')),
    P('The 10-minute session', long('EMSIM_SESSION_LONG', 'page heap 118 kiB/min from minute 2, last sample +9.0 %, nodes +29, no live WebGL context (notes-M9.2.md)', ui('session')))),
  R('M9.2-fix', 'Via-model budgets (BL197–BL199; notes-M9.2.md "Fix")',
    P('The via model ≤ 30 ms after a new drill and after a trace edit', e('Via model (M1.7)'), perf(PERF.viaDrill), perf(PERF.viaTrace)),
    P('One field-map job per typed width', ui('perf'))),
];

// --- Running ------------------------------------------------------------------------------------------------------
const codes = {};
const logs = {};
/** Runs a command, shows its output as it comes and keeps it. */
function run(key, cmd, args, cwd, env = {}) {
  return new Promise((done) => {
    console.log(`\n##### recheck: ${key}: ${cmd} ${args.join(' ')}`);
    let text = '';
    const t = Date.now();
    const p = spawn(cmd, args, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
    const take = (to) => (b) => { text += b.toString('utf8'); to.write(b); };
    p.stdout.on('data', take(process.stdout));
    p.stderr.on('data', take(process.stderr));
    p.on('close', (code) => {
      logs[key] = (logs[key] ?? '') + text;
      codes[key] = code;
      codes[`${key}:s`] = Math.round((Date.now() - t) / 1000);
      done(code);
    });
  });
}

let server = null;
const stopServer = () => {
  if (!server) return;
  try { execSync(process.platform === 'win32' ? `taskkill /pid ${server.pid} /T /F` : `kill ${server.pid}`, { stdio: 'ignore' }); } catch { /* gone */ }
  server = null;
};
const up = async () => { try { return (await fetch(`${BASE}/em-sim/main`)).ok; } catch { return false; } };

const t0 = Date.now();
if (fromLogs) {
  for (const f of readdirSync(logDir)) if (f.endsWith('.log')) logs[f.slice(0, -4)] = readFileSync(join(logDir, f), 'utf8');
  Object.assign(codes, JSON.parse(readFileSync(join(logDir, 'codes.json'), 'utf8')));
} else {
  mkdirSync(logDir, { recursive: true });
  try {
    await run('check', 'npx', ['tsx', 'check.mjs'], here, LONG ? { EMSIM_FDTD_LONG: '1' } : {});
    if (LONG) await run('fuzz', 'npx', ['tsx', 'fd/fuzz.mts'], here);
    if (!NO_SMITH) await run('smith-check', 'npx', ['tsx', 'check.mjs'], smithDir);
    if (NO_BUILD) {
      codes.build = existsSync(join(repo, '.next/BUILD_ID')) ? 0 : 1;
      logs.build = codes.build ? 'no .next/BUILD_ID: run without --no-build\n' : 'reused the last next build (--no-build)\n';
    } else {
      const envFile = join(repo, 'next-env.d.ts'), env = readFileSync(envFile, 'utf8');
      for (let i = 0; i < 2 && (i === 0 || codes.build !== 0); i++) await run('build', 'npm', ['run', 'build'], repo);
      writeFileSync(envFile, env);
    }
    if (codes.build === 0) {
      await run('size', 'node', ['size.mjs'], here);
      if (await up()) throw new Error(`port ${PORT} is taken: stop what serves it first`);
      server = spawn('npx', ['next', 'start', '-p', String(PORT)], { cwd: repo, shell: true, stdio: 'ignore' });
      const until = Date.now() + 60000;
      while (!(await up())) {
        if (Date.now() > until) throw new Error('next start did not answer');
        await new Promise((r) => setTimeout(r, 500));
      }
      await run('ui', 'node', ['ui.mjs', '-', '--base', BASE], here, LONG ? { EMSIM_WAVES_LONG: '1', EMSIM_SESSION_LONG: '1' } : {});
      // A script that failed runs once more alone (BL145: ui-release's home click now and then).
      for (const s of uiScripts(logs.ui).failed) {
        await run('ui-retry', 'npx', ['tsx', s, '-', BASE], here, LONG ? { EMSIM_WAVES_LONG: '1', EMSIM_SESSION_LONG: '1' } : {});
        logs['ui-retry'] += `\n=== ${s} ${codes['ui-retry'] === 0 ? 'passed on retry' : 'FAILED on retry'}\n`;
      }
      if (!NO_SMITH) {
        for (const s of SMITH_UI) {
          await run('smith-ui', 'npx', ['tsx', s, '-', BASE], smithDir);
          let again = '';
          if (codes['smith-ui'] !== 0) { await run('smith-ui', 'npx', ['tsx', s, '-', BASE], smithDir); again = ' on retry'; }
          logs['smith-ui'] += `\n=== ${s} ${codes['smith-ui'] === 0 ? `passed${again}` : `FAILED${again}`}\n`;
        }
      }
    }
  } catch (err) {
    console.log(`\nrecheck stopped: ${err.message}`);
    codes.stopped = err.message;
  } finally {
    stopServer();
  }
  for (const [k, v] of Object.entries(logs)) writeFileSync(join(logDir, `${k}.log`), v);
  writeFileSync(join(logDir, 'codes.json'), JSON.stringify(codes, null, 1));
}

// --- Parsing --------------------------------------------------------------------------------------------------------
/** ui.mjs's output: per script its text, whether it passed and its count of checks. */
function uiScripts(text = '') {
  const parts = text.split(/^=== (ui-[\w-]+\.mjs)\r?$/m);
  const by = new Map();
  for (let i = 1; i < parts.length; i += 2) {
    const seg = parts[i + 1] ?? '';
    const passed = new RegExp(`^=== ${parts[i].replace('.', '\\.')} passed`, 'm').test(seg);
    const counts = [...seg.matchAll(/(\d+) passed, (\d+) failed/g)].pop();
    by.set(parts[i], { seg, passed, n: counts ? Number(counts[1]) : null, failedChecks: counts ? Number(counts[2]) : null });
  }
  return { by, failed: [...by].filter(([, s]) => !s.passed).map(([k]) => k) };
}
const UI = uiScripts(logs.ui);
for (const m of (logs['ui-retry'] ?? '').matchAll(/^=== (ui-[\w-]+\.mjs) passed on retry/gm)) {
  const s = UI.by.get(m[1]); if (s) { s.passed = true; s.retry = true; }
}
const SMITH_PASSED = new Set([...(logs['smith-ui'] ?? '').matchAll(/^=== (ui-[\w-]+\.mjs) passed(?: on retry)?$/gm)].map((m) => m[1]));
const SMITH_RAN = new Set([...(logs['smith-ui'] ?? '').matchAll(/^=== (ui-[\w-]+\.mjs) (?:passed|FAILED)(?: on retry)?$/gm)].map((m) => m[1]));

const GROUPS = new Map();
{
  const lines = (logs.check ?? '').split(/\r?\n/);
  const h = lines.findIndex((l) => /^Group\s+Checks\s+Failed\s+ms\s*$/.test(l));
  for (const l of h >= 0 ? lines.slice(h + 1) : []) {
    const m = l.match(/^(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/);
    if (!m) break;
    GROUPS.set(m[1], { total: Number(m[2]), failed: Number(m[3]), ms: Number(m[4]) });
  }
}
const NOTES = [...(logs.check ?? '').matchAll(/^ {2}\[([^\]]+)\] (.*)$/gm)].map((m) => [m[1], m[2]]);
const PERF_ROWS = new Map();
{
  const seg = UI.by.get('ui-perf.mjs')?.seg ?? '';
  for (const task of Object.values(PERF)) {
    const line = seg.split(/\r?\n/).find((l) => l.startsWith(`| ${task} | `));
    if (!line) continue;
    const [budget, r1, r4, verdict] = line.slice(task.length + 5).replace(/ \|\s*$/, '').split(' | ');
    PERF_ROWS.set(task, { budget, r1, r4, verdict });
  }
}
const sizeLine = (logs.size ?? '').match(/first load: .*/)?.[0] ?? '';
const fuzzLine = (logs.fuzz ?? '').match(/\d+ structures, \d+ quantities, \d+ over the bar.*/)?.[0] ?? '';

// --- Docs checked here ----------------------------------------------------------------------------------------------
const bibText = readFileSync(join(repo, 'references.bib'), 'utf8');
const bibMod = await import('../../../lib/bibtex.ts');
const parseBibtex = bibMod.parseBibtex ?? bibMod.default?.parseBibtex;
const DOCS = {
  docsize() {
    const files = readdirSync(docs).filter((f) => f.endsWith('.md')).map((f) => [f, statSync(join(docs, f)).size]);
    const over = files.filter(([, n]) => n > 40000);
    const big = files.sort((a, b) => b[1] - a[1])[0];
    return { ok: !over.length, key: over.length ? `over 40 kB: ${over.map(([f, n]) => `${f} ${(n / 1000).toFixed(1)}`).join(', ')}` : `${files.length} files, largest ${big[0]} ${(big[1] / 1000).toFixed(1)} kB` };
  },
  cases() {
    const ids = new Set([...readFileSync(join(docs, 'facts-cases.md'), 'utf8').matchAll(/^\| (C\d\d) \|/gm)].map((m) => m[1]));
    const owner = ['C38', 'C39', 'C40', 'C41', 'C42', 'C43'].filter((c) => !ids.has(c));
    return { ok: ids.size >= 25 && !owner.length, key: `${ids.size} cases${owner.length ? `; missing ${owner.join(', ')}` : ''}` };
  },
  claims() {
    const text = readFileSync(join(docs, 'claims.md'), 'utf8');
    const keys = new Set(parseBibtex(bibText, 'references.bib').map((b) => b.key));
    const rows = text.split(/\r?\n/).filter((l) => /^\| *\d+ *\|/.test(l)).map((l) => l.split('|').map((c) => c.trim()));
    const bad = [];
    rows.forEach((c, i) => {
      if (Number(c[1]) !== i + 1) bad.push(`#${i + 1} numbered ${c[1]}`);
      if (!/^(S|D|Def|T)\b/.test(c[2] ?? '')) bad.push(`#${c[1]} kind "${c[2]}"`);
      if (!(c[3] ?? '').length && c[2] !== 'Def') bad.push(`#${c[1]} no source`);
      for (const m of c.slice(3).join(' ').matchAll(/`([A-Z][A-Za-z]+\d{4}[a-z]*)`/g)) if (!keys.has(m[1])) bad.push(`#${c[1]} key ${m[1]} not in references.bib`);
    });
    const stated = Number([...text.matchAll(/\*\*In all:\*\* (\d+) claims/g)].pop()?.[1] ?? rows.length);
    if (stated !== rows.length) bad.push(`"In all" says ${stated}, table has ${rows.length}`);
    return { ok: !bad.length && rows.length > 0, key: bad.length ? bad.slice(0, 4).join('; ') : `${rows.length} claims numbered, each with a kind and a source` };
  },
  bib() {
    try {
      const entries = parseBibtex(bibText, 'references.bib');
      const dup = entries.length - new Set(entries.map((b) => b.key)).size;
      return { ok: !dup, key: `${entries.length} entries${dup ? `, ${dup} duplicate keys` : ''}` };
    } catch (err) { return { ok: false, key: String(err.message) }; }
  },
  release() {
    const readme = readFileSync(join(repo, 'README.md'), 'utf8'), claude = readFileSync(join(repo, 'CLAUDE.md'), 'utf8');
    const index = readFileSync(join(repo, 'pages/index.tsx'), 'utf8');
    const ok = /em-sim/i.test(readme) && /EM simulation/.test(claude) && index.includes('/em-sim/main');
    return { ok, key: ok ? 'README, CLAUDE.md and the card name the tool' : 'README, CLAUDE.md or pages/index.tsx without the tool' };
  },
};

// --- Status of one check, then of a part -----------------------------------------------------------------------------
/** { s: 'pass' | 'fail' | 'not run' | 'skipped' | 'recorded' | 'owner' | 'none', key?, label } */
function status(c) {
  if (c.e) {
    const g = GROUPS.get(c.e), label = `check "${c.e}"`;
    if (!g) return { s: codes.check === undefined ? 'not run' : 'fail', label, key: 'group not in the summary' };
    if (g.failed) return { s: 'fail', label, key: `${g.failed} of ${g.total} failed` };
    const sk = c.skip && NOTES.find(([gr, t]) => gr === c.e && c.skip.test(t));
    if (sk) return { s: 'skipped', label, key: sk[1].slice(0, 90) };
    return { s: 'pass', label, key: `${g.total}` };
  }
  if (c.ui) {
    const u = UI.by.get(c.ui), label = c.ui.replace('.mjs', '');
    if (!u) return { s: 'not run', label };
    return { s: u.passed ? 'pass' : 'fail', label, key: `${u.n ?? '?'}${u.retry ? ' on retry' : ''}${u.passed ? '' : `, ${u.failedChecks ?? '?'} failed`}` };
  }
  if (c.perf) {
    const r = PERF_ROWS.get(c.perf), label = `ui-perf "${c.perf.replace(/\(segments, pads, feeds, cascade, TDR\), /, '')}"${c.which === 'all' ? '' : ` ${c.which === '1x' ? '1×' : '4×'}`}`;
    if (!r) return { s: UI.by.has('ui-perf.mjs') ? 'fail' : 'not run', label, key: 'row not in the table' };
    const ok = c.which === '1x' ? /^met\b|met at 1×/.test(r.verdict) : c.which === '4x' ? /met at 4×/.test(r.verdict) : r.verdict === 'met';
    const v = c.which === '4x' ? r.r4 : r.r1;
    const drag = v.match(/task\/frame ([\d.]+).*?([\d.]+) results\/frame(?:; map (\d+) ms)?/);
    const key = drag
      ? `${drag[1]} ms per frame, ${drag[2]} results per frame${drag[3] ? `, map ${drag[3]} ms` : ''} (≤ 8 ms, ≤ 12 at 4×)`
      : `${v} (${r.budget})`;
    return { s: ok ? 'pass' : 'fail', label, key };
  }
  if (c.size) return { s: codes.size === undefined ? 'not run' : codes.size === 0 ? 'pass' : 'fail', label: 'size.mjs', key: sizeLine.replace(/^first load: /, '').replace(/; later.*/, '') };
  if (c.build) return { s: codes.build === undefined ? 'not run' : codes.build === 0 ? 'pass' : 'fail', label: NO_BUILD || /reused/.test(logs.build ?? '') ? 'next build (reused)' : 'next build' };
  if (c.smith) {
    if (c.smith === 'check') {
      const line = (logs['smith-check'] ?? '').match(/smith library: .*/)?.[0];
      return { s: codes['smith-check'] === undefined ? 'not run' : codes['smith-check'] === 0 ? 'pass' : 'fail', label: 'Smith check.mjs', key: line?.replace('smith library: ', '') };
    }
    return { s: !SMITH_RAN.has(c.smith) ? 'not run' : SMITH_PASSED.has(c.smith) ? 'pass' : 'fail', label: `Smith ${c.smith.replace('.mjs', '')}` };
  }
  if (c.doc) { const r = DOCS[c.doc](); return { s: r.ok ? 'pass' : 'fail', label: `docs: ${c.doc}`, key: r.key }; }
  if (c.fuzz) return { s: codes.fuzz === undefined ? 'not run' : codes.fuzz === 0 ? 'pass' : 'fail', label: 'fd/fuzz.mts (500 structures)', key: fuzzLine };
  if (c.rec) return { s: 'recorded', label: c.rec };
  if (c.owner) return { s: 'owner', label: c.owner };
  if (c.none) return { s: 'none', label: c.none };
  return { s: 'fail', label: JSON.stringify(c) };
}

function partStatus(p) {
  const knownBl = p.checks.find((c) => c.known)?.known;
  const sts = [];
  let longRec = null;
  for (const c of p.checks) {
    if (c.known) continue;
    if (c.long) {
      if (LONG) for (const x of c.checks) sts.push(status(x));
      else { longRec = c; sts.push({ s: 'recorded', label: `${c.long === '--long' ? 'recheck --long' : `${c.long}=1`} (not run): ${c.recorded}` }); }
    } else sts.push(status(c));
  }
  const has = (s) => sts.some((x) => x.s === s);
  let s = has('fail') || has('not run') ? 'fail' : has('skipped') || has('none') ? 'not checked' : has('pass') ? 'pass' : has('recorded') ? 'recorded' : 'owner';
  if (s === 'fail' && knownBl && !has('not run')) s = `fail (known, ${knownBl})`;
  if (longRec && s === 'recorded') s = 'recorded';
  return { s, sts };
}

// --- Rows against milestones.md -------------------------------------------------------------------------------------
const order = (id) => { const m = id.match(/^M(\d+)\.(\d+)([a-z]?)/); return m ? Number(m[1]) * 1e4 + Number(m[2]) * 100 + (m[3] ? m[3].charCodeAt(0) - 96 : 0) : 1e9; };
const mile = readFileSync(join(docs, 'milestones.md'), 'utf8');
const expected = new Set([
  ...[...mile.matchAll(/^### (M\d+\.\d+[a-z]?) /gm)].map((m) => m[1]),
  ...[...mile.matchAll(/\*\*(M\d+\.\d+[a-z]?(?:-fix)?):?\*\*/g)].map((m) => m[1]),
  ...readdirSync(docs).map((f) => f.match(/^notes-(M\d+\.\d+[a-z]?(?:-fix)?)\.md$/)?.[1]).filter(Boolean),
].filter((id) => order(id) < order('M9.3')));
const rowIds = new Set(ROWS.map((r) => r.id));
const missing = [...expected].filter((id) => !rowIds.has(id) && ![...rowIds].some((r) => new RegExp(`^${id.replace('.', '\\.')}[a-z]`).test(r))).sort((a, b) => order(a) - order(b));
const extra = [...rowIds].filter((id) => !expected.has(id));

// --- The table ------------------------------------------------------------------------------------------------------
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const totals = { pass: 0, fail: 0, known: 0, 'not checked': 0, recorded: 0, owner: 0 };
const failures = [], notChecked = [];
const lines = [
  '| Step | Done when (short) | Checked by (this run: check count or measured value) | Result |',
  '| --- | --- | --- | --- |',
];
for (const r of ROWS) {
  const done = [], by = [], res = [];
  r.parts.forEach((p, i) => {
    const { s, sts } = partStatus(p);
    const n = r.parts.length > 1 ? `${i + 1}. ` : '';
    done.push(`${n}${p.what}`);
    by.push(`${n}${sts.map((x) => `${x.label}${x.key ? `: ${x.key}` : ''}${['pass', 'recorded', 'owner'].includes(x.s) ? '' : ` [${x.s === 'none' ? 'not checked' : x.s}]`}`).join('; ')}`);
    res.push(`${n}${s.startsWith('fail') ? `**${s}**` : s}`);
    if (s === 'fail') { totals.fail++; failures.push(`${r.id} ${p.what}`); } else if (s.startsWith('fail')) { totals.known++; } else totals[s]++;
    if (s === 'not checked') notChecked.push(`${r.id} ${p.what}: ${sts.filter((x) => x.s === 'skipped' || x.s === 'none').map((x) => `${x.label}${x.key ? ` (${x.key})` : ''}`).join('; ')}`);
  });
  lines.push(`| ${r.id} ${cell(r.title)} | ${done.map(cell).join('<br>')} | ${by.map(cell).join('<br>')} | ${res.map(cell).join('<br>')} |`);
}
const parts = Object.values(totals).reduce((a, b) => a + b, 0);
const checkAll = (logs.check ?? '').match(/^All\s+(\d+)\s+(\d+)/m);
const uiLine = (logs.ui ?? '').match(/\d+ of \d+ UI scripts passed/)?.[0] ?? 'UI scripts: not run';
const retried = [...UI.by].filter(([, s]) => s.retry).map(([k]) => k);
const summary = [
  `**${ROWS.length} steps, ${parts} parts:** ${totals.pass} pass, ${totals.fail} fail, ${totals.known} known misses (fail with a backlog id), ${totals['not checked']} not checked, ${totals.recorded} recorded, ${totals.owner} owner.`,
  `Engine checks: ${checkAll ? `${checkAll[1]} checks, ${checkAll[2]} failed` : 'not run'}${codes['check:s'] ? ` (${codes['check:s']} s)` : ''}${LONG ? ', with EMSIM_FDTD_LONG=1' : ''}. ${uiLine}${retried.length ? ` (on retry: ${retried.join(', ')})` : ''}${codes['ui:s'] ? ` (${codes['ui:s']} s)` : ''}. Size: ${sizeLine || 'not run'}.`,
  `Smith chart: ${NO_SMITH ? 'left out (--no-smith)' : `check.mjs ${codes['smith-check'] === 0 ? 'passed' : 'FAILED or not run'} (${(logs['smith-check'] ?? '').match(/smith library: (.*)/)?.[1] ?? '–'}); ${SMITH_PASSED.size} of ${SMITH_UI.length} browser scripts on the shared modules passed`}.`,
  missing.length ? `**Steps of milestones.md without a row: ${missing.join(', ')}.**` : `Every step of milestones.md M0.1–M9.2 (${expected.size} ids: headings, split sub-steps, notes files) has a row${extra.length ? `; rows not named there: ${extra.join(', ')}` : ''}.`,
  codes.stopped ? `**The run stopped: ${codes.stopped}.**` : '',
].filter(Boolean);
const md = [
  `# EM simulation – recheck (${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC${LONG ? ', --long' : ''}${fromLogs ? ', from logs' : ''})`, '',
  ...summary.map((s) => `${s}\n`), ...lines, '',
  failures.length ? `**Failures:** ${failures.join('; ')}.` : 'No failure outside the known misses.',
  notChecked.length ? `\n**Not checked:**\n\n${notChecked.map((n) => `- ${cell(n)}`).join('\n')}` : '', '',
].join('\n');
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, md);
console.log(`\n${'='.repeat(100)}\n${md}\n${'='.repeat(100)}`);
console.log(`Table written to ${outFile}; logs in ${logDir}. ${Math.round((Date.now() - t0) / 60000)} min.`);
process.exit(failures.length || missing.length || codes.stopped ? 1 : 0);
