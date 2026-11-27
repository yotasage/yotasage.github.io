import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkDerivationChain,
  compareBooleanSources,
  exportCompareCsv,
  parseTruthTableVector,
} from './compare';

test('equivalent expressions across consensus theorem', () => {
  const res = compareBooleanSources(
    { kind: 'expression', expr: "Y = A*B + A'*C + B*C" },
    { kind: 'expression', expr: "Y = A*B + A'*C" },
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.equivalent, true);
  assert.equal(res.relation, 'equivalent');
  assert.equal(res.mismatchCount, 0);
  assert.equal(res.checkedRows, 8);
  assert.equal(res.agreementPercent, 100);
  assert.equal(res.firstCounterexample, null);
  assert.equal(res.diffFormula, null);
  assert.ok(res.diffKMap !== null);
  assert.equal(res.diffKMap?.cells.length, 8);
});

test('equivalent expressions when a vacuous variable drops out', () => {
  const res = compareBooleanSources(
    { kind: 'expression', expr: "A*B + A*B'" },
    { kind: 'expression', expr: 'A' },
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.equivalent, true);
  assert.deepEqual(res.onlyInA, ['B']);
  assert.deepEqual(res.onlyInB, []);
  // B is vacuous in A*B + A*B', so dependMismatch should be false
  assert.equal(res.dependMismatch, false);
});

test('detects variable typo / dependency mismatch', () => {
  const res = compareBooleanSources(
    { kind: 'expression', expr: 'A*B + C' },
    { kind: 'expression', expr: 'A*B + D' },
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.equivalent, false);
  assert.deepEqual(res.onlyInA, ['C']);
  assert.deepEqual(res.onlyInB, ['D']);
  assert.equal(res.dependMismatch, true);
});

test('detects exact logical complement (inverse)', () => {
  const res = compareBooleanSources(
    { kind: 'expression', expr: 'A ^ B' },
    { kind: 'expression', expr: "A*B + A'*B'" },
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.equivalent, false);
  assert.equal(res.relation, 'complement');
  assert.equal(res.matchCount, 0);
  assert.equal(res.mismatchCount, 4);
  assert.equal(res.agreementPercent, 0);
  assert.equal(res.diffFormula?.text, '1');
});

test('detects subset (b-implies-a) and identifies exact missing term', () => {
  const res = compareBooleanSources(
    { kind: 'expression', expr: 'A*B + B*C + A*C' },
    { kind: 'expression', expr: 'A*B + A*C' },
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.equivalent, false);
  assert.equal(res.relation, 'b-implies-a');
  assert.equal(res.missingCount, 1);
  assert.equal(res.extraCount, 0);
  // Missing minterm is A=0, B=1, C=1 (index 3)
  assert.equal(res.firstCounterexample?.index, 3);
  assert.equal(res.firstCounterexample?.valA, 1);
  assert.equal(res.firstCounterexample?.valB, 0);
  assert.deepEqual(res.missingFormula?.minterms, [3]);
  assert.equal(res.extraFormula, null);
});

test('detects superset (a-implies-b) and identifies extra minterms', () => {
  const res = compareBooleanSources(
    { kind: 'expression', expr: 'A*B' },
    { kind: 'expression', expr: 'A + B' },
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.equivalent, false);
  assert.equal(res.relation, 'a-implies-b');
  assert.equal(res.missingCount, 0);
  assert.equal(res.extraCount, 2);
  assert.deepEqual(res.extraFormula?.minterms, [1, 2]);
});

test('compares expression against truth table including don\'t-care (X) rows', () => {
  // Majority table with row 7 (111) marked X, and row 0 marked 0
  // Candidate A*B' + A'*B (XOR) differs on row 3 (011 -> 1 vs 0) etc.
  // Instead test BCD-style don't-care where expression matches all specified rows:
  // Table: A,B -> [0, 1, 1, 'X'] matches both A+B and A^B!
  const resOr = compareBooleanSources(
    { kind: 'truth-table', variables: ['A', 'B'], values: [0, 1, 1, 'X'], outputName: 'Y' },
    { kind: 'expression', expr: 'A + B' },
  );
  assert.equal(resOr.ok, true);
  if (!resOr.ok) return;
  assert.equal(resOr.equivalent, true);
  assert.equal(resOr.dontCareRows, 1);
  assert.equal(resOr.checkedRows, 3);

  const resXor = compareBooleanSources(
    { kind: 'truth-table', variables: ['A', 'B'], values: [0, 1, 1, 'X'], outputName: 'Y' },
    { kind: 'expression', expr: 'A ^ B' },
  );
  assert.equal(resXor.ok, true);
  if (!resXor.ok) return;
  assert.equal(resXor.equivalent, true);
  assert.equal(resXor.dontCareRows, 1);
});

test('compares truth table against truth table', () => {
  const res = compareBooleanSources(
    { kind: 'truth-table', variables: ['A', 'B'], values: [0, 1, 1, 0], outputName: 'F1' },
    { kind: 'truth-table', variables: ['A', 'B'], values: [0, 1, 1, 1], outputName: 'F2' },
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.equivalent, false);
  assert.equal(res.mismatchCount, 1);
  assert.equal(res.firstCounterexample?.index, 3);
});

test('derivation chain identifies exact first mistake and cascaded steps', () => {
  // Original: !(A + B*C) + A'*C  === A'*(B' + C') + A'*C === A'
  const chain = checkDerivationChain(
    { kind: 'expression', expr: "!(A + B*C) + A'*C" },
    [
      "A'*(B*C)' + A'*C", // valid
      "A'*(B' * C') + A'*C", // mistake: De Morgan kept * instead of +
      "A'*B'*C' + A'*C", // valid algebra from step 2 -> cascaded!
    ],
  );
  assert.equal(chain.ok, true);
  assert.equal(chain.allValid, false);
  assert.equal(chain.firstErrorIndex, 1);
  assert.equal(chain.steps[0].status, 'valid');
  assert.equal(chain.steps[1].status, 'first-error');
  assert.equal(chain.steps[2].status, 'cascaded');
  assert.equal(chain.steps[2].vsPrev?.equivalent, true);
  assert.equal(chain.steps[2].vsOriginal?.equivalent, false);
});

test('derivation chain detects all-valid simplification and recovery', () => {
  const validChain = checkDerivationChain(
    { kind: 'expression', expr: '(A + B)*(A + C)' },
    ['A*A + A*C + B*A + B*C', 'A + A*C + A*B + B*C', 'A + B*C'],
  );
  assert.equal(validChain.ok, true);
  assert.equal(validChain.allValid, true);
  assert.equal(validChain.firstErrorIndex, null);
  assert.equal(validChain.validStepCount, 3);

  // Recovery case: step 1 wrong, step 2 matches original again
  const recChain = checkDerivationChain(
    { kind: 'expression', expr: 'A*B + A*C' },
    ['A*B', 'A*(B + C)'],
  );
  assert.equal(recChain.ok, true);
  assert.equal(recChain.steps[0].status, 'first-error');
  assert.equal(recChain.steps[1].status, 'recovered');
});

test('derivation chain handles syntax errors and empty rows cleanly', () => {
  const chain = checkDerivationChain(
    { kind: 'expression', expr: 'A + B' },
    ['', 'B + A', 'A + * B'],
  );
  assert.equal(chain.ok, true);
  assert.equal(chain.steps[0].status, 'empty');
  assert.equal(chain.steps[1].status, 'valid');
  assert.equal(chain.steps[2].status, 'syntax-error');
  assert.equal(chain.firstErrorIndex, 2);
});

test('parseTruthTableVector parses compact bitstrings and delimited vectors', () => {
  const p1 = parseTruthTableVector('00010111', 8);
  assert.equal(p1.ok, true);
  if (p1.ok) assert.deepEqual(p1.values, [0, 0, 0, 1, 0, 1, 1, 1]);

  const p2 = parseTruthTableVector('0, 1, X, -', 4);
  assert.equal(p2.ok, true);
  if (p2.ok) assert.deepEqual(p2.values, [0, 1, 'X', 'X']);

  const pBadLen = parseTruthTableVector('010', 4);
  assert.equal(pBadLen.ok, false);

  const pBadChar = parseTruthTableVector('0120', 4);
  assert.equal(pBadChar.ok, false);
});

test('rejects > 8 combined variables and exports CSV cleanly', () => {
  const tooMany = compareBooleanSources(
    { kind: 'expression', expr: 'A + B + C + D + E' },
    { kind: 'expression', expr: 'F + G + H + I' },
  );
  assert.equal(tooMany.ok, false);

  const okRes = compareBooleanSources(
    { kind: 'expression', expr: 'A*B', label: 'Ref' },
    { kind: 'expression', expr: 'A + B', label: 'Work' },
  );
  assert.equal(okRes.ok, true);
  if (okRes.ok) {
    const csv = exportCompareCsv(okRes);
    const lines = csv.split('\n');
    assert.equal(lines[0], '#,A,B,Ref,Work,Status');
    assert.equal(lines.length, 5);
  }
});
