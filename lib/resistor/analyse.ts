// What a network does: how voltage, current and power divide over its resistors, and how far its value moves with
// the tolerance of the parts.

import type { Network } from './network';
import { networkValue } from './network';

export interface PartShare {
  ohms: number;
  // Fractions of the voltage across the network, of the current through it and of the power in it.
  voltage: number;
  current: number;
  power: number;
}

// The share of every resistor, in the order of the formula (R1, R2, …). The powers add up to 1.
export function networkShares(net: Network): PartShare[] {
  const out: PartShare[] = [];
  const walk = (node: Network, voltage: number, current: number) => {
    if (node.kind === 'r') {
      out.push({ ohms: node.ohms, voltage, current, power: voltage * current });
      return;
    }
    const total = networkValue(node);
    for (const part of node.parts) {
      const r = networkValue(part);
      // Series parts carry the same current and divide the voltage; parallel parts the other way round.
      if (node.kind === 'series') walk(part, (voltage * r) / total, current);
      else walk(part, voltage, (current * total) / r);
    }
  };
  walk(net, 1, 1);
  return out;
}

// The value of the network with every resistor replaced by `value(index, ohms)`.
function valueWith(net: Network, value: (index: number, ohms: number) => number): number {
  let index = 0;
  const walk = (node: Network): number => {
    if (node.kind === 'r') return value(index++, node.ohms);
    let sum = 0;
    if (node.kind === 'series') {
      for (const part of node.parts) sum += walk(part);
      return sum;
    }
    for (const part of node.parts) sum += 1 / walk(part);
    return 1 / sum;
  };
  return walk(net);
}

export interface NetworkTolerance {
  nominal: number;
  // Worst case: every part at its lower limit, and every part at its upper limit (a series-parallel network grows
  // with each of its resistors, so these two corners are the extremes).
  low: number;
  high: number;
  // The same as percent of the nominal value; `minusPct` is negative.
  minusPct: number;
  plusPct: number;
  // The larger of the two, without sign.
  worstPct: number;
  // Root of the sum of squares of each part's effect, for independent parts.
  rssPct: number;
  // Per part: the change of the network in percent for one percent of change in the part. They add up to 1.
  sensitivities: number[];
}

// The tolerance of the network for a part tolerance in percent: one number for all parts, or one per part in the
// order of the formula.
export function networkTolerance(net: Network, tolerancePct: number | number[]): NetworkTolerance {
  const of = (index: number) => {
    const pct = typeof tolerancePct === 'number' ? tolerancePct : tolerancePct[index];
    return Math.abs(pct ?? 0) / 100;
  };
  const nominal = networkValue(net);
  const low = valueWith(net, (index, ohms) => ohms * (1 - of(index)));
  const high = valueWith(net, (index, ohms) => ohms * (1 + of(index)));
  // The sensitivity of a network to one of its resistors equals that resistor's share of the power.
  const sensitivities = networkShares(net).map((share) => share.power);
  let squares = 0;
  sensitivities.forEach((s, index) => {
    squares += (s * of(index) * 100) ** 2;
  });
  const minusPct = (low / nominal - 1) * 100;
  const plusPct = (high / nominal - 1) * 100;
  return {
    nominal,
    low,
    high,
    minusPct,
    plusPct,
    worstPct: Math.max(Math.abs(minusPct), Math.abs(plusPct)),
    rssPct: Math.sqrt(squares),
    sensitivities,
  };
}

export interface NetworkLoad {
  ohms: number;
  volts: number;
  amps: number;
  watts: number;
  // Per resistor, in the order of the formula; `share` is its fraction of the power.
  parts: { ohms: number; volts: number; amps: number; watts: number; share: number }[];
}

// Voltage, current and power in the network and in each resistor, for a voltage across the network or a current
// through it (the voltage is used when both are given).
export function networkLoad(net: Network, source: { volts?: number; amps?: number }): NetworkLoad {
  const ohms = networkValue(net);
  const volts = source.volts !== undefined ? source.volts : (source.amps ?? 0) * ohms;
  const amps = volts / ohms;
  const watts = volts * amps;
  const parts = networkShares(net).map((share) => ({
    ohms: share.ohms,
    volts: share.voltage * volts,
    amps: share.current * amps,
    watts: share.power * watts,
    share: share.power,
  }));
  return { ohms, volts, amps, watts, parts };
}
