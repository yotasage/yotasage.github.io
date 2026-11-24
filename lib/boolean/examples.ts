import type { CuratedExamplePreset } from './types';

export const CURATED_EXAMPLES: readonly CuratedExamplePreset[] = [
  {
    id: 'effort-3var-parity',
    title: '3-Input Odd Parity (Effort Level Showcase)',
    category: 'effort',
    equations: ["Y = A'*B'*C + A'*B*C' + A*B'*C' + A*B*C"],
    summary:
      'A classic checkerboard Karnaugh map with zero adjacent minterms. Two-level SOP minimization cannot merge a single cell, making it the cleanest test of Low vs. Medium vs. High effort.',
    whatToNotice:
      'Switch Search Effort between Low, Medium, and High with Method = Heuristic. Low factors only one literal, Medium detects a 2-variable XOR/XNOR inside a branch, and High discovers the exact 3-input parity gate A ⊕ B ⊕ C.',
    comparisonNotes: [
      {
        label: 'Low effort',
        outcome: 'Single-pass common-literal factoring (still 10+ literals).',
        method: 'heuristic',
        effort: 'low',
        targetForm: 'auto',
      },
      {
        label: 'Medium effort',
        outcome: 'Recursive factoring + 2-variable XOR/XNOR sub-branch synthesis.',
        method: 'heuristic',
        effort: 'medium',
        targetForm: 'auto',
      },
      {
        label: 'High effort',
        outcome: 'Global GF(2) parity detection collapses all 4 product terms to A ⊕ B ⊕ C!',
        method: 'heuristic',
        effort: 'high',
        targetForm: 'auto',
      },
    ],
    defaultMethod: 'heuristic',
    defaultEffort: 'high',
    defaultTargetForm: 'auto',
    openTab: 'solver',
  },
  {
    id: 'effort-bi-factoring',
    title: 'Shared-Kernel Bi-Factoring: (A + B) · (C + D)',
    category: 'effort',
    equations: ['Y = A*C + A*D + B*C + B*D'],
    summary:
      'Already minimal as a 2-level Sum-of-Products (8 literals, 5 gates), yet it factors cleanly into two 2-input OR gates feeding one 2-input AND gate (4 literals, 3 gates).',
    whatToNotice:
      'Compare Algebraic/QM (stays flat 2-level SOP) against Heuristic Low (factors A only), Medium (factors both A and B separately), and High (extracts shared kernel (C + D) to produce (A + B) · (C + D)).',
    comparisonNotes: [
      {
        label: 'Quine-McCluskey (2-level)',
        outcome: 'Guaranteed optimal 2-level SOP: stays A·C + A·D + B·C + B·D (8 literals).',
        method: 'qm',
        effort: 'medium',
        targetForm: 'sop',
      },
      {
        label: 'Heuristic · Low',
        outcome: 'Factors one literal: A·(C + D) + B·C + B·D (7 literals).',
        method: 'heuristic',
        effort: 'low',
        targetForm: 'auto',
      },
      {
        label: 'Heuristic · High',
        outcome: 'Kernel bi-factoring extracts (A + B) · (C + D) — cuts literals in half (4 literals, 3 gates)!',
        method: 'heuristic',
        effort: 'high',
        targetForm: 'auto',
      },
    ],
    defaultMethod: 'heuristic',
    defaultEffort: 'high',
    defaultTargetForm: 'auto',
    openTab: 'solver',
  },
  {
    id: 'method-4var-kmap',
    title: '4-Variable K-Map: Algebraic vs. Quine-McCluskey',
    category: 'methods',
    equations: ["Y = A'*B'*C'*D + A'*B'*C*D + A'*B*C'*D + A*B'*C'*D + A*B'*C*D"],
    summary:
      'Five 4-literal minterms that wrap cleanly on a 4-variable Karnaugh map into two overlapping prime implicants.',
    whatToNotice:
      'Compare Algebraic (stops at local stepwise merges) with Quine-McCluskey (guaranteed global minimum 2-level cover B̄·D + Ā·C̄·D) and Heuristic (factors out D to produce D · (B̄ + Ā·C̄)). Open the K-Map tab to see the prime implicant loops!',
    comparisonNotes: [
      {
        label: 'Algebraic only',
        outcome: 'Applies local combining/absorption rules step by step without global cover search.',
        method: 'algebraic',
        effort: 'medium',
        targetForm: 'auto',
      },
      {
        label: 'Quine-McCluskey',
        outcome: 'Exact prime-implicant cover: B̄·D + Ā·C̄·D (minimal 2-level SOP).',
        method: 'qm',
        effort: 'medium',
        targetForm: 'sop',
      },
      {
        label: 'Heuristic · Medium',
        outcome: 'Multi-level factored form D · (B̄ + Ā·C̄) saves another literal.',
        method: 'heuristic',
        effort: 'medium',
        targetForm: 'auto',
      },
    ],
    defaultMethod: 'qm',
    defaultEffort: 'medium',
    defaultTargetForm: 'sop',
    openTab: 'kmap',
  },
  {
    id: 'universal-xor-4nand',
    title: 'How to Build XOR with Only 4 NAND Gates',
    category: 'universal',
    equations: ['Y = A XOR B'],
    summary:
      'A classic digital-design puzzle: build an XOR gate using nothing but 2-input NAND gates (e.g. a single 74HC00 quad-NAND IC).',
    whatToNotice:
      'With Target Form = NAND-only, the solver synthesizes NAND(NAND(A, T), NAND(B, T)) where T = NAND(A, B) is shared between both middle gates. Open the Circuit tab with gate markings enabled to see all 4 NAND2 gates clearly!',
    comparisonNotes: [
      {
        label: '4-gate NAND2 topology',
        outcome: 'Uses 1 shared NAND2(A, B) feeding two NAND2s and one output NAND2 — exactly 4 gates total.',
        method: 'algebraic',
        effort: 'medium',
        targetForm: 'nand',
        gateInputMode: '2-input-nand',
      },
      {
        label: 'NOR-only equivalent',
        outcome: 'Builds XOR using 5 NOR2 gates (4-gate XNOR2 plus an inverting NOR2).',
        method: 'algebraic',
        effort: 'medium',
        targetForm: 'nor',
        gateInputMode: '2-input-nor',
      },
    ],
    defaultMethod: 'algebraic',
    defaultEffort: 'medium',
    defaultTargetForm: 'nand',
    defaultGateInputMode: '2-input-nand',
    openTab: 'circuit',
  },
  {
    id: 'circuit-full-adder',
    title: '1-Bit Full Adder (Multi-Equation: S and Cout)',
    category: 'circuits',
    equations: [
      "S = A'*B'*Cin + A'*B*Cin' + A*B'*Cin' + A*B*Cin",
      'Cout = A*B + B*Cin + A*Cin + A*B*Cin',
    ],
    summary:
      'A complete 1-bit binary Full Adder entered as two simultaneous equations. Sum S is 3-input odd parity, and carry-out Cout is the 3-input majority function.',
    whatToNotice:
      'Both equations simplify together, share the same truth table (showing S and Cout side by side), share input rails & sub-gates in a unified circuit diagram, and export as a combined Verilog/VHDL module! Try switching the Circuit tab to 2-input only mode.',
    comparisonNotes: [
      {
        label: 'Standard multi-input',
        outcome: 'S = A ⊕ B ⊕ Cin and Cout = A·B + B·Cin + A·Cin.',
        method: 'heuristic',
        effort: 'high',
        targetForm: 'auto',
        gateInputMode: 'multi',
      },
      {
        label: '2-input gates only',
        outcome: 'Decomposes 3-input XOR and 3-input OR into cascaded 2-input gates with clear markings (XOR2, AND2, OR2).',
        method: 'heuristic',
        effort: 'high',
        targetForm: 'auto',
        gateInputMode: '2-input',
      },
    ],
    defaultMethod: 'heuristic',
    defaultEffort: 'high',
    defaultTargetForm: 'auto',
    defaultGateInputMode: '2-input',
    openTab: 'circuit',
  },
  {
    id: 'circuit-half-adder',
    title: '1-Bit Half Adder (Sum & Carry)',
    category: 'circuits',
    equations: ["S = A'*B + A*B'", 'C = A*B'],
    summary:
      'The simplest multi-output arithmetic block: adds two 1-bit binary digits A and B to produce Sum (XOR) and Carry (AND).',
    whatToNotice:
      'With Heuristic Medium, S collapses from Ā·B + A·B̄ into A ⊕ B while C stays A · B. Switch to the Truth Table and Circuit tabs to inspect both outputs simultaneously.',
    defaultMethod: 'heuristic',
    defaultEffort: 'medium',
    defaultTargetForm: 'auto',
    openTab: 'truth-table',
  },
  {
    id: 'circuit-1bit-comparator',
    title: '1-Bit Magnitude Comparator (GT, EQ, LT)',
    category: 'circuits',
    equations: ["GT = A*B'", "EQ = A*B + A'*B'", "LT = A'*B"],
    summary:
      'Three simultaneous outputs comparing two 1-bit numbers A and B: Greater Than (A > B), Equal (A = B), and Less Than (A < B).',
    whatToNotice:
      'Heuristic search recognizes EQ as XNOR (A ⊙ B), while GT and LT share inverted inputs Ā and B̄ cleanly in the combined circuit and truth table.',
    defaultMethod: 'heuristic',
    defaultEffort: 'medium',
    defaultTargetForm: 'auto',
    openTab: 'circuit',
  },
  {
    id: 'timing-mux-hazard',
    title: '2:1 MUX Static-1 Glitch vs. Consensus Term',
    category: 'timing',
    equations: ["Y = S*A + S'*B + A*B"],
    summary:
      'The classic digital timing paradox: algebraically A·B is redundant (Consensus Theorem), so simplifying removes it — yet removing A·B introduces a real Static-1 glitch when A=1, B=1 and select S transitions!',
    whatToNotice:
      'Open the Timing tab to compare the original glitch-free circuit (with consensus term A·B) against the simplified 2-term MUX. Toggle DFF Clocked mode to see how registering the output filters out the combinational glitch.',
    defaultMethod: 'algebraic',
    defaultEffort: 'medium',
    defaultTargetForm: 'auto',
    openTab: 'timing',
  },
];
