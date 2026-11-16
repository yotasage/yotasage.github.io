// The EM simulation page's links from result numbers to their equations (step M4.3a), in the first load (no KaTeX, no
// registry): which number of the Trace and Via results opens which entry of lib/emsim/equations.ts (`traceEq`,
// `viaEq`: the entry and the symbol the number is), the one open request of the page (`openEq`, `useEqRequest`: one
// panel at a time, beside the results it belongs to), the number as a button (`EqNum`) and what the panel cites from
// (`EqEnv`: the page's references and, once the theory has loaded, its Bibliography). The panel itself is
// EqPanel.tsx, loaded by import() when a number is first opened.

import React, { createContext, useSyncExternalStore } from 'react';

import type { BibEntry } from '../../lib/bibtex';
import type Bibliography from '../Bibliography';
import css from '../../styles/EmSimTrace.module.css';

/** A registry entry and the symbol a number is (the entry's own or one of its `where`); `mode` for eeff-mode. */
export interface EqTarget { id: string; sym: string; mode?: number }

const T = (id: string, sym: string, mode?: number): EqTarget => ({ id, sym, mode });

/** The Trace results' numbers with an equation, by their data-q name, for a result of n signals. */
export function traceEq(name: string, n: number): EqTarget | null {
  if (n === 1) {
    switch (name) {
      case 'z0': case 'Zc.1.1': return T('z0-lc', 'Z_0');
      case 'eeff': return T('eeff-c', 'varepsilon_eff');
      case 'delay': return T('delay-lc', 'tau');
      case 'L.1.1': return T('l-c0', 'L');
      default: return null;
    }
  }
  if (n !== 2) return null;
  switch (name) {
    case 'zdiff': return T('zdd-zc', 'Z_diff');
    case 'zcm': return T('zcc-zc', 'Z_cm');
    case 'zodd': return T('zodd-sym', 'Z_odd');
    case 'zeven': return T('zeven-sym', 'Z_even');
    case 'zdc': return T('zdc-zc', 'Z_dc');
    case 'zdiffB': return T('zdiff-b', 'Z_diffB');
    case 'zcmB': return T('zdiff-b', 'Z_cmB');
    case 'ztdr': return T('ztdr', 'Z_TDR');
    case 'kb': return T('kb', 'k_b');
    case 'kf': return T('kf', 'k_f');
    default: {
      const m = /^mode(\d)\.eeff$/.exec(name);
      return m ? T('eeff-mode', 'varepsilon_effm', Number(m[1]) - 1) : null;
    }
  }
}

/**
 * The Via results' numbers with an equation, by name, for a via (n 1) or a pair (n 2): `piece.<k>.z` and
 * `piece.<k>.delay` (k an index into the model's pieces), `stub.<side>` (the bare quarter-wave frequency).
 */
export function viaEq(name: string, n: number): EqTarget | null {
  switch (name) {
    case 'barrel-z': return n === 1 ? T('via-barrel-z', 'Z_i') : null;
    case 'section-z': return n === 1 ? T('via-section-z', 'Z_sec') : null;
    case 'section-zdiff': return n === 2 ? T('via-section-pair', 'Z_diffsec') : null;
    case 'section-zcm': return n === 2 ? T('via-section-pair', 'Z_cmsec') : null;
    case 'delay': return n === 1 ? T('via-section-delay', 'tau_sec') : T('via-section-pair', 'tau_sec');
    case 'L': return T('via-section-l', 'L_sec');
    case 'C': return T('via-section-c', 'C_sec');
    case 'dcsum': return T('via-dc', 'Delta_Csum');
    case 'valid': return T('lambda8', 'f_valid');
    case 'band': return T('edge-band', 'f_band');
    default:
      if (name.startsWith('stub.')) return T('stub-quarter', 'f_stub');
      if (n === 1 && /^piece\.\d+\.z$/.test(name)) return T('via-barrel-z', 'Z_i');
      if (/^piece\.\d+\.delay$/.test(name)) return T('via-barrel-delay', 'tau_i');
      return null;
  }
}

/** The barrel's core: the longest piece between the signal layers (the Via results' "Barrel Z"). */
export function coreIndex(pieces: readonly { part: string; zTop: number; zBot: number }[]): number {
  let best = -1;
  pieces.forEach((p, i) => {
    if (p.part !== 'through') return;
    if (best < 0 || p.zTop - p.zBot > pieces[best].zTop - pieces[best].zBot) best = i;
  });
  return Math.max(0, best);
}

export interface EqRequest {
  section: 'trace' | 'via';
  /** The number's name (traceEq, viaEq). */
  name: string;
  /** Its label in the results, for the panel's heading. */
  label: string;
  /** Gets the focus back when the panel closes. */
  from: HTMLElement | null;
  /** Counts the openings (a new one takes the focus). */
  n: number;
}

let current: EqRequest | null = null;
let count = 0;
const subs = new Set<() => void>();
const emit = () => { for (const f of subs) f(); };

export function openEq(section: EqRequest['section'], name: string, label: string, from: HTMLElement | null): void {
  current = { section, name, label, from, n: ++count };
  emit();
}

/** Closes the panel and gives the focus back to the number that opened it. */
export function closeEq(): void {
  const from = current?.from;
  current = null;
  emit();
  if (from?.isConnected) from.focus();
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const get = () => current;
const none = () => null;

export function useEqRequest(): EqRequest | null {
  return useSyncExternalStore(subscribe, get, none);
}

export const EqEnv = createContext<{ references: readonly BibEntry[]; bib: Bibliography | null }>({ references: [], bib: null });

/**
 * A result number that opens its equation: the number as the results print it, underlined; `v` (SI) and `scale` (to
 * the shown unit) for the harness. `label` names it for screen readers and the panel.
 */
export function EqNum({ section, name, label, text, v, scale = 1, className }: { section: EqRequest['section']; name: string; label: string; text: string; v: number; scale?: number; className?: string }) {
  const q = useEqRequest();
  const on = q !== null && q.section === section && q.name === name;
  return (
    <button type="button" className={`${css.eqNum}${className ? ` ${className}` : ''}`} data-eq-open={name} data-eq-section={section} data-v={v} data-scale={scale}
      aria-expanded={on} aria-label={`${label} ${text}: show its equation`} onClick={(e) => openEq(section, name, label, e.currentTarget)}>
      {text}
    </button>
  );
}

/** The results and, while one of their numbers is open, the panel beside them (below them on a narrow screen). */
export function EqLayout({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className={css.eqBox}>
      <div className={css.eqGrid} data-eq-layout={open ? 'open' : 'closed'}>{children}</div>
    </div>
  );
}
