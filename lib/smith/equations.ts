// The equations the Smith chart tool shows (learning.md §1, decision D5): each is written as short text, parsed into
// a tree when this module loads, printed as TeX for KaTeX by one printer and computed on complex numbers by one
// evaluator. The engine (convert, parts, network, geometry) never uses these trees: they are for display, and the
// harness (scripts/harness/smith/check-equations.mjs) evaluates every entry and every derivation step against the
// engine on random points. This module does not import KaTeX; the page renders the TeX through KatexSpan.
//
// Grammar: numbers (`2`, `0.5`, `1e-9`), names (`x`, `Z_0`, `Gamma_r`, `Z_in`; Greek letters by name; `j` the
// imaginary unit and `pi` constants), `+ - * / ^`, unary minus binding like a product (`-2*x/y` is −(2x/y)), calls of
// the functions in FUNCTIONS, matrices `[a, b; c, d]` and `=` chains at the top. Division is left-associative and `^`
// right-associative. A bracket the text writes around a sum or difference is kept in the tree (a `group`), so a
// derivation step shows the grouping it is about; brackets around anything else are dropped.

import { cabs, cdiv, csqrt } from './complex';
import { formatAmount } from '../quantity';

// ---------------------------------------------------------------------------------------------------------------
// Trees

export type Node =
  | { t: 'num'; v: number; s: string }
  | { t: 'id'; v: string }
  | { t: 'group'; a: Node }
  | { t: 'neg'; a: Node }
  | { t: 'op'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { t: 'call'; f: string; a: Node }
  | { t: 'mat'; rows: number; cols: number; xs: Node[] }
  | { t: 'eq'; xs: Node[] };

/** The functions a call may name. */
export const FUNCTIONS: ReadonlySet<string> = new Set([
  'abs', 'sqrt', 'exp', 'conj', 'ln', 'log10', 'sin', 'cos', 'tan', 'cot', 'arctan', 'Re', 'Im', 'arg',
]);

/** Names that are constants, never variables. */
export const CONSTANTS: ReadonlySet<string> = new Set(['j', 'pi']);

const BIN: Readonly<Record<string, number>> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };

interface Token { k: string; v: string }

const isDigit = (c: number): boolean => c >= 48 && c <= 57;
const isAlpha = (c: number): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);

function tokenize(s: string): Token[] {
  const out: Token[] = [];
  const n = s.length;
  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 32) { i++; continue; }
    if (isDigit(c)) {
      let k = i + 1;
      while (k < n && isDigit(s.charCodeAt(k))) k++;
      if (s[k] === '.' && isDigit(s.charCodeAt(k + 1))) { k += 2; while (k < n && isDigit(s.charCodeAt(k))) k++; }
      if (s[k] === 'e') {
        const sign = s[k + 1] === '-' || s[k + 1] === '+' ? 1 : 0;
        if (isDigit(s.charCodeAt(k + 1 + sign))) { k += 2 + sign; while (k < n && isDigit(s.charCodeAt(k))) k++; }
      }
      out.push({ k: 'num', v: s.slice(i, k) });
      i = k;
    } else if (isAlpha(c)) {
      let k = i + 1;
      while (k < n && (isAlpha(s.charCodeAt(k)) || isDigit(s.charCodeAt(k)))) k++;
      if (s[k] === '_') {
        const start = ++k;
        while (k < n && (isAlpha(s.charCodeAt(k)) || isDigit(s.charCodeAt(k)))) k++;
        if (k === start) throw new Error(`empty subscript at ${start} in "${s}"`);
      }
      out.push({ k: 'id', v: s.slice(i, k) });
      i = k;
    } else if ('+-*/^()[],;='.includes(s[i])) {
      out.push({ k: s[i], v: s[i] });
      i++;
    } else throw new Error(`unexpected "${s[i]}" at ${i} in "${s}"`);
  }
  return out;
}

/** Parses equation text into a tree (an `eq` node for an `=` chain). Throws on an error, naming the place. */
export function parse(text: string): Node {
  const ts = tokenize(text);
  let p = 0;
  const peek = (): string => (p < ts.length ? ts[p].k : '');
  const fail = (what: string): never => { throw new Error(`${what} at token ${p} of "${text}"`); };
  const expect = (k: string): void => { if (peek() !== k) fail(`expected "${k}"`); p++; };

  function prim(): Node {
    if (p >= ts.length) fail('unexpected end');
    const t = ts[p++];
    switch (t.k) {
      case 'num': return { t: 'num', v: Number(t.v), s: t.v };
      case 'id':
        if (peek() === '(') {
          if (!FUNCTIONS.has(t.v)) fail(`unknown function "${t.v}"`);
          p++;
          const a = expr(0);
          expect(')');
          return { t: 'call', f: t.v, a };
        }
        return { t: 'id', v: t.v };
      case '(': {
        const a = expr(0);
        expect(')');
        return a.t === 'op' && (a.op === '+' || a.op === '-') ? { t: 'group', a } : a;
      }
      case '-': return { t: 'neg', a: expr(2) };
      case '[': {
        const xs: Node[] = [];
        let cols = 0, col = 0, rows = 1;
        for (;;) {
          xs.push(expr(0));
          col++;
          const k = peek();
          p++;
          if (k === ',') continue;
          if (cols === 0) cols = col; else if (col !== cols) fail('rows of different length');
          col = 0;
          if (k === ';') { rows++; continue; }
          if (k === ']') break;
          p--;
          fail('expected "," ";" or "]"');
        }
        return { t: 'mat', rows, cols, xs };
      }
    }
    return fail(`unexpected "${t.v}"`);
  }

  function expr(min: number): Node {
    let a = prim();
    for (;;) {
      const op = peek(), pr = BIN[op];
      if (!pr || pr < min) return a;
      p++;
      const b = expr(op === '^' ? pr : pr + 1);
      a = { t: 'op', op: op as '+' | '-' | '*' | '/' | '^', a, b };
    }
  }

  const xs = [expr(0)];
  while (peek() === '=') { p++; xs.push(expr(0)); }
  if (p !== ts.length) fail('trailing input');
  return xs.length > 1 ? { t: 'eq', xs } : xs[0];
}

/** Binding strength in the text: sums 1, products 2, negation 3, powers 4, atoms 5, an `=` chain 0. */
function prec(n: Node): number {
  switch (n.t) {
    case 'op': return BIN[n.op];
    case 'neg': return 3;
    case 'eq': return 0;
    default: return 5;
  }
}

/** Prints a tree back as equation text with the fewest brackets that parse to the same tree. */
export function toText(n: Node): string {
  switch (n.t) {
    case 'num': return n.s;
    case 'id': return n.v;
    case 'group': return `(${toText(n.a)})`;
    case 'call': return `${n.f}(${toText(n.a)})`;
    case 'eq': return n.xs.map(toText).join(' = ');
    case 'mat': {
      const rows: string[] = [];
      for (let r = 0; r < n.rows; r++) rows.push(n.xs.slice(r * n.cols, (r + 1) * n.cols).map(toText).join(', '));
      return `[${rows.join('; ')}]`;
    }
    case 'neg': {
      const a = toText(n.a);
      return n.a.t === 'neg' || prec(n.a) <= 1 ? `-(${a})` : `-${a}`;
    }
    case 'op': {
      const pr = BIN[n.op];
      const pa = prec(n.a), pb = prec(n.b);
      let a = toText(n.a), b = toText(n.b);
      if (pa < pr || (n.a.t === 'neg' && pr > 1) || (n.op === '^' && pa <= 4)) a = `(${a})`;
      if (n.b.t === 'neg' || (n.op === '^' ? pb < 4 : pb <= pr)) b = `(${b})`;
      return pr === 1 ? `${a} ${n.op} ${b}` : `${a}${n.op}${b}`;
    }
  }
}

/** The free variable names of a tree (constants left out), added to `into` in order of first use. */
export function variablesOf(n: Node, into: string[] = []): string[] {
  switch (n.t) {
    case 'id': if (!CONSTANTS.has(n.v) && !into.includes(n.v)) into.push(n.v); break;
    case 'group': case 'neg': case 'call': variablesOf(n.a, into); break;
    case 'op': variablesOf(n.a, into); variablesOf(n.b, into); break;
    case 'mat': case 'eq': for (const x of n.xs) variablesOf(x, into); break;
  }
  return into;
}

// ---------------------------------------------------------------------------------------------------------------
// TeX printer (rules of M0.3, learning.md §1): brackets from precedence, \frac for division, \cdot only before a
// number (j before a number is juxtaposed: j2), a negation right of + or − or as a later factor bracketed,
// \left(\right) only around a fraction, multi-letter names upright, Greek by name.

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

const NAMED = new Set(['sin', 'cos', 'tan', 'cot', 'ln', 'arctan']);

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

// ---------------------------------------------------------------------------------------------------------------
// Evaluator: a tree is compiled once into a list of closures over one register file of (re, im) pairs. Variables
// live in the same file (at `slots`), every value has a fixed place, so a run allocates nothing.

export interface Side { o: number; rows: number; cols: number }

export interface Program {
  /** Registers: (re, im) pairs; a matrix is rows × cols pairs in row order. */
  readonly regs: Float64Array;
  /** Free variable names in order of first use. */
  readonly names: readonly string[];
  /** Where each variable's (re, im) is in `regs`. */
  readonly slots: ReadonlyMap<string, number>;
  /** The value of each side of an `=` chain (one side for an expression). */
  readonly sides: readonly Side[];
  run(): void;
}

interface Val { o: number; rows: number; cols: number }

const LN10 = Math.LN10;

/** Compiles a tree. Throws when shapes do not fit (a matrix where a number belongs, sides of different shapes). */
export function compile(tree: Node): Program {
  let r = new Float64Array(0);
  let top = 0;
  const ops: (() => void)[] = [];
  const consts: number[] = [];
  const constAt = new Map<string, number>();
  const slots = new Map<string, number>();
  const names: string[] = [];
  const alloc = (pairs: number): number => { const o = top; top += 2 * pairs; return o; };
  const scalar = (o: number): Val => ({ o, rows: 1, cols: 1 });
  const isScalar = (v: Val): boolean => v.rows === 1 && v.cols === 1;
  const need = (v: Val, what: string): void => { if (!isScalar(v)) throw new Error(`${what} of a matrix`); };

  function constant(re: number, im: number): Val {
    const key = `${re},${im}`;
    let o = constAt.get(key);
    if (o === undefined) { o = alloc(1); consts.push(o, re, im); constAt.set(key, o); }
    return scalar(o);
  }

  function walk(n: Node): Val {
    switch (n.t) {
      case 'num': return constant(n.v, 0);
      case 'id': {
        if (n.v === 'j') return constant(0, 1);
        if (n.v === 'pi') return constant(Math.PI, 0);
        let o = slots.get(n.v);
        if (o === undefined) { o = alloc(1); slots.set(n.v, o); names.push(n.v); }
        return scalar(o);
      }
      case 'group': return walk(n.a);
      case 'eq': throw new Error('= inside an expression');
      case 'mat': {
        const parts = n.xs.map(walk);
        const o = alloc(n.xs.length);
        parts.forEach((v, k) => {
          need(v, 'an entry');
          const a = v.o, d = o + 2 * k;
          ops.push(() => { r[d] = r[a]; r[d + 1] = r[a + 1]; });
        });
        return { o, rows: n.rows, cols: n.cols };
      }
      case 'neg': {
        const a = walk(n.a), len = 2 * a.rows * a.cols, o = alloc(a.rows * a.cols), ao = a.o;
        ops.push(() => { for (let k = 0; k < len; k++) r[o + k] = -r[ao + k]; });
        return { o, rows: a.rows, cols: a.cols };
      }
      case 'call': {
        const a = walk(n.a);
        need(a, n.f);
        const o = alloc(1);
        ops.push(callOp(n.f, a.o, o));
        return scalar(o);
      }
      case 'op': return opOf(n.op, n.a, n.b);
    }
  }

  function callOp(f: string, a: number, o: number): () => void {
    switch (f) {
      case 'abs': return () => { r[o] = cabs(r[a], r[a + 1]); r[o + 1] = 0; };
      case 'sqrt': return () => csqrt(r, o, r[a], r[a + 1]);
      case 'conj': return () => { r[o] = r[a]; r[o + 1] = -r[a + 1]; };
      case 'Re': return () => { r[o] = r[a]; r[o + 1] = 0; };
      case 'Im': return () => { r[o] = r[a + 1]; r[o + 1] = 0; };
      case 'arg': return () => { r[o] = Math.atan2(r[a + 1], r[a]); r[o + 1] = 0; };
      case 'exp': return () => {
        const e = Math.exp(r[a]), y = r[a + 1];
        if (y === 0) { r[o] = e; r[o + 1] = 0; } else { r[o] = e * Math.cos(y); r[o + 1] = e * Math.sin(y); }
      };
      case 'ln': return () => { r[o] = Math.log(cabs(r[a], r[a + 1])); r[o + 1] = Math.atan2(r[a + 1], r[a]); };
      case 'log10': return () => {
        const x = r[a], y = r[a + 1];
        if (y === 0 && x > 0) { r[o] = Math.log10(x); r[o + 1] = 0; }
        else { r[o] = Math.log(cabs(x, y)) / LN10; r[o + 1] = Math.atan2(y, x) / LN10; }
      };
      case 'sin': return () => {
        const x = r[a], y = r[a + 1];
        if (y === 0) { r[o] = Math.sin(x); r[o + 1] = 0; } else { r[o] = Math.sin(x) * Math.cosh(y); r[o + 1] = Math.cos(x) * Math.sinh(y); }
      };
      case 'cos': return () => {
        const x = r[a], y = r[a + 1];
        if (y === 0) { r[o] = Math.cos(x); r[o + 1] = 0; } else { r[o] = Math.cos(x) * Math.cosh(y); r[o + 1] = -Math.sin(x) * Math.sinh(y); }
      };
      case 'tan': return () => {
        const x = r[a], y = r[a + 1];
        if (y === 0) { r[o] = Math.tan(x); r[o + 1] = 0; return; }
        const d = Math.cos(2 * x) + Math.cosh(2 * y);
        r[o] = Math.sin(2 * x) / d; r[o + 1] = Math.sinh(2 * y) / d;
      };
      case 'cot': return () => {
        const x = r[a], y = r[a + 1];
        if (y === 0) { r[o] = Math.cos(x) / Math.sin(x); r[o + 1] = 0; return; }
        const d = Math.cosh(2 * y) - Math.cos(2 * x);
        r[o] = Math.sin(2 * x) / d; r[o + 1] = -Math.sinh(2 * y) / d;
      };
      case 'arctan': return () => {
        const x = r[a], y = r[a + 1];
        if (y === 0) { r[o] = Math.atan(x); r[o + 1] = 0; return; }
        // atan z = (j/2) ln((j + z)/(j − z))
        cdiv(r, o, x, 1 + y, -x, 1 - y);
        const wr = r[o], wi = r[o + 1];
        r[o] = -Math.atan2(wi, wr) / 2; r[o + 1] = Math.log(cabs(wr, wi)) / 2;
      };
    }
    throw new Error(`unknown function ${f}`);
  }

  function opOf(op: string, na: Node, nb: Node): Val {
    const a = walk(na), b = walk(nb), ao = a.o, bo = b.o;
    if (op === '+' || op === '-') {
      if (a.rows !== b.rows || a.cols !== b.cols) throw new Error(`${op} of different shapes`);
      const len = 2 * a.rows * a.cols, o = alloc(a.rows * a.cols);
      if (len === 2) ops.push(op === '+' ? () => { r[o] = r[ao] + r[bo]; r[o + 1] = r[ao + 1] + r[bo + 1]; } : () => { r[o] = r[ao] - r[bo]; r[o + 1] = r[ao + 1] - r[bo + 1]; });
      else ops.push(op === '+' ? () => { for (let k = 0; k < len; k++) r[o + k] = r[ao + k] + r[bo + k]; } : () => { for (let k = 0; k < len; k++) r[o + k] = r[ao + k] - r[bo + k]; });
      return { o, rows: a.rows, cols: a.cols };
    }
    if (op === '*') {
      if (isScalar(a) && isScalar(b)) {
        const o = alloc(1);
        ops.push(() => {
          const ar = r[ao], ai = r[ao + 1], br = r[bo], bi = r[bo + 1];
          r[o] = ar * br - ai * bi; r[o + 1] = ar * bi + ai * br;
        });
        return scalar(o);
      }
      if (isScalar(a) || isScalar(b)) {
        const m = isScalar(a) ? b : a, so = isScalar(a) ? ao : bo, mo = m.o, len = 2 * m.rows * m.cols, o = alloc(m.rows * m.cols);
        ops.push(() => {
          const sr = r[so], si = r[so + 1];
          for (let k = 0; k < len; k += 2) {
            const xr = r[mo + k], xi = r[mo + k + 1];
            r[o + k] = sr * xr - si * xi; r[o + k + 1] = sr * xi + si * xr;
          }
        });
        return { o, rows: m.rows, cols: m.cols };
      }
      if (a.cols !== b.rows) throw new Error('matrix product of shapes that do not fit');
      const rows = a.rows, cols = b.cols, inner = a.cols, o = alloc(rows * cols);
      ops.push(() => {
        for (let i = 0; i < rows; i++) for (let k = 0; k < cols; k++) {
          let sr = 0, si = 0;
          for (let m = 0; m < inner; m++) {
            const x = ao + 2 * (i * inner + m), y = bo + 2 * (m * cols + k);
            sr += r[x] * r[y] - r[x + 1] * r[y + 1]; si += r[x] * r[y + 1] + r[x + 1] * r[y];
          }
          r[o + 2 * (i * cols + k)] = sr; r[o + 2 * (i * cols + k) + 1] = si;
        }
      });
      return { o, rows, cols };
    }
    if (op === '/') {
      need(b, 'a division by');
      const len = 2 * a.rows * a.cols, o = alloc(a.rows * a.cols);
      if (len === 2) ops.push(() => cdiv(r, o, r[ao], r[ao + 1], r[bo], r[bo + 1]));
      else ops.push(() => { for (let k = 0; k < len; k += 2) cdiv(r, o + k, r[ao + k], r[ao + k + 1], r[bo], r[bo + 1]); });
      return { o, rows: a.rows, cols: a.cols };
    }
    // '^'
    need(a, 'a power'); need(b, 'a power');
    const o = alloc(1);
    const k = nb.t === 'num' ? nb.v : NaN;
    if (k === 2) {
      ops.push(() => { const x = r[ao], y = r[ao + 1]; r[o] = x * x - y * y; r[o + 1] = 2 * x * y; });
    } else if (Number.isInteger(k) && Math.abs(k) <= 64) {
      const e = Math.abs(k), inv = k < 0;
      ops.push(() => {
        let pr = 1, pi = 0, br = r[ao], bi = r[ao + 1];
        for (let m = e; m > 0; m >>= 1) {
          if (m & 1) { const t = pr * br - pi * bi; pi = pr * bi + pi * br; pr = t; }
          const t = br * br - bi * bi; bi = 2 * br * bi; br = t;
        }
        if (inv) cdiv(r, o, 1, 0, pr, pi); else { r[o] = pr; r[o + 1] = pi; }
      });
    } else {
      ops.push(() => {
        const x = r[ao], y = r[ao + 1], er = r[bo], ei = r[bo + 1];
        if (x === 0 && y === 0) { r[o] = er > 0 ? 0 : er === 0 && ei === 0 ? 1 : Infinity; r[o + 1] = 0; return; }
        const lr = Math.log(cabs(x, y)), li = Math.atan2(y, x);
        const mr = er * lr - ei * li, mi = er * li + ei * lr, m = Math.exp(mr);
        r[o] = m * Math.cos(mi); r[o + 1] = m * Math.sin(mi);
      });
    }
    return scalar(o);
  }

  const vals = tree.t === 'eq' ? tree.xs.map(walk) : [walk(tree)];
  for (const v of vals) if (v.rows !== vals[0].rows || v.cols !== vals[0].cols) throw new Error('sides of different shapes');
  r = new Float64Array(top);
  for (let k = 0; k < consts.length; k += 3) { r[consts[k]] = consts[k + 1]; r[consts[k] + 1] = consts[k + 2]; }
  const list = ops, count = ops.length;
  return {
    regs: r, names, slots, sides: vals,
    run(): void { for (let k = 0; k < count; k++) list[k](); },
  };
}

/** A variable's value: a real number or (re, im). */
export type Value = number | readonly [number, number];
export type Binding = Readonly<Record<string, Value>>;

/** Writes a binding into a program's variables. Throws when a variable has no value. */
export function bind(program: Program, binding: Binding): void {
  const r = program.regs;
  for (const name of program.names) {
    const v = binding[name];
    if (v === undefined) throw new Error(`no value for ${name}`);
    const o = program.slots.get(name);
    if (typeof v === 'number') { r[o] = v; r[o + 1] = 0; } else { r[o] = v[0]; r[o + 1] = v[1]; }
  }
}

const programs = new WeakMap<Node, Program>();

/** The program of a tree, compiled on first use. */
export function programOf(tree: Node): Program {
  let p = programs.get(tree);
  if (!p) { p = compile(tree); programs.set(tree, p); }
  return p;
}

/** Evaluates every side of a tree on a binding: one array of (re, im) pairs per side (allocates; for panels). */
export function evaluate(tree: Node, binding: Binding): Float64Array[] {
  const p = programOf(tree);
  bind(p, binding);
  p.run();
  return p.sides.map((s) => p.regs.slice(s.o, s.o + 2 * s.rows * s.cols));
}

// ---------------------------------------------------------------------------------------------------------------
// Symbols: what each variable means, its unit (lib/quantity.ts units, '' for none) and the chart object whose colour
// it takes in the equation panel (M5).

export type ChartObject =
  | 'chart' | 'point' | 'gamma' | 'z' | 'y' | 'r-circle' | 'x-circle' | 'g-circle' | 'b-circle' | 'load' | 'input'
  | 'part' | 'line' | 'stub' | 'quarter' | 'node' | 'frequency' | 'metric';

export interface SymbolInfo { meaning: string; unit: string; object: ChartObject }

const sym = (meaning: string, unit: string, object: ChartObject): SymbolInfo => ({ meaning, unit, object });

export const SYMBOLS: Readonly<Record<string, SymbolInfo>> = {
  Z_0: sym('reference impedance of the chart', 'Ω', 'chart'),
  Y_0: sym('reference admittance of the chart, 1/Z₀', 'S', 'chart'),
  Z: sym('impedance', 'Ω', 'z'),
  Y: sym('admittance', 'S', 'y'),
  R: sym('resistance', 'Ω', 'part'),
  X: sym('reactance', 'Ω', 'part'),
  B: sym('susceptance', 'S', 'part'),
  L: sym('inductance', 'H', 'part'),
  C: sym('capacitance', 'F', 'part'),
  z: sym('normalised impedance', '', 'z'),
  y: sym('normalised admittance', '', 'y'),
  r: sym('normalised resistance', '', 'r-circle'),
  x: sym('normalised reactance', '', 'x-circle'),
  g: sym('normalised conductance', '', 'g-circle'),
  b: sym('normalised susceptance', '', 'b-circle'),
  Gamma: sym('reflection coefficient', '', 'gamma'),
  Gamma_r: sym('real part of Γ', '', 'gamma'),
  Gamma_i: sym('imaginary part of Γ', '', 'gamma'),
  c: sym('centre of the circle a line draws on the chart', '', 'line'),
  rho: sym('radius of the circle a line draws on the chart', '', 'line'),
  Gamma_c: sym('reflection coefficient of the load against the line’s Z_c', '', 'line'),
  Z_c: sym('characteristic impedance of the line or stub', 'Ω', 'line'),
  Y_c: sym('characteristic admittance of the line or stub, 1/Z_c', 'S', 'line'),
  VSWR: sym('voltage standing wave ratio', '', 'metric'),
  V_inc: sym('amplitude of the incident voltage wave', 'V', 'metric'),
  V_max: sym('largest voltage amplitude along the line', 'V', 'metric'),
  V_min: sym('smallest voltage amplitude along the line', 'V', 'metric'),
  Z_max: sym('impedance where the voltage is largest', 'Ω', 'metric'),
  Z_min: sym('impedance where the voltage is smallest', 'Ω', 'metric'),
  RL: sym('return loss', 'dB', 'metric'),
  ML: sym('mismatch loss', 'dB', 'metric'),
  P_inc: sym('incident power', 'W', 'metric'),
  P_ref: sym('reflected power', 'W', 'metric'),
  P_load: sym('power delivered to the load', 'W', 'metric'),
  Q: sym('quality factor', '', 'metric'),
  R_high: sym('the higher of the two resistances matched', 'Ω', 'load'),
  R_low: sym('the lower of the two resistances matched', 'Ω', 'load'),
  Z_in: sym('input impedance', 'Ω', 'input'),
  Z_L: sym('load impedance', 'Ω', 'load'),
  R_L: sym('load resistance', 'Ω', 'load'),
  Gamma_L: sym('reflection coefficient of the load', '', 'load'),
  Gamma_in: sym('reflection coefficient at the input', '', 'input'),
  beta: sym('phase constant', 'rad/m', 'line'),
  ell: sym('physical length', 'm', 'line'),
  theta: sym('electrical length βℓ', 'rad', 'line'),
  lambda: sym('wavelength on the line', 'm', 'line'),
  v_p: sym('phase velocity', 'm/s', 'line'),
  omega: sym('angular frequency', 'rad/s', 'frequency'),
  f: sym('frequency', 'Hz', 'frequency'),
  Z_t: sym('characteristic impedance of the λ/4 transformer', 'Ω', 'quarter'),
  L_s: sym('inductance equal to a short stub at one frequency', 'H', 'stub'),
  C_o: sym('capacitance equal to an open stub at one frequency', 'F', 'stub'),
  z_in: sym('normalised impedance at the input of the part', '', 'input'),
  z_L: sym('normalised impedance at the output of the part', '', 'node'),
  z_s: sym('normalised impedance of the series part', '', 'part'),
  Z_s: sym('impedance of the series part', 'Ω', 'part'),
  y_in: sym('normalised admittance at the input of the part', '', 'input'),
  y_L: sym('normalised admittance at the output of the part', '', 'node'),
  y_p: sym('normalised admittance of the shunt part', '', 'part'),
  Y_p: sym('admittance of the shunt part', 'S', 'part'),
  V: sym('voltage at a node', 'V', 'node'),
  I: sym('current at a node towards the load', 'A', 'node'),
  V_1: sym('voltage at port 1 (towards the source)', 'V', 'input'),
  I_1: sym('current into port 1', 'A', 'input'),
  V_2: sym('voltage at port 2 (towards the load)', 'V', 'node'),
  I_2: sym('current out of port 2', 'A', 'node'),
};

const ABCD_SYMBOLS: Readonly<Record<string, SymbolInfo>> = {
  A: sym('ABCD entry A (voltage ratio)', '', 'part'),
  B: sym('ABCD entry B (transfer impedance)', 'Ω', 'part'),
  C: sym('ABCD entry C (transfer admittance)', 'S', 'part'),
  D: sym('ABCD entry D (current ratio)', '', 'part'),
  A_1: sym('A of the part towards the source', '', 'part'), B_1: sym('B of the part towards the source', 'Ω', 'part'),
  C_1: sym('C of the part towards the source', 'S', 'part'), D_1: sym('D of the part towards the source', '', 'part'),
  A_2: sym('A of the part towards the load', '', 'part'), B_2: sym('B of the part towards the load', 'Ω', 'part'),
  C_2: sym('C of the part towards the load', 'S', 'part'), D_2: sym('D of the part towards the load', '', 'part'),
};

// ---------------------------------------------------------------------------------------------------------------
// The registry.

/** A source: a references.bib key and the section (LibreTexts sections; facts.md §2 gives them). */
export interface Source { key: string; at: string }

/** One derivation step: an equation in the same text form and one sentence saying why it follows. */
export interface Step { text: string; tree: Node; why: string }

export interface Equation {
  id: string;
  title: string;
  text: string;
  tree: Node;
  sources: readonly Source[];
  /** How the equation follows when no source prints it (facts.md "derived"). */
  derivation?: string;
  /** The item of the owner's notes (notes-M0.1.md, checked in facts.md §3) the equation corrects or completes. */
  owner?: string;
  assumptions: readonly string[];
  steps: readonly Step[];
  /** The engine function(s) the harness checks it against. */
  engine: string;
  /** Free variables of the equation and its steps, in order of first use. */
  variables: readonly string[];
  /** Meanings that differ from SYMBOLS in this entry (the ABCD entries' A, B, C, D). */
  symbols?: Readonly<Record<string, SymbolInfo>>;
}

const E = 'Ellingson2018', S2 = 'SteerVol2', S3 = 'SteerVol3', W = 'WikiSmith';
const src = (key: string, at: string): Source => ({ key, at });

const EJWT = 'time dependence e^{jωt}';
const REAL_Z0 = 'real reference impedance Z₀';
const LOSSLESS = 'lossless line';

interface Def {
  id: string;
  title: string;
  text: string;
  sources?: Source[];
  derivation?: string;
  owner?: string;
  assumptions?: string[];
  steps?: [string, string][];
  engine: string;
  symbols?: Record<string, SymbolInfo>;
}

const DEFS: Def[] = [
  // Normalisation and Γ (facts.md eqs. 1–3).
  { id: 'z-norm', title: 'Normalised impedance', text: 'z = Z/Z_0 = r + j*x', sources: [src(W, '"Normalization"')], assumptions: [REAL_Z0], engine: 'convert.zFromGamma, convert.impedanceFromGamma' },
  { id: 'y-norm', title: 'Normalised admittance', text: 'y = Y/Y_0 = Y*Z_0 = 1/z = g + j*b', sources: [src(W, '"Normalization"')], assumptions: [REAL_Z0], engine: 'convert.yFromGamma, convert.admittanceFromGamma' },
  {
    id: 'gamma-z', title: 'Reflection coefficient from impedance', text: 'Gamma = (z - 1)/(z + 1) = (Z - Z_0)/(Z + Z_0)',
    sources: [src(E, '§3.12'), src(S2, '§2.3'), src(S3, '§3.5')], assumptions: [EJWT, REAL_Z0], engine: 'convert.gammaFromZ, convert.gammaFromImpedance',
  },
  {
    id: 'z-gamma', title: 'Impedance from the reflection coefficient', text: 'z = (1 + Gamma)/(1 - Gamma)',
    sources: [src(E, '§3.12'), src(S2, '§2.3'), src(S3, '§3.5')], assumptions: [REAL_Z0], engine: 'convert.zFromGamma',
    steps: [
      ['Gamma = (z - 1)/(z + 1)', 'The definition of Γ in normalised impedance.'],
      ['Gamma*(z + 1) = z - 1', 'Multiply both sides by z + 1.'],
      ['z*(1 - Gamma) = 1 + Gamma', 'Gather the terms in z on one side.'],
      ['z = (1 + Gamma)/(1 - Gamma)', 'Divide by 1 − Γ.'],
    ],
  },
  {
    id: 'gamma-y', title: 'Reflection coefficient from admittance', text: 'Gamma = (1 - y)/(1 + y)', sources: [src(W, '"Admittance chart"')],
    assumptions: [REAL_Z0], engine: 'convert.gammaFromY',
    steps: [
      ['Gamma = (z - 1)/(z + 1) = (1/y - 1)/(1/y + 1)', 'Put z = 1/y into Γ = (z − 1)/(z + 1).'],
      ['Gamma = (1 - y)/(1 + y)', 'Multiply above and below by y.'],
    ],
  },
  {
    id: 'y-gamma', title: 'Admittance from the reflection coefficient', text: 'y = (1 - Gamma)/(1 + Gamma)', sources: [src(W, '"Admittance chart"')],
    assumptions: [REAL_Z0], engine: 'convert.yFromGamma',
    steps: [
      ['y = 1/z = 1/((1 + Gamma)/(1 - Gamma))', 'The admittance is the reciprocal of z = (1 + Γ)/(1 − Γ).'],
      ['y = (1 - Gamma)/(1 + Gamma)', 'The reciprocal of a fraction turns it over.'],
    ],
  },
  // Γ in parts of z and y (eqs. 4, 5).
  {
    id: 'gamma-parts-z', title: 'Γ in parts of z', text: 'Gamma = Gamma_r + j*Gamma_i = (r^2 + x^2 - 1)/((1 + r)^2 + x^2) + j*(2*x/((1 + r)^2 + x^2))',
    sources: [src(W, '"Constant resistance and reactance circles"')], assumptions: [REAL_Z0], engine: 'convert.gammaFromZ',
    steps: [
      ['Gamma = (r + j*x - 1)/(r + j*x + 1)', 'Γ = (z − 1)/(z + 1) with z = r + jx.'],
      ['Gamma = ((r - 1 + j*x)*(r + 1 - j*x))/((r + 1 + j*x)*(r + 1 - j*x))', 'Multiply above and below by the conjugate of the denominator.'],
      ['Gamma = (r^2 - 1 + x^2 + j*2*x)/((r + 1)^2 + x^2)', 'Multiply out; the denominator is now real.'],
      ['Gamma = (r^2 + x^2 - 1)/((1 + r)^2 + x^2) + j*(2*x/((1 + r)^2 + x^2))', 'Split into real and imaginary parts.'],
    ],
  },
  {
    id: 'gamma-parts-y', title: 'Γ in parts of y', text: 'Gamma = Gamma_r + j*Gamma_i = (1 - g^2 - b^2)/((1 + g)^2 + b^2) - j*(2*b/((1 + g)^2 + b^2))',
    sources: [src(W, '"Admittance chart"')], assumptions: [REAL_Z0], engine: 'convert.gammaFromY',
    steps: [
      ['Gamma = (1 - g - j*b)/(1 + g + j*b)', 'Γ = (1 − y)/(1 + y) with y = g + jb.'],
      ['Gamma = ((1 - g - j*b)*(1 + g - j*b))/((1 + g)^2 + b^2)', 'Multiply above and below by the conjugate of the denominator.'],
      ['Gamma = (1 - g^2 - b^2 - j*2*b)/((1 + g)^2 + b^2)', 'Multiply out the numerator: (1 − jb)² − g².'],
      ['Gamma = (1 - g^2 - b^2)/((1 + g)^2 + b^2) - j*(2*b/((1 + g)^2 + b^2))', 'Split into real and imaginary parts.'],
    ],
  },
  // z and y in parts of Γ (eqs. 6, 7; the owner's notes items 1–4 and 6).
  {
    id: 'z-parts', title: 'z in parts of Γ', text: 'z = r + j*x = (1 - Gamma_r^2 - Gamma_i^2)/((1 - Gamma_r)^2 + Gamma_i^2) + j*(2*Gamma_i/((1 - Gamma_r)^2 + Gamma_i^2))',
    sources: [], derivation: 'From z = (1 + Γ)/(1 − Γ) with Γ = Γr + jΓi (facts.md §3).', owner: 'items 1 and 6', assumptions: [REAL_Z0], engine: 'convert.zFromGamma',
    steps: [
      ['z = (1 + Gamma_r + j*Gamma_i)/((1 - Gamma_r) - j*Gamma_i)', 'z = (1 + Γ)/(1 − Γ) with Γ = Γr + jΓi.'],
      ['z = ((1 + Gamma_r + j*Gamma_i)*((1 - Gamma_r) + j*Gamma_i))/(((1 - Gamma_r) - j*Gamma_i)*((1 - Gamma_r) + j*Gamma_i))', 'Multiply above and below by the conjugate of the denominator.'],
      ['z = (1 - Gamma_r^2 - Gamma_i^2 + j*2*Gamma_i)/((1 - Gamma_r)^2 + Gamma_i^2)', 'Multiply out; the denominator is now real.'],
      ['z = (1 - Gamma_r^2 - Gamma_i^2)/((1 - Gamma_r)^2 + Gamma_i^2) + j*(2*Gamma_i/((1 - Gamma_r)^2 + Gamma_i^2))', 'Split into r and x.'],
    ],
  },
  {
    id: 'y-parts', title: 'y in parts of Γ', text: 'y = g + j*b = (1 - Gamma_r^2 - Gamma_i^2)/(Gamma_i^2 + (Gamma_r + 1)^2) - j*(2*Gamma_i/(Gamma_i^2 + (Gamma_r + 1)^2))',
    sources: [], derivation: 'From y = 1/z with z of the owner’s notes item 1 (facts.md §3).', owner: 'items 2–4', assumptions: [REAL_Z0], engine: 'convert.yFromGamma',
    steps: [
      ['y = 1/z = ((1 - Gamma_r) - j*Gamma_i)/(1 + Gamma_r + j*Gamma_i)', 'Turn z = (1 + Γr + jΓi)/((1 − Γr) − jΓi) over.'],
      ['y = ((1 - Gamma_r - j*Gamma_i)*(1 + Gamma_r - j*Gamma_i))/((1 + Gamma_r + j*Gamma_i)*(1 + Gamma_r - j*Gamma_i))', 'Multiply by the conjugate 1 + Γr − jΓi over itself.'],
      ['y = (1 - Gamma_r^2 - Gamma_i^2 - j*2*Gamma_i)/(Gamma_i^2 + (Gamma_r + 1)^2)', 'Multiply out: the numerator is (1 − jΓi)² − Γr², the denominator real.'],
      ['y = (1 - Gamma_r^2 - Gamma_i^2)/(Gamma_i^2 + (Gamma_r + 1)^2) - j*(2*Gamma_i/(Gamma_i^2 + (Gamma_r + 1)^2))', 'Split into g and b.'],
    ],
  },
  { id: 'r-gamma', title: 'Resistance from Γ', text: 'r = (1 - Gamma_r^2 - Gamma_i^2)/((1 - Gamma_r)^2 + Gamma_i^2)', sources: [], derivation: 'The real part of z in parts of Γ.', owner: 'item 6', assumptions: [REAL_Z0], engine: 'convert.zFromGamma' },
  { id: 'x-gamma', title: 'Reactance from Γ', text: 'x = 2*Gamma_i/((1 - Gamma_r)^2 + Gamma_i^2)', sources: [], derivation: 'The imaginary part of z in parts of Γ.', owner: 'item 6', assumptions: [REAL_Z0], engine: 'convert.zFromGamma' },
  { id: 'g-gamma', title: 'Conductance from Γ', text: 'g = (1 - Gamma_r^2 - Gamma_i^2)/((1 + Gamma_r)^2 + Gamma_i^2)', sources: [], derivation: 'The real part of y in parts of Γ.', owner: 'item 5', assumptions: [REAL_Z0], engine: 'convert.yFromGamma' },
  { id: 'b-gamma', title: 'Susceptance from Γ', text: 'b = -2*Gamma_i/((1 + Gamma_r)^2 + Gamma_i^2)', sources: [], derivation: 'The imaginary part of y in parts of Γ.', owner: 'item 5', assumptions: [REAL_Z0], engine: 'convert.yFromGamma' },
  // The four circles (eqs. 8–11; the owner's notes items 7–11, completed).
  {
    id: 'circle-r', title: 'Constant-resistance circle', text: '(Gamma_r - r/(1 + r))^2 + Gamma_i^2 = (1/(1 + r))^2',
    sources: [src(W, '"Constant resistance and reactance circles"'), src(S3, '§3.4')], derivation: 'Completing the square in r = Re z (facts.md §3 item 8).',
    owner: 'items 7 and 8', assumptions: [REAL_Z0], engine: 'convert.zFromGamma',
    steps: [
      ['r = (1 - Gamma_r^2 - Gamma_i^2)/((1 - Gamma_r)^2 + Gamma_i^2)', 'The real part of z in parts of Γ.'],
      ['r*((1 - Gamma_r)^2 + Gamma_i^2) = 1 - Gamma_r^2 - Gamma_i^2', 'Multiply by the denominator.'],
      ['(r + 1)*Gamma_r^2 - 2*r*Gamma_r + (r + 1)*Gamma_i^2 = 1 - r', 'Multiply out and gather the powers of Γr and Γi.'],
      ['Gamma_r^2 - 2*r/(r + 1)*Gamma_r + Gamma_i^2 = (1 - r)/(r + 1)', 'Divide by r + 1.'],
      ['(Gamma_r - r/(r + 1))^2 + Gamma_i^2 = (1 - r)/(r + 1) + (r/(r + 1))^2', 'Complete the square: add (r/(r + 1))² to both sides.'],
      ['(Gamma_r - r/(r + 1))^2 + Gamma_i^2 = ((1 - r)*(1 + r) + r^2)/(r + 1)^2', 'Bring the right side over one denominator.'],
      ['(Gamma_r - r/(1 + r))^2 + Gamma_i^2 = (1/(1 + r))^2', 'The numerator is 1: a circle with centre (r/(1 + r), 0) and radius 1/(1 + r).'],
    ],
  },
  {
    id: 'circle-x', title: 'Constant-reactance circle', text: '(Gamma_r - 1)^2 + (Gamma_i - 1/x)^2 = (1/x)^2',
    sources: [src(W, '"Constant resistance and reactance circles"'), src(S3, '§3.4')], derivation: 'Completing the square in x = Im z (facts.md §3 item 9).',
    owner: 'items 7 (i corrected to 1) and 9', assumptions: [REAL_Z0], engine: 'convert.zFromGamma',
    steps: [
      ['x = 2*Gamma_i/((1 - Gamma_r)^2 + Gamma_i^2)', 'The imaginary part of z in parts of Γ.'],
      ['x*((1 - Gamma_r)^2 + Gamma_i^2) = 2*Gamma_i', 'Multiply by the denominator.'],
      ['(Gamma_r - 1)^2 + Gamma_i^2 = 2*Gamma_i/x', 'Divide by x; (1 − Γr)² = (Γr − 1)².'],
      ['(Gamma_r - 1)^2 + Gamma_i^2 - 2*Gamma_i/x + (1/x)^2 = (1/x)^2', 'Complete the square: subtract 2Γi/x and add (1/x)² on both sides.'],
      ['(Gamma_r - 1)^2 + (Gamma_i - 1/x)^2 = (1/x)^2', 'A circle with centre (1, 1/x) and radius 1/|x|.'],
    ],
  },
  {
    id: 'circle-g', title: 'Constant-conductance circle', text: '(Gamma_r + g/(1 + g))^2 + Gamma_i^2 = (1/(1 + g))^2',
    sources: [src(W, '"Admittance chart"')], derivation: 'Completing the square in g = Re y (facts.md §3 item 10).',
    owner: 'items 5 and 10', assumptions: [REAL_Z0], engine: 'convert.yFromGamma',
    steps: [
      ['g = (1 - Gamma_r^2 - Gamma_i^2)/((1 + Gamma_r)^2 + Gamma_i^2)', 'The real part of y in parts of Γ.'],
      ['g*Gamma_i^2 + g*(Gamma_r + 1)^2 = 1 - Gamma_r^2 - Gamma_i^2', 'Multiply by the denominator (the notes’ last line).'],
      ['(g + 1)*Gamma_r^2 + 2*g*Gamma_r + (g + 1)*Gamma_i^2 = 1 - g', 'Multiply out and gather the powers of Γr and Γi.'],
      ['Gamma_r^2 + 2*g/(g + 1)*Gamma_r + Gamma_i^2 = (1 - g)/(1 + g)', 'Divide by g + 1.'],
      ['(Gamma_r + g/(g + 1))^2 + Gamma_i^2 = (1 - g)/(1 + g) + (g/(g + 1))^2', 'Complete the square: add (g/(g + 1))² to both sides.'],
      ['(Gamma_r + g/(1 + g))^2 + Gamma_i^2 = (1/(1 + g))^2', 'The right side is 1/(1 + g)²: centre (−g/(1 + g), 0), radius 1/(1 + g).'],
    ],
  },
  {
    id: 'circle-b', title: 'Constant-susceptance circle', text: '(Gamma_r + 1)^2 + (Gamma_i + 1/b)^2 = (1/b)^2',
    sources: [src(W, '"Admittance chart"')], derivation: 'Completing the square in b = Im y (facts.md §3 item 11).',
    owner: 'items 5 and 11', assumptions: [REAL_Z0], engine: 'convert.yFromGamma',
    steps: [
      ['b = -2*Gamma_i/((1 + Gamma_r)^2 + Gamma_i^2)', 'The imaginary part of y in parts of Γ.'],
      ['b*Gamma_i^2 + b*(Gamma_r + 1)^2 = -2*Gamma_i', 'Multiply by the denominator (the notes’ last line).'],
      ['(Gamma_r + 1)^2 + Gamma_i^2 = -2*Gamma_i/b', 'Divide by b.'],
      ['(Gamma_r + 1)^2 + Gamma_i^2 + 2*Gamma_i/b + (1/b)^2 = (1/b)^2', 'Complete the square: add 2Γi/b and (1/b)² on both sides.'],
      ['(Gamma_r + 1)^2 + (Gamma_i + 1/b)^2 = (1/b)^2', 'A circle with centre (−1, −1/b) and radius 1/|b|.'],
    ],
  },
  // A line of another impedance (eq. 12).
  {
    id: 'line-circle-b', title: 'Mismatch of a line against the chart', text: 'B = (Z_c - Z_0)/(Z_c + Z_0)', sources: [src(S3, '§3.5')],
    assumptions: [LOSSLESS, REAL_Z0], engine: 'geometry.partLocus (LINE)', symbols: { B: sym('reflection coefficient of the line’s Z_c against Z₀', '', 'line') },
  },
  {
    id: 'line-circle-centre', title: 'Centre of a line’s circle', text: 'c = (B - 1/B)/(1 - abs(B*Gamma_c)^2) + 1/B', sources: [src(S3, '§3.5')],
    assumptions: [LOSSLESS, REAL_Z0], engine: 'geometry.partLocus, geometry.circleCentre (LINE)', symbols: { B: sym('reflection coefficient of the line’s Z_c against Z₀', '', 'line') },
  },
  {
    id: 'line-circle-radius', title: 'Radius of a line’s circle', text: 'rho = abs((B^2 - 1)*Gamma_c/(1 - abs(B*Gamma_c)^2))', sources: [src(S3, '§3.5')],
    assumptions: [LOSSLESS, REAL_Z0], engine: 'geometry.partLocus, geometry.circleCentre (LINE)', symbols: { B: sym('reflection coefficient of the line’s Z_c against Z₀', '', 'line') },
  },
  // Figures (eqs. 13–17).
  {
    id: 'vswr', title: 'Voltage standing wave ratio', text: 'VSWR = V_max/V_min = (1 + abs(Gamma))/(1 - abs(Gamma))',
    sources: [src(E, '§3.14'), src(S2, '§2.3')], assumptions: [LOSSLESS], engine: 'convert.vswr',
    steps: [
      ['V_max = V_inc*(1 + abs(Gamma))', 'Where the incident and reflected waves add in phase.'],
      ['V_min = V_inc*(1 - abs(Gamma))', 'Where they are in antiphase.'],
      ['VSWR = (V_inc*(1 + abs(Gamma)))/(V_inc*(1 - abs(Gamma))) = (1 + abs(Gamma))/(1 - abs(Gamma))', 'The ratio; the incident amplitude cancels.'],
    ],
  },
  {
    id: 'gamma-vswr', title: '|Γ| from the VSWR', text: 'abs(Gamma) = (VSWR - 1)/(VSWR + 1)', sources: [src(E, '§3.14'), src(S2, '§2.3')],
    assumptions: [LOSSLESS], engine: 'convert.magFromVswr',
    steps: [
      ['VSWR*(1 - abs(Gamma)) = 1 + abs(Gamma)', 'Multiply the VSWR by 1 − |Γ|.'],
      ['abs(Gamma)*(VSWR + 1) = VSWR - 1', 'Gather the terms in |Γ|.'],
    ],
  },
  { id: 'z-max', title: 'Impedance at a voltage maximum', text: 'Z_max = Z_0*VSWR', sources: [src(S2, '§2.3')], assumptions: [LOSSLESS, REAL_Z0], engine: 'convert.impedanceFromGamma at Γ = |Γ|' },
  { id: 'z-min', title: 'Impedance at a voltage minimum', text: 'Z_min = Z_0/VSWR', sources: [src(S2, '§2.3')], assumptions: [LOSSLESS, REAL_Z0], engine: 'convert.impedanceFromGamma at Γ = −|Γ|' },
  {
    id: 'return-loss', title: 'Return loss', text: 'RL = 10*log10(P_inc/P_ref) = -20*log10(abs(Gamma))', sources: [src(S3, '§2.8')],
    assumptions: ['passive load, |Γ| ≤ 1'], engine: 'convert.returnLoss',
    steps: [
      ['RL = 10*log10(1/abs(Gamma)^2)', 'The reflected power is |Γ|² times the incident power.'],
      ['RL = -20*log10(abs(Gamma))', 'The logarithm of a reciprocal is the negative, of a square twice the logarithm.'],
    ],
  },
  { id: 'power-reflected', title: 'Reflected power', text: 'P_ref = abs(Gamma)^2*P_inc', sources: [src(E, '§3.20'), src(S2, '§2.3')], assumptions: [LOSSLESS], engine: 'convert.reflectedPower' },
  { id: 'power-delivered', title: 'Power delivered to the load', text: 'P_load = (1 - abs(Gamma)^2)*P_inc', sources: [src(E, '§3.20'), src(S2, '§2.3')], assumptions: [LOSSLESS], engine: 'convert.deliveredPower' },
  {
    id: 'mismatch-loss', title: 'Mismatch loss', text: 'ML = 10*log10(P_inc/P_load) = -10*log10(1 - abs(Gamma)^2)', sources: [src(S3, '§2.8')],
    derivation: '[S3] names mismatch loss without a formula; it is the delivered power in decibels (facts.md eq. 16).', assumptions: ['passive load, |Γ| ≤ 1'], engine: 'convert.mismatchLoss',
    steps: [
      ['ML = 10*log10(1/(1 - abs(Gamma)^2))', 'The load receives 1 − |Γ|² of the incident power.'],
      ['ML = -10*log10(1 - abs(Gamma)^2)', 'The logarithm of a reciprocal is the negative.'],
    ],
  },
  {
    id: 'q-node', title: 'Q of a point', text: 'Q = abs(x)/r = abs(b)/g = 2*abs(Gamma_i)/(1 - abs(Gamma)^2)', sources: [src(S3, '§6.4')],
    derivation: '|b|/g = |x|/r because y = 1/z gives b/g = −x/r; the Γ form divides x by r in parts of Γ.', assumptions: [REAL_Z0], engine: 'convert.qFromZ, convert.qFromGamma',
  },
  {
    id: 'q-l-network', title: 'Q of an L network', text: 'Q = sqrt(R_high/R_low - 1)', sources: [src(S3, '§6.4')], assumptions: ['lossless parts'],
    engine: 'network.inputGamma of the L network built with this Q',
    steps: [
      ['R_high = R_low*(1 + Q^2)', 'A series leg R_low + jX with Q = |X|/R_low is, seen in parallel, a resistance R_low(1 + Q²).'],
      ['Q^2 = R_high/R_low - 1', 'Solve for Q².'],
    ],
  },
  // Lines (eqs. 18–20).
  {
    id: 'line-zin', title: 'Input impedance of a line', sources: [src(E, '§3.15'), src(S2, '§2.3')], assumptions: [LOSSLESS, EJWT], engine: 'network.evaluate (LINE)',
    text: 'Z_in = Z_c*((Z_L + j*Z_c*tan(beta*ell))/(Z_c + j*Z_L*tan(beta*ell))) = Z_c*((1 + Gamma_c*exp(-j*2*beta*ell))/(1 - Gamma_c*exp(-j*2*beta*ell)))',
    steps: [
      ['Z_in = Z_c*((1 + Gamma_c*exp(-j*2*beta*ell))/(1 - Gamma_c*exp(-j*2*beta*ell)))', 'Over the length ℓ the reflected wave turns by e^{−j2βℓ} against the incident one.'],
      ['Z_in = Z_c*(((Z_L + Z_c)*exp(j*beta*ell) + (Z_L - Z_c)*exp(-j*beta*ell))/((Z_L + Z_c)*exp(j*beta*ell) - (Z_L - Z_c)*exp(-j*beta*ell)))', 'Put in Γ_c = (Z_L − Z_c)/(Z_L + Z_c) and multiply above and below by (Z_L + Z_c)e^{jβℓ}.'],
      ['Z_in = Z_c*((Z_L*cos(beta*ell) + j*Z_c*sin(beta*ell))/(Z_c*cos(beta*ell) + j*Z_L*sin(beta*ell)))', 'Write e^{±jβℓ} = cos βℓ ± j sin βℓ; the factors 2 cancel.'],
      ['Z_in = Z_c*((Z_L + j*Z_c*tan(beta*ell))/(Z_c + j*Z_L*tan(beta*ell)))', 'Divide above and below by cos βℓ.'],
    ],
  },
  {
    id: 'line-rotation', title: 'Rotation on a matched line', text: 'Gamma_in = Gamma_L*exp(-j*2*theta)', sources: [src(E, '§3.15'), src(E, '§3.17'), src(S3, '§3.4')],
    assumptions: [LOSSLESS, 'the line’s Z_c equals Z₀'], engine: 'network.evaluate (LINE with Z_c = Z₀)',
  },
  { id: 'line-theta', title: 'Electrical length', text: 'theta = beta*ell = 2*pi*ell/lambda', sources: [src(E, '§3.15'), src(E, '§3.17')], assumptions: [LOSSLESS], engine: 'parts.turnsFromMetres' },
  { id: 'beta', title: 'Phase constant', text: 'beta = 2*pi/lambda = omega/v_p', sources: [src(E, '§3.15')], assumptions: [LOSSLESS], engine: 'parts.turnsFromMetres, parts.metresFromTurns' },
  { id: 'omega', title: 'Angular frequency', text: 'omega = 2*pi*f', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT], engine: 'parts.added (SERIES_L)' },
  {
    id: 'quarter-wave', title: 'Quarter-wave transformer', text: 'Z_in = Z_t^2/Z_L', sources: [src(E, '§3.19'), src(S2, '§2.4')], assumptions: [LOSSLESS, 'ℓ = λ/4 at the frequency'],
    engine: 'network.evaluate (QUARTER at f0)',
    steps: [
      ['Z_in = Z_t*((Z_L*cos(beta*ell) + j*Z_t*sin(beta*ell))/(Z_t*cos(beta*ell) + j*Z_L*sin(beta*ell)))', 'The input impedance of a line of Z_t.'],
      ['Z_in = Z_t*((j*Z_t)/(j*Z_L))', 'At ℓ = λ/4, βℓ = π/2: cos βℓ = 0 and sin βℓ = 1.'],
      ['Z_in = Z_t^2/Z_L', 'The j cancels.'],
    ],
  },
  {
    id: 'quarter-wave-match', title: 'Quarter-wave match', text: 'Z_t = sqrt(Z_0*R_L)', sources: [src(E, '§3.19'), src(S2, '§2.4')], assumptions: [LOSSLESS, 'ℓ = λ/4 + nλ/2', 'resistive load'],
    engine: 'network.inputGamma (QUARTER) is 0',
    steps: [['Z_0 = Z_t^2/R_L', 'A match needs the input impedance Z_t²/R_L to equal Z₀.']],
  },
  // Stubs (eqs. 21–23).
  { id: 'stub-short-z', title: 'Shorted line', text: 'Z_in = j*Z_c*tan(beta*ell)', sources: [src(E, '§3.16'), src(S2, '§2.4')], assumptions: [LOSSLESS], engine: 'network.evaluate (LINE on a short)' },
  { id: 'stub-open-z', title: 'Open line', text: 'Z_in = -j*Z_c*cot(beta*ell)', sources: [src(E, '§3.16'), src(S2, '§2.4')], assumptions: [LOSSLESS], engine: 'network.evaluate (LINE on an open)' },
  {
    id: 'stub-short-b', title: 'Susceptance of a shorted shunt stub', text: 'b = B*Z_0 = -Y_c*Z_0*cot(beta*ell) = -Z_0/Z_c*cot(beta*ell)',
    sources: [src(E, '§3.23')], derivation: 'Normalised with y = Y·Z₀.', assumptions: [LOSSLESS, REAL_Z0], engine: 'parts.added (STUB_SHORT)',
  },
  {
    id: 'stub-open-b', title: 'Susceptance of an open shunt stub', text: 'b = B*Z_0 = Y_c*Z_0*tan(beta*ell) = Z_0/Z_c*tan(beta*ell)',
    sources: [src(E, '§3.23')], derivation: 'Normalised with y = Y·Z₀.', assumptions: [LOSSLESS, REAL_Z0], engine: 'parts.added (STUB_OPEN)',
  },
  { id: 'stub-short-l', title: 'Inductance of a shorted stub', text: 'L_s = Z_c/omega*tan(beta*ell)', sources: [src(S2, '§2.4')], assumptions: [LOSSLESS, 'one frequency'], engine: 'network.evaluate (LINE on a short)' },
  { id: 'stub-open-c', title: 'Capacitance of an open stub', text: 'C_o = tan(beta*ell)/(omega*Z_c)', sources: [src(S2, '§2.4')], assumptions: [LOSSLESS, 'one frequency'], engine: 'network.evaluate (LINE on an open)' },
  // Lumped parts (eq. 24).
  { id: 'r-series', title: 'Series resistor', text: 'r = R/Z_0', sources: [src(W, '"Circuit elements and topology"')], assumptions: [REAL_Z0], engine: 'parts.added (SERIES_R)' },
  { id: 'g-shunt', title: 'Shunt resistor', text: 'g = Z_0/R', sources: [src(W, '"Circuit elements and topology"')], assumptions: [REAL_Z0], engine: 'parts.added (SHUNT_R)' },
  { id: 'x-series-l', title: 'Series inductor', text: 'x = X/Z_0 = omega*L/Z_0', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT, REAL_Z0], engine: 'parts.added (SERIES_L)' },
  { id: 'x-series-c', title: 'Series capacitor', text: 'x = X/Z_0 = -1/(omega*C*Z_0)', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT, REAL_Z0], engine: 'parts.added (SERIES_C)' },
  { id: 'b-shunt-c', title: 'Shunt capacitor', text: 'b = B*Z_0 = omega*C*Z_0', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT, REAL_Z0], engine: 'parts.added (SHUNT_C)' },
  { id: 'b-shunt-l', title: 'Shunt inductor', text: 'b = B*Z_0 = -Z_0/(omega*L)', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT, REAL_Z0], engine: 'parts.added (SHUNT_L)' },
  { id: 'z-inductor', title: 'Impedance of an inductor', text: 'Z = j*omega*L', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT], engine: 'parts.added (SERIES_L)' },
  { id: 'z-capacitor', title: 'Impedance of a capacitor', text: 'Z = 1/(j*omega*C) = -j/(omega*C)', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT], engine: 'parts.added (SERIES_C)' },
  { id: 'y-capacitor', title: 'Admittance of a capacitor', text: 'Y = j*omega*C', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT], engine: 'parts.added (SHUNT_C)' },
  { id: 'y-inductor', title: 'Admittance of an inductor', text: 'Y = 1/(j*omega*L) = -j/(omega*L)', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT], engine: 'parts.added (SHUNT_L)' },
  // Series adds z, shunt adds y (learning.md §4).
  {
    id: 'series-adds-z', title: 'A series part adds its impedance', text: 'z_in = z_L + z_s', sources: [src(S3, '§2.2.6')],
    derivation: 'From the ABCD matrix [1 Z_s; 0 1] of a series part.', assumptions: [REAL_Z0], engine: 'network.applyPart (series parts)',
    steps: [
      ['z_in = V_1/(I_1*Z_0)', 'The normalised impedance at the input.'],
      ['z_in = (V_2 + Z_s*I_2)/(I_2*Z_0)', 'Across a series part V_1 = V_2 + Z_s I_2 and I_1 = I_2.'],
      ['z_in = V_2/(I_2*Z_0) + Z_s/Z_0 = z_L + z_s', 'Split the fraction: the first term is the impedance at the output.'],
    ],
  },
  {
    id: 'shunt-adds-y', title: 'A shunt part adds its admittance', text: 'y_in = y_L + y_p', sources: [src(S3, '§2.2.6')],
    derivation: 'From the ABCD matrix [1 0; Y_p 1] of a shunt part.', assumptions: [REAL_Z0], engine: 'network.applyPart (shunt parts and stubs)',
    steps: [
      ['y_in = I_1*Z_0/V_1', 'The normalised admittance at the input.'],
      ['y_in = (Y_p*V_2 + I_2)*Z_0/V_2', 'Across a shunt part V_1 = V_2 and I_1 = Y_p V_2 + I_2.'],
      ['y_in = I_2*Z_0/V_2 + Y_p*Z_0 = y_L + y_p', 'Split the fraction: the first term is the admittance at the output.'],
    ],
  },
  // ABCD (eqs. 25–28).
  { id: 'abcd', title: 'ABCD matrix of a two-port', text: '[V_1; I_1] = [A, B; C, D]*[V_2; I_2]', sources: [src(S3, '§2.2.6')], assumptions: ['I_2 flows out of port 2'], engine: 'parts.partMatrix, network.applyPart', symbols: ABCD_SYMBOLS },
  { id: 'abcd-cascade', title: 'Parts in cascade', text: '[A, B; C, D] = [A_1, B_1; C_1, D_1]*[A_2, B_2; C_2, D_2]', sources: [src(S3, '§2.2.6')], assumptions: ['I_2 flows out of port 2'], engine: 'network.applyPart twice', symbols: ABCD_SYMBOLS },
  { id: 'abcd-reciprocal', title: 'A reciprocal two-port', text: 'A*D - B*C = 1', sources: [src(S3, '§2.2.6')], assumptions: ['reciprocal two-port'], engine: 'parts.partMatrix', symbols: ABCD_SYMBOLS },
  { id: 'abcd-series', title: 'ABCD of a series impedance', text: '[A, B; C, D] = [1, Z; 0, 1]', sources: [src(S3, 'Table 2.2.6.1')], assumptions: [], engine: 'parts.partMatrix (series parts)', symbols: ABCD_SYMBOLS },
  { id: 'abcd-shunt', title: 'ABCD of a shunt admittance', text: '[A, B; C, D] = [1, 0; Y, 1]', sources: [src(S3, 'Table 2.2.6.1')], assumptions: [], engine: 'parts.partMatrix (shunt parts)', symbols: ABCD_SYMBOLS },
  {
    id: 'abcd-line', title: 'ABCD of a line', text: '[A, B; C, D] = [cos(beta*ell), j*Z_c*sin(beta*ell); j*Y_c*sin(beta*ell), cos(beta*ell)]',
    sources: [src(S3, 'Table 2.2.6.1')], assumptions: [LOSSLESS], engine: 'parts.partMatrix (LINE, QUARTER)', symbols: ABCD_SYMBOLS,
  },
  { id: 'abcd-stub-short', title: 'ABCD of a shorted shunt stub', text: '[A, B; C, D] = [1, 0; -j/(Z_c*tan(theta)), 1]', sources: [src(S3, 'Table 2.2.6.1')], assumptions: [LOSSLESS], engine: 'parts.partMatrix (STUB_SHORT)', symbols: ABCD_SYMBOLS },
  { id: 'abcd-stub-open', title: 'ABCD of an open shunt stub', text: '[A, B; C, D] = [1, 0; j*tan(theta)/Z_c, 1]', sources: [src(S3, 'Table 2.2.6.1')], assumptions: [LOSSLESS], engine: 'parts.partMatrix (STUB_OPEN)', symbols: ABCD_SYMBOLS },
  {
    id: 'abcd-zin', title: 'Input impedance of a two-port', text: 'Z_in = (A*Z_L + B)/(C*Z_L + D)', sources: [],
    derivation: 'Put V_2 = Z_L I_2 into the ABCD matrix (facts.md eq. 27); [S3] does not print it.', assumptions: ['I_2 flows out of port 2'], engine: 'network.evaluate (one part)', symbols: ABCD_SYMBOLS,
    steps: [
      ['V_1 = A*V_2 + B*I_2 = (A*Z_L + B)*I_2', 'The first row with V_2 = Z_L I_2.'],
      ['I_1 = C*V_2 + D*I_2 = (C*Z_L + D)*I_2', 'The second row.'],
      ['Z_in = V_1/I_1 = (A*Z_L + B)/(C*Z_L + D)', 'Divide; I_2 cancels.'],
    ],
  },
  // A part maps Γ by a Möbius transformation (theory.md §4, claims 67–69): abcd-zin conjugated by z-gamma and gamma-z.
  {
    id: 'mobius', title: 'A part maps Γ by a Möbius transformation', text: 'Gamma_in = (a*Gamma_L + b)/(c*Gamma_L + d)',
    sources: [src('WikiMobius', '"Elementary properties"')],
    derivation: 'abcd-zin with Z_L = Z_0 (1 + Γ_L)/(1 − Γ_L) (z-gamma), then gamma-z for Γ_in; a, b, c, d up to a common factor. A series z gives a = 2 − z, b = z, c = −z, d = 2 + z.',
    assumptions: [REAL_Z0, 'ideal part, fixed value'], engine: 'geometry.partMobius, geometry.mobApply',
    symbols: {
      ...ABCD_SYMBOLS,
      a: sym('entry a of the part’s map of Γ', '', 'part'), b: sym('entry b of the part’s map of Γ', '', 'part'),
      c: sym('entry c of the part’s map of Γ', '', 'part'), d: sym('entry d of the part’s map of Γ', '', 'part'),
    },
    steps: [
      ['a = A - B/Z_0 - C*Z_0 + D', 'The coefficient of Γ_L above the line, after Z_L = Z_0 (1 + Γ_L)/(1 − Γ_L) is put into (A Z_L + B)/(C Z_L + D) and Γ = (Z − Z_0)/(Z + Z_0) is taken of the result.'],
      ['b = A + B/Z_0 - C*Z_0 - D', 'The constant term above the line.'],
      ['c = A - B/Z_0 + C*Z_0 - D', 'The coefficient of Γ_L below the line.'],
      ['d = A + B/Z_0 + C*Z_0 + D', 'The constant term below the line.'],
    ],
  },
  { id: 'node-z', title: 'Impedance at a node', text: 'z = V/(I*Z_0)', sources: [], derivation: 'A node is (V, I) at the port towards the load (engine.md §4).', assumptions: [REAL_Z0], engine: 'network.nodeMetrics' },
];

function build(d: Def): Equation {
  const tree = parse(d.text);
  const steps = (d.steps ?? []).map(([text, why]): Step => ({ text, tree: parse(text), why }));
  const variables = variablesOf(tree);
  for (const s of steps) variablesOf(s.tree, variables);
  return {
    id: d.id, title: d.title, text: d.text, tree, sources: d.sources ?? [], derivation: d.derivation, owner: d.owner,
    assumptions: d.assumptions ?? [], steps, engine: d.engine, variables, symbols: d.symbols,
  };
}

const t0 = typeof performance !== 'undefined' ? performance.now() : 0;

/** Every equation of the tool, parsed. */
export const EQUATIONS: readonly Equation[] = DEFS.map(build);

/** Milliseconds this module took to parse the registry when it loaded. */
export const PARSE_MS = typeof performance !== 'undefined' ? performance.now() - t0 : 0;

export const EQUATION_BY_ID: ReadonlyMap<string, Equation> = new Map(EQUATIONS.map((e) => [e.id, e]));

/** What a variable means in an entry (its own symbols first, then SYMBOLS); undefined for an unknown name. */
export function symbolOf(eq: Equation, name: string): SymbolInfo | undefined {
  return eq.symbols?.[name] ?? SYMBOLS[name];
}
