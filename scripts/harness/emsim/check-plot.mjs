// Checks of the plot module (step M2.3a, lib/emsim/plot.ts): 1-2-5 ticks over many ranges (steps, count, inside the
// range, exact labels), log ticks, nice axes that hold the data, the mapping and its inverse, whole-number paths under
// 2^24 with breaks at missing points, bands as closed polygons per run, and the cursor's interpolation and stepping.
// M3.2a: the time axis (ps or ns, labels that read back over random records), dB with its floor, and the phase.

import * as P0 from '../../../lib/emsim/plot.ts';

const P = P0.default ?? P0;

export async function run(t) {
  // ---- ticks: 1-2-5 steps, at most `most` + 1 intervals, all inside, exact labels ----
  let bad = 0, n = 0;
  const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  for (let k = 0; k < 400; k++) {
    const c = (rnd() - 0.5) * 10 ** (Math.floor(rnd() * 12) - 6);
    const w = 10 ** (Math.floor(rnd() * 10) - 5) * (0.1 + rnd());
    const lo = c - w, hi = c + w * rnd() * 3;
    const most = 2 + Math.floor(rnd() * 9);
    const tk = P.linTicks(lo, hi, most);
    const step = P.niceStep(hi - lo, most);
    const m = step / 10 ** Math.floor(Math.log10(step) + 1e-12);
    n++;
    const good = [1, 2, 5, 10].some((x) => Math.abs(m - x) < 1e-9)
      && tk.length >= 1 && tk.length <= most + 2
      && tk.every((v) => v >= lo - step * 1e-6 && v <= hi + step * 1e-6)
      && tk.every((v, i) => i === 0 || Math.abs(v - tk[i - 1] - step) <= step * 1e-6)
      && new Set(tk.map((v) => P.tickText(v, tk))).size === tk.length;
    if (!good) { bad++; if (bad < 4) t.note(`ticks ${lo} … ${hi} (${most}): ${tk.join(', ')}`); }
  }
  t.ok(bad === 0, `1-2-5 ticks over ${n} random ranges: ${bad} bad`);
  t.eq(P.linTicks(0, 1, 5).join(','), '0,0.2,0.4,0.6,0.8,1', 'ticks 0 … 1');
  t.eq(P.linTicks(47.3, 53.1, 6).join(','), '48,49,50,51,52,53', 'ticks 47.3 … 53.1');
  t.eq(P.linTicks(0.05, 0.25, 4).join(','), '0.05,0.1,0.15,0.2,0.25', 'ticks 0.05 … 0.25');
  t.eq(P.linTicks(-3, 3, 3).map((v) => P.tickText(v, P.linTicks(-3, 3, 3))).join(' '), '−2 0 2', 'labels with a minus sign');
  t.eq(P.tickText(0.30000000000000004, [0.1, 0.2, 0.3]), '0.3', 'labels rounded to the step');
  t.eq(P.logTicks(1, 100, 10).join(','), '1,2,5,10,20,50,100', 'log ticks 1 … 100');
  t.eq(P.logTicks(1e3, 1e9, 5).join(','), '1000,10000,100000,1000000,10000000,100000000,1000000000', 'log ticks: decades only when many');

  // ---- nice axes hold the data and end on ticks ----
  for (const [lo, hi] of [[0.08, 0.16], [50.1, 50.1], [-1e-4, 3e-3], [103.2, 103.6], [1, 1e4]]) {
    const a = P.niceAxis(lo, hi, 5);
    const tk = P.ticks(a, 5);
    t.ok(a.min <= lo && a.max >= hi && a.max > a.min, `axis ${lo} … ${hi} holds the data (${a.min} … ${a.max})`);
    t.ok(Math.abs(tk[0] - a.min) <= 1e-9 * Math.max(1, Math.abs(a.min)) && Math.abs(tk[tk.length - 1] - a.max) <= 1e-9 * Math.max(1, Math.abs(a.max)), `axis ${lo} … ${hi} ends on ticks`);
  }
  const la = P.niceAxis(1, 1e4, 5, { log: true });
  t.ok(la.log && la.min <= 1 && la.max >= 1e4, 'log axis holds the data');

  // ---- mapping ----
  const ax = { min: 2, max: 6 }, ay = { min: 10, max: 20 }, lg = { min: 1, max: 1000, log: true };
  t.near(P.frac(3, ax), 0.25, 'frac linear');
  t.near(P.frac(10, lg), 1 / 3, 'frac log');
  let inv = 0;
  for (const v of [2, 2.5, 4.4, 6, 7.5]) inv = Math.max(inv, Math.abs(P.valueAt(P.frac(v, ax), ax) - v));
  for (const v of [1, 3, 99, 1000]) inv = Math.max(inv, Math.abs(P.valueAt(P.frac(v, lg), lg) - v) / v);
  t.ok(inv < 1e-12, `valueAt inverts frac (${inv})`);
  t.eq(P.toX(2, ax), 0, 'toX at the minimum');
  t.eq(P.toX(6, ax), P.PLOT_U, 'toX at the maximum');
  t.eq(P.toY(20, ay), 0, 'toY at the top');
  t.eq(P.toY(10, ay), P.PLOT_U, 'toY at the bottom');

  // ---- paths: whole numbers, bounded, broken at gaps ----
  const xs = [], ys = [];
  for (let i = 0; i <= 200; i++) { xs.push(2 + i / 50); ys.push(i === 77 ? NaN : 15 + 1e9 * (i === 150 ? 1 : 0) + 4 * Math.sin(i / 9)); }
  const d = P.linePath(xs, ys, ax, ay);
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  t.ok(nums.every(Number.isInteger), 'line path: whole numbers only');
  t.ok(nums.every((v) => Math.abs(v) < 2 ** 24 && v >= -P.PLOT_U && v <= 2 * P.PLOT_U), `line path: every coordinate within −U … 2U, under 2^24 (an outlier of 1e9 clamped)`);
  t.eq((d.match(/M/g) || []).length, 2, 'line path: a missing point breaks the line into two');
  t.eq(P.linePath([1, 2], [NaN, NaN], ax, ay), '', 'line path of nothing finite is empty');
  t.eq(P.linePath([0, 1, 10], [1, 2, 3], { min: 1, max: 10, log: true }, ay).split('M').length - 1, 1, 'log axis: a point at 0 is left out');
  const lo = ys.map((v) => v - 0.5), hi = ys.map((v) => v + 0.5);
  const b = P.bandPath(xs, lo, hi, ax, ay);
  t.eq((b.match(/Z/g) || []).length, 2, 'band: one closed polygon per run');
  t.ok(b.match(/-?\d+/g).map(Number).every((v) => Number.isInteger(v) && Math.abs(v) <= 2 * P.PLOT_U), 'band: whole, bounded numbers');

  // ---- the cursor ----
  const cx = [0, 1, 2, 4], cy = [10, 20, NaN, 40];
  t.near(P.readAt(cx, cy, 0.25), 12.5, 'readAt interpolates between points');
  t.eq(P.readAt(cx, cy, 1), 20, 'readAt at a point gives its value');
  t.ok(Number.isNaN(P.readAt(cx, cy, 1.5)) && Number.isNaN(P.readAt(cx, cy, 3)), 'readAt next to a missing point is NaN');
  t.ok(Number.isNaN(P.readAt(cx, cy, -1)) && Number.isNaN(P.readAt(cx, cy, 5)), 'readAt outside the points is NaN');
  t.near(P.readAt([4, 2, 0], [1, 2, 3], 1), 2.5, 'readAt over descending x');
  t.eq(P.nearestIndex(cx, 2.9), 2, 'nearest point');
  t.eq(P.stepCursor(cx, 1.2, 1), 2, 'a step right from near 1 goes to 2');
  t.eq(P.stepCursor(cx, 1.2, -5), 0, 'steps stop at the first point');
  t.eq(P.stepCursor(cx, NaN, 1), 0, 'the first step from no cursor is the first point');
  t.eq(P.extent([1, NaN, 3], [0.5, 9]).join(','), '0.5,9', 'extent over several arrays');
  const ls = P.linspace(0.05, 0.25, 41);
  t.ok(ls.length === 41 && ls[0] === 0.05 && ls[40] === 0.25 && Math.abs(ls[20] - 0.15) < 1e-15, 'linspace ends exact');

  // ---- M3.2a: the time axis (seconds in, ps or ns labels), dB and phase ----
  t.eq(JSON.stringify(P.timeScale({ min: -105e-12, max: 270e-12 })), JSON.stringify({ k: 1e12, unit: 'ps' }), 'a record within 1 ns is labelled in ps');
  t.eq(JSON.stringify(P.timeScale({ min: -300e-12, max: 1.2e-9 })), JSON.stringify({ k: 1e9, unit: 'ns' }), 'a record past 1 ns is labelled in ns');
  let badT = 0, nT = 0;
  for (let k = 0; k < 300; k++) {
    const lo = -(5 + rnd() * 300) * 1e-12, hi = (20 + rnd() * 3000) * 1e-12, most = 2 + Math.floor(rnd() * 8);
    const ax = { min: lo, max: hi }, sc = P.timeScale(ax), tk = P.ticks(ax, most);
    if (tk.length < 2) continue; // one tick: no step to read back against
    const labels = tk.map((v) => P.tickText(v, tk, false, sc.k));
    const step = (tk[1] - tk[0]) * sc.k;
    nT++;
    // every label reads back to its tick within a thousandth of the step, the labels are distinct, and 0 is "0"
    const good = labels.every((l, i) => Math.abs(Number(l.replace('−', '-')) - tk[i] * sc.k) <= Math.abs(step) * 1e-3)
      && new Set(labels).size === labels.length && (!tk.includes(0) || labels[tk.indexOf(0)].replace(/^−/, '') .match(/^0(\.0+)?$/));
    if (!good) badT++;
  }
  t.ok(badT === 0, `time ticks over ${nT} random records: labels in ps or ns read back exactly and are distinct (${badT} bad)`);
  t.eq(P.tickText(-2e-10, [-2e-10, 0, 2e-10], false, 1e12), '−200', 'a time tick in ps with U+2212');
  t.eq(P.tickText(5e-10, [0, 5e-10, 1e-9], false, 1e9), '0.5', 'a time tick in ns with its decimal');
  t.near(P.dbOf(0.1, 0), -20, 'dB of 0.1 is −20');
  t.near(P.dbOf(0, -1), 0, 'dB of a unit magnitude is 0');
  t.near(P.dbOf(0.6, 0.8), 0, 'dB uses the complex magnitude');
  t.eq(P.dbOf(0, 0), P.DB_FLOOR, 'dB of zero is the floor');
  t.eq(P.dbOf(1e-9, 0), P.DB_FLOOR, 'dB under the floor is the floor');
  t.ok(Number.isNaN(P.dbOf(NaN, 0)), 'dB of a missing value is NaN (a break in the line)');
  t.near(P.phaseOf(0, 1), 90, 'phase of j is 90°');
  t.near(P.phaseOf(-1, -1e-300), -180, 'phase just under the negative axis is −180°');
  t.eq(P.phaseOf(0, 0), 0, 'phase of zero is 0');
  const db = [0.5, 0.1, 0.01].map((m) => P.dbOf(m, 0));
  const dbPath = P.linePath([1, 2, 3], db, { min: 0, max: 4 }, { min: -40, max: 0 });
  t.eq(dbPath, `M25000 ${Math.round(100000 * (-db[0] / 40))}L50000 50000L75000 100000`, 'a dB series is a linear path on a linear dB axis');
}
