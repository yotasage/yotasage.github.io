// Checks of the combination search and of the networks (lib/resistor: network, analyse, values, combine,
// combineClient). Called by check.mjs, so `npm run check` runs them with the rest.
//
// The search is compared with a brute-force enumeration written here: every network is built from its parts
// (a group is a multiset of resistors and of smaller groups of the other kind) and measured against every target.

const PARTITIONS = { 2: [[1, 1]], 3: [[1, 1, 1], [1, 2]], 4: [[1, 1, 1, 1], [1, 1, 2], [2, 2], [1, 3]] };

// Calls `visit(children)` for every group of kind `type` with `k` resistors, each once.
function enumerate(k, type, pool, visit) {
  const other = type === 's' ? 'p' : 's';
  for (const sizes of PARTITIONS[k]) {
    const groups = [];
    for (const size of sizes) {
      const last = groups[groups.length - 1];
      if (last && last.size === size) last.count++;
      else groups.push({ size, count: 1 });
    }
    const children = [];
    const pick = (g, left, from) => {
      if (g === groups.length) return visit(children);
      if (left === 0) return pick(g + 1, groups[g + 1]?.count ?? 0, 0);
      const list = groups[g].size === 1 ? pool[1] : pool[groups[g].size][other];
      for (let i = from; i < list.length; i++) {
        children.push(list[i]);
        pick(g, left - 1, i);
        children.pop();
      }
    };
    pick(0, groups[0].count, 0);
  }
}

function distinctValues(leaves) {
  for (let i = 1; i < leaves.length; i++) for (let j = 0; j < i; j++) if (leaves[i] === leaves[j]) return false;
  return true;
}

// For every scenario ({ target, connections, reuse }) and every number of parts: how many networks there are, and
// those among the `keep` closest (with every tie of the last one).
function bruteForce(values, maxParts, scenarios, keep) {
  const pool = { 1: values.map((v) => ({ v, t: 'r', ch: [], lv: [v] })) };
  const states = scenarios.map(() => Array.from({ length: maxParts + 1 }, () => ({ list: [], cut: Infinity, count: 0, next: 4 * keep })));
  const prune = (state) => {
    state.list.sort((a, b) => a.rel - b.rel);
    if (state.list.length > keep) {
      state.cut = state.list[keep - 1].rel * (1 + 1e-6) + 1e-9;
      state.list = state.list.filter((x) => x.rel <= state.cut);
    }
    state.next = Math.max(4 * keep, 2 * state.list.length);
  };
  const measure = (k, net, flat) => {
    let distinct;
    scenarios.forEach((scenario, s) => {
      if (scenario.connections === 'series' && !(net.t === 'r' || (net.t === 's' && flat))) return;
      if (scenario.connections === 'parallel' && !(net.t === 'r' || (net.t === 'p' && flat))) return;
      if (!scenario.reuse) {
        distinct ??= distinctValues(net.lv);
        if (!distinct) return;
      }
      const state = states[s][k];
      state.count++;
      const rel = Math.abs(net.v - scenario.target) / scenario.target;
      if (rel > state.cut) return;
      state.list.push({ rel, v: net.v, t: net.t, ch: net.ch.slice() });
      if (state.list.length > state.next) prune(state);
    });
  };
  for (const net of pool[1]) measure(1, net, true);
  for (let k = 2; k <= maxParts; k++) {
    pool[k] = { s: [], p: [] };
    for (const type of ['s', 'p']) {
      enumerate(k, type, pool, (children) => {
        let sum = 0;
        let flat = true;
        const lv = [];
        for (const child of children) {
          sum += type === 's' ? child.v : 1 / child.v;
          if (child.t !== 'r') flat = false;
          lv.push(...child.lv);
        }
        const net = { v: type === 's' ? sum : 1 / sum, t: type, ch: children, lv };
        measure(k, net, flat);
        if (k < maxParts) pool[k][type].push({ ...net, ch: children.slice() });
      });
    }
  }
  for (const perParts of states) for (const state of perParts) prune(state);
  return states;
}

export async function combineChecks(lib, { section, ok, eq }) {
  const {
    resistorNet, seriesNet, parallelNet, networkValue, networkLeaves, networkStats, canonicalNetwork, networkKey,
    networkFormula, networkLayout, networkShares, networkTolerance, networkLoad,
    seriesList, seriesValues, cleanValues, parseValueList,
    searchCombinations, searchSteps, runSearch, networkCount, clearSearchCache, MAX_SEARCH_VALUES,
    startSearch, cancelSearch, searchPlace,
  } = lib;
  const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
  const R = resistorNet;
  const toNet = (x) => (x.t === 'r' ? R(x.v) : (x.t === 's' ? seriesNet : parallelNet)(x.ch.map(toNet)));

  // -------------------------------------------------------------------------------------------------------------
  section('networks');
  {
    const net = seriesNet([R(1000), parallelNet([R(2200), R(3300)])]);
    eq(networkValue(net), 1000 + (2200 * 3300) / 5500, 'value of 1k + (2k2 ∥ 3k3)');
    eq(networkFormula(net), '1 kΩ + (2.2 kΩ ∥ 3.3 kΩ)', 'formula with values');
    eq(networkFormula(net, { names: true }), 'R1 + (R2 ∥ R3)', 'formula with names');
    eq(networkFormula(parallelNet([R(10), seriesNet([R(20), R(30)])]), { names: true }), 'R1 ∥ (R2 + R3)', 'parallel formula');
    eq(networkFormula(R(4700)), '4.7 kΩ', 'formula of one resistor');
    eq(networkFormula(net, { write: (ohms) => `${ohms}R` }), '1000R + (2200R ∥ 3300R)', 'formula with its own writer');
    eq(networkKey(net), 's(1000,p(2200,3300))', 'key');
    eq(networkKey(seriesNet([parallelNet([R(3300), R(2200)]), R(1000)])), networkKey(net), 'the key does not depend on the order');
    eq(networkKey(seriesNet([seriesNet([R(1), R(2)]), R(3)])), 's(1,2,3)', 'a series group in a series group is one group');
    eq(networkKey(parallelNet([R(5)])), '5', 'a group of one part is that part');
    eq(networkKey(seriesNet([R(0.1 + 0.2), R(1)])), networkKey(seriesNet([R(1), R(0.3)])), 'the key hides floating-point noise');
    ok(networkKey(seriesNet([R(1), R(2)])) !== networkKey(parallelNet([R(1), R(2)])), 'series and parallel have different keys');
    eq(JSON.stringify(networkLeaves(net)), '[1000,2200,3300]', 'leaves in the order of the formula');
    let stats = networkStats(net);
    ok(stats.parts === 3 && stats.distinct === 3 && stats.depth === 2, 'stats of a mixed network');
    stats = networkStats(parallelNet([R(1000), R(1000), R(1000)]));
    ok(stats.parts === 3 && stats.distinct === 1 && stats.depth === 1, 'stats of three equal resistors');
    stats = networkStats(R(5));
    ok(stats.parts === 1 && stats.distinct === 1 && stats.depth === 0, 'stats of one resistor');
    const canonical = canonicalNetwork(seriesNet([parallelNet([R(3300), R(2200)]), R(4700), R(1000)]));
    eq(networkFormula(canonical, { write: String }), '1000 + 4700 + (2200 ∥ 3300)', 'canonical order: resistors by value, then groups');
    eq(networkValue(parallelNet([R(1000), R(1000)])), 500, 'two equal resistors in parallel');

    // Layout: sizes, and every resistor and wire inside the drawing.
    let layout = networkLayout(R(100));
    ok(layout.width === 1 && layout.height === 1 && layout.resistors.length === 1 && layout.wires.length === 0, 'layout of one resistor');
    ok(layout.resistors[0].x === 0 && layout.resistors[0].y === 0.5, 'one resistor lies on the middle line');
    layout = networkLayout(seriesNet([R(1), R(2), R(3)]));
    ok(layout.width === 3 && layout.height === 1 && layout.resistors.map((r) => r.x).join() === '0,1,2', 'layout of a series group');
    layout = networkLayout(parallelNet([R(1), R(2)]));
    ok(layout.width === 2 && layout.height === 2 && layout.resistors.map((r) => r.y).join() === '0.5,1.5', 'layout of a parallel group');
    ok(layout.wires.some((w) => w[0] === w[2] && w[1] === 0.5 && w[3] === 1.5), 'a parallel group has vertical rails');
    for (const shape of [net, parallelNet([R(1), seriesNet([R(2), parallelNet([R(3), R(4)])])]), seriesNet([parallelNet([R(1), R(2)]), parallelNet([R(3), R(4), R(5)])])]) {
      layout = networkLayout(shape);
      const inside = layout.resistors.every((r) => r.x >= 0 && r.x + 1 <= layout.width && r.y > 0 && r.y < layout.height)
        && layout.wires.every((w) => Math.min(w[0], w[2]) >= 0 && Math.max(w[0], w[2]) <= layout.width && Math.min(w[1], w[3]) >= 0 && Math.max(w[1], w[3]) <= layout.height);
      const straight = layout.wires.every((w) => w[0] === w[2] || w[1] === w[3]);
      const ends = layout.wires.some((w) => w[0] === 0 && w[1] === layout.height / 2) || layout.resistors.some((r) => r.x === 0 && r.y === layout.height / 2);
      const spots = new Set(layout.resistors.map((r) => `${r.x},${r.y}`));
      ok(inside && straight && ends && spots.size === networkLeaves(shape).length && layout.resistors.every((r, i) => r.index === i && r.ohms === networkLeaves(shape)[i]),
        `layout of ${networkFormula(shape, { write: String })}`);
    }
  }

  // -------------------------------------------------------------------------------------------------------------
  section('tolerance and power');
  {
    let tol = networkTolerance(parallelNet([R(1000), R(1000), R(1000)]), 1);
    ok(near(tol.worstPct, 1) && near(tol.plusPct, 1) && near(tol.minusPct, -1), '1k ∥ 1k ∥ 1k at 1 %: worst case 1 %');
    ok(near(tol.rssPct, 1 / Math.sqrt(3)) && Math.abs(tol.rssPct - 0.58) < 0.005, '1k ∥ 1k ∥ 1k at 1 %: RSS about 0.58 %');
    ok(near(tol.low, 330) && near(tol.high, 1010 / 3) && near(tol.nominal, 1000 / 3), 'its limits in ohms');
    tol = networkTolerance(seriesNet([R(1000), R(1000)]), 1);
    ok(near(tol.worstPct, 1) && near(tol.rssPct, Math.SQRT1_2), '1k + 1k at 1 %: 1 % worst case, 0.71 % RSS');
    tol = networkTolerance(seriesNet([R(1000), R(1000)]), [1, 5]);
    ok(near(tol.worstPct, 3) && near(tol.rssPct, Math.hypot(0.5, 2.5)), 'a tolerance per part: 1 % and 5 % in series');
    tol = networkTolerance(R(4700), 5);
    ok(near(tol.worstPct, 5) && near(tol.rssPct, 5), 'one resistor has its own tolerance');
    // The sensitivities are the derivatives, checked by a small change of each resistor.
    const values = [1000, 2200, 3300, 470];
    const shape = (v) => seriesNet([R(v[0]), parallelNet([R(v[1]), seriesNet([R(v[2]), R(v[3])])])]);
    tol = networkTolerance(shape(values), 1);
    const nominal = networkValue(shape(values));
    values.forEach((value, i) => {
      const moved = values.slice();
      moved[i] = value * 1.000001;
      const slope = (networkValue(shape(moved)) / nominal - 1) / 0.000001;
      ok(Math.abs(slope - tol.sensitivities[i]) < 1e-5, `sensitivity of R${i + 1} is its share of the power`);
    });
    ok(near(tol.sensitivities.reduce((a, b) => a + b, 0), 1), 'the sensitivities add up to 1');

    let shares = networkShares(seriesNet([R(1000), R(3000)]));
    ok(near(shares[0].voltage, 0.25) && near(shares[1].voltage, 0.75) && shares[0].current === 1 && near(shares[1].power, 0.75), 'shares in a divider');
    shares = networkShares(parallelNet([R(1000), R(3000)]));
    ok(near(shares[0].current, 0.75) && near(shares[1].current, 0.25) && shares[0].voltage === 1 && near(shares[0].power, 0.75), 'shares in a parallel pair');
    let load = networkLoad(seriesNet([R(1000), parallelNet([R(2000), R(2000)])]), { volts: 10 });
    ok(near(load.ohms, 2000) && near(load.amps, 0.005) && near(load.watts, 0.05), 'load: 10 V across 1k + (2k ∥ 2k)');
    ok(near(load.parts[0].volts, 5) && near(load.parts[0].watts, 0.025) && near(load.parts[1].amps, 0.0025) && near(load.parts[2].watts, 0.0125) && near(load.parts[1].share, 0.25), 'load of each part');
    load = networkLoad(seriesNet([R(1000), parallelNet([R(2000), R(2000)])]), { amps: 0.005 });
    ok(near(load.volts, 10) && near(load.watts, 0.05) && near(load.parts[2].volts, 5), 'load for a current');
  }

  // -------------------------------------------------------------------------------------------------------------
  section('value lists');
  {
    eq(seriesList('E24').length, 169, 'E24 over 1 Ω to 10 MΩ');
    eq(seriesList('E192').length, 1345, 'E192 over 1 Ω to 10 MΩ');
    ok(seriesList('E96')[0] === 1 && seriesList('E96').at(-1) === 1e7, 'the default range is 1 Ω to 10 MΩ');
    eq(seriesList('E12', 10, 1e6).length, 61, 'E12 over 10 Ω to 1 MΩ');
    let parsed = parseValueList('4k7, 10k 22R 1M\n4.7 kΩ; 10k, foo, 0, 1e3');
    eq(JSON.stringify(parsed.values), '[22,1000,4700,10000,1000000]', 'a pasted list, sorted and each value once');
    eq(JSON.stringify(parsed.rejected), '["foo","0"]', 'its unreadable entries');
    eq(parsed.duplicates, 2, 'its repeated entries');
    parsed = parseValueList('4k7, 10k 22R 1M');
    ok(JSON.stringify(parsed.values) === '[22,4700,10000,1000000]' && !parsed.rejected.length && !parsed.duplicates, 'the list of the brief');
    parsed = parseValueList('  \n ');
    ok(!parsed.values.length && !parsed.rejected.length, 'an empty text');
    parsed = parseValueList('472 0R1 10m 2.2 M 1k5\t3M3 01C yellow -5');
    eq(JSON.stringify(parsed.values), '[0.01,0.1,472,1500,2200000,3300000]', 'digits are values, not markings; units may stand apart');
    eq(JSON.stringify(parsed.rejected), '["01C","yellow","-5"]', 'markings, colours and negative numbers are reported');
    eq(JSON.stringify(cleanValues([3, 1, 0.1 + 0.2, 0.3, -1, 0, NaN, Infinity, 1])), '[0.3,1,3]', 'cleanValues sorts, drops and merges');

    // The decimal comma in a pasted list, and what the entries say.
    const { listToLink, listFromLink, listsFromStorage, listsToStorage, LIST_PRESETS, presetText, withoutEntry, listReach, parseQuantity, formatQuantity, formatCount, sameValues } = lib;
    const readAs = (text) => JSON.stringify(parseValueList(text).values);
    eq(readAs('4,7k 10k 22k'), '[4700,10000,22000]', 'a decimal comma in a list separated by spaces');
    eq(readAs('10k,22k,47k'), '[10000,22000,47000]', 'commas after letters separate');
    eq(readAs('10,22,47'), '[10,22,47]', 'three numbers with commas are three values');
    eq(readAs('4,7k, 10k, 22k'), '[4700,10000,22000]', 'a comma with a space separates, one without is a decimal comma');
    eq(readAs('4,7k'), '[4700]', '4,7k alone is 4.7 kΩ');
    eq(readAs('4,7 kΩ; 1,5 MΩ'), '[4700,1500000]', 'a decimal comma with a unit apart');
    eq(readAs('10,22'), '[10,22]', '10,22 alone is two values, as 10.22 Ω is no standard value');
    eq(readAs('100,1k,10k'), '[100,1000,10000]', 'a list of decades separated by commas');
    eq(readAs('4,7k,10k,22k'), '[4700,10000,22000]', '4,7k before commas that separate: 4 Ω is no standard value');
    eq(readAs('1,5\n2,2\n3,3'), '[1.5,2.2,3.3]', 'decimal commas in a list of lines');
    eq(readAs('2,2'), '[2.2]', '2,2 alone is 2.2 Ω');
    const entries = parseValueList('4,7k 10k foo 10k').entries;
    eq(entries.map((e) => `${e.text}=${e.ohms}${e.duplicate ? '!' : ''}`).join(' '), '4,7k=4700 10k=10000 foo=null 10k=10000!', 'the entries of a list as they were written and read');
    eq(withoutEntry('4,7k 10k foo 10k', entries[2].start, entries[2].end), '4,7k 10k 10k', 'an entry is taken out of the text');
    eq(withoutEntry('10k,22k,47k', 4, 7), '10k 47k', 'an entry between commas is taken out');
    // A list in a link and in the browser.
    const kit = cleanValues(seriesList('E96', 0.1, 1e7).concat([0.001, 0.0047, 12345.678, 1e9]));
    ok(sameValues(listFromLink(listToLink(kit.slice(0, 300))), kit.slice(0, 300)) && sameValues(listFromLink(listToLink(kit.slice(-300))), kit.slice(-300)), 'a list comes back from its form in a link');
    eq(listToLink([0.47, 10, 4700, 1e6, 1.5e6]), 'R47_10R_4k7_1M_1M5', 'the form of a list in a link');
    eq(JSON.stringify(listsFromStorage(listsToStorage([{ id: 'a', name: 'Kit', text: '10k 22k' }]))), '[{"id":"a","name":"Kit","text":"10k 22k"}]', 'lists come back from storage');
    ok(listsFromStorage('{broken').length === 0 && listsFromStorage(null).length === 0 && listsFromStorage('{"lists":[{"id":1}]}').length === 0, 'storage that cannot be read gives no lists');
    eq(LIST_PRESETS.map((p) => parseValueList(presetText(p)).values.length).join(' '), '31 61 121 481', 'the presets are the series from 10 Ω to 1 MΩ');
    ok(sameValues(parseValueList(presetText(LIST_PRESETS[2])).values, seriesList('E24', 10, 1e6)) && presetText(LIST_PRESETS[1]).split('\n').length === 6, 'a preset reads back as its series, a decade on a line');
    eq(JSON.stringify(listReach([10, 100, 1000], 2, 'mixed', true)), '{"low":5,"high":2000}', 'what two parts of a list can reach');
    eq(JSON.stringify(listReach([10, 100, 1000], 3, 'series', false)), '{"low":10,"high":1110}', 'the reach in series with each value once');
    eq([parseQuantity('12'), parseQuantity('3,3 V'), parseQuantity('20m'), parseQuantity('20 mA'), parseQuantity('1.5k'), parseQuantity('x'), parseQuantity('0')].join(' '), '12 3.3 0.02 0.02 1500  ', 'a voltage or a current as typed');
    eq([formatQuantity(0.2043, 'W'), formatQuantity(0.0191, 'A'), formatQuantity(12, 'V'), formatQuantity(0.9999, 'W'), formatCount(169), formatCount(1.8e9)].join(', '), '204 mW, 19.1 mA, 12 V, 1 W, 169, 1.8 billion', 'quantities and counts as text');
  }

  // -------------------------------------------------------------------------------------------------------------
  section('search against brute force');
  const keep = 30;
  const targets = [628.75, 1, 12345, 4700, 0.05, 5e7, 1000, 3333.333];
  const variants = [
    { connections: 'mixed', reuse: true },
    { connections: 'series', reuse: true },
    { connections: 'parallel', reuse: true },
    { connections: 'mixed', reuse: false },
  ];
  const scenarios = targets.flatMap((target) => variants.map((variant) => ({ target, ...variant })));
  const slack = (rel) => 2e-9 + 1e-9 * rel;
  const relOf = (c, target) => Math.abs(c.ohms - target) / target;

  for (const [id, maxParts] of [['E12', 3], ['E6', 4]]) {
    const values = seriesValues(id, 10, 1e6);
    const brute = bruteForce(values, maxParts, scenarios, keep);
    scenarios.forEach((scenario, s) => {
      const name = `${id}, ${scenario.target} Ω, ${scenario.connections}${scenario.reuse ? '' : ', no reuse'}`;
      const result = searchCombinations(scenario.target, values, { maxParts, connections: scenario.connections, reuse: scenario.reuse, keep });
      const allKeys = new Set();
      for (let k = 1; k <= maxParts; k++) {
        const state = brute[s][k];
        const got = result.byParts[k];
        const problems = [];
        if (result.consideredByParts[k] !== state.count) problems.push(`considered ${result.consideredByParts[k]}, there are ${state.count}`);
        if (got.length !== Math.min(keep, state.count)) problems.push(`${got.length} results, wanted ${Math.min(keep, state.count)}`);
        const wanted = new Map(state.list.map((x) => [networkKey(toNet(x)), x]));
        if (wanted.size !== state.list.length) problems.push('the brute force has a network twice');
        const keys = new Set();
        got.forEach((c, i) => {
          const rel = relOf(c, scenario.target);
          if (keys.has(c.key)) problems.push(`${c.key} twice`);
          keys.add(c.key);
          allKeys.add(c.key);
          const same = wanted.get(c.key);
          if (!same) problems.push(`${c.key} is not among the closest`);
          else if (!near(same.v, c.ohms)) problems.push(`${c.key} has the value ${c.ohms}, wanted ${same.v}`);
          if (state.list[i] && Math.abs(state.list[i].rel - rel) > slack(rel)) problems.push(`result ${i} has the error ${rel}, wanted ${state.list[i].rel}`);
          if (c.key !== networkKey(c.network) || !near(networkValue(c.network), c.ohms) || c.parts !== k) problems.push(`${c.key}: network, key and value disagree`);
          if (c.exact !== (rel <= 1e-9) || (c.exact && c.errorOhms !== 0) || !near(c.errorPct, c.exact ? 0 : ((c.ohms - scenario.target) / scenario.target) * 100)) problems.push(`${c.key}: wrong error`);
          const stats = networkStats(c.network);
          if (stats.parts !== c.parts || stats.distinct !== c.distinct || stats.depth !== c.depth) problems.push(`${c.key}: wrong stats`);
          if (!scenario.reuse && c.distinct !== c.parts) problems.push(`${c.key} uses a value twice`);
          if (scenario.connections !== 'mixed' && k > 1 && (c.depth !== 1 || c.network.kind !== scenario.connections)) problems.push(`${c.key} is not ${scenario.connections} only`);
          if (i > 0) {
            const before = got[i - 1];
            const q = Math.round((before.exact ? 0 : relOf(before, scenario.target)) * 1e12);
            const q2 = Math.round((c.exact ? 0 : rel) * 1e12);
            if (q2 < q - 1) problems.push(`result ${i} is closer than the one before`);
            if (q2 === q && (c.depth < before.depth || (c.depth === before.depth && c.distinct < before.distinct))) problems.push(`result ${i} is simpler than the one before at the same error`);
          }
        });
        // Nothing closer than the last result was missed.
        const last = got.length === keep ? relOf(got[got.length - 1], scenario.target) : Infinity;
        for (const [key, x] of wanted) {
          if (x.rel < last - slack(x.rel) && !keys.has(key)) problems.push(`${key} (error ${x.rel}) is missing`);
        }
        if (state.count && Math.abs(state.list[0].rel - relOf(result.best[k], scenario.target)) > slack(state.list[0].rel)) problems.push('the best error differs');
        ok(problems.length === 0, `${name}, ${k} part${k > 1 ? 's' : ''}: ${problems.slice(0, 3).join('; ')}`);
      }
      // The ranked list over all numbers of parts.
      const problems = [];
      const merged = result.results;
      const totalKept = result.byParts.reduce((sum, list) => sum + list.length, 0);
      if (merged.length !== Math.min(keep, totalKept)) problems.push(`${merged.length} results`);
      if (new Set(merged.map((c) => c.key)).size !== merged.length) problems.push('a result twice');
      if (!merged.every((c) => allKeys.has(c.key))) problems.push('a result that is in no list by parts');
      const bestRel = Math.min(...result.best.filter(Boolean).map((c) => relOf(c, scenario.target)));
      if (merged.length && relOf(merged[0], scenario.target) > bestRel + slack(bestRel)) problems.push('the first result is not the best');
      for (let i = 1; i < merged.length; i++) {
        const q = Math.round((merged[i - 1].exact ? 0 : relOf(merged[i - 1], scenario.target)) * 1e12);
        const q2 = Math.round((merged[i].exact ? 0 : relOf(merged[i], scenario.target)) * 1e12);
        if (q2 < q - 1 || (q2 === q && merged[i].parts < merged[i - 1].parts)) problems.push(`result ${i} is out of order`);
      }
      if (result.considered !== result.consideredByParts.reduce((a, b) => a + b, 0)) problems.push('considered is not the sum');
      ok(problems.length === 0, `${name}, ranked list: ${problems.slice(0, 3).join('; ')}`);

      // A search for fewer parts gives the same lists.
      if (maxParts === 3 && scenario.connections === 'mixed') {
        for (const fewer of [1, 2]) {
          const small = searchCombinations(scenario.target, values, { maxParts: fewer, reuse: scenario.reuse, keep });
          const sameLists = [1, 2, 3].every((k) => (k > fewer ? small.byParts[k].length === 0 && small.best[k] === null
            : small.byParts[k].map((c) => c.key).join() === result.byParts[k].map((c) => c.key).join()));
          ok(sameLists, `${name}: a search for ${fewer} part${fewer > 1 ? 's' : ''} gives the same lists`);
        }
      }
    });
  }

  // -------------------------------------------------------------------------------------------------------------
  section('search options');
  {
    const e12 = seriesValues('E12', 10, 1e6);
    let result = searchCombinations(4700, e12, { maxParts: 3 });
    ok(result.results[0].exact && result.results[0].parts === 1 && result.results[0].key === '4700', 'an exact value of the list is first');
    ok(result.best[3].exact && result.byParts[3].filter((c) => c.exact).some((c) => c.key === 's(1000,1500,2200)'), '1k + 1k5 + 2k2 is an exact match for 4k7');
    ok(result.results.every((c, i) => i === 0 || !c.exact || result.results[i - 1].exact), 'exact matches come first');
    result = searchCombinations(4700, e12, { maxParts: 2, allowTarget: false });
    ok(!result.byParts[1].some((c) => c.key === '4700') && result.best[1].key === '3900', 'allowTarget: false leaves the target out as a single part');
    eq(result.consideredByParts[1], 60, 'and does not count it');
    result = searchCombinations(3000, e12, { maxParts: 2 });
    ok(['s(1500,1500)', 's(1200,1800)'].every((key) => result.byParts[2].some((c) => c.key === key && c.exact)), '3 kΩ from two E12 values, exactly');
    eq(result.best[2].key, 's(1500,1500)', 'at the same error, fewer different values first');
    result = searchCombinations(3000, e12, { maxParts: 2, reuse: false });
    ok(!result.byParts[2].some((c) => c.key === 's(1500,1500)') && result.best[2].key === 's(1200,1800)', 'without reuse 1k5 + 1k5 is not offered');
    result = searchCombinations(628.75, e12, { maxParts: 3, maxErrorPct: 0.05 });
    ok(result.results.length > 0 && result.results.every((c) => Math.abs(c.errorPct) <= 0.05) && result.byParts[1].length === 0, 'maxErrorPct limits what is reported');
    result = searchCombinations(628.75, e12, { maxParts: 2, keep: 5 });
    ok(result.results.length === 5 && result.byParts[2].length === 5, 'keep limits the lists');
    eq(result.options.connections, 'mixed', 'the default is mixed');
    eq(searchCombinations(628.75, e12).options.maxParts, 2, 'the default is two parts');
    result = searchCombinations(0.3, [0.1, 0.2], { maxParts: 2 });
    ok(result.best[2].exact && result.best[2].errorOhms === 0 && result.best[2].key === 's(0.1,0.2)', 'floating-point noise does not hide an exact match');
    result = searchCombinations(100, [300], { maxParts: 4 });
    ok(result.best[3].exact && result.best[3].key === 'p(300,300,300)' && result.results[0].parts === 3, 'three equal resistors in parallel');
    eq(result.considered, 1 + 2 + 4 + 10, 'one value: as many networks as there are shapes');
    result = searchCombinations(100, [300], { maxParts: 4, reuse: false });
    ok(result.results.length === 1 && result.considered === 1, 'one value without reuse: only the resistor itself');
    result = searchCombinations(1000, [470, 1000, 470.0000000001, 2200, 1000], { maxParts: 1 });
    eq(result.values, 3, 'values given twice count once');
    ok(searchCombinations(0, e12).note && searchCombinations(100, []).note && searchCombinations(NaN, e12).results.length === 0, 'no target or no values: a note, no results');
    const many = Array.from({ length: MAX_SEARCH_VALUES + 1 }, (_, i) => 100 + i);
    result = searchCombinations(1234.5, many, { maxParts: 4 });
    ok(result.note && result.options.maxParts === 2 && result.best[2] && result.byParts[3].length === 0, 'too many values: two parts only, with a note');
    const big = 1345n;
    const bigPairs = (big * (big + 1n)) / 2n;
    const bigCount = 2n * ((big * (big + 1n) * (big + 2n) * (big + 3n)) / 24n + bigPairs * bigPairs + (bigPairs * (bigPairs + 1n)) / 2n
      + (big * big * (big + 1n) * (big + 2n)) / 6n + big * big * bigPairs);
    eq(networkCount(1345, 4, 'mixed', true), Number(bigCount), 'the number of four-part networks of E192');
    clearSearchCache();
  }

  // -------------------------------------------------------------------------------------------------------------
  section('search in slices');
  {
    const e24 = seriesList('E24');
    const direct = searchCombinations(628.75, e24, { maxParts: 4, keep: 20 });
    // The steps report a progress that never goes back and ends at 1.
    const steps = searchSteps(628.75, e24, { maxParts: 4, keep: 20 });
    let last = 0;
    let rising = true;
    let count = 0;
    for (let step = steps.next(); !step.done; step = steps.next()) {
      if (step.value < last || step.value > 1) rising = false;
      last = step.value;
      count++;
    }
    ok(rising && last === 1 && count > 10, 'the steps give a progress that rises to 1');
    const fractions = [];
    const sliced = await runSearch(searchSteps(628.75, e24, { maxParts: 4, keep: 20 }), 0.5, (f) => fractions.push(f));
    ok(sliced.results.map((c) => c.key).join() === direct.results.map((c) => c.key).join(), 'a search in slices gives the same results');
    ok(fractions.length > 0 && fractions.every((f) => f >= 0 && f <= 1), 'and reports its progress');
    ok((await runSearch(searchSteps(628.75, e24, { maxParts: 4 }), 0, undefined, () => true)) === null, 'a cancelled search gives null');
    // The client: without workers (as here in Node) it runs the search itself.
    // A search that takes longer than one slice on the page (the tables of E96 alone do).
    const e96 = seriesList('E96');
    const first = startSearch(628.75, e96, { maxParts: 4, keep: 20 });
    const second = startSearch(12345, e24, { maxParts: 3, keep: 20 });
    const [a, b] = await Promise.all([first, second]);
    ok(a === null, 'a new search stops the one before, whose promise gives null');
    ok(b && b.target === 12345 && b.results.map((c) => c.key).join() === searchCombinations(12345, e24, { maxParts: 3, keep: 20 }).results.map((c) => c.key).join(), 'the client gives the result of the search');
    eq(searchPlace(), 'page', 'without workers the client searches on the page');
    clearSearchCache();
    const seen = [];
    const third = startSearch(628.75, e96, { maxParts: 4, keep: 20 }, (f) => seen.push(f));
    cancelSearch();
    ok((await third) === null, 'cancelSearch stops the search');
    const fourth = await startSearch(628.75, e96, { maxParts: 4, keep: 20 }, (f) => seen.push(f));
    ok(fourth && fourth.best[4].exact && seen.length > 0 && seen.every((f) => f >= 0 && f <= 1), 'the client reports the progress of a long search');
    clearSearchCache();
  }
}
