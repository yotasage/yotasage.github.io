// Deterministic synthetic engineering presets so visitors can explore every feature
// immediately (coherent ADC, non-coherent leakage, variable-step SPICE, Delta-Sigma,
// two-tone IMD/IP3, and 4-channel time-interleaved ADC).

import type { ParsedDataset } from '../types';

export type BuiltinPresetId =
  | 'adc-12bit'
  | 'non-coherent'
  | 'variable-step'
  | 'delta-sigma'
  | 'two-tone'
  | 'interleaved-4ch';

export interface BuiltinPresetMeta {
  id: BuiltinPresetId;
  label: string;
  badge: string;
  summary: string;
}

export const BUILTIN_PRESETS: readonly BuiltinPresetMeta[] = [
  { id: 'adc-12bit', label: '12-bit ADC (Diff)', badge: '12-bit · Diff', summary: 'Coherent 12-bit differential ADC (fs = 100 MS/s, N = 8192, M = 1753)' },
  { id: 'non-coherent', label: 'Non-coherent Audio', badge: 'Leakage', summary: 'Non-integer cycles (437.37) showing spectral leakage and windowing' },
  { id: 'variable-step', label: 'SPICE Var-Step', badge: 'Resample', summary: 'Variable-timestep SPICE transient demonstrating automatic resampling' },
  { id: 'delta-sigma', label: '2nd-order ΔΣ', badge: 'ΔΣ · OSR 64', summary: '1-bit 2nd-order Delta-Sigma modulator with OSR = 64 noise shaping' },
  { id: 'two-tone', label: 'Two-Tone IMD3', badge: 'IMD · OIP3', summary: 'Two-tone amplifier linearity test for IMD2, IMD3, and OIP3' },
  { id: 'interleaved-4ch', label: '4-ch Interleaved', badge: '4-ch ILV', summary: '4-channel time-interleaved ADC with offset, gain, and timing spurs' },
];

/** Fast deterministic PRNG (Mulberry32) so preset spectra are 100% reproducible. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller Gaussian sample using deterministic rng. */
function nextGaussian(rng: () => number): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function colInfo(
  index: number,
  name: string,
  unit: string,
  arr: Float64Array,
  isMonotonic = false,
) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < min) min = arr[i];
    if (arr[i] > max) max = arr[i];
  }
  return {
    index,
    name,
    unit,
    kind: 'float' as const,
    min,
    max,
    nonFiniteCount: 0,
    isMonotonic,
  };
}

/** Generates one of the 6 deterministic synthetic datasets on demand. */
export function generateBuiltinPreset(presetId: BuiltinPresetId): ParsedDataset {
  const rng = makeRng(presetId.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 1337));

  if (presetId === 'adc-12bit') {
    // 12-bit differential Nyquist ADC: fs = 100 MS/s, N = 8192, M = 1753 (prime), FS = 2.0 Vpp diff
    const n = 8192;
    const fs = 100e6;
    const m = 1753;
    const f0 = (m / n) * fs;
    const fsVpp = 2.0;
    const amp = 0.94 * (fsVpp / 2); // -0.54 dBFS
    const lsb = fsVpp / 4096;
    const vcm = 0.9;

    const t = new Float64Array(n);
    const voutp = new Float64Array(n);
    const voutn = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      const ti = i / fs;
      t[i] = ti;
      const phi = 2 * Math.PI * f0 * ti;
      // Inject weak HD2 (-84 dBc), HD3 (-80 dBc), HD5 (-91 dBc) + thermal noise + 12-bit quantisation
      const vIdeal =
        amp * Math.sin(phi) +
        amp * 6.3e-5 * Math.sin(2 * phi + 0.4) +
        amp * 1.0e-4 * Math.sin(3 * phi - 0.7) +
        amp * 2.8e-5 * Math.sin(5 * phi + 1.1) +
        (lsb * 0.18) * nextGaussian(rng);
      const vQuant = Math.round(vIdeal / lsb) * lsb;
      const cmRipple = 0.015 * Math.sin(2 * Math.PI * 1.2e6 * ti);
      voutp[i] = vcm + cmRipple + 0.5 * vQuant;
      voutn[i] = vcm + cmRipple - 0.5 * vQuant;
    }

    return {
      id: `preset-${presetId}`,
      name: 'adc_12bit_coherent_diff.csv',
      format: 'preset',
      rows: n,
      columns: [
        colInfo(0, 'time', 's', t, true),
        colInfo(1, 'voutp', 'V', voutp),
        colInfo(2, 'voutn', 'V', voutn),
      ],
      data: [t, voutp, voutn],
      defaultTimeCol: 0,
      defaultSigACol: 1,
      defaultSigBCol: 2,
      defaultKind: 'diff',
      defaultFs: fs,
      defaultFullScale: fsVpp,
      defaultBits: 12,
      defaultBand: null,
      notes: 'Coherent 12-bit differential ADC (fs = 100 MS/s, N = 8192, M = 1753 cycles)',
    };
  }

  if (presetId === 'non-coherent') {
    // Non-integer cycles (M = 437.37) to illustrate spectral leakage & window selection
    const n = 4096;
    const fs = 48e3;
    const f0 = (437.37 / n) * fs; // ~5.125 kHz
    const fsVpp = 2.0;
    const amp = 0.891 * (fsVpp / 2); // -1.0 dBFS

    const t = new Float64Array(n);
    const vout = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const ti = i / fs;
      t[i] = ti;
      const phi = 2 * Math.PI * f0 * ti;
      vout[i] =
        amp * Math.sin(phi) +
        amp * 1.8e-4 * Math.sin(2 * phi) +
        amp * 3.2e-4 * Math.sin(3 * phi) +
        1.5e-5 * nextGaussian(rng);
    }

    return {
      id: `preset-${presetId}`,
      name: 'audio_noncoherent_48k.csv',
      format: 'preset',
      rows: n,
      columns: [colInfo(0, 'time', 's', t, true), colInfo(1, 'vout', 'V', vout)],
      data: [t, vout],
      defaultTimeCol: 0,
      defaultSigACol: 1,
      defaultSigBCol: null,
      defaultKind: 'single',
      defaultFs: fs,
      defaultFullScale: fsVpp,
      defaultBits: 14,
      defaultBand: null,
      notes: 'Non-coherent sine (437.37 cycles in 4096 samples at 48 kS/s)',
    };
  }

  if (presetId === 'variable-step') {
    // Variable-step SPICE transient simulation with adaptive solver dt
    const n = 4096;
    const fsNom = 10e6;
    const dtNom = 1 / fsNom;
    const f0 = 317e3;
    const fsVpp = 1.8;
    const amp = 0.85 * (fsVpp / 2);

    const t = new Float64Array(n);
    const vout = new Float64Array(n);
    let curT = 0;
    for (let i = 0; i < n; i++) {
      t[i] = curT;
      const phi = 2 * Math.PI * f0 * curT;
      vout[i] =
        amp * Math.sin(phi) +
        amp * 4e-4 * Math.sin(2 * phi) +
        amp * 7e-4 * Math.sin(3 * phi) +
        4e-5 * nextGaussian(rng);
      // Adaptive simulator time step varying between 0.65x and 1.35x nominal dt
      curT += dtNom * (0.65 + 0.7 * rng());
    }

    return {
      id: `preset-${presetId}`,
      name: 'spice_transient_varstep.csv',
      format: 'preset',
      rows: n,
      columns: [colInfo(0, 'time', 's', t, true), colInfo(1, 'V(out)', 'V', vout)],
      data: [t, vout],
      defaultTimeCol: 0,
      defaultSigACol: 1,
      defaultSigBCol: null,
      defaultKind: 'single',
      defaultFs: fsNom,
      defaultFullScale: fsVpp,
      defaultBits: 12,
      defaultBand: null,
      notes: 'Variable-step transient output (demonstrates automatic resampling & error bound)',
    };
  }

  if (presetId === 'delta-sigma') {
    // Behavioural 2nd-order 1-bit CIFB Delta-Sigma modulator, OSR = 64, N = 16384, fs = 10.24 MHz
    const n = 16384;
    const fs = 10.24e6;
    const osr = 64;
    const bw = fs / (2 * osr); // 80 kHz
    const m = 31; // coherent prime in-band (~19.375 kHz)
    const f0 = (m / n) * fs;
    const amp = 0.5; // -6 dBFS (stable 1-bit modulator drive)

    const t = new Float64Array(n);
    const code = new Float64Array(n);
    let x1 = 0;
    let x2 = 0;
    let yPrev = 0;
    // Settle for 128 samples first
    for (let i = -128; i < n; i++) {
      const ti = i / fs;
      const u = amp * Math.sin(2 * Math.PI * f0 * ti) + 3e-5 * nextGaussian(rng);
      x1 = x1 + (u - yPrev);
      x2 = x2 + (x1 - 2 * yPrev);
      const y = x2 >= 0 ? 1 : -1;
      yPrev = y;
      if (i >= 0) {
        t[i] = ti;
        code[i] = y;
      }
    }

    return {
      id: `preset-${presetId}`,
      name: 'deltasigma_2nd_order_osr64.csv',
      format: 'preset',
      rows: n,
      columns: [colInfo(0, 'time', 's', t, true), colInfo(1, 'dout', 'code', code)],
      data: [t, code],
      defaultTimeCol: 0,
      defaultSigACol: 1,
      defaultSigBCol: null,
      defaultKind: 'single',
      defaultFs: fs,
      defaultFullScale: 2.0,
      defaultBits: null,
      defaultBand: [0, bw],
      notes: '2nd-order 1-bit ΔΣ modulator (fs = 10.24 MHz, OSR = 64, BW = 80 kHz)',
    };
  }

  if (presetId === 'two-tone') {
    // Two-tone IMD2 / IMD3 / OIP3 amplifier test
    const n = 8192;
    const fs = 100e6;
    const m1 = 919; // ~11.218 MHz
    const m2 = 967; // ~11.804 MHz
    const f1 = (m1 / n) * fs;
    const f2 = (m2 / n) * fs;
    const fsVpp = 2.0;
    const a = 0.45; // each tone ~ -6.9 dBFS

    const t = new Float64Array(n);
    const vout = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const ti = i / fs;
      t[i] = ti;
      const x = a * Math.sin(2 * Math.PI * f1 * ti) + a * Math.sin(2 * Math.PI * f2 * ti);
      // Weak cubic + quadratic memoryless nonlinearity: y = x + 3e-4 x^2 - 1.4e-3 x^3
      vout[i] = x + 3e-4 * x * x - 1.4e-3 * x * x * x + 1.2e-5 * nextGaussian(rng);
    }

    return {
      id: `preset-${presetId}`,
      name: 'amplifier_two_tone_imd.csv',
      format: 'preset',
      rows: n,
      columns: [colInfo(0, 'time', 's', t, true), colInfo(1, 'vout', 'V', vout)],
      data: [t, vout],
      defaultTimeCol: 0,
      defaultSigACol: 1,
      defaultSigBCol: null,
      defaultKind: 'single',
      defaultFs: fs,
      defaultFullScale: fsVpp,
      defaultBits: null,
      defaultBand: null,
      defaultTwoTone: true,
      notes: 'Two-tone linearity test (f1 = 11.22 MHz, f2 = 11.80 MHz, IMD2/IMD3/OIP3)',
    };
  }

  // interleaved-4ch: 4-channel time-interleaved ADC with offset, gain, and timing skew mismatches
  const n = 8192;
  const fs = 400e6;
  const m = 613;
  const f0 = (m / n) * fs;
  const fsVpp = 2.0;
  const amp = 0.9 * (fsVpp / 2);
  const offsets = [0.0, 0.0012, -0.0009, 0.0005];
  const gains = [1.0, 1.0018, 0.9987, 1.0006];
  const skews = [0, 1.8e-12, -1.5e-12, 0.9e-12];

  const t = new Float64Array(n);
  const vout = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ch = i & 3;
    const ti = i / fs;
    t[i] = ti;
    const tSample = ti + skews[ch];
    const sig = gains[ch] * amp * Math.sin(2 * Math.PI * f0 * tSample) + offsets[ch];
    vout[i] = sig + 3e-5 * nextGaussian(rng);
  }

  return {
    id: `preset-${presetId}`,
    name: 'ti_adc_4ch_mismatches.csv',
    format: 'preset',
    rows: n,
    columns: [colInfo(0, 'time', 's', t, true), colInfo(1, 'vout', 'V', vout)],
    data: [t, vout],
    defaultTimeCol: 0,
    defaultSigACol: 1,
    defaultSigBCol: null,
    defaultKind: 'single',
    defaultFs: fs,
    defaultFullScale: fsVpp,
    defaultBits: 12,
    defaultBand: null,
    defaultInterleaveChannels: 4,
    notes: '4-channel time-interleaved ADC with offset, gain & timing skew spurs',
  };
}
