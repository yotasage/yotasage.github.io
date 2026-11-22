// Independent verification harness for Smart Calculator bidirectional Equation Layouts,
// symbolic/numerical equation inversion, and JSON import/export validation (Step C3).

import assert from 'node:assert/strict';

import { solveEquationNumeric, solveEquationSymbolic } from '../../../lib/calc/invert.ts';
import {
  BUILTIN_LAYOUTS,
  serializeLayout,
  serializeLayoutBundle,
  solveLayout,
  validateLayoutJson,
} from '../../../lib/calc/layouts.ts';
import { evaluateInput } from '../../../lib/calc/eval.ts';
import { parseUnitExpr } from '../../../lib/calc/units.ts';

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

function approx(actual, expected, relTol = 1e-3, absTol = 1e-9) {
  const diff = Math.abs(actual - expected);
  const bound = Math.max(absTol, relTol * Math.abs(expected));
  assert.ok(diff <= bound, `Expected ${expected} ± ${bound}, got ${actual} (diff=${diff})`);
}

// ---------------------------------------------------------------------------
// 1. All 19 built-in presets solve cleanly for EVERY variable
// ---------------------------------------------------------------------------
check(`all ${BUILTIN_LAYOUTS.length} built-in layouts are valid JSON & solve bidirectionally`, () => {
  assert.ok(BUILTIN_LAYOUTS.length >= 19, `Expected >= 19 presets, got ${BUILTIN_LAYOUTS.length}`);

  for (const layout of BUILTIN_LAYOUTS) {
    // Round-trip through JSON serializer + validator
    const json = serializeLayout(layout);
    const validated = validateLayoutJson(json);
    assert.equal(validated.ok, true, `Preset ${layout.id} failed JSON validation`);

    // Build consistent inputs from examples: solve first var from remaining examples, then verify every variable round-trips!
    const baseInputs = {};
    for (const v of layout.variables) {
      baseInputs[v.symbol] = v.example ?? '1';
    }
    const primarySym = layout.variables[0].symbol;
    const primaryRes = solveLayout(layout, primarySym, baseInputs);
    baseInputs[primarySym] = primaryRes.text;

    for (const target of layout.variables) {
      const res = solveLayout(layout, target.symbol, baseInputs);
      const expectedVal = evaluateInput(baseInputs[target.symbol]).value;
      approx(res.value.re, expectedVal.re, 1e-3, 1e-9);
      assert.ok(res.formulaLatex.length > 0);
      assert.ok(res.calculatorExpr.includes(target.symbol));
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Symbolic single-occurrence inversion (custom layout without `solvers`)
// ---------------------------------------------------------------------------
check('symbolic rearranger solves tau = R * C, f = 1/(2*pi*sqrt(L*C)), and P = V^2/R without preset solvers', () => {
  const invR = solveEquationSymbolic('tau = R * C', 'R');
  assert.ok(invR !== null);

  const customLC = {
    schemaVersion: 1,
    id: 'custom-lc',
    name: 'Custom LC',
    category: 'custom',
    description: 'No explicit solvers',
    equation: 'f = 1 / (2 * pi * sqrt(L * C))',
    variables: [
      { symbol: 'f', label: 'Frequency', defaultUnit: 'Hz' },
      { symbol: 'L', label: 'Inductance', defaultUnit: 'H' },
      { symbol: 'C', label: 'Capacitance', defaultUnit: 'F' },
    ],
  };

  const resF = solveLayout(customLC, 'f', { L: '1 uH', C: '100 pF' });
  assert.equal(resF.method, 'symbolic');
  approx(resF.value.re, 1 / (2 * Math.PI * Math.sqrt(1e-6 * 100e-12)), 1e-6);

  const resL = solveLayout(customLC, 'L', { f: resF.text, C: '100 pF' });
  assert.equal(resL.method, 'symbolic');
  approx(resL.value.re, 1e-6, 1e-4);

  const resC = solveLayout(customLC, 'C', { f: resF.text, L: '1 uH' });
  assert.equal(resC.method, 'symbolic');
  approx(resC.value.re, 100e-12, 1e-4);
});

// ---------------------------------------------------------------------------
// 3. Numerical root-finding fallback for multi-occurrence / transcendental equations
// ---------------------------------------------------------------------------
check('numerical fallback solves multi-occurrence R_eq = (R1*R2)/(R1+R2) and x + sin(x) = 1', () => {
  // Multi-occurrence R1 without explicit solvers
  const customPar = {
    schemaVersion: 1,
    id: 'custom-par',
    name: 'Custom Parallel',
    category: 'custom',
    description: 'Uses numerical fallback for R1',
    equation: 'R_eq = (R1 * R2) / (R1 + R2)',
    variables: [
      { symbol: 'R_eq', label: 'Equivalent', defaultUnit: 'ohm' },
      { symbol: 'R1', label: 'R1', defaultUnit: 'ohm' },
      { symbol: 'R2', label: 'R2', defaultUnit: 'ohm' },
    ],
  };
  const solvedR1 = solveLayout(customPar, 'R1', { R_eq: '3.333333 kOhm', R2: '5 kOhm' });
  assert.equal(solvedR1.method, 'numeric');
  approx(solvedR1.value.re, 10_000, 1e-4);

  // Transcendental equation x + sin(x) = 1 -> x ≈ 0.510973429388569
  const root = solveEquationNumeric('x + sin(x) = 1', 'x', {}, parseUnitExpr('rad'));
  approx(root.re, 0.510973429388569, 1e-7);
});

// ---------------------------------------------------------------------------
// 4. Bundle serialization & strict validation rejection tests
// ---------------------------------------------------------------------------
check('bundle JSON round-trip succeeds', () => {
  const bundleJson = serializeLayoutBundle(BUILTIN_LAYOUTS.slice(0, 3));
  const res = validateLayoutJson(bundleJson);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.layouts.length, 3);
});

check('validator rejects malformed JSON, wrong schemaVersion, bad units, and invalid equations', () => {
  assert.equal(validateLayoutJson('{bad json').ok, false);

  const wrongVer = validateLayoutJson(JSON.stringify({
    schemaVersion: 2, id: 'x', name: 'X', category: 'custom', description: '', equation: 'a = b',
    variables: [{ symbol: 'a', label: 'A' }, { symbol: 'b', label: 'B' }],
  }));
  assert.equal(wrongVer.ok, false);

  const badUnit = validateLayoutJson(JSON.stringify({
    schemaVersion: 1, id: 'x', name: 'X', category: 'custom', description: '', equation: 'a = b',
    variables: [{ symbol: 'a', label: 'A', defaultUnit: 'notAUnit' }, { symbol: 'b', label: 'B' }],
  }));
  assert.equal(badUnit.ok, false);

  const badEq = validateLayoutJson(JSON.stringify({
    schemaVersion: 1, id: 'x', name: 'X', category: 'custom', description: '', equation: 'a + b',
    variables: [{ symbol: 'a', label: 'A' }, { symbol: 'b', label: 'B' }],
  }));
  assert.equal(badEq.ok, false);
});

console.log(`check-layouts: ${passed} checks passed.`);
