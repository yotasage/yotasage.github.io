// Step-by-step symbolic & numerical integration engine for the Integral Solver.
// Orchestrates core rules, specialized techniques (u-sub, IBP, trig, partial fractions),
// definite FTC evaluation, Gauss-Kronrod G7-K15 fallback, and derivative verification.

import {
  add,
  call,
  containsVar,
  div,
  evalMath,
  exprEqual,
  formatNum,
  ident,
  identToLatex,
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
import {
  defIntOp,
  integrateGaussKronrod,
  intOp,
  matchAffine,
  matchVarPow,
  type StepLogger,
  verifyAntiderivative,
} from './integrateHelpers';
import {
  integrateReciprocal,
  tryGeneralUSub,
  tryIntegrateByParts,
  tryTrigProductToSum,
} from './integrateTechniques';
import { parseMath } from './parse';
import { expandSmallPoly, simplify } from './simplify';
import type { IntegralOutput, SolutionStep, VerificationInfo } from './types';

export { integrateGaussKronrod } from './integrateHelpers';

/** Core symbolic indefinite integrator returning an antiderivative AST or null. */
function integrateExpr(
  raw: MathExpr,
  x: string,
  depth: number,
  log: StepLogger | null,
): MathExpr | null {
  if (depth > 14) return null;
  const e = simplify(raw);
  const vx = identToLatex(x);

  // 1. Constant rule
  if (!containsVar(e, x)) {
    const res = simplify(mul(e, ident(x)));
    if (log && depth <= 1) {
      log.push({
        kind: 'rule',
        workLatex: `${intOp(toLatex(e), x)} = ${toLatex(res)}`,
        ruleTitle: 'Constant rule',
        ruleId: 'int-constant',
        ruleFormulaLatex: `\\int c\\,d${vx} = c\\,${vx} + C`,
        annotation: `${toText(e)} is constant with respect to ${x}.`,
        theory: 'Integrating a constant c accumulates a rectangle of height c over width x, giving c·x.',
        minor: depth > 0,
      });
    }
    return res;
  }

  // 2. Variable x itself
  if (e.kind === 'ident' && e.name === x) {
    const res = div(pow(ident(x), num(2)), num(2));
    if (log && depth <= 1) {
      log.push({
        kind: 'rule',
        workLatex: `${intOp(vx, x)} = ${toLatex(res)}`,
        ruleTitle: 'Power rule',
        ruleId: 'int-power',
        ruleFormulaLatex: `\\int ${vx}^{n}\\,d${vx} = \\frac{${vx}^{n+1}}{n+1} + C \\quad (n \\neq -1)`,
        annotation: 'Apply the power rule with n = 1.',
        theory: 'Raising the exponent from 1 to 2 and dividing by 2 reverses the differentiation power rule d/dx(x²/2) = x.',
        minor: depth > 0,
      });
    }
    return res;
  }

  // 3. Unary minus / plus
  if (e.kind === 'unary') {
    if (e.op === '+') return integrateExpr(e.arg, x, depth, log);
    if (log && depth === 0) {
      log.push({
        kind: 'rule',
        workLatex: `${intOp(toLatex(e), x)} = -${intOp(toLatex(e.arg), x)}`,
        ruleTitle: 'Constant multiple rule',
        ruleId: 'int-linearity',
        ruleFormulaLatex: `\\int (-f)\\,d${vx} = -\\int f\\,d${vx}`,
        annotation: 'Factor out the negative sign.',
        minor: true,
      });
    }
    const inner = integrateExpr(e.arg, x, depth + 1, log);
    return inner ? simplify(neg(inner)) : null;
  }

  // 4. Linearity (Sum / Difference)
  if (e.kind === 'binary' && (e.op === '+' || e.op === '-')) {
    if (log && depth === 0) {
      log.push({
        kind: 'rule',
        workLatex: `${intOp(toLatex(e), x)} = ${intOp(toLatex(e.left), x)} ${e.op} ${intOp(toLatex(e.right), x)}`,
        ruleTitle: e.op === '+' ? 'Sum rule (linearity)' : 'Difference rule (linearity)',
        ruleId: 'int-linearity',
        ruleFormulaLatex: `\\int (f \\pm g)\\,d${vx} = \\int f\\,d${vx} \\pm \\int g\\,d${vx}`,
        annotation: 'Split the integral term by term.',
        theory: 'Integration is linear: the signed area under a sum or difference of curves equals the sum or difference of their individual areas.',
      });
    }
    const il = integrateExpr(e.left, x, depth + 1, log);
    const ir = integrateExpr(e.right, x, depth + 1, log);
    if (!il || !ir) return null;
    return simplify(e.op === '+' ? add(il, ir) : sub(il, ir));
  }

  // 5. Products
  if (e.kind === 'binary' && e.op === '*') {
    if (!containsVar(e.left, x)) {
      if (log && depth <= 1) {
        log.push({
          kind: 'rule',
          workLatex: `${intOp(toLatex(e), x)} = ${toLatex(e.left)} ${intOp(toLatex(e.right), x)}`,
          ruleTitle: 'Constant multiple rule',
          ruleId: 'int-linearity',
          ruleFormulaLatex: `\\int c\\,f(${vx})\\,d${vx} = c\\int f(${vx})\\,d${vx}`,
          annotation: `Factor constant ${toText(e.left)} outside the integral.`,
          minor: depth > 0,
        });
      }
      const ir = integrateExpr(e.right, x, depth + 1, log);
      return ir ? simplify(mul(e.left, ir)) : null;
    }
    if (!containsVar(e.right, x)) {
      const il = integrateExpr(e.left, x, depth + 1, log);
      return il ? simplify(mul(e.right, il)) : null;
    }

    const trigProd = tryTrigProductToSum(e.left, e.right, x, depth, log, integrateExpr);
    if (trigProd) return trigProd;

    const uSub = tryGeneralUSub(e, x, depth, log, integrateExpr);
    if (uSub) return uSub;

    const ibp =
      tryIntegrateByParts(e.left, e.right, x, depth, log, integrateExpr) ??
      tryIntegrateByParts(e.right, e.left, x, depth, log, integrateExpr);
    if (ibp) return simplify(ibp);

    const expanded = expandSmallPoly(e);
    if (expanded && !exprEqual(expanded, e)) {
      if (log && depth <= 1) {
        log.push({
          kind: 'rewrite',
          workLatex: `${intOp(toLatex(e), x)} = ${intOp(toLatex(expanded), x)}`,
          ruleTitle: 'Algebraic expansion',
          ruleId: 'alg-expand',
          annotation: 'Expand the product into a sum of elementary terms.',
          theory: 'Unlike derivatives, there is no simple product rule for integrals; expanding algebraic products turns them into easy term-by-term power integrals.',
        });
      }
      return integrateExpr(expanded, x, depth + 1, log);
    }

    return null;
  }

  // 6. Quotients
  if (e.kind === 'binary' && e.op === '/') {
    if (!containsVar(e.right, x)) {
      if (log && depth <= 1) {
        log.push({
          kind: 'rule',
          workLatex: `${intOp(toLatex(e), x)} = \\frac{1}{${toLatex(e.right)}} ${intOp(toLatex(e.left), x)}`,
          ruleTitle: 'Constant multiple rule',
          ruleId: 'int-linearity',
          ruleFormulaLatex: `\\int \\frac{f(${vx})}{c}\\,d${vx} = \\frac{1}{c}\\int f(${vx})\\,d${vx}`,
          annotation: `Denominator ${toText(e.right)} is constant.`,
          minor: depth > 0,
        });
      }
      const il = integrateExpr(e.left, x, depth + 1, log);
      return il ? simplify(div(il, e.right)) : null;
    }

    if (!containsVar(e.left, x)) {
      const rec = integrateReciprocal(e.right, x, depth, log, integrateExpr);
      return rec ? simplify(mul(e.left, rec)) : null;
    }

    const uSub = tryGeneralUSub(e, x, depth, log, integrateExpr);
    if (uSub) return uSub;

    if (e.left.kind === 'binary' && (e.left.op === '+' || e.left.op === '-')) {
      const termA = simplify(div(e.left.left, e.right));
      const termB = simplify(div(e.left.right, e.right));
      if (log && depth <= 1) {
        log.push({
          kind: 'rewrite',
          workLatex: `${intOp(toLatex(e), x)} = ${intOp(toLatex(termA), x)} ${e.left.op} ${intOp(toLatex(termB), x)}`,
          ruleTitle: 'Split fraction numerator',
          ruleId: 'alg-simplify',
          ruleFormulaLatex: '\\frac{a \\pm b}{c} = \\frac{a}{c} \\pm \\frac{b}{c}',
          annotation: 'Divide each numerator term separately by the denominator.',
        });
      }
      const ia = integrateExpr(termA, x, depth + 1, log);
      const ib = integrateExpr(termB, x, depth + 1, log);
      if (ia && ib) return simplify(e.left.op === '+' ? add(ia, ib) : sub(ia, ib));
    }

    const pa = matchVarPow(e.left, x);
    const pb = matchVarPow(e.right, x);
    if (pa && pb) {
      const rewritten = simplify(pow(ident(x), sub(pa, pb)));
      if (log && depth <= 1) {
        log.push({
          kind: 'rewrite',
          workLatex: `${intOp(toLatex(e), x)} = ${intOp(toLatex(rewritten), x)}`,
          ruleTitle: 'Quotient of powers identity',
          ruleId: 'alg-exponents',
          ruleFormulaLatex: '\\frac{x^{a}}{x^{b}} = x^{a-b}',
          annotation: 'Combine powers of the same base before applying the power rule.',
        });
      }
      return integrateExpr(rewritten, x, depth + 1, log);
    }

    return null;
  }

  // 7. Powers: trig powers, (ax+b)^n, c^(ax+b)
  if (e.kind === 'binary' && e.op === '^') {
    const base = e.left;
    const exp = e.right;

    if (base.kind === 'call' && base.args.length === 1 && exp.kind === 'num') {
      const fn = base.name;
      const arg = base.args[0];
      const lin = matchAffine(arg, x);
      if (lin && !isZero(lin.a)) {
        if (fn === 'sec' && isNum(exp, 2)) {
          const res = simplify(div(call('tan', [arg]), lin.a));
          if (log && depth <= 1) {
            log.push({
              kind: 'rule',
              workLatex: `${intOp(toLatex(e), x)} = ${toLatex(res)}`,
              ruleTitle: 'Integral of sec²',
              ruleId: 'int-sec2',
              ruleFormulaLatex: '\\int \\sec^{2}(u)\\,du = \\tan(u) + C',
              annotation: isOne(lin.a)
                ? 'Direct antiderivative of sec².'
                : `Linear substitution u = ${toText(arg)}, du = ${toText(lin.a)} d${x}.`,
              theory: 'Because d/du[tan(u)] = sec²(u), integrating sec²(u) returns tan(u) immediately.',
            });
          }
          return res;
        }
        if (fn === 'csc' && isNum(exp, 2)) {
          const res = simplify(div(neg(call('cot', [arg])), lin.a));
          if (log && depth <= 1) {
            log.push({
              kind: 'rule',
              workLatex: `${intOp(toLatex(e), x)} = ${toLatex(res)}`,
              ruleTitle: 'Integral of csc²',
              ruleId: 'int-csc2',
              ruleFormulaLatex: '\\int \\csc^{2}(u)\\,du = -\\cot(u) + C',
              annotation: 'Reverse of d/du[cot(u)] = −csc²(u).',
            });
          }
          return res;
        }
        if (fn === 'sin' && isNum(exp, 2)) {
          const twoArg = simplify(mul(num(2), arg));
          const rewritten = div(sub(num(1), call('cos', [twoArg])), num(2));
          if (log && depth <= 1) {
            log.push({
              kind: 'rewrite',
              workLatex: `${intOp(toLatex(e), x)} = ${intOp(toLatex(rewritten), x)}`,
              ruleTitle: 'Power-reduction identity (half-angle)',
              ruleId: 'trig-half-sin',
              ruleFormulaLatex: '\\sin^{2}(\\theta) = \\frac{1 - \\cos(2\\theta)}{2}',
              annotation: `Rewrite sin²(${toText(arg)}) in terms of cos(${toText(twoArg)}).`,
              theory: 'Even powers of sine cannot use a direct u-substitution without a cosine factor. The power-reduction identity drops the degree from 2 to 1 so it integrates directly.',
            });
          }
          return integrateExpr(rewritten, x, depth + 1, log);
        }
        if (fn === 'cos' && isNum(exp, 2)) {
          const twoArg = simplify(mul(num(2), arg));
          const rewritten = div(add(num(1), call('cos', [twoArg])), num(2));
          if (log && depth <= 1) {
            log.push({
              kind: 'rewrite',
              workLatex: `${intOp(toLatex(e), x)} = ${intOp(toLatex(rewritten), x)}`,
              ruleTitle: 'Power-reduction identity (half-angle)',
              ruleId: 'trig-half-cos',
              ruleFormulaLatex: '\\cos^{2}(\\theta) = \\frac{1 + \\cos(2\\theta)}{2}',
              annotation: `Rewrite cos²(${toText(arg)}) in terms of cos(${toText(twoArg)}).`,
              theory: 'Reducing cos²(θ) via the double-angle formula eliminates the square and produces a standard cosine integral.',
            });
          }
          return integrateExpr(rewritten, x, depth + 1, log);
        }
        if (fn === 'tan' && isNum(exp, 2)) {
          const rewritten = sub(pow(call('sec', [arg]), num(2)), num(1));
          if (log && depth <= 1) {
            log.push({
              kind: 'rewrite',
              workLatex: `${intOp(toLatex(e), x)} = ${intOp(toLatex(rewritten), x)}`,
              ruleTitle: 'Pythagorean identity for tangent',
              ruleId: 'trig-pyth-tan',
              ruleFormulaLatex: '\\tan^{2}(\\theta) = \\sec^{2}(\\theta) - 1',
              annotation: 'Replace tan² with sec² − 1, since ∫ sec²(u) du = tan(u).',
              theory: 'Converting tan² into sec² − 1 unlocks the exact antiderivative tan(u) − u.',
            });
          }
          return integrateExpr(rewritten, x, depth + 1, log);
        }
        if ((fn === 'sin' || fn === 'cos') && isNum(exp, 3)) {
          const other = fn === 'sin' ? 'cos' : 'sin';
          const rewritten = mul(sub(num(1), pow(call(other, [arg]), num(2))), call(fn, [arg]));
          if (log && depth <= 1) {
            log.push({
              kind: 'rewrite',
              workLatex: `${intOp(toLatex(e), x)} = ${intOp(toLatex(rewritten), x)}`,
              ruleTitle: 'Pythagorean identity (odd trig power)',
              ruleId: 'trig-pythagorean',
              ruleFormulaLatex: '\\sin^{2}(\\theta) + \\cos^{2}(\\theta) = 1',
              annotation: `Split off one ${fn} factor and convert the remaining ${fn}² using 1 − ${other}².`,
              theory: 'For odd powers of sine or cosine, peeling off one factor leaves an even power convertible via sin² + cos² = 1, setting up a clean u-substitution.',
            });
          }
          return integrateExpr(rewritten, x, depth + 1, log);
        }
      }
    }

    if (!containsVar(exp, x)) {
      const lin = matchAffine(base, x);
      if (lin && !isZero(lin.a)) {
        const isSimpleX = base.kind === 'ident' && base.name === x;
        if (isNum(exp, -1)) {
          const res = simplify(div(call('ln', [call('abs', [base])]), lin.a));
          if (log && depth <= 1) {
            log.push({
              kind: 'rule',
              workLatex: `${intOp(toLatex(e), x)} = ${toLatex(res)}`,
              ruleTitle: 'Logarithmic integral (n = −1 case)',
              ruleId: 'int-reciprocal',
              ruleFormulaLatex: '\\int \\frac{1}{u}\\,du = \\ln|u| + C',
              annotation: isSimpleX
                ? 'The power rule fails at n = −1; the antiderivative is ln|x|.'
                : `Linear substitution u = ${toText(base)}, du = ${toText(lin.a)} d${x}.`,
              theory: 'The absolute value |u| ensures the antiderivative is valid on both the positive and negative halves of the domain.',
            });
          }
          return res;
        }
        const nPlus1 = simplify(add(exp, num(1)));
        const res = simplify(div(pow(base, nPlus1), mul(lin.a, nPlus1)));
        if (log && depth <= 1) {
          log.push({
            kind: isSimpleX ? 'rule' : 'substitution',
            workLatex: `${intOp(toLatex(e), x)} = ${toLatex(res)}`,
            ruleTitle: isSimpleX ? 'Power rule' : 'Linear u-substitution + power rule',
            ruleId: isSimpleX ? 'int-power' : 'int-usub',
            ruleFormulaLatex: isSimpleX
              ? `\\int ${vx}^{n}\\,d${vx} = \\frac{${vx}^{n+1}}{n+1} + C`
              : `\\int (a${vx}+b)^{n}\\,d${vx} = \\frac{(a${vx}+b)^{n+1}}{a(n+1)} + C`,
            annotation: isSimpleX
              ? `Increase exponent from ${toText(exp)} to ${toText(nPlus1)} and divide by ${toText(nPlus1)}.`
              : `Let u = ${toText(base)}, du = ${toText(lin.a)} d${x}; apply power rule with n = ${toText(exp)}.`,
            theory: isSimpleX
              ? 'Each power term integrates by raising the power by 1 and dividing by the new exponent.'
              : 'When the inner expression is linear (ax + b), substituting u = ax + b simply divides the standard antiderivative by the slope a.',
            minor: depth > 0 && isSimpleX,
          });
        }
        return res;
      }
      const expanded = expandSmallPoly(e);
      if (expanded && !exprEqual(expanded, e)) {
        if (log && depth <= 1) {
          log.push({
            kind: 'rewrite',
            workLatex: `${intOp(toLatex(e), x)} = ${intOp(toLatex(expanded), x)}`,
            ruleTitle: 'Binomial expansion',
            ruleId: 'alg-expand',
            annotation: 'Expand the power into individual polynomial terms.',
          });
        }
        return integrateExpr(expanded, x, depth + 1, log);
      }
    }

    if (!containsVar(base, x)) {
      const lin = matchAffine(exp, x);
      if (lin && !isZero(lin.a)) {
        const isBaseE = base.kind === 'ident' && base.name === 'e';
        const lnBase = isBaseE ? num(1) : call('ln', [base]);
        const res = simplify(div(e, mul(lin.a, lnBase)));
        if (log && depth <= 1) {
          log.push({
            kind: 'rule',
            workLatex: `${intOp(toLatex(e), x)} = ${toLatex(res)}`,
            ruleTitle: isBaseE ? 'Exponential integral' : 'General exponential integral',
            ruleId: 'int-exp',
            ruleFormulaLatex: isBaseE
              ? '\\int e^{u}\\,du = e^{u} + C'
              : '\\int a^{u}\\,du = \\frac{a^{u}}{\\ln(a)} + C',
            annotation: isOne(lin.a)
              ? 'Apply exponential antiderivative directly.'
              : `With linear substitution u = ${toText(exp)}, du = ${toText(lin.a)} d${x}.`,
            theory: 'Because differentiating aᵘ multiplies by ln(a), integrating divides by ln(a).',
          });
        }
        return res;
      }
    }

    return null;
  }

  // 8. Elementary function calls f(a*x + b)
  if (e.kind === 'call' && e.args.length === 1) {
    const u = e.args[0];
    const lin = matchAffine(u, x);
    if (!lin || isZero(lin.a)) return null;
    const isSimple = u.kind === 'ident' && u.name === x;

    let anti: MathExpr | null = null;
    let ruleTitle = '';
    let ruleId = 'int-exp';
    let formula = '';
    let theory = '';

    switch (e.name) {
      case 'exp':
        anti = call('exp', [u]);
        ruleTitle = isSimple ? 'Exponential rule' : 'Linear u-sub + exponential rule';
        ruleId = 'int-exp';
        formula = '\\int e^{u}\\,du = e^{u} + C';
        theory = 'The exponential function eᵘ is its own derivative, so it is also its own antiderivative (scaled by 1/a for linear arguments ax + b).';
        break;
      case 'sin':
        anti = neg(call('cos', [u]));
        ruleTitle = isSimple ? 'Integral of sine' : 'Linear u-sub + integral of sine';
        ruleId = 'int-sin';
        formula = '\\int \\sin(u)\\,du = -\\cos(u) + C';
        theory = 'Watch the minus sign: d/du[cos(u)] = −sin(u), so an extra minus sign is needed to recover +sin(u).';
        break;
      case 'cos':
        anti = call('sin', [u]);
        ruleTitle = isSimple ? 'Integral of cosine' : 'Linear u-sub + integral of cosine';
        ruleId = 'int-cos';
        formula = '\\int \\cos(u)\\,du = \\sin(u) + C';
        theory = 'Direct inverse of d/du[sin(u)] = cos(u).';
        break;
      case 'tan':
        anti = neg(call('ln', [call('abs', [call('cos', [u])])]));
        ruleTitle = 'Integral of tangent (via u = cos)';
        ruleId = 'int-tan';
        formula = '\\int \\tan(u)\\,du = -\\ln|\\cos(u)| + C';
        theory = 'Write tan(u) = sin(u)/cos(u) and substitute w = cos(u), dw = −sin(u) du to obtain −∫ dw/w = −ln|cos(u)|.';
        break;
      case 'cot':
        anti = call('ln', [call('abs', [call('sin', [u])])]);
        ruleTitle = 'Integral of cotangent';
        ruleId = 'int-tan';
        formula = '\\int \\cot(u)\\,du = \\ln|\\sin(u)| + C';
        theory = 'Write cot(u) = cos(u)/sin(u) and substitute w = sin(u), dw = cos(u) du.';
        break;
      case 'sec':
        anti = call('ln', [call('abs', [add(call('sec', [u]), call('tan', [u]))])]);
        ruleTitle = 'Integral of secant';
        ruleId = 'int-sec';
        formula = '\\int \\sec(u)\\,du = \\ln|\\sec(u) + \\tan(u)| + C';
        theory = 'Multiplying numerator and denominator by (sec u + tan u) makes the numerator the exact derivative of the denominator.';
        break;
      case 'sinh':
        anti = call('cosh', [u]);
        ruleTitle = 'Integral of hyperbolic sine';
        ruleId = 'int-hyp';
        formula = '\\int \\sinh(u)\\,du = \\cosh(u) + C';
        theory = 'Hyperbolic sine and cosine differentiate into each other with no sign flip.';
        break;
      case 'cosh':
        anti = call('sinh', [u]);
        ruleTitle = 'Integral of hyperbolic cosine';
        ruleId = 'int-hyp';
        formula = '\\int \\cosh(u)\\,du = \\sinh(u) + C';
        theory = 'Direct inverse of d/du[sinh(u)] = cosh(u).';
        break;
      case 'tanh':
        anti = call('ln', [call('cosh', [u])]);
        ruleTitle = 'Integral of hyperbolic tangent';
        ruleId = 'int-hyp';
        formula = '\\int \\tanh(u)\\,du = \\ln(\\cosh(u)) + C';
        theory = 'Write tanh(u) = sinh(u)/cosh(u) and let w = cosh(u) (always positive).';
        break;
      case 'ln':
        anti = sub(mul(u, call('ln', [u])), u);
        ruleTitle = 'Integral of natural logarithm (by parts)';
        ruleId = 'int-ibp';
        formula = '\\int \\ln(u)\\,du = u\\ln(u) - u + C';
        theory = 'Apply integration by parts with p = ln(u) and dq = du, so dp = (1/u) du and q = u, leaving u·ln(u) − ∫ 1 du.';
        break;
      case 'atan':
        anti = sub(mul(u, call('atan', [u])), div(call('ln', [add(num(1), pow(u, num(2)))]), num(2)));
        ruleTitle = 'Integral of arctangent (by parts)';
        ruleId = 'int-ibp';
        formula = '\\int \\arctan(u)\\,du = u\\arctan(u) - \\frac{1}{2}\\ln(1+u^{2}) + C';
        theory = 'Choose p = arctan(u), dq = du by LIATE; the remaining integral ∫ u/(1 + u²) du evaluates via w = 1 + u².';
        break;
      case 'asin':
        anti = add(mul(u, call('asin', [u])), call('sqrt', [sub(num(1), pow(u, num(2)))]));
        ruleTitle = 'Integral of arcsine (by parts)';
        ruleId = 'int-ibp';
        formula = '\\int \\arcsin(u)\\,du = u\\arcsin(u) + \\sqrt{1 - u^{2}} + C';
        theory = 'Choose p = arcsin(u), dq = du by LIATE; the remaining integral ∫ u/√(1 − u²) du solves via w = 1 − u².';
        break;
      case 'acos':
        anti = sub(mul(u, call('acos', [u])), call('sqrt', [sub(num(1), pow(u, num(2)))]));
        ruleTitle = 'Integral of arccosine (by parts)';
        ruleId = 'int-ibp';
        formula = '\\int \\arccos(u)\\,du = u\\arccos(u) - \\sqrt{1 - u^{2}} + C';
        theory = 'Apply integration by parts with p = arccos(u) and dq = du.';
        break;
      case 'sqrt':
        anti = mul(div(num(2), num(3)), pow(u, div(num(3), num(2))));
        ruleTitle = 'Square-root power rule';
        ruleId = 'int-power';
        formula = '\\int \\sqrt{u}\\,du = \\frac{2}{3}u^{3/2} + C';
        theory = 'Rewrite √u as u^(1/2) and apply the power rule with n = 1/2: dividing by 3/2 multiplies by 2/3.';
        break;
      default:
        return null;
    }

    const res = simplify(div(anti, lin.a));
    if (log && depth <= 1) {
      if (!isSimple) {
        log.push({
          kind: 'substitution',
          workLatex: `u = ${toLatex(u)}, \\quad du = ${toLatex(lin.a)}\\,d${vx} \\implies d${vx} = \\frac{du}{${toLatex(lin.a)}}`,
          ruleTitle: 'Linear substitution',
          ruleId: 'int-usub',
          ruleFormulaLatex: `\\int f(a${vx}+b)\\,d${vx} = \\frac{1}{a}F(a${vx}+b) + C`,
          annotation: `Substitute u = ${toText(u)} to reduce the integrand to a standard form.`,
          theory: 'A linear change of variable u = ax + b scales the differential by a constant factor 1/a.',
        });
      }
      log.push({
        kind: 'rule',
        workLatex: `${intOp(toLatex(e), x)} = ${toLatex(res)}`,
        ruleTitle,
        ruleId,
        ruleFormulaLatex: formula,
        annotation: isSimple ? `Standard antiderivative of ${e.name}.` : `Integrate in u and substitute back u = ${toText(u)}.`,
        theory,
      });
    }
    return res;
  }

  return null;
}

export interface SolveIntegralOptions {
  readonly variable?: string;
  readonly definite?: boolean;
  readonly lower?: string;
  readonly upper?: string;
}

export function solveIntegral(
  rawExpr: string,
  options: SolveIntegralOptions = {},
): IntegralOutput {
  const variable = (options.variable ?? 'x').trim() || 'x';
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(variable)) {
    return {
      ok: false,
      error: `Invalid integration variable "${variable}". Use a letter such as x, t, or theta.`,
    };
  }

  let ast: MathExpr;
  try {
    ast = parseMath(rawExpr);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not parse integrand.',
      hint: 'Examples: 3x^2 + cos(x), x * exp(x^2), x * sin(x), sin^2(x), 1 / (x^2 + 4)',
    };
  }

  const isDefinite = Boolean(options.definite);
  let lowerAst: MathExpr | undefined;
  let upperAst: MathExpr | undefined;
  let lowerNum: number | undefined;
  let upperNum: number | undefined;

  if (isDefinite) {
    const loStr = (options.lower ?? '').trim();
    const hiStr = (options.upper ?? '').trim();
    if (!loStr || !hiStr) {
      return {
        ok: false,
        error: 'Definite integration requires both lower and upper bounds.',
        hint: 'Enter numeric or symbolic bounds such as 0 and pi, or -1 and 1.',
        inputLatex: toLatex(ast),
      };
    }
    try {
      lowerAst = parseMath(loStr);
      upperAst = parseMath(hiStr);
      lowerNum = evalMath(lowerAst);
      upperNum = evalMath(upperAst);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? `Invalid bound: ${err.message}` : 'Could not parse integration bounds.',
        inputLatex: toLatex(ast),
      };
    }
    if (!Number.isFinite(lowerNum) || !Number.isFinite(upperNum)) {
      return {
        ok: false,
        error: 'Definite bounds must evaluate to finite real numbers (constants like pi, e, sqrt(2) are supported).',
        inputLatex: toLatex(ast),
      };
    }
  }

  const inputLatex = toLatex(ast);
  const lowerLatex = lowerAst ? toLatex(lowerAst) : undefined;
  const upperLatex = upperAst ? toLatex(upperAst) : undefined;
  const promptLatex =
    isDefinite && lowerLatex && upperLatex
      ? defIntOp(inputLatex, variable, lowerLatex, upperLatex)
      : intOp(inputLatex, variable);

  const steps: SolutionStep[] = [];
  let stepId = 0;
  const logger: StepLogger = {
    push: (s) => {
      stepId += 1;
      steps.push({ ...s, id: `int-${stepId}` });
    },
  };

  logger.push({
    kind: 'setup',
    workLatex: promptLatex,
    ruleTitle: isDefinite ? 'Definite integral setup' : 'Indefinite integral setup',
    annotation: isDefinite
      ? `Find an antiderivative F(${variable}) and evaluate F(b) − F(a) on [${options.lower?.trim()}, ${options.upper?.trim()}].`
      : `Find the general family of antiderivatives F(${variable}) + C with respect to ${variable}.`,
    theory: isDefinite
      ? 'By the Fundamental Theorem of Calculus, the signed net area under a continuous curve from a to b equals the net change F(b) − F(a) of any antiderivative F.'
      : 'An indefinite integral finds all functions F whose derivative equals the integrand. Because the derivative of any constant is zero, we always add + C.',
  });

  const anti = integrateExpr(ast, variable, 0, logger);

  let verifiedAnti = anti;
  let verification: VerificationInfo = { status: 'unverified' };

  if (verifiedAnti) {
    verification = verifyAntiderivative(ast, verifiedAnti, variable);
    if (verification.status === 'unverified' && verification.maxError !== undefined && verification.maxError >= 1e-3) {
      verifiedAnti = null;
    }
  }

  if (verifiedAnti) {
    const antiLatex = toLatex(verifiedAnti);
    const antiText = toText(verifiedAnti);

    if (!isDefinite) {
      const resultLatex = `${antiLatex} + C`;
      const resultText = `${antiText} + C`;
      logger.push({
        kind: 'result',
        workLatex: `${promptLatex} = ${resultLatex}`,
        ruleTitle: 'Add constant of integration (+ C)',
        ruleId: 'int-constant',
        annotation: 'General antiderivative verified by differentiation.',
        theory: 'Adding + C represents the entire vertical family of antiderivatives that share the same slope f(x) at every x.',
      });

      return {
        ok: true,
        variable,
        isDefinite: false,
        inputLatex,
        promptLatex,
        antiderivativeLatex: antiLatex,
        antiderivativeText: antiText,
        resultLatex,
        resultText,
        steps,
        verification,
      };
    }

    const fUpperExpr = simplify(substituteVar(verifiedAnti, variable, upperAst!));
    const fLowerExpr = simplify(substituteVar(verifiedAnti, variable, lowerAst!));
    const exactDiffExpr = simplify(sub(fUpperExpr, fLowerExpr));

    const fUpperNum = evalMath(verifiedAnti, { [variable]: upperNum! });
    const fLowerNum = evalMath(verifiedAnti, { [variable]: lowerNum! });
    const diffNum = fUpperNum - fLowerNum;

    const gk = integrateGaussKronrod((t) => evalMath(ast, { [variable]: t }), lowerNum!, upperNum!);
    const numericVal = Number.isFinite(diffNum) ? diffNum : gk?.value;

    logger.push({
      kind: 'evaluate',
      workLatex: `\\Big[ ${antiLatex} \\Big]_{${lowerLatex}}^{${upperLatex}} = \\left(${toLatex(fUpperExpr)}\\right) - \\left(${toLatex(fLowerExpr)}\\right)`,
      ruleTitle: 'Fundamental Theorem of Calculus',
      ruleId: 'int-ftc',
      ruleFormulaLatex: '\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)',
      annotation: `Evaluate F(${options.upper?.trim()}) − F(${options.lower?.trim()}).`,
      theory: 'The constant + C cancels out in F(b) − F(a), leaving the exact signed area between the curve and the horizontal axis on [a, b].',
    });

    const exactLatex = toLatex(exactDiffExpr);
    const numStr = numericVal !== undefined && Number.isFinite(numericVal) ? formatNum(numericVal, 8) : undefined;
    const exactDiffersFromNum =
      numStr !== undefined && exactLatex !== numStr && exactLatex !== `-${numStr.replace('-', '')}`;

    const finalLatex =
      numStr !== undefined
        ? exactDiffersFromNum
          ? `${exactLatex} \\approx ${numStr}`
          : numStr
        : exactLatex;

    logger.push({
      kind: 'result',
      workLatex: `${promptLatex} = ${finalLatex}`,
      ruleTitle: 'Final definite integral',
      annotation:
        numStr !== undefined
          ? `Exact symbolic result with numeric value ${numStr}.`
          : 'Exact symbolic result.',
    });

    return {
      ok: true,
      variable,
      isDefinite: true,
      inputLatex,
      promptLatex,
      antiderivativeLatex: antiLatex,
      antiderivativeText: antiText,
      resultLatex: finalLatex,
      resultText: numStr ?? toText(exactDiffExpr),
      numericValue: numericVal,
      numericError: gk?.error,
      lowerLatex,
      upperLatex,
      steps,
      verification,
    };
  }

  if (isDefinite && lowerNum !== undefined && upperNum !== undefined) {
    const gk = integrateGaussKronrod((t) => evalMath(ast, { [variable]: t }), lowerNum, upperNum);
    if (gk) {
      const valStr = formatNum(gk.value, 9);
      const errStr = gk.error > 0 ? gk.error.toExponential(1) : '< 1e-15';
      const cleanSteps: SolutionStep[] = [
        steps[0],
        {
          id: 'num-note',
          kind: 'rewrite',
          workLatex: promptLatex,
          ruleTitle: 'Non-elementary antiderivative',
          annotation:
            'No closed-form elementary antiderivative matched this integrand; switching to adaptive numerical quadrature.',
          theory:
            'Many important functions (such as e^(−x²) or sin(x)/x) have provably non-elementary antiderivatives, yet their definite integrals can be computed to machine precision via numerical quadrature.',
        },
        {
          id: 'num-gk',
          kind: 'evaluate',
          workLatex: `${promptLatex} \\approx ${valStr}`,
          ruleTitle: 'Adaptive Gauss–Kronrod G7–K15 quadrature',
          annotation: `Estimated integration error ≤ ${errStr} on [${options.lower?.trim()}, ${options.upper?.trim()}].`,
          theory:
            'Gauss–Kronrod quadrature compares a 7-point Gauss rule against a nested 15-point Kronrod rule on each subinterval and automatically subdivides wherever curvature is steep.',
        },
      ];

      return {
        ok: true,
        variable,
        isDefinite: true,
        inputLatex,
        promptLatex,
        resultLatex: `\\approx ${valStr}`,
        resultText: valStr,
        numericValue: gk.value,
        numericError: gk.error,
        lowerLatex,
        upperLatex,
        steps: cleanSteps,
        verification: {
          status: 'numeric-only',
          maxError: gk.error,
          note: `Adaptive Gauss–Kronrod quadrature (est. error ${errStr}).`,
        },
      };
    }

    return {
      ok: false,
      error: 'Could not evaluate this definite integral numerically (integrand may have a singularity or extra symbolic parameters on the interval).',
      hint: 'Check that the bounds avoid singularities (such as x = 0 for 1/x) and that all constants are numeric.',
      inputLatex,
    };
  }

  return {
    ok: false,
    error: 'No elementary symbolic antiderivative was found for this integrand.',
    hint: 'Switch to Definite mode with numeric bounds to compute a high-precision Gauss–Kronrod numerical integral, or try rewriting using an identity from the Identities & Rules tab.',
    inputLatex,
  };
}
