export const en = {
  // Workspace tab & cross-navigation
  'boolean.workspace.compare': 'Compare',
  'boolean.compare.openFromSolver': 'Check work / Compare',
  'boolean.compare.openInSimplifier': 'Open in Simplifier',
  'boolean.compare.loadFromSimplifier': 'Load from Simplifier',
  'boolean.compare.loadedFromSimplifier': 'Loaded from Simplifier',

  // Top bar & modes
  'boolean.compare.lead':
    'Check whether two Boolean expressions or truth tables are functionally identical, pinpoint counterexamples, or verify each step of your manual simplification.',
  'boolean.compare.modeLabel': 'Check mode',
  'boolean.compare.mode.pair': 'Compare two',
  'boolean.compare.mode.chain': 'Check work steps',
  'boolean.compare.swap': 'Swap A ↔ B',
  'boolean.compare.presets': 'Try an example',

  // Presets
  'boolean.compare.preset.consensusValid': 'Consensus theorem',
  'boolean.compare.preset.demorganMistake': 'De Morgan sign mistake',
  'boolean.compare.preset.complementTrap': 'XOR vs XNOR (inverse)',
  'boolean.compare.preset.majorityTable': 'Majority truth table vs expr',
  'boolean.compare.preset.chainSignBug': '3-step work (bug at step 2)',
  'boolean.compare.preset.chainValid': '4-step distributive proof',
  'boolean.compare.preset.tagEquivalent': 'equivalent',
  'boolean.compare.preset.tagMistake': 'bug',
  'boolean.compare.preset.tagInverse': 'inverse',
  'boolean.compare.preset.tagTable': 'table ↔ expr',
  'boolean.compare.preset.tagSteps': 'finds error',
  'boolean.compare.preset.tagValidSteps': 'all valid',
  'boolean.compare.presetDesc.consensusValid':
    'Confirms that dropping the redundant consensus term B·C preserves the exact truth table while reducing gates and literals.',
  'boolean.compare.presetDesc.demorganMistake':
    'Catches a classic De Morgan mistake where + was not flipped to ·, surfacing the 2 extra rows and the disagreement region.',
  'boolean.compare.presetDesc.complementTrap':
    'Identifies when a candidate expression is the exact logical inverse (B = A\') across every row.',
  'boolean.compare.presetDesc.majorityTable':
    'Verifies an algebraic 3-input majority formula directly against a hand-entered truth table (with optional don’t-care support).',
  'boolean.compare.presetDesc.chainSignBug':
    'Checks a 3-step manual derivation and pinpoints the exact De Morgan sign slip at Step 2 plus its cascaded effect on Step 3.',
  'boolean.compare.presetDesc.chainValid':
    'Walks through a 4-step distributive expansion and absorption proof, confirming every intermediate line stays equivalent.',

  // Examples tab integration (Simplifier vs Compare tool)
  'boolean.compare.examples.filterAria': 'Filter examples by tool',
  'boolean.compare.examples.tabAll': 'All examples ({count})',
  'boolean.compare.examples.tabSimplifier': 'Simplifier ({count})',
  'boolean.compare.examples.tabCompare': 'Compare tool ({count})',
  'boolean.compare.examples.simplifierSectionTitle': 'Simplifier examples',
  'boolean.compare.examples.compareSectionTitle': 'Compare tool examples',
  'boolean.compare.examples.compareSectionLead':
    'These examples open in the Compare tab (not the Simplifier) — test expression equivalence, truth-table matching, and multi-step work checking.',
  'boolean.compare.examples.toolBadgeCompare': 'Compare tool',
  'boolean.compare.examples.toolBadgeSimplifier': 'Simplifier',
  'boolean.compare.examples.openInCompare': 'Open in Compare',
  'boolean.compare.examples.openInSimplifier': 'Open in Simplifier',
  'boolean.compare.examples.labelStart': 'Start',
  'boolean.compare.examples.labelSteps': '{count} steps',
  'boolean.compare.examples.labelTruthTable': 'Truth table ({vars})',

  // Side A / Side B inputs
  'boolean.compare.sideA': 'Reference (A)',
  'boolean.compare.sideB': 'Candidate (B)',
  'boolean.compare.sourceType.expression': 'Expression',
  'boolean.compare.sourceType.truthTable': 'Truth table',
  'boolean.compare.placeholderA': "e.g. Y = A*B + A'*C + B*C",
  'boolean.compare.placeholderB': "e.g. Y = A*B + A'*C",
  'boolean.compare.exprAriaA': 'Reference Boolean expression A',
  'boolean.compare.exprAriaB': 'Candidate Boolean expression B',
  'boolean.compare.copyToB': 'Copy A → B',
  'boolean.compare.clear': 'Clear',

  // Truth table editor in Compare
  'boolean.compare.tt.varsLabel': 'Variables',
  'boolean.compare.tt.addVar': 'Add variable',
  'boolean.compare.tt.removeVar': 'Remove variable',
  'boolean.compare.tt.pastePlaceholder': 'Paste bitstring (e.g. 00010111 or 0,1,X,1)',
  'boolean.compare.tt.pasteApply': 'Apply',
  'boolean.compare.tt.allowDontCare': 'Allow don’t-care (X)',
  'boolean.compare.tt.cycleHint': 'Click output cells to cycle 0 / 1 (or X when enabled).',
  'boolean.compare.tt.fill0': 'All 0',
  'boolean.compare.tt.fill1': 'All 1',
  'boolean.compare.tt.invert': 'Invert',
  'boolean.compare.tt.importFromOther': 'Fill from other side',
  'boolean.compare.tt.outLabel': 'Out',
  'boolean.compare.tt.cellAria': 'Row {row} output: {val}',

  // Verdict & diagnostics
  'boolean.compare.verdict.equivalent': 'Equivalent functions',
  'boolean.compare.verdict.notEquivalent': 'Not equivalent',
  'boolean.compare.verdict.complement': 'Not equivalent — exact logical inverse',
  'boolean.compare.verdict.aImpliesB': 'Not equivalent — B is broader (extra 1s)',
  'boolean.compare.verdict.bImpliesA': 'Not equivalent — B is narrower (missing 1s)',

  'boolean.compare.explain.equivalent':
    'Both functions produce the exact same output across all {checked} checked input combinations.',
  'boolean.compare.explain.equivalentWithDC':
    'Both functions agree across all {checked} specified rows ({dc} don’t-care row(s) ignored).',
  'boolean.compare.explain.complement':
    'Every single checked row is inverted (B = A\'). You likely missed or added an outer negation or De Morgan inversion.',
  'boolean.compare.explain.aImpliesB':
    'Whenever A = 1, B is also 1 (A → B), but B outputs 1 on {extra} extra row(s) where A = 0.',
  'boolean.compare.explain.bImpliesA':
    'Whenever B = 1, A is also 1 (B → A), but B misses {missing} row(s) where A = 1.',
  'boolean.compare.explain.different':
    'The functions disagree on {mismatches} of {checked} rows ({missing} missing 1s, {extra} extra 1s).',

  'boolean.compare.stat.agreement': 'Agreement',
  'boolean.compare.stat.rowsMatched': '{matched} / {checked} rows ({pct}%)',
  'boolean.compare.stat.mismatches': 'Mismatches',
  'boolean.compare.stat.dontCares': 'Don’t-cares ignored',
  'boolean.compare.stat.complexity': 'Complexity (A → B)',
  'boolean.compare.stat.complexityVal': '{gA}→{gB} gates · {lA}→{lB} literals',
  'boolean.compare.stat.alreadyMinimal': 'B is already minimal',
  'boolean.compare.stat.canSimplify': 'Can simplify further to',

  'boolean.compare.varWarn.title': 'Variable set differs between A and B',
  'boolean.compare.varWarn.onlyA': 'Only in A: {vars}',
  'boolean.compare.varWarn.onlyB': 'Only in B: {vars}',
  'boolean.compare.varWarn.typoHint':
    'At least one unmatched variable changes the output — double-check for a variable typo or a dropped input.',
  'boolean.compare.varWarn.vacuousHint':
    'The extra variable does not change the function output (it cancels out cleanly).',

  'boolean.compare.diag.counterexample': 'First counterexample',
  'boolean.compare.diag.counterexampleDetail': '{labelA} = {valA}, {labelB} = {valB} (row #{row})',
  'boolean.compare.diag.diffExpr': 'Disagreement region (A ⊕ B)',
  'boolean.compare.diag.missingExpr': 'Missing from B (A · B\')',
  'boolean.compare.diag.extraExpr': 'Extra in B (A\' · B)',
  'boolean.compare.diag.simplifyDiff': 'Simplify diff',

  // Diff K-Map
  'boolean.compare.kmap.title': 'Difference Karnaugh map',
  'boolean.compare.kmap.hint':
    'Visual map of where A and B agree (0 / 1) versus disagree (− missing in B, + extra in B).',
  'boolean.compare.kmap.legendMatch': 'Match (0 / 1)',
  'boolean.compare.kmap.legendMissing': 'Missing in B (A=1, B=0)',
  'boolean.compare.kmap.legendExtra': 'Extra in B (A=0, B=1)',
  'boolean.compare.kmap.legendDC': 'Don’t-care (X)',

  // Diff Truth Table
  'boolean.compare.table.title': 'Truth table diff',
  'boolean.compare.table.filterAll': 'All rows ({count})',
  'boolean.compare.table.filterMismatches': 'Mismatches only ({count})',
  'boolean.compare.table.colStatus': 'Result',
  'boolean.compare.table.statusMatch': 'Match',
  'boolean.compare.table.statusMissing': 'Missing (1→0)',
  'boolean.compare.table.statusExtra': 'Extra (0→1)',
  'boolean.compare.table.statusDC': 'Don’t-care',
  'boolean.compare.table.copyCsv': 'Copy CSV',
  'boolean.compare.table.copied': 'Copied',
  'boolean.compare.table.noMismatches': 'No mismatches — every checked row matches.',
  'boolean.compare.table.truncated': 'Showing first {shown} of {total} rows. Filter to "Mismatches only" to inspect disagreements.',

  // Multi-step Derivation Checker
  'boolean.compare.chain.startLabel': 'Starting expression (or target truth table)',
  'boolean.compare.chain.stepsTitle': 'Your simplification steps',
  'boolean.compare.chain.stepsHint':
    'Enter each intermediate expression as you work by hand. Every step is checked against both the previous line and the start.',
  'boolean.compare.chain.stepPlaceholder': 'Enter step {num} expression, e.g. A*B + A\'*C',
  'boolean.compare.chain.stepAria': 'Simplification step {num}',
  'boolean.compare.chain.addStep': 'Add step',
  'boolean.compare.chain.removeStep': 'Remove step {num}',
  'boolean.compare.chain.pasteLines': 'Paste multi-line work',
  'boolean.compare.chain.pastePrompt': 'Paste one expression per line (replaces current steps):',
  'boolean.compare.chain.applyPaste': 'Load steps',
  'boolean.compare.chain.cancel': 'Cancel',
  'boolean.compare.chain.status.valid': 'Equivalent',
  'boolean.compare.chain.status.firstError': 'First mistake here',
  'boolean.compare.chain.status.stepError': 'New mistake here',
  'boolean.compare.chain.status.cascaded': 'Matches prev · differs from start',
  'boolean.compare.chain.status.recovered': 'Back to original',
  'boolean.compare.chain.status.syntaxError': 'Syntax error',
  'boolean.compare.chain.status.empty': 'Empty',
  'boolean.compare.chain.summaryAllValid': 'All {count} steps are functionally equivalent to the start.',
  'boolean.compare.chain.summaryFirstError':
    'First mistake detected at Step {step} ({mismatches} of {checked} rows differ from {prevLabel}).',
  'boolean.compare.chain.summarySyntax': 'Syntax error at Step {step}.',
  'boolean.compare.chain.summaryEmpty': 'Add at least one step below to check your work.',
  'boolean.compare.chain.startName': 'Start',
  'boolean.compare.chain.stepName': 'Step {num}',
  'boolean.compare.chain.inspectBtn': 'Inspect diff',
  'boolean.compare.chain.inspecting': 'Inspecting',
  'boolean.compare.chain.compareAgainst': 'Inspecting Step {step} vs',
  'boolean.compare.chain.vsPrev': 'Previous ({prevLabel})',
  'boolean.compare.chain.vsStart': 'Start',
} as const;

export const nb: Record<keyof typeof en, string> = {
  // Workspace tab & cross-navigation
  'boolean.workspace.compare': 'Sammenlign',
  'boolean.compare.openFromSolver': 'Sjekk arbeid / Sammenlign',
  'boolean.compare.openInSimplifier': 'Åpne i forenkler',
  'boolean.compare.loadFromSimplifier': 'Hent fra forenkler',
  'boolean.compare.loadedFromSimplifier': 'Hentet fra forenkler',

  // Top bar & modes
  'boolean.compare.lead':
    'Sjekk om to boolske uttrykk eller sannhetstabeller er funksjonelt ekvivalente, finn moteksempler, eller kontroller hvert steg i din egen forenkling.',
  'boolean.compare.modeLabel': 'Kontrollmodus',
  'boolean.compare.mode.pair': 'Sammenlign to',
  'boolean.compare.mode.chain': 'Sjekk utregningssteg',
  'boolean.compare.swap': 'Bytt A ↔ B',
  'boolean.compare.presets': 'Prøv et eksempel',

  // Presets
  'boolean.compare.preset.consensusValid': 'Konsensusteoremet',
  'boolean.compare.preset.demorganMistake': 'De Morgan-tegnfeil',
  'boolean.compare.preset.complementTrap': 'XOR mot XNOR (invers)',
  'boolean.compare.preset.majorityTable': 'Flertallstabell mot uttrykk',
  'boolean.compare.preset.chainSignBug': '3-stegs utregning (feil i steg 2)',
  'boolean.compare.preset.chainValid': '4-stegs distributivt bevis',
  'boolean.compare.preset.tagEquivalent': 'ekvivalent',
  'boolean.compare.preset.tagMistake': 'feil',
  'boolean.compare.preset.tagInverse': 'invers',
  'boolean.compare.preset.tagTable': 'tabell ↔ uttrykk',
  'boolean.compare.preset.tagSteps': 'finner feil',
  'boolean.compare.preset.tagValidSteps': 'alle gyldige',
  'boolean.compare.presetDesc.consensusValid':
    'Bekrefter at fjerning av det overflødige konsensusleddet B·C bevarer nøyaktig samme sannhetstabell med færre porter og literaler.',
  'boolean.compare.presetDesc.demorganMistake':
    'Fanger opp en klassisk De Morgan-feil der + ikke ble snudd til ·, og viser de 2 ekstra radene og avviksområdet.',
  'boolean.compare.presetDesc.complementTrap':
    'Oppdager når kandidatuttrykket er den eksakte logiske inversen (B = A\') på hver eneste rad.',
  'boolean.compare.presetDesc.majorityTable':
    'Verifiserer en algebraisk 3-inngangs flertallsformel direkte mot en sannhetstabell (med valgfri don’t-care-støtte).',
  'boolean.compare.presetDesc.chainSignBug':
    'Kontrollerer en 3-stegs manuell utregning og peker ut nøyaktig De Morgan-tegnfeil i steg 2 samt følgevirkningen i steg 3.',
  'boolean.compare.presetDesc.chainValid':
    'Går gjennom et 4-stegs distributivt bevis med absorpsjon og bekrefter at hvert mellomsteg forblir ekvivalent.',

  // Examples tab integration (Simplifier vs Compare tool)
  'boolean.compare.examples.filterAria': 'Filtrer eksempler etter verktøy',
  'boolean.compare.examples.tabAll': 'Alle eksempler ({count})',
  'boolean.compare.examples.tabSimplifier': 'Forenkler ({count})',
  'boolean.compare.examples.tabCompare': 'Sammenligningsverktøy ({count})',
  'boolean.compare.examples.simplifierSectionTitle': 'Eksempler for forenkleren',
  'boolean.compare.examples.compareSectionTitle': 'Eksempler for sammenligningsverktøyet',
  'boolean.compare.examples.compareSectionLead':
    'Disse eksemplene åpnes i Sammenlign-fanen (ikke i forenkleren) — test uttrykksekvivalens, sannhetstabell-samsvar og flerstegs utregningskontroll.',
  'boolean.compare.examples.toolBadgeCompare': 'Sammenlign',
  'boolean.compare.examples.toolBadgeSimplifier': 'Forenkler',
  'boolean.compare.examples.openInCompare': 'Åpne i Sammenlign',
  'boolean.compare.examples.openInSimplifier': 'Åpne i forenkler',
  'boolean.compare.examples.labelStart': 'Start',
  'boolean.compare.examples.labelSteps': '{count} steg',
  'boolean.compare.examples.labelTruthTable': 'Sannhetstabell ({vars})',

  // Side A / Side B inputs
  'boolean.compare.sideA': 'Referanse (A)',
  'boolean.compare.sideB': 'Kandidat (B)',
  'boolean.compare.sourceType.expression': 'Uttrykk',
  'boolean.compare.sourceType.truthTable': 'Sannhetstabell',
  'boolean.compare.placeholderA': "f.eks. Y = A*B + A'*C + B*C",
  'boolean.compare.placeholderB': "f.eks. Y = A*B + A'*C",
  'boolean.compare.exprAriaA': 'Referanseuttrykk A',
  'boolean.compare.exprAriaB': 'Kandidatuttrykk B',
  'boolean.compare.copyToB': 'Kopier A → B',
  'boolean.compare.clear': 'Tøm',

  // Truth table editor in Compare
  'boolean.compare.tt.varsLabel': 'Variabler',
  'boolean.compare.tt.addVar': 'Legg til variabel',
  'boolean.compare.tt.removeVar': 'Fjern variabel',
  'boolean.compare.tt.pastePlaceholder': 'Lim inn bitstreng (f.eks. 00010111 eller 0,1,X,1)',
  'boolean.compare.tt.pasteApply': 'Bruk',
  'boolean.compare.tt.allowDontCare': 'Tillat don’t-care (X)',
  'boolean.compare.tt.cycleHint': 'Klikk på utgangsceller for å veksle 0 / 1 (eller X når aktivert).',
  'boolean.compare.tt.fill0': 'Alle 0',
  'boolean.compare.tt.fill1': 'Alle 1',
  'boolean.compare.tt.invert': 'Inverter',
  'boolean.compare.tt.importFromOther': 'Fyll fra den andre siden',
  'boolean.compare.tt.outLabel': 'Ut',
  'boolean.compare.tt.cellAria': 'Rad {row} utgang: {val}',

  // Verdict & diagnostics
  'boolean.compare.verdict.equivalent': 'Ekvivalente funksjoner',
  'boolean.compare.verdict.notEquivalent': 'Ikke ekvivalente',
  'boolean.compare.verdict.complement': 'Ikke ekvivalente — eksakt logisk invers',
  'boolean.compare.verdict.aImpliesB': 'Ikke ekvivalente — B er bredere (ekstra 1-ere)',
  'boolean.compare.verdict.bImpliesA': 'Ikke ekvivalente — B er smalere (mangler 1-ere)',

  'boolean.compare.explain.equivalent':
    'Begge funksjonene gir nøyaktig samme utgang for alle {checked} kontrollerte inngangskombinasjoner.',
  'boolean.compare.explain.equivalentWithDC':
    'Begge funksjonene stemmer overens på alle {checked} spesifiserte rader ({dc} don’t-care-rad(er) ignorert).',
  'boolean.compare.explain.complement':
    'Hver eneste kontrollerte rad er invertert (B = A\'). Du har sannsynligvis glemt eller lagt til en negasjon eller De Morgan-inversjon.',
  'boolean.compare.explain.aImpliesB':
    'Når A = 1 er B også 1 (A → B), men B gir 1 på {extra} ekstra rad(er) der A = 0.',
  'boolean.compare.explain.bImpliesA':
    'Når B = 1 er A også 1 (B → A), men B mangler {missing} rad(er) der A = 1.',
  'boolean.compare.explain.different':
    'Funksjonene avviker på {mismatches} av {checked} rader ({missing} manglende 1-ere, {extra} ekstra 1-ere).',

  'boolean.compare.stat.agreement': 'Samsvar',
  'boolean.compare.stat.rowsMatched': '{matched} / {checked} rader ({pct}%)',
  'boolean.compare.stat.mismatches': 'Avvik',
  'boolean.compare.stat.dontCares': 'Don’t-cares ignorert',
  'boolean.compare.stat.complexity': 'Kompleksitet (A → B)',
  'boolean.compare.stat.complexityVal': '{gA}→{gB} porter · {lA}→{lB} literaler',
  'boolean.compare.stat.alreadyMinimal': 'B er allerede minimal',
  'boolean.compare.stat.canSimplify': 'Kan forenkles videre til',

  'boolean.compare.varWarn.title': 'Variabelsettet er ulikt mellom A og B',
  'boolean.compare.varWarn.onlyA': 'Kun i A: {vars}',
  'boolean.compare.varWarn.onlyB': 'Kun i B: {vars}',
  'boolean.compare.varWarn.typoHint':
    'Minst én umatched variabel påvirker utgangen — dobbeltsjekk for skrivefeil i variabelnavn eller en uteglemt inngang.',
  'boolean.compare.varWarn.vacuousHint':
    'Den ekstra variabelen påvirker ikke funksjonsverdien (den kanselleres ut).',

  'boolean.compare.diag.counterexample': 'Første moteksempel',
  'boolean.compare.diag.counterexampleDetail': '{labelA} = {valA}, {labelB} = {valB} (rad #{row})',
  'boolean.compare.diag.diffExpr': 'Avviksområde (A ⊕ B)',
  'boolean.compare.diag.missingExpr': 'Mangler i B (A · B\')',
  'boolean.compare.diag.extraExpr': 'Ekstra i B (A\' · B)',
  'boolean.compare.diag.simplifyDiff': 'Forenkle avvik',

  // Diff K-Map
  'boolean.compare.kmap.title': 'Avviks-Karnaugh-kart',
  'boolean.compare.kmap.hint':
    'Visuelt kart over hvor A og B er like (0 / 1) mot hvor de avviker (− mangler i B, + ekstra i B).',
  'boolean.compare.kmap.legendMatch': 'Samsvar (0 / 1)',
  'boolean.compare.kmap.legendMissing': 'Mangler i B (A=1, B=0)',
  'boolean.compare.kmap.legendExtra': 'Ekstra i B (A=0, B=1)',
  'boolean.compare.kmap.legendDC': 'Don’t-care (X)',

  // Diff Truth Table
  'boolean.compare.table.title': 'Sannhetstabell-diff',
  'boolean.compare.table.filterAll': 'Alle rader ({count})',
  'boolean.compare.table.filterMismatches': 'Kun avvik ({count})',
  'boolean.compare.table.colStatus': 'Resultat',
  'boolean.compare.table.statusMatch': 'Lik',
  'boolean.compare.table.statusMissing': 'Mangler (1→0)',
  'boolean.compare.table.statusExtra': 'Ekstra (0→1)',
  'boolean.compare.table.statusDC': 'Don’t-care',
  'boolean.compare.table.copyCsv': 'Kopier CSV',
  'boolean.compare.table.copied': 'Kopiert',
  'boolean.compare.table.noMismatches': 'Ingen avvik — alle kontrollerte rader stemmer.',
  'boolean.compare.table.truncated': 'Viser første {shown} av {total} rader. Filtrer til «Kun avvik» for å inspisere forskjeller.',

  // Multi-step Derivation Checker
  'boolean.compare.chain.startLabel': 'Startuttrykk (eller målsannhetstabell)',
  'boolean.compare.chain.stepsTitle': 'Dine forenklingssteg',
  'boolean.compare.chain.stepsHint':
    'Skriv inn hvert mellomsteg mens du regner for hånd. Hvert steg kontrolleres mot både forrige linje og startuttrykket.',
  'boolean.compare.chain.stepPlaceholder': 'Skriv steg {num}, f.eks. A*B + A\'*C',
  'boolean.compare.chain.stepAria': 'Forenklingssteg {num}',
  'boolean.compare.chain.addStep': 'Legg til steg',
  'boolean.compare.chain.removeStep': 'Fjern steg {num}',
  'boolean.compare.chain.pasteLines': 'Lim inn flere linjer',
  'boolean.compare.chain.pastePrompt': 'Lim inn ett uttrykk per linje (erstatter gjeldende steg):',
  'boolean.compare.chain.applyPaste': 'Last steg',
  'boolean.compare.chain.cancel': 'Avbryt',
  'boolean.compare.chain.status.valid': 'Ekvivalent',
  'boolean.compare.chain.status.firstError': 'Første feil her',
  'boolean.compare.chain.status.stepError': 'Ny feil her',
  'boolean.compare.chain.status.cascaded': 'Lik forrige · avviker fra start',
  'boolean.compare.chain.status.recovered': 'Tilbake til original',
  'boolean.compare.chain.status.syntaxError': 'Syntaksfeil',
  'boolean.compare.chain.status.empty': 'Tom',
  'boolean.compare.chain.summaryAllValid': 'Alle {count} steg er funksjonelt ekvivalente med startuttrykket.',
  'boolean.compare.chain.summaryFirstError':
    'Første feil oppdaget i steg {step} ({mismatches} av {checked} rader avviker fra {prevLabel}).',
  'boolean.compare.chain.summarySyntax': 'Syntaksfeil i steg {step}.',
  'boolean.compare.chain.summaryEmpty': 'Legg til minst ett steg under for å kontrollere arbeidet ditt.',
  'boolean.compare.chain.startName': 'Start',
  'boolean.compare.chain.stepName': 'Steg {num}',
  'boolean.compare.chain.inspectBtn': 'Inspiser avvik',
  'boolean.compare.chain.inspecting': 'Inspiserer',
  'boolean.compare.chain.compareAgainst': 'Inspiserer steg {step} mot',
  'boolean.compare.chain.vsPrev': 'Forrige ({prevLabel})',
  'boolean.compare.chain.vsStart': 'Start',
};
