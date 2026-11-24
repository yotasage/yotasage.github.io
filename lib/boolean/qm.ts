import { evaluateBool, makeConst, makeGate, makeNot, makeVar, toLatex, toPlainText } from './parse';
import type {
  BoolNode,
  CanonicalForms,
  KMapData,
  KMapGroup,
  NotationStyle,
  SimplifyEffort,
} from './types';

export interface Implicant {
  readonly bits: number; // bitmask of fixed 1s (MSB = variables[0])
  readonly mask: number; // bitmask of don't-care bits (1 = dash)
  readonly covered: readonly number[];
}

export interface QmResult {
  readonly ast: BoolNode;
  readonly implicants: readonly Implicant[];
  readonly primeCount: number;
  readonly essentialCount: number;
  readonly petrickProductsEvaluated: number;
}

function popcount(x: number): number {
  let c = 0;
  let v = x;
  while (v !== 0) {
    v &= v - 1;
    c++;
  }
  return c;
}

function implicantKey(bits: number, mask: number): string {
  return `${bits}:${mask}`;
}

export function evalTruthVector(node: BoolNode, variables: readonly string[]): (0 | 1)[] {
  const n = variables.length;
  const total = 1 << n;
  const out: (0 | 1)[] = new Array(total);
  const env: Record<string, 0 | 1> = {};
  for (let row = 0; row < total; row++) {
    for (let b = 0; b < n; b++) {
      const bit = (row >> (n - 1 - b)) & 1;
      env[variables[b]] = bit === 1 ? 1 : 0;
    }
    out[row] = evaluateBool(node, env);
  }
  return out;
}

export function implicantToSopTerm(
  imp: Implicant,
  variables: readonly string[],
): BoolNode {
  const n = variables.length;
  const lits: BoolNode[] = [];
  for (let i = 0; i < n; i++) {
    const bitPos = n - 1 - i;
    if (((imp.mask >> bitPos) & 1) === 1) continue;
    const isOne = ((imp.bits >> bitPos) & 1) === 1;
    lits.push(isOne ? makeVar(variables[i]) : makeNot(makeVar(variables[i])));
  }
  if (lits.length === 0) return makeConst(1);
  if (lits.length === 1) return lits[0];
  return makeGate('AND', lits);
}

export function implicantToPosClause(
  imp: Implicant,
  variables: readonly string[],
): BoolNode {
  const n = variables.length;
  const lits: BoolNode[] = [];
  for (let i = 0; i < n; i++) {
    const bitPos = n - 1 - i;
    if (((imp.mask >> bitPos) & 1) === 1) continue;
    // For maxterms (zeros of F): bit=0 -> A, bit=1 -> A'
    const isOne = ((imp.bits >> bitPos) & 1) === 1;
    lits.push(isOne ? makeNot(makeVar(variables[i])) : makeVar(variables[i]));
  }
  if (lits.length === 0) return makeConst(0);
  if (lits.length === 1) return lits[0];
  return makeGate('OR', lits);
}

function implicantLiteralCount(imp: Implicant, varCount: number): number {
  return varCount - popcount(imp.mask);
}

function findPrimeImplicants(minterms: readonly number[], varCount: number): Implicant[] {
  let current: Implicant[] = minterms.map((m) => ({
    bits: m,
    mask: 0,
    covered: [m],
  }));

  const primes = new Map<string, Implicant>();

  while (current.length > 0) {
    const groups = new Map<number, Implicant[]>();
    for (const imp of current) {
      const ones = popcount(imp.bits & ~imp.mask);
      const list = groups.get(ones);
      if (list) list.push(imp);
      else groups.set(ones, [imp]);
    }

    const used = new Set<string>();
    const nextMap = new Map<string, Implicant>();
    const groupKeys = [...groups.keys()].sort((a, b) => a - b);

    for (const g of groupKeys) {
      const lower = groups.get(g) ?? [];
      const upper = groups.get(g + 1);
      if (!upper) continue;

      for (const a of lower) {
        for (const b of upper) {
          if (a.mask !== b.mask) continue;
          const diff = (a.bits ^ b.bits) & ~a.mask;
          if (diff !== 0 && (diff & (diff - 1)) === 0) {
            used.add(implicantKey(a.bits, a.mask));
            used.add(implicantKey(b.bits, b.mask));
            const newMask = a.mask | diff;
            const newBits = a.bits & ~diff;
            const key = implicantKey(newBits, newMask);
            if (!nextMap.has(key)) {
              const merged = [...new Set([...a.covered, ...b.covered])].sort((x, y) => x - y);
              nextMap.set(key, { bits: newBits, mask: newMask, covered: merged });
            }
          }
        }
      }
    }

    for (const imp of current) {
      const key = implicantKey(imp.bits, imp.mask);
      if (!used.has(key) && !primes.has(key)) {
        primes.set(key, imp);
      }
    }

    current = [...nextMap.values()];
    // Safety guard for wide variables
    if (varCount > 8) break;
  }

  return [...primes.values()].sort(
    (a, b) =>
      implicantLiteralCount(a, varCount) - implicantLiteralCount(b, varCount) ||
      a.bits - b.bits ||
      a.mask - b.mask,
  );
}

function solveCover(
  minterms: readonly number[],
  primes: readonly Implicant[],
  varCount: number,
  effort: SimplifyEffort,
): { selected: Implicant[]; essentialCount: number; productsEvaluated: number } {
  const remaining = new Set<number>(minterms);
  const selectedIndices = new Set<number>();

  // 1. Extract Essential Prime Implicants
  let essentialCount = 0;
  for (const m of minterms) {
    const covering: number[] = [];
    for (let i = 0; i < primes.length; i++) {
      if (primes[i].covered.includes(m)) covering.push(i);
    }
    if (covering.length === 1) {
      const pIdx = covering[0];
      if (!selectedIndices.has(pIdx)) {
        selectedIndices.add(pIdx);
        essentialCount++;
        for (const c of primes[pIdx].covered) remaining.delete(c);
      }
    }
  }

  let productsEvaluated = 1;
  const maxProducts = effort === 'high' ? 4096 : effort === 'medium' ? 512 : 64;

  // 2. Remaining uncovered minterms -> bounded Petrick's method + greedy fallback
  if (remaining.size > 0) {
    const remList = [...remaining];
    const clauses: number[][] = remList.map((m) => {
      const opts: number[] = [];
      for (let i = 0; i < primes.length; i++) {
        if (!selectedIndices.has(i) && primes[i].covered.includes(m)) {
          opts.push(i);
        }
      }
      return opts;
    });

    // Multiply clauses in Petrick's method while keeping product list pruned
    let products: Set<number>[] = [new Set<number>()];
    let exactAborted = false;

    for (const clause of clauses) {
      const next: Set<number>[] = [];
      for (const prod of products) {
        for (const pIdx of clause) {
          const s = new Set(prod);
          s.add(pIdx);
          next.push(s);
          productsEvaluated++;
          if (next.length > maxProducts) {
            exactAborted = true;
            break;
          }
        }
        if (exactAborted) break;
      }
      if (exactAborted) break;

      // Absorption pruning: drop supersets
      next.sort((a, b) => a.size - b.size);
      const minimal: Set<number>[] = [];
      for (const cand of next) {
        let subsumed = false;
        for (const keep of minimal) {
          if (keep.size <= cand.size) {
            let allIn = true;
            for (const x of keep) {
              if (!cand.has(x)) {
                allIn = false;
                break;
              }
            }
            if (allIn) {
              subsumed = true;
              break;
            }
          }
        }
        if (!subsumed) minimal.push(cand);
      }
      products = minimal.slice(0, maxProducts);
    }

    if (!exactAborted && products.length > 0) {
      let best = products[0];
      let bestScore = Infinity;
      for (const prod of products) {
        let lits = 0;
        for (const pIdx of prod) lits += implicantLiteralCount(primes[pIdx], varCount);
        const score = prod.size * 100 + lits;
        if (score < bestScore) {
          bestScore = score;
          best = prod;
        }
      }
      for (const pIdx of best) selectedIndices.add(pIdx);
    } else {
      // Greedy maximum-coverage fallback if Petrick exceeded effort budget
      while (remaining.size > 0) {
        let bestIdx = -1;
        let bestCover = -1;
        let bestLits = Infinity;
        for (let i = 0; i < primes.length; i++) {
          if (selectedIndices.has(i)) continue;
          let count = 0;
          for (const c of primes[i].covered) {
            if (remaining.has(c)) count++;
          }
          const lits = implicantLiteralCount(primes[i], varCount);
          if (count > bestCover || (count === bestCover && lits < bestLits)) {
            bestCover = count;
            bestLits = lits;
            bestIdx = i;
          }
        }
        if (bestIdx === -1) break;
        selectedIndices.add(bestIdx);
        for (const c of primes[bestIdx].covered) remaining.delete(c);
      }
    }
  }

  const selected = [...selectedIndices]
    .map((i) => primes[i])
    .sort(
      (a, b) =>
        implicantLiteralCount(a, varCount) - implicantLiteralCount(b, varCount) ||
        a.bits - b.bits,
    );

  return { selected, essentialCount, productsEvaluated };
}

export function minimizeQM(
  truthVector: readonly (0 | 1)[],
  variables: readonly string[],
  form: 'sop' | 'pos',
  effort: SimplifyEffort,
): QmResult {
  const targetVal: 0 | 1 = form === 'sop' ? 1 : 0;
  const targets: number[] = [];
  for (let i = 0; i < truthVector.length; i++) {
    if (truthVector[i] === targetVal) targets.push(i);
  }

  if (targets.length === 0) {
    return {
      ast: makeConst(form === 'sop' ? 0 : 1),
      implicants: [],
      primeCount: 0,
      essentialCount: 0,
      petrickProductsEvaluated: 1,
    };
  }
  if (targets.length === truthVector.length) {
    return {
      ast: makeConst(form === 'sop' ? 1 : 0),
      implicants: [],
      primeCount: 1,
      essentialCount: 1,
      petrickProductsEvaluated: 1,
    };
  }

  const primes = findPrimeImplicants(targets, variables.length);
  const { selected, essentialCount, productsEvaluated } = solveCover(
    targets,
    primes,
    variables.length,
    effort,
  );

  if (form === 'sop') {
    const terms = selected.map((imp) => implicantToSopTerm(imp, variables));
    const ast = terms.length === 1 ? terms[0] : makeGate('OR', terms);
    return {
      ast,
      implicants: selected,
      primeCount: primes.length,
      essentialCount,
      petrickProductsEvaluated: productsEvaluated,
    };
  }

  const clauses = selected.map((imp) => implicantToPosClause(imp, variables));
  const ast = clauses.length === 1 ? clauses[0] : makeGate('AND', clauses);
  return {
    ast,
    implicants: selected,
    primeCount: primes.length,
    essentialCount,
    petrickProductsEvaluated: productsEvaluated,
  };
}

export function buildCanonicalForms(
  truthVector: readonly (0 | 1)[],
  variables: readonly string[],
  notation: NotationStyle,
  explicitAnd = true,
): CanonicalForms {
  const minterms: number[] = [];
  const maxterms: number[] = [];
  for (let i = 0; i < truthVector.length; i++) {
    if (truthVector[i] === 1) minterms.push(i);
    else maxterms.push(i);
  }

  const MAX_TERMS = 16;
  const truncated = minterms.length > MAX_TERMS || maxterms.length > MAX_TERMS;

  const sopNodes = minterms
    .slice(0, MAX_TERMS)
    .map((m) => implicantToSopTerm({ bits: m, mask: 0, covered: [m] }, variables));
  const posNodes = maxterms
    .slice(0, MAX_TERMS)
    .map((m) => implicantToPosClause({ bits: m, mask: 0, covered: [m] }, variables));

  const sopAst: BoolNode =
    minterms.length === 0
      ? makeConst(0)
      : sopNodes.length === 1
        ? sopNodes[0]
        : makeGate('OR', sopNodes);
  const posAst: BoolNode =
    maxterms.length === 0
      ? makeConst(1)
      : posNodes.length === 1
        ? posNodes[0]
        : makeGate('AND', posNodes);

  const suffixLatex = truncated ? ' + \\cdots' : '';
  const posSuffixLatex = truncated ? (explicitAnd ? ' \\cdot \\cdots' : '\\,\\cdots') : '';

  return {
    minterms,
    maxterms,
    canonicalSopLatex:
      minterms.length > MAX_TERMS
        ? `${toLatex(sopAst, notation, explicitAnd)}${suffixLatex}`
        : toLatex(sopAst, notation, explicitAnd),
    canonicalPosLatex:
      maxterms.length > MAX_TERMS
        ? `${toLatex(posAst, notation, explicitAnd)}${posSuffixLatex}`
        : toLatex(posAst, notation, explicitAnd),
    canonicalSopText:
      minterms.length > MAX_TERMS
        ? `${toPlainText(sopAst, notation, explicitAnd)} + ...`
        : toPlainText(sopAst, notation, explicitAnd),
    canonicalPosText:
      maxterms.length > MAX_TERMS
        ? `${toPlainText(posAst, notation, explicitAnd)} · ...`
        : toPlainText(posAst, notation, explicitAnd),
    truncated,
  };
}

export function buildKMap(
  truthVector: readonly (0 | 1)[],
  variables: readonly string[],
  sopImplicants: readonly Implicant[],
  notation: NotationStyle,
  explicitAnd = true,
): KMapData | null {
  const n = variables.length;
  if (n < 2 || n > 4) return null;

  const rowBits = n === 2 ? 1 : n === 3 ? 1 : 2;
  const colBits = n - rowBits;

  const rowVars = variables.slice(0, rowBits);
  const colVars = variables.slice(rowBits);

  const gray1 = [0, 1];
  const gray2 = [0, 1, 3, 2];

  const rowGray = rowBits === 1 ? gray1 : gray2;
  const colGray = colBits === 1 ? gray1 : gray2;

  const fmtBits = (val: number, width: number) => val.toString(2).padStart(width, '0');
  const rowLabels = rowGray.map((g) => fmtBits(g, rowBits));
  const colLabels = colGray.map((g) => fmtBits(g, colBits));

  const groups: KMapGroup[] = sopImplicants.map((imp, idx) => {
    const termAst = implicantToSopTerm(imp, variables);
    return {
      id: `grp-${idx}`,
      termLatex: toLatex(termAst, notation, explicitAnd),
      termText: toPlainText(termAst, notation, explicitAnd),
      cells: imp.covered,
      colorIndex: idx % 6,
    };
  });

  return {
    variables,
    rowVars,
    colVars,
    rowGray,
    colGray,
    rowLabels,
    colLabels,
    values: truthVector,
    groups,
  };
}
