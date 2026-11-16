// TeX printer of the shared equation engine (rules of Smith chart step M0.3, learning.md §1): brackets from
// precedence, \frac for division, \cdot only before a number (j before a number is juxtaposed: j2), a negation right of
// + or − or as a later factor bracketed, \left(\right) only around a fraction, multi-letter names upright, Greek by name.

import type { Node } from './parse';
import { cabs } from '../complex';
import { formatAmount } from '../quantity';

/** A printed piece: its TeX and what the printer needs to know to place it. */
export interface TexPiece {
  s: string;
  /** Binding strength as in the text: 1 a sum (or a complex value a + jb), 3 a negation, 5 an atom. */
  p: number;
  /** Holds a \frac (so brackets around it are \left(\right)). */
  tall?: boolean;
  /** Starts with a digit (a \cdot goes before it in a product). */
  digit?: boolean;
  /** A function application (bracketed as the base of a power). */
  fn?: boolean;
  /** Already bracketed. */
  w?: boolean;
  /** A product of plain atoms (a function argument without brackets: \tan βℓ). */
  sp?: boolean;
}

export interface TexOptions {
  /** The live value of a variable as TeX (see `valueTex`), or undefined to print its symbol. */
  value?: (name: string) => TexPiece | undefined;
  /** Decorates a printed symbol, e.g. with \textcolor for highlighting (learning.md §2). */
  variable?: (name: string, tex: string) => string;
}

const GREEK = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'eta', 'theta', 'lambda', 'mu', 'pi', 'rho', 'sigma',
  'tau', 'phi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Phi', 'Psi', 'Omega', 'ell',
]);

function namePart(v: string, sub: boolean): string {
  if (GREEK.has(v)) return `\\${v}`;
  if (v.length === 1 || /^\d+$/.test(v)) return v;
  return sub || v.length > 1 ? `\\mathrm{${v}}` : v;
}

const idCache = new Map<string, string>();

/** The TeX of a name: `Gamma_r` → `\Gamma_{r}`, `Z_in` → `Z_{\mathrm{in}}`, `VSWR` → `\mathrm{VSWR}`. */
export function nameTex(v: string): string {
  let s = idCache.get(v);
  if (s === undefined) {
    const u = v.indexOf('_');
    s = u < 0 ? namePart(v, false) : `${namePart(v.slice(0, u), false)}_{${namePart(v.slice(u + 1), true)}}`;
    idCache.set(v, s);
  }
  return s;
}

/** A number as written (`1e-9` → `1 \times 10^{-9}`); `−` and `∞` as TeX. */
function numberTex(s: string): string {
  s = s.replace('−', '-');
  if (s.includes('∞')) return s.replace('∞', '\\infty');
  if (s.includes('–')) return '\\text{--}';
  const e = s.indexOf('e');
  if (e < 0) return s;
  const exp = s.slice(e + 1).replace('+', '');
  return `${s.slice(0, e)} \\times 10^{${exp}}`;
}

const piece = (s: string, p: number, tall = false, digit = false): TexPiece => ({ s, p, tall, digit });

function paren(x: TexPiece): TexPiece {
  return { s: x.tall ? `\\left(${x.s}\\right)` : `(${x.s})`, p: 5, tall: x.tall, w: true };
}

const plainAtom = (x: TexPiece): boolean => x.p === 5 && !x.tall && !x.fn && !x.w;

function texOf(n: Node, o: TexOptions): TexPiece {
  switch (n.t) {
    case 'num': return piece(numberTex(n.s), 5, false, true);
    case 'id': {
      if (n.v === 'j') return piece('j', 5);
      if (n.v === 'pi') return piece('\\pi', 5);
      const live = o.value?.(n.v);
      if (live) return live;
      const s = nameTex(n.v);
      return piece(o.variable ? o.variable(n.v, s) : s, 5);
    }
    case 'group': return paren(texOf(n.a, o));
    case 'eq': return piece(n.xs.map((x) => bare(x, o)).join(' = '), 0);
    case 'mat': {
      const rows: string[] = [];
      for (let r = 0; r < n.rows; r++) rows.push(n.xs.slice(r * n.cols, (r + 1) * n.cols).map((x) => bare(x, o)).join(' & '));
      return { s: `\\begin{bmatrix} ${rows.join(' \\\\ ')} \\end{bmatrix}`, p: 5, tall: true, w: true };
    }
    case 'neg': {
      let a = texOf(n.a, o);
      if (a.p <= 1 || a.p === 3) a = paren(a);
      return { s: `-${a.s}`, p: 3, tall: a.tall };
    }
    case 'call': return callTex(n.f, n.a, o);
    case 'op': {
      if (n.op === '/') return piece(`\\frac{${bare(n.a, o)}}{${bare(n.b, o)}}`, 5, true);
      if (n.op === '^') {
        let b = texOf(n.a, o);
        if (!b.w && (b.p < 5 || b.tall || b.fn)) b = paren(b);
        return { s: `${b.s}^{${bare(n.b, o)}}`, p: 4, tall: b.tall, digit: b.digit };
      }
      const a = texOf(n.a, o);
      let b = texOf(n.b, o);
      if (n.op === '*') {
        const l = a.p <= 1 ? paren(a) : a;
        if (b.p <= 1 || b.p === 3) b = paren(b);
        const jNumber = b.digit && n.a.t === 'id' && n.a.v === 'j';
        const sep = jNumber ? '' : b.digit ? ' \\cdot ' : ' ';
        return {
          s: l.s + sep + b.s, p: 2, tall: l.tall || b.tall, digit: l.digit,
          sp: sep !== ' \\cdot ' && (plainAtom(l) || l.sp) && (plainAtom(b) || b.sp),
        };
      }
      if (b.p <= 1 || b.p === 3) b = paren(b);
      return { s: `${a.s} ${n.op} ${b.s}`, p: 1, tall: a.tall || b.tall, digit: a.digit };
    }
  }
}

/** A tree where no bracket is needed (a side, a numerator, an exponent, an argument): a written group unwrapped. */
function bare(n: Node, o: TexOptions): string {
  return texOf(n.t === 'group' ? n.a : n, o).s;
}

const NAMED = new Set(['sin', 'cos', 'tan', 'cot', 'ln', 'arctan', 'arccos']);

function callTex(f: string, arg: Node, o: TexOptions): TexPiece {
  const a = texOf(arg.t === 'group' ? arg.a : arg, o);
  switch (f) {
    case 'abs': return { s: a.tall ? `\\left|${a.s}\\right|` : `|${a.s}|`, p: 5, tall: a.tall, w: true };
    case 'sqrt': return { s: `\\sqrt{${a.s}}`, p: 5, tall: a.tall, fn: true };
    case 'exp': return { s: `e^{${a.s}}`, p: 4 };
    case 'conj': {
      const b = !a.w && (a.p < 5 || a.tall || a.fn) ? paren(a) : a;
      return { s: `${b.s}^{*}`, p: 4, tall: b.tall };
    }
    case 'Re': case 'Im': case 'arg': {
      const b = paren(a);
      return { s: `\\operatorname{${f}}${b.s}`, p: 5, tall: b.tall, fn: true };
    }
    default: {
      const name = f === 'log10' ? '\\log_{10}' : NAMED.has(f) ? `\\${f}` : `\\operatorname{${f}}`;
      const simple = plainAtom(a) || a.sp || (arg.t === 'call' && arg.f === 'abs');
      const b = simple ? a : paren(a);
      return { s: simple ? `${name} ${b.s}` : `${name}${b.s}`, p: 5, tall: b.tall, fn: true };
    }
  }
}

/** The TeX of a tree. With `options.value`, variables are replaced by their live values (the "numbers" line). */
export function tex(n: Node, options: TexOptions = {}): string {
  return bare(n, options);
}

/** A side that starts with a minus sign, braced so that "{}= -x" does not read as a binary minus. */
const signed = (s: string): string => (s.startsWith('-') ? `{${s}}` : s);

/**
 * The substitution lines of an equation whose left side is one symbol with a value (x = X/Z0 = −1/(ωCZ0)), as the
 * Theory section (M3.5c) and the equation panel (M5.1) print them: each member on the right with the values put in,
 * one per line, then the left side's value; members without a symbol (nothing to put in) and repeats are left out.
 * `lhs` and `rhs` are the symbolic sides (decorated by `variable`, e.g. with colours). Null when the left side is not
 * a single symbol with a value.
 */
export function substitutions(
  tree: Node, values: Readonly<Record<string, TexPiece | undefined>>, variable?: TexOptions['variable'],
): { lhs: string; rhs: string; lines: string[] } | null {
  if (tree.t !== 'eq' || tree.xs[0].t !== 'id') return null;
  const result = values[tree.xs[0].v];
  if (!result) return null;
  const value = { value: (name: string) => values[name] };
  const lines: string[] = [];
  for (const x of tree.xs.slice(1)) {
    const s = signed(tex(x, value));
    if (s !== signed(tex(x)) && s !== lines[lines.length - 1]) lines.push(s);
  }
  const last = signed(result.s);
  if (lines[lines.length - 1] !== last) lines.push(last);
  const deco = { variable };
  return { lhs: tex(tree.xs[0], deco), rhs: tree.xs.slice(1).map((x) => signed(tex(x, deco))).join(' = '), lines };
}

function unitTex(u: string): string {
  let s = '', run = '';
  const flush = (): void => { if (run) { s += `\\mathrm{${run}}`; run = ''; } };
  for (const ch of u) {
    if (ch === 'Ω') { flush(); s += '\\Omega'; }
    else if (ch === 'µ' || ch === 'μ') { flush(); s += '\\mu'; }
    else if (ch === '°') { flush(); s += '^{\\circ}'; }
    else if (ch === '%') { flush(); s += '\\%'; }
    else run += ch;
  }
  flush();
  return s;
}

/** A real amount as TeX through lib/quantity.ts: number, thin space, prefix and unit. */
function amountTex(v: number, unit: string, digits: number): { num: string; unit: string } {
  const text = formatAmount(v, unit, digits);
  const sp = text.indexOf(' ');
  return sp < 0 ? { num: numberTex(text), unit: '' } : { num: numberTex(text.slice(0, sp)), unit: unitTex(text.slice(sp + 1)) };
}

const joinUnit = (a: { num: string; unit: string }): string => (a.unit ? `${a.num}\\,${a.unit}` : a.num);

/**
 * A live value as a TeX piece, the engineering way: `25`, `-3`, `j0.5`, `25 + j25` (bracketed by the printer when
 * multiplied or raised), `(25 - j25)\,\Omega` when both parts share a unit and prefix, or polar `0.447\angle 116.6^{\circ}`.
 */
export function valueTex(re: number, im = 0, unit = '', digits = 4, polar = false): TexPiece {
  if (polar) {
    const m = amountTex(cabs(re, im), unit, digits);
    const deg = amountTex((Math.atan2(im, re) * 180) / Math.PI, '', digits);
    return piece(`${joinUnit(m)}\\angle ${deg.num}^{\\circ}`, 1, false, true);
  }
  if (im === 0 || re !== re) {
    const a = amountTex(re, unit, digits);
    const neg = a.num.startsWith('-');
    return piece(joinUnit(a), neg ? 3 : 5, false, !neg);
  }
  const i = amountTex(Math.abs(im), unit, digits);
  if (re === 0) return piece(`${im < 0 ? '-' : ''}j${joinUnit(i)}`, im < 0 ? 3 : 5);
  const r = amountTex(re, unit, digits);
  const sign = im < 0 ? '-' : '+';
  if (r.unit && r.unit === i.unit) return { s: `(${r.num} ${sign} j${i.num})\\,${r.unit}`, p: 5, w: true, digit: false };
  return piece(`${joinUnit(r)} ${sign} j${joinUnit(i)}`, 1, false, !r.num.startsWith('-'));
}
