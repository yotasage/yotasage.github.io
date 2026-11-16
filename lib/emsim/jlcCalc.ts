// "As JLCPCB's calculator" (step M2.3b): the inputs JLCPCB's online impedance calculator sends to Polar Si9000, read
// from its own requests on 2026-11-16 (docs/em-sim/notes-M1.4c.md, facts-cases.md "Differences explained"): Er1 4.3
// for the prepreg between a signal and its plane (4.3 in every request seen, whatever εr the page lists for the
// material), T1 1.6 mil for outer "1oz" copper (½ oz base plated), a top 0.5 mil narrower than the base (0.25 mil per
// side), solder mask C1 1.0 mil on laminate, C2 0.6 mil over copper, C3 1.0 mil between traces, CEr 3.8. The stackup
// presets keep JLCPCB's published guide values; this is a named variant of any setup, applied part by part so the page
// can show what each input does. Framework-free.
//
// Not read, so kept as they are: cores (every request seen had a prepreg under the signal), inner copper layers (no
// stripline request was read), outer copper other than 1 oz finished (the calculator's 1 oz base inputs, T1 2.2 and
// 1.0 mil, belong to "2oz" outer copper, which was not requested). Each kept part is named in `kept`.

import { MIL, presetSrc } from './presets';
import { cloneStackup, isOuter, sameStackup } from './stackup';
import type { CopperLayer, DielectricLayer, MaskLayer, Source, Stackup, Val } from './stackup';
import type { Setup } from './setup';

export const JLC_CALC_REF = 'S';
export const JLC_CALC_DATE = '2026-11-16';
// JLCPCB's calculator inputs in mm (εr plain).
export const JLC_CALC = { er: 4.3, t: 1.6 * MIL, etch: 0.25 * MIL, c1: 1.0 * MIL, c2: 0.6 * MIL, c3: 1.0 * MIL, cer: 3.8 } as const;

export type JlcPart = 'er' | 'copper' | 'etch' | 'mask';
export const JLC_PARTS: readonly JlcPart[] = ['er', 'copper', 'etch', 'mask'];
export const JLC_PART_LABEL: Readonly<Record<JlcPart, string>> = {
  er: 'εr 4.3 for every prepreg',
  copper: 'outer copper 1.6 mil thick',
  etch: 'top 0.5 mil narrower than the base',
  mask: 'solder mask 1.0 mil on the board, 0.6 mil on copper, εr 3.8',
};

// Outer copper the calculator's T1 1.6 mil stands for: "1oz" finished (½ oz base plated), 0.035 mm ± 0.01.
const isOuter1oz = (c: CopperLayer): boolean => Math.abs(c.t.v - 0.035) <= 0.01;

export interface JlcVariant {
  setup: Setup;
  changed: string[]; // where a value changed ("L1 thickness", "P1 εr", …)
  kept: string[]; // what the calculator's inputs do not cover here, in words
}

const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b));

// The setup with JLCPCB's calculator inputs for the chosen parts (all by default). The trace and via are kept; the
// stackup is a copy (the argument is not changed); a value already equal to the calculator's keeps its source.
export function asJlcpcbCalculator(setup: Setup, parts: readonly JlcPart[] = JLC_PARTS): JlcVariant {
  const s: Stackup = cloneStackup(setup.stackup);
  const src: Source = presetSrc(s.id, JLC_CALC_REF, JLC_CALC_DATE);
  const nv = (x: number): Val => ({ v: x, tol: null, src });
  const changed: string[] = [];
  const kept = new Set<string>();
  const set = <T extends object>(o: T, k: keyof T, x: number, where: string): void => {
    const cur = o[k] as unknown as Val;
    if (cur && near(cur.v, x)) return;
    (o as Record<string, unknown>)[k as string] = nv(x);
    changed.push(where);
  };
  const want = new Set(parts);
  let masks = 0;
  s.layers.forEach((l, i) => {
    if (l.kind === 'dielectric') {
      const d = l as DielectricLayer;
      if (!want.has('er')) return;
      if (d.role === 'prepreg') set(d, 'er', JLC_CALC.er, `${d.id} εr`);
      else kept.add('Cores keep their εr: every request read had a prepreg between the signal and its plane.');
    } else if (l.kind === 'copper') {
      const c = l as CopperLayer;
      const outer = isOuter(s, i);
      if (!want.has('copper') && !want.has('etch')) return;
      if (!outer) { kept.add('Inner copper keeps its thickness and etch: no stripline request of the calculator was read.'); return; }
      if (!isOuter1oz(c)) { kept.add(`${c.id} (${c.t.v.toPrecision(3)} mm) keeps its thickness and etch: the calculator's inputs were read for 1 oz outer copper only.`); return; }
      if (want.has('copper') && !near(c.t.v, JLC_CALC.t)) {
        c.t = nv(JLC_CALC.t); c.base = null; c.plating = null;
        changed.push(`${c.id} thickness`);
      }
      if (want.has('etch') && !(c.etch.kind === 'offset' && near(c.etch.side.v, JLC_CALC.etch))) {
        c.etch = { kind: 'offset', side: nv(JLC_CALC.etch) };
        changed.push(`${c.id} etch`);
      }
    } else if (l.kind === 'mask') {
      masks += 1;
      if (!want.has('mask')) return;
      const m = l as MaskLayer;
      set(m, 'er', JLC_CALC.cer, `${m.id} εr`);
      set(m, 'onLaminate', JLC_CALC.c1, `${m.id} on laminate`);
      set(m, 'onCopper', JLC_CALC.c2, `${m.id} over copper`);
      set(m, 'between', JLC_CALC.c3, `${m.id} between traces`);
    }
  });
  if (want.has('mask') && masks === 0) kept.add('The stackup has no solder mask; the calculator covers outer traces with it.');
  return { setup: { ...setup, stackup: changed.length ? s : setup.stackup }, changed, kept: [...kept] };
}

// True when the setup already has every calculator input this helper sets.
export function isJlcpcbCalculator(setup: Setup): boolean {
  return asJlcpcbCalculator(setup).changed.length === 0;
}

// The parts that change something on this setup (for the one-at-a-time breakdown).
export function jlcPartsThatChange(setup: Setup): JlcPart[] {
  return JLC_PARTS.filter((p) => asJlcpcbCalculator(setup, [p]).changed.length > 0);
}

// The calculator's inputs except one part: the breakdown's "from JLCPCB's inputs, this one as the stackup has it".
export function jlcAllBut(setup: Setup, part: JlcPart): Setup {
  return asJlcpcbCalculator(setup, JLC_PARTS.filter((p) => p !== part)).setup;
}

// ---- what JLCPCB's calculator states for the owner's cases (facts-cases.md C39, C41; notes-M1.4c.md) ----

export interface JlcStated {
  case: 'C39' | 'C41';
  key: 'z0' | 'zdiff';
  target: number; // Ω, what the calculator is asked for and states
  at: string; // the width (and gap) it gives, as it shows them
  si: number; // Si9000's own value where its width search stopped
  siAt: string;
}

const STATED: readonly (JlcStated & { kind: string; w: number[]; s: number[] | null })[] = [
  { case: 'C39', key: 'z0', target: 50, at: '5.42 mil', si: 49.958, siAt: '5.421875 mil', kind: 'microstrip', w: [5.42], s: null },
  { case: 'C41', key: 'zdiff', target: 100, at: '4.36 / 8 mil', si: 99.951, siAt: '4.35625 / 8 mil', kind: 'pair-microstrip', w: [4.33, 4.36], s: [7.87, 8] },
];
export const JLC_STATED_PRESET = 'JLC061611-3313A';

// JLCPCB's stated number when the setup is one of the owner's cases: the JLC061611-3313A stackup as the preset has it
// (`preset`, from presetStackup) or with the calculator's inputs, L1 over L2 with mask, at the width (and gap) JLCPCB
// gave or the drawn one it kept (C41: 4.33 / 7.87 mil = 0.11 / 0.2 mm). Null otherwise.
export function jlcpcbStated(setup: Setup, preset: Stackup | null): JlcStated | null {
  const st = setup.stackup, tr = setup.trace;
  if (!preset || st.id !== JLC_STATED_PRESET) return null;
  if (!sameStackup(st, preset) && !sameStackup(st, asJlcpcbCalculator({ ...setup, stackup: preset }).setup.stackup)) return null;
  if (tr.layer !== 'L1' || tr.below !== 'L2' || tr.above || !tr.masked) return null;
  const isAt = (x: number, list: number[]) => list.some((m) => Math.abs(x / MIL - m) <= 0.02);
  for (const c of STATED) {
    if (tr.kind !== c.kind || !isAt(tr.w.v, c.w)) continue;
    if (c.s && !isAt(tr.s.v, c.s)) continue;
    const { kind: _k, w: _w, s: _s, ...out } = c;
    return out;
  }
  return null;
}
