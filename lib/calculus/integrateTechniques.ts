// Specialized symbolic integration techniques:
// general u-substitution, trigonometric product-to-sum, reciprocal/quadratic
// partial fractions & completing the square, and integration by parts.
// Framework-free; zero external dependencies.

import {
  add,
  call,
  containsVar,
  div,
  EPS,
  exprEqual,
  formatNum,
  ident,
  identToLatex,
  isCleanNumber,
  isNum,
  isOne,
  isZero,
  type MathExpr,
  mul,
  neg,
  num,
  pow,
  sub,
  substituteVar,
  toLatex,
  toText,
} from './ast';
import { diffRaw } from './differentiate';
import {
  collectUSubCandidates,
  type IntegrateCallback,
  intOp,
  matchAffine,
  matchNumericQuadratic,
  matchVarPow,
  replaceSubexpr,
  sqrtConst,
  type StepLogger,
} from './integrateHelpers';
import { simplify } from './simplify';

/** General u-substitution: detect f(g(x)) * g'(x) * k and integrate in u. */
export function tryGeneralUSub(
  expr: MathExpr,
  x: string,
  depth: number,
  log: StepLogger | null,
  integrateFn: IntegrateCallback,
): MathExpr | null {
  if (depth > 3) return null;
  const candidates = collectUSubCandidates(expr, x);
  const uVar = x === 'u' ? 'w' : 'u';
  const vx = identToLatex(x);

  for (const g of candidates) {
    const dg = simplify(diffRaw(g, x));
    if (isZero(dg)) continue;

    const afterDiv = simplify(div(expr, dg));
    const inU = simplify(replaceSubexpr(afterDiv, g, ident(uVar)));
    if (containsVar(inU, x)) continue;

    const antiU = integrateFn(inU, uVar, depth + 2, null);
    if (!antiU) continue;

    const backSub = simplify(substituteVar(antiU, uVar, g));

    if (log && depth <= 1) {
      log.push({
        kind: 'substitution',
        workLatex: `${uVar} = ${toLatex(g)}, \\quad d${uVar} = ${toLatex(dg)}\\,d${vx}`,
        ruleTitle: 'u-Substitution',
        ruleId: 'int-usub',
        ruleFormulaLatex: '\\int f(g(x))\\,g\'(x)\\,dx = \\int f(u)\\,du',
        annotation: `Choose ${uVar} = ${toText(g)} because its derivative ${toText(dg)} cancels the remaining ${x}-factor.`,
        theory: 'u-Substitution reverses the chain rule. Look for an inner function g(x) whose derivative g′(x) appears (up to a constant factor) multiplying the rest of the integrand.',
      });
      log.push({
        kind: 'rewrite',
        workLatex: `${intOp(toLatex(expr), x)} = ${intOp(toLatex(inU), uVar)} = ${toLatex(antiU)}`,
        ruleTitle: `Integrate with respect to ${uVar}`,
        annotation: `Rewrite the integral purely in ${uVar} and find its antiderivative.`,
      });
      log.push({
        kind: 'substitution',
        workLatex: `= ${toLatex(backSub)}`,
        ruleTitle: `Substitute back ${uVar} = ${toText(g)}`,
        annotation: `Replace ${uVar} with ${toText(g)} to express the antiderivative in terms of ${x}.`,
      });
    }

    return backSub;
  }

  return null;
}

/** Product-to-sum identities for sin(ax)*cos(bx), sin(ax)*sin(bx), cos(ax)*cos(bx). */
export function tryTrigProductToSum(
  l: MathExpr,
  r: MathExpr,
  x: string,
  depth: number,
  log: StepLogger | null,
  integrateFn: IntegrateCallback,
): MathExpr | null {
  if (l.kind !== 'call' || r.kind !== 'call' || l.args.length !== 1 || r.args.length !== 1) {
    return null;
  }
  const fnL = l.name;
  const fnR = r.name;
  if (!((fnL === 'sin' || fnL === 'cos') && (fnR === 'sin' || fnR === 'cos'))) {
    return null;
  }
  const aL = matchAffine(l.args[0], x);
  const aR = matchAffine(r.args[0], x);
  if (!aL || !aR || isZero(aL.a) || isZero(aR.a)) return null;

  const A = l.args[0];
  const B = r.args[0];
  if (exprEqual(A, B)) return null;

  const sumAB = simplify(add(A, B));
  const diffAB = simplify(sub(A, B));
  let rewritten: MathExpr;
  let formula: string;

  if (fnL === 'sin' && fnR === 'cos') {
    rewritten = div(add(call('sin', [sumAB]), call('sin', [diffAB])), num(2));
    formula = '\\sin A\\cos B = \\tfrac{1}{2}[\\sin(A+B) + \\sin(A-B)]';
  } else if (fnL === 'cos' && fnR === 'sin') {
    rewritten = div(sub(call('sin', [sumAB]), call('sin', [diffAB])), num(2));
    formula = '\\cos A\\sin B = \\tfrac{1}{2}[\\sin(A+B) - \\sin(A-B)]';
  } else if (fnL === 'cos' && fnR === 'cos') {
    rewritten = div(add(call('cos', [diffAB]), call('cos', [sumAB])), num(2));
    formula = '\\cos A\\cos B = \\tfrac{1}{2}[\\cos(A-B) + \\cos(A+B)]';
  } else {
    rewritten = div(sub(call('cos', [diffAB]), call('cos', [sumAB])), num(2));
    formula = '\\sin A\\sin B = \\tfrac{1}{2}[\\cos(A-B) - \\cos(A+B)]';
  }

  if (log && depth <= 1) {
    log.push({
      kind: 'rewrite',
      workLatex: `${intOp(toLatex(mul(l, r)), x)} = ${intOp(toLatex(rewritten), x)}`,
      ruleTitle: 'Product-to-sum trigonometric identity',
      ruleId: 'trig-prod-to-sum',
      ruleFormulaLatex: formula,
      annotation: 'Convert the trig product into a sum of single trig functions.',
      theory: 'Products of sinusoids at different frequencies decompose into sum and difference frequencies, each of which integrates immediately.',
    });
  }

  return integrateFn(rewritten, x, depth + 1, log);
}

/** Reciprocal integrals: 1/(ax+b), 1/(ax+b)^n, 1/cos^2, 1/(a^2+u^2), 1/sqrt(a^2-u^2), quadratic partial fractions & completing the square. */
export function integrateReciprocal(
  denom: MathExpr,
  x: string,
  depth: number,
  log: StepLogger | null,
  integrateFn: IntegrateCallback,
): MathExpr | null {
  const vx = identToLatex(x);

  // 1 / (a*x + b)
  const lin = matchAffine(denom, x);
  if (lin && !isZero(lin.a)) {
    const res = simplify(div(call('ln', [call('abs', [denom])]), lin.a));
    if (log && depth <= 1) {
      log.push({
        kind: 'rule',
        workLatex: `${intOp(`\\frac{1}{${toLatex(denom)}}`, x)} = ${toLatex(res)}`,
        ruleTitle: 'Logarithmic reciprocal integral',
        ruleId: 'int-reciprocal',
        ruleFormulaLatex: `\\int \\frac{1}{a${vx}+b}\\,d${vx} = \\frac{1}{a}\\ln|a${vx}+b| + C`,
        annotation: isOne(lin.a)
          ? 'Apply ∫ (1/u) du = ln|u|.'
          : `Linear substitution u = ${toText(denom)}, du = ${toText(lin.a)} d${x}.`,
        theory: 'Whenever the denominator is a linear function of x, the antiderivative is a natural logarithm scaled by 1/a.',
      });
    }
    return res;
  }

  // 1 / (a*x + b)^n or 1 / cos^2(u) or 1 / sin^2(u)
  if (denom.kind === 'binary' && denom.op === '^' && !containsVar(denom.right, x)) {
    const innerLin = matchAffine(denom.left, x);
    if (innerLin && !isZero(innerLin.a)) {
      const rewritten = pow(denom.left, simplify(neg(denom.right)));
      if (log && depth <= 1) {
        log.push({
          kind: 'rewrite',
          workLatex: `${intOp(`\\frac{1}{${toLatex(denom)}}`, x)} = ${intOp(toLatex(rewritten), x)}`,
          ruleTitle: 'Negative exponent rewrite',
          ruleId: 'alg-exponents',
          ruleFormulaLatex: '\\frac{1}{u^{n}} = u^{-n}',
          annotation: 'Rewrite reciprocal power with a negative exponent to apply the power rule.',
        });
      }
      return integrateFn(rewritten, x, depth + 1, log);
    }
    if (denom.left.kind === 'call' && denom.left.name === 'cos' && isNum(denom.right, 2)) {
      const arg = denom.left.args[0];
      const cosLin = matchAffine(arg, x);
      if (cosLin && !isZero(cosLin.a)) {
        const res = simplify(div(call('tan', [arg]), cosLin.a));
        if (log && depth <= 1) {
          log.push({
            kind: 'rule',
            workLatex: `${intOp(`\\frac{1}{${toLatex(denom)}}`, x)} = ${intOp(`\\sec^{2}\\left(${toLatex(arg)}\\right)`, x)} = ${toLatex(res)}`,
            ruleTitle: 'Reciprocal identity (1/cos² = sec²)',
            ruleId: 'int-sec2',
            ruleFormulaLatex: '\\int \\frac{1}{\\cos^{2}(u)}\\,du = \\int \\sec^{2}(u)\\,du = \\tan(u) + C',
            annotation: 'Convert 1/cos² to sec² and integrate.',
          });
        }
        return res;
      }
    }
    if (denom.left.kind === 'call' && denom.left.name === 'sin' && isNum(denom.right, 2)) {
      const arg = denom.left.args[0];
      const sinLin = matchAffine(arg, x);
      if (sinLin && !isZero(sinLin.a)) {
        const res = simplify(div(neg(call('cot', [arg])), sinLin.a));
        if (log && depth <= 1) {
          log.push({
            kind: 'rule',
            workLatex: `${intOp(`\\frac{1}{${toLatex(denom)}}`, x)} = ${intOp(`\\csc^{2}\\left(${toLatex(arg)}\\right)`, x)} = ${toLatex(res)}`,
            ruleTitle: 'Reciprocal identity (1/sin² = csc²)',
            ruleId: 'int-csc2',
            ruleFormulaLatex: '\\int \\frac{1}{\\sin^{2}(u)}\\,du = -\\cot(u) + C',
            annotation: 'Convert 1/sin² to csc² and integrate.',
          });
        }
        return res;
      }
    }
  }

  // 1 / sqrt(a^2 - u^2) -> arcsin(u/a) and 1 / sqrt(u^2 + a^2) -> arsinh(u/a)
  if (denom.kind === 'call' && denom.name === 'sqrt' && denom.args.length === 1) {
    const inside = denom.args[0];
    const quad = matchNumericQuadratic(inside, x);
    if (quad && Math.abs(quad.b) < EPS) {
      if (quad.a < 0 && quad.c > 0) {
        const k = sqrtConst(num(-quad.a));
        const a = sqrtConst(num(quad.c));
        const u = simplify(mul(k, ident(x)));
        const res = simplify(div(call('asin', [div(u, a)]), k));
        if (log && depth <= 1) {
          log.push({
            kind: 'rule',
            workLatex: `${intOp(`\\frac{1}{${toLatex(denom)}}`, x)} = ${toLatex(res)}`,
            ruleTitle: 'Inverse sine integral form',
            ruleId: 'int-asin',
            ruleFormulaLatex: '\\int \\frac{1}{\\sqrt{a^{2} - u^{2}}}\\,du = \\arcsin\\left(\\frac{u}{a}\\right) + C',
            annotation: `Match a = ${toText(a)} and u = ${toText(u)}.`,
            theory: 'Substituting u = a sin(θ) turns √(a² − u²) into a cos(θ), canceling du = a cos(θ) dθ and leaving ∫ dθ = θ = arcsin(u/a).',
          });
        }
        return res;
      }
      if (quad.a > 0 && quad.c > 0) {
        const k = sqrtConst(num(quad.a));
        const a = sqrtConst(num(quad.c));
        const u = simplify(mul(k, ident(x)));
        const res = simplify(div(call('asinh', [div(u, a)]), k));
        if (log && depth <= 1) {
          log.push({
            kind: 'rule',
            workLatex: `${intOp(`\\frac{1}{${toLatex(denom)}}`, x)} = ${toLatex(res)}`,
            ruleTitle: 'Inverse hyperbolic sine form',
            ruleId: 'int-hyp',
            ruleFormulaLatex: '\\int \\frac{1}{\\sqrt{u^{2} + a^{2}}}\\,du = \\operatorname{arsinh}\\left(\\frac{u}{a}\\right) + C',
            annotation: `Match a = ${toText(a)} and u = ${toText(u)}.`,
            theory: 'Substituting u = a sinh(t) uses 1 + sinh²(t) = cosh²(t) to remove the square root.',
          });
        }
        return res;
      }
    }
  }

  // Quadratic denominator 1 / (a*x^2 + b*x + c): arctan, partial fractions, or completing the square
  const quad = matchNumericQuadratic(denom, x);
  if (quad) {
    const { a, b, c } = quad;
    const disc = b * b - 4 * a * c;

    if (disc < -EPS) {
      const sign = a > 0 ? 1 : -1;
      const aa = Math.abs(a);
      const bb = b * sign;
      const cc = c * sign;
      const shift = bb / (2 * aa);
      const qVal = (4 * aa * cc - bb * bb) / (4 * aa * aa);
      const qSqrt = sqrtConst(num(qVal));
      const shiftedX = Math.abs(shift) < EPS ? ident(x) : simplify(add(ident(x), num(shift)));
      const res = simplify(
        mul(num(sign), div(call('atan', [div(shiftedX, qSqrt)]), mul(num(aa), qSqrt))),
      );

      if (log && depth <= 1) {
        if (Math.abs(shift) > EPS) {
          const completed = simplify(mul(num(aa), add(pow(shiftedX, num(2)), num(qVal))));
          log.push({
            kind: 'rewrite',
            workLatex: `${toLatex(denom)} = ${toLatex(completed)}`,
            ruleTitle: 'Complete the square',
            ruleId: 'alg-complete-square',
            ruleFormulaLatex: 'ax^{2}+bx+c = a\\left(x + \\frac{b}{2a}\\right)^{2} + \\left(c - \\frac{b^{2}}{4a}\\right)',
            annotation: 'Rewrite the irreducible quadratic as a sum of squares.',
            theory: 'Because the discriminant b² − 4ac < 0, the denominator has no real roots. Completing the square transforms it into the standard arctangent form 1/(u² + k²).',
          });
        }
        log.push({
          kind: 'rule',
          workLatex: `${intOp(`\\frac{1}{${toLatex(denom)}}`, x)} = ${toLatex(res)}`,
          ruleTitle: 'Arctangent integral form',
          ruleId: 'int-atan',
          ruleFormulaLatex: '\\int \\frac{1}{u^{2} + k^{2}}\\,du = \\frac{1}{k}\\arctan\\left(\\frac{u}{k}\\right) + C',
          annotation: `With u = ${toText(shiftedX)} and k = ${toText(qSqrt)}.`,
          theory: 'Factoring k² from the denominator reduces 1/(u² + k²) to (1/k²) · 1/((u/k)² + 1), which integrates directly to arctan(u/k)/k.',
        });
      }
      return res;
    }

    if (disc > EPS) {
      const sqrtD = Math.sqrt(disc);
      const r1 = (-b - sqrtD) / (2 * a);
      const r2 = (-b + sqrtD) / (2 * a);
      if (isCleanNumber(r1) && isCleanNumber(r2)) {
        const coeff = simplify(div(num(1), num(a * (r1 - r2))));
        const f1 = simplify(sub(ident(x), num(r1)));
        const f2 = simplify(sub(ident(x), num(r2)));
        const res = simplify(
          mul(
            coeff,
            sub(call('ln', [call('abs', [f1])]), call('ln', [call('abs', [f2])])),
          ),
        );
        if (log && depth <= 1) {
          log.push({
            kind: 'rewrite',
            workLatex: `\\frac{1}{${toLatex(denom)}} = ${toLatex(coeff)}\\left(\\frac{1}{${toLatex(f1)}} - \\frac{1}{${toLatex(f2)}}\\right)`,
            ruleTitle: 'Partial fraction decomposition',
            ruleId: 'alg-partial-fractions',
            ruleFormulaLatex: '\\frac{1}{(x-r_{1})(x-r_{2})} = \\frac{1}{r_{1}-r_{2}}\\left(\\frac{1}{x-r_{1}} - \\frac{1}{x-r_{2}}\\right)',
            annotation: `Factor denominator using real roots ${x}₁ = ${formatNum(r1, 6)}, ${x}₂ = ${formatNum(r2, 6)}.`,
            theory: 'When a quadratic denominator factors into distinct linear factors, partial fractions splits one hard rational function into two simple 1/(x − r) logarithm integrals.',
          });
          log.push({
            kind: 'rule',
            workLatex: `${intOp(`\\frac{1}{${toLatex(denom)}}`, x)} = ${toLatex(res)}`,
            ruleTitle: 'Integrate each partial fraction',
            ruleId: 'int-reciprocal',
            ruleFormulaLatex: '\\int \\frac{1}{x-r}\\,dx = \\ln|x-r| + C',
            annotation: 'Apply the logarithmic integral to each linear term.',
          });
        }
        return res;
      }
    }

    if (Math.abs(disc) <= EPS) {
      const r = -b / (2 * a);
      if (isCleanNumber(r)) {
        const factor = simplify(sub(ident(x), num(r)));
        const res = simplify(div(num(-1), mul(num(a), factor)));
        if (log && depth <= 1) {
          log.push({
            kind: 'rewrite',
            workLatex: `${toLatex(denom)} = ${toLatex(simplify(mul(num(a), pow(factor, num(2)))))}`,
            ruleTitle: 'Perfect square factorization',
            ruleId: 'alg-complete-square',
            annotation: `Repeated root at ${x} = ${formatNum(r, 6)}.`,
          });
          log.push({
            kind: 'rule',
            workLatex: `${intOp(`\\frac{1}{${toLatex(denom)}}`, x)} = ${toLatex(res)}`,
            ruleTitle: 'Power rule (n = −2)',
            ruleId: 'int-power',
            ruleFormulaLatex: '\\int (x-r)^{-2}\\,dx = -\\frac{1}{x-r} + C',
            annotation: 'Integrate (x − r)⁻² using the power rule.',
          });
        }
        return res;
      }
    }
  }

  // Symbolic parameter forms like 1 / (a^2 + x^2)
  if (denom.kind === 'binary' && denom.op === '+') {
    const checkSym = (cPart: MathExpr, sqPart: MathExpr) => {
      if (containsVar(cPart, x)) return null;
      if (sqPart.kind === 'binary' && sqPart.op === '^' && isNum(sqPart.right, 2)) {
        const sqLin = matchAffine(sqPart.left, x);
        if (sqLin && !isZero(sqLin.a)) {
          const aSym = sqrtConst(cPart);
          return simplify(div(call('atan', [div(sqPart.left, aSym)]), mul(aSym, sqLin.a)));
        }
      }
      return null;
    };
    const symAtan = checkSym(denom.left, denom.right) ?? checkSym(denom.right, denom.left);
    if (symAtan) {
      if (log && depth <= 1) {
        log.push({
          kind: 'rule',
          workLatex: `${intOp(`\\frac{1}{${toLatex(denom)}}`, x)} = ${toLatex(symAtan)}`,
          ruleTitle: 'Arctangent integral form',
          ruleId: 'int-atan',
          ruleFormulaLatex: '\\int \\frac{1}{a^{2} + u^{2}}\\,du = \\frac{1}{a}\\arctan\\left(\\frac{u}{a}\\right) + C',
          annotation: 'Recognize the sum-of-squares denominator pattern.',
        });
      }
      return symAtan;
    }
  }

  return null;
}

/** Integration by parts: x^k * exp/sin/cos (recursive), x^n * ln(x), and cyclic exp(ax) * sin/cos(bx). */
export function tryIntegrateByParts(
  factorA: MathExpr,
  factorB: MathExpr,
  x: string,
  depth: number,
  log: StepLogger | null,
  integrateFn: IntegrateCallback,
): MathExpr | null {
  if (depth > 4) return null;
  const vx = identToLatex(x);

  // Cyclic case: exp(a*x+b) * sin(c*x+d) or exp(a*x+b) * cos(c*x+d)
  if (
    factorA.kind === 'call' &&
    factorA.name === 'exp' &&
    factorB.kind === 'call' &&
    (factorB.name === 'sin' || factorB.name === 'cos')
  ) {
    const linE = matchAffine(factorA.args[0], x);
    const linT = matchAffine(factorB.args[0], x);
    if (linE && linT && !isZero(linE.a) && !isZero(linT.a)) {
      const a = linE.a;
      const b = linT.a;
      const uE = factorA.args[0];
      const uT = factorB.args[0];
      const denom = simplify(add(pow(a, num(2)), pow(b, num(2))));
      const res =
        factorB.name === 'sin'
          ? simplify(
              div(
                mul(call('exp', [uE]), sub(mul(a, call('sin', [uT])), mul(b, call('cos', [uT])))),
                denom,
              ),
            )
          : simplify(
              div(
                mul(call('exp', [uE]), add(mul(a, call('cos', [uT])), mul(b, call('sin', [uT])))),
                denom,
              ),
            );
      if (log && depth <= 1) {
        log.push({
          kind: 'rule',
          workLatex: `I = ${intOp(toLatex(mul(factorA, factorB)), x)}`,
          ruleTitle: 'Cyclic integration by parts (apply twice)',
          ruleId: 'int-ibp',
          ruleFormulaLatex: '\\int u\\,dv = u\\,v - \\int v\\,du',
          annotation: `Apply IBP twice with u = ${toText(factorB)} and dv = ${toText(factorA)} d${x}.`,
          theory: 'Both exponentials and sinusoids repeat after two derivatives. Applying integration by parts twice brings back a multiple of the original integral I, which we solve algebraically for I.',
        });
        log.push({
          kind: 'simplify',
          workLatex: `I = ${toLatex(res)}`,
          ruleTitle: 'Solve algebraically for I',
          annotation: `Move the repeated integral term to the left and divide by a² + b² = ${toText(denom)}.`,
        });
      }
      return res;
    }
  }

  if (factorB.kind !== 'call' || factorB.args.length !== 1) return null;
  const fn = factorB.name;
  const arg = factorB.args[0];

  // Case 1: x^n * ln(k*x)
  if (fn === 'ln') {
    const lin = matchAffine(arg, x);
    const n = matchVarPow(factorA, x);
    if (lin && !isZero(lin.a) && isZero(lin.b) && n) {
      if (isNum(n, -1)) {
        return simplify(div(pow(call('ln', [arg]), num(2)), num(2)));
      }
      const nPlus1 = simplify(add(n, num(1)));
      const vPart = simplify(div(pow(ident(x), nPlus1), nPlus1));
      const duPart = div(num(1), ident(x));
      const remIntegrand = simplify(mul(vPart, duPart));
      const remAnti = simplify(div(pow(ident(x), nPlus1), pow(nPlus1, num(2))));
      const res = simplify(sub(mul(vPart, factorB), remAnti));

      if (log && depth <= 1) {
        log.push({
          kind: 'rule',
          workLatex: `u = ${toLatex(factorB)}, \\quad dv = ${toLatex(factorA)}\\,d${vx} \\implies du = \\frac{1}{${vx}}\\,d${vx}, \\quad v = ${toLatex(vPart)}`,
          ruleTitle: 'Integration by parts (LIATE: L before A)',
          ruleId: 'int-ibp',
          ruleFormulaLatex: '\\int u\\,dv = u\\,v - \\int v\\,du',
          annotation: `Choose u = ${toText(factorB)} (Logarithmic) and dv = ${toText(factorA)} d${x} (Algebraic).`,
          theory: 'By the LIATE heuristic (Logarithmic, Inverse trig, Algebraic, Trigonometric, Exponential), logarithms are chosen for u because differentiating ln(x) turns it into the simple rational function 1/x.',
        });
        log.push({
          kind: 'rewrite',
          workLatex: `= ${toLatex(mul(vPart, factorB))} - ${intOp(toLatex(remIntegrand), x)} = ${toLatex(res)}`,
          ruleTitle: 'Apply uv − ∫ v du and integrate remainder',
          annotation: 'The remaining integral reduces to a single power term.',
        });
      }
      return res;
    }
  }

  // Case 2: x^k * exp(ax+b), x^k * sin(ax+b), x^k * cos(ax+b) for positive integer k = 1..3
  if (fn === 'exp' || fn === 'sin' || fn === 'cos') {
    const nExpr = matchVarPow(factorA, x);
    if (!nExpr || nExpr.kind !== 'num' || !Number.isInteger(nExpr.value) || nExpr.value < 1 || nExpr.value > 3) {
      return null;
    }
    const lin = matchAffine(arg, x);
    if (!lin || isZero(lin.a)) return null;

    const u = factorA;
    const du = simplify(diffRaw(u, x));
    const vAnti = integrateFn(factorB, x, depth + 2, null);
    if (!vAnti) return null;

    const uv = simplify(mul(u, vAnti));
    const remIntegrand = simplify(mul(vAnti, du));

    if (log && depth <= 1) {
      log.push({
        kind: 'rule',
        workLatex: `u = ${toLatex(u)}, \\quad dv = ${toLatex(factorB)}\\,d${vx} \\implies du = ${toLatex(du)}\\,d${vx}, \\quad v = ${toLatex(vAnti)}`,
        ruleTitle: 'Integration by parts (LIATE: A before T/E)',
        ruleId: 'int-ibp',
        ruleFormulaLatex: '\\int u\\,dv = u\\,v - \\int v\\,du',
        annotation: `Choose u = ${toText(u)} so differentiating drops its polynomial degree by 1.`,
        theory: 'Integration by parts reverses the product rule. Choosing the polynomial for u reduces its degree each time until the remaining integral becomes elementary.',
      });
      log.push({
        kind: 'rewrite',
        workLatex: `${intOp(toLatex(mul(factorA, factorB)), x)} = ${toLatex(uv)} - ${intOp(toLatex(remIntegrand), x)}`,
        ruleTitle: 'Apply uv − ∫ v du',
        annotation: 'Substitute u, v, and du into the integration-by-parts formula.',
      });
    }

    const remResult = integrateFn(remIntegrand, x, depth + 1, log);
    if (!remResult) return null;
    return simplify(sub(uv, remResult));
  }

  return null;
}
