// The analysis of the design mode: what a circuit gives with chosen parts at each temperature (nominal, worst case,
// RSS), whether it stays inside an allowed deviation, and what each part carries against its derated rating.
//
// Worst case. Every part is R·(1 + d)·(1 + a·ΔT), d within ± tolerance, ΔT = T − Tref. Two models for a:
//  - 'independent': each part's a is anywhere within ± TCR.
//  - 'tracking': a = c + e, with one c within ± TCR for all parts of the circuit and each part's own e within
//    ± trackingPpm / 2 (so two parts are never further apart than trackingPpm).
// The output rises or falls steadily with each part and each input, so its extremes are at corners: each part with
// d and its own drift both at the low end or both at the high end, the common drift at one end, each input at one
// end. The ends are chosen by moving one variable at a time from the nominal point, then every variable of the
// corner is flipped once more to see whether the output goes further (it does only when a direction depends on the
// other variables).
//
// RSS. Each variable's effect alone is half the change of the output between its two ends (tolerance and drift of
// a part are two variables); the RSS spread is the root of the sum of their squares, a ± around the nominal output.

import type { Network } from './network';
import { networkValue } from './network';
import { networkLoad } from './analyse';
import { CHIP_SIZES, deratedPower } from './packages';
import type { ChipSize } from './packages';
import type { Circuit, CircuitDef, Inputs, Quantity } from './circuits';
import { circuitDef, circuitInputs, circuitProblem, deviationPct } from './circuits';
import type { PartSpec } from './technology';
import { DESIGN_TEMPERATURES, REFERENCE_TEMPERATURE } from './technology';

export type DriftModel = 'independent' | 'tracking';

export interface DesignOptions {
  // The tolerance and TCR of every resistor of the circuit.
  spec: PartSpec;
  // °C. Default −40, 25, 85, 125.
  temperatures?: number[];
  // The temperature at which the nominal values hold. Default 25 °C.
  reference?: number;
  // Default 'independent'.
  drift?: DriftModel;
  // With 'tracking': how far apart the TCRs of two parts can be, in ppm/K. Default 0.
  trackingPpm?: number;
  // The allowed deviation of the output, ± percent of the target. Without it nothing is said about passing.
  allowedPct?: number;
  // The chip size the parts are rated as, by its imperial name. Default '0603'.
  chipSize?: string;
}

export interface TemperaturePoint {
  temperature: number;
  // The worst-case output, and the same as signed percent of the target (they include the nominal error).
  min: number;
  max: number;
  minPct: number;
  maxPct: number;
  // The larger of the two without sign: how far the output can be from the target.
  worstPct: number;
  // The RSS spread: ± around the nominal output, in the output's unit and in percent of the target.
  rss: number;
  rssPct: number;
  // The size of the nominal error plus the RSS spread: how far the output is from the target by RSS.
  rssWorstPct: number;
  // Allowed deviation − worstPct (and − rssWorstPct): negative when outside. Null without an allowed deviation.
  margin: number | null;
  rssMargin: number | null;
}

export interface Spread {
  target: number;
  // The output with every part and input at its nominal value: the same at every temperature.
  nominal: number;
  // Signed percent of the target.
  errorPct: number;
  points: TemperaturePoint[];
  // The index of the point with the largest worstPct, and that point's figures.
  worst: number;
  worstPct: number;
  rssWorstPct: number;
  // Inside the allowed deviation at every temperature, in the worst case and by RSS; null without one.
  passes: boolean | null;
  margin: number | null;
  rssPasses: boolean | null;
  rssMargin: number | null;
  // What each variable alone moves the output by at the worst temperature, in percent of the target, signed (the
  // sign of the effect of the variable at its high end).
  contributions: { name: string; kind: 'tolerance' | 'drift' | 'common drift' | 'source'; pct: number }[];
}

export interface PartLoad {
  // 'R', 'R1', or 'R1a', 'R1b' when the leg has several parts.
  name: string;
  leg: number;
  ohms: number;
  volts: number;
  amps: number;
  watts: number;
  // For the chosen chip size at each temperature: the rated power left and the part's power in percent of it.
  rating: { temperature: number; watts: number; loadPct: number }[];
  // Whether the chosen chip size carries the power at the hottest temperature.
  carries: boolean;
  // The smallest typical chip size that does (its imperial name), or null when none does.
  smallest: string | null;
}

export interface CircuitAnalysis extends Spread {
  circuit: Circuit['id'];
  legs: { id: string; ohms: number; network: Network }[];
  parts: PartLoad[];
  chipSize: string;
  hottest: number;
  quantities: Quantity[];
  // Why no resistances can give the target, or null (the figures are still those of the given parts).
  problem: string | null;
}

// --- The circuit as a function of signs ------------------------------------------------------------------------

interface Model {
  def: CircuitDef;
  x: Inputs;
  legs: Network[];
  // The parts of all legs in order, and where each leg starts.
  ohms: number[];
  names: string[];
  sources: { id: string; tol: number }[];
  r: number[];
  scratch: Inputs;
}

function leaves(net: Network, out: number[]): void {
  if (net.kind === 'r') out.push(net.ohms);
  else for (const part of net.parts) leaves(part, out);
}

function build(circuit: Circuit, legs: Network[]): Model {
  const def = circuitDef(circuit.id);
  const x = circuitInputs(circuit);
  const ohms: number[] = [];
  const names: string[] = [];
  def.legs.forEach((leg, index) => {
    const before = ohms.length;
    leaves(legs[index], ohms);
    const count = ohms.length - before;
    for (let k = 0; k < count; k++) names.push(count === 1 ? leg.id : leg.id + String.fromCharCode(97 + k));
  });
  const sources: Model['sources'] = [];
  for (const input of def.inputs) {
    const tol = Math.abs(circuit.tolerances?.[input.id] ?? 0) / 100;
    if (tol > 0 && x[input.id] !== 0 && Number.isFinite(x[input.id])) sources.push({ id: input.id, tol });
  }
  return { def, x, legs, ohms, names, sources, r: new Array(ohms.length), scratch: { ...x } };
}

function valueWith(net: Network, r: number[], at: { i: number }): number {
  if (net.kind === 'r') return r[at.i++];
  let sum = 0;
  if (net.kind === 'series') {
    for (const part of net.parts) sum += valueWith(part, r, at);
    return sum;
  }
  for (const part of net.parts) sum += 1 / valueWith(part, r, at);
  return 1 / sum;
}

// The spread of the variables at one temperature: tolerance `t`, common drift `g` and each part's own drift `h`,
// all as fractions.
interface Env { t: number; g: number; h: number }

function envAt(options: DesignOptions, temperature: number): Env {
  const dT = Math.abs(temperature - (options.reference ?? REFERENCE_TEMPERATURE));
  const t = Math.abs(options.spec.tolerancePct) / 100;
  const tcr = Math.abs(options.spec.tcrPpm) * 1e-6 * dT;
  if (options.drift === 'tracking') return { t, g: tcr, h: (Math.abs(options.trackingPpm ?? 0) / 2) * 1e-6 * dT };
  return { t, g: 0, h: tcr };
}

// The output with each variable at −1 (its low end), 0 (nominal) or +1 (its high end). `tol` and `own` hold a sign
// for each part (deviation and own drift), `common` is the sign of the common drift, and the signs of the inputs
// are in `src` from `offset`.
function evaluate(m: Model, env: Env, tol: number[], own: number[], common: number, src: number[], offset: number): number {
  const n = m.ohms.length;
  for (let i = 0; i < n; i++) m.r[i] = m.ohms[i] * (1 + tol[i] * env.t) * (1 + common * env.g + own[i] * env.h);
  for (let k = 0; k < m.sources.length; k++) {
    const source = m.sources[k];
    m.scratch[source.id] = m.x[source.id] * (1 + src[offset + k] * source.tol);
  }
  const at = { i: 0 };
  const r1 = valueWith(m.legs[0], m.r, at);
  const r2 = m.legs[1] ? valueWith(m.legs[1], m.r, at) : NaN;
  return m.def.value(m.scratch, r1, r2);
}

// --- Spread ----------------------------------------------------------------------------------------------------

const SLACK = 1e-9;

function spreadOf(m: Model, target: number, options: DesignOptions): Spread {
  const n = m.ohms.length;
  const size = n + 1 + m.sources.length;
  const zero: number[] = new Array(size).fill(0);
  const env0: Env = { t: 0, g: 0, h: 0 };
  const nominal = evaluate(m, env0, zero, zero, 0, zero, n + 1);
  const allowed = options.allowedPct === undefined || options.allowedPct === null ? null : Math.abs(options.allowedPct);
  const temperatures = options.temperatures?.length ? options.temperatures : DESIGN_TEMPERATURES;

  const points: TemperaturePoint[] = [];
  let contributions: Spread['contributions'] = [];
  let worst = 0;
  temperatures.forEach((temperature, index) => {
    const env = envAt(options, temperature);
    // The variables that can move at all.
    const active: number[] = [];
    for (let j = 0; j < size; j++) if (j < n ? env.t > 0 || env.h > 0 : j === n ? env.g > 0 : true) active.push(j);
    const corner = (s: number[]) => evaluate(m, env, s, s, s[n], s, n + 1);

    // The direction of each variable from the nominal point, and its effect alone.
    const dir: number[] = new Array(size).fill(0);
    const s: number[] = new Array(size).fill(0);
    const effects: Spread['contributions'] = [];
    let squares = 0;
    const effect = (name: string, kind: Spread['contributions'][number]['kind'], half: number) => {
      squares += half * half;
      effects.push({ name, kind, pct: (half / Math.abs(target)) * 100 });
    };
    for (const j of active) {
      s[j] = 1;
      const high = corner(s);
      s[j] = -1;
      const low = corner(s);
      s[j] = 0;
      dir[j] = high >= low ? 1 : -1;
      if (j < n) {
        // Tolerance and drift of a part count as two independent contributions.
        const one = (tolOnly: boolean) => {
          s[j] = 1;
          const up = tolOnly ? evaluate(m, env, s, zero, 0, zero, n + 1) : evaluate(m, env, zero, s, 0, zero, n + 1);
          s[j] = -1;
          const down = tolOnly ? evaluate(m, env, s, zero, 0, zero, n + 1) : evaluate(m, env, zero, s, 0, zero, n + 1);
          s[j] = 0;
          return (up - down) / 2;
        };
        if (env.t > 0) effect(m.names[j], 'tolerance', one(true));
        if (env.h > 0) effect(m.names[j], 'drift', one(false));
      } else if (j === n) effect('drift', 'common drift', (high - low) / 2);
      else effect(m.sources[j - n - 1].id, 'source', (high - low) / 2);
    }

    // The corner in a direction (+1: the maximum), then one variable at a time flipped until nothing moves further.
    const extreme = (sign: number) => {
      const c = dir.map((d) => d * sign);
      let best = corner(c);
      for (let pass = 0; pass < 4; pass++) {
        let moved = false;
        for (const j of active) {
          c[j] = -c[j];
          const value = corner(c);
          if (sign * (value - best) > 1e-13 * Math.abs(best)) {
            best = value;
            moved = true;
          } else c[j] = -c[j];
        }
        if (!moved) break;
      }
      return best;
    };
    const max = active.length ? extreme(1) : nominal;
    const min = active.length ? extreme(-1) : nominal;
    const minPct = deviationPct(min, target);
    const maxPct = deviationPct(max, target);
    const worstPct = Math.max(Math.abs(minPct), Math.abs(maxPct));
    const rss = Math.sqrt(squares);
    const rssPct = (rss / Math.abs(target)) * 100;
    const rssWorstPct = Math.abs(deviationPct(nominal, target)) + rssPct;
    points.push({
      temperature, min, max, minPct, maxPct, worstPct, rss, rssPct, rssWorstPct,
      margin: allowed === null ? null : allowed - worstPct,
      rssMargin: allowed === null ? null : allowed - rssWorstPct,
    });
    if (index === 0 || worstPct > points[worst].worstPct) {
      worst = index;
      contributions = effects;
    }
  });

  const at = points[worst];
  const rssWorstPct = Math.max(...points.map((point) => point.rssWorstPct));
  return {
    target,
    nominal,
    errorPct: deviationPct(nominal, target),
    points,
    worst,
    worstPct: at.worstPct,
    rssWorstPct,
    passes: allowed === null ? null : at.margin >= -SLACK,
    margin: at.margin,
    rssPasses: allowed === null ? null : allowed - rssWorstPct >= -SLACK,
    rssMargin: allowed === null ? null : allowed - rssWorstPct,
    contributions,
  };
}

// The spread alone (no loads): what the suggestions call for every candidate.
export function circuitSpread(circuit: Circuit, legs: Network[], target: number, options: DesignOptions): Spread {
  return spreadOf(build(circuit, legs), target, options);
}

// --- Power -----------------------------------------------------------------------------------------------------

export function chipSize(imperial: string): ChipSize | undefined {
  return CHIP_SIZES.find((size) => size.imperial === imperial);
}

// The smallest chip size whose typical rating, derated at this ambient temperature, carries the power; null when
// none of the table does. Without margin: ratings differ by maker.
export function smallestChip(watts: number, temperature = 70): ChipSize | null {
  for (const size of CHIP_SIZES) {
    if (deratedPower(size.power, temperature, size.maxTemperature) >= watts * (1 - 1e-9)) return size;
  }
  return null;
}

// The whole analysis of a circuit with chosen parts: `legs` has one network for each resistance of the circuit
// (R, or R1 and R2), `target` is the output wanted, in the output's unit.
export function analyseCircuit(circuit: Circuit, legs: Network[], target: number, options: DesignOptions): CircuitAnalysis {
  const m = build(circuit, legs);
  const spread = spreadOf(m, target, options);
  const temperatures = options.temperatures?.length ? options.temperatures : DESIGN_TEMPERATURES;
  const hottest = Math.max(...temperatures);
  const chip = chipSize(options.chipSize ?? '0603') ?? chipSize('0603');
  const r1 = networkValue(legs[0]);
  const r2 = legs[1] ? networkValue(legs[1]) : NaN;
  const currents = m.def.currents(m.x, r1, r2);

  const parts: PartLoad[] = [];
  m.def.legs.forEach((leg, index) => {
    const load = networkLoad(legs[index], { amps: currents[index] });
    for (const part of load.parts) {
      const watts = Math.abs(part.watts);
      const rating = temperatures.map((temperature) => {
        const rated = deratedPower(chip.power, temperature, chip.maxTemperature);
        return { temperature, watts: rated, loadPct: rated > 0 ? (watts / rated) * 100 : watts > 0 ? Infinity : 0 };
      });
      parts.push({
        name: m.names[parts.length],
        leg: index,
        ohms: part.ohms,
        volts: part.volts,
        amps: part.amps,
        watts,
        rating,
        carries: deratedPower(chip.power, hottest, chip.maxTemperature) >= watts * (1 - 1e-9),
        smallest: smallestChip(watts, hottest)?.imperial ?? null,
      });
    }
  });

  return {
    ...spread,
    circuit: circuit.id,
    legs: m.def.legs.map((leg, index) => ({ id: leg.id, ohms: index === 0 ? r1 : r2, network: legs[index] })),
    parts,
    chipSize: chip.imperial,
    hottest,
    quantities: m.def.quantities(m.x, r1, r2),
    problem: circuitProblem(circuit, target),
  };
}
