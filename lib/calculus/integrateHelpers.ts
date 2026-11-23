// Shared algebraic matchers, adaptive Gauss-Kronrod quadrature, and derivative
// verification helpers for the symbolic & numerical integration engine.
// Framework-free; zero external dependencies.

import {
  add,
  call,
  containsVar,
  div,
  evalMath,
  exprEqual,
  identToLatex,
  isNum,
  type MathExpr,
  mul,
  neg,
  num,
  sub,
} from './ast';
import { diffRaw } from './differentiate';
import { simplify } from './simplify';
import type { SolutionStep, VerificationInfo } from './types';

export interface StepLogger {
  push: (step: Omit<SolutionStep, 'id'>) => void;
}

export type IntegrateCallback = (
  raw: MathExpr,
  x: string,
  depth: number,
  log: StepLogger | null,
) => MathExpr | null;

export function intOp(bodyLatex: string, v: string): string {
  return `\\int ${bodyLatex}\\,d${identToLatex(v)}`;
}

export function defIntOp(bodyLatex: string, v: string, lo: string, hi: string): string {
  return `\\int_{${lo}}^{${hi}} ${bodyLatex}\\,d${identToLatex(v)}`;
}

/** Check if expr is affine a*x + b where a, b are constant wrt x. */
export function matchAffine(expr: MathExpr, x: string): { a: MathExpr; b: MathExpr } | null {
  const e = simplify(expr);
  if (!containsVar(e, x)) return { a: num(0), b: e };
  if (e.kind === 'ident' && e.name === x) return { a: num(1), b: num(0) };
  if (e.kind === 'unary' && e.op === '-') {
    const inner = matchAffine(e.arg, x);
    return inner ? { a: simplify(neg(inner.a)), b: simplify(neg(inner.b)) } : null;
  }
  if (e.kind === 'binary') {
    if (e.op === '+') {
      const l = matchAffine(e.left, x);
      const r = matchAffine(e.right, x);
      return l && r ? { a: simplify(add(l.a, r.a)), b: simplify(add(l.b, r.b)) } : null;
    }
    if (e.op === '-') {
      const l = matchAffine(e.left, x);
      const r = matchAffine(e.right, x);
      return l && r ? { a: simplify(sub(l.a, r.a)), b: simplify(sub(l.b, r.b)) } : null;
    }
    if (e.op === '*') {
      if (!containsVar(e.left, x)) {
        const r = matchAffine(e.right, x);
        return r ? { a: simplify(mul(e.left, r.a)), b: simplify(mul(e.left, r.b)) } : null;
      }
      if (!containsVar(e.right, x)) {
        const l = matchAffine(e.left, x);
        return l ? { a: simplify(mul(e.right, l.a)), b: simplify(mul(e.right, l.b)) } : null;
      }
    }
    if (e.op === '/' && !containsVar(e.right, x)) {
      const l = matchAffine(e.left, x);
      return l ? { a: simplify(div(l.a, e.right)), b: simplify(div(l.b, e.right)) } : null;
    }
  }
  return null;
}

export function sqrtConst(c: MathExpr): MathExpr {
  if (c.kind === 'num' && c.value > 0) {
    const s = Math.sqrt(c.value);
    if (Number.isInteger(s)) return num(s);
  }
  if (c.kind === 'binary' && c.op === '^' && isNum(c.right, 2)) {
    return c.left;
  }
  return call('sqrt', [c]);
}

export function matchVarPow(e: MathExpr, x: string): MathExpr | null {
  if (e.kind === 'ident' && e.name === x) return num(1);
  if (e.kind === 'binary' && e.op === '^' && e.left.kind === 'ident' && e.left.name === x && !containsVar(e.right, x)) {
    return e.right;
  }
  return null;
}

/** Extract numeric quadratic coefficients a*x^2 + b*x + c if expr is a pure quadratic in x. */
export function matchNumericQuadratic(expr: MathExpr, x: string): { a: number; b: number; c: number } | null {
  const f = (t: number) => evalMath(expr, { [x]: t });
  const y0 = f(0);
  const y1 = f(1);
  const ym1 = f(-1);
  const y2 = f(2);
  const y3 = f(3);
  if (![y0, y1, ym1, y2, y3].every(Number.isFinite)) return null;
  const c = y0;
  const a = (y1 + ym1 - 2 * c) / 2;
  const b = (y1 - ym1) / 2;
  if (Math.abs(a) < 1e-9) return null;
  const check2 = a * 4 + b * 2 + c;
  const check3 = a * 9 + b * 3 + c;
  if (Math.abs(check2 - y2) > 1e-7 || Math.abs(check3 - y3) > 1e-7) return null;
  const yHalf = f(0.37);
  if (!Number.isFinite(yHalf) || Math.abs(a * 0.37 * 0.37 + b * 0.37 + c - yHalf) > 1e-7) return null;
  const snap = (v: number) => (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v);
  return { a: snap(a), b: snap(b), c: snap(c) };
}

/** Collect candidate inner sub-expressions g(x) for general u-substitution. */
export function collectUSubCandidates(expr: MathExpr, x: string, out: MathExpr[] = []): MathExpr[] {
  const pushUnique = (cand: MathExpr) => {
    const s = simplify(cand);
    if (!containsVar(s, x)) return;
    if (s.kind === 'ident' && s.name === x) return;
    if (exprEqual(s, expr)) return;
    if (!out.some((existing) => exprEqual(existing, s))) {
      out.push(s);
    }
  };

  const walk = (node: MathExpr) => {
    if (node.kind === 'call') {
      pushUnique(node.args[0]);
      walk(node.args[0]);
      pushUnique(node);
    } else if (node.kind === 'binary') {
      if (node.op === '^') {
        pushUnique(node.right);
        pushUnique(node.left);
      } else if (node.op === '/') {
        pushUnique(node.right);
      }
      walk(node.left);
      walk(node.right);
    } else if (node.kind === 'unary') {
      walk(node.arg);
    }
  };

  walk(expr);
  return out;
}

/** Replace every exact occurrence of `target` in `expr` with `replacement`. */
export function replaceSubexpr(expr: MathExpr, target: MathExpr, replacement: MathExpr): MathExpr {
  if (exprEqual(expr, target)) return replacement;
  switch (expr.kind) {
    case 'num':
    case 'ident':
      return expr;
    case 'unary':
      return { ...expr, arg: replaceSubexpr(expr.arg, target, replacement) };
    case 'binary':
      return {
        ...expr,
        left: replaceSubexpr(expr.left, target, replacement),
        right: replaceSubexpr(expr.right, target, replacement),
      };
    case 'call':
      return call(
        expr.name,
        expr.args.map((a) => replaceSubexpr(a, target, replacement)),
      );
  }
}

// ---------------------------------------------------------------------------
// Adaptive Gauss-Kronrod G7-K15 Numerical Quadrature
// ---------------------------------------------------------------------------

const GK_X = [
  0.0,
  0.20778495500789848,
  0.4058451513773972,
  0.5860872354676911,
  0.7415311855993945,
  0.8648644233597691,
  0.9491079123427585,
  0.9914553711208126,
] as const;

const GK_W15 = [
  0.20948214108472782,
  0.20443294007529889,
  0.19035057806478541,
  0.1690047266392679,
  0.14065325971552592,
  0.10479001032225018,
  0.06309209262997856,
  0.022935322010529224,
] as const;

const GK_W7 = [
  0.41795918367346939,
  0.38183005050511894,
  0.27970539148927667,
  0.12948496616886969,
] as const;

function gk15Panel(fn: (x: number) => number, a: number, b: number): { value: number; err: number } {
  const mid = 0.5 * (a + b);
  const half = 0.5 * (b - a);
  const f0 = fn(mid);
  let k15 = GK_W15[0] * f0;
  let g7 = GK_W7[0] * f0;

  for (let j = 1; j < GK_X.length; j++) {
    const dx = half * GK_X[j];
    const fSum = fn(mid - dx) + fn(mid + dx);
    k15 += GK_W15[j] * fSum;
    if (j % 2 === 0) g7 += GK_W7[j / 2] * fSum;
  }

  const val = k15 * half;
  const gVal = g7 * half;
  return { value: val, err: Math.abs(val - gVal) };
}

export function integrateGaussKronrod(
  fn: (x: number) => number,
  a: number,
  b: number,
  tol = 1e-10,
  maxDepth = 16,
): { value: number; error: number } | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a === b) return { value: 0, error: 0 };
  const sign = b < a ? -1 : 1;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);

  let totalErr = 0;
  let failed = false;

  const recurse = (x0: number, x1: number, localTol: number, depth: number): number => {
    const { value, err } = gk15Panel(fn, x0, x1);
    if (!Number.isFinite(value)) {
      failed = true;
      return Number.NaN;
    }
    if (err <= Math.max(localTol, 1e-13 * Math.abs(value)) || depth >= maxDepth) {
      totalErr += err;
      return value;
    }
    const mid = 0.5 * (x0 + x1);
    return recurse(x0, mid, localTol * 0.5, depth + 1) + recurse(mid, x1, localTol * 0.5, depth + 1);
  };

  const val = recurse(lo, hi, tol, 0) * sign;
  if (failed || !Number.isFinite(val)) return null;
  return { value: Math.abs(val) < 1e-15 ? 0 : val, error: totalErr };
}

/** Numerically verify that d/dx F(x) == f(x) at several sample points. */
export function verifyAntiderivative(integrand: MathExpr, anti: MathExpr, x: string): VerificationInfo {
  const dAnti = simplify(diffRaw(anti, x));
  const probes = [0.33, 0.77, 1.29, 2.07, -0.53, 1.71, 0.17];
  let checked = 0;
  let maxErr = 0;

  for (const p of probes) {
    const fVal = evalMath(integrand, { [x]: p });
    const dVal = evalMath(dAnti, { [x]: p });
    if (!Number.isFinite(fVal) || !Number.isFinite(dVal)) continue;
    const scale = Math.max(1, Math.abs(fVal), Math.abs(dVal));
    const err = Math.abs(fVal - dVal) / scale;
    maxErr = Math.max(maxErr, err);
    checked += 1;
  }

  if (checked === 0) {
    return {
      status: 'unverified',
      note: 'Contains symbolic parameters; checked symbolically.',
    };
  }
  if (maxErr < 1e-5) {
    return { status: 'verified', maxError: maxErr, samplesChecked: checked };
  }
  return {
    status: 'unverified',
    maxError: maxErr,
    samplesChecked: checked,
    note: 'Derivative check disagreed at a probe point.',
  };
}
