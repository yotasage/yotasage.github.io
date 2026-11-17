// The full-wave verification against openEMS (step M6.4c, the model columns since M6.5; docs/em-sim/fullwave-verify.md): our FDTD on every openEMS
// fixture's structure (WebGPU in headless Edge, webgpu/compare-gpu.mts; tr_min 30 ps so S reaches 41 GHz), the
// quasi-static via model on the same, and the via model's range (antipad and return-via sweeps on the C44 via, FDTD
// against the model). Prints the comparison table and writes openems/compare.json (the measured numbers and the frozen
// limits, which check-compare.mjs holds the FDTD to). openEMS is not run: the committed fixtures are the reference.
//   npx tsx compare-openems.mjs [--cache <dir>]   (--cache keeps the GPU records there and reuses them)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withWebGpuPage } from './webgpu/runner.mjs';
import * as L from './compare-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TR_MIN = 30e-12;

/** The frozen limits, FDTD against openEMS (the reasons in fullwave-verify.md §3). */
export const LIMITS = {
  tdr: 2.5, // Ω, |Δz| of the TDR (35 ps) over 0–100 ps at the fixture's planes (Sdd at 100 Ω for the pair)
  s10: 0.10, // |ΔS11|, |ΔS21| (Sdd for the pair) up to 10 GHz
  s20: 0.15, // the same up to 20 GHz
  sectionZ: 0.12, sectionDelay: 0.12, // relative, the de-embedded section over 1–10 GHz (symmetric single vias)
  notch: 0.08, // relative, the stub's |S21| notch
  stairS20: 0.05, stairNotch: 0.03, stairTdr: 2.5, // our FDTD with staircased barrels, as openEMS meshes them
  zdiff: 0.02, zcm: 0.02, // the LVDS pair line, relative
  eeffModeOpenems: 0.10, eeffMode2D: 0.03, // its modal εeff against openEMS and against the 2D solver
};

function jobs(S) {
  const j = [];
  const via = (id, v, extra = {}) => j.push({ id, kind: 'via', setup: { ...S.su, via: v }, model: { trMin: TR_MIN, ...extra } });
  for (const [id, v] of Object.entries(S.vias)) via(id, v);
  via('via-c44@stair', S.vias['via-c44'], { staircase: true });
  via('via-c45@stair', S.vias['via-c45'], { staircase: true });
  via('via-c44-stub@stair', S.vias['via-c44-stub'], { staircase: true });
  j.push({ id: 'msl-c41', kind: 'trace', setup: S.lvds, model: { trMin: TR_MIN, length: 13 } });
  const c44 = S.vias['via-c44'];
  for (const d of [0.8, 1.2]) via(`ap${d}`, L.VM.withAntipad(c44, d));
  for (const d of [1.2, 1.6, 2.0, 3.0]) via(`ret${d}`, L.VM.withReturnDistance(c44, d));
  for (const d of [1.2, 2.0, 3.0]) via(`ap0.8ret${d}`, L.VM.withReturnDistance(L.VM.withAntipad(c44, 0.8), d));
  return j;
}

async function runAll(list, cache) {
  const out = {};
  const todo = list.filter((x) => !(cache && existsSync(path.join(cache, `${x.id}.json`))));
  for (const x of list) if (!todo.includes(x)) out[x.id] = JSON.parse(readFileSync(path.join(cache, `${x.id}.json`), 'utf8'));
  if (todo.length) {
    await withWebGpuPage(path.join(HERE, 'webgpu', 'compare-gpu.mts'), async (page) => {
      const inf = await page.evaluate(() => cmp.info());
      if (!inf.ok) throw new Error(`no WebGPU: ${inf.reason}`);
      for (const x of todo) {
        const r = await page.evaluate((o) => cmp.run(o), { setup: x.setup, kind: x.kind, model: x.model });
        console.error(`${x.id}: ${r.cells} cells, ${(r.ms / 1000).toFixed(1)} s, ${r.records.runs.map((q) => `${q.status}/${q.rows}`).join(' ')}`);
        out[x.id] = r;
        if (cache) writeFileSync(path.join(cache, `${x.id}.json`), JSON.stringify(r));
      }
    }, { timeoutMs: 30 * 60_000, log: (s) => console.error(s) });
  }
  for (const k of Object.keys(out)) out[k].records = L.unpackRecords(out[k].records);
  return out;
}

const r3 = (x, n = 3) => Number(x.toFixed(n));
const fmtS = (S, f, pick) => L.FREQS.map((g) => { const k = L.at(f, g); return S && S[k] ? r3(L.db(pick(S[k])), 2) : null; });

/** One via fixture: openEMS, FDTD, the model (step M6.5: with each feed's run over its antipad) and the model as M6.4c had it. */
function viaRow(id, S, run, runStair) {
  const fx = L.readFixture(id), O = L.fixtureS(fx), P = O.P, f = O.f;
  const feeds = Array.from({ length: P }, (_, n) => L.fixtureFeed(fx, n));
  const v = S.vias[id];
  const fd = L.fdtdAtPlanes(run, feeds, f);
  const fdSt = runStair ? L.fdtdAtPlanes(runStair, feeds, f) : null;
  const md = L.modelAtPlanes(S.st, v, f, feeds, S.trace);
  const mo = L.modelAtPlanes(S.st, v, f, feeds);
  const pair = P === 4;
  const refl = pair ? L.pk.sdd11 : L.pk.s11, trans = pair ? L.pk.sdd21 : L.pk.s21, zRef = pair ? 100 : 50;
  const tFeed = fx.results.tdr.viaWindow.tViaAxis_s;
  const T = (SS) => (SS ? L.tdrOf(f, SS, refl, zRef) : null);
  const tO = T(O.S), tF = T(fd), tFs = T(fdSt), tM = T(md.S), tMo = T(mo.S);
  const sym = !pair && id !== 'via-c44-stub' && id !== 'via-c44-bd';
  const sec = (SS) => (SS && sym ? L.section(SS, f, feeds) : null);
  const own = L.fdtdFeeds(run);
  const row = {
    id, ports: P, cells: run.cells, gpuSeconds: r3(run.ms / 1000, 2),
    feeds: { openems: fx.results.feeds.z_ohm_1to10GHz.map((z, n) => [z, fx.results.feeds.eeff_1to10GHz[n]]), fdtd: own.map((x) => [r3(x.z), r3(x.eeff, 4)]), twoD: own.map((x) => [r3(x.z2d), r3(x.eeff2d, 4)]) },
    section: { openems: sec(O.S), fdtd: sec(fd), fdtdStair: sec(fdSt), model: sec(md.S), modelM64: sec(mo.S) },
    tdr: { openems: tO && L.tdrStats(tO, tFeed), fdtd: L.tdrStats(tF, tFeed), fdtdStair: tFs && L.tdrStats(tFs, tFeed), model: tM && L.tdrStats(tM, tFeed), modelM64: tMo && L.tdrStats(tMo, tFeed) },
    tdrDiff: { fdtd: L.tdrDiff(tF, tO), fdtdStair: tFs && L.tdrDiff(tFs, tO), model: tM && L.tdrDiff(tM, tO), modelM64: tMo && L.tdrDiff(tMo, tO) },
    refl: { openems: fmtS(O.S, f, refl), fdtd: fmtS(fd, f, refl), model: fmtS(md.S, f, refl), modelM64: fmtS(mo.S, f, refl) },
    trans: { openems: fmtS(O.S, f, trans), fdtd: fmtS(fd, f, trans), model: fmtS(md.S, f, trans), modelM64: fmtS(mo.S, f, trans) },
    dS: {}, notch: null, flags: md.m.ok ? md.m.flags.map((x) => x.code) : md.m.flags.map((x) => x.code), modelOk: md.m.ok,
    valid: md.m.ok ? { fMax: md.m.valid.fMax, lumped: md.m.valid.lumped, cavity: md.m.valid.cavity, band: md.m.band, f3: md.m.f3, stubs: md.m.stubs.map((s) => s.fRes) } : null,
    overs: md.m.ok ? md.m.overs.map((o) => [o.side, o.length, o.dL]) : null,
  };
  for (const [name, SS] of [['fdtd', fd], ['fdtdStair', fdSt], ['model', md.S], ['modelM64', mo.S]]) {
    if (!SS) continue;
    row.dS[name] = { refl10: L.sDiff(f, SS, O.S, refl, 0, 10e9), trans10: L.sDiff(f, SS, O.S, trans, 0, 10e9), refl20: L.sDiff(f, SS, O.S, refl, 0, 20e9), trans20: L.sDiff(f, SS, O.S, trans, 0, 20e9), refl40: L.sDiff(f, SS, O.S, refl), trans40: L.sDiff(f, SS, O.S, trans) };
    // the first frequency where the model leaves openEMS by 0.1 in |ΔS11| or |ΔS21| (the range)
    let fBad = null;
    for (let k = 0; k < f.length; k++) if (SS[k] && Math.max(L.cabs([refl(SS[k])[0] - refl(O.S[k])[0], refl(SS[k])[1] - refl(O.S[k])[1]]), L.cabs([trans(SS[k])[0] - trans(O.S[k])[0], trans(SS[k])[1] - trans(O.S[k])[1]])) > 0.1) { fBad = f[k]; break; }
    row.dS[name].fLeave = fBad;
  }
  if (id === 'via-c44-stub' || id === 'via-c44-bd') {
    row.notch = { openems: L.dip(f, O.S, trans), fdtd: L.dip(f, fd, trans), fdtdStair: fdSt && L.dip(f, fdSt, trans), model: md.S ? L.dip(f, md.S, trans) : null };
    if (id === 'via-c44-stub') { // where the stub starts to cost transmission: openEMS's stub against its backdrilled twin
      const B = L.fixtureS(L.readFixture('via-c44-bd'));
      const k1 = f.findIndex((fk, k) => fk > 1e9 && L.db(trans(O.S[k])) < L.db(trans(B.S[k])) - 1);
      const k3 = f.findIndex((fk, k) => fk > 1e9 && L.db(trans(O.S[k])) < L.db(trans(B.S[k])) - 3);
      row.notch.onset1dB = f[k1]; row.notch.onset3dB = f[k3];
    }
  }
  if (pair) row.sdc21Max = { fdtd: Math.max(...f.map((_, k) => (fd[k] ? L.cabs(L.pk.sdc21(fd[k])) : 0))) };
  return row;
}

function lvdsRow(S, run) {
  const fx = L.readFixture('msl-c41'), O = L.fixtureS(fx), f = O.f;
  const r = run.records;
  const ord = [0, 2, 1, 3]; // ours (T1.1, T1.2, T2.1, T2.2) → (P1, N1, P2, N2) up to P ↔ N
  const np = L.N.renormalize(L.Ru.nportOf(r, Float64Array.from(f)), [50, 50, 50, 50]);
  const fd = f.map((_, k) => ord.map((i) => ord.map((j) => L.N.sEntry(np, k, i, j))));
  const md = L.fdtdModal(run, 0, 2);
  const two = L.Li.solveSetup(S.lvds);
  const Lf = fx.results.line;
  const planes = run.ports.map((p) => r3(p.pos, 4));
  return {
    id: 'msl-c41', cells: run.cells, gpuSeconds: r3(run.ms / 1000, 2), portPos: planes, feed: run.ports[0].feed,
    openems: { zdiff: Lf.zdiff_ohm, zcm: Lf.zcm_ohm, eeffOdd: Lf.eeffOdd, eeffEven: Lf.eeffEven },
    fdtd: { zdiff: r3(md.zdiff), zcm: r3(md.zcm), eeffOdd: r3(md.eeffOdd, 4), eeffEven: r3(md.eeffEven, 4) },
    twoD: { zdiff: r3(two.pair.zdiff.v), zcm: r3(two.pair.zcm.v), eeffOdd: r3(two.modes.find((m) => m.label === 'odd').eeff.v, 4), eeffEven: r3(two.modes.find((m) => m.label === 'even').eeff.v, 4) },
    sdd21: { openems: fmtS(O.S, f, L.pk.sdd21), fdtd: fmtS(fd, f, L.pk.sdd21) }, sdd11: { openems: fmtS(O.S, f, L.pk.sdd11), fdtd: fmtS(fd, f, L.pk.sdd11) },
    dSdd21: L.sDiff(f, fd, O.S, L.pk.sdd21), dSdd11: L.sDiff(f, fd, O.S, L.pk.sdd11), dScc21: L.sDiff(f, fd, O.S, L.pk.scc21),
  };
}

/** The sweeps: FDTD against the model on the C44 via with the antipad or the return distance changed, both at the
 *  2D solver's feed (3 mm, 50 Ω planes). */
function sweepRow(id, S, run) {
  const m = /^(?:ap([\d.]+))?(?:ret([\d.]+))?$/.exec(id);
  let v = S.vias['via-c44'];
  if (m[1]) v = L.VM.withAntipad(v, Number(m[1]));
  if (m[2]) v = L.VM.withReturnDistance(v, Number(m[2]));
  const own = L.fdtdFeeds(run);
  const feeds = own.map((x) => ({ z: () => x.z2d, eeff: () => x.eeff2d }));
  const f = Array.from({ length: 401 }, (_, k) => k * 1e8);
  const fd = L.fdtdAtPlanes(run, feeds, f), md = L.modelAtPlanes(S.st, v, f, feeds, S.trace);
  const mo = L.modelAtPlanes(S.st, v, f, feeds);
  const leave = (SS) => { for (let k = 1; k < f.length; k++) if (Math.max(L.cabs([SS[k][1][0][0] - fd[k][1][0][0], SS[k][1][0][1] - fd[k][1][0][1]]), L.cabs([SS[k][0][0][0] - fd[k][0][0][0], SS[k][0][0][1] - fd[k][0][0][1]])) > 0.1) return f[k]; return null; };
  return {
    id, ap: v.antipads[0].d.v, ret: L.VM.nearestReturn(v),
    section: { fdtd: L.section(fd, f, feeds), model: L.section(md.S, f, feeds), modelM64: mo.S && L.section(mo.S, f, feeds) },
    s11: { fdtd: fmtS(fd, f, L.pk.s11), model: fmtS(md.S, f, L.pk.s11), modelM64: mo.S && fmtS(mo.S, f, L.pk.s11) },
    s21: { fdtd: fmtS(fd, f, L.pk.s21), model: fmtS(md.S, f, L.pk.s21), modelM64: mo.S && fmtS(mo.S, f, L.pk.s21) },
    fLeave: { model: leave(md.S), modelM64: mo.S && leave(mo.S) },
    tdrMax: { fdtd: L.tdrStats(L.tdrOf(f, fd, L.pk.s11, 50), 36.5e-12).zMax, model: L.tdrStats(L.tdrOf(f, md.S, L.pk.s11, 50), 36.5e-12).zMax, modelM64: mo.S && L.tdrStats(L.tdrOf(f, mo.S, L.pk.s11, 50), 36.5e-12).zMax },
    flags: md.m.flags.map((x) => x.code),
    valid: { fMax: md.m.valid.fMax, lumped: md.m.valid.lumped, cavity: md.m.valid.cavity },
  };
}

async function main() {
  const ci = process.argv.indexOf('--cache');
  const cache = ci > 0 ? process.argv[ci + 1] : null;
  if (cache) mkdirSync(cache, { recursive: true });
  const S = L.setups();
  const runs = await runAll(jobs(S), cache);
  const vias = Object.keys(S.vias).map((id) => viaRow(id, S, runs[id], runs[`${id}@stair`] ?? null));
  const lvds = lvdsRow(S, runs['msl-c41']);
  const sweeps = ['ap0.8', 'ap1.2', 'ret1.2', 'ret1.6', 'ret2', 'ret3', 'ap0.8ret1.2', 'ap0.8ret2', 'ap0.8ret3'].map((id) => sweepRow(id, S, runs[id]));
  sweeps.splice(2, 0, sweepRow('ap1.8', S, runs['via-c44']));
  const out = { format: 'emsim-fullwave-verification', version: 2, step: 'M6.5', date: new Date().toISOString().slice(0, 10), trMin: TR_MIN, limits: LIMITS, vias, lvds, sweeps };
  writeFileSync(L.OUT, JSON.stringify(out, (k, x) => (typeof x === 'number' ? Number(x.toPrecision(6)) : x), 1) + '\n');
  console.log(JSON.stringify(out, (k, x) => (typeof x === 'number' ? Number(x.toPrecision(4)) : x)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
