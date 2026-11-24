import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCircuitGraph,
  buildMultiCircuitGraph,
  decomposeAstForGateMode,
  evaluateCircuitNodes,
  exportCircuitTikz,
} from './circuit';
import { buildGateReferenceList } from './gateReference';
import { KMAP_WORKED_EXAMPLES } from './kmapGuide';
import { DEFAULT_GATE_DELAYS } from './laws';
import {
  evaluateBool,
  parseBoolean,
  preprocessLatex,
  toLatex,
  toPlainText,
  toVerilog,
  toVhdl,
} from './parse';
import { evalTruthVector, minimizeQM } from './qm';
import { simplifyBoolean } from './simplify';
import { computeCriticalPath, simulateCircuitTiming } from './timing';
import {
  buildMultiTruthTable,
  buildTruthTable,
  exportTruthTableCsv,
  exportTruthTableLatex,
} from './truthTable';
import type { GateDelayMap, SimplifyMethod, TargetForm } from './types';

test('parser handles engineering, logic, programming, keywords, juxtaposition, and output name', () => {
  const cases = [
    { expr: "Y = A*B + A'*C", out: 'Y', vars: ['A', 'B', 'C'] },
    { expr: 'AB + A\'C', out: 'Y', vars: ['A', 'B', 'C'] },
    { expr: 'F = (A AND B) OR (NOT A AND C)', out: 'F', vars: ['A', 'B', 'C'] },
    { expr: '(A && B) || (!A && C)', out: 'Y', vars: ['A', 'B', 'C'] },
    { expr: 'A ∧ B ∨ ¬A ∧ C', out: 'Y', vars: ['A', 'B', 'C'] },
  ];

  const ref = parseBoolean("A*B + !A*C");
  const refVec = evalTruthVector(ref.ast, ref.variables);

  for (const c of cases) {
    const parsed = parseBoolean(c.expr);
    assert.equal(parsed.outputName, c.out);
    assert.deepEqual(parsed.variables, c.vars);
    const vec = evalTruthVector(parsed.ast, parsed.variables);
    assert.deepEqual(vec, refVec);
  }
});

test('parser rejects malformed inputs with helpful messages', () => {
  assert.throws(() => parseBoolean(''), /Enter a Boolean expression/);
  assert.throws(() => parseBoolean('A + * B'), /Unexpected token/);
  assert.throws(() => parseBoolean('(A + B'), /Missing closing parenthesis/);
  assert.throws(() => parseBoolean('A + B = C'), /single output name/);
});

test('simplification preserves 100% truth-table equivalence across all methods, forms, and intermediate steps', () => {
  const expressions = [
    "Y = A*B + A'*C + B*C",
    'Y = (A + B)*(A + C)',
    "Y = !(A*B) + A*B'",
    "Y = A'*B'*C + A'*B*C + A*B'*C + A*B*C",
    'Cout = A*B + B*C + A*C + A*B*C',
    'Y = A*B + A*C + A*D',
    "Y = A'*B + A*B'",
    "Y = A'*B'*C'*D + A'*B'*C*D + A'*B*C'*D + A*B'*C'*D + A*B'*C*D",
    'Y = A + A*B',
    'Y = A*!A + B*1',
    'Y = (A XOR B) XOR B',
    'Y = A NAND (A NAND B)',
  ];

  const methods: SimplifyMethod[] = ['algebraic', 'qm', 'heuristic'];
  const forms: TargetForm[] = ['auto', 'sop', 'pos', 'nand', 'nor'];

  for (const expr of expressions) {
    for (const method of methods) {
      for (const targetForm of forms) {
        const res = simplifyBoolean(expr, {
          method,
          effort: 'medium',
          targetForm,
          notation: 'engineering',
        });
        assert.equal(res.ok, true, `Failed to simplify "${expr}" (${method}/${targetForm})`);
        if (!res.ok) continue;
        assert.equal(res.equivalent, true, `Equivalence mismatch for "${expr}" (${method}/${targetForm})`);

        const origVec = evalTruthVector(res.originalAst, res.variables);
        for (const step of res.steps) {
          const stepVec = evalTruthVector(step.ast, res.variables);
          assert.deepEqual(
            stepVec,
            origVec,
            `Step "${step.ruleTitle}" broke equivalence on "${expr}" (${method}/${targetForm})`,
          );
        }
      }
    }
  }
});

test('consensus, absorption, XOR synthesis, and multi-level factoring reduce expressions as expected', () => {
  const consensus = simplifyBoolean("Y = A*B + A'*C + B*C", {
    method: 'algebraic',
    effort: 'medium',
    targetForm: 'auto',
    notation: 'engineering',
  });
  assert.equal(consensus.ok, true);
  if (consensus.ok) {
    assert.ok(consensus.simplifiedMetrics.literals < consensus.originalMetrics.literals);
    assert.ok(consensus.steps.some((s) => s.ruleId === 'consensus'));
  }

  const collapse = simplifyBoolean("Y = A'*B'*C + A'*B*C + A*B'*C + A*B*C", {
    method: 'qm',
    effort: 'medium',
    targetForm: 'auto',
    notation: 'engineering',
  });
  assert.equal(collapse.ok, true);
  if (collapse.ok) {
    assert.equal(collapse.simplifiedText, 'C');
    assert.equal(collapse.simplifiedMetrics.gates, 0);
  }

  const xorRes = simplifyBoolean("Y = A'*B + A*B'", {
    method: 'heuristic',
    effort: 'medium',
    targetForm: 'auto',
    notation: 'engineering',
  });
  assert.equal(xorRes.ok, true);
  if (xorRes.ok) {
    assert.equal(xorRes.simplifiedAst.kind, 'gate');
    if (xorRes.simplifiedAst.kind === 'gate') {
      assert.equal(xorRes.simplifiedAst.op, 'XOR');
    }
  }

  const factorRes = simplifyBoolean('Y = A*B + A*C + A*D', {
    method: 'heuristic',
    effort: 'medium',
    targetForm: 'auto',
    notation: 'engineering',
  });
  assert.equal(factorRes.ok, true);
  if (factorRes.ok) {
    assert.ok(factorRes.simplifiedMetrics.literals <= 4);
  }
});

test('Quine-McCluskey produces minimal SOP and POS covers and builds valid 4-var K-Map', () => {
  const parsed = parseBoolean("Y = A'*B'*C'*D + A'*B'*C*D + A'*B*C'*D + A*B'*C'*D + A*B'*C*D");
  const vec = evalTruthVector(parsed.ast, parsed.variables);
  const sop = minimizeQM(vec, parsed.variables, 'sop', 'high');
  const pos = minimizeQM(vec, parsed.variables, 'pos', 'high');

  assert.deepEqual(evalTruthVector(sop.ast, parsed.variables), vec);
  assert.deepEqual(evalTruthVector(pos.ast, parsed.variables), vec);

  const full = simplifyBoolean("Y = A'*B'*C'*D + A'*B'*C*D + A'*B*C'*D + A*B'*C'*D + A*B'*C*D", {
    method: 'qm',
    effort: 'medium',
    targetForm: 'sop',
    notation: 'engineering',
  });
  assert.equal(full.ok, true);
  if (full.ok) {
    assert.ok(full.kmap !== null);
    assert.equal(full.kmap?.rowLabels.length, 4);
    assert.equal(full.kmap?.colLabels.length, 4);
    assert.ok((full.kmap?.groups.length ?? 0) >= 1);
  }
});

test('circuit DAG builder, live evaluator, truth table, and TikZ export work end-to-end', () => {
  const parsed = parseBoolean("Y = A*B + A'*C");
  const graph = buildCircuitGraph(parsed.ast, parsed.variables, parsed.outputName, 'engineering');

  assert.ok(graph.internals.length >= 2, 'Should extract internal signals for gates');
  const table = buildTruthTable(parsed.ast, parsed.variables, parsed.outputName, graph.internals);
  assert.equal(table.rows.length, 8);

  // Verify live circuit evaluation matches AST evaluation on every row
  for (const row of table.rows) {
    const nodeVals = evaluateCircuitNodes(graph, row.inputs);
    assert.equal(nodeVals.OUT, row.output);
    assert.equal(evaluateBool(parsed.ast, row.inputs), row.output);
  }

  const tikzIeee = exportCircuitTikz(graph, 'ieee', 'Test circuit');
  assert.ok(tikzIeee.includes('\\begin{circuitikz}'));
  assert.ok(tikzIeee.includes('logic ports=ieee'));
  assert.ok(tikzIeee.includes('\\end{circuitikz}'));

  const csv = exportTruthTableCsv(table, [
    { id: 'A', label: 'A', kind: 'input' },
    { id: 'Y', label: 'Y', kind: 'output' },
  ]);
  assert.equal(csv.split('\n').length, 9);

  const latexTbl = exportTruthTableLatex(table, [
    { id: 'A', label: 'A', kind: 'input' },
    { id: 'Y', label: 'Y', kind: 'output' },
  ]);
  assert.ok(latexTbl.includes('\\begin{tabular}'));
  assert.ok(toVerilog('Y', parsed.ast).startsWith('assign Y ='));
  assert.ok(toVhdl('Y', parsed.ast).startsWith('Y <='));
  assert.ok(toLatex(parsed.ast, 'engineering').includes('\\overline'));
  assert.ok(toPlainText(parsed.ast, 'logic').includes('∧'));
});

test('timing simulation respects gate-type delays, per-instance overrides, glitches, DFF clocking, and WaveDrom JSON', () => {
  // Static-1 hazard classic: Y = A*B + !A*C when B=1, C=1 and A toggles!
  const parsed = parseBoolean("Y = A*B + A'*C");
  const graph = buildCircuitGraph(parsed.ast, parsed.variables, parsed.outputName, 'engineering');

  const critBase = computeCriticalPath(graph, DEFAULT_GATE_DELAYS, {});
  // Longest path: NOT(5) -> AND(10) -> OR(15) = 30 ns
  assert.equal(critBase.delayNs, 30);

  // Override one gate instance (e.g., U1) with 40 ns and verify critical path increases
  const firstGate = graph.nodes.find((n) => n.kind === 'gate');
  assert.ok(firstGate);
  const critOverride = computeCriticalPath(graph, DEFAULT_GATE_DELAYS, { [firstGate.id]: 40 });
  assert.ok(critOverride.delayNs > critBase.delayNs);

  // Combinational timing simulation
  const simComb = simulateCircuitTiming(
    graph,
    DEFAULT_GATE_DELAYS,
    {},
    { enabled: false, clockPeriodNs: 50, tClkToQNs: 4, tSetupNs: 3 },
  );
  assert.equal(simComb.criticalPathNs, 30);
  assert.ok(simComb.waveDromJson.signal.length >= 4);

  // Synchronous DFF timing simulation with safe period (50 ns) vs setup violation (20 ns)
  const simDffOk = simulateCircuitTiming(
    graph,
    DEFAULT_GATE_DELAYS,
    {},
    { enabled: true, clockPeriodNs: 50, tClkToQNs: 4, tSetupNs: 3 },
  );
  assert.equal(simDffOk.dffAnalysis.enabled, true);
  assert.equal(simDffOk.dffAnalysis.minClockPeriodNs, 37); // 4 + 30 + 3
  assert.equal(simDffOk.dffAnalysis.slackNs, 13);
  assert.equal(simDffOk.dffAnalysis.setupViolation, false);
  assert.ok(simDffOk.traces.some((tr) => tr.role === 'clock'));
  assert.ok(simDffOk.traces.some((tr) => tr.role === 'reg-output'));

  const simDffBad = simulateCircuitTiming(
    graph,
    DEFAULT_GATE_DELAYS,
    {},
    { enabled: true, clockPeriodNs: 20, tClkToQNs: 4, tSetupNs: 3 },
  );
  assert.equal(simDffBad.dffAnalysis.setupViolation, true);
  assert.ok(simDffBad.dffAnalysis.slackNs < 0);
});

test('explicitAnd toggle formats engineering expressions with explicit · vs compact juxtaposition', () => {
  const parsed = parseBoolean('Y = A*(B + C) + D*E');
  assert.ok(toPlainText(parsed.ast, 'engineering', true).includes('·'));
  assert.ok(toLatex(parsed.ast, 'engineering', true).includes('\\cdot'));
  assert.ok(!toPlainText(parsed.ast, 'engineering', false).includes('·'));
  assert.ok(!toLatex(parsed.ast, 'engineering', false).includes('\\cdot'));
});

test('heuristic effort levels (low, medium, high) produce progressively stronger simplifications', () => {
  // 3-input odd parity: High effort discovers global A ^ B ^ C
  const exprParity = "Y = A'*B'*C + A'*B*C' + A*B'*C' + A*B*C";
  const lowP = simplifyBoolean(exprParity, {
    method: 'heuristic',
    effort: 'low',
    targetForm: 'auto',
    notation: 'engineering',
  });
  const medP = simplifyBoolean(exprParity, {
    method: 'heuristic',
    effort: 'medium',
    targetForm: 'auto',
    notation: 'engineering',
  });
  const highP = simplifyBoolean(exprParity, {
    method: 'heuristic',
    effort: 'high',
    targetForm: 'auto',
    notation: 'engineering',
  });
  assert.equal(lowP.ok && medP.ok && highP.ok, true);
  if (lowP.ok && medP.ok && highP.ok) {
    assert.ok(highP.simplifiedMetrics.literals < medP.simplifiedMetrics.literals);
    assert.ok(medP.simplifiedMetrics.literals < lowP.simplifiedMetrics.literals);
    assert.equal(highP.simplifiedAst.kind, 'gate');
    if (highP.simplifiedAst.kind === 'gate') {
      assert.equal(highP.simplifiedAst.op, 'XOR');
      assert.equal(highP.simplifiedAst.args.length, 3);
    }
  }

  // Bi-factoring (A + B)*(C + D): High effort beats Low and QM 2-level SOP
  const exprBi = 'Y = A*C + A*D + B*C + B*D';
  const qmBi = simplifyBoolean(exprBi, {
    method: 'qm',
    effort: 'medium',
    targetForm: 'sop',
    notation: 'engineering',
  });
  const lowBi = simplifyBoolean(exprBi, {
    method: 'heuristic',
    effort: 'low',
    targetForm: 'auto',
    notation: 'engineering',
  });
  const highBi = simplifyBoolean(exprBi, {
    method: 'heuristic',
    effort: 'high',
    targetForm: 'auto',
    notation: 'engineering',
  });
  assert.equal(qmBi.ok && lowBi.ok && highBi.ok, true);
  if (qmBi.ok && lowBi.ok && highBi.ok) {
    assert.equal(qmBi.simplifiedMetrics.literals, 8);
    assert.ok(lowBi.simplifiedMetrics.literals < qmBi.simplifiedMetrics.literals);
    assert.equal(highBi.simplifiedMetrics.literals, 4);
    assert.equal(highBi.simplifiedMetrics.gates, 3);
  }
});

test('XOR with NAND-only target uses exactly 4 shared 2-input NAND gates', () => {
  const res = simplifyBoolean('Y = A XOR B', {
    method: 'algebraic',
    effort: 'medium',
    targetForm: 'nand',
    notation: 'engineering',
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const graph = buildCircuitGraph(res.simplifiedAst, res.variables, res.outputName, 'engineering', true, '2-input-nand');
  const gates = graph.nodes.filter((n) => n.kind === 'gate');
  assert.equal(gates.length, 4, `Expected 4 NAND2 gates for XOR, got ${gates.length}`);
  for (const g of gates) {
    assert.equal(g.gateType, 'NAND');
    assert.equal(g.inputs.length, 2);
  }
  // Check truth table equivalence via circuit evaluation
  for (let row = 0; row < 4; row++) {
    const a: 0 | 1 = (row >> 1) & 1 ? 1 : 0;
    const b: 0 | 1 = row & 1 ? 1 : 0;
    const vals = evaluateCircuitNodes(graph, { A: a, B: b });
    assert.equal(vals.OUT, a ^ b);
  }
});

test('gate input modes (2-input, 2-input-nand, 2-input-nor) preserve equivalence and cap fan-in at 2', () => {
  const parsed = parseBoolean('Y = A*B*C*D + !(A + B + C) + (A XOR B XOR C)');
  const refVec = evalTruthVector(parsed.ast, parsed.variables);

  for (const mode of ['2-input', '2-input-nand', '2-input-nor'] as const) {
    const dec = decomposeAstForGateMode(parsed.ast, mode);
    assert.deepEqual(evalTruthVector(dec, parsed.variables), refVec, `Mode ${mode} broke equivalence`);
    const graph = buildCircuitGraph(parsed.ast, parsed.variables, parsed.outputName, 'engineering', true, mode);
    for (const node of graph.nodes) {
      if (node.kind === 'gate') {
        assert.ok(node.inputs.length <= 2, `Gate ${node.id} in mode ${mode} exceeded 2 inputs`);
        if (mode === '2-input-nand') assert.equal(node.gateType, 'NAND');
        if (mode === '2-input-nor') assert.equal(node.gateType, 'NOR');
      }
    }
  }
});

test('multi-output Full Adder shares inputs, produces multi-output truth table, timing traces, and overlap-free wire routing', () => {
  const s = parseBoolean('S = A XOR B XOR Cin');
  const c = parseBoolean('Cout = A*B + B*Cin + A*Cin');
  const vars = ['A', 'B', 'Cin'];

  const graph = buildMultiCircuitGraph(
    [
      { outputName: s.outputName, ast: s.ast },
      { outputName: c.outputName, ast: c.ast },
    ],
    vars,
    'engineering',
    true,
    '2-input',
  );
  assert.deepEqual(graph.outputNames, ['S', 'Cout']);
  assert.equal(graph.nodes.filter((n) => n.kind === 'output').length, 2);

  // Check multi-output truth table matches full adder arithmetic (A + B + Cin = 2*Cout + S)
  const tbl = buildMultiTruthTable(
    [
      { outputName: 'S', ast: s.ast },
      { outputName: 'Cout', ast: c.ast },
    ],
    vars,
    graph.internals,
  );
  assert.equal(tbl.rows.length, 8);
  for (const row of tbl.rows) {
    const sum = row.inputs.A + row.inputs.B + row.inputs.Cin;
    assert.equal(row.outputs.S, sum & 1);
    assert.equal(row.outputs.Cout, sum >= 2 ? 1 : 0);
  }

  // Check multi-output timing simulation includes both S and Cout (and DFF regs)
  const sim = simulateCircuitTiming(
    graph,
    DEFAULT_GATE_DELAYS,
    {},
    { enabled: true, clockPeriodNs: 80, tClkToQNs: 4, tSetupNs: 3 },
  );
  assert.ok(sim.traces.some((t) => t.id === 'S'));
  assert.ok(sim.traces.some((t) => t.id === 'Cout'));
  assert.ok(sim.traces.some((t) => t.id === 'S_reg'));
  assert.ok(sim.traces.some((t) => t.id === 'Cout_reg'));

  // Verify routed wire segments never cut across the interior of any intermediate gate body
  const gateNodes = graph.nodes.filter((n) => n.kind === 'gate');
  for (const edge of graph.edges) {
    assert.ok(edge.points.length >= 2);
    for (let i = 0; i < edge.points.length - 1; i++) {
      const p1 = edge.points[i];
      const p2 = edge.points[i + 1];
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);
      for (const g of gateNodes) {
        if (g.id === edge.fromId || g.id === edge.toId) continue;
        // Strict interior box of gate body
        const gx1 = g.x - 28;
        const gx2 = g.x + 28;
        const gy1 = g.y - 20;
        const gy2 = g.y + 20;
        const intersects = maxX > gx1 && minX < gx2 && maxY > gy1 && minY < gy2;
        assert.equal(
          intersects,
          false,
          `Edge ${edge.fromId}->${edge.toId} segment (${p1.x},${p1.y})-(${p2.x},${p2.y}) overlapped gate ${g.id} at (${g.x},${g.y})`,
        );
      }
    }
  }
});

test('parser supports LaTeX expressions including \\cdot, \\overline, \\neg, \\land, \\lor, \\oplus, subscripts, and delimiters', () => {
  // Exact example from user request: Y = A \cdot B + \overline{A} \cdot C
  const latexParsed = parseBoolean(String.raw`Y = A \cdot B + \overline{A} \cdot C`);
  const plainParsed = parseBoolean("Y = A*B + A'*C");
  assert.equal(latexParsed.outputName, 'Y');
  assert.deepEqual(latexParsed.variables, ['A', 'B', 'C']);
  assert.deepEqual(
    evalTruthVector(latexParsed.ast, latexParsed.variables),
    evalTruthVector(plainParsed.ast, plainParsed.variables),
  );

  // Nested overline (De Morgan / NAND-of-NAND)
  const nestedLatex = parseBoolean(String.raw`F = \overline{\overline{A \cdot B} \cdot C}`);
  const nestedPlain = parseBoolean('F = !(!(A*B)*C)');
  assert.equal(nestedLatex.outputName, 'F');
  assert.deepEqual(
    evalTruthVector(nestedLatex.ast, nestedLatex.variables),
    evalTruthVector(nestedPlain.ast, nestedPlain.variables),
  );

  // Math-mode delimiters, \left / \right, \neg, \land, \lor, \oplus, subscripts
  const richLatex = parseBoolean(
    String.raw`$$C_{out} = \left(\neg A \land B\right) \lor \left(A \oplus C_{in}\right)$$`,
  );
  const richPlain = parseBoolean('C_out = (!A * B) + (A ^ C_in)');
  assert.equal(richLatex.outputName, 'C_out');
  assert.deepEqual(richLatex.variables, ['A', 'B', 'C_in']);
  assert.deepEqual(
    evalTruthVector(richLatex.ast, richLatex.variables),
    evalTruthVector(richPlain.ast, richPlain.variables),
  );

  // preprocessLatex leaves standard plain text intact
  assert.equal(preprocessLatex("Y = A*B + A'*C"), "Y = A*B + A'*C");
});

test('buildGateReferenceList generates accurate markings, truth tables, and plainExpr for 2, 3, and 4 base inputs', () => {
  for (const base of [2, 3, 4] as const) {
    const list = buildGateReferenceList(base);
    assert.equal(list.length, 8);
    const byId = new Map(list.map((g) => [g.id, g]));

    // Unary gates stay 1-input
    assert.equal(byId.get('NOT')?.marking, 'NOT1');
    assert.equal(byId.get('NOT')?.rows.length, 2);
    assert.equal(byId.get('BUFFER')?.marking, 'BUF1');
    assert.equal(byId.get('BUFFER')?.rows.length, 2);

    // Multi-input gates scale to base inputs with 2^base truth-table rows
    const expectedRows = 1 << base;
    for (const id of ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR'] as const) {
      const gate = byId.get(id);
      assert.ok(gate, `Missing gate ${id}`);
      if (!gate) continue;
      assert.equal(gate.marking, `${id}${base}`);
      assert.equal(gate.inputNames.length, base);
      assert.equal(gate.rows.length, expectedRows);

      // Verify plainExpr parses and matches every generated truth-table row
      const parsed = parseBoolean(gate.plainExpr);
      for (const row of gate.rows) {
        const assignment: Record<string, 0 | 1> = {};
        gate.inputNames.forEach((name, idx) => {
          assignment[name] = row[idx];
        });
        const expectedOut: 0 | 1 = row[gate.arity];
        assert.equal(
          evaluateBool(parsed.ast, assignment),
          expectedOut,
          `Gate ${gate.marking} plainExpr mismatch on row ${row.slice(0, gate.arity).join('')}`,
        );
      }
    }
  }
});

test('K-Map beginner guide worked examples are mathematically exact and simplify cleanly', () => {
  assert.equal(KMAP_WORKED_EXAMPLES.length, 3);
  for (const ex of KMAP_WORKED_EXAMPLES) {
    const parsedOrig = parseBoolean(ex.inputExpr);
    // Also exercises LaTeX parsing on the worked example's final result formula!
    const parsedFinal = parseBoolean(ex.resultLatex);
    const origVec = evalTruthVector(parsedOrig.ast, ex.variables);
    const finalVec = evalTruthVector(parsedFinal.ast, ex.variables);
    assert.deepEqual(finalVec, origVec, `K-Map example ${ex.id} resultLatex disagrees with inputExpr`);

    // Check listed minterms match exact 1-positions of truth vector
    const computedMinterms: number[] = [];
    origVec.forEach((v, i) => {
      if (v === 1) computedMinterms.push(i);
    });
    assert.deepEqual(computedMinterms, ex.minterms, `K-Map example ${ex.id} minterm list mismatch`);
  }
});

test('zero-delay timing simulation yields 0 ns critical path and valid WaveDrom traces', () => {
  const parsed = parseBoolean("Y = A*B + A'*C");
  const graph = buildCircuitGraph(parsed.ast, parsed.variables, parsed.outputName, 'engineering');
  const zeroDelays: GateDelayMap = { NOT: 0, AND: 0, OR: 0, NAND: 0, NOR: 0, XOR: 0, XNOR: 0 };
  const sim = simulateCircuitTiming(
    graph,
    zeroDelays,
    {},
    { enabled: false, clockPeriodNs: 50, tClkToQNs: 4, tSetupNs: 3 },
  );
  assert.equal(sim.criticalPathNs, 0);
  assert.equal(sim.totalGlitches, 0);
  assert.ok(sim.traces.length >= 4);
});
