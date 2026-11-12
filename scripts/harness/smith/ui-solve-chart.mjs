// Step M4.3b, run by ui-solve.mjs in its browser: the solver on the chart. The goal's ring, the construction's two
// circles and a preview's arcs are read back from the DOM (the path's `d`, world units mapped back to Γ through the
// view's frame) and must lie on the engine's circles (geometry.ts circleResidual ≤ 1e-9, `A` radii to 1e-9, open arcs
// ending on the rim); the crossings are the solutions' points; the pole of an r goal is marked at the open and the
// goal's mark sits on a point target. Previews by hover, focus and tap draw the applied solution's path (every arc's
// start on the engine's node). The family's slider by keys and by touch shows family.at(t) of the engine for the t it
// reports, previews its first member and applies one. Standard-value variants equal values.ts standardVariants to the
// bit, apply exactly, follow the lists and vanish for "any value". The value lists round-trip through the link and
// localStorage (the link first), an own list included.

import * as importedState from '../../../lib/smith/state.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedSolve from '../../../lib/smith/solve.ts';
import * as importedGoal from '../../../lib/smith/goal.ts';
import * as importedGeometry from '../../../lib/smith/geometry.ts';
import * as importedGoalView from '../../../lib/smith/goalView.ts';
import * as importedValues from '../../../lib/smith/values.ts';
import * as importedQuantity from '../../../lib/quantity.ts';

const S = importedState.default ?? importedState;
const N = importedNetwork.default ?? importedNetwork;
const P = importedParts.default ?? importedParts;
const V = importedSolve.default ?? importedSolve;
const GL = importedGoal.default ?? importedGoal;
const G = importedGeometry.default ?? importedGeometry;
const GV = importedGoalView.default ?? importedGoalView;
const VL = importedValues.default ?? importedValues;
const Q = importedQuantity.default ?? importedQuantity;

export const chartCounts = { circles: 0, 'arc points': 0, crossings: 0, previews: 0, 'slider members': 0, variants: 0 };
const TOL = 1e-9;
const rel = (a, b) => (Object.is(a, b) ? 0 : Math.abs(a - b) / Math.max(Math.abs(b), 1e-300));
const readRaw = (t) => (t === 'inf' ? Infinity : t === '-inf' ? -Infinity : Number(t));
const hasZc = (k) => k === P.LINE || k === P.STUB_OPEN || k === P.STUB_SHORT;

/** SolvePanel's applySolution, independently: parts first, then f0. */
export function applied(c, s) {
  const parts = c.parts.map((p) => ({ ...p }));
  let f = NaN;
  for (const v of s.values) {
    if (v.param === 'f0') { f = v.value; continue; }
    if (v.param === 'zc') parts[v.part].zc = v.value;
    else parts[v.part] = hasZc(v.kind) ? { kind: v.kind, value: v.value, zc: parts[v.part].zc } : { kind: v.kind, value: v.value };
  }
  const next = { ...c, parts };
  return f === f ? V.atFrequency(next, f) : next;
}
/** Γ of every node of a circuit (network.ts). */
function gammas(c) {
  const n = c.parts.length, nodes = new Float64Array((n + 1) * N.NODE_STRIDE), out = [];
  N.evaluate(nodes, P.packParts(c.parts), n, c.loadR, c.loadX, c.z0, c.f0, c.f0);
  for (let k = 0; k <= n; k++) { const g = [0, 0]; N.nodeGamma(g, 0, nodes, k * N.NODE_STRIDE); out.push(g); }
  return out;
}

/** The commands of a path's d: [{ c, n: numbers }]. */
function parsePath(d) {
  const out = [];
  const re = /([MLA])([^MLA]*)/g;
  let m;
  while ((m = re.exec(d ?? ''))) out.push({ c: m[1], n: m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number) });
  return out;
}
/** Every point of a path in Γ (the view's world frame mapped back), and the radii of its `A` commands in Γ. */
function pathPoints(d, f) {
  const pts = [], radii = [], starts = [];
  for (const { c, n } of parsePath(d)) {
    const [x, y] = c === 'A' ? n.slice(5, 7) : n.slice(0, 2);
    const g = [x / f.fk + f.fx, f.fy - y / f.fk];
    pts.push(g);
    if (c === 'M') starts.push(g);
    if (c === 'A') radii.push(n[0] / f.fk);
  }
  return { pts, radii, starts };
}

const readChart = (page) => page.evaluate(() => {
  const box = document.querySelector('[data-chart]'), v = box.smithChart, l = box.smithSolveLayer;
  const t = (sel) => { const e = box.querySelector(sel); if (!e || e.hidden) return null; const m = /translate\(([-\d.e+]+)px,\s*([-\d.e+]+)px\)/.exec(e.style.transform); return m ? [Number(m[1]), Number(m[2])] : null; };
  const d = (sel) => box.querySelector(sel)?.getAttribute('d') ?? '';
  return {
    f: { fx: v.fx, fy: v.fy, fk: v.fk }, view: { w: v.w, h: v.h, cx: v.cx, cy: v.cy, k: v.k },
    ring: d('[data-goal-ring]'), c0: d('[data-solve-circle="0"]'), c1: d('[data-solve-circle="1"]'), preview: d('[data-preview]'),
    circleNode: l.circleNode, crossings: Array.from(l.crossings.slice(0, 2 * l.crossCount)),
    crossEls: [...box.querySelectorAll('[data-crossing]')].filter((e) => !e.hidden).length,
    pole: t('[data-goal-pole]'), goal: t('[data-goal]'), previewing: box.hasAttribute('data-previewing'),
    end: Array.from(l.previewEnd),
  };
});
const screen = (view, gr, gi) => [view.w / 2 + (gr - view.cx) * view.k, view.h / 2 - (gi - view.cy) * view.k];

export async function runChartChecks({ p, browser, ok, load, open, settle, linked, query, offGoal, gammaAt, expected, CASES, frame }) {
  // ---------- the construction's circles and the goal's ring against the engine ----------
  const circleCheck = (what, d, circ, f, open) => {
    const { pts, radii } = pathPoints(d, f);
    let worst = 0, rim = 0, rad = 0;
    for (const [x, y] of pts) worst = Math.max(worst, Math.abs(G.circleResidual(circ, 0, x, y)));
    const cc = new Float64Array(3);
    G.circleCentre(cc, 0, circ, 0);
    for (const r of radii) rad = Math.max(rad, rel(r, cc[2]));
    if (open && pts.length) rim = Math.max(Math.abs(Math.hypot(...pts[0]) - 1), Math.abs(Math.hypot(...pts[pts.length - 1]) - 1));
    chartCounts['arc points'] += pts.length;
    ok(pts.length >= 2 && worst <= TOL && rad <= TOL && rim <= TOL, `${what}: ${pts.length} points on the engine's circle (worst ${worst}), radii ${rad}, rim ${rim}`);
  };
  for (const name of ['solved', 'swapped', 'lines', 'tangent', 'none', 'best', 'range', 'family', 'node', 'point', 'samejob']) {
    await load(p, CASES[name]);
    const c = await linked(p), { r } = expected(c), got = await readChart(p);
    ok(got.circleNode === r.circleNode, `${name}: the circles are at node ${got.circleNode}, the solver's ${r.circleNode}`);
    for (let k = 0; k < 2; k++) {
      const arc = new Float64Array(G.ARC_STRIDE), circ = r.circles.slice(4 * k, 4 * k + 4), inside = r.circleNode >= 0 && GV.diskArc(arc, 0, circ, 0);
      const d = k ? got.c1 : got.c0;
      ok(!!d === inside, `${name}: circle ${k} drawn ${!!d}, inside the disk ${inside}`);
      if (inside && d) { chartCounts.circles++; circleCheck(`${name} circle ${k}`, d, circ, got.f, arc[G.ARC_TURNS] === 0); }
    }
    // The crossings drawn are the solutions' points at the circles' node.
    if (r.status === 'solved' && r.circleNode >= 0) {
      const pts = r.solutions.map((s) => gammas(applied(c, s))[r.circleNode]);
      ok(got.crossEls === got.crossings.length / 2, `${name}: ${got.crossEls} crossing marks for ${got.crossings.length / 2} crossings`);
      for (let j = 0; j < got.crossings.length; j += 2) {
        const dmin = Math.min(...pts.map(([x, y]) => Math.hypot(x - got.crossings[j], y - got.crossings[j + 1])));
        chartCounts.crossings++;
        ok(dmin <= 1e-7, `${name}: crossing ${j / 2} is a solution's point (${dmin})`);
      }
      if (name === 'solved') ok(got.crossings.length === 4, `solved: two crossings drawn (${got.crossings.length / 2})`);
    }
    // The goal's ring is the engine's: a point target's close-enough circle, else the goal's circle.
    const ring = new Float64Array(4), goal = S.askOf(c).goal;
    GV.goalRing(ring, 0, goal, c.z0);
    const rarc = new Float64Array(G.ARC_STRIDE);
    if (GV.diskArc(rarc, 0, ring, 0)) circleCheck(`${name} goal ring`, got.ring, ring, got.f, rarc[G.ARC_TURNS] === 0);
    else ok(got.ring === '', `${name}: no ring for a goal without a circle in the disk`);
    // The mark: on a point target, at the centre of an inequality goal, none for r, g, x, b; the pole of r and x at the open.
    const mk = new Float64Array(6), has = GV.goalMark(mk, goal, c.z0);
    if (has) { const [sx, sy] = screen(got.view, mk[0], mk[1]); ok(got.goal && Math.abs(got.goal[0] - sx) < 0.01 && Math.abs(got.goal[1] - sy) < 0.01, `${name}: the goal's mark at ${mk[0]}, ${mk[1]} (${got.goal})`); }
    else ok(got.goal === null, `${name}: no mark for a circle goal`);
    const pole = GL.goalPole(goal);
    if (pole) { const [sx, sy] = screen(got.view, pole, 0); ok(got.pole && Math.abs(got.pole[0] - sx) < 0.01 && Math.abs(got.pole[1] - sy) < 0.01, `${name}: the pole is crossed out at Γ = ${pole}`); }
    else ok(got.pole === null, `${name}: no pole mark`);
  }
  await load(p, CASES.node);
  {
    const c = await linked(p), g = gammaAt(c, 1), res = GL.goalResidual(S.askOf(c).goal, g[0], g[1], c.z0);
    const text = await p.textContent('[data-goal-text]'), dist = await p.textContent('[data-goal-distance]');
    ok(/the circle r = 1 at node 1/.test(text) && /crossed out/.test(text) && dist === Q.formatAmount(res, '', 4, true), `an r goal at node 1 in the node table: ${dist} vs ${res}`);
  }

  // ---------- previews: hover, focus, leaving ----------
  const previewOf = async (page, c, s, what) => {
    const got = await readChart(page), want = gammas(applied(c, s)), { starts } = pathPoints(got.preview, got.f);
    let worst = 0;
    for (let i = 0; i < starts.length; i++) worst = Math.max(worst, Math.hypot(starts[i][0] - want[i][0], starts[i][1] - want[i][1]));
    const k = GL.goalNode(S.askOf(c).goal, c.parts.length), end = want[Math.min(k, c.parts.length)];
    chartCounts.previews++;
    ok(got.previewing && starts.length === c.parts.length && worst <= TOL && Math.hypot(got.end[0] - end[0], got.end[1] - end[1]) <= TOL,
      `${what}: the preview's ${starts.length} arcs start on the applied circuit's nodes (worst ${worst})`);
  };
  const cleared = async (page, what) => { const got = await readChart(page); ok(!got.previewing && got.preview === '', `${what}: the preview is cleared`); };
  for (const name of ['solved', 'lines', 'point']) {
    await load(p, CASES[name]);
    const c = await linked(p), { r } = expected(c);
    for (let k = 0; k < r.solutions.length; k++) {
      await p.hover(`[data-solution="${k}"] [data-value]`);
      await frame(p);
      await previewOf(p, c, r.solutions[k], `${name} #${k} hover`);
    }
    await p.mouse.move(5, 5);
    await frame(p);
    await cleared(p, `${name}: the mouse left`);
    await p.focus('[data-solution="0"]');
    await frame(p);
    await previewOf(p, c, r.solutions[0], `${name} #0 focus`);
    await p.keyboard.press('Tab');
    await frame(p);
    const inApply = await p.evaluate(() => document.activeElement?.hasAttribute('data-apply'));
    if (inApply) await previewOf(p, c, r.solutions[0], `${name} #0 focus on its Apply`);
    await p.focus('[data-goal-kind]');
    await frame(p);
    await cleared(p, `${name}: the focus left`);
  }

  // ---------- the family's slider by keys ----------
  await load(p, CASES.family);
  {
    const c = await linked(p), { r } = expected(c);
    const at = async () => p.evaluate(() => {
      const s = document.querySelector('[data-family-slider]');
      return { t: s.getAttribute('data-t'), pos: Number(s.value), text: s.getAttribute('aria-valuetext'),
        members: [...document.querySelectorAll('[data-member]')].map((e) => [...e.querySelectorAll('[data-value]')].map((v) => v.getAttribute('data-raw'))) };
    }).then((o) => ({ ...o, members: o.members.map((m) => m.map(readRaw)) }));
    const compare = (o, what) => {
      const t = readRaw(o.t), want = r.family.at(t);
      const same = want.length === o.members.length && want.every((s, j) => s.values.every((v, i) => rel(o.members[j][i], v.value) <= 1e-12));
      chartCounts['slider members'] += o.members.length;
      ok(same && want.length >= 1, `${what}: t = ${o.t}: ${o.members.length} members shown, family.at gives ${want.length} (${JSON.stringify(o.members)} vs ${JSON.stringify(want.map((s) => s.values.map((v) => v.value)))})`);
      return want;
    };
    const o0 = await at();
    compare(o0, 'family, first position');
    await p.focus('[data-family-slider]');
    for (let j = 0; j < 40; j++) await p.keyboard.press('ArrowRight');
    await frame(p);
    const o1 = await at();
    ok(o1.pos === o0.pos + 40 && o1.t !== o0.t, `family: 40 × ArrowRight moves the slider (${o0.pos} → ${o1.pos})`);
    const want = compare(o1, 'family, after the keys');
    await previewOf(p, c, want[0], 'family slider (focused)');
    await p.keyboard.press('PageUp');
    await frame(p);
    compare(await at(), 'family, after PageUp');
    const o2 = await at(), w2 = r.family.at(readRaw(o2.t));
    await p.click('[data-apply-member="0"]');
    await settle(p);
    const after = await linked(p);
    ok(offGoal(after) < 1e-9 && after.parts.every((q, i) => i !== w2[0].values[0].part || rel(q.value, w2[0].values[0].value) <= 1e-12), `family: Apply on the member shown meets the goal (${offGoal(after)})`);
    await p.click('[data-undo]');
    await settle(p);
    ok(S.sameCircuit(await linked(p), c), 'family: one Undo takes the member back');
  }

  // ---------- standard-value variants and the value lists ----------
  const variantsMatch = async (page, choice, what) => {
    const c = await linked(page), { r } = expected(c), goal = S.askOf(c).goal;
    const shown = await page.evaluate(() => [...document.querySelectorAll('[data-solution]')].map((e) =>
      [...e.querySelectorAll('[data-variant]')].map((v) => [...v.querySelectorAll('[data-variant-value]')].map((x) => x.getAttribute('data-raw')))));
    let good = true, n = 0;
    r.solutions.forEach((s, k) => {
      const want = VL.standardVariants(c, goal, s, choice), visible = want.some((v) => !v.exact) ? want : [];
      if (visible.length !== shown[k].length) good = false;
      visible.forEach((v, j) => { n++; if (!shown[k][j] || !v.values.every((x, i) => Object.is(readRaw(shown[k][j][i]), x))) good = false; });
    });
    chartCounts.variants += n;
    ok(good, `${what}: ${n} variants equal standardVariants (${JSON.stringify(shown)})`);
    return n;
  };
  await p.evaluate(() => { try { localStorage.removeItem('smith.lists'); } catch { /* none */ } });
  await load(p, CASES.solved);
  ok(await variantsMatch(p, VL.defaultChoice(), 'solved, E24') > 0, 'solved: E24 variants are shown');
  {
    const c = await linked(p), { r } = expected(c), want = VL.standardVariants(c, S.askOf(c).goal, r.solutions[0], VL.defaultChoice())[0];
    await p.click('[data-solution="0"] [data-apply-variant="0"]');
    await settle(p);
    const after = await linked(p);
    ok(r.solutions[0].values.every((v, i) => Object.is(after.parts[v.part].value, want.values[i])), `a variant's Apply puts its values in exactly (${JSON.stringify(after.parts.map((q) => q.value))})`);
    await p.click('[data-undo]');
    await settle(p);
    // A variant previews too.
    await p.hover('[data-solution="0"] [data-variant="0"]');
    await frame(p);
    await previewOf(p, c, { values: r.solutions[0].values.map((v, i) => ({ ...v, value: want.values[i] })) }, 'a variant (hover)');
    await p.mouse.move(5, 5);
  }
  // The lists: L on E12 → the link, localStorage and the variants follow.
  await p.click('[data-lists] summary');
  await p.selectOption('[data-list-kind="L"]', 'E12');
  await settle(p);
  ok(/[?&]vl=L12(&|$)/.test(await query(p)) && await p.evaluate(() => localStorage.getItem('smith.lists')) === 'L12', async () => `L on E12: in the link and localStorage (${await query(p)})`);
  await variantsMatch(p, VL.choiceFromText('L12'), 'L on E12');
  await p.selectOption('[data-list-kind="C"]', 'any');
  await p.selectOption('[data-list-kind="L"]', 'any');
  await settle(p);
  ok(await p.$('[data-variants]') === null, 'no variants when every list is "any value"');
  // An own list for C, typed.
  await p.selectOption('[data-list-kind="C"]', 'own');
  await p.fill('[data-list-own="C"]', '10p, 22p, 47p');
  await settle(p);
  const ownWant = VL.choiceToText({ ...VL.defaultChoice(), L: { id: 'any' }, C: { id: 'own', values: [10e-12, 22e-12, 47e-12] } });
  ok((await query(p)).includes(`vl=${ownWant}`) && await p.evaluate(() => localStorage.getItem('smith.lists')) === ownWant, async () => `an own C list in the link and localStorage: ${await query(p)} (want ${ownWant})`);
  await variantsMatch(p, VL.choiceFromText(ownWant), 'own C list');
  // Reload without vl: localStorage brings the lists back (and the link gets them again); with vl, the link wins.
  const q0 = (await query(p)).replace(/[?&]vl=[^&]*/, '').replace(/^\?/, '');
  await load(p, q0);
  ok((await query(p)).includes(`vl=${ownWant}`) && await p.inputValue('[data-list-kind="C"]') === 'own', async () => `reload without vl: localStorage restores the lists (${await query(p)})`);
  await load(p, `${q0}&vl=R6`);
  ok(/vl=R6(&|$)/.test(await query(p)) && await p.inputValue('[data-list-kind="R"]') === 'E6' && await p.inputValue('[data-list-kind="C"]') === 'E24', async () => `a link's vl wins over localStorage (${await query(p)})`);
  await p.evaluate(() => { try { localStorage.removeItem('smith.lists'); } catch { /* none */ } });
  ok(p.errors.length === 0, () => `chart checks: no errors: ${p.errors.join(' | ')}`);

  // ---------- touch at 390 px: a tap previews, the slider follows a finger ----------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const t = await open(phone, CASES.solved);
  {
    const c = await linked(t), { r } = expected(c);
    await t.locator('[data-solution="1"] [data-value]').first().tap();
    await frame(t);
    await previewOf(t, c, r.solutions[1], '390 px: a tap on solution 2');
    await t.locator('[data-goal-node]').tap();
    await frame(t);
    await cleared(t, '390 px: a tap elsewhere');
    await load(t, CASES.family);
    const s = t.locator('[data-family-slider]');
    await s.scrollIntoViewIfNeeded();
    const b = await s.boundingBox(), before = await s.getAttribute('data-t');
    await t.touchscreen.tap(b.x + b.width * 0.85, b.y + b.height / 2);
    await frame(t);
    const after = await s.getAttribute('data-t'), pos = Number(await s.inputValue());
    ok(after !== before && pos > 600, `390 px: a tap on the slider moves it (${before} → ${after}, position ${pos})`);
    ok(await t.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), '390 px: no horizontal scroll with the slider');
    ok(t.errors.length === 0, () => `390 px chart checks: no errors: ${t.errors.join(' | ')}`);
  }
  await phone.close();
}
