// Evaluator of the shared equation engine (lib/equations/parse.ts has the grammar).
//
// Evaluator: a tree is compiled once into a list of closures over one register file of (re, im) pairs. Variables
// live in the same file (at `slots`), every value has a fixed place, so a run allocates nothing.

import type { Node } from './parse';
import { cabs, cdiv, csqrt } from '../complex';

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
      case 'arccos': return () => {
        const x = r[a], y = r[a + 1];
        if (y === 0 && x >= -1 && x <= 1) { r[o] = Math.acos(x); r[o + 1] = 0; return; }
        // The principal value elsewhere (a real x beyond ±1, or a complex z): acos z = −j ln(z + j√(1 − z²)).
        csqrt(r, o, 1 - x * x + y * y, -2 * x * y);
        const wr = x - r[o + 1], wi = y + r[o];
        r[o] = Math.atan2(wi, wr); r[o + 1] = -Math.log(cabs(wr, wi));
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

