// L2a: pure-Node checks of the playground's dock layout model (lib/python/layout/{model,presets,storage}.ts).
// Run by unit-checks.mjs (Part A of `npm run check`).
import assert from 'node:assert/strict';

import {
  allGroups,
  checkTree,
  findPanel,
  fitToWidth,
  fixSizes,
  insertTab,
  MIN_FRACTION,
  minSize,
  moveIfChanged,
  movePanel,
  moveTargets,
  normalize,
  PANEL_IDS,
  removePanel,
  resizeBoundary,
  sameArrangement,
  setSizes,
  setSizesById,
  splitDepth,
  splitGroup,
  splitPage,
  unmergeSizes,
  withoutPanels,
} from '../../../lib/python/layout/model.ts';
import { PRESET_IDS, PRESETS, presetTree } from '../../../lib/python/layout/presets.ts';
import {
  DEFAULT_LAYOUT,
  LAYOUT_STORAGE_KEY,
  loadLayout,
  parseStoredLayout,
  saveLayout,
  serializeLayout,
  treeForLayout,
} from '../../../lib/python/layout/storage.ts';

const g = (id, panels, active = panels[0]) => ({ kind: 'group', id, panels, active });
const s = (id, dir, children, sizes) => ({ kind: 'split', id, dir, children, sizes });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const sum = (a) => a.reduce((x, y) => x + y, 0);

/** Window width → the dock's width (main padding 16 px each side, 1400 px max width). */
const dockWidth = (w) => Math.min(1400, w) - 32;

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  };
}

export async function runLayoutUnitChecks(check) {
  await check('layout: every preset is valid, has all six panels and keeps the Editor alone', () => {
    assert.equal(PRESET_IDS.length, 6);
    for (const id of PRESET_IDS) {
      const t = PRESETS[id].tree;
      assert.equal(checkTree(t), null, `${id}: ${checkTree(t)}`);
      const ed = findPanel(t, 'editor');
      assert.deepEqual([...ed.panels], ['editor'], id);
      for (const p of PANEL_IDS) assert.ok(findPanel(t, p), `${id} lacks ${p}`);
      assert.ok(splitDepth(t) <= 4);
    }
    assert.deepEqual([...findPanel(PRESETS.classic.tree, 'console').panels], ['console', 'repl', 'plots', 'display']);
    assert.deepEqual([...findPanel(PRESETS.wideOutput.tree, 'console').panels], ['console', 'repl']);
    assert.deepEqual([...findPanel(PRESETS.wideOutput.tree, 'plots').panels], ['plots', 'display']);
    assert.deepEqual([...findPanel(PRESETS.displayFocus.tree, 'files').panels], ['plots', 'files']);
  });

  await check('layout: every preset fits a 1280 px window and is tall only with a full-width bottom row', () => {
    for (const id of PRESET_IDS) {
      const t = PRESETS[id].tree;
      const m = minSize(t);
      assert.ok(m.w <= dockWidth(1280), `${id} min width ${m.w}`);
      assert.ok(m.h <= (PRESETS[id].tall ? 640 : 540), `${id} min height ${m.h}`);
      assert.equal(PRESETS[id].tall, t.kind === 'split' && t.dir === 'column', id);
      // Nothing merges at 1280 px or wider.
      assert.equal(fitToWidth(t, dockWidth(1280)).merges.length, 0, id);
      assert.equal(fitToWidth(t, dockWidth(1920)).merges.length, 0, id);
    }
  });

  await check('layout: checkTree rejects bad shapes, duplicate/missing/unknown panels, Editor tabbed, bad sizes, depth', () => {
    const ok = PRESETS.classic.tree;
    const bad = [
      [null, 'null'],
      [[], 'array'],
      [{ ...ok, extra: 1 }, 'extra key'],
      [s('root', 'row', [g('a', ['files', 'editor']), g('b', ['console', 'repl', 'plots', 'display'])], [0.5, 0.5]), 'editor tabbed'],
      [s('root', 'row', [g('a', ['files']), g('e', ['editor']), g('b', ['console', 'repl', 'plots', 'console', 'display'])], [0.2, 0.4, 0.4]), 'duplicate'],
      [s('root', 'row', [g('a', ['files']), g('e', ['editor']), g('b', ['console', 'repl', 'plots'])], [0.2, 0.4, 0.4]), 'missing display'],
      [s('root', 'row', [g('a', ['files']), g('e', ['editor']), g('b', ['console', 'repl', 'plots', 'display', 'turtle'])], [0.2, 0.4, 0.4]), 'unknown panel'],
      [s('root', 'row', [g('a', ['files']), g('e', ['editor']), g('b', ['console', 'repl', 'plots', 'display'], 'files')], [0.2, 0.4, 0.4]), 'active elsewhere'],
      [s('root', 'row', [g('a', []), g('f', ['files']), g('e', ['editor']), g('b', ['console', 'repl', 'plots', 'display'])], [0.1, 0.2, 0.3, 0.4]), 'empty group'],
      [s('root', 'row', [g('a', ['files']), g('e', ['editor']), g('b', ['console', 'repl', 'plots', 'display'])], [0.2, 0.4, 0.3]), 'sum'],
      [s('root', 'row', [g('a', ['files']), g('e', ['editor']), g('b', ['console', 'repl', 'plots', 'display'])], [0.01, 0.59, 0.4]), 'too small'],
      [s('root', 'row', [g('a', ['files']), g('e', ['editor']), g('b', ['console', 'repl', 'plots', 'display'])], [0.5, 0.5]), 'lengths'],
      [s('root', 'row', [g('a', ['files']), g('e', ['editor']), g('b', ['console', 'repl', 'plots', 'display'])], [0.2, '0.4', 0.4]), 'string size'],
      [s('root', 'row', [g('a', ['files']), g('a', ['editor']), g('b', ['console', 'repl', 'plots', 'display'])], [0.2, 0.4, 0.4]), 'duplicate id'],
      [s('Root!', 'row', [g('a', ['files']), g('e', ['editor']), g('b', ['console', 'repl', 'plots', 'display'])], [0.2, 0.4, 0.4]), 'bad id'],
      [s('root', 'row', [g('a', ['files']), s('x', 'row', [g('e', ['editor']), g('b', ['console', 'repl', 'plots', 'display'])], [0.5, 0.5])], [0.2, 0.8]), 'same dir'],
      [s('root', 'row', [g('a', ['files', 'editor', 'console', 'repl', 'plots', 'display'])], [1]), 'one child'],
      [s('root', 'diagonal', [g('a', ['files']), g('e', ['editor']), g('b', ['console', 'repl', 'plots', 'display'])], [0.2, 0.4, 0.4]), 'dir'],
    ];
    for (const [tree, why] of bad) assert.notEqual(checkTree(tree), null, why);
    // Depth 5: alternating splits five deep.
    let deep = g('d', ['display']);
    const order = ['plots', 'repl', 'console', 'files'];
    for (let i = 0; i < 4; i += 1) deep = s(`s${i}`, i % 2 ? 'row' : 'column', [g(`x${i}`, [order[i]]), deep], [0.5, 0.5]);
    deep = s('s9', 'column', [g('e', ['editor']), deep], [0.5, 0.5]);
    assert.equal(splitDepth(deep), 5);
    assert.match(checkTree(deep), /deep/);
    // Seven groups would need seven panels: a group count over 6 cannot pass the panel rule either.
  });

  await check('layout: fixSizes and resizeBoundary keep sums, minimums and clamps', () => {
    for (const raw of [[1, 1, 1], [0.001, 0.999], [0, 0, 1], [NaN, 2, 2], [0.2, 0.4, 0.4], [5, 0.01, 0.01, 0.01, 0.01, 0.01]]) {
      const f = fixSizes(raw);
      assert.ok(near(sum(f), 1), JSON.stringify(f));
      assert.ok(f.every((v) => v >= MIN_FRACTION - 1e-9), JSON.stringify(f));
    }
    assert.deepEqual(fixSizes([0.2, 0.4, 0.4]).map((v) => +v.toFixed(6)), [0.2, 0.4, 0.4]);
    const mins = [0.15, 0.25, 0.2];
    let r = resizeBoundary([0.2, 0.4, 0.4], 0, 0.1, mins);
    assert.deepEqual(r.map((v) => +v.toFixed(6)), [0.3, 0.3, 0.4]);
    r = resizeBoundary([0.2, 0.4, 0.4], 0, 0.5, mins);
    assert.ok(near(r[1], 0.25) && near(r[0], 0.35) && near(r[2], 0.4), JSON.stringify(r));
    r = resizeBoundary([0.2, 0.4, 0.4], 1, -1, mins);
    assert.ok(near(r[1], 0.25) && near(r[2], 0.55) && near(r[0], 0.2), JSON.stringify(r));
    r = resizeBoundary([0.2, 0.4, 0.4], 0, -1, mins);
    assert.ok(near(r[0], 0.15) && near(r[1], 0.45), JSON.stringify(r));
    // Mins that cannot both fit share the pair in proportion.
    r = resizeBoundary([0.3, 0.3, 0.4], 0, 0.1, [0.4, 0.4, 0]);
    assert.ok(near(r[0], 0.3) && near(r[1], 0.3), JSON.stringify(r));
    // setSizes clamps tiny values and ignores wrong lengths / unknown splits.
    const t = setSizes(PRESETS.classic.tree, 'root', [0, 0.5, 0.5]);
    assert.equal(checkTree(t), null);
    assert.ok(near(t.sizes[0], MIN_FRACTION));
    assert.deepEqual(setSizes(PRESETS.classic.tree, 'root', [0.5, 0.5]), PRESETS.classic.tree);
    assert.deepEqual(setSizes(PRESETS.classic.tree, 'nope', [0.2, 0.4, 0.4]), PRESETS.classic.tree);
  });

  await check('layout: hidden Files and setSizesById keep the hidden child where it was', () => {
    const t = PRESETS.classic.tree;
    const v = withoutPanels(t, ['files']);
    assert.equal(v.kind, 'split');
    assert.deepEqual(v.children.map((c) => c.id), ['editor', 'output']);
    assert.ok(near(v.sizes[0], 0.44 / 0.82) && near(v.sizes[1], 0.38 / 0.82));
    const back = setSizesById(t, 'root', { editor: 0.6, output: 0.4 });
    assert.equal(checkTree(back), null);
    assert.ok(near(back.sizes[0], 0.18) && near(back.sizes[1], 0.82 * 0.6) && near(back.sizes[2], 0.82 * 0.4), JSON.stringify(back.sizes));
    // Files tabbed with Plots (Display focus): hiding it removes the tab, not the group.
    const df = withoutPanels(PRESETS.displayFocus.tree, ['files']);
    assert.deepEqual([...findPanel(df, 'plots').panels], ['plots']);
  });

  await check('layout: tree operations (remove/collapse, insert, split each edge, page edges) keep the invariants', () => {
    const t = PRESETS.consoleBelow.tree;
    // Removing a one-panel group's panel collapses the group and keeps sizes summing to 1.
    const r = removePanel(t, 'plots');
    assert.equal(allGroups(r).some((x) => x.id === 'plots'), false);
    assert.ok(near(sum(r.children[0].sizes), 1));
    // Removing the last other child of a split collapses the split into its child (flattening).
    const two = s('root', 'column', [s('top', 'row', [g('e', ['editor']), g('o', ['console'])], [0.5, 0.5]), g('b', ['files'])], [0.7, 0.3]);
    const c = removePanel(two, 'files');
    assert.equal(c.id, 'top');
    assert.equal(normalize(s('x', 'row', [s('y', 'row', [g('a', ['editor']), g('b', ['files'])], [0.5, 0.5]), g('c', ['console'])], [0.5, 0.5])).children.length, 3);
    // Insert as tab; Editor never tabbed.
    const base = removePanel(t, 'display');
    const ins = insertTab(base, 'terminal', 'display', 1);
    assert.deepEqual([...findPanel(ins, 'display').panels], ['console', 'display', 'repl']);
    assert.equal(findPanel(ins, 'display').active, 'display');
    assert.equal(insertTab(base, 'editor', 'display', 0), null);
    // Split each edge of the editor group.
    for (const edge of ['left', 'right', 'top', 'bottom']) {
      const x = splitGroup(base, 'editor', edge, 'display');
      assert.equal(checkTree(x), null, `${edge}: ${checkTree(x)}`);
      const grp = findPanel(x, 'display');
      assert.deepEqual([...grp.panels], ['display']);
    }
    // Right of the editor in a row split: a sibling taking half the editor's size.
    const right = splitGroup(base, 'editor', 'right', 'display');
    const top = right.children[0];
    const ids = top.children.map((n) => n.id);
    assert.equal(ids[ids.indexOf('editor') + 1], findPanel(right, 'display').id);
    // Page edges: full width at the bottom, full height at the right.
    const pb = splitPage(removePanel(PRESETS.classic.tree, 'display'), 'bottom', 'display');
    assert.equal(checkTree(pb), null);
    assert.equal(pb.dir, 'column');
    assert.equal(pb.children[1].kind, 'group');
    assert.ok(near(pb.sizes[1], 0.32));
    const pr = splitPage(removePanel(PRESETS.classic.tree, 'display'), 'right', 'display');
    assert.equal(pr.dir, 'row');
    assert.equal(pr.children.at(-1).panels[0], 'display');
    assert.ok(near(pr.sizes.at(-1), 0.3));
  });

  await check('layout: movePanel from every panel to every target of every preset keeps the invariants', () => {
    let moves = 0;
    for (const id of PRESET_IDS) {
      const t = PRESETS[id].tree;
      for (const p of PANEL_IDS) {
        const targets = moveTargets(t, p);
        for (const target of targets) {
          const out = movePanel(t, p, target);
          assert.ok(out, `${id} ${p} ${JSON.stringify(target)}`);
          assert.equal(checkTree(out), null, `${id} ${p} ${JSON.stringify(target)}: ${checkTree(out)}`);
          assert.deepEqual([...findPanel(out, 'editor').panels], ['editor']);
          if (target.kind === 'tab') assert.equal(findPanel(out, p).id, target.groupId);
          moves += 1;
        }
        // All four edges of every group, and both page edges, are valid or refused, never broken.
        for (const grp of allGroups(t)) {
          for (const edge of ['left', 'right', 'top', 'bottom']) {
            const out = movePanel(t, p, { kind: 'edge', groupId: grp.id, edge });
            if (out) assert.equal(checkTree(out), null);
          }
          const tab = movePanel(t, p, { kind: 'tab', groupId: grp.id, index: 0 });
          if (p === 'editor' || grp.panels.includes('editor')) {
            if (!(grp.panels.length === 1 && grp.panels[0] === p)) assert.equal(tab, null, `${id}: ${p} tabbed into ${grp.id}`);
          } else if (tab) assert.equal(checkTree(tab), null);
        }
      }
      // A drop onto the panel's own one-panel group is a no-op.
      assert.equal(movePanel(t, 'editor', { kind: 'edge', groupId: 'editor', edge: 'left' }), t);
    }
    assert.ok(moves > 150, `only ${moves} moves`);
    // Tab reorder within a group.
    const re = movePanel(PRESETS.classic.tree, 'display', { kind: 'tab', groupId: 'output', index: 0 });
    assert.deepEqual([...findPanel(re, 'display').panels], ['display', 'console', 'repl', 'plots']);
    const re2 = movePanel(PRESETS.classic.tree, 'console', { kind: 'tab', groupId: 'output', index: 4 });
    assert.deepEqual([...findPanel(re2, 'console').panels], ['repl', 'plots', 'display', 'console']);
  });

  await check('layout: moveIfChanged (L2b drops and Move to…) refuses no-ops and keeps every real move', () => {
    const c = PRESETS.classic.tree;
    // Own place: own one-panel group, same tab index in own group, the output group's centre for its last tab.
    assert.equal(moveIfChanged(c, 'editor', { kind: 'edge', groupId: 'editor', edge: 'left' }), null);
    assert.equal(moveIfChanged(c, 'console', { kind: 'tab', groupId: 'output', index: 0 }), null);
    assert.equal(moveIfChanged(c, 'console', { kind: 'tab', groupId: 'output', index: 1 }), null);
    assert.equal(moveIfChanged(c, 'display', { kind: 'tab', groupId: 'output', index: 4 }), null);
    // Forbidden: Editor into a tab strip, anything into the Editor's group.
    assert.equal(moveIfChanged(c, 'editor', { kind: 'tab', groupId: 'output', index: 0 }), null);
    assert.equal(moveIfChanged(c, 'console', { kind: 'tab', groupId: 'editor', index: 0 }), null);
    // A real reorder and a real move are kept.
    assert.ok(moveIfChanged(c, 'console', { kind: 'tab', groupId: 'output', index: 4 }));
    const below = moveIfChanged(c, 'console', { kind: 'edge', groupId: 'editor', edge: 'bottom' });
    assert.ok(below);
    assert.equal(checkTree(below), null);
    const split = allGroups(below).find((g) => g.panels.includes('console'));
    assert.deepEqual([...split.panels], ['console']);
    // sameArrangement ignores the stored active tabs only.
    assert.ok(sameArrangement(c, JSON.parse(JSON.stringify(c))));
    const other = JSON.parse(JSON.stringify(c).replace('"active":"console"', '"active":"plots"'));
    assert.ok(sameArrangement(c, other));
    assert.ok(!sameArrangement(c, below));
    // Every target moveTargets offers on every preset changes the tree (so a menu item is never a no-op).
    for (const id of PRESET_IDS) {
      const t = PRESETS[id].tree;
      for (const p of PANEL_IDS) for (const tg of moveTargets(t, p)) assert.ok(moveIfChanged(t, p, tg), `${id} ${p} ${JSON.stringify(tg)}`);
    }
  });

  await check('layout: fitToWidth merges at 900–1100 px, never below the minimums, and unmergeSizes maps back', () => {
    for (const id of PRESET_IDS) {
      for (const w of [900, 1000, 1100, 1280]) {
        const { tree, merges } = fitToWidth(PRESETS[id].tree, dockWidth(w));
        assert.equal(checkTree(tree), null, `${id}@${w}`);
        assert.ok(minSize(tree).w <= dockWidth(w), `${id}@${w}: ${minSize(tree).w}`);
        if (w >= 1100) assert.equal(merges.length, 0, `${id}@${w}`);
      }
    }
    const { tree, merges } = fitToWidth(PRESETS.consoleBelow.tree, dockWidth(1000));
    assert.equal(merges.length, 1);
    assert.deepEqual([...findPanel(tree, 'display').panels], ['plots', 'display']);
    const top = tree.children[0];
    const byId = Object.fromEntries(top.children.map((c, i) => [c.id, top.sizes[i]]));
    const un = unmergeSizes(byId, merges);
    assert.ok(near(un.plots, 0.22) && near(un.display, 0.22), JSON.stringify(un));
    const back = setSizesById(PRESETS.consoleBelow.tree, 'top', un);
    assert.deepEqual(back.children[0].sizes.map((v) => +v.toFixed(6)), [0.16, 0.4, 0.22, 0.22]);
  });

  await check('layout: stored layout validation, fallback to Classic and save → load round trip', () => {
    assert.deepEqual(parseStoredLayout(null), DEFAULT_LAYOUT);
    const good = {
      v: 1,
      mode: 'consoleBelow',
      custom: null,
      presetSizes: { consoleBelow: { root: [0.6, 0.4], top: [0.15, 0.45, 0.2, 0.2] } },
      filesHidden: true,
    };
    const parsed = parseStoredLayout(JSON.stringify(good));
    assert.deepEqual(parsed, good);
    const tree = treeForLayout(parsed);
    assert.ok(near(tree.sizes[0], 0.6));
    const custom = movePanel(PRESETS.classic.tree, 'console', { kind: 'edge', groupId: 'editor', edge: 'bottom' });
    assert.ok(parseStoredLayout(JSON.stringify({ ...good, mode: 'custom', custom })));
    const bads = [
      'not json',
      '[]',
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, extra: true }),
      JSON.stringify({ ...good, mode: 'fancy' }),
      JSON.stringify({ ...good, mode: 'custom' }),
      JSON.stringify({ ...good, filesHidden: 'yes' }),
      JSON.stringify({ ...good, presetSizes: { consoleBelow: { root: [0.6, 0.3] } } }),
      JSON.stringify({ ...good, presetSizes: { consoleBelow: { root: [0.6, 0.4, 0] } } }),
      JSON.stringify({ ...good, presetSizes: { consoleBelow: { nope: [0.6, 0.4] } } }),
      JSON.stringify({ ...good, presetSizes: { turbo: { root: [0.6, 0.4] } } }),
      JSON.stringify({ ...good, presetSizes: { consoleBelow: { root: [0.01, 0.99] } } }),
      JSON.stringify({ ...good, custom: s('root', 'row', [g('a', ['files', 'editor']), g('b', ['console', 'repl', 'plots', 'display'])], [0.5, 0.5]) }),
      JSON.stringify({ ...good, padding: 'x'.repeat(9000) }),
      'x'.repeat(9 * 1024),
    ];
    for (const b of bads) assert.equal(parseStoredLayout(b), null, b.slice(0, 80));
    // loadLayout removes a bad key and falls back; saveLayout round trips; the default removes the key.
    const st = memoryStorage({ [LAYOUT_STORAGE_KEY]: '{"v":1' });
    assert.deepEqual(loadLayout(st), DEFAULT_LAYOUT);
    assert.equal(st.map.has(LAYOUT_STORAGE_KEY), false);
    saveLayout(st, parsed);
    assert.equal(st.getItem(LAYOUT_STORAGE_KEY), serializeLayout(parsed));
    assert.deepEqual(loadLayout(st), parsed);
    saveLayout(st, DEFAULT_LAYOUT);
    assert.equal(st.map.has(LAYOUT_STORAGE_KEY), false);
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('x'); } };
    assert.deepEqual(loadLayout(throwing), DEFAULT_LAYOUT);
    saveLayout(throwing, parsed);
    assert.deepEqual(presetTree('classic', { root: [0.5, 0.5] }), PRESETS.classic.tree);
  });
}
