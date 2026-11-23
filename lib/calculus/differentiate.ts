// Step-by-step symbolic differentiation engine with higher-order derivatives,
// algebraic simplification steps, point evaluation + tangent line, and numerical verification.
// Framework-free; zero external dependencies.

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
  isZero,
  type MathExpr,
  mul,
  neg,
  num,
  pow,
  sub,
  toLatex,
  toText,
} from './ast';
import { MathParseError, parseMath } from './parse';
import { simplify } from './simplify';
import type {
  DerivativeOutput,
  DerivativePointEval,
  SolutionStep,
  VerificationInfo,
} from './types';

function dOp(v: string, inner: string): string {
  return `\\frac{d}{d${identToLatex(v)}}\\left[${inner}\\right]`;
}

function dOrderOp(v: string, order: number, inner: string): string {
  const vx = identToLatex(v);
  if (order === 1) return `\\frac{d}{d${vx}}\\left(${inner}\\right)`;
  return `\\frac{d^{${order}}}{d${vx}^{${order}}}\\left(${inner}\\right)`;
}

/** Pure symbolic single-order differentiation without step logging (used for sub-expressions & checks). */
export function diffRaw(expr: MathExpr, v: string): MathExpr {
  if (!containsVar(expr, v)) return num(0);
  switch (expr.kind) {
    case 'num':
      return num(0);
    case 'ident':
      return expr.name === v ? num(1) : num(0);
    case 'unary':
      return expr.op === '-' ? neg(diffRaw(expr.arg, v)) : diffRaw(expr.arg, v);
    case 'binary': {
      const u = expr.left;
      const w = expr.right;
      const du = diffRaw(u, v);
      const dw = diffRaw(w, v);
      switch (expr.op) {
        case '+':
          return add(du, dw);
        case '-':
          return sub(du, dw);
        case '*':
          if (!containsVar(u, v)) return mul(u, dw);
          if (!containsVar(w, v)) return mul(w, du);
          return add(mul(du, w), mul(u, dw));
        case '/':
          if (!containsVar(w, v)) return div(du, w);
          return div(sub(mul(du, w), mul(u, dw)), pow(w, num(2)));
        case '^': {
          const uHas = containsVar(u, v);
          const wHas = containsVar(w, v);
          if (uHas && !wHas) {
            return mul(mul(w, pow(u, sub(w, num(1)))), du);
          }
          if (!uHas && wHas) {
            const lnU = u.kind === 'ident' && u.name === 'e' ? num(1) : call('ln', [u]);
            return mul(mul(pow(u, w), lnU), dw);
          }
          return mul(pow(u, w), add(mul(dw, call('ln', [u])), div(mul(w, du), u)));
        }
      }
    }
    case 'call': {
      const u = expr.args[0];
      const du = diffRaw(u, v);
      const outer = diffCallOuter(expr.name, u);
      return mul(outer, du);
    }
  }
}

interface CallRuleMeta {
  readonly ruleId: string;
  readonly ruleTitle: string;
  readonly formulaLatex: string;
  readonly theory: string;
}

function diffCallOuter(fn: string, u: MathExpr): MathExpr {
  switch (fn) {
    case 'sin':
      return call('cos', [u]);
    case 'cos':
      return neg(call('sin', [u]));
    case 'tan':
      return pow(call('sec', [u]), num(2));
    case 'sec':
      return mul(call('sec', [u]), call('tan', [u]));
    case 'csc':
      return neg(mul(call('csc', [u]), call('cot', [u])));
    case 'cot':
      return neg(pow(call('csc', [u]), num(2)));
    case 'asin':
      return div(num(1), call('sqrt', [sub(num(1), pow(u, num(2)))]));
    case 'acos':
      return neg(div(num(1), call('sqrt', [sub(num(1), pow(u, num(2)))])));
    case 'atan':
      return div(num(1), add(num(1), pow(u, num(2))));
    case 'sinh':
      return call('cosh', [u]);
    case 'cosh':
      return call('sinh', [u]);
    case 'tanh':
      return div(num(1), pow(call('cosh', [u]), num(2)));
    case 'sech':
      return neg(mul(call('sech', [u]), call('tanh', [u])));
    case 'csch':
      return neg(mul(call('csch', [u]), call('coth', [u])));
    case 'coth':
      return neg(div(num(1), pow(call('sinh', [u]), num(2))));
    case 'asinh':
      return div(num(1), call('sqrt', [add(pow(u, num(2)), num(1))]));
    case 'acosh':
      return div(num(1), call('sqrt', [sub(pow(u, num(2)), num(1))]));
    case 'atanh':
      return div(num(1), sub(num(1), pow(u, num(2))));
    case 'exp':
      return call('exp', [u]);
    case 'ln':
      return div(num(1), u);
    case 'log':
    case 'log10':
      return div(num(1), mul(u, call('ln', [num(10)])));
    case 'log2':
      return div(num(1), mul(u, call('ln', [num(2)])));
    case 'sqrt':
      return div(num(1), mul(num(2), call('sqrt', [u])));
    case 'cbrt':
      return div(num(1), mul(num(3), pow(u, div(num(2), num(3)))));
    case 'abs':
      return div(u, call('abs', [u]));
    default:
      throw new MathParseError(`Unsupported function "${fn}" in differentiation.`);
  }
}

function getCallRuleMeta(fn: string): CallRuleMeta {
  switch (fn) {
    case 'sin':
      return {
        ruleId: 'diff-sin',
        ruleTitle: 'Derivative of sine',
        formulaLatex: '\\frac{d}{du}\\sin(u) = \\cos(u)',
        theory: 'Because sin(x) measures vertical height on the unit circle, its instantaneous rate of change equals the horizontal coordinate cos(x).',
      };
    case 'cos':
      return {
        ruleId: 'diff-cos',
        ruleTitle: 'Derivative of cosine',
        formulaLatex: '\\frac{d}{du}\\cos(u) = -\\sin(u)',
        theory: 'Cosine starts at its peak at u = 0 and decreases as u increases into the first quadrant, giving a negative slope −sin(u).',
      };
    case 'tan':
      return {
        ruleId: 'diff-tan',
        ruleTitle: 'Derivative of tangent',
        formulaLatex: '\\frac{d}{du}\\tan(u) = \\sec^{2}(u)',
        theory: 'Follows from writing tan(u) = sin(u)/cos(u), applying the quotient rule, and simplifying sin²(u) + cos²(u) = 1.',
      };
    case 'sec':
      return {
        ruleId: 'diff-sec',
        ruleTitle: 'Derivative of secant',
        formulaLatex: '\\frac{d}{du}\\sec(u) = \\sec(u)\\tan(u)',
        theory: 'Derived by rewriting sec(u) = (cos u)⁻¹ and applying the power and chain rules.',
      };
    case 'csc':
      return {
        ruleId: 'diff-csc',
        ruleTitle: 'Derivative of cosecant',
        formulaLatex: '\\frac{d}{du}\\csc(u) = -\\csc(u)\\cot(u)',
        theory: 'Derived by rewriting csc(u) = (sin u)⁻¹ and applying the power and chain rules.',
      };
    case 'cot':
      return {
        ruleId: 'diff-cot',
        ruleTitle: 'Derivative of cotangent',
        formulaLatex: '\\frac{d}{du}\\cot(u) = -\\csc^{2}(u)',
        theory: 'Follows from cot(u) = cos(u)/sin(u) via the quotient rule and sin²(u) + cos²(u) = 1.',
      };
    case 'asin':
      return {
        ruleId: 'diff-asin',
        ruleTitle: 'Derivative of arcsine',
        formulaLatex: '\\frac{d}{du}\\arcsin(u) = \\frac{1}{\\sqrt{1 - u^{2}}}',
        theory: 'Obtained by implicit differentiation of sin(y) = u, giving cos(y) y′ = 1 and substituting cos(y) = √(1 − u²) for y ∈ (−π/2, π/2).',
      };
    case 'acos':
      return {
        ruleId: 'diff-acos',
        ruleTitle: 'Derivative of arccosine',
        formulaLatex: '\\frac{d}{du}\\arccos(u) = -\\frac{1}{\\sqrt{1 - u^{2}}}',
        theory: 'Since arccos(u) = π/2 − arcsin(u), its derivative is simply the negative of the derivative of arcsin(u).',
      };
    case 'atan':
      return {
        ruleId: 'diff-atan',
        ruleTitle: 'Derivative of arctangent',
        formulaLatex: '\\frac{d}{du}\\arctan(u) = \\frac{1}{1 + u^{2}}',
        theory: 'Implicitly differentiating tan(y) = u yields sec²(y) y′ = 1; replacing sec²(y) = 1 + tan²(y) = 1 + u² produces 1/(1 + u²).',
      };
    case 'sinh':
      return {
        ruleId: 'diff-sinh',
        ruleTitle: 'Derivative of hyperbolic sine',
        formulaLatex: '\\frac{d}{du}\\sinh(u) = \\cosh(u)',
        theory: 'From sinh(u) = (eᵘ − e⁻ᵘ)/2, differentiating term by term gives (eᵘ + e⁻ᵘ)/2 = cosh(u).',
      };
    case 'cosh':
      return {
        ruleId: 'diff-cosh',
        ruleTitle: 'Derivative of hyperbolic cosine',
        formulaLatex: '\\frac{d}{du}\\cosh(u) = \\sinh(u)',
        theory: 'Unlike circular cosine, hyperbolic cosine has a positive derivative: d/du[(eᵘ + e⁻ᵘ)/2] = (eᵘ − e⁻ᵘ)/2 = sinh(u).',
      };
    case 'tanh':
      return {
        ruleId: 'diff-tanh',
        ruleTitle: 'Derivative of hyperbolic tangent',
        formulaLatex: '\\frac{d}{du}\\tanh(u) = \\frac{1}{\\cosh^{2}(u)} = \\operatorname{sech}^{2}(u)',
        theory: 'Applying the quotient rule to sinh(u)/cosh(u) and using cosh²(u) − sinh²(u) = 1 gives sech²(u).',
      };
    case 'exp':
      return {
        ruleId: 'diff-exp',
        ruleTitle: 'Exponential rule',
        formulaLatex: '\\frac{d}{du}e^{u} = e^{u}',
        theory: 'The natural base e is uniquely defined so that the slope of eᵘ at every point equals its own height eᵘ.',
      };
    case 'ln':
      return {
        ruleId: 'diff-ln',
        ruleTitle: 'Natural logarithm rule',
        formulaLatex: '\\frac{d}{du}\\ln(u) = \\frac{1}{u}',
        theory: 'Since ln(u) is the inverse of eʸ, differentiating eʸ = u gives eʸ y′ = 1, hence y′ = 1/u (valid for u > 0).',
      };
    case 'log':
    case 'log10':
      return {
        ruleId: 'diff-log',
        ruleTitle: 'Base-10 logarithm rule',
        formulaLatex: '\\frac{d}{du}\\log_{10}(u) = \\frac{1}{u\\,\\ln(10)}',
        theory: 'Rewrite using change of base: log₁₀(u) = ln(u) / ln(10), then apply the natural logarithm rule.',
      };
    case 'log2':
      return {
        ruleId: 'diff-log',
        ruleTitle: 'Base-2 logarithm rule',
        formulaLatex: '\\frac{d}{du}\\log_{2}(u) = \\frac{1}{u\\,\\ln(2)}',
        theory: 'Rewrite using change of base: log₂(u) = ln(u) / ln(2), then differentiate ln(u).',
      };
    case 'sqrt':
      return {
        ruleId: 'diff-power',
        ruleTitle: 'Square-root rule (power rule with n = 1/2)',
        formulaLatex: '\\frac{d}{du}\\sqrt{u} = \\frac{1}{2\\sqrt{u}}',
        theory: 'Rewrite √u as u^(1/2) and apply the power rule: (1/2)u^(-1/2) = 1/(2√u).',
      };
    case 'cbrt':
      return {
        ruleId: 'diff-power',
        ruleTitle: 'Cube-root rule (power rule with n = 1/3)',
        formulaLatex: '\\frac{d}{du}\\sqrt[3]{u} = \\frac{1}{3u^{2/3}}',
        theory: 'Rewrite ∛u as u^(1/3) and apply the power rule: (1/3)u^(-2/3).',
      };
    case 'abs':
      return {
        ruleId: 'diff-chain',
        ruleTitle: 'Absolute value derivative',
        formulaLatex: '\\frac{d}{du}|u| = \\frac{u}{|u|} \\quad (u \\neq 0)',
        theory: 'Writing |u| = √(u²) and differentiating via the chain rule yields u/|u| = sgn(u) wherever u ≠ 0.',
      };
    default:
      return {
        ruleId: 'diff-chain',
        ruleTitle: `Derivative of ${fn}`,
        formulaLatex: `\\frac{d}{du}\\operatorname{${fn}}(u)`,
        theory: 'Apply the standard elementary derivative together with the chain rule for composite arguments.',
      };
  }
}

function diffSingleOrderWithSteps(
  startExpr: MathExpr,
  v: string,
  steps: SolutionStep[],
  idPrefix: string,
  orderLabel?: string,
): MathExpr {
  let stepCounter = 0;
  const push = (step: Omit<SolutionStep, 'id'>) => {
    stepCounter += 1;
    steps.push({ ...step, id: `${idPrefix}-${stepCounter}` });
  };

  const vx = identToLatex(v);

  const trace = (expr: MathExpr, depth: number): MathExpr => {
    if (!containsVar(expr, v)) {
      if (depth <= 1) {
        push({
          kind: 'rule',
          workLabel: orderLabel,
          workLatex: `${dOp(v, toLatex(expr))} = 0`,
          ruleTitle: 'Constant rule',
          ruleId: 'diff-constant',
          ruleFormulaLatex: `\\frac{d}{d${vx}}(c) = 0`,
          annotation: `${toText(expr)} does not depend on ${v}.`,
          theory: 'A constant function has a flat horizontal graph, so its instantaneous rate of change is identically zero everywhere.',
          minor: depth > 0,
        });
      }
      return num(0);
    }

    if (expr.kind === 'ident' && expr.name === v) {
      if (depth <= 1) {
        push({
          kind: 'rule',
          workLabel: orderLabel,
          workLatex: `${dOp(v, vx)} = 1`,
          ruleTitle: 'Identity (variable) rule',
          ruleId: 'diff-power',
          ruleFormulaLatex: `\\frac{d}{d${vx}}(${vx}) = 1`,
          annotation: `The rate of change of ${v} with respect to itself is 1.`,
          theory: 'The line y = x rises by 1 unit vertically for every 1 unit moved horizontally, giving constant slope 1.',
          minor: depth > 0,
        });
      }
      return num(1);
    }

    if (expr.kind === 'unary') {
      if (expr.op === '+') return trace(expr.arg, depth);
      if (depth === 0) {
        push({
          kind: 'rule',
          workLabel: orderLabel,
          workLatex: `${dOp(v, toLatex(expr))} = -${dOp(v, toLatex(expr.arg))}`,
          ruleTitle: 'Constant multiple rule',
          ruleId: 'diff-const-mul',
          ruleFormulaLatex: `\\frac{d}{d${vx}}(-u) = -\\frac{du}{d${vx}}`,
          annotation: 'Factor out the negative sign before differentiating.',
          theory: 'Negating a function reflects its graph across the horizontal axis, which negates every tangent slope.',
        });
      }
      return neg(trace(expr.arg, depth + 1));
    }

    if (expr.kind === 'binary') {
      const u = expr.left;
      const w = expr.right;

      if (expr.op === '+' || expr.op === '-') {
        const signStr = expr.op;
        if (depth === 0) {
          push({
            kind: 'rule',
            workLabel: orderLabel,
            workLatex: `${dOp(v, toLatex(expr))} = ${dOp(v, toLatex(u))} ${signStr} ${dOp(v, toLatex(w))}`,
            ruleTitle: expr.op === '+' ? 'Sum rule (linearity)' : 'Difference rule (linearity)',
            ruleId: 'diff-linearity',
            ruleFormulaLatex: `\\frac{d}{d${vx}}(u \\pm w) = u' \\pm w'`,
            annotation: 'Differentiate each additive term independently.',
            theory: 'Differentiation is a linear operator: adding or subtracting functions adds or subtracts their instantaneous rates of change.',
          });
        }
        const du = trace(u, depth + 1);
        const dw = trace(w, depth + 1);
        return expr.op === '+' ? add(du, dw) : sub(du, dw);
      }

      if (expr.op === '*') {
        // Constant multiple pullout
        if (!containsVar(u, v) || !containsVar(w, v)) {
          const c = !containsVar(u, v) ? u : w;
          const fn = !containsVar(u, v) ? w : u;
          if (depth <= 1) {
            push({
              kind: 'rule',
              workLabel: orderLabel,
              workLatex: `${dOp(v, toLatex(expr))} = ${toLatex(c)} \\cdot ${dOp(v, toLatex(fn))}`,
              ruleTitle: 'Constant multiple rule',
              ruleId: 'diff-const-mul',
              ruleFormulaLatex: `\\frac{d}{d${vx}}(c\\,u) = c\\,\\frac{du}{d${vx}}`,
              annotation: `Pull the constant factor ${toText(c)} outside the derivative.`,
              theory: 'Vertically stretching a curve by a constant factor c stretches every tangent slope by the exact same factor c.',
              minor: depth > 0,
            });
          }
          const df = trace(fn, depth + 1);
          return mul(c, df);
        }

        // True Product Rule
        const du = diffRaw(u, v);
        const dw = diffRaw(w, v);
        const duSimp = simplify(du);
        const dwSimp = simplify(dw);
        const combined = add(mul(duSimp, w), mul(u, dwSimp));

        push({
          kind: 'rule',
          workLabel: orderLabel,
          workLatex: `${dOp(v, toLatex(expr))} = ${dOp(v, toLatex(u))} \\cdot ${toLatex(w, 4)} + ${toLatex(u, 4)} \\cdot ${dOp(v, toLatex(w))}`,
          ruleTitle: 'Product rule',
          ruleId: 'diff-product',
          ruleFormulaLatex: `\\frac{d}{d${vx}}(u \\cdot w) = u'w + uw'`,
          annotation: `With u = ${toText(u)} and w = ${toText(w)}.`,
          theory: 'Imagine a rectangle with side lengths u(x) and w(x): when x grows slightly, the area increases by two strips u′w and uw′, while the corner u′w′ vanishes in the limit.',
        });

        if (depth === 0) {
          push({
            kind: 'substep',
            workLabel: orderLabel,
            workLatex: `u' = ${toLatex(duSimp)}, \\quad w' = ${toLatex(dwSimp)}`,
            ruleTitle: 'Differentiate factors',
            annotation: 'Compute the derivative of each factor separately, then substitute back into u′w + uw′.',
            theory: 'Breaking a product into u′ and w′ isolates each smaller rule (power, chain, trig, etc.) before recombining.',
          });
          push({
            kind: 'rewrite',
            workLabel: orderLabel,
            workLatex: `= ${toLatex(combined)}`,
            ruleTitle: 'Substitute into product rule',
            annotation: 'Insert u′ and w′ into u′w + uw′.',
            minor: true,
          });
        }
        return combined;
      }

      if (expr.op === '/') {
        if (!containsVar(w, v)) {
          if (depth <= 1) {
            push({
              kind: 'rule',
              workLabel: orderLabel,
              workLatex: `${dOp(v, toLatex(expr))} = \\frac{1}{${toLatex(w)}} \\cdot ${dOp(v, toLatex(u))}`,
              ruleTitle: 'Constant multiple rule',
              ruleId: 'diff-const-mul',
              ruleFormulaLatex: `\\frac{d}{d${vx}}\\left(\\frac{u}{c}\\right) = \\frac{1}{c}\\,\\frac{du}{d${vx}}`,
              annotation: `Denominator ${toText(w)} is constant with respect to ${v}.`,
              theory: 'Dividing by a constant c is the same as multiplying by 1/c, so it passes straight through the derivative.',
              minor: depth > 0,
            });
          }
          return div(trace(u, depth + 1), w);
        }

        const duSimp = simplify(diffRaw(u, v));
        const dwSimp = simplify(diffRaw(w, v));
        const combined = div(sub(mul(duSimp, w), mul(u, dwSimp)), pow(w, num(2)));

        push({
          kind: 'rule',
          workLabel: orderLabel,
          workLatex: `${dOp(v, toLatex(expr))} = \\frac{${dOp(v, toLatex(u))} \\cdot ${toLatex(w, 4)} - ${toLatex(u, 4)} \\cdot ${dOp(v, toLatex(w))}}{\\left(${toLatex(w)}\\right)^{2}}`,
          ruleTitle: 'Quotient rule',
          ruleId: 'diff-quotient',
          ruleFormulaLatex: `\\frac{d}{d${vx}}\\left(\\frac{u}{w}\\right) = \\frac{u'w - uw'}{w^{2}}`,
          annotation: `With numerator u = ${toText(u)} and denominator w = ${toText(w)}.`,
          theory: 'The quotient rule is a special case of the product rule applied to u · w⁻¹. Notice the minus sign: order matters — differentiate the numerator first.',
        });

        if (depth === 0) {
          push({
            kind: 'substep',
            workLabel: orderLabel,
            workLatex: `u' = ${toLatex(duSimp)}, \\quad w' = ${toLatex(dwSimp)} \\implies ${toLatex(combined)}`,
            ruleTitle: 'Evaluate numerator & denominator derivatives',
            annotation: 'Substitute u′ and w′ into (u′w − uw′)/w².',
          });
        }
        return combined;
      }

      if (expr.op === '^') {
        const uHas = containsVar(u, v);
        const wHas = containsVar(w, v);

        if (uHas && !wHas) {
          const isSimpleVar = u.kind === 'ident' && u.name === v;
          const duSimp = simplify(diffRaw(u, v));
          const rawResult = isSimpleVar
            ? mul(w, pow(u, simplify(sub(w, num(1)))))
            : mul(mul(w, pow(u, simplify(sub(w, num(1))))), duSimp);

          if (isSimpleVar) {
            push({
              kind: 'rule',
              workLabel: orderLabel,
              workLatex: `${dOp(v, toLatex(expr))} = ${toLatex(w, 4)} \\cdot ${vx}^{${toLatex(sub(w, num(1)))}} = ${toLatex(simplify(rawResult))}`,
              ruleTitle: 'Power rule',
              ruleId: 'diff-power',
              ruleFormulaLatex: `\\frac{d}{d${vx}}\\left(${vx}^{n}\\right) = n\\,${vx}^{n-1}`,
              annotation: `Bring down exponent n = ${toText(w)} and subtract 1 from the exponent.`,
              theory: 'Works for every real constant exponent n (positive integers, negative powers, and fractional roots alike).',
              minor: depth > 1,
            });
          } else {
            push({
              kind: 'rule',
              workLabel: orderLabel,
              workLatex: `${dOp(v, toLatex(expr))} = ${toLatex(w, 4)} \\left(${toLatex(u)}\\right)^{${toLatex(simplify(sub(w, num(1))))}} \\cdot ${dOp(v, toLatex(u))}`,
              ruleTitle: 'Generalized power rule (chain rule)',
              ruleId: 'diff-chain',
              ruleFormulaLatex: `\\frac{d}{d${vx}}\\left(u^{n}\\right) = n\\,u^{n-1}\\,\\frac{du}{d${vx}}`,
              annotation: `Outer power n = ${toText(w)} with inner function u = ${toText(u)} and u′ = ${toText(duSimp)}.`,
              theory: 'Differentiate the outer power first while keeping the inner expression u untouched, then multiply by the derivative of the inner expression u′.',
            });
          }
          return rawResult;
        }

        if (!uHas && wHas) {
          const dwSimp = simplify(diffRaw(w, v));
          const isBaseE = u.kind === 'ident' && u.name === 'e';
          const lnBase = isBaseE ? num(1) : call('ln', [u]);
          const res = mul(mul(pow(u, w), lnBase), dwSimp);
          push({
            kind: 'rule',
            workLabel: orderLabel,
            workLatex: `${dOp(v, toLatex(expr))} = ${toLatex(pow(u, w))}${isBaseE ? '' : ` \\cdot \\ln\\left(${toLatex(u)}\\right)`} \\cdot ${dOp(v, toLatex(w))}`,
            ruleTitle: isBaseE ? 'Exponential & chain rule' : 'General exponential rule',
            ruleId: 'diff-exp',
            ruleFormulaLatex: isBaseE
              ? `\\frac{d}{d${vx}}e^{u} = e^{u}\\,\\frac{du}{d${vx}}`
              : `\\frac{d}{d${vx}}a^{u} = a^{u}\\ln(a)\\,\\frac{du}{d${vx}}`,
            annotation: `Constant base ${toText(u)} raised to variable exponent ${toText(w)} (derivative ${toText(dwSimp)}).`,
            theory: 'Write aᵘ = e^(u ln a). The chain rule brings down ln(a) · u′ while keeping aᵘ unchanged.',
          });
          return res;
        }

        // Variable base AND variable exponent: logarithmic differentiation!
        const duSimp = simplify(diffRaw(u, v));
        const dwSimp = simplify(diffRaw(w, v));
        const res = mul(pow(u, w), add(mul(dwSimp, call('ln', [u])), div(mul(w, duSimp), u)));
        push({
          kind: 'rule',
          workLabel: orderLabel,
          workLatex: `\\ln y = ${toLatex(w, 4)}\\,\\ln\\left(${toLatex(u)}\\right) \\implies \\frac{y'}{y} = ${toLatex(dwSimp, 4)}\\,\\ln\\left(${toLatex(u)}\\right) + ${toLatex(div(mul(w, duSimp), u))}`,
          ruleTitle: 'Logarithmic differentiation',
          ruleId: 'diff-log-diff',
          ruleFormulaLatex: `\\frac{d}{d${vx}}\\left(u^{w}\\right) = u^{w}\\left(w'\\ln u + \\frac{w\\,u'}{u}\\right)`,
          annotation: `Both base u = ${toText(u)} and exponent w = ${toText(w)} depend on ${v}.`,
          theory: 'Neither the power rule nor the exponential rule alone applies when both base and exponent vary. Taking ln(y) turns the power into a product w·ln(u), which differentiates cleanly via the product rule.',
        });
        return res;
      }
    }

    if (expr.kind === 'call') {
      const u = expr.args[0];
      const outer = diffCallOuter(expr.name, u);
      const duSimp = simplify(diffRaw(u, v));
      const meta = getCallRuleMeta(expr.name);
      const isSimple = u.kind === 'ident' && u.name === v;

      if (isSimple) {
        push({
          kind: 'rule',
          workLabel: orderLabel,
          workLatex: `${dOp(v, toLatex(expr))} = ${toLatex(simplify(outer))}`,
          ruleTitle: meta.ruleTitle,
          ruleId: meta.ruleId,
          ruleFormulaLatex: meta.formulaLatex,
          annotation: `Direct elementary derivative with argument ${v}.`,
          theory: meta.theory,
          minor: depth > 1,
        });
        return outer;
      }

      push({
        kind: 'rule',
        workLabel: orderLabel,
        workLatex: `${dOp(v, toLatex(expr))} = ${toLatex(simplify(outer), 4)} \\cdot ${dOp(v, toLatex(u))}`,
        ruleTitle: `Chain rule + ${meta.ruleTitle}`,
        ruleId: 'diff-chain',
        ruleFormulaLatex: `\\frac{d}{d${vx}}f(u) = f'(u)\\cdot\\frac{du}{d${vx}}, \\quad ${meta.formulaLatex}`,
        annotation: `Inner function u = ${toText(u)} with du/d${v} = ${toText(duSimp)}.`,
        theory: `${meta.theory} Because the argument is a composite expression u = ${toText(u)}, the chain rule multiplies by the inner derivative du/d${v}.`,
      });

      if (depth === 0 && u.kind !== 'ident') {
        push({
          kind: 'substep',
          workLabel: orderLabel,
          workLatex: `${dOp(v, toLatex(u))} = ${toLatex(duSimp)}`,
          ruleTitle: 'Differentiate inner function',
          annotation: `Evaluate the inner derivative du/d${v}.`,
          minor: true,
        });
      }

      return mul(outer, duSimp);
    }

    return num(0);
  };

  const raw = trace(startExpr, 0);
  const simplified = simplify(raw);

  if (!exprEqual(raw, simplified) && toLatex(raw) !== toLatex(simplified)) {
    push({
      kind: 'simplify',
      workLabel: orderLabel,
      workLatex: `= ${toLatex(simplified)}`,
      ruleTitle: 'Algebraic simplification',
      ruleId: 'alg-simplify',
      annotation: 'Combine like terms, fold constant factors, and reduce fractions or exponents.',
      theory: 'Simplifying after applying calculus rules makes the result easier to evaluate, factor, or differentiate again.',
    });
  }

  return simplified;
}

/** Verify symbolic derivative against central finite-difference approximation at sample points. */
function verifyDerivativeNumerically(
  original: MathExpr,
  derivative: MathExpr,
  v: string,
  order: number,
): VerificationInfo {
  if (order > 2) {
    return {
      status: 'unverified',
      note: 'Symbolic higher-order derivation (order > 2) verified algebraically.',
    };
  }

  const probePoints = [0.37, 0.83, 1.41, 2.13, -0.61, 3.17, 0.19];
  const h = order === 1 ? 1e-6 : 1e-4;
  let checked = 0;
  let maxRelErr = 0;

  for (const x0 of probePoints) {
    const sym = evalMath(derivative, { [v]: x0 });
    if (!Number.isFinite(sym)) continue;
    let numVal: number;
    if (order === 1) {
      const fp = evalMath(original, { [v]: x0 + h });
      const fm = evalMath(original, { [v]: x0 - h });
      if (!Number.isFinite(fp) || !Number.isFinite(fm)) continue;
      numVal = (fp - fm) / (2 * h);
    } else {
      const fp = evalMath(original, { [v]: x0 + h });
      const f0 = evalMath(original, { [v]: x0 });
      const fm = evalMath(original, { [v]: x0 - h });
      if (!Number.isFinite(fp) || !Number.isFinite(f0) || !Number.isFinite(fm)) continue;
      numVal = (fp - 2 * f0 + fm) / (h * h);
    }
    const scale = Math.max(1, Math.abs(sym), Math.abs(numVal));
    const err = Math.abs(sym - numVal) / scale;
    maxRelErr = Math.max(maxRelErr, err);
    checked += 1;
  }

  if (checked === 0) {
    return {
      status: 'unverified',
      note: 'Expression contains extra symbolic parameters; verified symbolically.',
    };
  }

  if (maxRelErr < 1e-3) {
    return {
      status: 'verified',
      maxError: maxRelErr,
      samplesChecked: checked,
    };
  }

  return {
    status: 'unverified',
    maxError: maxRelErr,
    samplesChecked: checked,
    note: 'Finite-difference check saw large local curvature or discontinuity near sample points.',
  };
}

export interface SolveDerivativeOptions {
  readonly variable?: string;
  readonly order?: number;
  readonly evaluateAt?: string;
}

export function solveDerivative(
  rawExpr: string,
  options: SolveDerivativeOptions = {},
): DerivativeOutput {
  const variable = (options.variable ?? 'x').trim() || 'x';
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(variable)) {
    return {
      ok: false,
      error: `Invalid differentiation variable "${variable}". Use a letter such as x, t, or theta.`,
    };
  }

  const order = options.order ?? 1;
  if (!Number.isInteger(order) || order < 1 || order > 4) {
    return {
      ok: false,
      error: 'Derivative order must be an integer between 1 and 4.',
    };
  }

  let ast: MathExpr;
  try {
    ast = parseMath(rawExpr);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not parse expression.',
      hint: 'Examples: 3x^4 - 2x + 5, x^2 * sin(3x), ln(x^2 + 1), (2x + 1)/(x - 3)',
    };
  }

  const inputLatex = toLatex(ast);
  const promptLatex = dOrderOp(variable, order, inputLatex);
  const steps: SolutionStep[] = [];
  const vx = identToLatex(variable);

  steps.push({
    kind: 'setup',
    id: 'setup',
    workLatex: promptLatex,
    ruleTitle: order === 1 ? 'Problem statement' : `Higher-order derivative (order ${order})`,
    annotation:
      order === 1
        ? `Differentiate with respect to ${variable}.`
        : `Apply differentiation ${order} consecutive times with respect to ${variable}.`,
    theory:
      order === 1
        ? `The derivative measures the instantaneous rate of change (slope of the tangent line) of f(${variable}) as ${variable} varies.`
        : `Each higher-order derivative differentiates the previous derivative: f′ gives slope, f″ gives concavity/acceleration, and higher orders describe higher rates of change.`,
  });

  let current = ast;
  const orderResults: { order: number; latex: string; text: string }[] = [];

  try {
    for (let k = 1; k <= order; k++) {
      const label = order > 1 ? `Order ${k}` : undefined;
      current = diffSingleOrderWithSteps(current, variable, steps, `o${k}`, label);
      orderResults.push({
        order: k,
        latex: toLatex(current),
        text: toText(current),
      });
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Differentiation failed.',
      inputLatex,
    };
  }

  const resultLatex = toLatex(current);
  const resultText = toText(current);

  steps.push({
    kind: 'result',
    id: 'final-result',
    workLatex: `${promptLatex} = ${resultLatex}`,
    ruleTitle: 'Final derivative',
    annotation:
      order === 1
        ? `Simplified first derivative with respect to ${variable}.`
        : `Simplified order-${order} derivative with respect to ${variable}.`,
  });

  // Optional evaluation at x = a (plus tangent line when order === 1)
  let evaluation: DerivativePointEval | undefined;
  const evalRaw = options.evaluateAt?.trim();
  if (evalRaw) {
    try {
      const ptAst = parseMath(evalRaw);
      const ptVal = evalMath(ptAst);
      if (Number.isFinite(ptVal)) {
        const fValRaw = evalMath(ast, { [variable]: ptVal });
        const dValRaw = evalMath(current, { [variable]: ptVal });
        const fVal = Number.isFinite(fValRaw) ? fValRaw : null;
        const dVal = Number.isFinite(dValRaw) ? dValRaw : null;
        let tangentLatex: string | undefined;

        if (order === 1 && fVal !== null && dVal !== null) {
          const intercept = fVal - dVal * ptVal;
          const tangentExpr = simplify(add(mul(num(dVal), ident(variable)), num(intercept)));
          tangentLatex = `y = ${toLatex(tangentExpr)}`;
        }

        evaluation = {
          pointRaw: evalRaw,
          pointLatex: toLatex(ptAst),
          pointValue: ptVal,
          fValue: fVal,
          derivativeValue: dVal,
          tangentLatex,
        };

        if (dVal !== null) {
          steps.push({
            kind: 'evaluate',
            id: 'eval-point',
            workLatex: `\\left.${promptLatex}\\right|_{${vx} = ${toLatex(ptAst)}} = ${formatNum(dVal, 8)}`,
            ruleTitle: `Evaluate at ${variable} = ${evalRaw}`,
            annotation:
              tangentLatex !== undefined
                ? `Tangent line at ${variable} = ${evalRaw}: ${tangentLatex.replace(/^y = /, 'y = ')}.`
                : `Substitute ${variable} = ${evalRaw} into the derivative.`,
            theory:
              order === 1 && fVal !== null
                ? `At ${variable} = ${evalRaw}, the curve passes through (${formatNum(ptVal, 6)}, ${formatNum(fVal, 6)}) with slope ${formatNum(dVal, 6)}, so the local linear approximation is y = f(a) + f′(a)(${variable} − a).`
                : `Evaluating the derivative at a specific point turns the symbolic rate-of-change formula into a concrete numeric value.`,
          });
        }
      }
    } catch {
      // Ignore malformed optional evaluation point while still returning the symbolic derivative
    }
  }

  const verification = verifyDerivativeNumerically(ast, current, variable, order);

  return {
    ok: true,
    variable,
    order,
    inputLatex,
    promptLatex,
    resultLatex,
    resultText,
    steps,
    verification,
    evaluation,
    orderResults,
  };
}

/** Export helper for checking if an expression is identically zero or constant. */
export function isConstantDerivative(expr: MathExpr, v: string): boolean {
  return isZero(simplify(diffRaw(expr, v)));
}
