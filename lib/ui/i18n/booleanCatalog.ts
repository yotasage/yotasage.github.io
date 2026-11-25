export const en = {
  // Quick example tags
  'boolean.quickEx.consensus': 'Consensus',
  'boolean.quickEx.absorption': 'Distributive',
  'boolean.quickEx.demorgan': 'De Morgan',
  'boolean.quickEx.mux': '4-term collapse',
  'boolean.quickEx.carry': 'Full-adder Cout',
  'boolean.quickEx.factor': 'Multi-level factor',
  'boolean.quickEx.xor-detect': 'XOR synthesis',
  'boolean.quickEx.four-var': '4-var K-Map',

  // Boolean Laws (15)
  'boolean.law.identity.name': 'Identity Law',
  'boolean.law.identity.summary': 'ANDing with 1 or ORing with 0 leaves any Boolean signal unchanged.',
  'boolean.law.identity.theory':
    '1 is the multiplicative identity for AND, and 0 is the additive identity for OR. In hardware, inputs tied to an identity constant can be removed, eliminating the gate altogether.',

  'boolean.law.annulment.name': 'Annulment (Domination) Law',
  'boolean.law.annulment.summary': 'ANDing with 0 forces 0; ORing with 1 forces 1 regardless of A.',
  'boolean.law.annulment.theory':
    'A dominant constant short-circuits the gate output. Any sub-circuit driving the other input becomes dead logic and can be pruned completely.',

  'boolean.law.idempotent.name': 'Idempotent Law',
  'boolean.law.idempotent.summary': 'Repeating the same signal in an AND or OR gate has no effect.',
  'boolean.law.idempotent.theory':
    'Unlike ordinary arithmetic where x + x = 2x and x·x = x², Boolean algebra has only two truth values so repeated operands collapse to a single wire.',

  'boolean.law.complement.name': 'Complement Law',
  'boolean.law.complement.summary': 'A signal AND its inverse is always 0; a signal OR its inverse is always 1.',
  'boolean.law.complement.theory':
    'Because A and ¬A can never be simultaneously true (or simultaneously false), their conjunction is a contradiction (0) and their disjunction is a tautology (1). Watch out in physical circuits: unequal inverter delay can create a brief static glitch on A + ¬A!',

  'boolean.law.double-negation.name': 'Double Negation (Involution)',
  'boolean.law.double-negation.summary': 'Inverting a signal twice restores the original logic value.',
  'boolean.law.double-negation.theory':
    'Two inverters in series cancel logically (though they still add 2·t_pd of propagation delay in a real circuit). Removing double bubbles shrinks both area and delay.',

  'boolean.law.distributive.name': 'Distributive Law',
  'boolean.law.distributive.summary':
    'AND distributes over OR — and uniquely in Boolean algebra, OR also distributes over AND.',
  'boolean.law.distributive.theory':
    'The second form A + BC = (A + B)(A + C) has no counterpart in elementary arithmetic. Factoring common literals with the distributive law reduces literal and gate counts in multi-level logic.',

  'boolean.law.absorption.name': 'Absorption Law',
  'boolean.law.absorption.summary':
    'A broader term completely covers and absorbs any stricter sub-term containing it.',
  'boolean.law.absorption.theory':
    'Proof: A + AB = A(1 + B) = A·1 = A. Whenever A is 1, AB cannot make the OR output any higher; whenever A is 0, AB is also 0.',

  'boolean.law.elimination.name': 'Redundancy (Complement Absorption)',
  'boolean.law.elimination.summary':
    'A negated copy of an already-present term is redundant and can be dropped.',
  'boolean.law.elimination.theory':
    'By OR-over-AND distribution: A + ¬A·B = (A + ¬A)(A + B) = 1·(A + B) = A + B. Removing the negated literal saves an inverter and narrows the AND gate.',

  'boolean.law.adjacency.name': 'Combining (Adjacency) Law',
  'boolean.law.adjacency.summary':
    'Two terms that differ in only one variable merge and eliminate that variable.',
  'boolean.law.adjacency.theory':
    'This is the exact algebraic foundation of both Karnaugh map pairing and Quine-McCluskey tabular minimization: adjacent minterms combine to remove one literal per doubling of group size.',

  'boolean.law.demorgan.name': "De Morgan's Theorems",
  'boolean.law.demorgan.summary':
    'Break the bar, change the sign: inverting an AND gives OR of inverses, and vice versa.',
  'boolean.law.demorgan.theory':
    "De Morgan's laws let you push negations inward toward primary inputs (to reach SOP/POS normal forms) or convert any AND/OR/NOT network into purely NAND or purely NOR universal gates.",

  'boolean.law.nand-nor-universal.name': 'NAND / NOR Universal Synthesis',
  'boolean.law.nand-nor-universal.summary':
    'Every 2-level SOP maps directly to NAND-NAND; every 2-level POS maps to NOR-NOR.',
  'boolean.law.nand-nor-universal.theory':
    'In CMOS silicon, NAND and NOR gates are inverting and require fewer transistors (4T for 2-input NAND) than non-inverting AND/OR gates (6T). Double-negating an SOP expression turns both levels into NAND gates.',

  'boolean.law.consensus.name': 'Consensus Theorem',
  'boolean.law.consensus.summary': 'The consensus term BC is logically redundant given AB and ¬A·C.',
  'boolean.law.consensus.theory':
    'When B = 1 and C = 1, either A = 1 (making AB = 1) or A = 0 (making ¬A·C = 1), so BC is always already covered. Note: hardware designers sometimes intentionally KEEP the consensus term BC to prevent static-1 timing hazards when A switches!',

  'boolean.law.xor-xnor.name': 'XOR & XNOR Identities',
  'boolean.law.xor-xnor.summary':
    'Recognize parity (XOR) and equivalence (XNOR) patterns from SOP expansions.',
  'boolean.law.xor-xnor.theory':
    'Two-level SOP minimizers cannot express XOR compactly (an n-input parity function needs 2^(n-1) product terms in SOP!). Recognizing XOR/XNOR patterns in heuristic multi-level search dramatically shrinks adder and parity circuits.',

  'boolean.law.qm-minimization.name': 'Quine-McCluskey Exact Minimization',
  'boolean.law.qm-minimization.summary':
    'Tabular exact algorithm guaranteeing minimum two-level SOP or POS gate cover.',
  'boolean.law.qm-minimization.theory':
    'Quine-McCluskey groups minterms by popcount, iteratively merges adjacent implicants differing by one bit to find all Prime Implicants, extracts Essential Prime Implicants, and solves the remaining cover with Petrick’s method.',

  'boolean.law.factoring.name': 'Multi-Level Common Factoring',
  'boolean.law.factoring.summary':
    'Extracts shared literals across product terms to reduce literal count and fan-in.',
  'boolean.law.factoring.theory':
    'While 2-level SOP minimizes logic depth (delay), factoring common kernels reduces total literal and transistor count by sharing logic across branches—trading a small increase in depth for a smaller circuit.',

  // Boolean Theory Topics (4)
  'boolean.theory.canonical-sop-pos.title': 'Canonical Forms: Minterms (SOP) & Maxterms (POS)',
  'boolean.theory.canonical-sop-pos.summary':
    'Every Boolean function has a unique truth table, which can be written directly as either a Sum of Products (minterms where Y = 1) or a Product of Sums (maxterms where Y = 0).',
  'boolean.theory.canonical-sop-pos.d0':
    'A minterm is an AND term containing every input variable (either true or complemented) that evaluates to 1 for exactly one truth-table row.',
  'boolean.theory.canonical-sop-pos.d1':
    'A maxterm is an OR term containing every input variable that evaluates to 0 for exactly one row; AND-ing all 0-rows defines the same function.',
  'boolean.theory.canonical-sop-pos.d2':
    'Two-level minimization (Karnaugh maps and Quine-McCluskey) merges adjacent minterms/maxterms to produce the fewest possible product or sum terms.',

  'boolean.theory.algebraic-vs-qm-vs-heuristic.title':
    'Simplification Methods: Algebraic vs. Quine-McCluskey vs. Heuristic',
  'boolean.theory.algebraic-vs-qm-vs-heuristic.summary':
    'Different simplification algorithms optimize different objectives — human-readable derivation steps, guaranteed minimal 2-level gates, or compact multi-level factored circuits.',
  'boolean.theory.algebraic-vs-qm-vs-heuristic.d0':
    'Algebraic Laws applies local identities (absorption, idempotence, De Morgan, consensus) one step at a time. Every step is easy to follow by hand, though local rewrites can miss global 2-level covers.',
  'boolean.theory.algebraic-vs-qm-vs-heuristic.d1':
    'Quine-McCluskey (QM) + Petrick’s Method is a programmatic Karnaugh map that exhaustively finds all prime implicants and guarantees a minimum-cost 2-level SOP or POS cover.',
  'boolean.theory.algebraic-vs-qm-vs-heuristic.d2':
    'Heuristic Multi-Level Search goes beyond flat 2-level forms: Low effort applies single-literal factoring, Medium adds recursive factoring and 2-input XOR/XNOR recognition, and High adds shared-kernel bi-factoring and global n-variable parity detection.',

  'boolean.theory.universal-gates.title': 'Universal Gates (NAND-Only & NOR-Only Synthesis)',
  'boolean.theory.universal-gates.summary':
    'Both NAND and NOR are functionally complete — any digital circuit can be constructed using only NAND gates or only NOR gates, which simplifies CMOS silicon and standard-cell libraries.',
  'boolean.theory.universal-gates.d0':
    'In static CMOS, NAND and NOR gates require fewer transistors and switch faster than non-inverting AND/OR gates (which are physically built as NAND/NOR followed by an inverter).',
  'boolean.theory.universal-gates.d1':
    'Tie both inputs of a 2-input NAND (or NOR) together to create a NOT gate. Apply De Morgan’s laws to turn OR-of-ANDs into NAND-of-NANDs.',
  'boolean.theory.universal-gates.d2':
    'Sharing intermediate gates saves silicon: XOR requires 5 naive NAND gates from SOP, but only 4 NAND2 gates when T = NAND(A, B) is shared.',

  'boolean.theory.timing-hazards-dff.title':
    'Propagation Delay, Static Hazards & Synchronous D Flip-Flops',
  'boolean.theory.timing-hazards-dff.summary':
    'Real logic gates take nanoseconds to switch. Unequal path delays create brief unintended pulses (glitches/hazards), which synchronous systems eliminate by registering inputs and outputs with D Flip-Flops.',
  'boolean.theory.timing-hazards-dff.d0':
    'Critical path delay (t_pd,crit) is the longest sum of gate delays from any primary input to any output; it sets the maximum safe clock frequency f_max = 1 / T_clk,min.',
  'boolean.theory.timing-hazards-dff.d1':
    'A Static-1 hazard occurs when two adjacent 1-cells in a K-map are covered by separate product terms (e.g., 2:1 MUX S·A + S̄·B): adding the redundant consensus term A·B bridges the transition and eliminates the glitch.',
  'boolean.theory.timing-hazards-dff.d2':
    'Wrapping combinational logic between rising-edge DFFs ensures glitches settle before the next clock edge, provided setup slack (T_clk − T_clk,min) remains non-negative.',
} as const;

export const nb: Record<keyof typeof en, string> = {
  // Quick example tags
  'boolean.quickEx.consensus': 'Konsensus',
  'boolean.quickEx.absorption': 'Distributiv',
  'boolean.quickEx.demorgan': 'De Morgan',
  'boolean.quickEx.mux': '4-ledds kollaps',
  'boolean.quickEx.carry': 'Fulladderer Cout',
  'boolean.quickEx.factor': 'Flertrinns faktorisering',
  'boolean.quickEx.xor-detect': 'XOR-syntese',
  'boolean.quickEx.four-var': '4-var K-kart',

  // Boolean Laws (15)
  'boolean.law.identity.name': 'Identitetsloven',
  'boolean.law.identity.summary': 'AND med 1 eller OR med 0 lar ethvert boolsk signal forbli uendret.',
  'boolean.law.identity.theory':
    '1 er den multiplikative identiteten for AND, og 0 er den additive identiteten for OR. I maskinvare kan innganger koblet til en identitetskonstant fjernes, slik at hele porten bortfaller.',

  'boolean.law.annulment.name': 'Annulerings- (dominans-) loven',
  'boolean.law.annulment.summary': 'AND med 0 tvinger 0; OR med 1 tvinger 1 uavhengig av A.',
  'boolean.law.annulment.theory':
    'En dominerende konstant låser portutgangen. Enhver delkrets som driver den andre inngangen blir død logikk og kan fjernes helt.',

  'boolean.law.idempotent.name': 'Idempotensloven',
  'boolean.law.idempotent.summary': 'Å gjenta samme signal i en AND- eller OR-port har ingen effekt.',
  'boolean.law.idempotent.theory':
    'I motsetning til vanlig aritmetikk der x + x = 2x og x·x = x², har boolsk algebra bare to sannhetsverdier, så gjentatte operander kollapser til én ledning.',

  'boolean.law.complement.name': 'Komplementloven',
  'boolean.law.complement.summary':
    'Et signal AND sin invers er alltid 0; et signal OR sin invers er alltid 1.',
  'boolean.law.complement.theory':
    'Fordi A og ¬A aldri kan være sanne (eller usanne) samtidig, er konjunksjonen alltid 0 og disjunksjonen alltid 1. Vær obs i fysiske kretser: ulik forsinkelse i invertereren kan gi en kort statisk glitch på A + ¬A!',

  'boolean.law.double-negation.name': 'Dobbel negasjon (involusjon)',
  'boolean.law.double-negation.summary': 'Å invertere et signal to ganger gjenoppretter opprinnelig logisk verdi.',
  'boolean.law.double-negation.theory':
    'To invertere i serie opphever hverandre logisk (selv om de fortsatt legger til 2·t_pd forplantningsforsinkelse i en ekte krets). Å fjerne doble bobler sparer både areal og forsinkelse.',

  'boolean.law.distributive.name': 'Distributiv lov',
  'boolean.law.distributive.summary':
    'AND distribuerer over OR — og unikt i boolsk algebra distribuerer også OR over AND.',
  'boolean.law.distributive.theory':
    'Den andre formen A + BC = (A + B)(A + C) har ingen parallell i vanlig aritmetikk. Å faktorisere felles literaler med den distributive loven reduserer antall literaler og porter i flertrinnslogikk.',

  'boolean.law.absorption.name': 'Absorpsjonsloven',
  'boolean.law.absorption.summary':
    'Et bredere ledd dekker fullstendig og absorberer ethvert strengere delledd som inneholder det.',
  'boolean.law.absorption.theory':
    'Bevis: A + AB = A(1 + B) = A·1 = A. Når A er 1 kan ikke AB gjøre OR-utgangen høyere; når A er 0 er også AB lik 0.',

  'boolean.law.elimination.name': 'Redundans (komplementabsorpsjon)',
  'boolean.law.elimination.summary':
    'En negert kopi av et ledd som allerede finnes er overflødig og kan strykes.',
  'boolean.law.elimination.theory':
    'Ved OR-over-AND-distribusjon: A + ¬A·B = (A + ¬A)(A + B) = 1·(A + B) = A + B. Å fjerne den negerte literalen sparer en inverter og smalner AND-porten.',

  'boolean.law.adjacency.name': 'Sammenslåings- (naboskaps-) loven',
  'boolean.law.adjacency.summary':
    'To ledd som kun avviker i én variabel slås sammen og eliminerer den variabelen.',
  'boolean.law.adjacency.theory':
    'Dette er selve det algebraiske grunnlaget for både Karnaugh-kart-paring og Quine-McCluskey-minimering: tilstøtende mintermer slås sammen og fjerner én literal hver gang gruppestørrelsen dobles.',

  'boolean.law.demorgan.name': 'De Morgans teoremer',
  'boolean.law.demorgan.summary':
    'Bryt streken, bytt tegnet: å invertere en AND gir OR av inversene, og omvendt.',
  'boolean.law.demorgan.theory':
    'De Morgans lover lar deg skyve negasjoner innover mot primærinngangene (for å nå SOP/POS-normalformer) eller konvertere ethvert AND/OR/NOT-nettverk til rene NAND- eller rene NOR-universalporter.',

  'boolean.law.nand-nor-universal.name': 'NAND- / NOR-universalsyntese',
  'boolean.law.nand-nor-universal.summary':
    'Enhver totrinns SOP tilsvarer direkte NAND-NAND; enhver totrinns POS tilsvarer NOR-NOR.',
  'boolean.law.nand-nor-universal.theory':
    'I CMOS-silisium er NAND- og NOR-porter inverterende og krever færre transistorer (4T for 2-inngangs NAND) enn ikke-inverterende AND/OR-porter (6T). Dobbel negasjon av et SOP-uttrykk gjør begge nivåene om til NAND-porter.',

  'boolean.law.consensus.name': 'Konsensusteoremet',
  'boolean.law.consensus.summary': 'Konsensusleddet BC er logisk overflødig gitt AB og ¬A·C.',
  'boolean.law.consensus.theory':
    'Når B = 1 og C = 1, er enten A = 1 (som gir AB = 1) eller A = 0 (som gir ¬A·C = 1), så BC er alltid dekket fra før. Merk: maskinvaredesignere beholder ofte konsensusleddet BC med vilje for å unngå statisk-1-tidsglitches når A skifter!',

  'boolean.law.xor-xnor.name': 'XOR- og XNOR-identiteter',
  'boolean.law.xor-xnor.summary':
    'Gjenkjenn paritets- (XOR) og ekvivalens- (XNOR) mønstre fra SOP-utvidelser.',
  'boolean.law.xor-xnor.theory':
    'Totrinns SOP-minimerere klarer ikke å uttrykke XOR kompakt (en n-inngangs paritetsfunksjon trenger 2^(n-1) produktledd i SOP!). Å gjenkjenne XOR/XNOR-mønstre i heuristisk flertrinnssøk krymper adderer- og paritetskretser dramatisk.',

  'boolean.law.qm-minimization.name': 'Quine-McCluskey eksakt minimering',
  'boolean.law.qm-minimization.summary':
    'Tabellbasert eksakt algoritme som garanterer minimal totrinns SOP- eller POS-dekning.',
  'boolean.law.qm-minimization.theory':
    'Quine-McCluskey grupperer mintermer etter antall 1-ere, slår sammen naboimplikanter som skiller seg i én bit for å finne alle primimplikanter, trekker ut essensielle primimplikanter og løser resten med Petricks metode.',

  'boolean.law.factoring.name': 'Flertrinns felles faktorisering',
  'boolean.law.factoring.summary':
    'Trekker ut delte literaler på tvers av produktledd for å redusere antall literaler og innganger.',
  'boolean.law.factoring.theory':
    'Mens totrinns SOP minimerer logikkdybde (forsinkelse), reduserer faktorisering av felles kjerner totalt antall literaler og transistorer ved å dele logikk mellom grener — en liten økning i dybde mot en mindre krets.',

  // Boolean Theory Topics (4)
  'boolean.theory.canonical-sop-pos.title': 'Kanoniske former: Mintermer (SOP) og makstermer (POS)',
  'boolean.theory.canonical-sop-pos.summary':
    'Enhver boolsk funksjon har en unik sannhetstabell som kan skrives direkte enten som en sum av produkter (mintermer der Y = 1) eller et produkt av summer (makstermer der Y = 0).',
  'boolean.theory.canonical-sop-pos.d0':
    'En minterm er et AND-ledd som inneholder hver inngangsvariabel (enten sann eller komplementert) og gir 1 for nøyaktig én rad i sannhetstabellen.',
  'boolean.theory.canonical-sop-pos.d1':
    'En maksterm er et OR-ledd som inneholder hver inngangsvariabel og gir 0 for nøyaktig én rad; å ta AND over alle 0-radene definerer samme funksjon.',
  'boolean.theory.canonical-sop-pos.d2':
    'Totrinns minimering (Karnaugh-kart og Quine-McCluskey) slår sammen tilstøtende mintermer/makstermer for å gi færrest mulig produkt- eller sumledd.',

  'boolean.theory.algebraic-vs-qm-vs-heuristic.title':
    'Forenklingsmetoder: Algebraisk vs. Quine-McCluskey vs. Heuristisk',
  'boolean.theory.algebraic-vs-qm-vs-heuristic.summary':
    'Ulike forenklingsalgoritmer optimaliserer ulike mål — lesbare utregningssteg, garantert minimale totrinnsporter eller kompakte flertrinns faktoriserte kretser.',
  'boolean.theory.algebraic-vs-qm-vs-heuristic.d0':
    'Algebraiske lover bruker lokale identiteter (absorpsjon, idempotens, De Morgan, konsensus) ett steg om gangen. Hvert steg er lett å følge for hånd, men lokale omskrivinger kan gå glipp av globale totrinnsdekninger.',
  'boolean.theory.algebraic-vs-qm-vs-heuristic.d1':
    'Quine-McCluskey (QM) + Petricks metode er et programmatisk Karnaugh-kart som finner alle primimplikanter og garanterer minimal totrinns SOP- eller POS-dekning.',
  'boolean.theory.algebraic-vs-qm-vs-heuristic.d2':
    'Heuristisk flertrinnssøk går utover flate totrinnsformer: Lav innsats gjør enkeltliteral-faktorisering, Middels legger til rekursiv faktorisering og 2-inngangs XOR/XNOR-gjenkjenning, og Høy legger til delt kjerne-bifaktorisering og global n-variabel paritetsdeteksjon.',

  'boolean.theory.universal-gates.title': 'Universalporter (kun NAND- og kun NOR-syntese)',
  'boolean.theory.universal-gates.summary':
    'Både NAND og NOR er funksjonelt komplette — enhver digital krets kan bygges med bare NAND-porter eller bare NOR-porter, noe som forenkler CMOS-silisium og standardcellebiblioteker.',
  'boolean.theory.universal-gates.d0':
    'I statisk CMOS krever NAND- og NOR-porter færre transistorer og skifter raskere enn ikke-inverterende AND/OR-porter (som fysisk bygges som NAND/NOR etterfulgt av en inverter).',
  'boolean.theory.universal-gates.d1':
    'Koble begge inngangene på en 2-inngangs NAND (eller NOR) sammen for å lage en NOT-port. Bruk De Morgans lover for å gjøre OR-av-AND om til NAND-av-NAND.',
  'boolean.theory.universal-gates.d2':
    'Deling av mellomporter sparer silisium: XOR krever 5 naive NAND-porter fra SOP, men bare 4 NAND2-porter når T = NAND(A, B) deles.',

  'boolean.theory.timing-hazards-dff.title':
    'Forplantningsforsinkelse, statiske hazards og synkrone D-vipper',
  'boolean.theory.timing-hazards-dff.summary':
    'Ekte logikkporter bruker nanosekunder på å skifte. Ulike stiforsinkelser skaper korte uønskede pulser (glitches/hazards), som synkrone systemer eliminerer ved å registrere innganger og utganger med D-vipper.',
  'boolean.theory.timing-hazards-dff.d0':
    'Kritisk stiforsinkelse (t_pd,crit) er den lengste summen av portforsinkelser fra en primærinngang til en utgang; den bestemmer høyeste sikre klokkefrekvens f_max = 1 / T_clk,min.',
  'boolean.theory.timing-hazards-dff.d1':
    'En statisk-1-hazard oppstår når to tilstøtende 1-celler i et K-kart dekkes av separate produktledd (f.eks. 2:1 MUX S·A + S̄·B): ved å legge til det redundante konsensusleddet A·B bygges bro over overgangen og glitchen forsvinner.',
  'boolean.theory.timing-hazards-dff.d2':
    'Å plassere kombinatorisk logikk mellom flankestyrte D-vipper sikrer at glitches faller til ro før neste klokkeflanke, forutsatt at oppsettsmarginen (T_clk − T_clk,min) forblir ikke-negativ.',
};
