export const en = {
  // Curated Examples (8)
  'boolean.curated.effort-3var-parity.title': '3-Input Odd Parity (Effort Level Showcase)',
  'boolean.curated.effort-3var-parity.summary':
    'A classic checkerboard Karnaugh map with zero adjacent minterms. Two-level SOP minimization cannot merge a single cell, making it the cleanest test of Low vs. Medium vs. High effort.',
  'boolean.curated.effort-3var-parity.notice':
    'Switch Search Effort between Low, Medium, and High with Method = Heuristic. Low factors only one literal, Medium detects a 2-variable XOR/XNOR inside a branch, and High discovers the exact 3-input parity gate A ⊕ B ⊕ C.',
  'boolean.curated.effort-3var-parity.n0.label': 'Low effort',
  'boolean.curated.effort-3var-parity.n0.outcome':
    'Single-pass common-literal factoring (still 10+ literals).',
  'boolean.curated.effort-3var-parity.n1.label': 'Medium effort',
  'boolean.curated.effort-3var-parity.n1.outcome':
    'Recursive factoring + 2-variable XOR/XNOR sub-branch synthesis.',
  'boolean.curated.effort-3var-parity.n2.label': 'High effort',
  'boolean.curated.effort-3var-parity.n2.outcome':
    'Global GF(2) parity detection collapses all 4 product terms to A ⊕ B ⊕ C!',

  'boolean.curated.effort-bi-factoring.title': 'Shared-Kernel Bi-Factoring: (A + B) · (C + D)',
  'boolean.curated.effort-bi-factoring.summary':
    'Already minimal as a 2-level Sum-of-Products (8 literals, 5 gates), yet it factors cleanly into two 2-input OR gates feeding one 2-input AND gate (4 literals, 3 gates).',
  'boolean.curated.effort-bi-factoring.notice':
    'Compare Algebraic/QM (stays flat 2-level SOP) against Heuristic Low (factors A only), Medium (factors both A and B separately), and High (extracts shared kernel (C + D) to produce (A + B) · (C + D)).',
  'boolean.curated.effort-bi-factoring.n0.label': 'Quine-McCluskey (2-level)',
  'boolean.curated.effort-bi-factoring.n0.outcome':
    'Guaranteed optimal 2-level SOP: stays A·C + A·D + B·C + B·D (8 literals).',
  'boolean.curated.effort-bi-factoring.n1.label': 'Heuristic · Low',
  'boolean.curated.effort-bi-factoring.n1.outcome':
    'Factors one literal: A·(C + D) + B·C + B·D (7 literals).',
  'boolean.curated.effort-bi-factoring.n2.label': 'Heuristic · High',
  'boolean.curated.effort-bi-factoring.n2.outcome':
    'Kernel bi-factoring extracts (A + B) · (C + D) — cuts literals in half (4 literals, 3 gates)!',

  'boolean.curated.method-4var-kmap.title': '4-Variable K-Map: Algebraic vs. Quine-McCluskey',
  'boolean.curated.method-4var-kmap.summary':
    'Five 4-literal minterms that wrap cleanly on a 4-variable Karnaugh map into two overlapping prime implicants.',
  'boolean.curated.method-4var-kmap.notice':
    'Compare Algebraic (stops at local stepwise merges) with Quine-McCluskey (guaranteed global minimum 2-level cover B̄·D + Ā·C̄·D) and Heuristic (factors out D to produce D · (B̄ + Ā·C̄)). Open the K-Map tab to see the prime implicant loops!',
  'boolean.curated.method-4var-kmap.n0.label': 'Algebraic only',
  'boolean.curated.method-4var-kmap.n0.outcome':
    'Applies local combining/absorption rules step by step without global cover search.',
  'boolean.curated.method-4var-kmap.n1.label': 'Quine-McCluskey',
  'boolean.curated.method-4var-kmap.n1.outcome':
    'Exact prime-implicant cover: B̄·D + Ā·C̄·D (minimal 2-level SOP).',
  'boolean.curated.method-4var-kmap.n2.label': 'Heuristic · Medium',
  'boolean.curated.method-4var-kmap.n2.outcome':
    'Multi-level factored form D · (B̄ + Ā·C̄) saves another literal.',

  'boolean.curated.universal-xor-4nand.title': 'How to Build XOR with Only 4 NAND Gates',
  'boolean.curated.universal-xor-4nand.summary':
    'A classic digital-design puzzle: build an XOR gate using nothing but 2-input NAND gates (e.g. a single 74HC00 quad-NAND IC).',
  'boolean.curated.universal-xor-4nand.notice':
    'With Target Form = NAND-only, the solver synthesizes NAND(NAND(A, T), NAND(B, T)) where T = NAND(A, B) is shared between both middle gates. Open the Circuit tab with gate markings enabled to see all 4 NAND2 gates clearly!',
  'boolean.curated.universal-xor-4nand.n0.label': '4-gate NAND2 topology',
  'boolean.curated.universal-xor-4nand.n0.outcome':
    'Uses 1 shared NAND2(A, B) feeding two NAND2s and one output NAND2 — exactly 4 gates total.',
  'boolean.curated.universal-xor-4nand.n1.label': 'NOR-only equivalent',
  'boolean.curated.universal-xor-4nand.n1.outcome':
    'Builds XOR using 5 NOR2 gates (4-gate XNOR2 plus an inverting NOR2).',

  'boolean.curated.circuit-full-adder.title': '1-Bit Full Adder (Multi-Equation: S and Cout)',
  'boolean.curated.circuit-full-adder.summary':
    'A complete 1-bit binary Full Adder entered as two simultaneous equations. Sum S is 3-input odd parity, and carry-out Cout is the 3-input majority function.',
  'boolean.curated.circuit-full-adder.notice':
    'Both equations simplify together, share the same truth table (showing S and Cout side by side), share input rails & sub-gates in a unified circuit diagram, and export as a combined Verilog/VHDL module! Try switching the Circuit tab to 2-input only mode.',
  'boolean.curated.circuit-full-adder.n0.label': 'Standard multi-input',
  'boolean.curated.circuit-full-adder.n0.outcome':
    'S = A ⊕ B ⊕ Cin and Cout = A·B + B·Cin + A·Cin.',
  'boolean.curated.circuit-full-adder.n1.label': '2-input gates only',
  'boolean.curated.circuit-full-adder.n1.outcome':
    'Decomposes 3-input XOR and 3-input OR into cascaded 2-input gates with clear markings (XOR2, AND2, OR2).',

  'boolean.curated.circuit-half-adder.title': '1-Bit Half Adder (Sum & Carry)',
  'boolean.curated.circuit-half-adder.summary':
    'The simplest multi-output arithmetic block: adds two 1-bit binary digits A and B to produce Sum (XOR) and Carry (AND).',
  'boolean.curated.circuit-half-adder.notice':
    'With Heuristic Medium, S collapses from Ā·B + A·B̄ into A ⊕ B while C stays A · B. Switch to the Truth Table and Circuit tabs to inspect both outputs simultaneously.',

  'boolean.curated.circuit-1bit-comparator.title': '1-Bit Magnitude Comparator (GT, EQ, LT)',
  'boolean.curated.circuit-1bit-comparator.summary':
    'Three simultaneous outputs comparing two 1-bit numbers A and B: Greater Than (A > B), Equal (A = B), and Less Than (A < B).',
  'boolean.curated.circuit-1bit-comparator.notice':
    'Heuristic search recognizes EQ as XNOR (A ⊙ B), while GT and LT share inverted inputs Ā and B̄ cleanly in the combined circuit and truth table.',

  'boolean.curated.timing-mux-hazard.title': '2:1 MUX Static-1 Glitch vs. Consensus Term',
  'boolean.curated.timing-mux-hazard.summary':
    'The classic digital timing paradox: algebraically A·B is redundant (Consensus Theorem), so simplifying removes it — yet removing A·B introduces a real Static-1 glitch when A=1, B=1 and select S transitions!',
  'boolean.curated.timing-mux-hazard.notice':
    'Open the Timing tab to compare the original glitch-free circuit (with consensus term A·B) against the simplified 2-term MUX. Toggle DFF Clocked mode to see how registering the output filters out the combinational glitch.',

  // Gate Reference (8 gates)
  'boolean.gate.BUFFER.name': 'Buffer (Identity)',
  'boolean.gate.BUFFER.summary':
    'Single-input gate that passes the logic level unchanged while restoring signal drive strength and voltage margins.',

  'boolean.gate.NOT.name': 'NOT (Inverter)',
  'boolean.gate.NOT.summary':
    'Single-input inverter that outputs the logical complement of its input (0 becomes 1, 1 becomes 0).',

  'boolean.gate.AND.name': 'AND Gate',
  'boolean.gate.AND.summary':
    'Outputs 1 if and only if all {n} inputs ({vars}) are 1; otherwise outputs 0.',
  'boolean.gate.AND.nandN': 'NAND{n}({vars}) inverted by NOT1',

  'boolean.gate.OR.name': 'OR Gate',
  'boolean.gate.OR.summary':
    'Outputs 1 whenever at least one of the {n} inputs ({vars}) is 1; outputs 0 only when all are 0.',
  'boolean.gate.OR.norN': 'NOR{n}({vars}) inverted by NOT1',

  'boolean.gate.NAND.name': 'NAND Gate (Universal)',
  'boolean.gate.NAND.summary':
    'Inverted {n}-input AND. Outputs 0 only when all {n} inputs are 1. Functionally complete on its own.',
  'boolean.gate.NAND.nandEq': 'NAND{n}({vars}) (1 gate)',
  'boolean.gate.NAND.norEq': 'De Morgan: invert inputs then NOR{n} + NOT1',

  'boolean.gate.NOR.name': 'NOR Gate (Universal)',
  'boolean.gate.NOR.summary':
    'Inverted {n}-input OR. Outputs 1 only when all {n} inputs are 0. Functionally complete on its own.',
  'boolean.gate.NOR.nandEq': 'De Morgan: invert inputs then NAND{n} + NOT1',
  'boolean.gate.NOR.norEq': 'NOR{n}({vars}) (1 gate)',

  'boolean.gate.XOR.name': 'XOR Gate (Odd Parity)',
  'boolean.gate.XOR.summary2':
    'Outputs 1 when an odd number of inputs are 1 (when A and B differ). Core building block of binary adders.',
  'boolean.gate.XOR.summaryN':
    'Odd-parity gate: outputs 1 whenever an odd number of its {n} inputs ({vars}) are 1.',
  'boolean.gate.XOR.nand2': '4 NAND2 gates (shared T = NAND(A, B))',
  'boolean.gate.XOR.nandN': 'Cascade of {blocks} 4-NAND XOR2 blocks ({total} NAND2 gates)',
  'boolean.gate.XOR.nor2': '5 NOR2 gates',
  'boolean.gate.XOR.norN': 'Cascade of {blocks} 5-NOR XOR2 blocks ({total} NOR2 gates)',

  'boolean.gate.XNOR.name': 'XNOR Gate (Even Parity)',
  'boolean.gate.XNOR.summary2':
    'Outputs 1 when both inputs are equal (both 0 or both 1). Used in magnitude comparators and even-parity checkers.',
  'boolean.gate.XNOR.summaryN':
    'Even-parity gate (inverted {n}-input XOR): outputs 1 whenever an even number ({evens}) of inputs are 1.',
  'boolean.gate.XNOR.nand2': '5 NAND2 gates',
  'boolean.gate.XNOR.nandN': 'XOR{n} followed by 1 NAND2 inverter',
  'boolean.gate.XNOR.nor2': '4 NOR2 gates (shared T = NOR(A, B))',
  'boolean.gate.XNOR.norN': 'XOR{n} followed by 1 NOR2 inverter',
} as const;

export const nb: Record<keyof typeof en, string> = {
  // Curated Examples (8)
  'boolean.curated.effort-3var-parity.title': '3-inngangs odde paritet (innsatsnivå-demo)',
  'boolean.curated.effort-3var-parity.summary':
    'Et klassisk sjakkbrett-Karnaugh-kart uten noen tilstøtende mintermer. Totrinns SOP-minimering kan ikke slå sammen en eneste celle, noe som gjør det til den tydeligste testen av Lav vs. Middels vs. Høy innsats.',
  'boolean.curated.effort-3var-parity.notice':
    'Bytt søkeinnsats mellom Lav, Middels og Høy med Metode = Heuristisk. Lav faktoriserer bare én literal, Middels oppdager en 2-variabels XOR/XNOR i en gren, og Høy finner den eksakte 3-inngangs paritetsporten A ⊕ B ⊕ C.',
  'boolean.curated.effort-3var-parity.n0.label': 'Lav innsats',
  'boolean.curated.effort-3var-parity.n0.outcome':
    'Enkel gjennomgang med felles literal-faktorisering (fortsatt 10+ literaler).',
  'boolean.curated.effort-3var-parity.n1.label': 'Middels innsats',
  'boolean.curated.effort-3var-parity.n1.outcome':
    'Rekursiv faktorisering + 2-variabels XOR/XNOR-delgrensyntese.',
  'boolean.curated.effort-3var-parity.n2.label': 'Høy innsats',
  'boolean.curated.effort-3var-parity.n2.outcome':
    'Global GF(2)-paritetsdeteksjon kollapser alle 4 produktledd til A ⊕ B ⊕ C!',

  'boolean.curated.effort-bi-factoring.title': 'Delt kjerne-bifaktorisering: (A + B) · (C + D)',
  'boolean.curated.effort-bi-factoring.summary':
    'Allerede minimal som totrinns sum av produkter (8 literaler, 5 porter), men faktoriserer rent til to 2-inngangs OR-porter inn i én 2-inngangs AND-port (4 literaler, 3 porter).',
  'boolean.curated.effort-bi-factoring.notice':
    'Sammenlign Algebraisk/QM (forblir flat totrinns SOP) mot Heuristisk Lav (faktoriserer kun A), Middels (faktoriserer A og B hver for seg) og Høy (trekker ut den delte kjernen (C + D) og gir (A + B) · (C + D)).',
  'boolean.curated.effort-bi-factoring.n0.label': 'Quine-McCluskey (2-nivå)',
  'boolean.curated.effort-bi-factoring.n0.outcome':
    'Garantert optimal 2-nivås SOP: forblir A·C + A·D + B·C + B·D (8 literaler).',
  'boolean.curated.effort-bi-factoring.n1.label': 'Heuristisk · Lav',
  'boolean.curated.effort-bi-factoring.n1.outcome':
    'Faktoriserer én literal: A·(C + D) + B·C + B·D (7 literaler).',
  'boolean.curated.effort-bi-factoring.n2.label': 'Heuristisk · Høy',
  'boolean.curated.effort-bi-factoring.n2.outcome':
    'Kjerne-bifaktorisering trekker ut (A + B) · (C + D) — halverer antall literaler (4 literaler, 3 porter)!',

  'boolean.curated.method-4var-kmap.title': '4-variabels K-kart: Algebraisk vs. Quine-McCluskey',
  'boolean.curated.method-4var-kmap.summary':
    'Fem 4-literals mintermer som pakkes pent sammen på et 4-variabels Karnaugh-kart i to overlappende primimplikanter.',
  'boolean.curated.method-4var-kmap.notice':
    'Sammenlign Algebraisk (stopper ved lokale stegvise sammenslåinger) med Quine-McCluskey (garantert globalt minimal totrinnsdekning B̄·D + Ā·C̄·D) og Heuristisk (faktoriserer ut D til D · (B̄ + Ā·C̄)). Åpne K-kart-fanen for å se primimplikant-løkkene!',
  'boolean.curated.method-4var-kmap.n0.label': 'Kun algebraisk',
  'boolean.curated.method-4var-kmap.n0.outcome':
    'Bruker lokale sammenslåings- og absorpsjonsregler steg for steg uten globalt dekningssøk.',
  'boolean.curated.method-4var-kmap.n1.label': 'Quine-McCluskey',
  'boolean.curated.method-4var-kmap.n1.outcome':
    'Eksakt primimplikantdekning: B̄·D + Ā·C̄·D (minimal totrinns SOP).',
  'boolean.curated.method-4var-kmap.n2.label': 'Heuristisk · Middels',
  'boolean.curated.method-4var-kmap.n2.outcome':
    'Flertrinns faktorisert form D · (B̄ + Ā·C̄) sparer enda en literal.',

  'boolean.curated.universal-xor-4nand.title': 'Hvordan bygge XOR med bare 4 NAND-porter',
  'boolean.curated.universal-xor-4nand.summary':
    'En klassisk digitalteknikk-gåte: bygg en XOR-port ved kun å bruke 2-inngangs NAND-porter (f.eks. én enkelt 74HC00 quad-NAND-IC).',
  'boolean.curated.universal-xor-4nand.notice':
    'Med Målform = Kun NAND syntetiserer løseren NAND(NAND(A, T), NAND(B, T)) der T = NAND(A, B) deles mellom begge midtportene. Åpne Krets-fanen med portmerking aktivert for å se alle 4 NAND2-portene tydelig!',
  'boolean.curated.universal-xor-4nand.n0.label': '4-ports NAND2-topologi',
  'boolean.curated.universal-xor-4nand.n0.outcome':
    'Bruker 1 delt NAND2(A, B) inn i to NAND2-er og én utgangs-NAND2 — nøyaktig 4 porter totalt.',
  'boolean.curated.universal-xor-4nand.n1.label': 'Kun NOR-ekvivalent',
  'boolean.curated.universal-xor-4nand.n1.outcome':
    'Bygger XOR med 5 NOR2-porter (4-ports XNOR2 pluss én inverterende NOR2).',

  'boolean.curated.circuit-full-adder.title': '1-bit fulladderer (flere ligninger: S og Cout)',
  'boolean.curated.circuit-full-adder.summary':
    'En komplett 1-bit binær fulladderer skrevet som to samtidige ligninger. Summen S er 3-inngangs odde paritet, og mente ut Cout er 3-inngangs flertallsfunksjonen.',
  'boolean.curated.circuit-full-adder.notice':
    'Begge ligningene forenkles sammen, deler sannhetstabell (viser S og Cout side ved side), deler inngangsskinner og delporter i ett felles kretsskjema og eksporteres som en samlet Verilog/VHDL-modul! Prøv å bytte Krets-fanen til kun 2-inngangsporter.',
  'boolean.curated.circuit-full-adder.n0.label': 'Standard flerinngang',
  'boolean.curated.circuit-full-adder.n0.outcome':
    'S = A ⊕ B ⊕ Cin og Cout = A·B + B·Cin + A·Cin.',
  'boolean.curated.circuit-full-adder.n1.label': 'Kun 2-inngangsporter',
  'boolean.curated.circuit-full-adder.n1.outcome':
    'Deler opp 3-inngangs XOR og 3-inngangs OR i kaskadekoblede 2-inngangsporter med tydelig merking (XOR2, AND2, OR2).',

  'boolean.curated.circuit-half-adder.title': '1-bit halvadderer (Sum og mente)',
  'boolean.curated.circuit-half-adder.summary':
    'Den enkleste aritmetiske blokka med flere utganger: legger sammen to 1-bit binære sifre A og B til Sum (XOR) og mente C (AND).',
  'boolean.curated.circuit-half-adder.notice':
    'Med Heuristisk Middels kollapser S fra Ā·B + A·B̄ til A ⊕ B mens C forblir A · B. Bytt til Sannhetstabell- og Krets-fanene for å inspisere begge utgangene samtidig.',

  'boolean.curated.circuit-1bit-comparator.title': '1-bit størrelseskomparator (GT, EQ, LT)',
  'boolean.curated.circuit-1bit-comparator.summary':
    'Tre samtidige utganger som sammenligner to 1-bit tall A og B: Større enn (A > B), Lik (A = B) og Mindre enn (A < B).',
  'boolean.curated.circuit-1bit-comparator.notice':
    'Heuristisk søk gjenkjenner EQ som XNOR (A ⊙ B), mens GT og LT deler inverterte innganger Ā og B̄ ryddig i det samlede kretsskjemaet og sannhetstabellen.',

  'boolean.curated.timing-mux-hazard.title': '2:1 MUX statisk-1-glitch vs. konsensusledd',
  'boolean.curated.timing-mux-hazard.summary':
    'Det klassiske digitale tidsparadokset: algebraisk er A·B overflødig (konsensusteoremet), så forenkling fjerner det — men å fjerne A·B innfører en ekte statisk-1-glitch når A=1, B=1 og velgeren S skifter!',
  'boolean.curated.timing-mux-hazard.notice':
    'Åpne Tidsdiagram-fanen for å sammenligne den opprinnelige glitch-frie kretsen (med konsensusleddet A·B) mot den forenklede 2-ledds MUX-en. Slå på D-vippe klokket modus for å se hvordan registrering av utgangen filtrerer bort den kombinatoriske glitchen.',

  // Gate Reference (8 gates)
  'boolean.gate.BUFFER.name': 'Buffer (identitet)',
  'boolean.gate.BUFFER.summary':
    'En-inngangsport som sender logikknivået uendret videre samtidig som drivstyrke og spenningsmarginer gjenopprettes.',

  'boolean.gate.NOT.name': 'NOT (inverter)',
  'boolean.gate.NOT.summary':
    'En-inngangs inverter som gir ut det logiske komplementet av inngangen (0 blir 1, 1 blir 0).',

  'boolean.gate.AND.name': 'AND-port',
  'boolean.gate.AND.summary':
    'Gir ut 1 hvis og bare hvis alle {n} inngangene ({vars}) er 1; ellers gir den 0.',
  'boolean.gate.AND.nandN': 'NAND{n}({vars}) invertert av NOT1',

  'boolean.gate.OR.name': 'OR-port',
  'boolean.gate.OR.summary':
    'Gir ut 1 når minst én av de {n} inngangene ({vars}) er 1; gir ut 0 bare når alle er 0.',
  'boolean.gate.OR.norN': 'NOR{n}({vars}) invertert av NOT1',

  'boolean.gate.NAND.name': 'NAND-port (universell)',
  'boolean.gate.NAND.summary':
    'Invertert {n}-inngangs AND. Gir ut 0 bare når alle {n} innganger er 1. Funksjonelt komplett alene.',
  'boolean.gate.NAND.nandEq': 'NAND{n}({vars}) (1 port)',
  'boolean.gate.NAND.norEq': 'De Morgan: inverter inngangene, deretter NOR{n} + NOT1',

  'boolean.gate.NOR.name': 'NOR-port (universell)',
  'boolean.gate.NOR.summary':
    'Invertert {n}-inngangs OR. Gir ut 1 bare når alle {n} innganger er 0. Funksjonelt komplett alene.',
  'boolean.gate.NOR.nandEq': 'De Morgan: inverter inngangene, deretter NAND{n} + NOT1',
  'boolean.gate.NOR.norEq': 'NOR{n}({vars}) (1 port)',

  'boolean.gate.XOR.name': 'XOR-port (odde paritet)',
  'boolean.gate.XOR.summary2':
    'Gir ut 1 når et odde antall innganger er 1 (når A og B er ulike). Grunnleggende byggestein i binære adderere.',
  'boolean.gate.XOR.summaryN':
    'Odde-paritetsport: gir ut 1 når et odde antall av de {n} inngangene ({vars}) er 1.',
  'boolean.gate.XOR.nand2': '4 NAND2-porter (delt T = NAND(A, B))',
  'boolean.gate.XOR.nandN': 'Kaskade av {blocks} 4-NAND XOR2-blokker ({total} NAND2-porter)',
  'boolean.gate.XOR.nor2': '5 NOR2-porter',
  'boolean.gate.XOR.norN': 'Kaskade av {blocks} 5-NOR XOR2-blokker ({total} NOR2-porter)',

  'boolean.gate.XNOR.name': 'XNOR-port (like paritet)',
  'boolean.gate.XNOR.summary2':
    'Gir ut 1 når begge inngangene er like (begge 0 eller begge 1). Brukes i størrelseskomparatorer og paritetssjekkere.',
  'boolean.gate.XNOR.summaryN':
    'Like-paritetsport (invertert {n}-inngangs XOR): gir ut 1 når et partall ({evens}) innganger er 1.',
  'boolean.gate.XNOR.nand2': '5 NAND2-porter',
  'boolean.gate.XNOR.nandN': 'XOR{n} etterfulgt av 1 NAND2-inverter',
  'boolean.gate.XNOR.nor2': '4 NOR2-porter (delt T = NOR(A, B))',
  'boolean.gate.XNOR.norN': 'XOR{n} etterfulgt av 1 NOR2-inverter',
};
