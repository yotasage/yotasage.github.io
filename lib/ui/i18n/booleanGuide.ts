export const en = {
  'boolean.kmapGuide.examplesIntro':
    'Follow the three progressive examples below. Click any group chip to highlight its exact loop on the Karnaugh map, see which variables cancel out, or load the expression directly into the live solver.',
  'boolean.kmapGuide.mapAria': '{title} Karnaugh map',

  // Chapter 1
  'boolean.kmapGuide.ch.gray-code-adjacency.title':
    'Why Karnaugh Maps Work: Gray Code & Single-Bit Adjacency',
  'boolean.kmapGuide.ch.gray-code-adjacency.summary':
    'A Karnaugh map (K-Map) is simply a truth table folded into a 2D grid so that every pair of side-by-side cells differs in exactly ONE input bit. Whenever two adjacent cells both contain 1, the single changing variable drops out immediately.',
  'boolean.kmapGuide.ch.gray-code-adjacency.b0':
    'Notice the 2-bit header order: 00, 01, 11, 10 — NOT standard binary (00, 01, 10, 11). Swapping the last two labels is called Gray code.',
  'boolean.kmapGuide.ch.gray-code-adjacency.b1':
    'Why? Between 01 and 10, BOTH bits flip at once (two variables change), so algebraically they cannot merge. Between 01 and 11 only one bit changes, and between 11 and 10 only one bit changes.',
  'boolean.kmapGuide.ch.gray-code-adjacency.b2':
    'Because 10 and 00 also differ in only 1 bit, the left edge and right edge of the table are mathematically neighbors — and the top edge and bottom edge are neighbors too (like a rolled-up cylinder or donut/torus).',
  'boolean.kmapGuide.ch.gray-code-adjacency.tip':
    'Memory check: any time you draw a 4-column or 4-row K-Map, always write 00 · 01 · 11 · 10 (never 00 · 01 · 10 · 11).',

  // Chapter 2
  'boolean.kmapGuide.ch.building-the-grid.title':
    'How to Build a K-Map from a Truth Table or Equation',
  'boolean.kmapGuide.ch.building-the-grid.summary':
    'Split your input variables across the rows and columns, label every row and column in Gray code, and copy each 1 (and 0) from the truth table into its matching cell.',
  'boolean.kmapGuide.ch.building-the-grid.b0':
    '2 variables (A, B): 2×2 grid (4 cells). Rows = A (0, 1), Columns = B (0, 1).',
  'boolean.kmapGuide.ch.building-the-grid.b1':
    '3 variables (A, B, C): 2×4 grid (8 cells). Rows = A (0, 1), Columns = BC (00, 01, 11, 10). Watch the column order: m2 is on the far right, m3 is third!',
  'boolean.kmapGuide.ch.building-the-grid.b2':
    '4 variables (A, B, C, D): 4×4 grid (16 cells). Rows = AB (00, 01, 11, 10), Columns = CD (00, 01, 11, 10). Row 3 (11) holds m12–m15, and row 4 (10) holds m8–m11.',
  'boolean.kmapGuide.ch.building-the-grid.b3':
    'If you start from an equation rather than a truth table, evaluate which rows make each product term equal 1 and fill those cells with 1 (all other cells are 0).',
  'boolean.kmapGuide.ch.building-the-grid.tip':
    'Writing the tiny minterm index (m0, m1, …) in the corner of each cell makes transferring a truth table almost error-proof.',

  // Chapter 3
  'boolean.kmapGuide.ch.grouping-rules.title': 'The 6 Grouping Rules (Looping the 1s)',
  'boolean.kmapGuide.ch.grouping-rules.summary':
    'To get a minimal Sum of Products (SOP), draw rectangular loops around adjacent 1s. Bigger loops mean simpler terms, and fewer loops mean fewer gates.',
  'boolean.kmapGuide.ch.grouping-rules.b0':
    '1. Only loop 1s (never include a 0 in an SOP group). Every 1 on the map must be covered by at least one loop.',
  'boolean.kmapGuide.ch.grouping-rules.b1':
    '2. Power-of-2 sizes only: a valid group must contain 1, 2, 4, 8, or 16 cells in a solid rectangle (e.g., 1×2, 2×2, 1×4, 2×4). Never loop 3, 5, or 6 cells, and never group diagonally.',
  'boolean.kmapGuide.ch.grouping-rules.b2':
    '3. Wrap around edges: top row wraps to bottom row, left column wraps to right column, and all 4 outer corners of a 4×4 map form a legal 2×2 group of 4!',
  'boolean.kmapGuide.ch.grouping-rules.b3':
    '4. Make every loop as LARGE as possible: a group of 2 eliminates 1 variable, a group of 4 eliminates 2 variables, and a group of 8 eliminates 3 variables.',
  'boolean.kmapGuide.ch.grouping-rules.b4':
    '5. Overlapping is GOOD when it makes a group bigger: reusing an already-covered 1 to turn a 1-cell island into a 2-cell or 4-cell group always reduces literals.',
  'boolean.kmapGuide.ch.grouping-rules.b5':
    '6. Pick Essential Prime Implicants first, and skip redundant loops: if a 1 belongs to only ONE maximal loop, you MUST take that loop. Once every 1 is covered, stop — never add an extra loop whose 1s are already covered.',
  'boolean.kmapGuide.ch.grouping-rules.tip':
    'Need a minimal Product of Sums (POS) instead? Apply the exact same 6 rules to the 0s instead of the 1s, then invert the result with De Morgan’s law!',

  // Chapter 4
  'boolean.kmapGuide.ch.reading-the-equation.title':
    'Reading the Simplified Equation from Your Loops',
  'boolean.kmapGuide.ch.reading-the-equation.summary':
    'Each loop translates directly into one AND product term. Check each variable across all cells inside the loop to see whether it stays constant or changes.',
  'boolean.kmapGuide.ch.reading-the-equation.b0':
    'Look at the row and column headers covered by a single loop.',
  'boolean.kmapGuide.ch.reading-the-equation.b1':
    'If a variable is 1 in EVERY cell of the loop, include it uncomplemented (e.g. A).',
  'boolean.kmapGuide.ch.reading-the-equation.b2':
    "If a variable is 0 in EVERY cell of the loop, include it complemented (e.g. A').",
  'boolean.kmapGuide.ch.reading-the-equation.b3':
    'If a variable is 0 in half the cells and 1 in the other half, it cancels out — drop it completely!',
  'boolean.kmapGuide.ch.reading-the-equation.b4':
    'Finally, OR (+) all the loop terms together. Double-check: a 4-variable map with a 4-cell loop must produce a 2-literal term (4 − log2(4) = 2).',
  'boolean.kmapGuide.ch.reading-the-equation.tip':
    'Sanity check on literal count: in an N-variable K-Map, a group of size 2^k ALWAYS has exactly (N − k) literals.',

  // Worked Example 1 (Easy)
  'boolean.kmapGuide.ex.kmap-easy-3var.title':
    'Easy: 3-Variable Map — Combining a 4-Cell Quad + Overlapping Pair',
  'boolean.kmapGuide.ex.kmap-easy-3var.subtitle':
    'Learn Gray-code placement, 2-variable elimination in a quad, and why overlapping an existing 1 saves literals.',
  'boolean.kmapGuide.ex.kmap-easy-3var.takeaway':
    "Never leave a 1 isolated if it has an adjacent 1 you can overlap with — reusing m7 turned a 3-literal term (A·B'·C) into a 2-literal term (A·C).",
  'boolean.kmapGuide.ex.kmap-easy-3var.w0':
    'Step 1 — Fill the 2×4 grid using Gray code columns (00, 01, 11, 10): place 1s in m2 (0,10), m3 (0,11), m5 (1,01), m6 (1,10), and m7 (1,11).',
  'boolean.kmapGuide.ex.kmap-easy-3var.w1':
    'Step 2 — Spot the largest power-of-2 block: the rightmost 2×2 block {m3, m2, m7, m6} holds four 1s. A group of 4 in a 3-variable map eliminates 2 variables, leaving just B.',
  'boolean.kmapGuide.ex.kmap-easy-3var.w2':
    'Step 3 — Cover the remaining uncovered 1 at m5: it sits right next to m7 in row A=1. Loop {m5, m7} together (overlapping m7 is legal and strictly better!) to get A·C.',
  'boolean.kmapGuide.ex.kmap-easy-3var.w3':
    'Step 4 — All five 1s are covered. OR the two terms together: Y = B + A·C (reduced from 5 three-literal minterms down to 2 gates / 3 literals).',
  'boolean.kmapGuide.grp.easy-g1.label': 'Group 1 (2×2 quad)',
  'boolean.kmapGuide.grp.easy-g1.elim': 'A and C (both span 0 and 1)',
  'boolean.kmapGuide.grp.easy-g1.kept': 'B stays 1 across columns 11 & 10',
  'boolean.kmapGuide.grp.easy-g1.expl':
    'Cells m2, m3, m6, m7 form a 2×2 square of four 1s. Row A covers both 0 and 1 (drops A), and columns 11 & 10 have B=1 while C switches 1→0 (drops C). Only B survives!',
  'boolean.kmapGuide.grp.easy-g2.label': 'Group 2 (1×2 pair, overlaps m7)',
  'boolean.kmapGuide.grp.easy-g2.elim': 'B (0 in col 01, 1 in col 11)',
  'boolean.kmapGuide.grp.easy-g2.kept': 'A stays 1 (row 1), C stays 1 (cols 01 & 11)',
  'boolean.kmapGuide.grp.easy-g2.expl':
    "Cell m5 sits alone in row A=1, col BC=01. Instead of leaving m5 as a 1-cell island (A·B'·C, 3 literals), overlap it with its neighbor m7 (col BC=11) to form a 2-cell pair that drops B and gives A·C.",

  // Worked Example 2 (Moderate)
  'boolean.kmapGuide.ex.kmap-moderate-wrap.title':
    'Moderate: 3-Variable Map — Left-to-Right Edge Wrap-Around',
  'boolean.kmapGuide.ex.kmap-moderate-wrap.subtitle':
    'See how opposite edges of a K-Map are physically adjacent in Gray code and collapse 4 edge cells into 1 literal.',
  'boolean.kmapGuide.ex.kmap-moderate-wrap.takeaway':
    'Always scan the far-left + far-right columns and the top + bottom rows together — opposite edges are adjacent neighbors in Gray code.',
  'boolean.kmapGuide.ex.kmap-moderate-wrap.w0':
    'Step 1 — Plot the 1s at m0 (0,00), m2 (0,10), m4 (1,00), m5 (1,01), and m6 (1,10). Notice the vertical columns of 1s sitting on the far-left and far-right borders!',
  'boolean.kmapGuide.ex.kmap-moderate-wrap.w1':
    "Step 2 — Check edge wrap-around: column 00 and column 10 differ only in B (C is 0 in both). Imagine taping the left and right edges together — {m0, m4, m2, m6} becomes one 2×2 quad = C'.",
  'boolean.kmapGuide.ex.kmap-moderate-wrap.w2':
    "Step 3 — Without wrap-around, you would have needed TWO separate pairs (B'·C' and B·C'), costing an extra gate. Wrap-around merges them into one literal.",
  'boolean.kmapGuide.ex.kmap-moderate-wrap.w3':
    "Step 4 — Cover the single leftover 1 at m5 by pairing it with m4 → A·B'. Combine: Y = C' + A·B'.",
  'boolean.kmapGuide.grp.mod-g1.label': 'Group 1 (wrap-around 2×2 quad)',
  'boolean.kmapGuide.grp.mod-g1.elim': 'A (rows 0 & 1) and B (0 in col 00, 1 in col 10)',
  'boolean.kmapGuide.grp.mod-g1.kept': 'C stays 0 across both outer columns (00 & 10)',
  'boolean.kmapGuide.grp.mod-g1.expl':
    "Column 00 (left edge) and column 10 (right edge) differ ONLY in bit B. Rolling the map into a cylinder merges {m0, m4} and {m2, m6} into a single 4-cell quad where only C=0 stays constant → C'.",
  'boolean.kmapGuide.grp.mod-g2.label': 'Group 2 (1×2 pair, overlaps m4)',
  'boolean.kmapGuide.grp.mod-g2.elim': 'C (0 in col 00, 1 in col 01)',
  'boolean.kmapGuide.grp.mod-g2.kept': 'A stays 1 (row 1), B stays 0 (cols 00 & 01)',
  'boolean.kmapGuide.grp.mod-g2.expl':
    "Only m5 remains uncovered. Pair it with its left neighbor m4 (already covered by Group 1) across row A=1, cols 00 & 01. Variable C flips 0→1 and drops, leaving A·B'.",

  // Worked Example 3 (Difficult)
  'boolean.kmapGuide.ex.kmap-difficult-4var.title':
    'Difficult: 4-Variable Map — 4-Corner Torus Wrap & Redundant Prime-Implicant Trap',
  'boolean.kmapGuide.ex.kmap-difficult-4var.subtitle':
    'Master 4×4 maps with all-4-corner wrap-around, overlapping essential quads, and spotting a tempting loop you must NOT include.',
  'boolean.kmapGuide.ex.kmap-difficult-4var.takeaway':
    'On 4-variable K-Maps: (1) always check all 4 corners together, (2) lock in essential prime implicants first, and (3) stop as soon as every 1 is covered — a valid-looking extra loop whose cells are already covered is redundant.',
  'boolean.kmapGuide.ex.kmap-difficult-4var.w0':
    'Step 1 — Fill the 4×4 Gray-code map (rows AB = 00, 01, 11, 10; cols CD = 00, 01, 11, 10). Pay special attention: m8–m11 live on the BOTTOM row (10), while m12–m15 live on row 3 (11).',
  'boolean.kmapGuide.ex.kmap-difficult-4var.w1':
    "Step 2 — Check the 4 corners first! Cells m0 (00,00), m2 (00,10), m8 (10,00), and m10 (10,10) all contain 1. Wrapping top↔bottom and left↔right joins all four into one 2×2 quad: B'·D'. Because m0 and m8 have no other quad, this group is ESSENTIAL.",
  'boolean.kmapGuide.ex.kmap-difficult-4var.w2':
    'Step 3 — Find the second essential quad: m5 (01,01) and m13 (11,01) can only belong to the center 2×2 quad {m5, m7, m13, m15} → B·D.',
  'boolean.kmapGuide.ex.kmap-difficult-4var.w3':
    "Step 4 — Check what 1s remain uncovered: only m6 (01,10) and m14 (11,10). Notice TWO valid 4-cell quads can cover both of them: {m6, m7, m14, m15} = B·C OR the entire right column {m2, m6, m10, m14} = C·D'.",
  'boolean.kmapGuide.ex.kmap-difficult-4var.w4':
    "Step 5 — Avoid the redundant-group trap! Pick EITHER B·C OR C·D' (never both). Both yield an optimal 3-term, 6-literal cover: Y = B'·D' + B·D + B·C (or B'·D' + B·D + C·D').",
  'boolean.kmapGuide.grp.diff-g1.label': 'Essential 1 (4-corner wrap quad)',
  'boolean.kmapGuide.grp.diff-g1.elim': 'A (rows 00 & 10) and C (cols 00 & 10)',
  'boolean.kmapGuide.grp.diff-g1.kept': 'B stays 0 (rows 00 & 10), D stays 0 (cols 00 & 10)',
  'boolean.kmapGuide.grp.diff-g1.expl':
    'All 4 corners {m0, m2, m8, m10} wrap both horizontally AND vertically (torus topology) into a single 2×2 quad! It is ESSENTIAL because m0 and m8 cannot belong to any other 4-cell group.',
  'boolean.kmapGuide.grp.diff-g2.label': 'Essential 2 (center 2×2 quad)',
  'boolean.kmapGuide.grp.diff-g2.elim': 'A (rows 01 & 11) and C (cols 01 & 11)',
  'boolean.kmapGuide.grp.diff-g2.kept': 'B stays 1 (rows 01 & 11), D stays 1 (cols 01 & 11)',
  'boolean.kmapGuide.grp.diff-g2.expl':
    'Rows 01 & 11 with columns 01 & 11 form a central 2×2 quad {m5, m7, m13, m15}. It is ESSENTIAL because m5 and m13 are not part of any other maximal group.',
  'boolean.kmapGuide.grp.diff-g3.label': 'Essential 3 (right 2×2 quad)',
  'boolean.kmapGuide.grp.diff-g3.elim': 'A (rows 01 & 11) and D (cols 11 & 10)',
  'boolean.kmapGuide.grp.diff-g3.kept': 'B stays 1 (rows 01 & 11), C stays 1 (cols 11 & 10)',
  'boolean.kmapGuide.grp.diff-g3.expl':
    'Rows 01 & 11 with columns 11 & 10 form {m6, m7, m14, m15} = B·C, overlapping m7 & m15. Wait — could m6 & m14 be covered by column 10 instead? Check the trap below!',
  'boolean.kmapGuide.grp.diff-trap.label': 'Redundant Trap (col 10 — DO NOT ADD!)',
  'boolean.kmapGuide.grp.diff-trap.elim': 'A and B (all 4 rows)',
  'boolean.kmapGuide.grp.diff-trap.kept': 'C stays 1, D stays 0 (column 10)',
  'boolean.kmapGuide.grp.diff-trap.expl':
    "Column 10 {m2, m6, m10, m14} is a valid 4-cell prime implicant (C·D'), and it can cover m6 & m14 as an ALTERNATIVE to B·C — giving an equally minimal solution Y = B'·D' + B·D + C·D'! The classic mistake is including BOTH B·C and C·D' (adding a redundant 4th gate when all ten 1s are already covered by 3 groups).",
} as const;

export const nb: Record<keyof typeof en, string> = {
  'boolean.kmapGuide.examplesIntro':
    'Følg de tre eksemplene med stigende vanskelighetsgrad nedenfor. Klikk på en gruppebrikke for å utheve den eksakte løkken på Karnaugh-kartet, se hvilke variabler som faller bort, eller last uttrykket direkte inn i løseren.',
  'boolean.kmapGuide.mapAria': '{title} Karnaugh-kart',

  // Chapter 1
  'boolean.kmapGuide.ch.gray-code-adjacency.title':
    'Hvorfor Karnaugh-kart fungerer: Gray-kode og én-bits naboskap',
  'boolean.kmapGuide.ch.gray-code-adjacency.summary':
    'Et Karnaugh-kart (K-kart) er rett og slett en sannhetstabell brettet inn i et 2D-rutenett slik at hvert nabopar av celler skiller seg i nøyaktig ÉN inngangsbit. Når to naboceller begge inneholder 1, faller den ene variabelen som endrer seg bort umiddelbart.',
  'boolean.kmapGuide.ch.gray-code-adjacency.b0':
    'Legg merke til 2-bit overskriftsrekkefølgen: 00, 01, 11, 10 — IKKE vanlig binær (00, 01, 10, 11). Å bytte om de to siste kalles Gray-kode.',
  'boolean.kmapGuide.ch.gray-code-adjacency.b1':
    'Hvorfor? Mellom 01 og 10 skifter BEGGE bitene samtidig (to variabler endrer seg), så de kan ikke slås sammen algebraisk. Mellom 01 og 11 endres kun én bit, og mellom 11 og 10 endres også kun én bit.',
  'boolean.kmapGuide.ch.gray-code-adjacency.b2':
    'Fordi 10 og 00 også bare skiller seg i 1 bit, er venstre og høyre kant matematiske naboer — og øvre og nedre kant er også naboer (som en sammenrullet sylinder eller smultring/torus).',
  'boolean.kmapGuide.ch.gray-code-adjacency.tip':
    'Huskeregel: hver gang du tegner et K-kart med 4 kolonner eller 4 rader, skriv alltid 00 · 01 · 11 · 10 (aldri 00 · 01 · 10 · 11).',

  // Chapter 2
  'boolean.kmapGuide.ch.building-the-grid.title':
    'Hvordan bygge et K-kart fra en sannhetstabell eller ligning',
  'boolean.kmapGuide.ch.building-the-grid.summary':
    'Fordel inngangsvariablene på rader og kolonner, merk hver rad og kolonne i Gray-kode, og kopier hver 1 (og 0) fra sannhetstabellen inn i riktig celle.',
  'boolean.kmapGuide.ch.building-the-grid.b0':
    '2 variabler (A, B): 2×2-rutenett (4 celler). Rader = A (0, 1), kolonner = B (0, 1).',
  'boolean.kmapGuide.ch.building-the-grid.b1':
    '3 variabler (A, B, C): 2×4-rutenett (8 celler). Rader = A (0, 1), kolonner = BC (00, 01, 11, 10). Pass på kolonnerekkefølgen: m2 ligger helt til høyre, m3 er nummer tre!',
  'boolean.kmapGuide.ch.building-the-grid.b2':
    '4 variabler (A, B, C, D): 4×4-rutenett (16 celler). Rader = AB (00, 01, 11, 10), kolonner = CD (00, 01, 11, 10). Rad 3 (11) holder m12–m15, og rad 4 (10) holder m8–m11.',
  'boolean.kmapGuide.ch.building-the-grid.b3':
    'Hvis du starter fra en ligning i stedet for en sannhetstabell, finn hvilke rader som gjør hvert produktledd lik 1 og fyll disse cellene med 1 (alle andre celler blir 0).',
  'boolean.kmapGuide.ch.building-the-grid.tip':
    'Å skrive den lille minterm-indeksen (m0, m1, …) i hjørnet av hver celle gjør overføringen fra sannhetstabell nesten feilsikker.',

  // Chapter 3
  'boolean.kmapGuide.ch.grouping-rules.title': 'De 6 grupperingsreglene (ringe inn 1-erne)',
  'boolean.kmapGuide.ch.grouping-rules.summary':
    'For å få en minimal sum av produkter (SOP), tegn rektangulære løkker rundt tilstøtende 1-ere. Større løkker gir enklere ledd, og færre løkker gir færre porter.',
  'boolean.kmapGuide.ch.grouping-rules.b0':
    '1. Ring bare inn 1-ere (ta aldri med en 0 i en SOP-gruppe). Hver 1 på kartet må dekkes av minst én løkke.',
  'boolean.kmapGuide.ch.grouping-rules.b1':
    '2. Kun toerpotens-størrelser: en gyldig gruppe må inneholde 1, 2, 4, 8 eller 16 celler i et sammenhengende rektangel (f.eks. 1×2, 2×2, 1×4, 2×4). Ring aldri inn 3, 5 eller 6 celler, og grupper aldri diagonalt.',
  'boolean.kmapGuide.ch.grouping-rules.b2':
    '3. Brett rundt kanter: øverste rad møter nederste rad, venstre kolonne møter høyre kolonne, og alle 4 ytterhjørner i et 4×4-kart utgjør en gyldig 2×2-gruppe på 4!',
  'boolean.kmapGuide.ch.grouping-rules.b3':
    '4. Gjør hver løkke så STOR som mulig: en gruppe på 2 eliminerer 1 variabel, en gruppe på 4 eliminerer 2 variabler, og en gruppe på 8 eliminerer 3 variabler.',
  'boolean.kmapGuide.ch.grouping-rules.b4':
    '5. Overlapp er BRA når det gjør en gruppe større: å gjenbruke en allerede dekket 1 for å gjøre en 1-celle-øy til en 2- eller 4-cellegruppe reduserer alltid antall literaler.',
  'boolean.kmapGuide.ch.grouping-rules.b5':
    '6. Velg essensielle primimplikanter først, og dropp overflødige løkker: hvis en 1 bare tilhører ÉN maksimal løkke, MÅ du ta den. Så snart alle 1-ere er dekket, stopp — legg aldri til en ekstra løkke der alle 1-erne allerede er dekket.',
  'boolean.kmapGuide.ch.grouping-rules.tip':
    'Trenger du et minimalt produkt av summer (POS) i stedet? Bruk nøyaktig de samme 6 reglene på 0-erne i stedet for 1-erne, og inverter svaret med De Morgans lov!',

  // Chapter 4
  'boolean.kmapGuide.ch.reading-the-equation.title':
    'Lese av den forenklede ligningen fra løkkene dine',
  'boolean.kmapGuide.ch.reading-the-equation.summary':
    'Hver løkke oversettes direkte til ett AND-produktledd. Sjekk hver variabel på tvers av alle celler inne i løkken for å se om den holder seg konstant eller endrer seg.',
  'boolean.kmapGuide.ch.reading-the-equation.b0':
    'Se på rad- og kolonneoverskriftene som dekkes av én enkelt løkke.',
  'boolean.kmapGuide.ch.reading-the-equation.b1':
    'Hvis en variabel er 1 i HVER celle i løkken, ta den med ukomplementert (f.eks. A).',
  'boolean.kmapGuide.ch.reading-the-equation.b2':
    "Hvis en variabel er 0 i HVER celle i løkken, ta den med komplementert (f.eks. A').",
  'boolean.kmapGuide.ch.reading-the-equation.b3':
    'Hvis en variabel er 0 i halvparten av cellene og 1 i den andre halvparten, faller den bort — stryk den helt!',
  'boolean.kmapGuide.ch.reading-the-equation.b4':
    'Til slutt tar du OR (+) mellom alle løkkeleddene. Dobbeltsjekk: et 4-variabels kart med en 4-cellers løkke må gi et 2-literals ledd (4 − log2(4) = 2).',
  'boolean.kmapGuide.ch.reading-the-equation.tip':
    'Hurtigsjekk på antall literaler: i et N-variabels K-kart har en gruppe med størrelse 2^k ALLTID nøyaktig (N − k) literaler.',

  // Worked Example 1 (Easy)
  'boolean.kmapGuide.ex.kmap-easy-3var.title':
    'Enkel: 3-variabels kart — 4-cellers kvartett + overlappende par',
  'boolean.kmapGuide.ex.kmap-easy-3var.subtitle':
    'Lær Gray-kode-plassering, eliminering av 2 variabler i en kvartett og hvorfor overlapp med en eksisterende 1 sparer literaler.',
  'boolean.kmapGuide.ex.kmap-easy-3var.takeaway':
    "La aldri en 1 stå alene hvis den har en nabo-1 du kan overlappe med — å gjenbruke m7 gjorde et 3-literals ledd (A·B'·C) til et 2-literals ledd (A·C).",
  'boolean.kmapGuide.ex.kmap-easy-3var.w0':
    'Steg 1 — Fyll ut 2×4-rutenettet med Gray-kode-kolonner (00, 01, 11, 10): sett 1-ere i m2 (0,10), m3 (0,11), m5 (1,01), m6 (1,10) og m7 (1,11).',
  'boolean.kmapGuide.ex.kmap-easy-3var.w1':
    'Steg 2 — Finn den største toerpotens-blokken: 2×2-blokken lengst til høyre {m3, m2, m7, m6} har fire 1-ere. En gruppe på 4 i et 3-variabels kart eliminerer 2 variabler og gir bare B.',
  'boolean.kmapGuide.ex.kmap-easy-3var.w2':
    'Steg 3 — Dekk den gjenværende udekkede 1-eren i m5: den ligger rett ved m7 på rad A=1. Ring inn {m5, m7} sammen (å overlappe m7 er lovlig og strengt bedre!) for å få A·C.',
  'boolean.kmapGuide.ex.kmap-easy-3var.w3':
    'Steg 4 — Alle fem 1-ere er dekket. Ta OR av de to leddene: Y = B + A·C (redusert fra 5 tre-literals mintermer ned til 2 porter / 3 literaler).',
  'boolean.kmapGuide.grp.easy-g1.label': 'Gruppe 1 (2×2-kvartett)',
  'boolean.kmapGuide.grp.easy-g1.elim': 'A og C (begge spenner over 0 og 1)',
  'boolean.kmapGuide.grp.easy-g1.kept': 'B forblir 1 på tvers av kolonnene 11 og 10',
  'boolean.kmapGuide.grp.easy-g1.expl':
    'Cellene m2, m3, m6, m7 danner et 2×2-kvadrat av fire 1-ere. Rad A dekker både 0 og 1 (fjerner A), og kolonnene 11 og 10 har B=1 mens C skifter 1→0 (fjerner C). Bare B gjenstår!',
  'boolean.kmapGuide.grp.easy-g2.label': 'Gruppe 2 (1×2-par, overlapper m7)',
  'boolean.kmapGuide.grp.easy-g2.elim': 'B (0 i kol 01, 1 i kol 11)',
  'boolean.kmapGuide.grp.easy-g2.kept': 'A forblir 1 (rad 1), C forblir 1 (kol 01 og 11)',
  'boolean.kmapGuide.grp.easy-g2.expl':
    "Celle m5 står alene i rad A=1, kol BC=01. I stedet for å la m5 være en 1-celle-øy (A·B'·C, 3 literaler), overlapper vi den med naboen m7 (kol BC=11) til et 2-celle-par som fjerner B og gir A·C.",

  // Worked Example 2 (Moderate)
  'boolean.kmapGuide.ex.kmap-moderate-wrap.title':
    'Middels: 3-variabels kart — kantovergang fra venstre til høyre',
  'boolean.kmapGuide.ex.kmap-moderate-wrap.subtitle':
    'Se hvordan motsatte kanter på et K-kart er fysiske naboer i Gray-kode og samler 4 kantceller til 1 literal.',
  'boolean.kmapGuide.ex.kmap-moderate-wrap.takeaway':
    'Skann alltid ytterste venstre + ytterste høyre kolonne og øverste + nederste rad sammen — motsatte kanter er naboer i Gray-kode.',
  'boolean.kmapGuide.ex.kmap-moderate-wrap.w0':
    'Steg 1 — Plott 1-erne i m0 (0,00), m2 (0,10), m4 (1,00), m5 (1,01) og m6 (1,10). Legg merke til de loddrette kolonnene av 1-ere på venstre og høyre ytterkant!',
  'boolean.kmapGuide.ex.kmap-moderate-wrap.w1':
    "Steg 2 — Sjekk kantovergang: kolonne 00 og kolonne 10 skiller seg bare i B (C er 0 i begge). Tenk deg at du teiper venstre og høyre kant sammen — {m0, m4, m2, m6} blir én 2×2-kvartett = C'.",
  'boolean.kmapGuide.ex.kmap-moderate-wrap.w2':
    "Steg 3 — Uten kantovergang ville du trengt TO separate par (B'·C' og B·C'), som koster en ekstra port. Kantovergang slår dem sammen til én literal.",
  'boolean.kmapGuide.ex.kmap-moderate-wrap.w3':
    "Steg 4 — Dekk den ene gjenværende 1-eren i m5 ved å pare den med m4 → A·B'. Slå sammen: Y = C' + A·B'.",
  'boolean.kmapGuide.grp.mod-g1.label': 'Gruppe 1 (kantovergang 2×2-kvartett)',
  'boolean.kmapGuide.grp.mod-g1.elim': 'A (rad 0 og 1) og B (0 i kol 00, 1 i kol 10)',
  'boolean.kmapGuide.grp.mod-g1.kept': 'C forblir 0 i begge ytterkolonnene (00 og 10)',
  'boolean.kmapGuide.grp.mod-g1.expl':
    "Kolonne 00 (venstre kant) og kolonne 10 (høyre kant) skiller seg KUN i bit B. Ved å rulle kartet til en sylinder slås {m0, m4} og {m2, m6} sammen til én 4-celle-kvartett der bare C=0 er konstant → C'.",
  'boolean.kmapGuide.grp.mod-g2.label': 'Gruppe 2 (1×2-par, overlapper m4)',
  'boolean.kmapGuide.grp.mod-g2.elim': 'C (0 i kol 00, 1 i kol 01)',
  'boolean.kmapGuide.grp.mod-g2.kept': 'A forblir 1 (rad 1), B forblir 0 (kol 00 og 01)',
  'boolean.kmapGuide.grp.mod-g2.expl':
    "Bare m5 står igjen udekket. Par den med naboen til venstre m4 (allerede dekket av Gruppe 1) på rad A=1, kol 00 og 01. Variabelen C skifter 0→1 og faller bort, og gir A·B'.",

  // Worked Example 3 (Difficult)
  'boolean.kmapGuide.ex.kmap-difficult-4var.title':
    'Vanskelig: 4-variabels kart — 4-hjørners torus-overgang og overflødig primimplikant-felle',
  'boolean.kmapGuide.ex.kmap-difficult-4var.subtitle':
    'Mestre 4×4-kart med 4-hjørners kantovergang, overlappende essensielle kvartetter og å avsløre en fristende løkke du IKKE må ta med.',
  'boolean.kmapGuide.ex.kmap-difficult-4var.takeaway':
    'På 4-variabels K-kart: (1) sjekk alltid alle 4 hjørner sammen, (2) lås essensielle primimplikanter først, og (3) stopp straks hver 1 er dekket — en gyldig ekstra løkke der cellene allerede er dekket er overflødig.',
  'boolean.kmapGuide.ex.kmap-difficult-4var.w0':
    'Steg 1 — Fyll ut 4×4 Gray-kode-kartet (rader AB = 00, 01, 11, 10; kolonner CD = 00, 01, 11, 10). Pass ekstra nøye på: m8–m11 ligger på NEDERSTE rad (10), mens m12–m15 ligger på rad 3 (11).',
  'boolean.kmapGuide.ex.kmap-difficult-4var.w1':
    "Steg 2 — Sjekk de 4 hjørnene først! Cellene m0 (00,00), m2 (00,10), m8 (10,00) og m10 (10,10) har alle 1. Kantovergang topp↔bunn og venstre↔høyre samler alle fire i én 2×2-kvartett: B'·D'. Fordi m0 og m8 ikke tilhører noen annen 4-cellegruppe, er denne ESSENSIELL.",
  'boolean.kmapGuide.ex.kmap-difficult-4var.w2':
    'Steg 3 — Finn den andre essensielle kvartetten: m5 (01,01) og m13 (11,01) kan bare tilhøre den midtre 2×2-kvartetten {m5, m7, m13, m15} → B·D.',
  'boolean.kmapGuide.ex.kmap-difficult-4var.w3':
    "Steg 4 — Sjekk hvilke 1-ere som fortsatt er udekket: bare m6 (01,10) og m14 (11,10). Legg merke til at TO gyldige 4-cellekvartetter kan dekke begge: {m6, m7, m14, m15} = B·C ELLER hele høyre kolonne {m2, m6, m10, m14} = C·D'.",
  'boolean.kmapGuide.ex.kmap-difficult-4var.w4':
    "Steg 5 — Unngå fellen med overflødig gruppe! Velg ENTEN B·C ELLER C·D' (aldri begge). Begge gir en optimal 3-ledds, 6-literals dekning: Y = B'·D' + B·D + B·C (eller B'·D' + B·D + C·D').",
  'boolean.kmapGuide.grp.diff-g1.label': 'Essensiell 1 (4-hjørners kvartett)',
  'boolean.kmapGuide.grp.diff-g1.elim': 'A (rad 00 og 10) og C (kol 00 og 10)',
  'boolean.kmapGuide.grp.diff-g1.kept': 'B forblir 0 (rad 00 og 10), D forblir 0 (kol 00 og 10)',
  'boolean.kmapGuide.grp.diff-g1.expl':
    'Alle 4 hjørner {m0, m2, m8, m10} brettes både horisontalt OG vertikalt (torus-topologi) til én 2×2-kvartett! Den er ESSENSIELL fordi m0 og m8 ikke kan tilhøre noen annen 4-cellegruppe.',
  'boolean.kmapGuide.grp.diff-g2.label': 'Essensiell 2 (midtre 2×2-kvartett)',
  'boolean.kmapGuide.grp.diff-g2.elim': 'A (rad 01 og 11) og C (kol 01 og 11)',
  'boolean.kmapGuide.grp.diff-g2.kept': 'B forblir 1 (rad 01 og 11), D forblir 1 (kol 01 og 11)',
  'boolean.kmapGuide.grp.diff-g2.expl':
    'Rad 01 og 11 med kolonne 01 og 11 danner en midtre 2×2-kvartett {m5, m7, m13, m15}. Den er ESSENSIELL fordi m5 og m13 ikke inngår i noen annen maksimal gruppe.',
  'boolean.kmapGuide.grp.diff-g3.label': 'Essensiell 3 (høyre 2×2-kvartett)',
  'boolean.kmapGuide.grp.diff-g3.elim': 'A (rad 01 og 11) og D (kol 11 og 10)',
  'boolean.kmapGuide.grp.diff-g3.kept': 'B forblir 1 (rad 01 og 11), C forblir 1 (kol 11 og 10)',
  'boolean.kmapGuide.grp.diff-g3.expl':
    'Rad 01 og 11 med kolonne 11 og 10 danner {m6, m7, m14, m15} = B·C, som overlapper m7 og m15. Vent — kunne m6 og m14 vært dekket av kolonne 10 i stedet? Se fellen nedenfor!',
  'boolean.kmapGuide.grp.diff-trap.label': 'Overflødig felle (kol 10 — IKKE LEGG TIL!)',
  'boolean.kmapGuide.grp.diff-trap.elim': 'A og B (alle 4 rader)',
  'boolean.kmapGuide.grp.diff-trap.kept': 'C forblir 1, D forblir 0 (kolonne 10)',
  'boolean.kmapGuide.grp.diff-trap.expl':
    "Kolonne 10 {m2, m6, m10, m14} er en gyldig 4-cellers primimplikant (C·D') og kan dekke m6 og m14 som et ALTERNATIV til B·C — noe som gir en like minimal løsning Y = B'·D' + B·D + C·D'! Den klassiske feilen er å ta med BÅDE B·C og C·D' (en overflødig 4. port når alle ti 1-erne allerede er dekket av 3 grupper).",
};
