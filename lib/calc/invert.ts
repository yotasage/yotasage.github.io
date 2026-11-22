// Symbolic single-occurrence equation rearranger and numerical root-finding fallback
// for bidirectional Equation Layouts in Smart Calculator.
// Framework-free; zero external dependencies; no node:* imports.

import {
  binaryNode,
  callNode,
  containsVar,
  type Expr,
  exprToLatex,
  exprToText,
  numNode,
  unaryNode,
} from './ast';
import { simplifyExpr } from './calculus';
import { evalAstNumeric } from './eval';
import { parseExpression } from './parse';
import { dimEqual, dimIsZero, type UnitSpec } from './units';
import { CalcError, type CalcValue, fromNumberAndUnit, makeScalar } from './value';

export interface ParsedEquation {
  lhs: Expr;
  rhs: Expr;
}

/** Split an equation string `"lhs = rhs"` into two ASTs. */
export function parseEquation(equation: string): ParsedEquation {
  const parts = equation.split('=');
  if (parts.length !== 2) {
    throw new CalcError('Equation must contain exactly one "=" sign (e.g. "tau = R * C")');
  }
  const lhsStr = parts[0].trim();
  const rhsStr = parts[1].trim();
  if (!lhsStr || !rhsStr) {
    throw new CalcError('Both sides of "=" must be non-empty');
  }
  return { lhs: parseExpression(lhsStr), rhs: parseExpression(rhsStr) };
}

/** Count how many times identifier `varName` appears in an AST. */
export function countVarOccurrences(expr: Expr, varName: string): number {
  switch (expr.kind) {
    case 'num':
    case 'unit':
      return 0;
    case 'ident':
      return expr.name === varName ? 1 : 0;
    case 'attach':
    case 'convert':
    case 'assign':
      return countVarOccurrences(expr.expr, varName);
    case 'unary':
      return countVarOccurrences(expr.arg, varName);
    case 'binary':
      return countVarOccurrences(expr.left, varName) + countVarOccurrences(expr.right, varName);
    case 'call':
      return expr.args.reduce((sum, a) => sum + countVarOccurrences(a, varName), 0);
  }
}

/**
 * Recursively peel off outer operations from `targetSide` (which contains `x` exactly once)
 * until `targetSide` is just `ident(x)`, moving inverse operations onto `otherSide`.
 */
function isolateSingle(targetSide: Expr, otherSide: Expr, x: string): Expr | null {
  if (targetSide.kind === 'ident' && targetSide.name === x) {
    return simplifyExpr(otherSide);
  }

  if (targetSide.kind === 'unary') {
    if (targetSide.op === '+') return isolateSingle(targetSide.arg, otherSide, x);
    return isolateSingle(targetSide.arg, unaryNode('-', otherSide), x);
  }

  if (targetSide.kind === 'attach' || targetSide.kind === 'convert') {
    return isolateSingle(targetSide.expr, otherSide, x);
  }

  if (targetSide.kind === 'binary') {
    const inLeft = containsVar(targetSide.left, x);
    const inRight = containsVar(targetSide.right, x);
    if (inLeft && inRight) return null;
    if (!inLeft && !inRight) return null;

    const L = targetSide.left;
    const R = targetSide.right;

    switch (targetSide.op) {
      case '+':
        return inLeft
          ? isolateSingle(L, binaryNode('-', otherSide, R), x)
          : isolateSingle(R, binaryNode('-', otherSide, L), x);
      case '-':
        return inLeft
          ? isolateSingle(L, binaryNode('+', otherSide, R), x)
          : isolateSingle(R, binaryNode('-', L, otherSide), x);
      case '*':
        return inLeft
          ? isolateSingle(L, binaryNode('/', otherSide, R), x)
          : isolateSingle(R, binaryNode('/', otherSide, L), x);
      case '/':
        return inLeft
          ? isolateSingle(L, binaryNode('*', otherSide, R), x)
          : isolateSingle(R, binaryNode('/', L, otherSide), x);
      case '^':
        if (inLeft) {
          // L^R = other -> L = other^(1/R) (or sqrt(other) when R === 2)
          if (R.kind === 'num' && Math.abs(R.value - 2) < 1e-12) {
            return isolateSingle(L, callNode('sqrt', [otherSide]), x);
          }
          if (R.kind === 'num' && Math.abs(R.value - 0.5) < 1e-12) {
            return isolateSingle(L, binaryNode('^', otherSide, numNode(2)), x);
          }
          return isolateSingle(L, binaryNode('^', otherSide, binaryNode('/', numNode(1), R)), x);
        }
        // L^R = other -> R = ln(other) / ln(L)
        if (L.kind === 'num' && Math.abs(L.value - 10) < 1e-12) {
          return isolateSingle(R, callNode('log10', [otherSide]), x);
        }
        if (L.kind === 'ident' && L.name === 'e') {
          return isolateSingle(R, callNode('ln', [otherSide]), x);
        }
        return isolateSingle(R, binaryNode('/', callNode('ln', [otherSide]), callNode('ln', [L])), x);
      case '||': {
        // L || R = other -> 1/L = 1/other - 1/R -> L = (other * R) / (R - other)
        const known = inLeft ? R : L;
        const unknown = inLeft ? L : R;
        return isolateSingle(
          unknown,
          binaryNode('/', binaryNode('*', otherSide, known), binaryNode('-', known, otherSide)),
          x,
        );
      }
      default:
        return null;
    }
  }

  if (targetSide.kind === 'call' && targetSide.args.length === 1) {
    const arg = targetSide.args[0];
    const fn = targetSide.name.toLowerCase();
    switch (fn) {
      case 'sqrt':
        return isolateSingle(arg, binaryNode('^', otherSide, numNode(2)), x);
      case 'cbrt':
        return isolateSingle(arg, binaryNode('^', otherSide, numNode(3)), x);
      case 'exp':
        return isolateSingle(arg, callNode('ln', [otherSide]), x);
      case 'ln':
        return isolateSingle(arg, callNode('exp', [otherSide]), x);
      case 'log':
      case 'log10':
        return isolateSingle(arg, binaryNode('^', numNode(10), otherSide), x);
      case 'log2':
        return isolateSingle(arg, binaryNode('^', numNode(2), otherSide), x);
      case 'sin':
        return isolateSingle(arg, callNode('asin', [otherSide]), x);
      case 'cos':
        return isolateSingle(arg, callNode('acos', [otherSide]), x);
      case 'tan':
        return isolateSingle(arg, callNode('atan', [otherSide]), x);
      case 'asin':
        return isolateSingle(arg, callNode('sin', [otherSide]), x);
      case 'acos':
        return isolateSingle(arg, callNode('cos', [otherSide]), x);
      case 'atan':
        return isolateSingle(arg, callNode('tan', [otherSide]), x);
      case 'sinh':
        return isolateSingle(arg, callNode('asinh', [otherSide]), x);
      case 'cosh':
        return isolateSingle(arg, callNode('acosh', [otherSide]), x);
      case 'tanh':
        return isolateSingle(arg, callNode('atanh', [otherSide]), x);
      case 'db':
      case 'db20':
        return isolateSingle(arg, binaryNode('^', numNode(10), binaryNode('/', otherSide, numNode(20))), x);
      case 'db10':
        return isolateSingle(arg, binaryNode('^', numNode(10), binaryNode('/', otherSide, numNode(10))), x);
      default:
        return null;
    }
  }

  return null;
}

export interface SymbolicInversion {
  expr: Expr;
  text: string;
  latex: string;
}

/**
 * Symbolically rearrange `equation` (`"lhs = rhs"`) to isolate `targetVar` when it occurs once.
 * Returns `null` if `targetVar` occurs multiple times or involves non-invertible operations.
 */
export function solveEquationSymbolic(equation: string, targetVar: string): SymbolicInversion | null {
  const { lhs, rhs } = parseEquation(equation);
  const lc = countVarOccurrences(lhs, targetVar);
  const rc = countVarOccurrences(rhs, targetVar);

  let isolated: Expr | null = null;
  if (lc === 1 && rc === 0) {
    isolated = isolateSingle(lhs, rhs, targetVar);
  } else if (rc === 1 && lc === 0) {
    isolated = isolateSingle(rhs, lhs, targetVar);
  }
  if (!isolated) return null;

  const simplified = simplifyExpr(isolated);
  const targetLatex = exprToLatex(parseExpression(targetVar));
  return {
    expr: simplified,
    text: exprToText(simplified),
    latex: `${targetLatex} = ${exprToLatex(simplified)}`,
  };
}

/**
 * Numerical root-finding fallback (log-spaced bracketing + Brent/secant-bisection refinement)
 * for equations where `targetVar` cannot be isolated symbolically.
 */
export function solveEquationNumeric(
  equation: string,
  targetVar: string,
  knownVars: Readonly<Record<string, CalcValue>>,
  targetUnit?: UnitSpec | null,
): CalcValue {
  const { lhs, rhs } = parseEquation(equation);

  const makeCandidate = (x: number): CalcValue =>
    targetUnit ? fromNumberAndUnit(x, targetUnit) : makeScalar(x);

  const residual = (x: number): number | null => {
    try {
      const vars = { ...knownVars, [targetVar]: makeCandidate(x) };
      const l = evalAstNumeric(lhs, { vars });
      const r = evalAstNumeric(rhs, { vars });
      if (!dimEqual(l.dim, r.dim) && !(dimIsZero(l.dim) && dimIsZero(r.dim))) return null;
      const diff = l.re - r.re;
      return Number.isFinite(diff) ? diff : null;
    } catch {
      return null;
    }
  };

  // Probe logarithmic grid across positive, zero, and negative ranges to bracket a root
  const probes: number[] = [0];
  for (let p = -12; p <= 12; p++) {
    const base = Math.pow(10, p);
    probes.push(base, 2 * base, 5 * base);
    probes.push(-base, -2 * base, -5 * base);
  }
  probes.sort((a, b) => a - b);

  let lo = NaN;
  let hi = NaN;
  let fLo = NaN;
  let fHi = NaN;

  let prevX: number | null = null;
  let prevF: number | null = null;

  for (const x of probes) {
    const f = residual(x);
    if (f === null) {
      prevX = null;
      prevF = null;
      continue;
    }
    if (Math.abs(f) < 1e-13) return makeCandidate(x);
    if (prevX !== null && prevF !== null && prevF * f < 0) {
      // Prefer positive bracket if available; break on first positive bracket
      lo = prevX;
      hi = x;
      fLo = prevF;
      fHi = f;
      if (lo >= 0) break;
    }
    prevX = x;
    prevF = f;
  }

  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    throw new CalcError(`Could not find a real numerical solution for "${targetVar}"`);
  }

  // Hybrid secant / bisection root polish
  let a = lo;
  let b = hi;
  let fa = fLo;
  let fb = fHi;

  for (let iter = 0; iter < 120; iter++) {
    const mid = 0.5 * (a + b);
    let cand = mid;
    if (Math.abs(fb - fa) > 1e-18) {
      const sec = b - (fb * (b - a)) / (fb - fa);
      if (sec > Math.min(a, b) && sec < Math.max(a, b)) cand = sec;
    }
    const fc = residual(cand);
    if (fc === null) {
      cand = mid;
      const fm = residual(mid);
      if (fm === null) break;
      if (Math.abs(fm) < 1e-13 || Math.abs(b - a) <= 1e-13 * Math.max(1, Math.abs(mid))) {
        return makeCandidate(mid);
      }
      if (fa * fm <= 0) { b = mid; fb = fm; } else { a = mid; fa = fm; }
      continue;
    }
    if (Math.abs(fc) < 1e-13 || Math.abs(b - a) <= 1e-13 * Math.max(1, Math.abs(cand))) {
      return makeCandidate(cand);
    }
    if (fa * fc <= 0) {
      b = cand;
      fb = fc;
    } else {
      a = cand;
      fa = fc;
    }
  }

  return makeCandidate(0.5 * (a + b));
}
