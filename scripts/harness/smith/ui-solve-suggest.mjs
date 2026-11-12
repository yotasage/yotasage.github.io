// Step M4.4b, run by ui-solve.mjs in its browser: the suggestions of the Solve panel when nothing is marked. For three
// circuits (the start circuit with its load moved, so two pairs and two singles; a VSWR ≤ 1.5 goal; three parts and a
// point Z target) the rows equal lib/smith/suggest.ts suggest() for the linked circuit (order, parts, kinds, values to
// 1e-12 relative, meets, |Γ|, the standard-value variants' count); the goal already held and no part before the goal's
// node give their texts. A suggestion previews by hover, focus and tap (the applied circuit's Γ at the goal node, and
// the suggestion's circles at its node while it is shown, gone after); Apply gives the |Γ| the row states (the goal held
// to 1e-9 when it meets it) and is one undo step, by mouse, by keys alone and by tap; "Solve for" marks its parts; no
// horizontal scroll at 390 and 320 px.

import * as importedState from '../../../lib/smith/state.ts';
import * as importedGoal from '../../../lib/smith/goal.ts';
import * as importedSuggest from '../../../lib/smith/suggest.ts';
import { applied } from './ui-solve-chart.mjs';

const S = importedState.default ?? importedState;
const GL = importedGoal.default ?? importedGoal;
const SG = importedSuggest.default ?? importedSuggest;

export const suggestCounts = { circuits: 0, suggestions: 0, values: 0, previews: 0, applied: 0 };

const START = 'v=1&z0=50&f0=100e6&p=cs:31.83098861837907e-12,lp:79.57747154594767e-9';
export const SUGGEST = {
  start: `${START}&zl=30:10`,
  vswr: `${START}&zl=30:10&g=vswr:1.5:within`,
  three: 'v=1&z0=50&f0=100e6&zl=100:-40&p=ls:20e-9,cp:10e-12,tl:0.1:50&g=pt:40:15',
  holds: `${START}&zl=25:25`,
  none: 'v=1&z0=50&f0=100e6&zl=25:25&p=cs:10e-12&g=vswr:1.5:within@0',
};

const rel = (a, b) => (Object.is(a, b) ? 0 : Math.abs(a - b) / Math.max(Math.abs(b), 1e-300));
const readRaw = (t) => (t === 'inf' ? Infinity : t === '-inf' ? -Infinity : Number(t));

/** What the suggestions box shows. */
const shown = (page) => page.evaluate(() => {
  const box = document.querySelector('[data-suggest-status]');
  return {
    status: box?.getAttribute('data-suggest-status') ?? '',
    head: box?.querySelector('[data-suggest-head]')?.textContent ?? '',
    rows: [...document.querySelectorAll('[data-suggestion]')].map((e) => ({
      meets: e.hasAttribute('data-meets'),
      gamma: e.getAttribute('data-gamma'),
      variants: e.querySelectorAll('[data-variant]').length,
      values: [...e.querySelectorAll('[data-value]')].map((v) => ({ part: Number(v.getAttribute('data-part')), param: v.getAttribute('data-param'), kind: Number(v.getAttribute('data-kind')), raw: v.getAttribute('data-raw') })),
    })),
  };
});
const layer = (page) => page.evaluate(() => {
  const box = document.querySelector('[data-chart]'), l = box.smithSolveLayer;
  return { previewing: box.hasAttribute('data-previewing'), end: Array.from(l.previewEnd), circleNode: l.circleNode, shown: l.shownCircles, circles: Array.from(l.circles), c0: box.querySelector('[data-solve-circle="0"]')?.getAttribute('d') ?? '' };
});

export async function runSuggestChecks({ p, browser, ok, load, open, settle, linked, query, gammaAt, frame }) {
  const want = (c) => SG.suggest(c, S.askOf(c).goal);
  const nodeOf = (c) => GL.goalNode(S.askOf(c).goal, c.parts.length);

  /** The preview of suggestion g of circuit c is on the chart: its circuit's Γ at the goal node, its circles. */
  const previewOf = async (page, c, g, what) => {
    const got = await layer(page), a = applied(c, g.solution), e = gammaAt(a, nodeOf(a));
    suggestCounts.previews++;
    ok(got.previewing && Math.hypot(got.end[0] - e[0], got.end[1] - e[1]) <= 1e-9, () => `${what}: the preview ends on the applied circuit's Γ (${got.end} vs ${e})`);
    ok(got.circleNode === g.circleNode && (g.circleNode < 0 || got.circles.every((v, i) => rel(v, g.circles[i]) <= 1e-12)), () => `${what}: its circles are drawn at node ${g.circleNode} (${got.circleNode})`);
  };
  const cleared = async (page, what) => {
    const got = await layer(page);
    ok(!got.previewing && got.circleNode === -1 && got.c0 === '', () => `${what}: preview and circles cleared (${JSON.stringify({ ...got, circles: 0 })})`);
  };

  // ---------- the rows equal suggest() ----------
  for (const name of ['start', 'vswr', 'three']) {
    await load(p, SUGGEST[name]);
    const c = await linked(p), r = want(c), got = await shown(p);
    suggestCounts.circuits++;
    ok(got.status === 'some' && got.rows.length === r.list.length && r.list.length > 0, () => `${name}: ${got.rows.length} suggestions shown, suggest() gives ${r.list.length} (${got.status})`);
    ok(/^Suggestions:|nearest:$/.test(got.head), () => `${name}: the head "${got.head}"`);
    for (let k = 0; k < Math.min(got.rows.length, r.list.length); k++) {
      const row = got.rows[k], g = r.list[k];
      suggestCounts.suggestions++;
      ok(row.meets === g.meets && rel(readRaw(row.gamma), g.solution.gamma) <= 1e-12, () => `${name} #${k}: meets ${row.meets}/${g.meets}, |Γ| ${row.gamma}/${g.solution.gamma}`);
      ok(row.variants === (g.variants.some((v) => !v.exact) ? g.variants.length : 0), () => `${name} #${k}: ${row.variants} variants (${g.variants.length})`);
      ok(row.values.length === g.solution.values.length, `${name} #${k}: as many values as suggest()`);
      for (let j = 0; j < Math.min(row.values.length, g.solution.values.length); j++) {
        const v = row.values[j], w = g.solution.values[j];
        suggestCounts.values++;
        ok(v.part === w.part && v.param === w.param && v.kind === w.kind && rel(readRaw(v.raw), w.value) <= 1e-12, () => `${name} #${k}.${j}: ${JSON.stringify(v)} vs ${w.part} ${w.param} ${w.kind} ${w.value}`);
      }
    }
    ok(r.list.some((g) => g.unknowns.length === 2) || name !== 'start', `${name}: a pair among them`);
  }

  // ---------- holds and none ----------
  await load(p, SUGGEST.holds);
  let got = await shown(p);
  ok(got.status === 'holds' && /already meets the goal at the input/.test(got.head) && got.rows.length === 0, () => `holds: "${got.head}" (${got.status})`);
  await load(p, SUGGEST.none);
  got = await shown(p);
  ok(got.status === 'none' && /^No change of one or two parts meets the goal: no part lies before the goal’s node/.test(got.head), () => `none: "${got.head}" (${got.status})`);

  // ---------- previews: hover, leaving, focus ----------
  for (const name of ['start', 'three']) {
    await load(p, SUGGEST[name]);
    const c = await linked(p), r = want(c);
    for (let k = 0; k < r.list.length; k++) {
      await p.hover(`[data-suggestion="${k}"] [data-value]`);
      await frame(p);
      await previewOf(p, c, r.list[k], `${name} #${k} hover`);
    }
    await p.mouse.move(5, 5);
    await frame(p);
    await cleared(p, `${name}: the mouse left`);
    await p.focus('[data-suggestion="0"]');
    await frame(p);
    await previewOf(p, c, r.list[0], `${name} #0 focus`);
    // A variant of a suggestion previews with the suggestion's circles.
    if (await p.$('[data-suggestion="0"] [data-variant="0"]')) {
      await p.click('[data-suggestion="0"] [data-variant-fold] > summary');
      await p.mouse.move(5, 5);
      await p.focus('[data-suggestion="0"] [data-variant="0"]');
      await frame(p);
      const l = await layer(p);
      ok(l.previewing && l.circleNode === r.list[0].circleNode, `${name}: a suggestion's variant previews with its circles`);
    }
    await p.focus('[data-goal-kind]');
    await frame(p);
    await cleared(p, `${name}: the focus left`);
  }

  // ---------- Apply: the stated |Γ|, one undo step ----------
  for (const name of ['start', 'vswr', 'three']) {
    await load(p, SUGGEST[name]);
    const before = await linked(p), r = want(before);
    for (let k = 0; k < r.list.length; k++) {
      if (k) await load(p, SUGGEST[name]);
      const g = r.list[k];
      await p.click(`[data-apply-suggestion="${k}"]`);
      await settle(p);
      const after = await linked(p), e = gammaAt(after, nodeOf(after));
      suggestCounts.applied++;
      ok(Math.abs(Math.hypot(e[0], e[1]) - g.solution.gamma) <= 1e-9, () => `${name} #${k}: after Apply |Γ| = ${Math.hypot(e[0], e[1])}, the row said ${g.solution.gamma}`);
      if (g.meets) ok(SG.goalHolds(after, S.askOf(after).goal) || GL.goalResidual(S.askOf(after).goal, e[0], e[1], after.z0) <= 1e-9, `${name} #${k}: the goal holds after Apply`);
      ok(S.askOf(after).unknowns.length === 0, `${name} #${k}: nothing is marked after Apply`);
      await p.click('[data-undo]');
      await settle(p);
      ok(S.sameCircuit(await linked(p), before), async () => `${name} #${k}: one Undo brings the circuit back (${await query(p)})`);
    }
  }

  // ---------- "Solve for" marks the suggestion's parts ----------
  await load(p, SUGGEST.start);
  {
    const c = await linked(p), g = want(c).list[0];
    await p.click('[data-mark-suggestion="0"]');
    await settle(p);
    const after = await linked(p), u = S.askOf(after).unknowns;
    ok(u.length === g.unknowns.length && u.every((x) => g.unknowns.some((y) => S.sameUnknown(x, y))) && S.sameNetwork(after, c), async () => `"Solve for" marks the suggestion's parts (${await query(p)})`);
    ok(await p.getAttribute('[data-solve-status]', 'data-solve-status') === 'solved' && !(await p.$('[data-suggest-status]')), '"Solve for": the panel solves, the suggestions go');
  }

  // ---------- keys alone: Tab to a suggestion (preview), Tab to its Apply, Enter ----------
  await load(p, SUGGEST.three);
  {
    const c = await linked(p), r = want(c);
    await p.focus('[data-goal-kind]');
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await p.keyboard.press('Tab');
      reached = await p.evaluate(() => document.activeElement?.getAttribute('data-suggestion') === '0');
    }
    ok(reached, 'Tab reaches the first suggestion');
    await frame(p);
    if (reached) await previewOf(p, c, r.list[0], 'keys: the focused suggestion');
    // Past the first row's short line (its info button) to Apply.
    let onApply = false;
    for (let i = 0; i < 3 && !onApply; i++) {
      await p.keyboard.press('Tab');
      onApply = await p.evaluate(() => document.activeElement?.getAttribute('data-apply-suggestion') === '0');
    }
    ok(onApply, () => 'Tab goes on to its Apply');
    await p.keyboard.press('Enter');
    await settle(p);
    const e = gammaAt(await linked(p), nodeOf(c));
    ok(!S.sameNetwork(await linked(p), c) && Math.abs(Math.hypot(e[0], e[1]) - r.list[0].solution.gamma) <= 1e-9, 'keys: Enter on Apply applies the suggestion');
    await p.keyboard.press('Control+z');
    await settle(p);
    ok(S.sameCircuit(await linked(p), c), 'keys: Ctrl+Z takes it back');
  }

  // ---------- touch at 390 and 320 px ----------
  for (const width of [390, 320]) {
    const phone = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
    const t = await open(phone, SUGGEST.start);
    const c = await linked(t), r = want(c);
    ok(await t.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width} px: no horizontal scroll with the suggestions`);
    await t.locator('[data-suggestion="1"] [data-value]').first().tap();
    await frame(t);
    await previewOf(t, c, r.list[1], `${width} px: a tap previews`);
    await t.locator('[data-apply-suggestion="1"]').tap();
    await settle(t);
    const e = gammaAt(await linked(t), nodeOf(c));
    ok(Math.abs(Math.hypot(e[0], e[1]) - r.list[1].solution.gamma) <= 1e-9, `${width} px: Apply by tap`);
    ok(t.errors.length === 0, () => `${width} px suggestions: no errors: ${t.errors.join(' | ')}`);
    await phone.close();
  }
}
