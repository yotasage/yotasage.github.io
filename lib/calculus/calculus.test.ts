import assert from 'node:assert/strict';
import test from 'node:test';

import katex from 'katex';

import { evalMath, toLatex } from './ast';
import { solveDerivative } from './differentiate';
import { DERIVATIVE_EXAMPLES, INTEGRAL_EXAMPLES, MATH_IDENTITIES } from './identities';
import { solveIntegral } from './integrate';
import { parseMath } from './parse';

function assertClose(actual: number, expected: number, tol = 1e-5, label = '') {
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected)),
    `${label}: expected ~${expected}, got ${actual}`,
  );
}

test('parseMath handles pure variables (t, s, m, g), implicit mul, trig powers, abs bars', () => {
  const e1 = parseMath('2t^2 + 3t - 5');
  assertClose(evalMath(e1, { t: 4 }), 2 * 16 + 12 - 5, 1e-12, '2t^2 + 3t - 5');

  const e2 = parseMath('sin^2(x) + cos^2(x)');
  assertClose(evalMath(e2, { x: 1.23 }), 1, 1e-12, 'sin^2 + cos^2');

  const e3 = parseMath('3x * ln(|x|) + e^(-2x)');
  assertClose(evalMath(e3, { x: -2 }), -6 * Math.log(2) + Math.exp(4), 1e-10, 'abs and e^');

  const e4 = parseMath('(x + 1)(x - 3)');
  assertClose(evalMath(e4, { x: 5 }), 6 * 2, 1e-12, 'implicit paren mul');

  assert.throws(() => parseMath(''));
  assert.throws(() => parseMath('sin('));
});

test('solveDerivative produces verified steps across core calculus rules', () => {
  const cases: { expr: string; x: number; expected: number; variable?: string; order?: number }[] = [
    { expr: '3x^4 - 2x^2 + 5x - 7', x: 2, expected: 12 * 8 - 4 * 2 + 5 },
    { expr: 'x^2 * sin(3x)', x: 1.1, expected: 2 * 1.1 * Math.sin(3.3) + 1.21 * 3 * Math.cos(3.3) },
    { expr: '(2x + 1) / (x^2 + 3)', x: 1.5, expected: (2 * (2.25 + 3) - (4) * 3) / Math.pow(2.25 + 3, 2) },
    { expr: 'ln(x^2 + 1)', x: 2, expected: 4 / 5 },
    { expr: 'x^x', x: 1.7, expected: Math.pow(1.7, 1.7) * (Math.log(1.7) + 1) },
    { expr: 'atan(x^2)', x: 0.8, expected: (2 * 0.8) / (1 + Math.pow(0.8, 4)) },
    { expr: 'e^(-2t) * cos(4t)', variable: 't', x: 0.5, expected: Math.exp(-1) * (-2 * Math.cos(2) - 4 * Math.sin(2)) },
    { expr: 'x^4', x: 2, order: 3, expected: 24 * 2 },
  ];

  for (const c of cases) {
    const res = solveDerivative(c.expr, { variable: c.variable ?? 'x', order: c.order ?? 1 });
    assert.equal(res.ok, true, `Failed on ${c.expr}`);
    if (!res.ok) continue;
    assert.ok(res.steps.length >= 3, `Expected >= 3 steps for ${c.expr}`);
    const parsedRes = parseMath(res.resultText);
    const val = evalMath(parsedRes, { [c.variable ?? 'x']: c.x });
    assertClose(val, c.expected, 1e-6, `Derivative of ${c.expr}`);
    if ((c.order ?? 1) <= 2) {
      assert.equal(res.verification.status, 'verified', `Expected verified status for ${c.expr}`);
    }
  }
});

test('solveDerivative evaluates point and builds tangent line', () => {
  const res = solveDerivative('x^2 + 2x', { evaluateAt: '3' });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.ok(res.evaluation);
  assertClose(res.evaluation.fValue ?? Number.NaN, 15, 1e-9, 'f(3)');
  assertClose(res.evaluation.derivativeValue ?? Number.NaN, 8, 1e-9, "f'(3)");
  assert.ok(res.evaluation.tangentLatex?.includes('8'));
});

test('solveIntegral solves indefinite integrals across power, u-sub, trig, IBP, partial fractions, completing square', () => {
  const cases = [
    '3x^2 - 4x + 5',
    '1 / (3x + 2)',
    'x * exp(x^2)',
    '2x / (x^2 + 1)',
    'sin(x) * cos(x)',
    'sin^2(x)',
    'cos^2(2x)',
    'tan^2(x)',
    'sin^3(x)',
    'sin(3x) * cos(x)',
    'x * exp(2x)',
    'x^2 * exp(x)',
    'x * cos(2x)',
    'x * ln(x)',
    'ln(x)',
    'atan(x)',
    'exp(x) * sin(x)',
    '1 / (x^2 + 9)',
    '1 / sqrt(4 - x^2)',
    '1 / (x^2 - 4)',
    '1 / (x^2 + 4x + 8)',
    '(x + 2) * (x - 3)',
  ];

  for (const expr of cases) {
    const res = solveIntegral(expr);
    assert.equal(res.ok, true, `Expected symbolic integral for ${expr}`);
    if (!res.ok) continue;
    assert.equal(res.verification.status, 'verified', `Expected verified antiderivative for ${expr}`);
    assert.ok(res.steps.length >= 3, `Expected >= 3 steps for ${expr}`);
    assert.ok(res.resultLatex.includes('+ C'), `Expected + C for indefinite ${expr}`);
  }
});

test('solveIntegral handles definite FTC and Gauss-Kronrod numeric fallback', () => {
  const defSin = solveIntegral('sin(x)', { definite: true, lower: '0', upper: 'pi' });
  assert.equal(defSin.ok, true);
  if (defSin.ok) {
    assertClose(defSin.numericValue ?? Number.NaN, 2, 1e-8, '∫_0^pi sin(x) dx');
    assert.equal(defSin.verification.status, 'verified');
  }

  const defPoly = solveIntegral('3x^2', { definite: true, lower: '1', upper: '3' });
  assert.equal(defPoly.ok, true);
  if (defPoly.ok) {
    assertClose(defPoly.numericValue ?? Number.NaN, 26, 1e-8, '∫_1^3 3x^2 dx');
  }

  const gauss = solveIntegral('exp(-x^2)', { definite: true, lower: '0', upper: '1' });
  assert.equal(gauss.ok, true);
  if (gauss.ok) {
    assertClose(gauss.numericValue ?? Number.NaN, 0.746824132812, 1e-7, '∫_0^1 exp(-x^2) dx');
    assert.equal(gauss.verification.status, 'numeric-only');
  }
});

test('all curated solver examples and identity examples succeed cleanly', () => {
  for (const ex of DERIVATIVE_EXAMPLES) {
    const r = solveDerivative(ex.expr, { variable: ex.variable, order: ex.order });
    assert.equal(r.ok, true, `Derivative example failed: ${ex.expr}`);
  }
  for (const ex of INTEGRAL_EXAMPLES) {
    const r = solveIntegral(ex.expr, {
      variable: ex.variable,
      definite: Boolean(ex.lower && ex.upper),
      lower: ex.lower,
      upper: ex.upper,
    });
    assert.equal(r.ok, true, `Integral example failed: ${ex.expr}`);
    if (r.ok) {
      katex.renderToString(r.promptLatex, { output: 'mathml', displayMode: true });
      katex.renderToString(r.resultLatex, { output: 'mathml', displayMode: true });
      for (const s of r.steps) {
        katex.renderToString(s.workLatex, { output: 'mathml', displayMode: false });
        if (s.ruleFormulaLatex) {
          katex.renderToString(s.ruleFormulaLatex, { output: 'mathml', displayMode: false });
        }
      }
    }
  }
  for (const ex of DERIVATIVE_EXAMPLES) {
    const r = solveDerivative(ex.expr, { variable: ex.variable ?? 'x', order: ex.order ?? 1 });
    assert.equal(r.ok, true, `Derivative example failed: ${ex.expr}`);
    if (r.ok) {
      katex.renderToString(r.promptLatex, { output: 'mathml', displayMode: true });
      katex.renderToString(r.resultLatex, { output: 'mathml', displayMode: true });
      for (const s of r.steps) {
        katex.renderToString(s.workLatex, { output: 'mathml', displayMode: false });
        if (s.ruleFormulaLatex) {
          katex.renderToString(s.ruleFormulaLatex, { output: 'mathml', displayMode: false });
        }
      }
    }
  }
  assert.ok(MATH_IDENTITIES.length >= 30);
  // Ensure every identity has valid KaTeX formula and parseable example
  for (const id of MATH_IDENTITIES) {
    assert.ok(id.formulaLatex.length > 0);
    katex.renderToString(id.formulaLatex, { output: 'mathml', displayMode: false });
    const parsedLatex = toLatex(parseMath(id.exampleExpr));
    assert.ok(parsedLatex.length > 0);
    katex.renderToString(parsedLatex, { output: 'mathml', displayMode: false });
  }
});

test('exp(x^2) and e^(x^2) produce identical integral and derivative solutions', () => {
  const intExp = solveIntegral('x * exp(x^2)');
  const intEuler = solveIntegral('x * e^(x^2)');
  assert.equal(intExp.ok, true);
  assert.equal(intEuler.ok, true);
  if (intExp.ok && intEuler.ok) {
    assert.equal(intEuler.resultLatex, intExp.resultLatex);
    assert.equal(intEuler.resultText, intExp.resultText);
    assert.deepEqual(intEuler.steps, intExp.steps);
  }

  const diffExp = solveDerivative('x * exp(x^2)');
  const diffEuler = solveDerivative('x * e^(x^2)');
  assert.equal(diffExp.ok, true);
  assert.equal(diffEuler.ok, true);
  if (diffExp.ok && diffEuler.ok) {
    assert.equal(diffEuler.resultLatex, diffExp.resultLatex);
    assert.equal(diffEuler.resultText, diffExp.resultText);
    assert.deepEqual(diffEuler.steps, diffExp.steps);
  }
});
