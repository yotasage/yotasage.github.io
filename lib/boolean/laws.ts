import type { BooleanExample, BooleanLaw, GateDelayMap } from './types';

export const DEFAULT_GATE_DELAYS: GateDelayMap = {
  NOT: 5,
  AND: 10,
  OR: 15,
  NAND: 8,
  NOR: 10,
  XOR: 18,
  XNOR: 20,
};

export const BOOLEAN_EXAMPLES: readonly BooleanExample[] = [
  {
    id: 'consensus',
    label: 'AB + A\'C + BC',
    tag: 'Consensus',
    expr: "Y = A*B + A'*C + B*C",
  },
  {
    id: 'absorption',
    label: '(A + B)(A + C)',
    tag: 'Distributive',
    expr: 'Y = (A + B)*(A + C)',
  },
  {
    id: 'demorgan',
    label: '!(A*B) + A*B\'',
    tag: 'De Morgan',
    expr: "Y = !(A*B) + A*B'",
  },
  {
    id: 'mux',
    label: 'A\'B\'C + A\'BC + AB\'C + ABC',
    tag: '4-term collapse',
    expr: "Y = A'*B'*C + A'*B*C + A*B'*C + A*B*C",
  },
  {
    id: 'carry',
    label: 'AB + BC + AC + ABC',
    tag: 'Full-adder Cout',
    expr: 'Cout = A*B + B*C + A*C + A*B*C',
  },
  {
    id: 'factor',
    label: 'AB + AC + AD',
    tag: 'Multi-level factor',
    expr: 'Y = A*B + A*C + A*D',
  },
  {
    id: 'xor-detect',
    label: 'A\'B + AB\'',
    tag: 'XOR synthesis',
    expr: "Y = A'*B + A*B'",
  },
  {
    id: 'four-var',
    label: 'A\'B\'C\'D + A\'B\'CD + A\'BC\'D + AB\'C\'D + AB\'CD',
    tag: '4-var K-Map',
    expr: "Y = A'*B'*C'*D + A'*B'*C*D + A'*B*C'*D + A*B'*C'*D + A*B'*C*D",
  },
];

export const BOOLEAN_LAWS: readonly BooleanLaw[] = [
  {
    id: 'identity',
    category: 'basic',
    name: 'Identity Law',
    formulaLatex: 'A \\cdot 1 = A, \\quad A + 0 = A',
    summary: 'ANDing with 1 or ORing with 0 leaves any Boolean signal unchanged.',
    theory:
      '1 is the multiplicative identity for AND, and 0 is the additive identity for OR. In hardware, inputs tied to an identity constant can be removed, eliminating the gate altogether.',
    exampleExpr: 'Y = A*1 + B*0',
    keywords: ['identity', 'neutral', 'zero', 'one', 'constant'],
  },
  {
    id: 'annulment',
    category: 'basic',
    name: 'Annulment (Domination) Law',
    formulaLatex: 'A \\cdot 0 = 0, \\quad A + 1 = 1',
    summary: 'ANDing with 0 forces 0; ORing with 1 forces 1 regardless of A.',
    theory:
      'A dominant constant short-circuits the gate output. Any sub-circuit driving the other input becomes dead logic and can be pruned completely.',
    exampleExpr: 'Y = (A + 1)*(B + C*0)',
    keywords: ['annulment', 'domination', 'null', 'zero', 'one'],
  },
  {
    id: 'idempotent',
    category: 'basic',
    name: 'Idempotent Law',
    formulaLatex: 'A \\cdot A = A, \\quad A + A = A',
    summary: 'Repeating the same signal in an AND or OR gate has no effect.',
    theory:
      'Unlike ordinary arithmetic where x + x = 2x and x·x = x², Boolean algebra has only two truth values so repeated operands collapse to a single wire.',
    exampleExpr: 'Y = A*A + A*B + A*B',
    keywords: ['idempotent', 'duplicate', 'repeat', 'collapse'],
  },
  {
    id: 'complement',
    category: 'basic',
    name: 'Complement Law',
    formulaLatex: 'A \\cdot \\overline{A} = 0, \\quad A + \\overline{A} = 1',
    summary: 'A signal AND its inverse is always 0; a signal OR its inverse is always 1.',
    theory:
      'Because A and ¬A can never be simultaneously true (or simultaneously false), their conjunction is a contradiction (0) and their disjunction is a tautology (1). Watch out in physical circuits: unequal inverter delay can create a brief static glitch on A + ¬A!',
    exampleExpr: "Y = A*B + A*B'",
    keywords: ['complement', 'inverse', 'contradiction', 'tautology', 'glitch', 'hazard'],
  },
  {
    id: 'double-negation',
    category: 'basic',
    name: 'Double Negation (Involution)',
    formulaLatex: '\\overline{\\overline{A}} = A',
    summary: 'Inverting a signal twice restores the original logic value.',
    theory:
      'Two inverters in series cancel logically (though they still add 2·t_pd of propagation delay in a real circuit). Removing double bubbles shrinks both area and delay.',
    exampleExpr: 'Y = !!A * (B + !!C)',
    keywords: ['double negation', 'involution', 'not not', 'bubble'],
  },
  {
    id: 'distributive',
    category: 'distributive',
    name: 'Distributive Law',
    formulaLatex: 'A(B + C) = AB + AC, \\quad A + BC = (A + B)(A + C)',
    summary: 'AND distributes over OR — and uniquely in Boolean algebra, OR also distributes over AND.',
    theory:
      'The second form A + BC = (A + B)(A + C) has no counterpart in elementary arithmetic. Factoring common literals with the distributive law reduces literal and gate counts in multi-level logic.',
    exampleExpr: 'Y = (A + B)*(A + C)',
    keywords: ['distributive', 'expand', 'factor', 'common factor'],
  },
  {
    id: 'absorption',
    category: 'distributive',
    name: 'Absorption Law',
    formulaLatex: 'A + AB = A, \\quad A(A + B) = A',
    summary: 'A broader term completely covers and absorbs any stricter sub-term containing it.',
    theory:
      'Proof: A + AB = A(1 + B) = A·1 = A. Whenever A is 1, AB cannot make the OR output any higher; whenever A is 0, AB is also 0.',
    exampleExpr: 'Y = A + A*B + A*B*C',
    keywords: ['absorption', 'redundant', 'cover', 'subsume'],
  },
  {
    id: 'elimination',
    category: 'distributive',
    name: 'Redundancy (Complement Absorption)',
    formulaLatex: 'A + \\overline{A}B = A + B, \\quad A(\\overline{A} + B) = AB',
    summary: 'A negated copy of an already-present term is redundant and can be dropped.',
    theory:
      'By OR-over-AND distribution: A + ¬A·B = (A + ¬A)(A + B) = 1·(A + B) = A + B. Removing the negated literal saves an inverter and narrows the AND gate.',
    exampleExpr: "Y = A + A'*B",
    keywords: ['elimination', 'complement absorption', 'redundancy', 'simplify'],
  },
  {
    id: 'adjacency',
    category: 'distributive',
    name: 'Combining (Adjacency) Law',
    formulaLatex: 'AB + A\\overline{B} = A, \\quad (A + B)(A + \\overline{B}) = A',
    summary: 'Two terms that differ in only one variable merge and eliminate that variable.',
    theory:
      'This is the exact algebraic foundation of both Karnaugh map pairing and Quine-McCluskey tabular minimization: adjacent minterms combine to remove one literal per doubling of group size.',
    exampleExpr: "Y = A*B*C + A*B*C' + A*B'*C + A*B'*C'",
    keywords: ['combining', 'adjacency', 'kmap', 'quine', 'merge', 'unite'],
  },
  {
    id: 'demorgan',
    category: 'demorgan',
    name: "De Morgan's Theorems",
    formulaLatex: '\\overline{A \\cdot B} = \\overline{A} + \\overline{B}, \\quad \\overline{A + B} = \\overline{A} \\cdot \\overline{B}',
    summary: 'Break the bar, change the sign: inverting an AND gives OR of inverses, and vice versa.',
    theory:
      "De Morgan's laws let you push negations inward toward primary inputs (to reach SOP/POS normal forms) or convert any AND/OR/NOT network into purely NAND or purely NOR universal gates.",
    exampleExpr: "Y = !(A*B) + A*B'",
    keywords: ['demorgan', 'bubble pushing', 'nand', 'nor', 'negation'],
  },
  {
    id: 'nand-nor-universal',
    category: 'demorgan',
    name: 'NAND / NOR Universal Synthesis',
    formulaLatex: 'AB + CD = \\overline{\\overline{AB} \\cdot \\overline{CD}}, \\quad (A+B)(C+D) = \\overline{\\overline{A+B} + \\overline{C+D}}',
    summary: 'Every 2-level SOP maps directly to NAND-NAND; every 2-level POS maps to NOR-NOR.',
    theory:
      'In CMOS silicon, NAND and NOR gates are inverting and require fewer transistors (4T for 2-input NAND) than non-inverting AND/OR gates (6T). Double-negating an SOP expression turns both levels into NAND gates.',
    exampleExpr: 'Y = A*B + C*D',
    keywords: ['nand', 'nor', 'universal', 'cmos', 'two-level'],
  },
  {
    id: 'consensus',
    category: 'advanced',
    name: 'Consensus Theorem',
    formulaLatex: 'AB + \\overline{A}C + BC = AB + \\overline{A}C',
    summary: 'The consensus term BC is logically redundant given AB and ¬A·C.',
    theory:
      'When B = 1 and C = 1, either A = 1 (making AB = 1) or A = 0 (making ¬A·C = 1), so BC is always already covered. Note: hardware designers sometimes intentionally KEEP the consensus term BC to prevent static-1 timing hazards when A switches!',
    exampleExpr: "Y = A*B + A'*C + B*C",
    keywords: ['consensus', 'hazard', 'redundant', 'prime implicant', 'static-1'],
  },
  {
    id: 'xor-xnor',
    category: 'advanced',
    name: 'XOR & XNOR Identities',
    formulaLatex: 'A \\oplus B = A\\overline{B} + \\overline{A}B, \\quad A \\odot B = AB + \\overline{A}\\overline{B}',
    summary: 'Recognize parity (XOR) and equivalence (XNOR) patterns from SOP expansions.',
    theory:
      'Two-level SOP minimizers cannot express XOR compactly (an n-input parity function needs 2^(n-1) product terms in SOP!). Recognizing XOR/XNOR patterns in heuristic multi-level search dramatically shrinks adder and parity circuits.',
    exampleExpr: "Y = A'*B + A*B'",
    keywords: ['xor', 'xnor', 'parity', 'equivalence', 'adder'],
  },
  {
    id: 'qm-minimization',
    category: 'advanced',
    name: 'Quine-McCluskey Exact Minimization',
    formulaLatex: 'F = \\sum m(\\dots) \\longrightarrow \\text{Minimum Prime Implicant Cover}',
    summary: 'Tabular exact algorithm guaranteeing minimum two-level SOP or POS gate cover.',
    theory:
      'Quine-McCluskey groups minterms by popcount, iteratively merges adjacent implicants differing by one bit to find all Prime Implicants, extracts Essential Prime Implicants, and solves the remaining cover with Petrick’s method.',
    exampleExpr: "Y = A'*B'*C'*D + A'*B'*C*D + A'*B*C'*D + A*B'*C'*D + A*B'*C*D",
    keywords: ['quine', 'mccluskey', 'prime implicant', 'petrick', 'kmap', 'exact'],
  },
  {
    id: 'factoring',
    category: 'advanced',
    name: 'Multi-Level Common Factoring',
    formulaLatex: 'AB + AC + AD = A(B + C + D)',
    summary: 'Extracts shared literals across product terms to reduce literal count and fan-in.',
    theory:
      'While 2-level SOP minimizes logic depth (delay), factoring common kernels reduces total literal and transistor count by sharing logic across branches—trading a small increase in depth for a smaller circuit.',
    exampleExpr: 'Y = A*B + A*C + A*D',
    keywords: ['factor', 'kernel', 'multi-level', 'heuristic', 'literal'],
  },
];
