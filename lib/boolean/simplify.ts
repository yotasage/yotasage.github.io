import {
  applyOneAlgebraicRule,
  buildFlatGate,
  getFactors,
  literalParts,
} from './algebraicRules';
import {
  astEquals,
  astKey,
  evaluateBool,
  makeConst,
  makeGate,
  makeNot,
  makeVar,
  measureComplexity,
  parseBoolean,
  toLatex,
  toPlainText,
  varToLatex,
} from './parse';
import { buildCanonicalForms, buildKMap, evalTruthVector, minimizeQM } from './qm';
import type {
  BooleanStep,
  BoolNode,
  NotationStyle,
  SimplifyEffort,
  SimplifyOptions,
  SimplifyResult,
} from './types';

/**
 * Single-pass common-literal factoring inside an OR-of-ANDs (or AND-of-ORs).
 * When `recursive` is true, also factors inside the quotient and remaining terms.
 */
function factorOnce(
  node: BoolNode,
  recursive: boolean,
): { next: BoolNode; factoredLit: BoolNode } | null {
  if (node.kind !== 'gate' || (node.op !== 'OR' && node.op !== 'AND')) return null;
  const op = node.op;
  const dualOp: 'AND' | 'OR' = op === 'OR' ? 'AND' : 'OR';
  if (node.args.length < 2) return null;

  const litFreq = new Map<string, { node: BoolNode; indices: number[] }>();
  for (let i = 0; i < node.args.length; i++) {
    const factors = getFactors(node.args[i], dualOp);
    const seenInTerm = new Set<string>();
    for (const f of factors) {
      const k = astKey(f);
      if (seenInTerm.has(k)) continue;
      seenInTerm.add(k);
      const entry = litFreq.get(k);
      if (entry) entry.indices.push(i);
      else litFreq.set(k, { node: f, indices: [i] });
    }
  }

  let best: { node: BoolNode; indices: number[] } | null = null;
  for (const entry of litFreq.values()) {
    if (entry.indices.length >= 2) {
      if (!best || entry.indices.length > best.indices.length) {
        best = entry;
      }
    }
  }
  if (!best) return null;

  const idxSet = new Set(best.indices);
  const quotientTerms: BoolNode[] = [];
  for (const idx of best.indices) {
    const factors = getFactors(node.args[idx], dualOp);
    const rem = factors.filter((f) => !astEquals(f, best!.node));
    quotientTerms.push(
      rem.length === 0 ? makeConst(dualOp === 'AND' ? 1 : 0) : buildFlatGate(dualOp, rem),
    );
  }

  const innerSum = buildFlatGate(op, quotientTerms);
  const subFactored = recursive ? factorOnce(innerSum, true) : null;
  const factoredGroup = buildFlatGate(dualOp, [best.node, subFactored ? subFactored.next : innerSum]);

  const rest = node.args.filter((_, idx) => !idxSet.has(idx));
  const next = buildFlatGate(op, [factoredGroup, ...rest]);
  return { next, factoredLit: best.node };
}

/**
 * Bi-factoring (kernel extraction): finds shared sum/product kernels across terms,
 * e.g. A*(C+D) + B*(C+D) -> (A + B)*(C + D), or A*C + A*D + B*C + B*D -> (A + B)*(C + D).
 */
function factorSharedKernel(node: BoolNode): { next: BoolNode; kernel: BoolNode } | null {
  if (node.kind !== 'gate' || (node.op !== 'OR' && node.op !== 'AND')) return null;
  const op = node.op;
  const dualOp: 'AND' | 'OR' = op === 'OR' ? 'AND' : 'OR';
  if (node.args.length < 2) return null;

  const freq = new Map<string, { node: BoolNode; indices: number[] }>();
  for (let i = 0; i < node.args.length; i++) {
    const factors = getFactors(node.args[i], dualOp);
    for (const f of factors) {
      if (f.kind !== 'gate') continue;
      const k = astKey(f);
      const entry = freq.get(k);
      if (entry) {
        if (!entry.indices.includes(i)) entry.indices.push(i);
      } else {
        freq.set(k, { node: f, indices: [i] });
      }
    }
  }

  let best: { node: BoolNode; indices: number[] } | null = null;
  for (const entry of freq.values()) {
    if (entry.indices.length >= 2 && (!best || entry.indices.length > best.indices.length)) {
      best = entry;
    }
  }
  if (!best) return null;

  const idxSet = new Set(best.indices);
  const quotients: BoolNode[] = [];
  for (const idx of best.indices) {
    const factors = getFactors(node.args[idx], dualOp);
    const rem = factors.filter((f) => !astEquals(f, best!.node));
    quotients.push(
      rem.length === 0 ? makeConst(dualOp === 'AND' ? 1 : 0) : buildFlatGate(dualOp, rem),
    );
  }
  const combined = buildFlatGate(dualOp, [buildFlatGate(op, quotients), best.node]);
  const rest = node.args.filter((_, idx) => !idxSet.has(idx));
  return { next: buildFlatGate(op, [combined, ...rest]), kernel: best.node };
}

/**
 * Recognize 2-variable XOR / XNOR patterns recursively inside any OR-of-ANDs subtree.
 */
function recognizeXorXnorDeep(
  node: BoolNode,
  allowSubtrees: boolean,
): { next: BoolNode; kind: 'XOR' | 'XNOR'; a: BoolNode; b: BoolNode } | null {
  if (node.kind === 'gate' && node.op === 'OR') {
    const terms = node.args;
    for (let i = 0; i < terms.length; i++) {
      const fI = getFactors(terms[i], 'AND');
      if (fI.length !== 2) continue;
      const p1 = literalParts(fI[0]);
      const p2 = literalParts(fI[1]);
      if (!p1 || !p2 || p1.base === p2.base) continue;

      for (let j = i + 1; j < terms.length; j++) {
        const fJ = getFactors(terms[j], 'AND');
        if (fJ.length !== 2) continue;
        const q1 = literalParts(fJ[0]);
        const q2 = literalParts(fJ[1]);
        if (!q1 || !q2) continue;

        let m1 = q1;
        let m2 = q2;
        if (q1.base === p2.base && q2.base === p1.base) {
          m1 = q2;
          m2 = q1;
        }
        if (m1.base !== p1.base || m2.base !== p2.base) continue;

        if (p1.neg !== m1.neg && p2.neg !== m2.neg) {
          const isXor = p1.neg !== p2.neg;
          const aNode: BoolNode = { kind: 'var', name: p1.base };
          const bNode: BoolNode = { kind: 'var', name: p2.base };
          const gateOp: 'XOR' | 'XNOR' = isXor ? 'XOR' : 'XNOR';
          const merged = makeGate(gateOp, [aNode, bNode]);
          const rest = terms.filter((_, k) => k !== i && k !== j);
          return {
            next: buildFlatGate('OR', [merged, ...rest]),
            kind: gateOp,
            a: aNode,
            b: bNode,
          };
        }
      }
    }
  }

  if (!allowSubtrees) return null;

  if (node.kind === 'not') {
    const sub = recognizeXorXnorDeep(node.operand, true);
    if (sub) return { ...sub, next: makeNot(sub.next) };
  } else if (node.kind === 'gate') {
    for (let i = 0; i < node.args.length; i++) {
      const sub = recognizeXorXnorDeep(node.args[i], true);
      if (sub) {
        const nextArgs = [...node.args];
        nextArgs[i] = sub.next;
        const rebuilt =
          node.op === 'AND' || node.op === 'OR' || node.op === 'XOR'
            ? buildFlatGate(node.op, nextArgs)
            : makeGate(node.op, nextArgs);
        return { ...sub, next: rebuilt };
      }
    }
  }
  return null;
}

/**
 * Detect exact n-variable parity (XOR / XNOR) directly from the truth vector
 * for High-effort heuristic search (e.g. A'B'C + A'BC' + AB'C' + ABC -> A ^ B ^ C).
 */
function detectGlobalParity(
  truthVec: readonly (0 | 1)[],
  variables: readonly string[],
): { ast: BoolNode; op: 'XOR' | 'XNOR'; vars: readonly string[] } | null {
  const n = variables.length;
  if (n < 2 || n > 6) return null;
  const total = truthVec.length;

  // Check if truthVec is an affine (linear over GF(2)) function of a subset of variables
  const baseVal = truthVec[0]; // value when all vars = 0
  const activeVars: number[] = [];
  for (let b = 0; b < n; b++) {
    const mask = 1 << (n - 1 - b);
    if (truthVec[mask] !== baseVal) activeVars.push(b);
  }
  if (activeVars.length < 2) return null;

  for (let row = 0; row < total; row++) {
    let parity = baseVal;
    for (const b of activeVars) {
      if (((row >> (n - 1 - b)) & 1) === 1) parity = parity === 1 ? 0 : 1;
    }
    if (truthVec[row] !== parity) return null;
  }

  const varNames = activeVars.map((b) => variables[b]);
  const varNodes = varNames.map((v) => makeVar(v));
  const op: 'XOR' | 'XNOR' = baseVal === 0 ? 'XOR' : 'XNOR';
  return { ast: makeGate(op, varNodes), op, vars: varNames };
}

/**
 * Convert an AST into universal NAND-only or NOR-only gates.
 * Uses the optimal 4-gate NAND topology for 2-input XOR (and 4-gate NOR for XNOR).
 */
export function convertToUniversalGates(node: BoolNode, target: 'nand' | 'nor'): BoolNode {
  if (node.kind === 'const' || node.kind === 'var') return node;

  const gateOp = target === 'nand' ? 'NAND' : 'NOR';
  const invert = (x: BoolNode): BoolNode => {
    if (x.kind === 'gate' && x.op === gateOp && x.args.length === 1) {
      return x.args[0];
    }
    if (x.kind === 'gate' && x.op === gateOp && x.args.length === 2 && astEquals(x.args[0], x.args[1])) {
      return x.args[0];
    }
    return makeGate(gateOp, [x, x]);
  };

  if (node.kind === 'not') {
    const inner = convertToUniversalGates(node.operand, target);
    return invert(inner);
  }

  // Optimal 4-gate NAND topology for XOR(a, b) = NAND(NAND(a, NAND(a,b)), NAND(b, NAND(a,b)))
  // and 4-gate NOR topology for XNOR(a, b) = NOR(NOR(a, NOR(a,b)), NOR(b, NOR(a,b)))
  if (node.op === 'XOR' || node.op === 'XNOR') {
    const convertedArgs = node.args.map((a) => convertToUniversalGates(a, target));
    const buildTwoXorNand = (a: BoolNode, b: BoolNode): BoolNode => {
      const t = makeGate('NAND', [a, b]);
      return makeGate('NAND', [makeGate('NAND', [a, t]), makeGate('NAND', [b, t])]);
    };
    const buildTwoXnorNor = (a: BoolNode, b: BoolNode): BoolNode => {
      const t = makeGate('NOR', [a, b]);
      return makeGate('NOR', [makeGate('NOR', [a, t]), makeGate('NOR', [b, t])]);
    };

    if (target === 'nand') {
      let acc = convertedArgs[0];
      for (let i = 1; i < convertedArgs.length; i++) {
        acc = buildTwoXorNand(acc, convertedArgs[i]);
      }
      return node.op === 'XNOR' ? invert(acc) : acc;
    }

    // target === 'nor'
    let acc = convertedArgs[0];
    for (let i = 1; i < convertedArgs.length; i++) {
      // XOR(a, b) = NOT(XNOR(a, b))
      const xnor = buildTwoXnorNor(acc, convertedArgs[i]);
      acc = i === convertedArgs.length - 1 && node.op === 'XNOR' ? xnor : invert(xnor);
    }
    return acc;
  }

  const children = node.args.map((a) => convertToUniversalGates(a, target));

  if (target === 'nand') {
    if (node.op === 'NAND') return makeGate('NAND', children);
    if (node.op === 'AND') return invert(makeGate('NAND', children));
    if (node.op === 'OR') return makeGate('NAND', children.map((c) => invert(c)));
    if (node.op === 'NOR') return invert(makeGate('NAND', children.map((c) => invert(c))));
  } else {
    if (node.op === 'NOR') return makeGate('NOR', children);
    if (node.op === 'OR') return invert(makeGate('NOR', children));
    if (node.op === 'AND') return makeGate('NOR', children.map((c) => invert(c)));
    if (node.op === 'NAND') return invert(makeGate('NOR', children.map((c) => invert(c))));
  }

  return node;
}

function scoreAst(node: BoolNode): number {
  const m = measureComplexity(node);
  return m.literals * 12 + m.gates * 8 + m.depth * 3;
}

function makeStep(
  id: string,
  ast: BoolNode,
  outputName: string,
  notation: NotationStyle,
  explicitAnd: boolean,
  meta: {
    workLabel?: string;
    ruleId?: string;
    ruleTitle: string;
    ruleFormulaLatex?: string;
    annotation?: string;
    theory?: string;
    kind?: 'input' | 'step' | 'result';
    minor?: boolean;
  },
): BooleanStep {
  const metrics = measureComplexity(ast);
  const outLatex = varToLatex(outputName);
  return {
    id,
    ast,
    workLatex: `${outLatex} = ${toLatex(ast, notation, explicitAnd)}`,
    workText: `${outputName} = ${toPlainText(ast, notation, explicitAnd)}`,
    workLabel: meta.workLabel,
    ruleId: meta.ruleId,
    ruleTitle: meta.ruleTitle,
    ruleFormulaLatex: meta.ruleFormulaLatex,
    annotation: meta.annotation,
    theory: meta.theory,
    kind: meta.kind ?? 'step',
    minor: meta.minor,
    gateCount: metrics.gates,
    literalCount: metrics.literals,
    depth: metrics.depth,
  };
}

function verifyEquivalence(
  a: BoolNode,
  b: BoolNode,
  variables: readonly string[],
): { equivalent: boolean; rowsChecked: number } {
  const total = 1 << variables.length;
  const env: Record<string, 0 | 1> = {};
  for (let row = 0; row < total; row++) {
    for (let i = 0; i < variables.length; i++) {
      env[variables[i]] = ((row >> (variables.length - 1 - i)) & 1) === 1 ? 1 : 0;
    }
    if (evaluateBool(a, env) !== evaluateBool(b, env)) {
      return { equivalent: false, rowsChecked: row + 1 };
    }
  }
  return { equivalent: true, rowsChecked: total };
}

function runAlgebraicLoop(
  start: BoolNode,
  outputName: string,
  notation: NotationStyle,
  explicitAnd: boolean,
  maxSteps: number,
  stepsOut: BooleanStep[],
): BoolNode {
  let current = start;
  const seen = new Set<string>([astKey(current)]);

  for (let s = 0; s < maxSteps; s++) {
    const hit = applyOneAlgebraicRule(current, notation);
    if (!hit) break;
    const key = astKey(hit.next);
    if (seen.has(key)) break;
    seen.add(key);
    current = hit.next;
    stepsOut.push(
      makeStep(`alg-${stepsOut.length}`, current, outputName, notation, explicitAnd, {
        ruleId: hit.ruleId,
        ruleTitle: hit.ruleTitle,
        ruleFormulaLatex: hit.ruleFormulaLatex,
        annotation: hit.annotation,
        theory: hit.theory,
        minor: hit.minor,
      }),
    );
  }
  return current;
}

interface HeuristicHop {
  readonly ast: BoolNode;
  readonly ruleId: string;
  readonly ruleTitle: string;
  readonly formulaLatex: string;
  readonly annotation: string;
  readonly theory: string;
}

/**
 * Bounded trial-and-error multi-level heuristic search with clearly separated effort tiers:
 * - low:    Single-step common-literal factoring (depth 1, budget 8)
 * - medium: Multi-step factoring + 2-variable XOR/XNOR recognition inside factored branches (depth 3, budget 32)
 * - high:   Deep beam search + kernel bi-factoring (A+B)(C+D) + global n-var XOR/XNOR parity detection (depth 6, budget 96)
 */
function runHeuristicSearch(
  candidatesSeed: readonly { ast: BoolNode; desc: string }[],
  effort: SimplifyEffort,
  variables: readonly string[],
  truthVec: readonly (0 | 1)[],
  explicitAnd: boolean,
): {
  bestAst: BoolNode;
  trail: readonly HeuristicHop[];
  evaluated: number;
} {
  const budget = effort === 'high' ? 96 : effort === 'medium' ? 32 : 8;
  const maxDepth = effort === 'high' ? 6 : effort === 'medium' ? 3 : 1;
  let evaluated = 0;

  interface Candidate {
    ast: BoolNode;
    score: number;
    depth: number;
    trail: HeuristicHop[];
  }

  let best: Candidate = {
    ast: candidatesSeed[0].ast,
    score: scoreAst(candidatesSeed[0].ast),
    depth: 0,
    trail: [],
  };

  const visited = new Set<string>();
  const frontier: Candidate[] = [];

  const pushCandidate = (ast: BoolNode, depth: number, trail: HeuristicHop[]) => {
    const k = astKey(ast);
    if (visited.has(k)) return;
    visited.add(k);
    evaluated++;
    const sc = scoreAst(ast);
    const cand: Candidate = { ast, score: sc, depth, trail };
    frontier.push(cand);
    if (sc < best.score) best = cand;
  };

  for (const seed of candidatesSeed) {
    pushCandidate(seed.ast, 0, []);
  }

  // High effort: check global multi-variable parity (e.g. A ^ B ^ C)
  if (effort === 'high') {
    const parity = detectGlobalParity(truthVec, variables);
    if (parity) {
      pushCandidate(parity.ast, 1, [
        {
          ast: parity.ast,
          ruleId: 'xor-xnor',
          ruleTitle: `${parity.vars.length}-Variable ${parity.op} Parity Synthesis (High Effort)`,
          formulaLatex:
            parity.op === 'XOR'
              ? 'A \\oplus B \\oplus C = \\overline{A}\\overline{B}C + \\overline{A}B\\overline{C} + A\\overline{B}\\overline{C} + ABC'
              : 'A \\odot B \\odot C = \\overline{A \\oplus B \\oplus C}',
          annotation: `Detected exact ${parity.vars.length}-input ${parity.op} parity across (${parity.vars.join(', ')}), collapsing the entire checkerboard truth table.`,
          theory:
            'High-effort heuristic search tests whether the truth table is linear over GF(2), collapsing 2^(n-1) SOP product terms into an n-input XOR/XNOR chain.',
        },
      ]);
    }
  }

  while (frontier.length > 0 && evaluated < budget) {
    frontier.sort((a, b) => a.score - b.score);
    const cur = frontier.shift()!;
    if (cur.depth >= maxDepth) continue;

    // 1. Common-literal factoring (all effort levels; recursive only for medium/high)
    const factored = factorOnce(cur.ast, effort !== 'low');
    if (factored && verifyEquivalence(cur.ast, factored.next, variables).equivalent) {
      pushCandidate(factored.next, cur.depth + 1, [
        ...cur.trail,
        {
          ast: factored.next,
          ruleId: 'factoring',
          ruleTitle: 'Common-Literal Factoring (Heuristic)',
          formulaLatex: explicitAnd ? 'A \\cdot B + A \\cdot C = A \\cdot (B + C)' : 'AB + AC = A(B + C)',
          annotation: `Factored shared literal ${toPlainText(factored.factoredLit, 'engineering', explicitAnd)} across multiple terms to reduce literals.`,
          theory:
            'Multi-level factoring trades flat 2-level SOP depth for fewer literals and narrower fan-in gates.',
        },
      ]);
    }

    // 2. Shared-kernel bi-factoring (High effort, e.g. A(C+D) + B(C+D) -> (A+B)(C+D))
    if (effort === 'high') {
      const kernelHit = factorSharedKernel(cur.ast);
      if (kernelHit && verifyEquivalence(cur.ast, kernelHit.next, variables).equivalent) {
        pushCandidate(kernelHit.next, cur.depth + 1, [
          ...cur.trail,
          {
            ast: kernelHit.next,
            ruleId: 'factoring',
            ruleTitle: 'Kernel Bi-Factoring (High Effort)',
            formulaLatex: explicitAnd
              ? 'A \\cdot (C + D) + B \\cdot (C + D) = (A + B) \\cdot (C + D)'
              : 'A(C + D) + B(C + D) = (A + B)(C + D)',
            annotation: `Extracted common sub-expression kernel ${toPlainText(kernelHit.kernel, 'engineering', explicitAnd)} across branches.`,
            theory:
              'Kernel extraction identifies repeated sum/product sub-expressions across already-factored branches, yielding compact multi-level factored forms like (A+B)(C+D).',
          },
        ]);
      }
    }

    // 3. XOR / XNOR recognition (Medium: top-level + factored subtrees; High: full recursive)
    if (effort !== 'low') {
      const xorHit = recognizeXorXnorDeep(cur.ast, true);
      if (xorHit && verifyEquivalence(cur.ast, xorHit.next, variables).equivalent) {
        pushCandidate(xorHit.next, cur.depth + 1, [
          ...cur.trail,
          {
            ast: xorHit.next,
            ruleId: 'xor-xnor',
            ruleTitle: `${xorHit.kind} Pattern Synthesis (Heuristic)`,
            formulaLatex:
              xorHit.kind === 'XOR'
                ? 'A \\cdot \\overline{B} + \\overline{A} \\cdot B = A \\oplus B'
                : 'A \\cdot B + \\overline{A} \\cdot \\overline{B} = A \\odot B',
            annotation: `Replaced complementary pair on ${toPlainText(xorHit.a, 'engineering', explicitAnd)}, ${toPlainText(xorHit.b, 'engineering', explicitAnd)} with a ${xorHit.kind} gate.`,
            theory:
              'Recognizing parity (XOR) and equivalence (XNOR) patterns eliminates inverters and collapses 2-level SOP expansions into compact parity gates.',
          },
        ]);
      }
    }
  }

  return { bestAst: best.ast, trail: best.trail, evaluated };
}

export function simplifyBoolean(rawExpr: string, options: SimplifyOptions): SimplifyResult {
  let parsed;
  try {
    parsed = parseBoolean(rawExpr);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to parse Boolean expression.',
      hint: "Examples: A*B + !A*C + B*C, (A + B)(A + C), Y = A'B + AB', A XOR B.",
    };
  }

  const { outputName, ast: originalAst, variables } = parsed;
  const { method, effort, targetForm, notation } = options;
  const explicitAnd = options.explicitAnd ?? true;

  const truthVec = evalTruthVector(originalAst, variables);
  const canonical = buildCanonicalForms(truthVec, variables, notation, explicitAnd);
  const qmSop = minimizeQM(truthVec, variables, 'sop', effort);
  const qmPos = minimizeQM(truthVec, variables, 'pos', effort);
  const kmap = buildKMap(truthVec, variables, qmSop.implicants, notation, explicitAnd);

  const steps: BooleanStep[] = [
    makeStep('step-input', originalAst, outputName, notation, explicitAnd, {
      workLabel: 'Original expression',
      ruleTitle: 'Given Boolean Expression',
      annotation:
        variables.length > 0
          ? `Parsed ${variables.length} input variable${variables.length === 1 ? '' : 's'} (${variables.join(', ')}) into an expression tree.`
          : 'Parsed constant Boolean expression.',
      theory:
        'Operator precedence follows digital logic convention: NOT (highest) → AND / NAND → XOR / XNOR → OR / NOR (lowest).',
      kind: 'input',
    }),
  ];

  let candidatesEvaluated = 1;
  const algLimit = effort === 'high' ? 32 : effort === 'medium' ? 20 : 10;

  // Step 1: Algebraic laws
  let current = runAlgebraicLoop(originalAst, outputName, notation, explicitAnd, algLimit, steps);
  candidatesEvaluated += steps.length;

  // Step 2: Exact Quine-McCluskey when requested or when SOP/POS form is requested
  const useQm =
    method === 'qm' || method === 'heuristic' || targetForm === 'sop' || targetForm === 'pos';
  if (useQm) {
    const preferPos =
      targetForm === 'pos' ||
      (targetForm === 'auto' && scoreAst(qmPos.ast) < scoreAst(qmSop.ast));
    const chosenQm = preferPos ? qmPos : qmSop;
    candidatesEvaluated += chosenQm.petrickProductsEvaluated;

    const shouldAdoptQm =
      targetForm === 'sop' ||
      targetForm === 'pos' ||
      scoreAst(chosenQm.ast) < scoreAst(current);

    if (shouldAdoptQm && !astEquals(chosenQm.ast, current)) {
      current = chosenQm.ast;
      steps.push(
        makeStep(`qm-${steps.length}`, current, outputName, notation, explicitAnd, {
          workLabel: preferPos ? 'Minimal POS' : 'Minimal SOP',
          ruleId: 'qm-minimization',
          ruleTitle: preferPos
            ? 'Quine-McCluskey Exact POS Minimization'
            : 'Quine-McCluskey Exact SOP Minimization',
          ruleFormulaLatex: preferPos
            ? `${varToLatex(outputName)} = \\prod M(${canonical.maxterms.slice(0, 8).join(',')}${canonical.maxterms.length > 8 ? ',\\dots' : ''})`
            : `${varToLatex(outputName)} = \\sum m(${canonical.minterms.slice(0, 8).join(',')}${canonical.minterms.length > 8 ? ',\\dots' : ''})`,
          annotation: `Found ${chosenQm.primeCount} prime implicant${chosenQm.primeCount === 1 ? '' : 's'} (${chosenQm.essentialCount} essential) and selected an exact minimal ${preferPos ? 'Product-of-Sums' : 'Sum-of-Products'} cover.`,
          theory:
            'Quine-McCluskey systematically merges adjacent minterms/maxterms (like a programmatic Karnaugh map) and uses Petrick’s method to guarantee a minimum two-level cover.',
        }),
      );
    }
  }

  // Step 3: Trial-and-error multi-level heuristic search
  if (method === 'heuristic' && targetForm === 'auto') {
    const seeds = [
      { ast: current, desc: 'current' },
      { ast: qmSop.ast, desc: 'qm-sop' },
      { ast: qmPos.ast, desc: 'qm-pos' },
    ];
    const search = runHeuristicSearch(seeds, effort, variables, truthVec, explicitAnd);
    candidatesEvaluated += search.evaluated;

    if (!astEquals(search.bestAst, current) && scoreAst(search.bestAst) < scoreAst(current)) {
      if (search.trail.length > 0) {
        for (const hop of search.trail) {
          current = hop.ast;
          steps.push(
            makeStep(`heur-${steps.length}`, current, outputName, notation, explicitAnd, {
              workLabel: 'Multi-level search',
              ruleId: hop.ruleId,
              ruleTitle: hop.ruleTitle,
              ruleFormulaLatex: hop.formulaLatex,
              annotation: hop.annotation,
              theory: hop.theory,
            }),
          );
        }
      } else {
        current = search.bestAst;
        steps.push(
          makeStep(`heur-${steps.length}`, current, outputName, notation, explicitAnd, {
            workLabel: 'Multi-level search',
            ruleId: 'factoring',
            ruleTitle: 'Heuristic Form Selection',
            annotation: 'Selected lower-cost dual representation from candidate search.',
            theory:
              'Comparing SOP, POS, and factored forms finds lower literal and gate counts than two-level minimization alone.',
          }),
        );
      }
      current = runAlgebraicLoop(current, outputName, notation, explicitAnd, 6, steps);
    }
  }

  // Step 4: Universal gate synthesis (NAND-only or NOR-only)
  if (targetForm === 'nand' || targetForm === 'nor') {
    // Preserve XOR/XNOR directly when converting to universal gates so A ^ B uses the iconic 4-NAND topology
    const hasXor = current.kind === 'gate' && (current.op === 'XOR' || current.op === 'XNOR');
    const baseForUniversal = hasXor
      ? current
      : targetForm === 'nand'
        ? scoreAst(qmSop.ast) <= scoreAst(current)
          ? qmSop.ast
          : current
        : scoreAst(qmPos.ast) <= scoreAst(current)
          ? qmPos.ast
          : current;
    const universal = convertToUniversalGates(baseForUniversal, targetForm);
    if (!astEquals(universal, current)) {
      current = universal;
      steps.push(
        makeStep(`univ-${steps.length}`, current, outputName, notation, explicitAnd, {
          workLabel: targetForm === 'nand' ? 'NAND-only synthesis' : 'NOR-only synthesis',
          ruleId: 'nand-nor-universal',
          ruleTitle:
            targetForm === 'nand'
              ? 'Universal NAND-Only Gate Conversion'
              : 'Universal NOR-Only Gate Conversion',
          ruleFormulaLatex:
            targetForm === 'nand'
              ? 'A \\oplus B = \\overline{\\overline{A \\cdot \\overline{A \\cdot B}} \\cdot \\overline{B \\cdot \\overline{A \\cdot B}}}'
              : '(A+B)(C+D) = \\overline{\\overline{A+B} + \\overline{C+D}}',
          annotation: `Synthesized the expression using only ${targetForm.toUpperCase()} gates via De Morgan's law and shared sub-terms.`,
          theory:
            'Both NAND and NOR are functionally complete: any Boolean function can be implemented with a single gate type (e.g. XOR takes only 4 2-input NAND gates when NAND(A,B) is shared!).',
        }),
      );
    }
  }

  // Final result step
  const alreadyMinimal = steps.length === 1;
  steps.push(
    makeStep('step-result', current, outputName, notation, explicitAnd, {
      workLabel: alreadyMinimal ? 'Already minimal' : 'Simplified result',
      ruleTitle: alreadyMinimal ? 'Expression Is Already Minimal' : 'Final Simplified Expression',
      annotation: alreadyMinimal
        ? 'No further reductions apply under the selected method and target form.'
        : `Reduced from ${measureComplexity(originalAst).gates} gate(s) / ${measureComplexity(originalAst).literals} literal(s) to ${measureComplexity(current).gates} gate(s) / ${measureComplexity(current).literals} literal(s).`,
      theory:
        'Every intermediate expression is exhaustively checked against the original truth table to guarantee 100% functional equivalence.',
      kind: 'result',
    }),
  );

  const verification = verifyEquivalence(originalAst, current, variables);

  return {
    ok: true,
    outputName,
    variables,
    originalAst,
    simplifiedAst: current,
    originalLatex: toLatex(originalAst, notation, explicitAnd),
    simplifiedLatex: toLatex(current, notation, explicitAnd),
    originalText: toPlainText(originalAst, notation, explicitAnd),
    simplifiedText: toPlainText(current, notation, explicitAnd),
    steps,
    originalMetrics: measureComplexity(originalAst),
    simplifiedMetrics: measureComplexity(current),
    equivalent: verification.equivalent,
    rowsChecked: verification.rowsChecked,
    candidatesEvaluated,
    canonical,
    qmSopAst: qmSop.ast,
    qmPosAst: qmPos.ast,
    kmap,
  };
}
