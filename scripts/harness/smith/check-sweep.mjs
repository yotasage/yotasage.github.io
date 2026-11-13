// Checks of the sweep engine (step M7.1, lib/smith/sweep.ts), run by check.mjs with its counters:
// - bands: bandProblem, both ends exact, ascending, even steps in f or log f;
// - every point of 200 random circuits' refined traces against the point engine (evaluateCircuit at that f), 1e-12;
// - refinement: every chord and every turn within its threshold (unless at the minimum span or under ANGLE_FLOOR),
//   frequencies ascending, the band's ends kept; a capped refinement stops at the cap with the worst splits first;
// - band figures of 200 random circuits against a brute force over 10⁶ points of the band: worst and best |Γ| within
//   the brute force's resolution (and never below its sample), every interval below a threshold with its edges to
//   1e-9 (the brute force's brackets bisected here), the interval around f0, its fractional bandwidth, the loaded Q;
// - closed forms (notes-M7.1.md): a series RLC's interval below |Γ| = g and its loaded Q, a λ/4 transformer's
//   fractional bandwidth for |Γ|max; markers and picking; determinism; timing of a 10,000-point sweep and of refining.

import * as importedSweep from '../../../lib/smith/sweep.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import { retried } from './timing.mjs';

const S = importedSweep.default ?? importedSweep;
const N = importedNetwork.default ?? importedNetwork;
const P = importedParts.default ?? importedParts;
const {
  bandProblem, bandFrequencies, sweepCircuit, Trace, sweepBand, refine, runSweep, bandFigures, markerAt, pickOnTrace,
  nearestIndex, segmentAt, mag2At, REFINE_DEFAULTS, ANGLE_FLOOR, MAX_POINTS,
} = S;
const { evaluateCircuit, inputGamma, sweep, METRIC_STRIDE, M_GR, M_GI } = N;
const { SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER } = P;
const TAU = 2 * Math.PI;
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300);

export function runSweepChecks({ section, ok, random }) {
  const pick = (a) => a[Math.floor(random() * a.length)];
  const logU = (lo, hi) => lo * (hi / lo) ** random();

  /** A random circuit of 1…maxParts parts, every kind, values a normalised 0.05…20 at f0. */
  function randomCircuit(maxParts) {
    const z0 = pick([50, 50, 75, 100, 25]), f0 = logU(1e6, 1e10), w0 = TAU * f0;
    const count = 1 + Math.floor(random() * maxParts), parts = [];
    for (let k = 0; k < count; k++) {
      const kind = Math.floor(random() * 10), a = logU(0.05, 20);
      switch (kind) {
        case SERIES_R: parts.push({ kind, value: a * z0 }); break;
        case SHUNT_R: parts.push({ kind, value: z0 / a }); break;
        case SERIES_L: parts.push({ kind, value: (a * z0) / w0 }); break;
        case SERIES_C: parts.push({ kind, value: 1 / (w0 * a * z0) }); break;
        case SHUNT_L: parts.push({ kind, value: z0 / (w0 * a) }); break;
        case SHUNT_C: parts.push({ kind, value: a / (w0 * z0) }); break;
        case QUARTER: parts.push({ kind, value: 20 + 100 * random() }); break;
        default: parts.push({ kind, value: 0.02 + 0.46 * random(), zc: 20 + 100 * random() });
      }
    }
    return { z0, f0, loadR: logU(1, 500), loadX: (random() - 0.5) * 600, parts };
  }
  function randomBand(f0) {
    return { start: f0 * (0.3 + 0.6 * random()), stop: f0 * (1.1 + 1.9 * random()), points: 101 + Math.floor(random() * 900), log: random() < 0.5 };
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('sweep bands');
  {
    ok(bandProblem({ start: 1e6, stop: 2e6, points: 101, log: true }) === null, 'a good band');
    ok(bandProblem({ start: 0, stop: 2e6, points: 101, log: false }) === null, 'a linear band from 0 Hz');
    ok(bandProblem({ start: 0, stop: 2e6, points: 101, log: true }) === 'start', 'a log band from 0 Hz');
    ok(bandProblem({ start: -1, stop: 2e6, points: 101, log: false }) === 'start', 'a negative start');
    ok(bandProblem({ start: NaN, stop: 2e6, points: 101, log: false }) === 'start', 'NaN start');
    ok(bandProblem({ start: 2e6, stop: 2e6, points: 101, log: false }) === 'stop', 'stop = start');
    ok(bandProblem({ start: 1e6, stop: Infinity, points: 101, log: false }) === 'stop', 'infinite stop');
    ok(bandProblem({ start: 1e6, stop: 2e6, points: 1, log: false }) === 'points', 'one point');
    ok(bandProblem({ start: 1e6, stop: 2e6, points: 10.5, log: false }) === 'points', 'a fraction of points');
    ok(bandProblem({ start: 1e6, stop: 2e6, points: MAX_POINTS + 1, log: false }) === 'points', 'too many points');
    ok(bandProblem({ start: 1e6, stop: 1e6 * (1 + 1e-9), points: 10000, log: false }) === 'narrow', 'a band at rounding level');
    for (let t = 0; t < 200; t++) {
      const log = t % 2 === 1, start = logU(1, 1e9), stop = start * logU(1.0001, 1e4), n = 2 + Math.floor(random() * 3000);
      const f = new Float64Array(n);
      bandFrequencies(f, start, stop, n, log);
      let asc = f[0] === start && f[n - 1] === stop, even = true;
      const step = log ? Math.log(stop / start) / (n - 1) : (stop - start) / (n - 1);
      for (let i = 1; i < n; i++) {
        if (!(f[i] > f[i - 1])) asc = false;
        const d = log ? Math.log(f[i] / f[i - 1]) : f[i] - f[i - 1];
        if (Math.abs(d - step) > 1e-9 * (log ? 1 : stop)) even = false;
      }
      ok(asc, `band ${t}: ends exact and ascending`);
      ok(even, `band ${t}: even steps in ${log ? 'log f' : 'f'}`);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('sweep vs point engine');
  {
    const trace = new Trace();
    let points = 0, worst = 0, refined = 0;
    for (let t = 0; t < 200; t++) {
      const c = randomCircuit(10), band = randomBand(c.f0), sc = sweepCircuit(c);
      runSweep(trace, band, sc);
      refined += trace.added;
      let bad = 0;
      const last = c.parts.length * METRIC_STRIDE;
      for (let i = 0; i < trace.n; i++) {
        const { metrics } = evaluateCircuit(c, trace.freqs[i]);
        const gr = metrics[last + M_GR], gi = metrics[last + M_GI];
        const e = Math.hypot(trace.gamma[2 * i] - gr, trace.gamma[2 * i + 1] - gi) / Math.max(1, Math.hypot(gr, gi));
        if (!(e <= 1e-12)) bad++;
        if (e > worst) worst = e;
      }
      points += trace.n;
      ok(bad === 0, `circuit ${t}: ${bad} of ${trace.n} swept points off the point engine`);
    }
    console.log(`sweep vs point engine: ${points} points of 200 refined traces (${refined} added by refinement), worst ${worst.toExponential(2)}`);
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('sweep refinement');
  {
    const trace = new Trace();
    const opts = { ...REFINE_DEFAULTS, cap: MAX_POINTS };
    let maxAngle = 0, maxStep = 0, limitedAll = 0, total = 0;
    for (let t = 0; t < 200; t++) {
      const c = randomCircuit(8), band = randomBand(c.f0), sc = sweepCircuit(c);
      sweepBand(trace, band, sc);
      refine(trace, sc, opts);
      const n = trace.n, f = trace.freqs, g = trace.gamma;
      const narrow = (s) => f[s + 1] - f[s] <= opts.minSpan * f[s + 1];
      let asc = f[0] === band.start && f[n - 1] === band.stop, overStep = 0, overTurn = 0;
      for (let s = 0; s < n - 1; s++) {
        if (!(f[s + 1] > f[s])) asc = false;
        const d = Math.hypot(g[2 * s + 2] - g[2 * s], g[2 * s + 3] - g[2 * s + 1]);
        if (d > opts.maxStep && !narrow(s)) overStep++;
        if (!narrow(s) && d > maxStep) maxStep = d;
        if (s > 0) {
          const ax = g[2 * s] - g[2 * s - 2], ay = g[2 * s + 1] - g[2 * s - 1], bx = g[2 * s + 2] - g[2 * s], by = g[2 * s + 3] - g[2 * s + 1];
          if (Math.hypot(ax, ay) < ANGLE_FLOOR || Math.hypot(bx, by) < ANGLE_FLOOR) continue;
          const angle = Math.atan2(Math.abs(ax * by - ay * bx), ax * bx + ay * by);
          if (angle > opts.maxAngle * (1 + 1e-9) && !narrow(s) && !narrow(s - 1)) overTurn++;
          if (!narrow(s) && !narrow(s - 1) && angle > maxAngle) maxAngle = angle;
        }
      }
      limitedAll += trace.limited;
      total += n;
      ok(!trace.capped, `circuit ${t}: refinement within ${MAX_POINTS} points`);
      ok(asc, `circuit ${t}: refined frequencies ascending with the band's ends`);
      ok(overStep === 0, `circuit ${t}: ${overStep} chords over ${opts.maxStep}`);
      ok(overTurn === 0, `circuit ${t}: ${overTurn} turns over ${opts.maxAngle} rad`);
    }
    ok(maxAngle <= REFINE_DEFAULTS.maxAngle * (1 + 1e-9) && maxStep <= REFINE_DEFAULTS.maxStep, 'largest turn and chord within the thresholds');
    console.log(`sweep refinement: 200 traces, ${total} points; largest chord ${maxStep.toFixed(4)} (≤ ${opts.maxStep}), turn ${(maxAngle * 180 / Math.PI).toFixed(2)}° (≤ 5°); ${limitedAll} segments left at the minimum span`);

    // A capped refinement: exactly the cap, the worst segment of the first pass split.
    const c = { z0: 50, f0: 1e9, loadR: 10, loadX: 0, parts: [{ kind: LINE, value: 3, zc: 90 }, { kind: STUB_SHORT, value: 0.3, zc: 40 }] };
    const sc = sweepCircuit(c);
    sweepBand(trace, { start: 5e8, stop: 1.5e9, points: 41, log: false }, sc);
    const before = Float64Array.from(trace.gamma.subarray(0, 82)), bf = Float64Array.from(trace.freqs.subarray(0, 41));
    let ws = 0, wd = 0;
    for (let s = 0; s < 40; s++) { const d = Math.hypot(before[2 * s + 2] - before[2 * s], before[2 * s + 3] - before[2 * s + 1]); if (d > wd) { wd = d; ws = s; } }
    refine(trace, sc, { ...REFINE_DEFAULTS, cap: 42 });
    ok(trace.n === 42 && trace.capped && trace.added === 1, 'a cap of one more point adds one point and says capped');
    // With only chords long, the longest is the worst (its turns are compared too; this circuit's chords dominate).
    const splitAt = Array.from(trace.freqs.subarray(0, 42)).findIndex((f, i) => f !== bf[i]);
    ok(splitAt === ws + 1, `the worst segment is split first (${splitAt - 1} vs the longest chord ${ws})`);
    refine(trace, sc, { ...REFINE_DEFAULTS, cap: 500 });
    ok(trace.n === 500 && trace.capped, 'a cap of 500 stops at 500 points');
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('sweep figures vs brute force');
  {
    const NB = 1_000_000, bf = new Float64Array(NB), bg = new Float64Array(2 * NB), bm = new Float64Array(NB);
    const trace = new Trace();
    const g2 = new Float64Array(2);
    const m2 = (sc, f) => { inputGamma(g2, 0, sc.parts, sc.count, sc.loadR, sc.loadX, sc.z0, f, sc.f0); return g2[0] * g2[0] + g2[1] * g2[1]; };
    // The harness's own bisection, to the last bit.
    const bisect = (sc, a, b, level, aBelow) => {
      for (let i = 0; i < 200; i++) { const m = 0.5 * (a + b); if (m <= a || m >= b) break; if ((m2(sc, m) < level) === aBelow) a = m; else b = m; }
      return 0.5 * (a + b);
    };
    let intervalsAll = 0, edgesAll = 0, finer = 0, worstEdge = 0, qs = 0, worstQ = 0, figTime = 0;
    const t0 = performance.now();
    for (let t = 0; t < 200; t++) {
      const c = randomCircuit(6), band = randomBand(c.f0), sc = sweepCircuit(c);
      runSweep(trace, band, sc);
      bandFrequencies(bf, band.start, band.stop, NB, band.log);
      sweep(bg, bf, NB, sc.parts, sc.count, sc.loadR, sc.loadX, sc.z0, sc.f0);
      let iMax = 0, iMin = 0;
      for (let i = 0; i < NB; i++) {
        bm[i] = bg[2 * i] * bg[2 * i] + bg[2 * i + 1] * bg[2 * i + 1];
        if (bm[i] > bm[iMax]) iMax = i;
        if (bm[i] < bm[iMin]) iMin = i;
      }
      // Threshold between the band's best and worst (so intervals exist), or VSWR 2 now and then.
      const lo = Math.sqrt(bm[iMin]), hi = Math.sqrt(bm[iMax]);
      const thr = t % 5 === 0 ? 1 / 3 : lo + (hi - lo) * (0.15 + 0.7 * random());
      const tf = performance.now();
      const fig = bandFigures(trace, sc, thr);
      figTime += performance.now() - tf;
      // Resolution of the brute force around a frequency: the largest change of |Γ|² over two samples either side.
      const res = (f) => {
        const i = Math.min(NB - 1, Math.max(0, Math.round(band.log ? Math.log(f / band.start) / Math.log(band.stop / band.start) * (NB - 1) : (f - band.start) / (band.stop - band.start) * (NB - 1))));
        let d = 0;
        for (let k = Math.max(1, i - 2); k <= Math.min(NB - 1, i + 2); k++) d = Math.max(d, Math.abs(bm[k] - bm[k - 1]));
        return d;
      };
      const W = fig.worst.mag ** 2, B = fig.best.mag ** 2;
      ok(W >= bm[iMax] - 1e-14 && W - bm[iMax] <= res(fig.worst.f) + 1e-14, `circuit ${t}: worst |Γ|² ${W} vs brute force ${bm[iMax]}`);
      ok(B <= bm[iMin] + 1e-14 && bm[iMin] - B <= res(fig.best.f) + 1e-14, `circuit ${t}: best |Γ|² ${B} vs brute force ${bm[iMin]}`);
      ok(Math.abs(mag2At(sc, fig.worst.f) - W) <= 1e-15 && fig.worst.f >= band.start && fig.worst.f <= band.stop, `circuit ${t}: the worst point is in the band and evaluated`);
      const wm = fig.worst.mag, wv = wm >= 1 ? Infinity : (1 + wm) / (1 - wm);
      ok((fig.maxVswr === wv || rel(fig.maxVswr, wv) < 1e-12) && Math.abs(fig.worstRL + 20 * Math.log10(wm)) <= 1e-12 * Math.max(1, fig.worstRL), `circuit ${t}: VSWR ${fig.maxVswr} and return loss ${fig.worstRL} of the worst ${wm}`);

      // Intervals below thr from the brute force, edges bisected here.
      const level = thr * thr, brute = [];
      let below = bm[0] < level, from = band.start, openLo = below;
      for (let i = 1; i < NB; i++) {
        const b = bm[i] < level;
        if (b !== below) {
          const e = bisect(sc, bf[i - 1], bf[i], level, below);
          if (b) { from = e; openLo = false; } else brute.push({ lo: from, hi: e, openLo, openHi: false });
          below = b;
        }
      }
      if (below) brute.push({ lo: from, hi: band.stop, openLo, openHi: true });
      const step = (f) => (band.log ? f * Math.log(band.stop / band.start) / (NB - 1) : (band.stop - band.start) / (NB - 1));
      const same = (a, b) => rel(a.lo, b.lo) <= 1e-9 && rel(a.hi, b.hi) <= 1e-9 && a.openLo === b.openLo && a.openHi === b.openHi;
      let missing = 0, extra = 0;
      for (const b of brute) {
        const o = fig.intervals.find((x) => same(x, b));
        if (!o) missing++;
        else worstEdge = Math.max(worstEdge, rel(o.lo, b.lo), rel(o.hi, b.hi));
      }
      for (const o of fig.intervals) {
        if (brute.some((b) => same(o, b))) continue;
        // Narrower than the brute force's step: it can only see it by luck.
        if (o.hi - o.lo < 2 * step(o.hi)) finer++; else extra++;
      }
      intervalsAll += brute.length;
      edgesAll += 2 * brute.length;
      ok(missing === 0 && extra === 0, `circuit ${t}: intervals below ${thr.toFixed(4)}: ${missing} of ${brute.length} missed, ${extra} not in the brute force`);
      let asc = true;
      for (let k = 0; k < fig.intervals.length; k++) {
        const iv = fig.intervals[k];
        if (!(iv.lo < iv.hi) || (k > 0 && !(fig.intervals[k - 1].hi < iv.lo))) asc = false;
      }
      ok(asc, `circuit ${t}: intervals ascending and apart`);

      // The interval around f0 and its fractional bandwidth.
      const b0 = c.f0 >= band.start && c.f0 <= band.stop ? brute.find((b) => b.lo <= c.f0 && c.f0 <= b.hi) ?? null : null;
      ok((b0 === null) === (fig.atF0 === null) && (!b0 || (same(b0, fig.atF0) && rel(fig.fractional, (b0.hi - b0.lo) / c.f0) <= 1e-8)),
        `circuit ${t}: the interval around f0 ${JSON.stringify(fig.atF0)} vs ${JSON.stringify(b0)}`);

      // Loaded Q: the brute force's minimum nearest f0 (walked downhill), half-power edges bisected here.
      let j;
      if (c.f0 >= band.start && c.f0 <= band.stop) {
        const s0 = Math.min(NB - 2, Math.max(0, Math.floor(band.log ? Math.log(c.f0 / band.start) / Math.log(band.stop / band.start) * (NB - 1) : (c.f0 - band.start) / (band.stop - band.start) * (NB - 1))));
        let s = s0; while (s < NB - 2 && bf[s + 1] <= c.f0) s++; while (s > 0 && bf[s] > c.f0) s--;
        j = bm[s + 1] < bm[s] ? s + 1 : s;
        if (j > 0 && bm[j - 1] < bm[j]) while (j > 0 && bm[j - 1] < bm[j]) j--;
        else while (j < NB - 1 && bm[j + 1] < bm[j]) j++;
      } else j = iMin;
      let fj = bf[j], mj = bm[j];
      if (c.f0 >= band.start && c.f0 <= band.stop) { const m0 = m2(sc, c.f0); if (m0 - mj <= 1e-12 * mj + 1e-15) { fj = c.f0; mj = m0; } }
      const qb = (() => {
        if (!(mj < 1 - 1e-12)) return null;
        const lv = 0.5 * (1 + mj);
        let lo = band.start, hi = band.stop, oL = true, oH = true;
        for (let i = j; i >= 0; i--) if (bf[i] < fj && bm[i] >= lv) { lo = bisect(sc, bf[i], Math.min(bf[i + 1], fj), lv, false); oL = false; break; }
        for (let i = j; i < NB; i++) if (bf[i] > fj && bm[i] >= lv) { hi = bisect(sc, Math.max(bf[i - 1], fj), bf[i], lv, true); oH = false; break; }
        return { f: fj, lo, hi, q: fj / (hi - lo), openLo: oL, openHi: oH };
      })();
      if (!qb || !fig.q) ok(!qb === !fig.q, `circuit ${t}: loaded Q ${JSON.stringify(fig.q)} vs ${JSON.stringify(qb)}`);
      else {
        // The brute force places the minimum to its step, and a flat minimum is placed by its polishing only to
        // about √ε; the edges move with the level by less than that.
        const tol = (4 * step(qb.f)) / qb.f + 1e-8;
        const e = Math.max(rel(fig.q.q, qb.q), rel(fig.q.f, qb.f));
        worstQ = Math.max(worstQ, e);
        qs++;
        ok(e <= tol && fig.q.openLo === qb.openLo && fig.q.openHi === qb.openHi && rel(fig.q.lo, qb.lo) <= tol && rel(fig.q.hi, qb.hi) <= tol,
          `circuit ${t}: loaded Q ${JSON.stringify(fig.q)} vs ${JSON.stringify(qb)}`);
      }
    }
    console.log(`sweep figures vs brute force (10⁶ points, 200 circuits, ${((performance.now() - t0) / 1000).toFixed(1)} s): ${intervalsAll} intervals, ${edgesAll} edges, worst edge ${worstEdge.toExponential(2)} relative, ${finer} intervals finer than the brute force, ${qs} loaded Qs (worst ${worstQ.toExponential(2)}); figures ${(figTime / 200).toFixed(3)} ms each`);
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('sweep closed forms');
  {
    const trace = new Trace();
    let worst = 0, cases = 0;
    const near = (a, b, what, tol = 1e-9) => { const e = rel(a, b); worst = Math.max(worst, tol === 1e-9 ? e : 0); ok(e <= tol, `${what}: ${a} vs ${b} (${e.toExponential(2)})`); };
    // Series RLC on Z0 (load R, then series L and series C): X = ωL − 1/(ωC); |Γ| < g ⇔ X² < Xm² with
    // Xm² = (g²(R + Z0)² − (R − Z0)²)/(1 − g²); edges ω± = (√(Xm² + 4L/C) ± Xm)/(2L), width Xm/L.
    // Loaded Q: half power where X = ±(R + Z0), Q = ω0·L/(R + Z0).
    for (const [z0, R, f0, qs, log] of [[50, 50, 1e8, 20, false], [50, 20, 2.4e9, 5, true], [75, 300, 1e6, 50, false], [50, 10, 1e9, 2, true], [50, 50, 5e8, 200, false]]) {
      const w0 = TAU * f0, L = (qs * z0) / w0, C = 1 / (w0 * w0 * L);
      const c = { z0, f0, loadR: R, loadX: 0, parts: [{ kind: SERIES_L, value: L }, { kind: SERIES_C, value: C }] };
      const sc = sweepCircuit(c), QL = (w0 * L) / (R + z0);
      const span = 6 / QL;
      const band = { start: f0 / (1 + span), stop: f0 * (1 + span), points: 201, log };
      runSweep(trace, band, sc);
      const g0 = Math.abs(R - z0) / (R + z0);
      for (const g of [0.1, 1 / 3, 0.5, 0.8]) {
        if (g <= g0) continue;
        const fig = bandFigures(trace, sc, g);
        const Xm = Math.sqrt((g * g * (R + z0) ** 2 - (R - z0) ** 2) / (1 - g * g)), r = Math.sqrt(Xm * Xm + (4 * L) / C);
        const lo = (r - Xm) / (2 * L) / TAU, hi = (r + Xm) / (2 * L) / TAU;
        const what = `RLC R=${R} Z0=${z0} Qs=${qs} ${log ? 'log' : 'lin'} below ${g.toFixed(3)}`;
        ok(fig.intervals.length === 1 && fig.atF0 === fig.intervals[0], `${what}: one interval, around f0`);
        if (fig.atF0) {
          near(fig.atF0.lo, lo, `${what}: lower edge`);
          near(fig.atF0.hi, hi, `${what}: upper edge`);
          near(fig.fractional, Xm / L / w0, `${what}: fractional bandwidth Xm/(ω0L)`);
          cases++;
        }
      }
      const fig = bandFigures(trace, sc, 0.5);
      const r = Math.sqrt((R + z0) ** 2 + (4 * L) / C);
      const what = `RLC R=${R} Z0=${z0} Qs=${qs}`;
      // A V-shaped minimum at a match: |Γ| grows as 2Qs·Δf/f0, so placing it to 1e-12 in f leaves |Γ| ~ 1e-11.
      ok(Math.abs(fig.best.mag - g0) <= 1e-9, `${what}: best |Γ| ${fig.best.mag} at resonance vs ${g0}`);
      // The minimum is at f0 itself (f0 is used when it is as low as the minimum to 1e-12).
      near(fig.q.f, f0, `${what}: the minimum at f0`);
      near(fig.q.lo, (r - (R + z0)) / (2 * L) / TAU, `${what}: lower half-power edge`);
      near(fig.q.hi, (r + (R + z0)) / (2 * L) / TAU, `${what}: upper half-power edge`);
      near(fig.q.q, QL, `${what}: loaded Q = ω0L/(R + Z0) = ${QL.toFixed(4)}`);
      cases++;
    }
    // λ/4 transformer of Zt = √(Z0·RL) on a real load: |Γ|² = (RL − Z0)²/((RL − Z0)² + 4·Z0·RL·sec²θ), θ = (π/2)f/f0;
    // |Γ| = Γm at cos θm = 2Γm√(Z0·RL)/(|RL − Z0|√(1 − Γm²)); band θm…π − θm, Δf/f0 = 2 − 4θm/π.
    for (const [z0, RL] of [[50, 100], [50, 25], [50, 200], [75, 10], [50, 1000]]) {
      const f0 = 1e9, zt = Math.sqrt(z0 * RL);
      const c = { z0, f0, loadR: RL, loadX: 0, parts: [{ kind: QUARTER, value: zt }] };
      const sc = sweepCircuit(c);
      for (const log of [false, true]) {
        runSweep(trace, { start: 0.02 * f0, stop: 1.98 * f0, points: 151, log }, sc);
        for (const gm of [0.02, 0.05, 0.1, 0.2]) {
          const cosT = (2 * gm * Math.sqrt(z0 * RL)) / (Math.abs(RL - z0) * Math.sqrt(1 - gm * gm));
          if (cosT >= 1) continue;
          const th = Math.acos(cosT), fig = bandFigures(trace, sc, gm);
          const what = `λ/4 Z0=${z0} RL=${RL} ${log ? 'log' : 'lin'} |Γ|max ${gm}`;
          ok(fig.intervals.length === 1 && fig.atF0 === fig.intervals[0], `${what}: one interval, around f0`);
          if (!fig.atF0) continue;
          near(fig.atF0.lo, (2 * th / Math.PI) * f0, `${what}: lower edge`);
          near(fig.atF0.hi, (2 - 2 * th / Math.PI) * f0, `${what}: upper edge`);
          near(fig.fractional, 2 - (4 * th) / Math.PI, `${what}: fractional bandwidth 2 − 4θm/π`);
          near(fig.worst.mag, Math.abs(RL - z0) / Math.sqrt((RL - z0) ** 2 + 4 * z0 * RL / Math.cos(Math.PI / 2 * 0.02) ** 2), `${what}: worst |Γ| at the band's end`, 1e-12);
          cases++;
        }
      }
    }
    console.log(`sweep closed forms: ${cases} cases (series RLC intervals and loaded Q, λ/4 fractional bandwidth), worst ${worst.toExponential(2)} relative`);
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('sweep markers and determinism');
  {
    const trace = new Trace(), out = new Float64Array(2);
    for (let t = 0; t < 50; t++) {
      const c = randomCircuit(6), band = randomBand(c.f0), sc = sweepCircuit(c);
      runSweep(trace, band, sc);
      const i = Math.floor(random() * trace.n), f = trace.freqs[i];
      const mk = markerAt(sc, f);
      ok(mk.gr === trace.gamma[2 * i] && mk.gi === trace.gamma[2 * i + 1], `circuit ${t}: a marker on a trace point is that point`);
      const { metrics } = evaluateCircuit(c, f), last = c.parts.length * METRIC_STRIDE;
      ok(Math.abs(mk.zr - metrics[last + N.M_ZR] * c.z0) <= 1e-9 * Math.max(1, Math.abs(mk.zr)) && Math.abs(mk.zi - metrics[last + N.M_ZI] * c.z0) <= 1e-9 * Math.max(1, Math.abs(mk.zi)), `circuit ${t}: marker z in ohms`);
      ok(rel(mk.rl, -20 * Math.log10(mk.mag)) < 1e-12 && rel(mk.vswr, (1 + mk.mag) / (1 - mk.mag)) < 1e-12, `circuit ${t}: marker RL and VSWR`);
      ok(nearestIndex(trace, f) === i && segmentAt(trace, f) === Math.min(i, trace.n - 2), `circuit ${t}: nearestIndex and segmentAt`);
      const p = pickOnTrace(trace, trace.gamma[2 * i], trace.gamma[2 * i + 1]);
      ok(p.dist === 0 && trace.gamma[2 * p.index + 2 * (p.t === 1 ? 1 : 0)] === trace.gamma[2 * i], `circuit ${t}: picking a trace point finds it`);
      // A point beside a chord's middle maps to a frequency within that segment.
      const s = Math.min(i, trace.n - 2), mx = 0.5 * (trace.gamma[2 * s] + trace.gamma[2 * s + 2]), my = 0.5 * (trace.gamma[2 * s + 1] + trace.gamma[2 * s + 3]);
      const q = pickOnTrace(trace, mx, my);
      ok(q.f >= trace.freqs[q.index] && q.f <= trace.freqs[q.index + 1] && q.dist <= 1e-15, `circuit ${t}: picking a chord's middle`);
      inputGamma(out, 0, sc.parts, sc.count, sc.loadR, sc.loadX, sc.z0, f, sc.f0);
      ok(out[0] === mk.gr && out[1] === mk.gi, `circuit ${t}: marker = inputGamma`);
      // Determinism: the same sweep, refinement and figures again, in a new trace.
      const fig = bandFigures(trace, sc, 0.3);
      const again = new Trace(7);
      runSweep(again, band, sweepCircuit(c));
      const same = again.n === trace.n && again.freqs.subarray(0, again.n).every((v, k) => v === trace.freqs[k]) && again.gamma.subarray(0, 2 * again.n).every((v, k) => v === trace.gamma[k]);
      ok(same && JSON.stringify(bandFigures(again, sweepCircuit(c), 0.3)) === JSON.stringify(fig), `circuit ${t}: deterministic`);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('sweep timing');
  {
    const z0 = 50, f0 = 1e8, kinds = [SERIES_L, SHUNT_C, LINE, STUB_OPEN, SERIES_C, SHUNT_L, STUB_SHORT, SERIES_R, SHUNT_R, QUARTER];
    const parts = kinds.map((kind) => {
      switch (kind) {
        case SERIES_L: return { kind, value: 40e-9 };
        case SERIES_C: return { kind, value: 30e-12 };
        case SHUNT_L: return { kind, value: 60e-9 };
        case SHUNT_C: return { kind, value: 20e-12 };
        case SERIES_R: return { kind, value: 5 };
        case SHUNT_R: return { kind, value: 2000 };
        case QUARTER: return { kind, value: 70 };
        default: return { kind, value: 0.1, zc: 60 };
      }
    });
    const c = { z0, f0, loadR: 25, loadX: 25, parts }, sc = sweepCircuit(c), trace = new Trace(10_000);
    const band = { start: 0.5 * f0, stop: 1.5 * f0, points: 10_000, log: false };
    for (let k = 0; k < 50; k++) sweepBand(trace, band, sc);
    const { value: perSweep, note } = retried(() => {
      const runs = [];
      for (let k = 0; k < 101; k++) { const t0 = performance.now(); sweepBand(trace, band, sc); runs.push(performance.now() - t0); }
      return median(runs);
    }, (x) => x < 4);
    ok(perSweep < 4, `10 parts at 10,000 points within the 4 ms frame budget (median ${perSweep.toFixed(3)} ms)${note}`);
    const band2k = { ...band, points: 2000 };
    const per2k = median(Array.from({ length: 101 }, () => { const t0 = performance.now(); sweepBand(trace, band2k, sc); return performance.now() - t0; }));
    // Refining a coarse 101-point band of the same circuit from 0.2 to 3·f0 (its stubs resonate there) to the
    // defaults, and the figures of the refined trace.
    const small = { start: 0.2 * f0, stop: 3 * f0, points: 101, log: false };
    runSweep(trace, small, sc);
    const refinedN = trace.n, passes = trace.passes;
    const { value: perRefine, note: rNote } = retried(() => {
      const runs = [];
      for (let k = 0; k < 101; k++) { sweepBand(trace, small, sc); const t0 = performance.now(); refine(trace, sc); runs.push(performance.now() - t0); }
      return median(runs);
    }, (x) => x < 2);
    ok(perRefine < 2, `refining 101 points to ${refinedN} (${passes} passes) under 2 ms (median ${perRefine.toFixed(3)} ms)${rNote}`);
    const figRuns = [];
    for (let k = 0; k < 101; k++) { const t0 = performance.now(); bandFigures(trace, sc, 1 / 3); figRuns.push(performance.now() - t0); }
    const perFig = median(figRuns);
    ok(perFig < 2, `band figures of the refined trace under 2 ms (median ${perFig.toFixed(3)} ms)`);
    // The same 10,000 points refined from 10,000 (a dense trace has little left to split).
    sweepBand(trace, band, sc);
    const tr0 = performance.now(); refine(trace, sc, { ...REFINE_DEFAULTS, cap: 20_000 }); const denseRefine = performance.now() - tr0;
    console.log(`sweep timing (10 parts, medians): 10,000-point sweep ${perSweep.toFixed(3)} ms, 2,000-point ${per2k.toFixed(3)} ms; refine 101 → ${refinedN} points in ${passes} passes ${perRefine.toFixed(3)} ms; figures ${perFig.toFixed(3)} ms; refine of the 10,000-point trace (${trace.n} after) ${denseRefine.toFixed(2)} ms`);
  }
}
