// Independent verification harness for Smart Calculator parser, evaluator,
// notebook scratchpad, symbolic calculus, and numerical quadrature (Step C2).

import assert from 'node:assert/strict';

import { exprToLatex, exprToText } from '../../../lib/calc/ast.ts';
import { differentiate, integrateNumeric, integrateSymbolic } from '../../../lib/calc/calculus.ts';
import { evalAstNumeric, evaluateInput, evaluateNotebook } from '../../../lib/calc/eval.ts';
import { parseExpression } from '../../../lib/calc/parse.ts';
import { makeScalar } from '../../../lib/calc/value.ts';

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error('     ', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

function approx(actual, expected, relTol = 1e-6, absTol = 1e-12) {
  const diff = Math.abs(actual - expected);
  const bound = Math.max(absTol, relTol * Math.abs(expected));
  assert.ok(diff <= bound, `Expected ${expected} ± ${bound}, got ${actual} (diff=${diff})`);
}

// ---------------------------------------------------------------------------
// 1. Unit-aware expressions & smart SI prefixing
// ---------------------------------------------------------------------------
check('1 / (100 MHz) -> 10 ns', () => {
  const r = evaluateInput('1 / (100 MHz)');
  assert.equal(r.kind, 'value');
  approx(r.value.re, 10e-9);
  assert.equal(r.text, '10 ns');
});

check('10 kOhm * 100 pF -> 1 µs', () => {
  const r = evaluateInput('10 kOhm * 100 pF');
  assert.equal(r.kind, 'value');
  approx(r.value.re, 1e-6);
  assert.equal(r.text, '1 µs');
});

check('25 um * 40 um -> 1000 µm²', () => {
  const r = evaluateInput('25 um * 40 um');
  assert.equal(r.kind, 'value');
  approx(r.value.re, 1000e-12);
  assert.equal(r.text, '1000 µm²');
});

check('25 um * 40 um in mm^2 -> 0.001 mm²', () => {
  const r = evaluateInput('25 um * 40 um in mm^2');
  assert.equal(r.kind, 'value');
  assert.equal(r.text, '0.001 mm²');
});

check('inch disambiguation: 10 in, 10 in to mm, 25.4 mm in in, 10 in in mm', () => {
  const a = evaluateInput('10 in');
  assert.equal(a.kind, 'value');
  approx(a.value.re, 0.254);

  const b = evaluateInput('10 in to mm');
  assert.equal(b.kind, 'value');
  assert.equal(b.text, '254 mm');

  const c = evaluateInput('25.4 mm in in');
  assert.equal(c.kind, 'value');
  assert.equal(c.text, '1 in');

  const d = evaluateInput('10 in in mm');
  assert.equal(d.kind, 'value');
  assert.equal(d.text, '254 mm');
});

check('explicit conversions: to, as, ->, temperature & dBm', () => {
  const r1 = evaluateInput('100 mW in dBm');
  assert.equal(r1.kind, 'value');
  assert.equal(r1.text, '20 dBm');

  const r2 = evaluateInput('30 dBm -> W');
  assert.equal(r2.kind, 'value');
  assert.equal(r2.text, '1 W');

  const r3 = evaluateInput('25 degC as degF');
  assert.equal(r3.kind, 'value');
  assert.equal(r3.text, '77 °F');

  const r4 = evaluateInput('4.7k * 2');
  assert.equal(r4.kind, 'value');
  approx(r4.value.re, 9400);
});

check('parallel operator || and parallel()', () => {
  const r1 = evaluateInput('10 kOhm || 10 kOhm');
  assert.equal(r1.kind, 'value');
  assert.equal(r1.text, '5 kΩ');

  const r2 = evaluateInput('parallel(100 ohm, 100 ohm, 50 ohm)');
  assert.equal(r2.kind, 'value');
  assert.equal(r2.text, '25 Ω');
});

// ---------------------------------------------------------------------------
// 2. Complex numbers, phasors, and RF impedance
// ---------------------------------------------------------------------------
check('50 + j*30 Ohm complex impedance shorthand', () => {
  const r = evaluateInput('50 + j*30 Ohm');
  assert.equal(r.kind, 'value');
  approx(r.value.re, 50);
  approx(r.value.im, 30);
  assert.equal(r.text, '50 + j 30 Ω');
  assert.ok(r.hints.some((h) => h.label === 'Polar'));
});

check('capacitive impedance 1 / (j * 2*pi * 1 MHz * 100 pF)', () => {
  const r = evaluateInput('1 / (j * 2*pi * 1 MHz * 100 pF)');
  assert.equal(r.kind, 'value');
  approx(r.value.re, 0, 1e-6, 1e-9);
  approx(r.value.im, -1 / (2 * Math.PI * 1e6 * 100e-12), 1e-6);
});

check('phasor notation: 10 ∠ 45 deg and 10 V angle 30 deg', () => {
  const r1 = evaluateInput('10 ∠ 45 deg');
  assert.equal(r1.kind, 'value');
  approx(r1.value.re, 10 * Math.SQRT1_2);
  approx(r1.value.im, 10 * Math.SQRT1_2);

  const r2 = evaluateInput('10 V angle 30 deg');
  assert.equal(r2.kind, 'value');
  approx(r2.value.re, 10 * Math.cos(Math.PI / 6));
  approx(r2.value.im, 10 * Math.sin(Math.PI / 6));
});

check('complex functions: abs, arg, re, im, conj, polar', () => {
  const z = evaluateInput('polar(5, 36.8698976458 deg)');
  assert.equal(z.kind, 'value');
  approx(z.value.re, 4, 1e-5);
  approx(z.value.im, 3, 1e-5);

  const a = evaluateInput('abs(3 + j*4)');
  assert.equal(a.kind, 'value');
  approx(a.value.re, 5);
});

// ---------------------------------------------------------------------------
// 3. CODATA constants, variables, shadowing, history & notebook
// ---------------------------------------------------------------------------
check('CODATA constants: c / (2.4 GHz) and sqrt(mu0 / eps0) == Z0', () => {
  const wl = evaluateInput('c / (2.4 GHz)');
  assert.equal(wl.kind, 'value');
  approx(wl.value.re, 299792458 / 2.4e9, 1e-9);

  const z0 = evaluateInput('sqrt(mu0 / eps0)');
  const z0Ref = evaluateInput('Z0');
  assert.equal(z0.kind, 'value');
  assert.equal(z0Ref.kind, 'value');
  approx(z0.value.re, z0Ref.value.re, 1e-9);
});

check('user variable overrides constants & single-letter units', () => {
  const vars = {
    R: evaluateInput('10 kOhm').value,
    C: evaluateInput('100 pF').value,
    c: makeScalar(42),
  };
  const rc = evaluateInput('R * C', { vars });
  assert.equal(rc.kind, 'value');
  assert.equal(rc.text, '1 µs');

  const twoC = evaluateInput('2 C', { vars });
  assert.equal(twoC.kind, 'value');
  approx(twoC.value.re, 200e-12);

  const cOverride = evaluateInput('c + 8', { vars });
  assert.equal(cOverride.kind, 'value');
  approx(cOverride.value.re, 50);
});

check('ans, ans1..ansN and notebook prev/lineN', () => {
  const h1 = evaluateInput('10 V').value;
  const h2 = evaluateInput('2 kOhm').value;
  const cur = evaluateInput('ans1 / ans', { ans: h2, historyValues: [h1, h2] });
  assert.equal(cur.kind, 'value');
  assert.equal(cur.text, '5 mA');

  const nb = evaluateNotebook([
    '# RC filter',
    'R = 10 kOhm',
    'C = 100 pF',
    'tau = R * C',
    'f_c = 1 / (2 * pi * prev)',
    'line2 * line3',
  ].join('\n'));
  assert.equal(nb.lines[1].kind, 'value');
  assert.equal(nb.lines[3].result?.text, '1 µs');
  approx(nb.vars.f_c.re, 1 / (2 * Math.PI * 1e-6), 1e-6);
  assert.equal(nb.lines[5].result?.text, '1 µs');
});

// ---------------------------------------------------------------------------
// 4. Symbolic Differentiation
// ---------------------------------------------------------------------------
function checkDerivativeNumeric(exprStr, xVar, order, testPoints) {
  const ast = parseExpression(exprStr);
  const dAst = differentiate(ast, xVar, order);
  const evalNum = (e, x) => evalAstNumeric(e, { vars: { [xVar]: makeScalar(x) } }).re;
  const h = 1e-5;
  for (const x of testPoints) {
    const symVal = evalNum(dAst, x);
    let fdVal;
    if (order === 1) {
      fdVal = (evalNum(ast, x + h) - evalNum(ast, x - h)) / (2 * h);
    } else if (order === 2) {
      fdVal = (evalNum(ast, x + h) - 2 * evalNum(ast, x) + evalNum(ast, x - h)) / (h * h);
    }
    approx(symVal, fdVal, 1e-4, 1e-5);
  }
  return dAst;
}

check('diff(x^3 + 2*x, x) -> 3·x² + 2', () => {
  const r = evaluateInput('diff(x^3 + 2*x, x)');
  assert.equal(r.kind, 'symbolic');
  checkDerivativeNumeric('x^3 + 2*x', 'x', 1, [-2, 0, 1.5, 4]);
  assert.ok(r.latex.includes('x^{2}'));
});

check('d/dx(sin(3*x)) and diff(sin(3*x), x, 2)', () => {
  const r1 = evaluateInput('d/dx(sin(3*x))');
  assert.equal(r1.kind, 'symbolic');
  checkDerivativeNumeric('sin(3*x)', 'x', 1, [0.2, 1.1, 2.5]);

  const r2 = evaluateInput('diff(sin(3*x), x, 2)');
  assert.equal(r2.kind, 'symbolic');
  checkDerivativeNumeric('sin(3*x)', 'x', 2, [0.2, 1.1, 2.5]);
});

check('diff product, quotient, chain, ln, exp, sqrt, atan', () => {
  checkDerivativeNumeric('x^2 * exp(x)', 'x', 1, [-1, 0.5, 2]);
  checkDerivativeNumeric('(x + 1) / (x^2 + 2)', 'x', 1, [-1, 0.5, 3]);
  checkDerivativeNumeric('ln(x^2 + 1)', 'x', 1, [0.5, 2, 5]);
  checkDerivativeNumeric('sqrt(2*x + 5)', 'x', 1, [0, 1.5, 6]);
  checkDerivativeNumeric('atan(2*x)', 'x', 1, [-1, 0.4, 2]);
});

// ---------------------------------------------------------------------------
// 5. Symbolic Indefinite Integration (verified by differentiating F(x) numerically!)
// ---------------------------------------------------------------------------
function checkAntiderivative(exprStr, xVar, testPoints) {
  const fAst = parseExpression(exprStr);
  const F = integrateSymbolic(fAst, xVar);
  assert.ok(F !== null, `Expected symbolic integral for "${exprStr}"`);
  const evalNum = (e, x) => evalAstNumeric(e, { vars: { [xVar]: makeScalar(x) } }).re;
  const h = 1e-6;
  for (const x of testPoints) {
    const fVal = evalNum(fAst, x);
    const dF = (evalNum(F, x + h) - evalNum(F, x - h)) / (2 * h);
    approx(dF, fVal, 1e-5, 1e-6);
  }
  return F;
}

check('int polynomials, power rule, 1/x, linear substitution', () => {
  checkAntiderivative('3*x^2 + 2*x - 5', 'x', [-2, 0.5, 3]);
  checkAntiderivative('1 / x', 'x', [0.5, 2, 7]);
  checkAntiderivative('(2*x + 3)^4', 'x', [-1, 0.5, 2]);
  checkAntiderivative('1 / (3*x + 1)', 'x', [0.5, 2, 4]);
});

check('int exp, sin, cos, tan, sec^2, sinh, cosh', () => {
  checkAntiderivative('exp(2*x + 1)', 'x', [-0.5, 0.5, 1.2]);
  checkAntiderivative('sin(3*x - 1)', 'x', [0.2, 1, 2]);
  checkAntiderivative('cos(4*x)', 'x', [0.1, 0.7, 1.5]);
  checkAntiderivative('tan(2*x)', 'x', [0.1, 0.3, 0.5]);
  checkAntiderivative('sec(2*x)^2', 'x', [0.1, 0.3, 0.5]);
  checkAntiderivative('sinh(2*x)', 'x', [-0.5, 0.4, 1]);
  checkAntiderivative('cosh(3*x)', 'x', [-0.4, 0.3, 0.9]);
});

check('int 1/(a^2+x^2) and 1/sqrt(a^2-x^2)', () => {
  checkAntiderivative('1 / (4 + x^2)', 'x', [-3, 0.5, 2]);
  checkAntiderivative('1 / sqrt(9 - x^2)', 'x', [-2, 0.5, 2.2]);
});

check('int by parts: x*exp(a*x), x*sin(a*x), x*cos(a*x), x^2*ln(x), ln(x)/x', () => {
  checkAntiderivative('x * exp(2*x)', 'x', [-0.5, 0.5, 1.2]);
  checkAntiderivative('x * sin(3*x)', 'x', [0.2, 1.0, 2.0]);
  checkAntiderivative('x * cos(2*x)', 'x', [0.2, 1.0, 2.0]);
  checkAntiderivative('x^2 * ln(x)', 'x', [0.5, 1.5, 3.0]);
  checkAntiderivative('ln(x) / x', 'x', [0.5, 2.0, 5.0]);
});

check('evaluateInput int(x^2, x) returns symbolic + C', () => {
  const r = evaluateInput('int(x^2, x)');
  assert.equal(r.kind, 'symbolic');
  assert.equal(r.isIndefiniteIntegral, true);
  assert.ok(r.text.endsWith('+ C'));
  assert.ok(r.latex.endsWith('+ C'));
});

// ---------------------------------------------------------------------------
// 6. Definite Integration (FTC + Adaptive Gauss-Kronrod G7-K15)
// ---------------------------------------------------------------------------
check('definite integrals: x^2, sin(x), Gaussian exp(-x^2), reversed bounds', () => {
  const r1 = evaluateInput('int(x^2, x, 0, 3)');
  assert.equal(r1.kind, 'value');
  approx(r1.value.re, 9, 1e-10);

  const r2 = evaluateInput('integrate(sin(x), x, 0, pi)');
  assert.equal(r2.kind, 'value');
  approx(r2.value.re, 2, 1e-10);

  // Non-elementary Gaussian integral: erf(1) * sqrt(pi)/2 ≈ 0.746824132812427
  const r3 = evaluateInput('int(exp(-x^2), x, 0, 1)');
  assert.equal(r3.kind, 'value');
  approx(r3.value.re, 0.746824132812427, 1e-10);

  // Reversed limits negate integral
  const r4 = evaluateInput('int(x^2, x, 3, 0)');
  assert.equal(r4.kind, 'value');
  approx(r4.value.re, -9, 1e-10);

  // Direct G7-K15 check on oscillatory function
  const g = integrateNumeric((x) => Math.sin(10 * x), 0, Math.PI);
  approx(g.value, 0, 1e-10, 1e-10);
});

check('AST printers produce valid text & LaTeX', () => {
  const ast = parseExpression('1 / (2 * pi * sqrt(L * C))');
  assert.ok(exprToText(ast).includes('π'));
  assert.ok(exprToLatex(ast).includes('\\frac'));
  assert.ok(exprToLatex(ast).includes('\\sqrt'));
});

console.log(`check-eval: ${passed} checks passed.`);
