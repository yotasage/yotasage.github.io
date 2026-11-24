import { astEquals, makeConst, makeGate, makeNot, toPlainText } from './parse';
import type { BoolNode, NotationStyle } from './types';

export interface RewriteHit {
  readonly next: BoolNode;
  readonly ruleId: string;
  readonly ruleTitle: string;
  readonly ruleFormulaLatex: string;
  readonly annotation: string;
  readonly theory: string;
  readonly minor?: boolean;
}

export function isNegationOf(a: BoolNode, b: BoolNode): boolean {
  if (a.kind === 'not' && astEquals(a.operand, b)) return true;
  if (b.kind === 'not' && astEquals(b.operand, a)) return true;
  return false;
}

export function literalParts(n: BoolNode): { base: string; neg: boolean } | null {
  if (n.kind === 'var') return { base: n.name, neg: false };
  if (n.kind === 'not' && n.operand.kind === 'var') return { base: n.operand.name, neg: true };
  return null;
}

export function getFactors(node: BoolNode, op: 'AND' | 'OR'): readonly BoolNode[] {
  if (node.kind === 'gate' && node.op === op) return node.args;
  return [node];
}

export function buildFlatGate(op: 'AND' | 'OR' | 'XOR', args: readonly BoolNode[]): BoolNode {
  const flat: BoolNode[] = [];
  for (const a of args) {
    if (a.kind === 'gate' && a.op === op) flat.push(...a.args);
    else flat.push(a);
  }
  if (flat.length === 0) return makeConst(op === 'AND' ? 1 : 0);
  if (flat.length === 1) return flat[0];
  return makeGate(op, flat);
}

export function isSubsetArgs(sub: readonly BoolNode[], sup: readonly BoolNode[]): boolean {
  return sub.every((s) => sup.some((t) => astEquals(s, t)));
}

/**
 * Single deterministic algebraic rewrite step (bottom-up first, then root).
 * Returns the first meaningful rewrite along with the exact Boolean law applied.
 */
export function applyOneAlgebraicRule(
  root: BoolNode,
  notation: NotationStyle,
): RewriteHit | null {
  const rewrite = (node: BoolNode): RewriteHit | null => {
    // 1. Expand NAND / NOR when needed to simplify algebraically
    if (node.kind === 'gate' && (node.op === 'NAND' || node.op === 'NOR')) {
      const innerOp = node.op === 'NAND' ? 'AND' : 'OR';
      const inner = buildFlatGate(innerOp, node.args);
      const next = makeNot(inner);
      return {
        next,
        ruleId: 'demorgan',
        ruleTitle: `Rewrite ${node.op} as Inverted ${innerOp}`,
        ruleFormulaLatex:
          node.op === 'NAND'
            ? 'A \\uparrow B = \\overline{A \\cdot B}'
            : 'A \\downarrow B = \\overline{A + B}',
        annotation: `Expressed ${toPlainText(node, notation)} using an inverted ${innerOp} so algebraic laws can simplify inside.`,
        theory:
          'NAND and NOR gates are defined as negated AND and OR gates. Rewriting them explicitly exposes negations for De Morgan’s laws.',
        minor: true,
      };
    }

    // Recurse on children first for bottom-up cleanup
    if (node.kind === 'not') {
      const childHit = rewrite(node.operand);
      if (childHit) {
        return { ...childHit, next: makeNot(childHit.next) };
      }

      // Constant negation
      if (node.operand.kind === 'const') {
        const flipped: 0 | 1 = node.operand.value === 1 ? 0 : 1;
        return {
          next: makeConst(flipped),
          ruleId: 'complement',
          ruleTitle: 'Constant Negation',
          ruleFormulaLatex: '\\overline{0} = 1, \\quad \\overline{1} = 0',
          annotation: `Evaluated negation of constant ${node.operand.value} to ${flipped}.`,
          theory: 'Inverting a logic constant immediately yields the opposite logic level.',
          minor: true,
        };
      }

      // Double negation
      if (node.operand.kind === 'not') {
        return {
          next: node.operand.operand,
          ruleId: 'double-negation',
          ruleTitle: 'Double Negation Law',
          ruleFormulaLatex: '\\overline{\\overline{A}} = A',
          annotation: `Cancelled double inversion on ${toPlainText(node.operand.operand, notation)}.`,
          theory: 'Two consecutive NOT operations cancel each other out, removing two inverters.',
        };
      }

      // De Morgan on !(AND) or !(OR)
      if (node.operand.kind === 'gate' && (node.operand.op === 'AND' || node.operand.op === 'OR')) {
        const flippedOp = node.operand.op === 'AND' ? 'OR' : 'AND';
        const negatedArgs = node.operand.args.map((a) => makeNot(a));
        return {
          next: buildFlatGate(flippedOp, negatedArgs),
          ruleId: 'demorgan',
          ruleTitle: "De Morgan's Law",
          ruleFormulaLatex:
            node.operand.op === 'AND'
              ? '\\overline{A \\cdot B} = \\overline{A} + \\overline{B}'
              : '\\overline{A + B} = \\overline{A} \\cdot \\overline{B}',
          annotation: `Pushed negation through ${node.operand.op} to produce ${flippedOp} of negated terms.`,
          theory:
            "De Morgan's theorem flips the gate type (AND ↔ OR) when pushing an inversion bubble from the output to the inputs.",
        };
      }

      return null;
    }

    if (node.kind !== 'gate') return null;

    // Recurse on gate arguments
    for (let i = 0; i < node.args.length; i++) {
      const childHit = rewrite(node.args[i]);
      if (childHit) {
        const nextArgs = [...node.args];
        nextArgs[i] = childHit.next;
        const rebuilt =
          node.op === 'AND' || node.op === 'OR' || node.op === 'XOR'
            ? buildFlatGate(node.op, nextArgs)
            : makeGate(node.op, nextArgs);
        return { ...childHit, next: rebuilt };
      }
    }

    // Flatten nested associative gates (AND/OR/XOR)
    if (node.op === 'AND' || node.op === 'OR' || node.op === 'XOR') {
      if (node.args.some((a) => a.kind === 'gate' && a.op === node.op)) {
        return {
          next: buildFlatGate(node.op, node.args),
          ruleId: 'identity',
          ruleTitle: 'Associative Flattening',
          ruleFormulaLatex:
            node.op === 'AND'
              ? '(A \\cdot B) \\cdot C = A \\cdot B \\cdot C'
              : node.op === 'OR'
                ? '(A + B) + C = A + B + C'
                : '(A \\oplus B) \\oplus C = A \\oplus B \\oplus C',
          annotation: `Combined nested ${node.op} gates into a single flat ${node.op} group.`,
          theory: 'Associativity lets nested gates of the same type merge cleanly before checking duplicates or complements.',
          minor: true,
        };
      }
    }

    // XOR / XNOR basic identities
    if (node.op === 'XOR' || node.op === 'XNOR') {
      const isXnor = node.op === 'XNOR';
      if (isXnor && node.args.length === 2) {
        if (astEquals(node.args[0], node.args[1])) {
          return {
            next: makeConst(1),
            ruleId: 'xor-xnor',
            ruleTitle: 'XNOR Identity (Self)',
            ruleFormulaLatex: 'A \\odot A = 1',
            annotation: 'A signal is always equal to itself, so XNOR evaluates to 1.',
            theory: 'XNOR outputs 1 whenever both inputs match.',
          };
        }
        if (isNegationOf(node.args[0], node.args[1])) {
          return {
            next: makeConst(0),
            ruleId: 'xor-xnor',
            ruleTitle: 'XNOR Complement',
            ruleFormulaLatex: 'A \\odot \\overline{A} = 0',
            annotation: 'A signal and its inverse never match, so XNOR evaluates to 0.',
            theory: 'XNOR outputs 0 whenever its two inputs differ.',
          };
        }
      }
      if (node.op === 'XOR') {
        if (node.args.some((a) => a.kind === 'const' && a.value === 0)) {
          const rest = node.args.filter((a) => !(a.kind === 'const' && a.value === 0));
          return {
            next: buildFlatGate('XOR', rest),
            ruleId: 'xor-xnor',
            ruleTitle: 'XOR Identity with 0',
            ruleFormulaLatex: 'A \\oplus 0 = A',
            annotation: 'Dropped neutral 0 input from XOR gate.',
            theory: 'XOR with 0 leaves the signal unchanged.',
          };
        }
        for (let i = 0; i < node.args.length; i++) {
          for (let j = i + 1; j < node.args.length; j++) {
            if (astEquals(node.args[i], node.args[j])) {
              const rest = node.args.filter((_, k) => k !== i && k !== j);
              return {
                next: rest.length === 0 ? makeConst(0) : buildFlatGate('XOR', rest),
                ruleId: 'xor-xnor',
                ruleTitle: 'XOR Self-Cancellation',
                ruleFormulaLatex: 'A \\oplus A = 0',
                annotation: `Cancelled identical pair ${toPlainText(node.args[i], notation)} ⊕ ${toPlainText(node.args[i], notation)} = 0.`,
                theory: 'Because XOR checks odd parity, any pair of identical inputs cancels to 0.',
              };
            }
          }
        }
        const oneIdx = node.args.findIndex((a) => a.kind === 'const' && a.value === 1);
        if (oneIdx !== -1) {
          const rest = node.args.filter((_, k) => k !== oneIdx);
          return {
            next: makeNot(buildFlatGate('XOR', rest)),
            ruleId: 'xor-xnor',
            ruleTitle: 'XOR with 1 (Inversion)',
            ruleFormulaLatex: 'A \\oplus 1 = \\overline{A}',
            annotation: 'Replaced XOR with constant 1 by logical negation.',
            theory: 'XORing with 1 acts as a controlled inverter.',
          };
        }
      }
      return null;
    }

    if (node.op !== 'AND' && node.op !== 'OR') return null;

    const op = node.op;
    const args = node.args;
    const dominantVal: 0 | 1 = op === 'AND' ? 0 : 1;
    const identityVal: 0 | 1 = op === 'AND' ? 1 : 0;

    // 2. Annulment Law: A * 0 = 0, A + 1 = 1
    if (args.some((a) => a.kind === 'const' && a.value === dominantVal)) {
      return {
        next: makeConst(dominantVal),
        ruleId: 'annulment',
        ruleTitle: 'Annulment Law',
        ruleFormulaLatex: op === 'AND' ? 'A \\cdot 0 = 0' : 'A + 1 = 1',
        annotation: `Constant ${dominantVal} dominates the ${op} expression, collapsing it to ${dominantVal}.`,
        theory:
          op === 'AND'
            ? 'An AND gate with any 0 input always outputs 0.'
            : 'An OR gate with any 1 input always outputs 1.',
      };
    }

    // 3. Identity Law: A * 1 = A, A + 0 = A
    if (args.some((a) => a.kind === 'const' && a.value === identityVal)) {
      const rest = args.filter((a) => !(a.kind === 'const' && a.value === identityVal));
      return {
        next: buildFlatGate(op, rest),
        ruleId: 'identity',
        ruleTitle: 'Identity Law',
        ruleFormulaLatex: op === 'AND' ? 'A \\cdot 1 = A' : 'A + 0 = A',
        annotation: `Removed neutral constant ${identityVal} from the ${op} gate.`,
        theory: `Constant ${identityVal} is the identity element for ${op} and has no effect on the output.`,
      };
    }

    // 4. Complement Law: A * !A = 0, A + !A = 1
    for (let i = 0; i < args.length; i++) {
      for (let j = i + 1; j < args.length; j++) {
        if (isNegationOf(args[i], args[j])) {
          return {
            next: makeConst(dominantVal),
            ruleId: 'complement',
            ruleTitle: 'Complement Law',
            ruleFormulaLatex: op === 'AND' ? 'A \\cdot \\overline{A} = 0' : 'A + \\overline{A} = 1',
            annotation: `Found complementary pair ${toPlainText(args[i], notation)} and ${toPlainText(args[j], notation)}, reducing the ${op} group to ${dominantVal}.`,
            theory:
              op === 'AND'
                ? 'A signal and its inverse cannot both be 1 at the same time.'
                : 'Either a signal or its inverse must always be 1.',
          };
        }
      }
    }

    // 5. Idempotent Law: A * A = A, A + A = A
    for (let i = 0; i < args.length; i++) {
      for (let j = i + 1; j < args.length; j++) {
        if (astEquals(args[i], args[j])) {
          const nextArgs = args.filter((_, k) => k !== j);
          return {
            next: buildFlatGate(op, nextArgs),
            ruleId: 'idempotent',
            ruleTitle: 'Idempotent Law',
            ruleFormulaLatex: op === 'AND' ? 'A \\cdot A = A' : 'A + A = A',
            annotation: `Removed duplicate operand ${toPlainText(args[i], notation)}.`,
            theory: 'Repeating an identical signal on an AND or OR gate does not change its truth value.',
          };
        }
      }
    }

    const dualOp: 'AND' | 'OR' = op === 'AND' ? 'OR' : 'AND';

    // 6. Absorption Law: A + A*B = A  |  A * (A + B) = A
    for (let i = 0; i < args.length; i++) {
      const subFactors = getFactors(args[i], dualOp);
      for (let j = 0; j < args.length; j++) {
        if (i === j) continue;
        const supFactors = getFactors(args[j], dualOp);
        if (supFactors.length > subFactors.length && isSubsetArgs(subFactors, supFactors)) {
          const nextArgs = args.filter((_, k) => k !== j);
          return {
            next: buildFlatGate(op, nextArgs),
            ruleId: 'absorption',
            ruleTitle: 'Absorption Law',
            ruleFormulaLatex: op === 'OR' ? 'A + AB = A' : 'A(A + B) = A',
            annotation: `Term ${toPlainText(args[i], notation)} completely absorbs ${toPlainText(args[j], notation)}.`,
            theory:
              op === 'OR'
                ? 'Whenever the narrower term is true, the broader term is already true, so the narrower term is redundant.'
                : 'Whenever the simpler clause is false, the longer clause cannot rescue the AND output.',
          };
        }
      }
    }

    // 7. Combining / Adjacency Law: A*B + A*!B = A  |  (A+B)*(A+!B) = A
    for (let i = 0; i < args.length; i++) {
      const fA = getFactors(args[i], dualOp);
      for (let j = i + 1; j < args.length; j++) {
        const fB = getFactors(args[j], dualOp);
        if (fA.length !== fB.length) continue;
        let diffIdxA = -1;
        let diffIdxB = -1;
        const matchedB = new Set<number>();
        let valid = true;
        for (let p = 0; p < fA.length; p++) {
          const match = fB.findIndex((b, q) => !matchedB.has(q) && astEquals(fA[p], b));
          if (match !== -1) {
            matchedB.add(match);
          } else if (diffIdxA === -1) {
            diffIdxA = p;
          } else {
            valid = false;
            break;
          }
        }
        if (!valid || diffIdxA === -1) continue;
        for (let q = 0; q < fB.length; q++) {
          if (!matchedB.has(q)) {
            diffIdxB = q;
            break;
          }
        }
        if (diffIdxB !== -1 && isNegationOf(fA[diffIdxA], fB[diffIdxB])) {
          const common = fA.filter((_, p) => p !== diffIdxA);
          const merged =
            common.length === 0 ? makeConst(dominantVal) : buildFlatGate(dualOp, common);
          const nextArgs = args.filter((_, k) => k !== i && k !== j);
          nextArgs.splice(i, 0, merged);
          return {
            next: buildFlatGate(op, nextArgs),
            ruleId: 'adjacency',
            ruleTitle: 'Combining (Adjacency) Law',
            ruleFormulaLatex:
              op === 'OR'
                ? 'AB + A\\overline{B} = A'
                : '(A + B)(A + \\overline{B}) = A',
            annotation: `Merged adjacent terms ${toPlainText(args[i], notation)} and ${toPlainText(args[j], notation)} to eliminate ${toPlainText(fA[diffIdxA], notation)}.`,
            theory:
              'Two terms that differ in only a single complemented literal cover both cases of that variable, so it drops out completely.',
          };
        }
      }
    }

    // 8. Redundancy / Complement Absorption: A + !A*B = A + B  |  A * (!A + B) = A*B
    for (let i = 0; i < args.length; i++) {
      const single = args[i];
      for (let j = 0; j < args.length; j++) {
        if (i === j) continue;
        const factors = getFactors(args[j], dualOp);
        if (factors.length < 2) continue;
        const negIdx = factors.findIndex((f) => isNegationOf(single, f));
        if (negIdx !== -1) {
          const trimmedFactors = factors.filter((_, idx) => idx !== negIdx);
          const nextTerm = buildFlatGate(dualOp, trimmedFactors);
          const nextArgs = [...args];
          nextArgs[j] = nextTerm;
          return {
            next: buildFlatGate(op, nextArgs),
            ruleId: 'elimination',
            ruleTitle: 'Complement Absorption (Redundancy)',
            ruleFormulaLatex:
              op === 'OR'
                ? 'A + \\overline{A}B = A + B'
                : 'A(\\overline{A} + B) = AB',
            annotation: `Dropped redundant literal ${toPlainText(factors[negIdx], notation)} from ${toPlainText(args[j], notation)} using ${toPlainText(single, notation)}.`,
            theory:
              'Because the un-negated term already handles the case where it is active, checking its complement in the sibling term is unnecessary.',
          };
        }
      }
    }

    // 9. Consensus Theorem (for OR of ANDs): AB + !A*C + BC = AB + !A*C
    if (op === 'OR' && args.length >= 3) {
      for (let i = 0; i < args.length; i++) {
        const fI = getFactors(args[i], 'AND');
        for (let j = i + 1; j < args.length; j++) {
          const fJ = getFactors(args[j], 'AND');
          let pivotI = -1;
          let pivotJ = -1;
          let multiPivot = false;
          for (let p = 0; p < fI.length; p++) {
            for (let q = 0; q < fJ.length; q++) {
              if (isNegationOf(fI[p], fJ[q])) {
                if (pivotI === -1) {
                  pivotI = p;
                  pivotJ = q;
                } else {
                  multiPivot = true;
                }
              }
            }
          }
          if (pivotI === -1 || multiPivot) continue;
          const consensus: BoolNode[] = [];
          for (let p = 0; p < fI.length; p++) {
            if (p !== pivotI && !consensus.some((c) => astEquals(c, fI[p]))) consensus.push(fI[p]);
          }
          for (let q = 0; q < fJ.length; q++) {
            if (q !== pivotJ && !consensus.some((c) => astEquals(c, fJ[q]))) consensus.push(fJ[q]);
          }
          if (consensus.length === 0) continue;
          for (let k = 0; k < args.length; k++) {
            if (k === i || k === j) continue;
            const fK = getFactors(args[k], 'AND');
            if (isSubsetArgs(consensus, fK)) {
              const nextArgs = args.filter((_, idx) => idx !== k);
              return {
                next: buildFlatGate('OR', nextArgs),
                ruleId: 'consensus',
                ruleTitle: 'Consensus Theorem',
                ruleFormulaLatex: 'AB + \\overline{A}C + BC = AB + \\overline{A}C',
                annotation: `Removed redundant consensus term ${toPlainText(args[k], notation)} covered by ${toPlainText(args[i], notation)} and ${toPlainText(args[j], notation)}.`,
                theory:
                  'Whenever the consensus term evaluates to 1, one of its two parent terms is guaranteed to be 1 regardless of the pivot variable.',
              };
            }
          }
        }
      }
    }

    // 10. Distributive simplification for (A + B)(A + C) = A + BC
    if (op === 'AND' && args.length >= 2) {
      for (let i = 0; i < args.length; i++) {
        const argI = args[i];
        if (argI.kind !== 'gate' || argI.op !== 'OR') continue;
        const fI = argI.args;
        for (let j = i + 1; j < args.length; j++) {
          const argJ = args[j];
          if (argJ.kind !== 'gate' || argJ.op !== 'OR') continue;
          const fJ = argJ.args;
          const common = fI.filter((a) => fJ.some((b) => astEquals(a, b)));
          if (common.length > 0 && common.length < fI.length && common.length < fJ.length) {
            const remI = fI.filter((a) => !common.some((c) => astEquals(a, c)));
            const remJ = fJ.filter((b) => !common.some((c) => astEquals(b, c)));
            const combined = buildFlatGate('OR', [
              ...common,
              buildFlatGate('AND', [buildFlatGate('OR', remI), buildFlatGate('OR', remJ)]),
            ]);
            const nextArgs = args.filter((_, k) => k !== i && k !== j);
            nextArgs.splice(i, 0, combined);
            return {
              next: buildFlatGate('AND', nextArgs),
              ruleId: 'distributive',
              ruleTitle: 'Distributive Law (OR over AND)',
              ruleFormulaLatex: '(A + B)(A + C) = A + BC',
              annotation: `Factored shared OR-term ${common.map((c) => toPlainText(c, notation)).join(' + ')} out of two clauses.`,
              theory:
                'In Boolean algebra, OR distributes over AND, turning (A + B)(A + C) directly into the simpler expression A + BC.',
            };
          }
        }
      }
    }

    return null;
  };

  return rewrite(root);
}
