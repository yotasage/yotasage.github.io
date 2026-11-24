export type ReferenceGateKind = 'BUFFER' | 'NOT' | 'AND' | 'OR' | 'NAND' | 'NOR' | 'XOR' | 'XNOR';

export interface GateReferenceEntry {
  readonly id: ReferenceGateKind;
  readonly name: string;
  readonly marking2: string;
  readonly iecLabel: string;
  readonly arity: 1 | 2;
  readonly equationLatex: string;
  readonly plainExpr: string;
  readonly summary: string;
  readonly nandEquivalent: string;
  readonly norEquivalent: string;
  readonly rows: readonly (readonly (0 | 1)[])[];
}

export const GATE_REFERENCE_LIST: readonly GateReferenceEntry[] = [
  {
    id: 'BUFFER',
    name: 'Buffer (Identity)',
    marking2: 'BUF1',
    iecLabel: '1',
    arity: 1,
    equationLatex: 'Y = A',
    plainExpr: 'A',
    summary: 'Passes the input logic level unchanged while restoring signal drive strength and voltage margins.',
    nandEquivalent: 'NAND(NAND(A, A), NAND(A, A))',
    norEquivalent: 'NOR(NOR(A, A), NOR(A, A))',
    rows: [
      [0, 0],
      [1, 1],
    ],
  },
  {
    id: 'NOT',
    name: 'NOT (Inverter)',
    marking2: 'NOT1',
    iecLabel: '1',
    arity: 1,
    equationLatex: 'Y = \\overline{A}',
    plainExpr: "!A",
    summary: 'Outputs the logical complement of its single input (0 becomes 1, 1 becomes 0).',
    nandEquivalent: 'NAND(A, A)',
    norEquivalent: 'NOR(A, A)',
    rows: [
      [0, 1],
      [1, 0],
    ],
  },
  {
    id: 'AND',
    name: 'AND Gate',
    marking2: 'AND2',
    iecLabel: '&',
    arity: 2,
    equationLatex: 'Y = A \\cdot B',
    plainExpr: 'A * B',
    summary: 'Outputs 1 if and only if every input is 1; otherwise outputs 0.',
    nandEquivalent: 'NAND(NAND(A, B), NAND(A, B))',
    norEquivalent: 'NOR(NOR(A, A), NOR(B, B))',
    rows: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
      [1, 1, 1],
    ],
  },
  {
    id: 'OR',
    name: 'OR Gate',
    marking2: 'OR2',
    iecLabel: '>=1',
    arity: 2,
    equationLatex: 'Y = A + B',
    plainExpr: 'A + B',
    summary: 'Outputs 1 whenever at least one input is 1; outputs 0 only when all inputs are 0.',
    nandEquivalent: 'NAND(NAND(A, A), NAND(B, B))',
    norEquivalent: 'NOR(NOR(A, B), NOR(A, B))',
    rows: [
      [0, 0, 0],
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 1],
    ],
  },
  {
    id: 'NAND',
    name: 'NAND Gate (Universal)',
    marking2: 'NAND2',
    iecLabel: '&',
    arity: 2,
    equationLatex: 'Y = \\overline{A \\cdot B}',
    plainExpr: 'A NAND B',
    summary: 'Inverted AND. Outputs 0 only when all inputs are 1. Functionally complete on its own.',
    nandEquivalent: 'NAND(A, B) (1 gate)',
    norEquivalent: 'NOR(NOR(NOR(A,A), NOR(B,B)), ...)',
    rows: [
      [0, 0, 1],
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
    ],
  },
  {
    id: 'NOR',
    name: 'NOR Gate (Universal)',
    marking2: 'NOR2',
    iecLabel: '>=1',
    arity: 2,
    equationLatex: 'Y = \\overline{A + B}',
    plainExpr: 'A NOR B',
    summary: 'Inverted OR. Outputs 1 only when all inputs are 0. Functionally complete on its own.',
    nandEquivalent: '4 NAND2 gates (De Morgan)',
    norEquivalent: 'NOR(A, B) (1 gate)',
    rows: [
      [0, 0, 1],
      [0, 1, 0],
      [1, 0, 0],
      [1, 1, 0],
    ],
  },
  {
    id: 'XOR',
    name: 'XOR Gate (Exclusive OR)',
    marking2: 'XOR2',
    iecLabel: '=1',
    arity: 2,
    equationLatex: 'Y = A \\oplus B = \\overline{A}\\cdot B + A\\cdot \\overline{B}',
    plainExpr: 'A XOR B',
    summary: 'Outputs 1 when an odd number of inputs are 1 (for 2 inputs: when A and B differ). Core building block of binary adders.',
    nandEquivalent: '4 NAND2 gates (shared T = NAND(A, B))',
    norEquivalent: '5 NOR2 gates',
    rows: [
      [0, 0, 0],
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
    ],
  },
  {
    id: 'XNOR',
    name: 'XNOR Gate (Equivalence)',
    marking2: 'XNOR2',
    iecLabel: '=1',
    arity: 2,
    equationLatex: 'Y = A \\odot B = A\\cdot B + \\overline{A}\\cdot \\overline{B}',
    plainExpr: 'A XNOR B',
    summary: 'Outputs 1 when both inputs are equal (both 0 or both 1). Used in magnitude comparators and even-parity checkers.',
    nandEquivalent: '5 NAND2 gates',
    norEquivalent: '4 NOR2 gates (shared T = NOR(A, B))',
    rows: [
      [0, 0, 1],
      [0, 1, 0],
      [1, 0, 0],
      [1, 1, 1],
    ],
  },
];

export interface BooleanTheoryTopic {
  readonly id: string;
  readonly title: string;
  readonly formulaLatex?: string;
  readonly summary: string;
  readonly details: readonly string[];
}

export const BOOLEAN_THEORY_TOPICS: readonly BooleanTheoryTopic[] = [
  {
    id: 'canonical-sop-pos',
    title: 'Canonical Forms: Minterms (SOP) & Maxterms (POS)',
    formulaLatex: 'Y = \\sum m(1, 3, 5) = \\prod M(0, 2, 4, 6, 7)',
    summary:
      'Every Boolean function has a unique truth table, which can be written directly as either a Sum of Products (minterms where Y = 1) or a Product of Sums (maxterms where Y = 0).',
    details: [
      'A minterm is an AND term containing every input variable (either true or complemented) that evaluates to 1 for exactly one truth-table row.',
      'A maxterm is an OR term containing every input variable that evaluates to 0 for exactly one row; AND-ing all 0-rows defines the same function.',
      'Two-level minimization (Karnaugh maps and Quine-McCluskey) merges adjacent minterms/maxterms to produce the fewest possible product or sum terms.',
    ],
  },
  {
    id: 'algebraic-vs-qm-vs-heuristic',
    title: 'Simplification Methods: Algebraic vs. Quine-McCluskey vs. Heuristic',
    formulaLatex: 'A\\cdot C + A\\cdot D + B\\cdot C + B\\cdot D = (A + B)\\cdot (C + D)',
    summary:
      'Different simplification algorithms optimize different objectives — human-readable derivation steps, guaranteed minimal 2-level gates, or compact multi-level factored circuits.',
    details: [
      'Algebraic Laws applies local identities (absorption, idempotence, De Morgan, consensus) one step at a time. Every step is easy to follow by hand, though local rewrites can miss global 2-level covers.',
      'Quine-McCluskey (QM) + Petrick’s Method is a programmatic Karnaugh map that exhaustively finds all prime implicants and guarantees a minimum-cost 2-level SOP or POS cover.',
      'Heuristic Multi-Level Search goes beyond flat 2-level forms: Low effort applies single-literal factoring, Medium adds recursive factoring and 2-input XOR/XNOR recognition, and High adds shared-kernel bi-factoring and global n-variable parity detection.',
    ],
  },
  {
    id: 'universal-gates',
    title: 'Universal Gates (NAND-Only & NOR-Only Synthesis)',
    formulaLatex: 'A \\oplus B = \\overline{\\overline{A \\cdot \\overline{A \\cdot B}} \\cdot \\overline{B \\cdot \\overline{A \\cdot B}}}',
    summary:
      'Both NAND and NOR are functionally complete — any digital circuit can be constructed using only NAND gates or only NOR gates, which simplifies CMOS silicon and standard-cell libraries.',
    details: [
      'In static CMOS, NAND and NOR gates require fewer transistors and switch faster than non-inverting AND/OR gates (which are physically built as NAND/NOR followed by an inverter).',
      'Tie both inputs of a 2-input NAND (or NOR) together to create a NOT gate. Apply De Morgan’s laws to turn OR-of-ANDs into NAND-of-NANDs.',
      'Sharing intermediate gates saves silicon: XOR requires 5 naive NAND gates from SOP, but only 4 NAND2 gates when T = NAND(A, B) is shared.',
    ],
  },
  {
    id: 'timing-hazards-dff',
    title: 'Propagation Delay, Static Hazards & Synchronous D Flip-Flops',
    formulaLatex: 'T_{\\text{clk,min}} = t_{\\text{clk-to-Q}} + t_{\\text{pd,crit}} + t_{\\text{setup}}',
    summary:
      'Real logic gates take nanoseconds to switch. Unequal path delays create brief unintended pulses (glitches/hazards), which synchronous systems eliminate by registering inputs and outputs with D Flip-Flops.',
    details: [
      'Critical path delay (t_pd,crit) is the longest sum of gate delays from any primary input to any output; it sets the maximum safe clock frequency f_max = 1 / T_clk,min.',
      'A Static-1 hazard occurs when two adjacent 1-cells in a K-map are covered by separate product terms (e.g., 2:1 MUX S·A + S̄·B): adding the redundant consensus term A·B bridges the transition and eliminates the glitch.',
      'Wrapping combinational logic between rising-edge DFFs ensures glitches settle before the next clock edge, provided setup slack (T_clk − T_clk,min) remains non-negative.',
    ],
  },
];
