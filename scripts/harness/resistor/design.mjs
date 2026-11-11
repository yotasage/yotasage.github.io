// Checks of the design mode's engine (lib/resistor: technology, circuits, design, suggest). Called by check.mjs.
//
// The circuits are written here once more, by hand, so that the worst case of the library is compared with a sweep
// of every corner, with random draws and with a search over every pair of values that do not use its code.

// The output of a circuit, written independently of lib/resistor/circuits.ts.
function output(id, x, r1, r2) {
  const load = x.load > 0 && Number.isFinite(x.load) ? x.load : Infinity;
  const low = Number.isFinite(load) ? 1 / (1 / r2 + 1 / load) : r2;
  switch (id) {
    case 'single-current': return (x.volts - (x.drop ?? 0)) / r1;
    case 'single-voltage': case 'shunt': return x.amps * r1;
    case 'divider': return (x.vin * low) / (r1 + low);
    case 'feedback': return x.vref + (x.vref / r2 + (x.ifb ?? 0)) * r1;
    case 'noninverting': return (r1 + r2) / r2;
    default: return -r2 / r1;
  }
}

// A small random generator with a seed, so that the draws are the same on every run.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function designChecks(lib, { section, ok, eq }) {
  const {
    resistorNet: R, seriesNet: S, parallelNet: P, networkValue, networkLeaves, networkFormula, seriesList,
    TECHNOLOGIES, technology, partFactor, partLimits, resistanceAt, DESIGN_TEMPERATURES, REFERENCE_TEMPERATURE,
    CIRCUITS, circuitDef, circuitOutput, idealResistance, circuitProblem, deviationPct,
    analyseCircuit, circuitSpread, smallestChip, deratedPower,
    suggestParts, neededSpec, clearSuggestCache, MAX_PAIR_LEG_VALUES,
  } = lib;
  const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
  const about = (actual, expected, tol, what) => ok(near(actual, expected, tol), `${what}: got ${actual}, wanted ${expected}`);
  const thick = { tolerancePct: 1, tcrPpm: 100 };
  const thin = { tolerancePct: 0.1, tcrPpm: 25 };

  // -------------------------------------------------------------------------------------------------------------
  section('design: parts and circuits');
  for (const id of ['thick-film', 'thin-film', 'metal-film', 'carbon-film', 'foil', 'wirewound']) {
    const entry = technology(id);
    ok(entry && entry.tolerancePct >= entry.tolerances[0] && entry.tolerancePct <= entry.tolerances[1]
      && entry.tcrPpm >= entry.tcrs[0] && entry.tcrPpm <= entry.tcrs[1], `the preset of ${id} lies in its ranges`);
  }
  eq(technology('thick-film').tolerancePct, 1, 'thick film starts at 1 %');
  eq(technology('thick-film').tcrPpm, 100, 'thick film starts at 100 ppm/K');
  eq(technology('thin-film').tcrPpm, 25, 'thin film starts at 25 ppm/K');
  ok(TECHNOLOGIES.length >= 6 && new Set(TECHNOLOGIES.map((entry) => entry.id)).size === TECHNOLOGIES.length, 'the presets have different ids');
  eq(DESIGN_TEMPERATURES.join(' '), '-40 25 85 125', 'the default temperatures');
  eq(REFERENCE_TEMPERATURE, 25, 'the reference temperature');
  about(partFactor(1, 100, 85), 1.01 * 1.006, 1e-12, 'a part 1 % high with 100 ppm/K at 85 °C');
  about(partFactor(-1, 100, -40), 0.99 * (1 - 0.0065), 1e-12, 'a part 1 % low with 100 ppm/K at −40 °C');
  about(resistanceAt(10e3, 0, -50, 125), 10e3 * (1 - 0.005), 1e-12, '10 kΩ with −50 ppm/K at 125 °C');
  about(partLimits(thick, 125).high, 1.01 * 1.01, 1e-12, 'the upper limit of a 1 %, 100 ppm/K part at 125 °C');
  about(partLimits(thick, -40).low, 0.99 * 0.9935, 1e-12, 'the lower limit of a 1 %, 100 ppm/K part at −40 °C');

  eq(CIRCUITS.map((entry) => entry.id).join(' '), 'single-current single-voltage divider feedback noninverting inverting shunt', 'the circuits');
  ok(CIRCUITS.every((entry) => entry.legs.length === (entry.family === 'single' || entry.family === 'shunt' ? 1 : 2)), 'one resistance for a single resistor and a shunt, two for the others');
  eq(idealResistance({ id: 'single-current', inputs: { volts: 5 } }, 0.01), 500, '5 V and 10 mA');
  eq(idealResistance({ id: 'single-current', inputs: { volts: 5, drop: 2 } }, 0.02), 150, '5 V, a 2 V drop and 20 mA');
  eq(idealResistance({ id: 'single-voltage', inputs: { amps: 0.001 } }, 3.3), 3300, '1 mA and 3.3 V');
  eq(idealResistance({ id: 'shunt', inputs: { amps: 5 } }, 0.05), 0.01, '5 A and 50 mV');
  eq(circuitOutput({ id: 'divider', inputs: { vin: 5 } }, [R(10e3), R(10e3)]), 2.5, '10 k / 10 k from 5 V');
  about(circuitOutput({ id: 'divider', inputs: { vin: 5, load: 10e3 } }, [R(10e3), R(10e3)]), 5 / 3, 1e-12, '10 k / 10 k from 5 V with a 10 k load');
  eq(circuitOutput({ id: 'divider', inputs: { vin: 5, load: 0 } }, [R(10e3), R(10e3)]), 2.5, 'a load of 0 is no load');
  about(circuitOutput({ id: 'feedback', inputs: { vref: 0.8 } }, [R(31.6e3), R(10e3)]), 3.328, 1e-12, 'Vref 0.8 V with 31.6 k and 10 k');
  about(circuitOutput({ id: 'feedback', inputs: { vref: 0.8, ifb: 1e-6 } }, [R(31.6e3), R(10e3)]), 3.3596, 1e-12, 'the same with 1 µA into the pin');
  about(circuitOutput({ id: 'feedback', inputs: { vref: 1.25, ifb: 50e-6 } }, [R(720), R(240)]), 1.25 * 4 + 0.036, 1e-12, 'an LM317 with 240 Ω across the reference and 720 Ω');
  eq(circuitOutput({ id: 'noninverting', inputs: {} }, [R(9e3), R(1e3)]), 10, 'non-inverting 9 k / 1 k');
  eq(circuitOutput({ id: 'inverting', inputs: {} }, [R(1e3), R(10e3)]), -10, 'inverting 1 k and 10 k');
  eq(circuitOutput({ id: 'shunt', inputs: { amps: 5 } }, [P([R(0.02), R(0.02)])]), 0.05, 'two 20 mΩ in parallel at 5 A');
  about(idealResistance({ id: 'divider', inputs: { vin: 5 } }, 3.3, 1, 10e3), 10e3 * 3.3 / 1.7, 1e-12, 'R2 for 3.3 V from 5 V with R1 = 10 k');
  about(idealResistance({ id: 'divider', inputs: { vin: 5, load: 10e3 } }, 2.5, 1, 5e3), 10e3, 1e-12, 'R2 with a load: 5 k needs 10 k ∥ 10 k');
  ok(Number.isNaN(idealResistance({ id: 'divider', inputs: { vin: 5, load: 10e3 } }, 2.5, 1, 20e3)), 'no R2 when the load alone pulls the output too low');
  about(idealResistance({ id: 'feedback', inputs: { vref: 0.8, ifb: 1e-6 } }, 3.3596, 0, 10e3), 31.6e3, 1e-9, 'R1 of the feedback with a pin current');
  about(idealResistance({ id: 'feedback', inputs: { vref: 0.8, ifb: 1e-6 } }, 3.3596, 1, 31.6e3), 10e3, 1e-9, 'R2 of the feedback with a pin current');
  eq(idealResistance({ id: 'inverting', inputs: {} }, -4.7, 1, 1e3), 4700, 'R2 for a gain of −4.7 with R1 = 1 k');
  eq(idealResistance({ id: 'noninverting', inputs: {} }, 11, 0, 1e3), 10e3, 'R1 for a gain of 11 with R2 = 1 k');
  about(deviationPct(-10.1, -10), -1, 1e-9, 'a gain of −10.1 against −10 is −1 %');
  about(deviationPct(2.525, 2.5), 1, 1e-9, '2.525 V against 2.5 V is +1 %');
  ok(circuitProblem({ id: 'divider', inputs: { vin: 5 } }, 6) && circuitProblem({ id: 'noninverting', inputs: {} }, 0.5)
    && circuitProblem({ id: 'inverting', inputs: {} }, 2) && circuitProblem({ id: 'feedback', inputs: { vref: 0.8 } }, 0.5)
    && circuitProblem({ id: 'single-current', inputs: { volts: 2, drop: 3 } }, 0.01) && circuitProblem({ id: 'shunt', inputs: { amps: 5 } }, 0), 'targets that no resistances give are said');
  ok(circuitProblem({ id: 'divider', inputs: { vin: 5 } }, 3.3) === null && circuitProblem({ id: 'feedback', inputs: { vref: -1.25 } }, -5) === null, 'a possible target has no problem');

  // -------------------------------------------------------------------------------------------------------------
  section('design: analysis');
  {
    const divider = { id: 'divider', inputs: { vin: 5 } };
    const legs = [R(10e3), R(10e3)];
    const flat = analyseCircuit(divider, legs, 2.5, { spec: { tolerancePct: 1, tcrPpm: 0 }, allowedPct: 1 });
    eq(flat.points.length, 4, 'a point for each default temperature');
    ok(flat.points.every((point) => near(point.maxPct, 1, 1e-9) && near(point.minPct, -1, 1e-9)), 'a 10 k / 10 k divider with 1 % parts is ±1 % of 2.5 V');
    ok(flat.points.every((point) => near(point.max, 2.525) && near(point.min, 2.475)), 'which is 2.475 V to 2.525 V');
    ok(flat.passes === true && near(flat.margin, 0, 1e-9), 'it just stays inside ±1 %');
    about(flat.points[1].rssPct, Math.SQRT1_2, 1e-4, 'its RSS spread is 0.707 %');
    eq(flat.errorPct, 0, 'its nominal error is 0');
    const hot = analyseCircuit(divider, legs, 2.5, { spec: thick, allowedPct: 1.5 });
    about(hot.points[3].maxPct, (1.0201 / 2.0002 / 0.5 - 1) * 100, 1e-9, 'with 100 ppm/K at 125 °C: +1.9998 %');
    about(hot.points[0].worstPct, (1 - (0.99 * 0.9935) / (0.99 * 0.9935 + 1.01 * 1.0065) / 0.5) * 100, 1e-9, 'at −40 °C: 1.65 %');
    about(hot.points[1].worstPct, 1, 1e-9, 'at 25 °C the drift adds nothing');
    ok(hot.worst === 3 && hot.passes === false && near(hot.margin, 1.5 - hot.points[3].worstPct), 'the worst temperature is 125 °C, outside ±1.5 % by the margin');
    ok(hot.rssPasses === true && near(hot.rssMargin, 1.5 - hot.points[3].rssWorstPct), 'by RSS it stays inside');
    about(hot.points[3].rssPct, 1, 1e-3, 'RSS at 125 °C: four contributions of 0.5 %');
    eq(hot.contributions.length, 4, 'two contributions for each part at the worst temperature');
    ok(hot.contributions.every((entry) => near(Math.abs(entry.pct), 0.5, 1e-3)), 'each of about 0.5 %');
    ok(analyseCircuit(divider, legs, 2.5, { spec: thick }).passes === null, 'nothing is said about passing without an allowed deviation');

    const loaded = analyseCircuit({ id: 'divider', inputs: { vin: 5, load: 10e3 } }, legs, 5 / 3, { spec: thick });
    about(loaded.nominal, 5 / 3, 1e-12, 'with a 10 k load the nominal output is 1.667 V');
    const quantity = (analysis, id) => analysis.quantities.find((entry) => entry.id === id)?.value;
    about(quantity(loaded, 'current'), 5 / 15e3, 1e-12, 'it draws 0.333 mA');
    about(quantity(loaded, 'outputResistance'), 5e3, 1e-12, 'its output resistance is 5 k');
    about(quantity(loaded, 'unloaded'), 2.5, 1e-12, 'without the load it gives 2.5 V');
    about(loaded.parts[0].volts, 10 / 3, 1e-12, 'R1 has 3.33 V across it');
    about(loaded.parts[1].amps, 5 / 3 / 10e3, 1e-12, 'R2 carries 0.167 mA');
    eq(loaded.parts.map((part) => part.name).join(' '), 'R1 R2', 'the parts are named after the resistances');

    const split = analyseCircuit(divider, [S([R(4.7e3), R(5.1e3)]), P([R(20e3), R(20e3)])], 2.5, { spec: thick });
    eq(split.parts.map((part) => part.name).join(' '), 'R1a R1b R2a R2b', 'the parts of a resistance of several are R1a, R1b');
    about(split.legs[0].ohms, 9.8e3, 1e-12, 'the value of a resistance of two parts in series');
    about(split.parts[2].amps, split.parts[0].amps / 2, 1e-12, 'two equal parts in parallel share the current');

    // Parts that track.
    const independent = circuitSpread(divider, legs, 2.5, { spec: thick });
    const tracking = circuitSpread(divider, legs, 2.5, { spec: thick, drift: 'tracking' });
    ok(tracking.points.every((point) => near(point.worstPct, 1, 1e-9)), 'parts that track take the drift out of a divider: ±1 % at every temperature');
    ok(independent.points[3].worstPct > 1.99 && independent.points[0].worstPct > 1.64, 'parts that drift independently do not');
    const apart = circuitSpread(divider, legs, 2.5, { spec: thick, drift: 'tracking', trackingPpm: 10 });
    about(apart.points[3].worstPct, 1.05, 1e-3, 'tracking within 10 ppm/K adds 0.05 % at 125 °C');
    const ratio = circuitSpread({ id: 'noninverting', inputs: {} }, [R(10e3), R(1e3)], 11, { spec: thick, drift: 'tracking' });
    about(ratio.points[3].worstPct, ratio.points[1].worstPct, 1e-9, 'and out of a gain');
    const single = { id: 'single-current', inputs: { volts: 5 } };
    const alone = circuitSpread(single, [R(500)], 0.01, { spec: thick, drift: 'tracking' });
    const aloneFree = circuitSpread(single, [R(500)], 0.01, { spec: thick });
    about(alone.points[3].worstPct, aloneFree.points[3].worstPct, 1e-9, 'parts that track leave the drift in a single resistance');
    about(alone.points[3].maxPct, (1 / (0.99 * 0.99) - 1) * 100, 1e-9, 'which is +2.03 % at 125 °C');
    about(alone.points[3].minPct, (1 / (1.01 * 1.01) - 1) * 100, 1e-9, 'and −1.97 %');
    const pin = circuitSpread({ id: 'feedback', inputs: { vref: 0.8, ifb: 20e-6 } }, [R(31.6e3), R(10e3)], 3.96, { spec: thick, drift: 'tracking' });
    ok(pin.points[3].worstPct > pin.points[1].worstPct + 0.1, 'with a pin current the drift of tracking parts still moves the output');

    // Inputs with a tolerance.
    const supply = circuitSpread({ id: 'single-current', inputs: { volts: 5 }, tolerances: { volts: 5 } }, [R(500)], 0.01, { spec: { tolerancePct: 1, tcrPpm: 0 } });
    about(supply.points[1].maxPct, (1.05 / 0.99 - 1) * 100, 1e-9, 'a 5 % supply and a 1 % resistor: +6.06 %');
    about(supply.points[1].minPct, (0.95 / 1.01 - 1) * 100, 1e-9, 'and −5.94 %');
    about(supply.points[1].rssPct, Math.hypot(5, 1), 1e-3, 'RSS of 5 % and 1 %');
    ok(supply.contributions.some((entry) => entry.kind === 'source' && entry.name === 'volts' && near(entry.pct, 5, 1e-9)), 'the supply is among the contributions');
    const led = analyseCircuit({ id: 'single-current', inputs: { volts: 5, drop: 2 } }, [R(150)], 0.02, { spec: thick });
    about(led.nominal, 0.02, 1e-12, '5 V, a 2 V drop and 150 Ω give 20 mA');
    about(led.parts[0].watts, 0.06, 1e-12, 'and 60 mW in the resistor');
    const gain = circuitSpread({ id: 'inverting', inputs: {} }, [R(1e3), R(10e3)], -10, { spec: { tolerancePct: 1, tcrPpm: 0 }, temperatures: [25] });
    about(gain.points[0].minPct, (-(1.01 / 0.99) + 1) * 10 * 10, 1e-9, 'an inverting gain of −10 with 1 % parts: −2.02 % (further from zero)');
    about(gain.points[0].maxPct, (-(0.99 / 1.01) + 1) * 10 * 10, 1e-9, 'and +1.98 %');
    ok(gain.points[0].min < gain.points[0].max && gain.points[0].min < -10, 'min is the more negative gain');

    // Power and derating.
    about(deratedPower(1, 85, 155), 70 / 85, 1e-12, 'a 155 °C part keeps 82 % at 85 °C');
    about(deratedPower(1, 125, 155), 30 / 85, 1e-12, 'and 35 % at 125 °C');
    eq(Math.round(deratedPower(100, 85)), 82, 'rounded: 82 %');
    eq(Math.round(deratedPower(100, 125)), 35, 'rounded: 35 %');
    const shunt = analyseCircuit({ id: 'shunt', inputs: { amps: 5 } }, [R(0.01)], 0.05, { spec: thick, chipSize: '2512' });
    about(shunt.nominal, 0.05, 1e-12, '10 mΩ at 5 A gives 50 mV');
    about(shunt.parts[0].watts, 0.25, 1e-12, 'and 0.25 W');
    about(quantity(shunt, 'power'), 0.25, 1e-12, 'which is among the quantities');
    eq(shunt.hottest, 125, 'the hottest temperature');
    about(shunt.parts[0].rating[2].watts, 70 / 85, 1e-12, 'a 2512 chip is rated 0.82 W at 85 °C');
    about(shunt.parts[0].rating[3].watts, 30 / 85, 1e-12, 'and 0.35 W at 125 °C');
    about(shunt.parts[0].rating[3].loadPct, 0.25 / (30 / 85) * 100, 1e-9, 'where 0.25 W is 71 % of it');
    ok(shunt.parts[0].carries === true && shunt.parts[0].smallest === '1812', 'the smallest size for 0.25 W at 125 °C is 1812');
    const cool = analyseCircuit({ id: 'shunt', inputs: { amps: 5 } }, [R(0.01)], 0.05, { spec: thick, temperatures: [25, 70], chipSize: '0805' });
    ok(cool.parts[0].carries === false && cool.parts[0].smallest === '1206', 'up to 70 °C it is 1206, and 0805 does not carry it');
    const shared = analyseCircuit({ id: 'shunt', inputs: { amps: 5 } }, [P([R(0.02), R(0.02)])], 0.05, { spec: thick, temperatures: [25, 70] });
    ok(near(shared.parts[0].watts, 0.125) && shared.parts[1].smallest === '0805', 'two 20 mΩ in parallel carry 0.125 W each: 0805');
    eq(smallestChip(2, 70), null, 'no chip of the table carries 2 W');
    eq(smallestChip(0.05, 125).imperial, '1206', '50 mW at 125 °C needs a 1206 chip (35 % of 0.25 W)');
    eq(smallestChip(0.05, 70).imperial, '0201', 'and a 0201 chip up to 70 °C');
    eq(analyseCircuit(divider, legs, 2.5, { spec: thick }).chipSize, '0603', 'the chip size is 0603 unless chosen');
  }

  // The corners against a sweep of every corner, and against random draws.
  const cases = [
    { id: 'single-current', inputs: { volts: 12, drop: 2 }, tolerances: { volts: 5, drop: 10 }, legs: [S([R(470), P([R(1e3), R(2.2e3)])])], target: 0.0085 },
    { id: 'divider', inputs: { vin: 5, load: 47e3 }, tolerances: { vin: 2, load: 10 }, legs: [S([R(10e3), R(2.2e3)]), P([R(22e3), R(33e3)])], target: 2.4 },
    { id: 'divider', inputs: { vin: 12 }, tolerances: {}, legs: [R(14e3), R(10e3)], target: 5 },
    { id: 'feedback', inputs: { vref: 0.8, ifb: 1e-6 }, tolerances: { vref: 1, ifb: 50 }, legs: [R(31.6e3), R(10e3)], target: 3.3 },
    { id: 'feedback', inputs: { vref: 1.25, ifb: 50e-6 }, tolerances: { vref: 4 }, legs: [P([R(1.5e3), R(1.5e3)]), R(240)], target: 5 },
    { id: 'noninverting', inputs: {}, tolerances: {}, legs: [S([R(9.1e3), R(910)]), R(1e3)], target: 11 },
    { id: 'inverting', inputs: {}, tolerances: {}, legs: [R(1e3), P([R(4.7e3), R(47e3)])], target: -4.3 },
    { id: 'shunt', inputs: { amps: 5 }, tolerances: { amps: 1 }, legs: [P([R(0.02), R(0.02)])], target: 0.05 },
  ];
  const models = [
    { spec: thick },
    { spec: { tolerancePct: 5, tcrPpm: 500 } },
    { spec: thick, drift: 'tracking' },
    { spec: thick, drift: 'tracking', trackingPpm: 20 },
    { spec: { tolerancePct: 0, tcrPpm: 200 }, drift: 'tracking', trackingPpm: 50 },
  ];
  // The leaves of the legs scaled by `factor(index)`, and the value of each leg.
  const scaledLegs = (legs, factor) => {
    let index = 0;
    const walk = (net) => (net.kind === 'r' ? R(net.ohms * factor(index++)) : (net.kind === 'series' ? S : P)(net.parts.map(walk)));
    return legs.map((leg) => networkValue(walk(leg)));
  };
  const spreadOf = (model, temperature) => {
    const dT = temperature - 25;
    const tcr = model.spec.tcrPpm * 1e-6;
    return model.drift === 'tracking'
      ? { t: model.spec.tolerancePct / 100, common: tcr * dT, own: ((model.trackingPpm ?? 0) / 2) * 1e-6 * dT }
      : { t: model.spec.tolerancePct / 100, common: 0, own: tcr * dT };
  };

  section('design: corners');
  for (const entry of cases) {
    const circuit = { id: entry.id, inputs: entry.inputs, tolerances: entry.tolerances };
    const count = entry.legs.reduce((sum, leg) => sum + networkLeaves(leg).length, 0);
    const sources = Object.keys(entry.tolerances);
    for (const model of models) {
      const spread = circuitSpread(circuit, entry.legs, entry.target, model);
      let same = true;
      spread.points.forEach((point) => {
        const { t, common, own } = spreadOf(model, point.temperature);
        // Every corner: deviation and own drift of each part on their own, the common drift, each input.
        const bits = 2 * count + 1 + sources.length;
        let min = Infinity;
        let max = -Infinity;
        for (let mask = 0; mask < 1 << bits; mask++) {
          const sign = (bit) => ((mask >> bit) & 1 ? 1 : -1);
          const [r1, r2] = scaledLegs(entry.legs, (i) => (1 + sign(2 * i) * t) * (1 + sign(2 * count) * common + sign(2 * i + 1) * own));
          const x = { ...entry.inputs };
          sources.forEach((id, k) => { x[id] = entry.inputs[id] * (1 + (sign(2 * count + 1 + k) * entry.tolerances[id]) / 100); });
          const value = output(entry.id, x, r1, r2);
          if (value < min) min = value;
          if (value > max) max = value;
        }
        if (!near(point.min, min, 1e-11) || !near(point.max, max, 1e-11)) same = false;
        if (!near(point.minPct, ((min - entry.target) / Math.abs(entry.target)) * 100, 1e-9)) same = false;
      });
      ok(same, `${entry.id} with ${networkFormula(entry.legs[0])}, ${model.spec.tolerancePct} %, ${model.spec.tcrPpm} ppm/K, ${model.drift ?? 'independent'} ${model.trackingPpm ?? ''}: the worst case is that of a sweep of all corners`);
      ok(near(spread.nominal, output(entry.id, entry.inputs, ...scaledLegs(entry.legs, () => 1)), 1e-12)
        && spread.points.every((point) => point.min <= spread.nominal && spread.nominal <= point.max), `${entry.id}: the nominal output lies between the limits`);
    }
  }

  section('design: random draws');
  {
    const next = random(20261111);
    const uniform = (half) => (2 * next() - 1) * half;
    for (const entry of cases) {
      const circuit = { id: entry.id, inputs: entry.inputs, tolerances: entry.tolerances };
      const count = entry.legs.reduce((sum, leg) => sum + networkLeaves(leg).length, 0);
      for (const model of [models[0], models[3]]) {
        const spread = circuitSpread(circuit, entry.legs, entry.target, { ...model, temperatures: [-40, 125] });
        for (const point of spread.points) {
          const { t, common, own } = spreadOf(model, point.temperature);
          const draws = 4000;
          let inside = true;
          let sum = 0;
          let squares = 0;
          for (let n = 0; n < draws; n++) {
            const shared = uniform(Math.abs(common));
            const factors = Array.from({ length: count }, () => (1 + uniform(t)) * (1 + shared + uniform(Math.abs(own))));
            const [r1, r2] = scaledLegs(entry.legs, (i) => factors[i]);
            const x = { ...entry.inputs };
            for (const id of Object.keys(entry.tolerances)) x[id] = entry.inputs[id] * (1 + uniform(entry.tolerances[id] / 100));
            const value = output(entry.id, x, r1, r2);
            if (value < point.min - 1e-12 * Math.abs(point.min) || value > point.max + 1e-12 * Math.abs(point.max)) inside = false;
            sum += value;
            squares += value * value;
          }
          const deviation = Math.sqrt(squares / draws - (sum / draws) ** 2);
          ok(inside, `${entry.id}, ${model.drift ?? 'independent'}, ${point.temperature} °C: ${draws} random circuits stay inside the worst case`);
          // Uniform within ± a limit has a standard deviation of the limit / √3.
          const factor = (deviation * Math.sqrt(3)) / point.rss;
          ok(factor > 0.9 && factor < 1.1, `${entry.id}, ${model.drift ?? 'independent'}, ${point.temperature} °C: their standard deviation is the RSS spread / √3 (factor ${factor.toFixed(3)})`);
          ok(point.rss <= (point.max - point.min) / 2 * (1 + 1e-6), `${entry.id}: the RSS spread is not above the worst case`);
        }
      }
    }
  }

  // -------------------------------------------------------------------------------------------------------------
  section('design: suggestions');
  const e24 = seriesList('E24');
  {
    const led = suggestParts({ id: 'single-current', inputs: { volts: 5 } }, 0.01, e24, { spec: thick, allowedPct: 5 });
    eq(led.ideal, 500, '5 V and 10 mA need 500 Ω');
    ok(led.best[1].ohms[0] === 510 && near(led.best[1].errorPct, (500 / 510 - 1) * 100), 'the nearest E24 value is 510 Ω, −1.96 % in the current');
    ok(led.candidates[0] === led.best[1] && led.candidates[0].passes, 'which passes ±5 % and is first: one part');
    ok(led.best[2].passes && Math.abs(led.best[2].errorPct) < 1e-9 && near(led.best[2].ohms[0], 500), 'two E24 parts give 500 Ω exactly');
    eq(led.needed, null, 'nothing is needed when something passes');
    const below = suggestParts({ id: 'single-current', inputs: { volts: 5 } }, 0.01, e24, { spec: thick, allowedPct: 5, maxParts: 1 });
    ok(below.candidates.every((entry) => entry.parts === 1) && below.candidates.some((entry) => entry.ohms[0] === 470), 'with one part only: 510 Ω, 470 Ω and further');
    const tight = suggestParts({ id: 'single-current', inputs: { volts: 5 } }, 0.01, e24, { spec: thin, allowedPct: 1 });
    ok(tight.candidates[0].parts === 2 && tight.candidates[0].passes && !tight.best[1].passes, 'inside ±1 % only two parts pass, and they are before 510 Ω');
    const three = suggestParts({ id: 'single-voltage', inputs: { amps: 0.001 } }, 3.3333, e24, { spec: thin, allowedPct: 1, maxParts: 3 });
    ok(three.best[3] && three.best[3].parts === 3 && three.candidates.every((entry) => entry.tie === 0), 'a single resistance of up to three parts');
    const shunt = suggestParts({ id: 'shunt', inputs: { amps: 5 } }, 0.05, seriesList('E24', 0.001, 1), { spec: thick, allowedPct: 5 });
    ok(shunt.ideal === 0.01 && shunt.candidates[0].parts === 1 && near(shunt.candidates[0].ohms[0], 0.01), 'a shunt for 50 mV at 5 A is 10 mΩ');
    const none = suggestParts({ id: 'divider', inputs: { vin: 5 } }, 6, e24, { spec: thick, allowedPct: 5 });
    ok(none.candidates.length === 0 && none.note && none.needed === null, 'a divider above its input has no candidates and says why');
    ok(suggestParts({ id: 'divider', inputs: { vin: 5 } }, 2.5, [], { spec: thick, allowedPct: 5 }).note, 'so does an empty list');
  }

  // Two resistances against every pair of values. The key of the search: passing first, then the nominal error in
  // steps of 1e-12, then the distance of the sum from the preferred one.
  const keyOf = (fail, deviation, tie) => ({ fail, error: Math.round(deviation * 1e12), tie });
  const byKey = (a, b) => a.fail - b.fail || a.error - b.error || a.tie - b.tie;
  const sameKeys = (found, wanted) => found.length === wanted.length
    && found.every((key, index) => key.fail === wanted[index].fail && Math.abs(key.error - wanted[index].error) <= 2 && near(key.tie, wanted[index].tie, 1e-9));
  const candidateKey = (entry, prefer) => keyOf(entry.passes ? 0 : 1, Math.abs(entry.errorPct) / 100, Math.abs(Math.log(entry.total / prefer)));
  const within = (value, range) => !range || (value >= (range.min ?? 0) * (1 - 1e-12) && value <= (range.max ?? Infinity) * (1 + 1e-12));
  // Every pair of legs (each a network) as keys, by the number of parts.
  const everyPair = (circuit, target, legs, options, prefer) => {
    const out = [[], [], [], [], []];
    const def = circuitDef(circuit.id);
    for (const first of legs) {
      for (const second of legs) {
        if (!within(first.ohms, options.ranges?.R1) || !within(second.ohms, options.ranges?.R2) || !within(first.ohms + second.ohms, options.ranges?.total)) continue;
        if (options.reuse === false && first.values.some((value) => second.values.includes(value))) continue;
        const x = { ...circuit.inputs };
        if (options.ranges?.current && !within(Math.abs(def.supply({ load: Infinity, ifb: 0, ...x }, first.ohms, second.ohms)), options.ranges.current)) continue;
        const deviation = Math.abs(output(circuit.id, x, first.ohms, second.ohms) - target) / Math.abs(target);
        const passes = deviation <= options.allowedPct / 100 + 1e-9 && circuitSpread(circuit, [first.net, second.net], target, options).passes;
        out[first.parts + second.parts].push(keyOf(passes ? 0 : 1, deviation, Math.abs(Math.log((first.ohms + second.ohms) / prefer))));
      }
    }
    return out.map((list) => list.sort(byKey));
  };
  const singles = (values) => values.map((value) => ({ ohms: value, parts: 1, net: R(value), values: [value] }));

  section('design: pairs against every pair');
  const scenarios = [
    { name: '3.3 V from 5 V', circuit: { id: 'divider', inputs: { vin: 5 } }, target: 3.3, options: { spec: thick, allowedPct: 3 } },
    { name: '2.5 V from 5 V, nothing passes', circuit: { id: 'divider', inputs: { vin: 5 } }, target: 2.5, options: { spec: thick, allowedPct: 1 } },
    { name: '2.5 V from 5 V, no value twice', circuit: { id: 'divider', inputs: { vin: 5 } }, target: 2.5, options: { spec: thin, allowedPct: 3, reuse: false } },
    { name: '5 V from 12 V with a 47 k load', circuit: { id: 'divider', inputs: { vin: 12, load: 47e3 } }, target: 5, options: { spec: thick, allowedPct: 3 } },
    { name: '1.8 V from 5 V, 5 k to 50 k in all', circuit: { id: 'divider', inputs: { vin: 5 } }, target: 1.8, options: { spec: thick, allowedPct: 2.5, ranges: { total: { min: 5e3, max: 50e3 } } }, prefer: Math.sqrt(5e3 * 50e3) },
    { name: '1.8 V from 5 V, 0.1 to 1 mA', circuit: { id: 'divider', inputs: { vin: 5 } }, target: 1.8, options: { spec: thick, allowedPct: 2.5, ranges: { current: { min: 1e-4, max: 1e-3 } } } },
    { name: '1.8 V from 5 V, R1 above 100 k, R2 below 1 M', circuit: { id: 'divider', inputs: { vin: 5 } }, target: 1.8, options: { spec: thick, allowedPct: 2.5, ranges: { R1: { min: 100e3 }, R2: { max: 1e6 } }, preferTotal: 1e6 }, prefer: 1e6 },
    { name: 'a 10 k load of ±20 %', circuit: { id: 'divider', inputs: { vin: 5, load: 10e3 }, tolerances: { load: 20 } }, target: 2.5, options: { spec: thick, allowedPct: 3, ranges: { R1: { min: 100 }, R2: { min: 100 } } } },
    { name: 'LM317 to 5 V', circuit: { id: 'feedback', inputs: { vref: 1.25, ifb: 50e-6 }, tolerances: { vref: 2 } }, target: 5, options: { spec: thick, allowedPct: 5 } },
    { name: '0.8 V reference to 3.3 V, tracking', circuit: { id: 'feedback', inputs: { vref: 0.8 } }, target: 3.3, options: { spec: thick, allowedPct: 2.5, drift: 'tracking', trackingPpm: 20 } },
    { name: 'gain 11', circuit: { id: 'noninverting', inputs: {} }, target: 11, options: { spec: thin, allowedPct: 1 } },
    { name: 'gain −4.7', circuit: { id: 'inverting', inputs: {} }, target: -4.7, options: { spec: thin, allowedPct: 1, temperatures: [0, 25, 70] } },
    // Lopsided limits: only candidates with an error to one side pass.
    { name: 'gain −4.7 with 5 % parts', circuit: { id: 'inverting', inputs: {} }, target: -4.7, options: { spec: { tolerancePct: 5, tcrPpm: 500 }, allowedPct: 21.25 } },
    { name: 'a 10 k load of ±40 %', circuit: { id: 'divider', inputs: { vin: 5, load: 10e3 }, tolerances: { load: 40 } }, target: 2.5, options: { spec: thick, allowedPct: 6, ranges: { R1: { min: 1e3 }, R2: { min: 1e3 } } } },
  ];
  for (const scenario of scenarios) {
    const keep = 25;
    const found = suggestParts(scenario.circuit, scenario.target, e24, { ...scenario.options, keep });
    const prefer = scenario.prefer ?? 20e3;
    const wanted = everyPair(scenario.circuit, scenario.target, singles(e24), scenario.options, prefer)[2].slice(0, keep);
    const keys = found.candidates.map((entry) => candidateKey(entry, prefer)).sort(byKey);
    ok(sameKeys(keys, wanted), `${scenario.name}: the ${keep} pairs are those of a search over every pair of E24 values`);
    ok(found.candidates.every((entry) => entry.parts === 2 && within(entry.total, scenario.options.ranges?.total) && within(entry.ohms[0], scenario.options.ranges?.R1)
      && within(entry.ohms[1], scenario.options.ranges?.R2) && within(Math.abs(entry.current ?? NaN), scenario.options.ranges?.current)), `${scenario.name}: every candidate is within the limits`);
    ok(found.candidates.every((entry) => near(entry.output, output(scenario.circuit.id, scenario.circuit.inputs, entry.ohms[0], entry.ohms[1]), 1e-12)
      && near(entry.errorPct, ((entry.output - scenario.target) / Math.abs(scenario.target)) * 100, 1e-9)), `${scenario.name}: output and error of every candidate`);
    // The order of the list: passing first by the error, the others by the margin.
    let ordered = true;
    for (let k = 1; k < found.candidates.length; k++) {
      const a = found.candidates[k - 1];
      const b = found.candidates[k];
      if (!a.passes && b.passes) ordered = false;
      if (a.passes && b.passes && Math.abs(a.errorPct) > Math.abs(b.errorPct) + 1e-9) ordered = false;
      if (!a.passes && !b.passes && a.margin < b.margin - 1e-6) ordered = false;
    }
    ok(ordered, `${scenario.name}: passing candidates first by the error, then the others by the margin`);
    ok(found.passing === found.candidates.filter((entry) => entry.passes).length && (found.passing > 0) === (wanted[0].fail === 0)
      && (found.needed === null) === (found.passing > 0), `${scenario.name}: ${found.passing} pass, as the search over every pair says`);
    const full = analyseCircuit(scenario.circuit, found.candidates[0].legs, scenario.target, scenario.options);
    ok(full.passes === found.candidates[0].passes && near(full.margin, found.candidates[0].margin) && near(full.worstPct, found.candidates[0].worstPct)
      && full.points[full.worst].temperature === found.candidates[0].temperature && near(full.points[full.worst].rssPct, found.candidates[0].rssPct), `${scenario.name}: the summary of the first candidate is that of its analysis`);
  }
  {
    const half = suggestParts({ id: 'divider', inputs: { vin: 5 } }, 2.5, e24, { spec: thick, allowedPct: 3 });
    ok(half.candidates[0].ohms[0] === 10e3 && half.candidates[0].ohms[1] === 10e3, 'among the exact halves, 10 k / 10 k is first (nearest 20 k in all)');
    const low = suggestParts({ id: 'divider', inputs: { vin: 5 } }, 2.5, e24, { spec: thick, allowedPct: 3, ranges: { total: { min: 100, max: 400 } } });
    ok(low.candidates[0].ohms[0] === 100 && low.candidates[0].ohms[1] === 100, 'with 100 Ω to 400 Ω in all, 100 Ω / 100 Ω (the middle of the range)');
    const feedback = suggestParts({ id: 'feedback', inputs: { vref: 0.8 } }, 3.328, seriesList('E96'), { spec: thick, allowedPct: 5 });
    ok(feedback.candidates.some((entry) => entry.ohms[0] === 31.6e3 && entry.ohms[1] === 10e3 && entry.passes && Math.abs(entry.errorPct) < 1e-9)
      && Math.abs(feedback.candidates[0].errorPct) < 1e-9, 'a 0.8 V reference to 3.328 V: 31.6 k and 10 k of E96 are among the exact pairs');
  }

  section('design: legs of two parts');
  {
    // Every leg of one value or of two in series or in parallel, each resistance once, none that one value gives.
    const values = seriesList('E6', 100, 100e3);
    const twoLegs = (connections, reuse) => {
      const legs = singles(values);
      const pairs = [];
      values.forEach((a, i) => values.forEach((b, j) => {
        if (j < i || (!reuse && j === i)) return;
        if (connections !== 'parallel') pairs.push({ ohms: a + b, parts: 2, net: S([R(a), R(b)]), values: [a, b], plain: (i === j ? 0 : 2) });
        if (connections !== 'series') pairs.push({ ohms: (a * b) / (a + b), parts: 2, net: P([R(a), R(b)]), values: [a, b], plain: (i === j ? 0 : 2) + 1 });
      }));
      pairs.sort((a, b) => a.ohms - b.ohms || a.plain - b.plain);
      for (const pair of pairs) {
        if (legs.some((leg) => near(leg.ohms, pair.ohms, 1e-12))) continue;
        legs.push(pair);
      }
      return legs;
    };
    const runs = [
      { name: '3.3 V from 5 V', circuit: { id: 'divider', inputs: { vin: 5 } }, target: 3.3, options: { spec: thick, allowedPct: 2.2 } },
      { name: '3.3 V from 5 V, series only, no value twice', circuit: { id: 'divider', inputs: { vin: 5 } }, target: 3.3, options: { spec: thick, allowedPct: 2.2, connections: 'series', reuse: false } },
      { name: '5 V from 12 V with a load, parallel only', circuit: { id: 'divider', inputs: { vin: 12, load: 22e3 }, tolerances: { vin: 1 } }, target: 5, options: { spec: thin, allowedPct: 1.5, connections: 'parallel', ranges: { total: { min: 1e3, max: 200e3 } } }, prefer: Math.sqrt(1e3 * 200e3) },
      { name: 'feedback to 3.3 V with a pin current', circuit: { id: 'feedback', inputs: { vref: 0.8, ifb: 2e-6 } }, target: 3.3, options: { spec: thin, allowedPct: 0.5, ranges: { current: { min: 20e-6 } } } },
      { name: 'gain −4.7', circuit: { id: 'inverting', inputs: {} }, target: -4.7, options: { spec: thick, allowedPct: 1 } },
      // Lopsided limits: the nearest partners fail and further ones pass, which the search finds by bisection.
      { name: 'gain −4.7 with 5 % parts', circuit: { id: 'inverting', inputs: {} }, target: -4.7, options: { spec: { tolerancePct: 5, tcrPpm: 500 }, allowedPct: 21.25 } },
      { name: 'a 10 k load of ±40 %', circuit: { id: 'divider', inputs: { vin: 5, load: 10e3 }, tolerances: { load: 40 } }, target: 2.5, options: { spec: thick, allowedPct: 6, ranges: { R1: { min: 1e3 }, R2: { min: 1e3 } } } },
    ];
    for (const run of runs) {
      const keep = 12;
      const found = suggestParts(run.circuit, run.target, values, { ...run.options, legParts: 2, keep });
      const prefer = run.prefer ?? 20e3;
      const wanted = everyPair(run.circuit, run.target, twoLegs(run.options.connections ?? 'mixed', run.options.reuse !== false), run.options, prefer);
      for (const parts of [2, 3, 4]) {
        const keys = found.candidates.filter((entry) => entry.parts === parts).map((entry) => candidateKey(entry, prefer)).sort(byKey);
        ok(sameKeys(keys, wanted[parts].slice(0, keep)), `${run.name}: the ${parts}-part candidates are those of a search over every pair of legs`);
      }
      ok(found.candidates.every((entry) => entry.legs.every((leg) => networkLeaves(leg).every((value) => values.includes(value))))
        && found.candidates.every((entry) => (run.options.connections !== 'series' || entry.legs.every((leg) => leg.kind !== 'parallel'))
          && (run.options.connections !== 'parallel' || entry.legs.every((leg) => leg.kind !== 'series'))
          && (run.options.reuse !== false || entry.distinct === entry.parts)), `${run.name}: only values of the list, connected as allowed`);
      ok(found.best[2] === found.candidates.find((entry) => entry.parts === 2) && found.best[4] === (found.candidates.find((entry) => entry.parts === 4) ?? null), `${run.name}: the best for each number of parts`);
    }
    const many = suggestParts({ id: 'divider', inputs: { vin: 5 } }, 3.3, Array.from({ length: MAX_PAIR_LEG_VALUES + 1 }, (unused, index) => 100 + index), { spec: thick, allowedPct: 3, legParts: 2 });
    ok(many.note && many.candidates.length > 0 && many.candidates.every((entry) => entry.parts === 2), 'with too many values the legs are single values, and a note says so');
    clearSuggestCache();
  }

  section('design: ranking and needed parts');
  {
    // A loaded divider whose load is only known to ±20 %: low resistances pass, higher ones are closer but fail.
    const circuit = { id: 'divider', inputs: { vin: 5, load: 10e3 }, tolerances: { load: 20 } };
    const options = { spec: thick, allowedPct: 3, ranges: { R1: { min: 100 }, R2: { min: 100 } }, keep: 60 };
    const found = suggestParts(circuit, 2.5, e24, options);
    const first = found.candidates[0];
    const closer = found.candidates.filter((entry) => !entry.passes && Math.abs(entry.errorPct) < Math.abs(first.errorPct) - 0.05);
    ok(first.passes && first.parts === 2 && closer.length > 0, `a passing pair (${networkFormula(first.legs[0])} / ${networkFormula(first.legs[1])}) is before ${closer.length} closer ones that fail`);
    ok(closer.every((entry) => found.candidates.indexOf(entry) >= found.passing && entry.margin < 0 && entry.ohms[0] > first.ohms[0]), 'the closer ones have higher resistances, are outside, and come after every passing one');
    const mixed = suggestParts({ id: 'single-current', inputs: { volts: 5 } }, 0.0101, e24, { spec: thin, allowedPct: 1, maxParts: 3 });
    const order = mixed.candidates.filter((entry) => entry.passes).map((entry) => entry.parts);
    ok(order.length > 3 && order.every((parts, index) => index === 0 || parts >= order[index - 1]) && order[0] < order[order.length - 1], 'among the passing ones, fewer parts are first');
    ok(mixed.candidates.some((entry, index) => entry.passes && mixed.candidates.slice(index + 1).some((later) => later.passes && later.parts > entry.parts && Math.abs(later.errorPct) < Math.abs(entry.errorPct))), 'even when one with more parts is closer');

    // What the parts would have to be.
    const divider = { id: 'divider', inputs: { vin: 5 } };
    const tight = suggestParts(divider, 2.5, e24, { spec: thick, allowedPct: 0.5 });
    ok(tight.passing === 0 && tight.needed && tight.needed.why === 'tighter', 'a 1 %, 100 ppm/K divider is not inside ±0.5 %');
    ok(tight.needed.spec.tolerancePct === 0.25 && tight.needed.spec.tcrPpm === 25, `it needs 0.25 % and 25 ppm/K (got ${JSON.stringify(tight.needed.spec)})`);
    ok(near(tight.needed.candidate.errorPct, 0, 1e-9) && tight.needed.candidate.parts === 2, 'said for the closest candidate');
    const legs = tight.needed.candidate.legs;
    const passesWith = (tolerancePct, tcrPpm) => circuitSpread(divider, legs, 2.5, { spec: { tolerancePct, tcrPpm }, allowedPct: 0.5 }).passes;
    ok(passesWith(0.25, 25) && !passesWith(0.5, 25) && !passesWith(0.25, 50), 'with which it passes, and with neither of them one step looser');
    eq(neededSpec(divider, legs, 2.5, { spec: thin, allowedPct: 0.5 }).why, 'passes', 'parts that pass need nothing');
    eq(neededSpec(divider, legs, 2.5, { spec: thick, allowedPct: 0.5, temperatures: [25] }).spec.tcrPpm, 100, 'at 25 °C alone the TCR stays');
    eq(neededSpec(divider, legs, 2.5, { spec: thick, allowedPct: 0.5, temperatures: [25] }).spec.tolerancePct, 0.5, 'and the tolerance is 0.5 %');
    eq(neededSpec(divider, legs, 2.5, { spec: thick, allowedPct: 0.0001 }).why, 'beyond', 'tighter than the tightest step');
    const far = suggestParts({ id: 'single-current', inputs: { volts: 5 } }, 0.01, seriesList('E12'), { spec: thick, allowedPct: 0.5, maxParts: 1 });
    ok(far.needed && far.needed.why === 'nominal' && far.needed.spec === null && far.needed.candidate.ohms[0] === 470, 'one E12 value is 6 % off: no tolerance helps');
    const source = suggestParts({ id: 'single-current', inputs: { volts: 5 }, tolerances: { volts: 5 } }, 0.01, e24, { spec: thick, allowedPct: 1 });
    ok(source.needed && source.needed.why === 'fixed' && source.needed.spec === null, 'a 5 % supply alone is outside ±1 %');
    const drifting = suggestParts(divider, 3.3, e24, { spec: { tolerancePct: 0.1, tcrPpm: 100 }, allowedPct: 0.5 });
    ok(drifting.needed && drifting.needed.why === 'tighter' && drifting.needed.spec.tolerancePct === 0.1 && drifting.needed.spec.tcrPpm < 100, `a part that only drifts too much needs a lower TCR (${JSON.stringify(drifting.needed?.spec)})`);
  }
}
