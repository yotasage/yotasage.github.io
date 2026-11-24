export type ReferenceGateKind = 'BUFFER' | 'NOT' | 'AND' | 'OR' | 'NAND' | 'NOR' | 'XOR' | 'XNOR';
export type GateBaseInputs = 2 | 3 | 4;

export interface GateReferenceEntry {
  readonly id: ReferenceGateKind;
  readonly name: string;
  readonly marking: string;
  readonly iecLabel: string;
  readonly arity: 1 | 2 | 3 | 4;
  readonly inputNames: readonly string[];
  readonly equationLatex: string;
  readonly plainExpr: string;
  readonly summary: string;
  readonly nandEquivalent: string;
  readonly norEquivalent: string;
  readonly rows: readonly (readonly (0 | 1)[])[];
}

const INPUT_NAMES_POOL = ['A', 'B', 'C', 'D'] as const;

function buildRows(kind: ReferenceGateKind, arity: 1 | 2 | 3 | 4): readonly (readonly (0 | 1)[])[] {
  const total = 1 << arity;
  const rows: (0 | 1)[][] = [];
  for (let mask = 0; mask < total; mask++) {
    const bits: (0 | 1)[] = [];
    for (let i = 0; i < arity; i++) {
      bits.push(((mask >> (arity - 1 - i)) & 1) === 1 ? 1 : 0);
    }
    const ones = bits.reduce<number>((acc, b) => acc + b, 0);
    let out: 0 | 1 = 0;
    switch (kind) {
      case 'BUFFER':
        out = bits[0];
        break;
      case 'NOT':
        out = bits[0] === 1 ? 0 : 1;
        break;
      case 'AND':
        out = ones === arity ? 1 : 0;
        break;
      case 'OR':
        out = ones > 0 ? 1 : 0;
        break;
      case 'NAND':
        out = ones === arity ? 0 : 1;
        break;
      case 'NOR':
        out = ones > 0 ? 0 : 1;
        break;
      case 'XOR':
        out = ones % 2 === 1 ? 1 : 0;
        break;
      case 'XNOR':
        out = ones % 2 === 0 ? 1 : 0;
        break;
    }
    rows.push([...bits, out]);
  }
  return rows;
}

export function buildGateReferenceList(baseInputs: GateBaseInputs = 2): readonly GateReferenceEntry[] {
  const vars = INPUT_NAMES_POOL.slice(0, baseInputs);
  const dotLatex = vars.join(' \\cdot ');
  const plusLatex = vars.join(' + ');
  const xorLatex = vars.join(' \\oplus ');
  const xnorLatex = vars.join(' \\odot ');
  const starExpr = vars.join(' * ');
  const plusExpr = vars.join(' + ');
  const xorExpr = vars.join(' XOR ');
  const varArgs = vars.join(', ');

  return [
    {
      id: 'BUFFER',
      name: 'Buffer (Identity)',
      marking: 'BUF1',
      iecLabel: '1',
      arity: 1,
      inputNames: ['A'],
      equationLatex: 'Y = A',
      plainExpr: 'A',
      summary:
        'Single-input gate that passes the logic level unchanged while restoring signal drive strength and voltage margins.',
      nandEquivalent: 'NAND(NAND(A, A), NAND(A, A))',
      norEquivalent: 'NOR(NOR(A, A), NOR(A, A))',
      rows: buildRows('BUFFER', 1),
    },
    {
      id: 'NOT',
      name: 'NOT (Inverter)',
      marking: 'NOT1',
      iecLabel: '1',
      arity: 1,
      inputNames: ['A'],
      equationLatex: 'Y = \\overline{A}',
      plainExpr: '!A',
      summary: 'Single-input inverter that outputs the logical complement of its input (0 becomes 1, 1 becomes 0).',
      nandEquivalent: 'NAND(A, A)',
      norEquivalent: 'NOR(A, A)',
      rows: buildRows('NOT', 1),
    },
    {
      id: 'AND',
      name: 'AND Gate',
      marking: `AND${baseInputs}`,
      iecLabel: '&',
      arity: baseInputs,
      inputNames: vars,
      equationLatex: `Y = ${dotLatex}`,
      plainExpr: starExpr,
      summary: `Outputs 1 if and only if all ${baseInputs} inputs (${varArgs}) are 1; otherwise outputs 0.`,
      nandEquivalent:
        baseInputs === 2
          ? 'NAND(NAND(A, B), NAND(A, B))'
          : `NAND${baseInputs}(${varArgs}) inverted by NOT1`,
      norEquivalent: `NOR${baseInputs}(${vars.map((v) => `NOR(${v},${v})`).join(', ')})`,
      rows: buildRows('AND', baseInputs),
    },
    {
      id: 'OR',
      name: 'OR Gate',
      marking: `OR${baseInputs}`,
      iecLabel: '≥1',
      arity: baseInputs,
      inputNames: vars,
      equationLatex: `Y = ${plusLatex}`,
      plainExpr: plusExpr,
      summary: `Outputs 1 whenever at least one of the ${baseInputs} inputs (${varArgs}) is 1; outputs 0 only when all are 0.`,
      nandEquivalent: `NAND${baseInputs}(${vars.map((v) => `NAND(${v},${v})`).join(', ')})`,
      norEquivalent:
        baseInputs === 2
          ? 'NOR(NOR(A, B), NOR(A, B))'
          : `NOR${baseInputs}(${varArgs}) inverted by NOT1`,
      rows: buildRows('OR', baseInputs),
    },
    {
      id: 'NAND',
      name: 'NAND Gate (Universal)',
      marking: `NAND${baseInputs}`,
      iecLabel: '&',
      arity: baseInputs,
      inputNames: vars,
      equationLatex: `Y = \\overline{${dotLatex}}`,
      plainExpr: baseInputs === 2 ? 'A NAND B' : `!(${starExpr})`,
      summary: `Inverted ${baseInputs}-input AND. Outputs 0 only when all ${baseInputs} inputs are 1. Functionally complete on its own.`,
      nandEquivalent: `NAND${baseInputs}(${varArgs}) (1 gate)`,
      norEquivalent: `De Morgan: invert inputs then NOR${baseInputs} + NOT1`,
      rows: buildRows('NAND', baseInputs),
    },
    {
      id: 'NOR',
      name: 'NOR Gate (Universal)',
      marking: `NOR${baseInputs}`,
      iecLabel: '≥1',
      arity: baseInputs,
      inputNames: vars,
      equationLatex: `Y = \\overline{${plusLatex}}`,
      plainExpr: baseInputs === 2 ? 'A NOR B' : `!(${plusExpr})`,
      summary: `Inverted ${baseInputs}-input OR. Outputs 1 only when all ${baseInputs} inputs are 0. Functionally complete on its own.`,
      nandEquivalent: `De Morgan: invert inputs then NAND${baseInputs} + NOT1`,
      norEquivalent: `NOR${baseInputs}(${varArgs}) (1 gate)`,
      rows: buildRows('NOR', baseInputs),
    },
    {
      id: 'XOR',
      name: 'XOR Gate (Odd Parity)',
      marking: `XOR${baseInputs}`,
      iecLabel: '=1',
      arity: baseInputs,
      inputNames: vars,
      equationLatex:
        baseInputs === 2
          ? 'Y = A \\oplus B = \\overline{A}\\cdot B + A\\cdot \\overline{B}'
          : `Y = ${xorLatex}`,
      plainExpr: xorExpr,
      summary:
        baseInputs === 2
          ? 'Outputs 1 when an odd number of inputs are 1 (when A and B differ). Core building block of binary adders.'
          : `Odd-parity gate: outputs 1 whenever an odd number of its ${baseInputs} inputs (${varArgs}) are 1.`,
      nandEquivalent:
        baseInputs === 2
          ? '4 NAND2 gates (shared T = NAND(A, B))'
          : `Cascade of ${baseInputs - 1} 4-NAND XOR2 blocks (${(baseInputs - 1) * 4} NAND2 gates)`,
      norEquivalent:
        baseInputs === 2
          ? '5 NOR2 gates'
          : `Cascade of ${baseInputs - 1} 5-NOR XOR2 blocks (${(baseInputs - 1) * 5} NOR2 gates)`,
      rows: buildRows('XOR', baseInputs),
    },
    {
      id: 'XNOR',
      name: 'XNOR Gate (Even Parity)',
      marking: `XNOR${baseInputs}`,
      iecLabel: '=1',
      arity: baseInputs,
      inputNames: vars,
      equationLatex:
        baseInputs === 2
          ? 'Y = A \\odot B = A\\cdot B + \\overline{A}\\cdot \\overline{B}'
          : `Y = \\overline{${xorLatex}} = ${xnorLatex}`,
      plainExpr: baseInputs === 2 ? 'A XNOR B' : `!(${xorExpr})`,
      summary:
        baseInputs === 2
          ? 'Outputs 1 when both inputs are equal (both 0 or both 1). Used in magnitude comparators and even-parity checkers.'
          : `Even-parity gate (inverted ${baseInputs}-input XOR): outputs 1 whenever an even number (0, 2${baseInputs === 4 ? ', 4' : ''}) of inputs are 1.`,
      nandEquivalent:
        baseInputs === 2
          ? '5 NAND2 gates'
          : `XOR${baseInputs} followed by 1 NAND2 inverter`,
      norEquivalent:
        baseInputs === 2
          ? '4 NOR2 gates (shared T = NOR(A, B))'
          : `XOR${baseInputs} followed by 1 NOR2 inverter`,
      rows: buildRows('XNOR', baseInputs),
    },
  ];
}

export const GATE_REFERENCE_LIST: readonly GateReferenceEntry[] = buildGateReferenceList(2);

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
