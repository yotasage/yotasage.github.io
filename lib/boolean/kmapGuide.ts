export interface KMapGuideChapter {
  readonly id: string;
  readonly stepNumber: number;
  readonly title: string;
  readonly formulaLatex?: string;
  readonly summary: string;
  readonly bullets: readonly string[];
  readonly tip: string;
}

export interface KMapWorkedGroup {
  readonly id: string;
  readonly label: string;
  readonly cells: readonly number[];
  readonly termLatex: string;
  readonly colorIndex: number;
  readonly eliminatedVars: string;
  readonly keptVars: string;
  readonly explanation: string;
  readonly isRedundantTrap?: boolean;
}

export interface KMapWorkedExample {
  readonly id: string;
  readonly difficulty: 'easy' | 'moderate' | 'difficult';
  readonly title: string;
  readonly subtitle: string;
  readonly variables: readonly string[];
  readonly rowVars: readonly string[];
  readonly colVars: readonly string[];
  readonly rowGray: readonly number[];
  readonly colGray: readonly number[];
  readonly rowLabels: readonly string[];
  readonly colLabels: readonly string[];
  readonly minterms: readonly number[];
  readonly inputExpr: string;
  readonly inputLatex: string;
  readonly resultLatex: string;
  readonly groups: readonly KMapWorkedGroup[];
  readonly walkthrough: readonly string[];
  readonly keyTakeaway: string;
}

export const KMAP_GUIDE_CHAPTERS: readonly KMapGuideChapter[] = [
  {
    id: 'gray-code-adjacency',
    stepNumber: 1,
    title: 'Why Karnaugh Maps Work: Gray Code & Single-Bit Adjacency',
    formulaLatex: 'X \\cdot Y + X \\cdot \\overline{Y} = X \\cdot (Y + \\overline{Y}) = X',
    summary:
      'A Karnaugh map (K-Map) is simply a truth table folded into a 2D grid so that every pair of side-by-side cells differs in exactly ONE input bit. Whenever two adjacent cells both contain 1, the single changing variable drops out immediately.',
    bullets: [
      'Notice the 2-bit header order: 00, 01, 11, 10 — NOT standard binary (00, 01, 10, 11). Swapping the last two labels is called Gray code.',
      'Why? Between 01 and 10, BOTH bits flip at once (two variables change), so algebraically they cannot merge. Between 01 and 11 only one bit changes, and between 11 and 10 only one bit changes.',
      'Because 10 and 00 also differ in only 1 bit, the left edge and right edge of the table are mathematically neighbors — and the top edge and bottom edge are neighbors too (like a rolled-up cylinder or donut/torus).',
    ],
    tip: 'Memory check: any time you draw a 4-column or 4-row K-Map, always write 00 · 01 · 11 · 10 (never 00 · 01 · 10 · 11).',
  },
  {
    id: 'building-the-grid',
    stepNumber: 2,
    title: 'How to Build a K-Map from a Truth Table or Equation',
    formulaLatex: 'm_5 = 101_2 = A \\cdot \\overline{B} \\cdot C, \\quad m_{10} = 1010_2 = A \\cdot \\overline{B} \\cdot C \\cdot \\overline{D}',
    summary:
      'Split your input variables across the rows and columns, label every row and column in Gray code, and copy each 1 (and 0) from the truth table into its matching cell.',
    bullets: [
      '2 variables (A, B): 2×2 grid (4 cells). Rows = A (0, 1), Columns = B (0, 1).',
      '3 variables (A, B, C): 2×4 grid (8 cells). Rows = A (0, 1), Columns = BC (00, 01, 11, 10). Watch the column order: m2 is on the far right, m3 is third!',
      '4 variables (A, B, C, D): 4×4 grid (16 cells). Rows = AB (00, 01, 11, 10), Columns = CD (00, 01, 11, 10). Row 3 (11) holds m12–m15, and row 4 (10) holds m8–m11.',
      'If you start from an equation rather than a truth table, evaluate which rows make each product term equal 1 and fill those cells with 1 (all other cells are 0).',
    ],
    tip: 'Writing the tiny minterm index (m0, m1, …) in the corner of each cell makes transferring a truth table almost error-proof.',
  },
  {
    id: 'grouping-rules',
    stepNumber: 3,
    title: 'The 6 Grouping Rules (Looping the 1s)',
    formulaLatex: '\\text{Group size } 2^k \\in \\{1, 2, 4, 8, 16\\} \\implies \\text{eliminates } k \\text{ variables}',
    summary:
      'To get a minimal Sum of Products (SOP), draw rectangular loops around adjacent 1s. Bigger loops mean simpler terms, and fewer loops mean fewer gates.',
    bullets: [
      '1. Only loop 1s (never include a 0 in an SOP group). Every 1 on the map must be covered by at least one loop.',
      '2. Power-of-2 sizes only: a valid group must contain 1, 2, 4, 8, or 16 cells in a solid rectangle (e.g., 1×2, 2×2, 1×4, 2×4). Never loop 3, 5, or 6 cells, and never group diagonally.',
      '3. Wrap around edges: top row wraps to bottom row, left column wraps to right column, and all 4 outer corners of a 4×4 map form a legal 2×2 group of 4!',
      '4. Make every loop as LARGE as possible: a group of 2 eliminates 1 variable, a group of 4 eliminates 2 variables, and a group of 8 eliminates 3 variables.',
      '5. Overlapping is GOOD when it makes a group bigger: reusing an already-covered 1 to turn a 1-cell island into a 2-cell or 4-cell group always reduces literals.',
      '6. Pick Essential Prime Implicants first, and skip redundant loops: if a 1 belongs to only ONE maximal loop, you MUST take that loop. Once every 1 is covered, stop — never add an extra loop whose 1s are already covered.',
    ],
    tip: 'Need a minimal Product of Sums (POS) instead? Apply the exact same 6 rules to the 0s instead of the 1s, then invert the result with De Morgan’s law!',
  },
  {
    id: 'reading-the-equation',
    stepNumber: 4,
    title: 'Reading the Simplified Equation from Your Loops',
    formulaLatex: '\\text{Variable stays } 1 \\to V, \\quad \\text{stays } 0 \\to \\overline{V}, \\quad \\text{changes } 0\\leftrightarrow 1 \\to \\text{drop}',
    summary:
      'Each loop translates directly into one AND product term. Check each variable across all cells inside the loop to see whether it stays constant or changes.',
    bullets: [
      'Look at the row and column headers covered by a single loop.',
      'If a variable is 1 in EVERY cell of the loop, include it uncomplemented (e.g. A).',
      'If a variable is 0 in EVERY cell of the loop, include it complemented (e.g. A\').',
      'If a variable is 0 in half the cells and 1 in the other half, it cancels out — drop it completely!',
      'Finally, OR (+) all the loop terms together. Double-check: a 4-variable map with a 4-cell loop must produce a 2-literal term (4 − log2(4) = 2).',
    ],
    tip: 'Sanity check on literal count: in an N-variable K-Map, a group of size 2^k ALWAYS has exactly (N − k) literals.',
  },
];

export const KMAP_WORKED_EXAMPLES: readonly KMapWorkedExample[] = [
  {
    id: 'kmap-easy-3var',
    difficulty: 'easy',
    title: 'Easy: 3-Variable Map — Combining a 4-Cell Quad + Overlapping Pair',
    subtitle: 'Learn Gray-code placement, 2-variable elimination in a quad, and why overlapping an existing 1 saves literals.',
    variables: ['A', 'B', 'C'],
    rowVars: ['A'],
    colVars: ['B', 'C'],
    rowGray: [0, 1],
    colGray: [0, 1, 3, 2],
    rowLabels: ['0', '1'],
    colLabels: ['00', '01', '11', '10'],
    minterms: [2, 3, 5, 6, 7],
    inputExpr: "Y = A'*B*C' + A'*B*C + A*B'*C + A*B*C' + A*B*C",
    inputLatex:
      'Y = \\overline{A}\\cdot B\\cdot \\overline{C} + \\overline{A}\\cdot B\\cdot C + A\\cdot \\overline{B}\\cdot C + A\\cdot B\\cdot \\overline{C} + A\\cdot B\\cdot C',
    resultLatex: 'Y = B + A \\cdot C',
    groups: [
      {
        id: 'easy-g1',
        label: 'Group 1 (2×2 quad)',
        cells: [2, 3, 6, 7],
        termLatex: 'B',
        colorIndex: 0,
        eliminatedVars: 'A and C (both span 0 and 1)',
        keptVars: 'B stays 1 across columns 11 & 10',
        explanation:
          'Cells m2, m3, m6, m7 form a 2×2 square of four 1s. Row A covers both 0 and 1 (drops A), and columns 11 & 10 have B=1 while C switches 1→0 (drops C). Only B survives!',
      },
      {
        id: 'easy-g2',
        label: 'Group 2 (1×2 pair, overlaps m7)',
        cells: [5, 7],
        termLatex: 'A \\cdot C',
        colorIndex: 1,
        eliminatedVars: 'B (0 in col 01, 1 in col 11)',
        keptVars: 'A stays 1 (row 1), C stays 1 (cols 01 & 11)',
        explanation:
          'Cell m5 sits alone in row A=1, col BC=01. Instead of leaving m5 as a 1-cell island (A·B\'·C, 3 literals), overlap it with its neighbor m7 (col BC=11) to form a 2-cell pair that drops B and gives A·C.',
      },
    ],
    walkthrough: [
      'Step 1 — Fill the 2×4 grid using Gray code columns (00, 01, 11, 10): place 1s in m2 (0,10), m3 (0,11), m5 (1,01), m6 (1,10), and m7 (1,11).',
      'Step 2 — Spot the largest power-of-2 block: the rightmost 2×2 block {m3, m2, m7, m6} holds four 1s. A group of 4 in a 3-variable map eliminates 2 variables, leaving just B.',
      'Step 3 — Cover the remaining uncovered 1 at m5: it sits right next to m7 in row A=1. Loop {m5, m7} together (overlapping m7 is legal and strictly better!) to get A·C.',
      'Step 4 — All five 1s are covered. OR the two terms together: Y = B + A·C (reduced from 5 three-literal minterms down to 2 gates / 3 literals).',
    ],
    keyTakeaway:
      'Never leave a 1 isolated if it has an adjacent 1 you can overlap with — reusing m7 turned a 3-literal term (A·B\'·C) into a 2-literal term (A·C).',
  },
  {
    id: 'kmap-moderate-wrap',
    difficulty: 'moderate',
    title: 'Moderate: 3-Variable Map — Left-to-Right Edge Wrap-Around',
    subtitle: 'See how opposite edges of a K-Map are physically adjacent in Gray code and collapse 4 edge cells into 1 literal.',
    variables: ['A', 'B', 'C'],
    rowVars: ['A'],
    colVars: ['B', 'C'],
    rowGray: [0, 1],
    colGray: [0, 1, 3, 2],
    rowLabels: ['0', '1'],
    colLabels: ['00', '01', '11', '10'],
    minterms: [0, 2, 4, 5, 6],
    inputExpr: "Y = A'*B'*C' + A'*B*C' + A*B'*C' + A*B'*C + A*B*C'",
    inputLatex:
      'Y = \\overline{A}\\cdot \\overline{B}\\cdot \\overline{C} + \\overline{A}\\cdot B\\cdot \\overline{C} + A\\cdot \\overline{B}\\cdot \\overline{C} + A\\cdot \\overline{B}\\cdot C + A\\cdot B\\cdot \\overline{C}',
    resultLatex: 'Y = \\overline{C} + A \\cdot \\overline{B}',
    groups: [
      {
        id: 'mod-g1',
        label: 'Group 1 (wrap-around 2×2 quad)',
        cells: [0, 2, 4, 6],
        termLatex: '\\overline{C}',
        colorIndex: 0,
        eliminatedVars: 'A (rows 0 & 1) and B (0 in col 00, 1 in col 10)',
        keptVars: 'C stays 0 across both outer columns (00 & 10)',
        explanation:
          'Column 00 (left edge) and column 10 (right edge) differ ONLY in bit B. Rolling the map into a cylinder merges {m0, m4} and {m2, m6} into a single 4-cell quad where only C=0 stays constant → C\'.',
      },
      {
        id: 'mod-g2',
        label: 'Group 2 (1×2 pair, overlaps m4)',
        cells: [4, 5],
        termLatex: 'A \\cdot \\overline{B}',
        colorIndex: 1,
        eliminatedVars: 'C (0 in col 00, 1 in col 01)',
        keptVars: 'A stays 1 (row 1), B stays 0 (cols 00 & 01)',
        explanation:
          'Only m5 remains uncovered. Pair it with its left neighbor m4 (already covered by Group 1) across row A=1, cols 00 & 01. Variable C flips 0→1 and drops, leaving A·B\'.',
      },
    ],
    walkthrough: [
      'Step 1 — Plot the 1s at m0 (0,00), m2 (0,10), m4 (1,00), m5 (1,01), and m6 (1,10). Notice the vertical columns of 1s sitting on the far-left and far-right borders!',
      'Step 2 — Check edge wrap-around: column 00 and column 10 differ only in B (C is 0 in both). Imagine taping the left and right edges together — {m0, m4, m2, m6} becomes one 2×2 quad = C\'.',
      'Step 3 — Without wrap-around, you would have needed TWO separate pairs (B\'·C\' and B·C\'), costing an extra gate. Wrap-around merges them into one literal.',
      'Step 4 — Cover the single leftover 1 at m5 by pairing it with m4 → A·B\'. Combine: Y = C\' + A·B\'.',
    ],
    keyTakeaway:
      'Always scan the far-left + far-right columns and the top + bottom rows together — opposite edges are adjacent neighbors in Gray code.',
  },
  {
    id: 'kmap-difficult-4var',
    difficulty: 'difficult',
    title: 'Difficult: 4-Variable Map — 4-Corner Torus Wrap & Redundant Prime-Implicant Trap',
    subtitle: 'Master 4×4 maps with all-4-corner wrap-around, overlapping essential quads, and spotting a tempting loop you must NOT include.',
    variables: ['A', 'B', 'C', 'D'],
    rowVars: ['A', 'B'],
    colVars: ['C', 'D'],
    rowGray: [0, 1, 3, 2],
    colGray: [0, 1, 3, 2],
    rowLabels: ['00', '01', '11', '10'],
    colLabels: ['00', '01', '11', '10'],
    minterms: [0, 2, 5, 6, 7, 8, 10, 13, 14, 15],
    inputExpr:
      "Y = A'*B'*C'*D' + A'*B'*C*D' + A'*B*C'*D + A'*B*C*D' + A'*B*C*D + A*B'*C'*D' + A*B'*C*D' + A*B*C'*D + A*B*C*D' + A*B*C*D",
    inputLatex: 'Y = \\sum m(0, 2, 5, 6, 7, 8, 10, 13, 14, 15)',
    resultLatex: 'Y = \\overline{B}\\cdot \\overline{D} + B\\cdot D + B\\cdot C',
    groups: [
      {
        id: 'diff-g1',
        label: 'Essential 1 (4-corner wrap quad)',
        cells: [0, 2, 8, 10],
        termLatex: '\\overline{B} \\cdot \\overline{D}',
        colorIndex: 0,
        eliminatedVars: 'A (rows 00 & 10) and C (cols 00 & 10)',
        keptVars: 'B stays 0 (rows 00 & 10), D stays 0 (cols 00 & 10)',
        explanation:
          'All 4 corners {m0, m2, m8, m10} wrap both horizontally AND vertically (torus topology) into a single 2×2 quad! It is ESSENTIAL because m0 and m8 cannot belong to any other 4-cell group.',
      },
      {
        id: 'diff-g2',
        label: 'Essential 2 (center 2×2 quad)',
        cells: [5, 7, 13, 15],
        termLatex: 'B \\cdot D',
        colorIndex: 1,
        eliminatedVars: 'A (rows 01 & 11) and C (cols 01 & 11)',
        keptVars: 'B stays 1 (rows 01 & 11), D stays 1 (cols 01 & 11)',
        explanation:
          'Rows 01 & 11 with columns 01 & 11 form a central 2×2 quad {m5, m7, m13, m15}. It is ESSENTIAL because m5 and m13 are not part of any other maximal group.',
      },
      {
        id: 'diff-g3',
        label: 'Essential 3 (right 2×2 quad)',
        cells: [6, 7, 14, 15],
        termLatex: 'B \\cdot C',
        colorIndex: 2,
        eliminatedVars: 'A (rows 01 & 11) and D (cols 11 & 10)',
        keptVars: 'B stays 1 (rows 01 & 11), C stays 1 (cols 11 & 10)',
        explanation:
          'Rows 01 & 11 with columns 11 & 10 form {m6, m7, m14, m15} = B·C, overlapping m7 & m15. Wait — could m6 & m14 be covered by column 10 instead? Check the trap below!',
      },
      {
        id: 'diff-trap',
        label: 'Redundant Trap (col 10 — DO NOT ADD!)',
        cells: [2, 6, 10, 14],
        termLatex: 'C \\cdot \\overline{D}',
        colorIndex: 3,
        eliminatedVars: 'A and B (all 4 rows)',
        keptVars: 'C stays 1, D stays 0 (column 10)',
        explanation:
          'Column 10 {m2, m6, m10, m14} is a valid 4-cell prime implicant (C·D\'), and it can cover m6 & m14 as an ALTERNATIVE to B·C — giving an equally minimal solution Y = B\'·D\' + B·D + C·D\'! The classic mistake is including BOTH B·C and C·D\' (adding a redundant 4th gate when all ten 1s are already covered by 3 groups).',
        isRedundantTrap: true,
      },
    ],
    walkthrough: [
      'Step 1 — Fill the 4×4 Gray-code map (rows AB = 00, 01, 11, 10; cols CD = 00, 01, 11, 10). Pay special attention: m8–m11 live on the BOTTOM row (10), while m12–m15 live on row 3 (11).',
      'Step 2 — Check the 4 corners first! Cells m0 (00,00), m2 (00,10), m8 (10,00), and m10 (10,10) all contain 1. Wrapping top↔bottom and left↔right joins all four into one 2×2 quad: B\'·D\'. Because m0 and m8 have no other quad, this group is ESSENTIAL.',
      'Step 3 — Find the second essential quad: m5 (01,01) and m13 (11,01) can only belong to the center 2×2 quad {m5, m7, m13, m15} → B·D.',
      'Step 4 — Check what 1s remain uncovered: only m6 (01,10) and m14 (11,10). Notice TWO valid 4-cell quads can cover both of them: {m6, m7, m14, m15} = B·C OR the entire right column {m2, m6, m10, m14} = C·D\'.',
      'Step 5 — Avoid the redundant-group trap! Pick EITHER B·C OR C·D\' (never both). Both yield an optimal 3-term, 6-literal cover: Y = B\'·D\' + B·D + B·C (or B\'·D\' + B·D + C·D\').',
    ],
    keyTakeaway:
      'On 4-variable K-Maps: (1) always check all 4 corners together, (2) lock in essential prime implicants first, and (3) stop as soon as every 1 is covered — a valid-looking extra loop whose cells are already covered is redundant.',
  },
];
