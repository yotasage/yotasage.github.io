// Symbolic differentiation, algebraic simplification, symbolic indefinite integration,
// and adaptive Gauss-Kronrod G7-K15 numerical quadrature for Smart Calculator.
// Framework-free; zero external dependencies; no node:* imports.

import {
  binaryNode,
  callNode,
  containsVar,
  type Expr,
  identNode,
  numNode,
  unaryNode,
} from './ast';
import { CalcError } from './value';

const EPS = 1e-12;

function isZero(e: Expr): boolean {
  return e.kind === 'num' && Math.abs(e.value) < EPS;
}
function isOne(e: Expr): boolean {
  return e.kind === 'num' && Math.abs(e.value - 1) < EPS;
}
function isNegOne(e: Expr): boolean {
  return e.kind === 'num' && Math.abs(e.value + 1) < EPS;
}
function isCleanFloat(x: number): boolean {
  if (!Number.isFinite(x)) return false;
  if (Number.isInteger(x)) return true;
  // Fold decimals that terminate cleanly in base-10 (e.g. 0.5, 0.25, 0.125)
  const scaled = x * 1e6;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

function exprEqual(a: Expr, b: Expr): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'num':
      return b.kind === 'num' && Math.abs(a.value - b.value) < EPS;
    case 'ident':
      return b.kind === 'ident' && a.name === b.name;
    case 'unit':
      return b.kind === 'unit' && a.spec.symbol === b.spec.symbol;
    case 'unary':
      return b.kind === 'unary' && a.op === b.op && exprEqual(a.arg, b.arg);
    case 'binary':
      return b.kind === 'binary' && a.op === b.op && exprEqual(a.left, b.left) && exprEqual(a.right, b.right);
    case 'call':
      return (
        b.kind === 'call' &&
        a.name === b.name &&
        a.args.length === b.args.length &&
        a.args.every((arg, idx) => exprEqual(arg, b.args[idx]))
      );
    case 'attach':
      return b.kind === 'attach' && a.unit.symbol === b.unit.symbol && exprEqual(a.expr, b.expr);
    case 'convert':
      return b.kind === 'convert' && a.target.symbol === b.target.symbol && exprEqual(a.expr, b.expr);
    case 'assign':
      return b.kind === 'assign' && a.name === b.name && exprEqual(a.expr, b.expr);
  }
}

/** Extract numeric coefficient and symbolic factor from a term: e.g. `-3*x^2` → `[-3, x^2]`. */
function splitCoeff(e: Expr): { coeff: number; base: Expr | null } {
  if (e.kind === 'num') return { coeff: e.value, base: null };
  if (e.kind === 'unary' && e.op === '-') {
    const inner = splitCoeff(e.arg);
    return { coeff: -inner.coeff, base: inner.base };
  }
  if (e.kind === 'binary' && e.op === '*') {
    if (e.left.kind === 'num') return { coeff: e.left.value, base: e.right };
    if (e.right.kind === 'num') return { coeff: e.right.value, base: e.left };
  }
  return { coeff: 1, base: e };
}

function makeScaled(coeff: number, base: Expr | null): Expr {
  if (Math.abs(coeff) < EPS) return numNode(0);
  if (!base) return numNode(coeff);
  if (Math.abs(coeff - 1) < EPS) return base;
  if (Math.abs(coeff + 1) < EPS) return unaryNode('-', base);
  if (coeff < 0) return unaryNode('-', binaryNode('*', numNode(-coeff), base));
  return binaryNode('*', numNode(coeff), base);
}

/** Recursively simplify an AST using safe algebraic identities and clean constant folding. */
export function simplifyExpr(expr: Expr): Expr {
  switch (expr.kind) {
    case 'num':
      return Math.abs(expr.value) < EPS ? numNode(0) : expr;
    case 'ident':
    case 'unit':
      return expr;
    case 'attach':
      return { ...expr, expr: simplifyExpr(expr.expr) };
    case 'convert':
      return { ...expr, expr: simplifyExpr(expr.expr) };
    case 'assign':
      return { ...expr, expr: simplifyExpr(expr.expr) };
    case 'call':
      return callNode(expr.name, expr.args.map(simplifyExpr));
    case 'unary': {
      const arg = simplifyExpr(expr.arg);
      if (expr.op === '+') return arg;
      if (isZero(arg)) return numNode(0);
      if (arg.kind === 'num') return numNode(-arg.value);
      if (arg.kind === 'unary' && arg.op === '-') return arg.arg;
      if (arg.kind === 'binary' && arg.op === '-') return simplifyExpr(binaryNode('-', arg.right, arg.left));
      return unaryNode('-', arg);
    }
    case 'binary': {
      const l = simplifyExpr(expr.left);
      const r = simplifyExpr(expr.right);
      if (expr.op === '+') return simplifyAdd(l, r);
      if (expr.op === '-') return simplifySub(l, r);
      if (expr.op === '*') return simplifyMul(l, r);
      if (expr.op === '/') return simplifyDiv(l, r);
      if (expr.op === '^') return simplifyPow(l, r);
      return binaryNode(expr.op, l, r);
    }
  }
}

function simplifyAdd(l: Expr, r: Expr): Expr {
  if (isZero(l)) return r;
  if (isZero(r)) return l;
  if (l.kind === 'num' && r.kind === 'num') return numNode(l.value + r.value);
  if (r.kind === 'unary' && r.op === '-') return simplifySub(l, r.arg);
  if (r.kind === 'num' && r.value < 0) return simplifySub(l, numNode(-r.value));
  const sl = splitCoeff(l);
  const sr = splitCoeff(r);
  if (sl.base && sr.base && exprEqual(sl.base, sr.base)) {
    return simplifyExpr(makeScaled(sl.coeff + sr.coeff, sl.base));
  }
  return binaryNode('+', l, r);
}

function simplifySub(l: Expr, r: Expr): Expr {
  if (isZero(r)) return l;
  if (isZero(l)) return simplifyExpr(unaryNode('-', r));
  if (l.kind === 'num' && r.kind === 'num') return numNode(l.value - r.value);
  if (exprEqual(l, r)) return numNode(0);
  if (r.kind === 'unary' && r.op === '-') return simplifyAdd(l, r.arg);
  if (r.kind === 'num' && r.value < 0) return simplifyAdd(l, numNode(-r.value));
  const sl = splitCoeff(l);
  const sr = splitCoeff(r);
  if (sl.base && sr.base && exprEqual(sl.base, sr.base)) {
    return simplifyExpr(makeScaled(sl.coeff - sr.coeff, sl.base));
  }
  return binaryNode('-', l, r);
}

function simplifyMul(l: Expr, r: Expr): Expr {
  if (isZero(l) || isZero(r)) return numNode(0);
  if (isOne(l)) return r;
  if (isOne(r)) return l;
  if (isNegOne(l)) return simplifyExpr(unaryNode('-', r));
  if (isNegOne(r)) return simplifyExpr(unaryNode('-', l));
  if (l.kind === 'num' && r.kind === 'num') return numNode(l.value * r.value);

  // Pull unary minus out of products
  if (l.kind === 'unary' && l.op === '-' && r.kind === 'unary' && r.op === '-') {
    return simplifyMul(l.arg, r.arg);
  }
  if (l.kind === 'unary' && l.op === '-') {
    return simplifyExpr(unaryNode('-', simplifyMul(l.arg, r)));
  }
  if (r.kind === 'unary' && r.op === '-') {
    return simplifyExpr(unaryNode('-', simplifyMul(l, r.arg)));
  }

  // Put numeric coefficient on the left & fold nested numeric factors
  if (r.kind === 'num' && l.kind !== 'num') return simplifyMul(r, l);
  if (l.kind === 'num' && r.kind === 'binary' && r.op === '*' && r.left.kind === 'num') {
    return simplifyMul(numNode(l.value * r.left.value), r.right);
  }
  if (l.kind === 'binary' && l.op === '*' && l.left.kind === 'num' && r.kind !== 'num') {
    return simplifyMul(l.left, simplifyMul(l.right, r));
  }
  // Fold `a * (b / c)` when `a` is numeric and divides `c` or multiplies `b`
  if (l.kind === 'num' && r.kind === 'binary' && r.op === '/') {
    return simplifyDiv(simplifyMul(l, r.left), r.right);
  }
  if (r.kind === 'binary' && r.op === '/' && isOne(r.left)) {
    return simplifyDiv(l, r.right);
  }
  if (l.kind === 'binary' && l.op === '/' && isOne(l.left)) {
    return simplifyDiv(r, l.right);
  }

  // Combine same base powers: x * x -> x^2, x * x^n -> x^(n+1)
  if (exprEqual(l, r)) return simplifyPow(l, numNode(2));
  if (r.kind === 'binary' && r.op === '^' && exprEqual(l, r.left)) {
    return simplifyPow(l, simplifyAdd(r.right, numNode(1)));
  }
  if (l.kind === 'binary' && l.op === '^' && exprEqual(l.left, r)) {
    return simplifyPow(r, simplifyAdd(l.right, numNode(1)));
  }
  if (l.kind === 'binary' && l.op === '^' && r.kind === 'binary' && r.op === '^' && exprEqual(l.left, r.left)) {
    return simplifyPow(l.left, simplifyAdd(l.right, r.right));
  }

  return binaryNode('*', l, r);
}

function gcdInt(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function simplifyDiv(l: Expr, r: Expr): Expr {
  if (isZero(l)) return numNode(0);
  if (isOne(r)) return l;
  if (isNegOne(r)) return simplifyExpr(unaryNode('-', l));
  if (exprEqual(l, r)) return numNode(1);

  if (l.kind === 'unary' && l.op === '-' && r.kind === 'unary' && r.op === '-') {
    return simplifyDiv(l.arg, r.arg);
  }
  if (l.kind === 'unary' && l.op === '-') {
    return simplifyExpr(unaryNode('-', simplifyDiv(l.arg, r)));
  }
  if (r.kind === 'unary' && r.op === '-') {
    return simplifyExpr(unaryNode('-', simplifyDiv(l, r.arg)));
  }

  if (l.kind === 'num' && r.kind === 'num' && Math.abs(r.value) > EPS) {
    const q = l.value / r.value;
    if (isCleanFloat(q)) return numNode(q);
    if (Number.isInteger(l.value) && Number.isInteger(r.value)) {
      const g = gcdInt(l.value, r.value);
      if (g > 1) return binaryNode('/', numNode(l.value / g), numNode(r.value / g));
    }
    return binaryNode('/', l, r);
  }

  // Reduce integer factors in `(k * expr) / d`
  if (l.kind === 'binary' && l.op === '*' && l.left.kind === 'num' && r.kind === 'num' && Math.abs(r.value) > EPS) {
    const q = l.left.value / r.value;
    if (isCleanFloat(q)) return simplifyMul(numNode(q), l.right);
    if (Number.isInteger(l.left.value) && Number.isInteger(r.value)) {
      const g = gcdInt(l.left.value, r.value);
      if (g > 1) {
        return simplifyDiv(simplifyMul(numNode(l.left.value / g), l.right), numNode(r.value / g));
      }
    }
  }

  // Nested division `(a / b) / c -> a / (b * c)`
  if (l.kind === 'binary' && l.op === '/') {
    return simplifyDiv(l.left, simplifyMul(l.right, r));
  }

  return binaryNode('/', l, r);
}

function simplifyPow(base: Expr, exp: Expr): Expr {
  if (isZero(exp)) return numNode(1);
  if (isOne(exp)) return base;
  if (isZero(base) && exp.kind === 'num' && exp.value > 0) return numNode(0);
  if (isOne(base)) return numNode(1);
  if (base.kind === 'num' && exp.kind === 'num') {
    const v = Math.pow(base.value, exp.value);
    if (isCleanFloat(v)) return numNode(v);
  }
  if (base.kind === 'binary' && base.op === '^' && base.right.kind === 'num' && exp.kind === 'num') {
    return simplifyPow(base.left, numNode(base.right.value * exp.value));
  }
  return binaryNode('^', base, exp);
}

// ---------------------------------------------------------------------------
// Symbolic Differentiation
// ---------------------------------------------------------------------------

function diffOnce(expr: Expr, x: string): Expr {
  if (!containsVar(expr, x)) return numNode(0);

  switch (expr.kind) {
    case 'num':
    case 'unit':
      return numNode(0);
    case 'ident':
      return expr.name === x ? numNode(1) : numNode(0);
    case 'attach':
    case 'convert':
    case 'assign':
      return diffOnce(expr.expr, x);
    case 'unary':
      return expr.op === '-' ? unaryNode('-', diffOnce(expr.arg, x)) : diffOnce(expr.arg, x);
    case 'binary': {
      const u = expr.left;
      const v = expr.right;
      const du = diffOnce(u, x);
      const dv = diffOnce(v, x);
      switch (expr.op) {
        case '+':
          return binaryNode('+', du, dv);
        case '-':
          return binaryNode('-', du, dv);
        case '*':
          return binaryNode('+', binaryNode('*', du, v), binaryNode('*', u, dv));
        case '/':
          return binaryNode(
            '/',
            binaryNode('-', binaryNode('*', du, v), binaryNode('*', u, dv)),
            binaryNode('^', v, numNode(2)),
          );
        case '^': {
          const uHas = containsVar(u, x);
          const vHas = containsVar(v, x);
          if (uHas && !vHas) {
            return binaryNode('*', binaryNode('*', v, binaryNode('^', u, binaryNode('-', v, numNode(1)))), du);
          }
          if (!uHas && vHas) {
            const lnU = u.kind === 'ident' && u.name === 'e' ? numNode(1) : callNode('ln', [u]);
            return binaryNode('*', binaryNode('*', binaryNode('^', u, v), lnU), dv);
          }
          // General u(x)^v(x) = u^v * (v'*ln(u) + v*u'/u)
          return binaryNode(
            '*',
            binaryNode('^', u, v),
            binaryNode(
              '+',
              binaryNode('*', dv, callNode('ln', [u])),
              binaryNode('/', binaryNode('*', v, du), u),
            ),
          );
        }
        default:
          throw new CalcError(`Cannot symbolically differentiate operator "${expr.op}"`);
      }
    }
    case 'call': {
      if (expr.args.length !== 1) {
        throw new CalcError(`Cannot symbolically differentiate ${expr.name}() with ${expr.args.length} arguments`);
      }
      const u = expr.args[0];
      const du = diffOnce(u, x);
      const fn = expr.name.toLowerCase();
      let outer: Expr;
      switch (fn) {
        case 'sin':
          outer = callNode('cos', [u]);
          break;
        case 'cos':
          outer = unaryNode('-', callNode('sin', [u]));
          break;
        case 'tan':
          outer = binaryNode('/', numNode(1), binaryNode('^', callNode('cos', [u]), numNode(2)));
          break;
        case 'sec':
          outer = binaryNode('*', callNode('sec', [u]), callNode('tan', [u]));
          break;
        case 'csc':
          outer = unaryNode('-', binaryNode('*', callNode('csc', [u]), callNode('cot', [u])));
          break;
        case 'cot':
          outer = unaryNode('-', binaryNode('/', numNode(1), binaryNode('^', callNode('sin', [u]), numNode(2))));
          break;
        case 'asin':
          outer = binaryNode('/', numNode(1), callNode('sqrt', [binaryNode('-', numNode(1), binaryNode('^', u, numNode(2)))]));
          break;
        case 'acos':
          outer = unaryNode('-', binaryNode('/', numNode(1), callNode('sqrt', [binaryNode('-', numNode(1), binaryNode('^', u, numNode(2)))])));
          break;
        case 'atan':
          outer = binaryNode('/', numNode(1), binaryNode('+', numNode(1), binaryNode('^', u, numNode(2))));
          break;
        case 'sinh':
          outer = callNode('cosh', [u]);
          break;
        case 'cosh':
          outer = callNode('sinh', [u]);
          break;
        case 'tanh':
          outer = binaryNode('/', numNode(1), binaryNode('^', callNode('cosh', [u]), numNode(2)));
          break;
        case 'asinh':
          outer = binaryNode('/', numNode(1), callNode('sqrt', [binaryNode('+', binaryNode('^', u, numNode(2)), numNode(1))]));
          break;
        case 'acosh':
          outer = binaryNode('/', numNode(1), callNode('sqrt', [binaryNode('-', binaryNode('^', u, numNode(2)), numNode(1))]));
          break;
        case 'atanh':
          outer = binaryNode('/', numNode(1), binaryNode('-', numNode(1), binaryNode('^', u, numNode(2))));
          break;
        case 'exp':
          outer = callNode('exp', [u]);
          break;
        case 'ln':
          outer = binaryNode('/', numNode(1), u);
          break;
        case 'log':
        case 'log10':
          outer = binaryNode('/', numNode(1), binaryNode('*', u, callNode('ln', [numNode(10)])));
          break;
        case 'log2':
          outer = binaryNode('/', numNode(1), binaryNode('*', u, callNode('ln', [numNode(2)])));
          break;
        case 'sqrt':
          outer = binaryNode('/', numNode(1), binaryNode('*', numNode(2), callNode('sqrt', [u])));
          break;
        case 'cbrt':
          outer = binaryNode('/', numNode(1), binaryNode('*', numNode(3), binaryNode('^', u, binaryNode('/', numNode(2), numNode(3)))));
          break;
        case 'abs':
          outer = binaryNode('/', u, callNode('abs', [u]));
          break;
        default:
          throw new CalcError(`Symbolic derivative of "${expr.name}()" is not supported`);
      }
      return binaryNode('*', outer, du);
    }
  }
}

/** Symbolically differentiate `expr` with respect to `varName`, `order` times (default 1). */
export function differentiate(expr: Expr, varName: string, order = 1): Expr {
  if (!Number.isInteger(order) || order < 0 || order > 12) {
    throw new CalcError(`Derivative order must be an integer between 0 and 12 (got ${order})`);
  }
  let cur = simplifyExpr(expr);
  for (let i = 0; i < order; i++) {
    cur = simplifyExpr(diffOnce(cur, varName));
  }
  return cur;
}

// ---------------------------------------------------------------------------
// Symbolic Indefinite Integration
// ---------------------------------------------------------------------------

/** Check whether `expr` is affine in `x`: `a*x + b` where `a, b` do not depend on `x`. */
function matchAffine(expr: Expr, x: string): { a: Expr; b: Expr } | null {
  const e = simplifyExpr(expr);
  if (!containsVar(e, x)) return { a: numNode(0), b: e };
  if (e.kind === 'ident' && e.name === x) return { a: numNode(1), b: numNode(0) };
  if (e.kind === 'unary' && e.op === '-') {
    const inner = matchAffine(e.arg, x);
    return inner ? { a: simplifyExpr(unaryNode('-', inner.a)), b: simplifyExpr(unaryNode('-', inner.b)) } : null;
  }
  if (e.kind === 'binary') {
    if (e.op === '+') {
      const l = matchAffine(e.left, x);
      const r = matchAffine(e.right, x);
      return l && r ? { a: simplifyExpr(binaryNode('+', l.a, r.a)), b: simplifyExpr(binaryNode('+', l.b, r.b)) } : null;
    }
    if (e.op === '-') {
      const l = matchAffine(e.left, x);
      const r = matchAffine(e.right, x);
      return l && r ? { a: simplifyExpr(binaryNode('-', l.a, r.a)), b: simplifyExpr(binaryNode('-', l.b, r.b)) } : null;
    }
    if (e.op === '*') {
      if (!containsVar(e.left, x)) {
        const r = matchAffine(e.right, x);
        return r ? { a: simplifyExpr(binaryNode('*', e.left, r.a)), b: simplifyExpr(binaryNode('*', e.left, r.b)) } : null;
      }
      if (!containsVar(e.right, x)) {
        const l = matchAffine(e.left, x);
        return l ? { a: simplifyExpr(binaryNode('*', e.right, l.a)), b: simplifyExpr(binaryNode('*', e.right, l.b)) } : null;
      }
    }
    if (e.op === '/' && !containsVar(e.right, x)) {
      const l = matchAffine(e.left, x);
      return l ? { a: simplifyExpr(binaryNode('/', l.a, e.right)), b: simplifyExpr(binaryNode('/', l.b, e.right)) } : null;
    }
  }
  return null;
}

/** Expand simple polynomial products like `(x + 1) * (x - 2)` to enable term-by-term integration. */
function tryExpandProduct(l: Expr, r: Expr): Expr | null {
  if (l.kind === 'binary' && (l.op === '+' || l.op === '-')) {
    return binaryNode(l.op, binaryNode('*', l.left, r), binaryNode('*', l.right, r));
  }
  if (r.kind === 'binary' && (r.op === '+' || r.op === '-')) {
    return binaryNode(r.op, binaryNode('*', l, r.left), binaryNode('*', l, r.right));
  }
  return null;
}

/** Extract `x^n` power when `e` is `x` (`n=1`) or `x^n` (constant `n`). */
function matchVarPow(e: Expr, x: string): Expr | null {
  if (e.kind === 'ident' && e.name === x) return numNode(1);
  if (e.kind === 'binary' && e.op === '^' && e.left.kind === 'ident' && e.left.name === x && !containsVar(e.right, x)) {
    return e.right;
  }
  return null;
}

/** Match `c + k^2 * u^2` or `a^2 ± (m*x + b)^2` for arctan / arcsin forms. */
function matchQuadSumOrDiff(
  e: Expr,
  x: string,
): { sign: '+' | '-'; constTerm: Expr; linear: { a: Expr; b: Expr }; u: Expr } | null {
  if (e.kind !== 'binary' || (e.op !== '+' && e.op !== '-')) return null;

  const checkPair = (constPart: Expr, sqPart: Expr, sign: '+' | '-') => {
    if (containsVar(constPart, x)) return null;
    if (sqPart.kind === 'binary' && sqPart.op === '^' && sqPart.right.kind === 'num' && Math.abs(sqPart.right.value - 2) < EPS) {
      const lin = matchAffine(sqPart.left, x);
      if (lin && !isZero(lin.a)) return { sign, constTerm: constPart, linear: lin, u: sqPart.left };
    }
    return null;
  };

  if (e.op === '+') {
    return checkPair(e.left, e.right, '+') ?? checkPair(e.right, e.left, '+');
  }
  // `constTerm - (linear)^2`
  return checkPair(e.left, e.right, '-');
}

function sqrtConst(c: Expr): Expr {
  if (c.kind === 'num' && c.value > 0) {
    const s = Math.sqrt(c.value);
    if (isCleanFloat(s)) return numNode(s);
  }
  if (c.kind === 'binary' && c.op === '^' && c.right.kind === 'num' && Math.abs(c.right.value - 2) < EPS) {
    return c.left;
  }
  return callNode('sqrt', [c]);
}

function integrateCore(raw: Expr, x: string, depth: number): Expr | null {
  if (depth > 16) return null;
  const e = simplifyExpr(raw);

  // Constant with respect to x
  if (!containsVar(e, x)) {
    return simplifyExpr(binaryNode('*', e, identNode(x)));
  }

  // Variable x itself
  if (e.kind === 'ident' && e.name === x) {
    return simplifyExpr(binaryNode('/', binaryNode('^', identNode(x), numNode(2)), numNode(2)));
  }

  // Unary
  if (e.kind === 'unary') {
    const inner = integrateCore(e.arg, x, depth + 1);
    if (!inner) return null;
    return simplifyExpr(e.op === '-' ? unaryNode('-', inner) : inner);
  }

  // Sum / Difference (linearity)
  if (e.kind === 'binary' && (e.op === '+' || e.op === '-')) {
    const il = integrateCore(e.left, x, depth + 1);
    const ir = integrateCore(e.right, x, depth + 1);
    if (!il || !ir) return null;
    return simplifyExpr(binaryNode(e.op, il, ir));
  }

  // Constant factor pullout in multiplication & division
  if (e.kind === 'binary' && e.op === '*') {
    if (!containsVar(e.left, x)) {
      const ir = integrateCore(e.right, x, depth + 1);
      return ir ? simplifyExpr(binaryNode('*', e.left, ir)) : null;
    }
    if (!containsVar(e.right, x)) {
      const il = integrateCore(e.left, x, depth + 1);
      return il ? simplifyExpr(binaryNode('*', e.right, il)) : null;
    }

    // Integration by parts: x * exp(a*x+b), x * sin(a*x+b), x * cos(a*x+b), x^n * ln(x)
    const ibp = tryIntegrateByParts(e.left, e.right, x) ?? tryIntegrateByParts(e.right, e.left, x);
    if (ibp) return simplifyExpr(ibp);

    // Try expanding product of sums (e.g. (x+1)*(x+2))
    const expanded = tryExpandProduct(e.left, e.right);
    if (expanded) return integrateCore(expanded, x, depth + 1);
    return null;
  }

  if (e.kind === 'binary' && e.op === '/') {
    if (!containsVar(e.right, x)) {
      const il = integrateCore(e.left, x, depth + 1);
      return il ? simplifyExpr(binaryNode('/', il, e.right)) : null;
    }
    if (!containsVar(e.left, x)) {
      const rec = integrateReciprocal(e.right, x);
      return rec ? simplifyExpr(binaryNode('*', e.left, rec)) : null;
    }
    // ln(x) / x -> ln(x)^2 / 2
    if (
      e.left.kind === 'call' &&
      e.left.name.toLowerCase() === 'ln' &&
      e.left.args.length === 1 &&
      e.left.args[0].kind === 'ident' &&
      e.left.args[0].name === x &&
      e.right.kind === 'ident' &&
      e.right.name === x
    ) {
      return simplifyExpr(binaryNode('/', binaryNode('^', callNode('ln', [identNode(x)]), numNode(2)), numNode(2)));
    }
    // Split (f ± g) / h
    if (e.left.kind === 'binary' && (e.left.op === '+' || e.left.op === '-')) {
      const a = integrateCore(binaryNode('/', e.left.left, e.right), x, depth + 1);
      const b = integrateCore(binaryNode('/', e.left.right, e.right), x, depth + 1);
      if (a && b) return simplifyExpr(binaryNode(e.left.op, a, b));
    }
    // x^a / x^b
    const pa = matchVarPow(e.left, x);
    const pb = matchVarPow(e.right, x);
    if (pa && pb) {
      return integrateCore(binaryNode('^', identNode(x), binaryNode('-', pa, pb)), x, depth + 1);
    }
    return null;
  }

  // Power rule & exponential: (a*x+b)^n, c^(a*x+b), sec(a*x+b)^2
  if (e.kind === 'binary' && e.op === '^') {
    const base = e.left;
    const exp = e.right;

    // sec(a*x+b)^2 -> tan(a*x+b)/a
    if (
      base.kind === 'call' &&
      base.name.toLowerCase() === 'sec' &&
      base.args.length === 1 &&
      exp.kind === 'num' &&
      Math.abs(exp.value - 2) < EPS
    ) {
      const lin = matchAffine(base.args[0], x);
      if (lin && !isZero(lin.a)) {
        return simplifyExpr(binaryNode('/', callNode('tan', [base.args[0]]), lin.a));
      }
    }

    // (a*x + b)^n where n is constant
    if (!containsVar(exp, x)) {
      const lin = matchAffine(base, x);
      if (lin && !isZero(lin.a)) {
        if (exp.kind === 'num' && Math.abs(exp.value + 1) < EPS) {
          return simplifyExpr(binaryNode('/', callNode('ln', [callNode('abs', [base])]), lin.a));
        }
        const nPlus1 = simplifyExpr(binaryNode('+', exp, numNode(1)));
        return simplifyExpr(binaryNode('/', binaryNode('^', base, nPlus1), binaryNode('*', lin.a, nPlus1)));
      }
    }

    // c^(a*x + b) where c is constant
    if (!containsVar(base, x)) {
      const lin = matchAffine(exp, x);
      if (lin && !isZero(lin.a)) {
        const lnBase = base.kind === 'ident' && base.name === 'e' ? numNode(1) : callNode('ln', [base]);
        return simplifyExpr(binaryNode('/', e, binaryNode('*', lin.a, lnBase)));
      }
    }
    return null;
  }

  // Elementary function calls with affine argument f(a*x + b)
  if (e.kind === 'call' && e.args.length === 1) {
    const u = e.args[0];
    const lin = matchAffine(u, x);
    if (!lin || isZero(lin.a)) return null;
    const fn = e.name.toLowerCase();
    let anti: Expr | null = null;
    switch (fn) {
      case 'exp':
        anti = callNode('exp', [u]);
        break;
      case 'sin':
        anti = unaryNode('-', callNode('cos', [u]));
        break;
      case 'cos':
        anti = callNode('sin', [u]);
        break;
      case 'tan':
        anti = unaryNode('-', callNode('ln', [callNode('abs', [callNode('cos', [u])])]));
        break;
      case 'sinh':
        anti = callNode('cosh', [u]);
        break;
      case 'cosh':
        anti = callNode('sinh', [u]);
        break;
      case 'ln':
        anti = binaryNode('-', binaryNode('*', u, callNode('ln', [u])), u);
        break;
      case 'sqrt':
        anti = binaryNode('*', binaryNode('/', numNode(2), numNode(3)), binaryNode('^', u, binaryNode('/', numNode(3), numNode(2))));
        break;
      default:
        return null;
    }
    return simplifyExpr(binaryNode('/', anti, lin.a));
  }

  return null;
}

/** Integrate `1 / denom` for affine, power, `cos(u)^2`, `a^2 + u^2`, and `sqrt(a^2 - u^2)`. */
function integrateReciprocal(denom: Expr, x: string): Expr | null {
  // 1 / (a*x + b)
  const lin = matchAffine(denom, x);
  if (lin && !isZero(lin.a)) {
    return binaryNode('/', callNode('ln', [callNode('abs', [denom])]), lin.a);
  }

  // 1 / (a*x + b)^n
  if (denom.kind === 'binary' && denom.op === '^' && !containsVar(denom.right, x)) {
    const innerLin = matchAffine(denom.left, x);
    if (innerLin && !isZero(innerLin.a)) {
      const negExp = simplifyExpr(unaryNode('-', denom.right));
      return integrateCore(binaryNode('^', denom.left, negExp), x, 1);
    }
    // 1 / cos(a*x+b)^2 -> tan(a*x+b)/a
    if (
      denom.left.kind === 'call' &&
      denom.left.name.toLowerCase() === 'cos' &&
      denom.left.args.length === 1 &&
      denom.right.kind === 'num' &&
      Math.abs(denom.right.value - 2) < EPS
    ) {
      const u = denom.left.args[0];
      const cosLin = matchAffine(u, x);
      if (cosLin && !isZero(cosLin.a)) return binaryNode('/', callNode('tan', [u]), cosLin.a);
    }
  }

  // 1 / (a^2 + (k*x + b)^2) -> atan((k*x + b)/a) / (a*k)
  const quad = matchQuadSumOrDiff(denom, x);
  if (quad && quad.sign === '+') {
    const a = sqrtConst(quad.constTerm);
    return binaryNode('/', callNode('atan', [binaryNode('/', quad.u, a)]), binaryNode('*', a, quad.linear.a));
  }

  // 1 / sqrt(a^2 - (k*x + b)^2) -> asin((k*x + b)/a) / k
  if (denom.kind === 'call' && denom.name.toLowerCase() === 'sqrt' && denom.args.length === 1) {
    const innerQuad = matchQuadSumOrDiff(denom.args[0], x);
    if (innerQuad && innerQuad.sign === '-') {
      const a = sqrtConst(innerQuad.constTerm);
      return binaryNode('/', callNode('asin', [binaryNode('/', innerQuad.u, a)]), innerQuad.linear.a);
    }
  }

  return null;
}

/** Standard integration-by-parts patterns: `x*exp(a*x+b)`, `x*sin(a*x+b)`, `x*cos(a*x+b)`, `x^n*ln(x)`. */
function tryIntegrateByParts(polyFactor: Expr, transFactor: Expr, x: string): Expr | null {
  if (transFactor.kind !== 'call' || transFactor.args.length !== 1) return null;
  const fn = transFactor.name.toLowerCase();
  const u = transFactor.args[0];

  // x^n * ln(x)
  if (fn === 'ln' && u.kind === 'ident' && u.name === x) {
    const n = matchVarPow(polyFactor, x);
    if (n) {
      if (n.kind === 'num' && Math.abs(n.value + 1) < EPS) {
        return binaryNode('/', binaryNode('^', callNode('ln', [identNode(x)]), numNode(2)), numNode(2));
      }
      const m = simplifyExpr(binaryNode('+', n, numNode(1)));
      return binaryNode(
        '*',
        binaryNode('^', identNode(x), m),
        binaryNode('-', binaryNode('/', callNode('ln', [identNode(x)]), m), binaryNode('/', numNode(1), binaryNode('^', m, numNode(2)))),
      );
    }
  }

  // x * exp(a*x+b), x * sin(a*x+b), x * cos(a*x+b)
  if (polyFactor.kind === 'ident' && polyFactor.name === x) {
    const lin = matchAffine(u, x);
    if (!lin || isZero(lin.a)) return null;
    const a = lin.a;
    const a2 = binaryNode('^', a, numNode(2));
    if (fn === 'exp') {
      return binaryNode(
        '/',
        binaryNode('*', binaryNode('-', binaryNode('*', a, identNode(x)), numNode(1)), callNode('exp', [u])),
        a2,
      );
    }
    if (fn === 'sin') {
      return binaryNode(
        '/',
        binaryNode('-', callNode('sin', [u]), binaryNode('*', binaryNode('*', a, identNode(x)), callNode('cos', [u]))),
        a2,
      );
    }
    if (fn === 'cos') {
      return binaryNode(
        '/',
        binaryNode('+', callNode('cos', [u]), binaryNode('*', binaryNode('*', a, identNode(x)), callNode('sin', [u]))),
        a2,
      );
    }
  }

  return null;
}

/** Attempt symbolic indefinite integration of `expr` with respect to `varName`. Returns `null` if no closed form matches. */
export function integrateSymbolic(expr: Expr, varName: string): Expr | null {
  return integrateCore(expr, varName, 0);
}

// ---------------------------------------------------------------------------
// Adaptive Gauss-Kronrod G7-K15 Numerical Quadrature
// ---------------------------------------------------------------------------

// Abscissae on [0, 1] (symmetric about 0; index 0 is x=0, odd indices are G7+K15, even > 0 are K15-only)
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

// 15-point Kronrod weights
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

// 7-point Gauss weights (applied at indices 0, 2, 4, 6)
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
    if (j % 2 === 0) {
      g7 += GK_W7[j / 2] * fSum;
    }
  }

  const val = k15 * half;
  const gVal = g7 * half;
  return { value: val, err: Math.abs(val - gVal) };
}

/**
 * Adaptive Gauss-Kronrod G7-K15 numerical integrator over `[a, b]`.
 * Throws `CalcError` if the integrand produces non-finite values or fails to converge.
 */
export function integrateNumeric(
  fn: (x: number) => number,
  a: number,
  b: number,
  tol = 1e-10,
  maxDepth = 18,
): { value: number; error: number } {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new CalcError('Definite integration requires finite bounds');
  }
  if (a === b) return { value: 0, error: 0 };
  const sign = b < a ? -1 : 1;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);

  let totalErr = 0;
  const recurse = (x0: number, x1: number, localTol: number, depth: number): number => {
    const { value, err } = gk15Panel(fn, x0, x1);
    if (!Number.isFinite(value)) {
      throw new CalcError('Integrand is undefined or singular on the integration interval');
    }
    if (err <= Math.max(localTol, 1e-13 * Math.abs(value)) || depth >= maxDepth) {
      totalErr += err;
      return value;
    }
    const mid = 0.5 * (x0 + x1);
    return recurse(x0, mid, localTol * 0.5, depth + 1) + recurse(mid, x1, localTol * 0.5, depth + 1);
  };

  const val = recurse(lo, hi, tol, 0) * sign;
  return { value: Math.abs(val) < 1e-15 ? 0 : val, error: totalErr };
}
