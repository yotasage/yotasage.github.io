// Algebraic simplification engine for the Integral and Derivative Solvers.
// Preserves exact fractions when cleaner than decimals, combines like terms,
// folds constants, cancels identities, and optionally records simplification notes.

import {
  add,
  binary,
  call,
  div,
  EPS,
  exprEqual,
  gcdInt,
  isCleanNumber,
  isNegOne,
  isOne,
  isZero,
  type MathExpr,
  mul,
  neg,
  num,
  pow,
  sub,
} from './ast';

export function splitCoeff(e: MathExpr): { coeff: number; base: MathExpr | null } {
  if (e.kind === 'num') return { coeff: e.value, base: null };
  if (e.kind === 'unary' && e.op === '-') {
    const inner = splitCoeff(e.arg);
    return { coeff: -inner.coeff, base: inner.base };
  }
  if (e.kind === 'binary' && e.op === '*') {
    if (e.left.kind === 'num') return { coeff: e.left.value, base: e.right };
    if (e.right.kind === 'num') return { coeff: e.right.value, base: e.left };
  }
  if (e.kind === 'binary' && e.op === '/' && e.right.kind === 'num' && Math.abs(e.right.value) > EPS) {
    const inner = splitCoeff(e.left);
    const ratio = inner.coeff / e.right.value;
    if (isCleanNumber(ratio)) {
      return { coeff: ratio, base: inner.base };
    }
  }
  return { coeff: 1, base: e };
}

function makeScaled(coeff: number, base: MathExpr | null): MathExpr {
  if (Math.abs(coeff) < EPS) return num(0);
  if (!base) return num(coeff);
  if (Math.abs(coeff - 1) < EPS) return base;
  if (Math.abs(coeff + 1) < EPS) return neg(base);
  if (coeff < 0) return neg(mul(num(-coeff), base));
  return mul(num(coeff), base);
}

/** Collect additive terms with signs so `2x + 3 + x` can combine like terms cleanly. */
function flattenSum(expr: MathExpr, sign = 1, out: { sign: 1 | -1; term: MathExpr }[] = []): { sign: 1 | -1; term: MathExpr }[] {
  if (expr.kind === 'binary' && expr.op === '+') {
    flattenSum(expr.left, sign, out);
    flattenSum(expr.right, sign, out);
    return out;
  }
  if (expr.kind === 'binary' && expr.op === '-') {
    flattenSum(expr.left, sign, out);
    flattenSum(expr.right, -sign as 1 | -1, out);
    return out;
  }
  if (expr.kind === 'unary' && expr.op === '-') {
    return flattenSum(expr.arg, -sign as 1 | -1, out);
  }
  out.push({ sign: sign as 1 | -1, term: expr });
  return out;
}

function simplifySumList(raw: MathExpr): MathExpr {
  const flat = flattenSum(raw);
  if (flat.length <= 1) {
    if (flat.length === 0) return num(0);
    return flat[0].sign === -1 ? simplifyOnce(neg(flat[0].term)) : flat[0].term;
  }

  let constAcc = 0;
  const groups: { coeff: number; base: MathExpr }[] = [];

  for (const item of flat) {
    const sc = splitCoeff(item.term);
    const c = item.sign * sc.coeff;
    if (Math.abs(c) < EPS) continue;
    if (!sc.base) {
      constAcc += c;
      continue;
    }
    const existing = groups.find((g) => exprEqual(g.base, sc.base!));
    if (existing) {
      existing.coeff += c;
    } else {
      groups.push({ coeff: c, base: sc.base });
    }
  }

  const terms: { positive: boolean; expr: MathExpr }[] = [];
  for (const g of groups) {
    if (Math.abs(g.coeff) < EPS) continue;
    if (g.coeff < 0) {
      terms.push({ positive: false, expr: makeScaled(-g.coeff, g.base) });
    } else {
      terms.push({ positive: true, expr: makeScaled(g.coeff, g.base) });
    }
  }
  if (Math.abs(constAcc) >= EPS) {
    if (constAcc < 0) {
      terms.push({ positive: false, expr: num(-constAcc) });
    } else {
      terms.push({ positive: true, expr: num(constAcc) });
    }
  }

  if (terms.length === 0) return num(0);
  let acc = terms[0].positive ? terms[0].expr : neg(terms[0].expr);
  for (let i = 1; i < terms.length; i++) {
    acc = terms[i].positive ? add(acc, terms[i].expr) : sub(acc, terms[i].expr);
  }
  return acc;
}

function simplifyAdd(l: MathExpr, r: MathExpr): MathExpr {
  if (isZero(l)) return r;
  if (isZero(r)) return l;
  if (l.kind === 'num' && r.kind === 'num') return num(l.value + r.value);
  if (r.kind === 'unary' && r.op === '-') return simplifySub(l, r.arg);
  if (r.kind === 'num' && r.value < 0) return simplifySub(l, num(-r.value));
  return simplifySumList(add(l, r));
}

function simplifySub(l: MathExpr, r: MathExpr): MathExpr {
  if (isZero(r)) return l;
  if (isZero(l)) return simplifyOnce(neg(r));
  if (l.kind === 'num' && r.kind === 'num') return num(l.value - r.value);
  if (exprEqual(l, r)) return num(0);
  if (r.kind === 'unary' && r.op === '-') return simplifyAdd(l, r.arg);
  if (r.kind === 'num' && r.value < 0) return simplifyAdd(l, num(-r.value));
  return simplifySumList(sub(l, r));
}

function simplifyMul(l: MathExpr, r: MathExpr): MathExpr {
  if (isZero(l) || isZero(r)) return num(0);
  if (isOne(l)) return r;
  if (isOne(r)) return l;
  if (isNegOne(l)) return simplifyOnce(neg(r));
  if (isNegOne(r)) return simplifyOnce(neg(l));
  if (l.kind === 'num' && r.kind === 'num') return num(l.value * r.value);

  // Pull unary minus out
  if (l.kind === 'unary' && l.op === '-' && r.kind === 'unary' && r.op === '-') {
    return simplifyMul(l.arg, r.arg);
  }
  if (l.kind === 'unary' && l.op === '-') {
    return simplifyOnce(neg(simplifyMul(l.arg, r)));
  }
  if (r.kind === 'unary' && r.op === '-') {
    return simplifyOnce(neg(simplifyMul(l, r.arg)));
  }

  // Numeric coefficient always on the left
  if (r.kind === 'num' && l.kind !== 'num') return simplifyMul(r, l);
  if (l.kind === 'num' && r.kind === 'binary' && r.op === '*' && r.left.kind === 'num') {
    return simplifyMul(num(l.value * r.left.value), r.right);
  }
  if (l.kind === 'binary' && l.op === '*' && l.left.kind === 'num' && r.kind !== 'num') {
    return simplifyMul(l.left, simplifyMul(l.right, r));
  }
  if (l.kind !== 'num' && r.kind === 'binary' && r.op === '*' && r.left.kind === 'num') {
    return simplifyMul(r.left, simplifyMul(l, r.right));
  }

  // Fold fractions: (a / b) * c -> (a * c) / b and a * (b / c) -> (a * b) / c
  if (l.kind === 'binary' && l.op === '/' && r.kind === 'binary' && r.op === '/') {
    return simplifyDiv(simplifyMul(l.left, r.left), simplifyMul(l.right, r.right));
  }
  if (l.kind === 'binary' && l.op === '/') {
    return simplifyDiv(simplifyMul(l.left, r), l.right);
  }
  if (r.kind === 'binary' && r.op === '/') {
    return simplifyDiv(simplifyMul(l, r.left), r.right);
  }

  // Combine powers with same base: x * x -> x^2, x^a * x^b -> x^(a+b)
  if (exprEqual(l, r)) return simplifyPow(l, num(2));
  if (r.kind === 'binary' && r.op === '^' && exprEqual(l, r.left)) {
    return simplifyPow(l, simplifyAdd(r.right, num(1)));
  }
  if (l.kind === 'binary' && l.op === '^' && exprEqual(l.left, r)) {
    return simplifyPow(r, simplifyAdd(l.right, num(1)));
  }
  if (
    l.kind === 'binary' &&
    l.op === '^' &&
    r.kind === 'binary' &&
    r.op === '^' &&
    exprEqual(l.left, r.left)
  ) {
    return simplifyPow(l.left, simplifyAdd(l.right, r.right));
  }
  // exp(a) * exp(b) -> exp(a + b)
  if (l.kind === 'call' && l.name === 'exp' && r.kind === 'call' && r.name === 'exp') {
    return call('exp', [simplifyAdd(l.args[0], r.args[0])]);
  }

  return mul(l, r);
}

function flattenMul(e: MathExpr, out: MathExpr[] = []): MathExpr[] {
  if (e.kind === 'binary' && e.op === '*') {
    flattenMul(e.left, out);
    flattenMul(e.right, out);
  } else {
    out.push(e);
  }
  return out;
}

function buildProduct(factors: readonly MathExpr[]): MathExpr {
  if (factors.length === 0) return num(1);
  let acc = factors[0];
  for (let i = 1; i < factors.length; i++) {
    acc = simplifyMul(acc, factors[i]);
  }
  return acc;
}

function simplifyDiv(l: MathExpr, r: MathExpr): MathExpr {
  if (isZero(l)) return num(0);
  if (isOne(r)) return l;
  if (isNegOne(r)) return simplifyOnce(neg(l));
  if (exprEqual(l, r)) return num(1);

  if (l.kind === 'unary' && l.op === '-' && r.kind === 'unary' && r.op === '-') {
    return simplifyDiv(l.arg, r.arg);
  }
  if (l.kind === 'unary' && l.op === '-') {
    return simplifyOnce(neg(simplifyDiv(l.arg, r)));
  }
  if (r.kind === 'unary' && r.op === '-') {
    return simplifyOnce(neg(simplifyDiv(l, r.arg)));
  }

  // Nested divisions: (a / b) / c -> a / (b * c), a / (b / c) -> (a * c) / b
  if (l.kind === 'binary' && l.op === '/') {
    return simplifyDiv(l.left, simplifyMul(l.right, r));
  }
  if (r.kind === 'binary' && r.op === '/') {
    return simplifyDiv(simplifyMul(l, r.right), r.left);
  }

  // Exact integer fraction reduction (keep 1/3, 2/3, 3/4 exact; fold exact integers like 6/2 -> 3)
  if (l.kind === 'num' && r.kind === 'num' && Math.abs(r.value) > EPS) {
    if (Number.isInteger(l.value) && Number.isInteger(r.value)) {
      if (l.value % r.value === 0) return num(l.value / r.value);
      const g = gcdInt(l.value, r.value);
      if (g > 1) return div(num(l.value / g), num(r.value / g));
      return div(l, r);
    }
    const q = l.value / r.value;
    if (isCleanNumber(q)) return num(q);
    return div(l, r);
  }

  // General multiplicative factor cancellation across numerator & denominator
  if ((l.kind === 'binary' && l.op === '*') || (r.kind === 'binary' && r.op === '*')) {
    const numFactors = flattenMul(l);
    const denFactors = flattenMul(r);
    let numCoeff = 1;
    let denCoeff = 1;
    const remNum: MathExpr[] = [];
    const remDen: MathExpr[] = [];

    for (const f of numFactors) {
      if (f.kind === 'num') numCoeff *= f.value;
      else remNum.push(f);
    }
    for (const f of denFactors) {
      if (f.kind === 'num') denCoeff *= f.value;
      else remDen.push(f);
    }

    let canceledAny = false;
    for (let i = remNum.length - 1; i >= 0; i--) {
      const nf = remNum[i];
      const matchIdx = remDen.findIndex((df) => exprEqual(nf, df));
      if (matchIdx !== -1) {
        remNum.splice(i, 1);
        remDen.splice(matchIdx, 1);
        canceledAny = true;
        continue;
      }
      // Cancel x^a against x or x^b
      if (nf.kind === 'binary' && nf.op === '^' && nf.right.kind === 'num') {
        const baseIdx = remDen.findIndex((df) => exprEqual(nf.left, df));
        if (baseIdx !== -1) {
          remDen.splice(baseIdx, 1);
          const nextExp = nf.right.value - 1;
          if (Math.abs(nextExp) < EPS) remNum.splice(i, 1);
          else remNum[i] = simplifyPow(nf.left, num(nextExp));
          canceledAny = true;
        }
      }
    }

    if (canceledAny || (numCoeff !== 1 && denCoeff !== 1)) {
      let cNum = numCoeff;
      let cDen = denCoeff;
      if (Math.abs(cDen) > EPS) {
        if (Number.isInteger(cNum) && Number.isInteger(cDen)) {
          const g = gcdInt(cNum, cDen);
          cNum /= g;
          cDen /= g;
        } else if (isCleanNumber(cNum / cDen)) {
          cNum = cNum / cDen;
          cDen = 1;
        }
      }
      const nextNum = cNum === 1 ? buildProduct(remNum) : simplifyMul(num(cNum), buildProduct(remNum));
      const nextDen = cDen === 1 ? buildProduct(remDen) : simplifyMul(num(cDen), buildProduct(remDen));
      if (isOne(nextDen)) return nextNum;
      if (isNegOne(nextDen)) return simplifyOnce(neg(nextNum));
      if (!exprEqual(nextNum, l) || !exprEqual(nextDen, r)) {
        return div(nextNum, nextDen);
      }
    }
  }

  // Cancel powers of same base: x^a / x^b -> x^(a - b) when both exponents are numeric
  if (l.kind === 'binary' && l.op === '^' && exprEqual(l.left, r) && l.right.kind === 'num') {
    return simplifyPow(l.left, num(l.right.value - 1));
  }
  if (
    l.kind === 'binary' &&
    l.op === '^' &&
    r.kind === 'binary' &&
    r.op === '^' &&
    exprEqual(l.left, r.left) &&
    l.right.kind === 'num' &&
    r.right.kind === 'num'
  ) {
    const diff = l.right.value - r.right.value;
    if (diff >= 0) return simplifyPow(l.left, num(diff));
    return simplifyDiv(num(1), simplifyPow(l.left, num(-diff)));
  }

  return div(l, r);
}

function simplifyPow(base: MathExpr, exp: MathExpr): MathExpr {
  if (isZero(exp)) return num(1);
  if (isOne(exp)) return base;
  if (isZero(base) && exp.kind === 'num' && exp.value > 0) return num(0);
  if (isOne(base)) return num(1);
  if (base.kind === 'num' && exp.kind === 'num') {
    if (Number.isInteger(base.value) && Number.isInteger(exp.value) && exp.value >= 0 && Math.abs(base.value) <= 50 && exp.value <= 8) {
      return num(Math.pow(base.value, exp.value));
    }
    if (Number.isInteger(base.value) && Number.isInteger(exp.value) && exp.value < 0 && Math.abs(base.value) <= 20 && exp.value >= -5) {
      return div(num(1), num(Math.pow(base.value, -exp.value)));
    }
  }
  // (a^b)^c -> a^(b*c) when numeric
  if (base.kind === 'binary' && base.op === '^' && base.right.kind === 'num' && exp.kind === 'num') {
    return simplifyPow(base.left, num(base.right.value * exp.value));
  }
  // e^u -> exp(u)
  if (base.kind === 'ident' && base.name === 'e') {
    return call('exp', [exp]);
  }
  // exp(u)^n -> exp(n*u)
  if (base.kind === 'call' && base.name === 'exp') {
    return call('exp', [simplifyMul(exp, base.args[0])]);
  }
  // sqrt(u)^2 -> u
  if (base.kind === 'call' && base.name === 'sqrt' && isNum(exp, 2)) {
    return base.args[0];
  }
  return pow(base, exp);
}

function isNum(e: MathExpr, v: number): boolean {
  return e.kind === 'num' && Math.abs(e.value - v) < EPS;
}

function simplifyOnce(expr: MathExpr): MathExpr {
  switch (expr.kind) {
    case 'num':
      return Math.abs(expr.value) < 1e-14 ? num(0) : expr;
    case 'ident':
      return expr;
    case 'unary': {
      const a = simplifyOnce(expr.arg);
      if (expr.op === '+') return a;
      if (isZero(a)) return num(0);
      if (a.kind === 'num') return num(-a.value);
      if (a.kind === 'unary' && a.op === '-') return a.arg;
      if (a.kind === 'binary' && a.op === '-') return simplifySub(a.right, a.left);
      return neg(a);
    }
    case 'binary': {
      const l = simplifyOnce(expr.left);
      const r = simplifyOnce(expr.right);
      if (expr.op === '+') return simplifyAdd(l, r);
      if (expr.op === '-') return simplifySub(l, r);
      if (expr.op === '*') return simplifyMul(l, r);
      if (expr.op === '/') return simplifyDiv(l, r);
      return simplifyPow(l, r);
    }
    case 'call': {
      const args = expr.args.map(simplifyOnce);
      const u = args[0];
      if (!u) return call(expr.name, args);
      if (expr.name === 'exp' && isZero(u)) return num(1);
      if (expr.name === 'ln' && isOne(u)) return num(0);
      if (expr.name === 'ln' && u.kind === 'ident' && u.name === 'e') return num(1);
      if (expr.name === 'ln' && u.kind === 'call' && u.name === 'exp') return u.args[0];
      if (expr.name === 'sqrt' && u.kind === 'num' && u.value >= 0) {
        const s = Math.sqrt(u.value);
        if (Number.isInteger(s)) return num(s);
      }
      if (expr.name === 'sin' && isZero(u)) return num(0);
      if (expr.name === 'cos' && isZero(u)) return num(1);
      if (expr.name === 'tan' && isZero(u)) return num(0);
      if (expr.name === 'sinh' && isZero(u)) return num(0);
      if (expr.name === 'cosh' && isZero(u)) return num(1);
      if (expr.name === 'abs' && u.kind === 'num') return num(Math.abs(u.value));
      if (expr.name === 'abs' && u.kind === 'unary' && u.op === '-') return call('abs', [u.arg]);
      if (expr.name === 'abs' && u.kind === 'call' && u.name === 'exp') return u;
      return call(expr.name, args);
    }
  }
}

/** Fixed-point algebraic simplification (up to 6 passes). */
export function simplify(expr: MathExpr): MathExpr {
  let cur = expr;
  for (let i = 0; i < 6; i++) {
    const next = simplifyOnce(cur);
    if (exprEqual(cur, next)) return next;
    cur = next;
  }
  return cur;
}

/** Expand small integer powers (a + b)^2, (a + b)^3 or products of sums when helpful. */
export function expandSmallPoly(expr: MathExpr): MathExpr | null {
  if (expr.kind === 'binary' && expr.op === '*') {
    if (expr.left.kind === 'binary' && (expr.left.op === '+' || expr.left.op === '-')) {
      return simplify(
        binary(expr.left.op, mul(expr.left.left, expr.right), mul(expr.left.right, expr.right)),
      );
    }
    if (expr.right.kind === 'binary' && (expr.right.op === '+' || expr.right.op === '-')) {
      return simplify(
        binary(expr.right.op, mul(expr.left, expr.right.left), mul(expr.left, expr.right.right)),
      );
    }
  }
  if (
    expr.kind === 'binary' &&
    expr.op === '^' &&
    expr.left.kind === 'binary' &&
    (expr.left.op === '+' || expr.left.op === '-') &&
    expr.right.kind === 'num' &&
    (expr.right.value === 2 || expr.right.value === 3)
  ) {
    const a = expr.left.left;
    const b = expr.left.op === '-' ? neg(expr.left.right) : expr.left.right;
    if (expr.right.value === 2) {
      return simplify(add(add(pow(a, num(2)), mul(num(2), mul(a, b))), pow(b, num(2))));
    }
    return simplify(
      add(
        add(pow(a, num(3)), mul(num(3), mul(pow(a, num(2)), b))),
        add(mul(num(3), mul(a, pow(b, num(2)))), pow(b, num(3))),
      ),
    );
  }
  return null;
}
