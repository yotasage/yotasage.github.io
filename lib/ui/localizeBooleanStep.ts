import type { BooleanStep } from '../boolean/types';
import type { Locale } from './translations';

const WORK_LABELS: Record<string, string> = {
  'Original expression': 'Opprinnelig uttrykk',
  'Minimal POS': 'Minimal POS',
  'Minimal SOP': 'Minimal SOP',
  'Multi-level search': 'Flertrinns søk',
  'NAND-only synthesis': 'Kun NAND-syntese',
  'NOR-only synthesis': 'Kun NOR-syntese',
  'Already minimal': 'Allerede minimalt',
  'Simplified result': 'Forenklet resultat',
};

const RULE_TITLES: Record<string, string> = {
  'Given Boolean Expression': 'Gitt boolsk uttrykk',
  'Quine-McCluskey Exact POS Minimization': 'Quine-McCluskey eksakt POS-minimering',
  'Quine-McCluskey Exact SOP Minimization': 'Quine-McCluskey eksakt SOP-minimering',
  'Common-Literal Factoring (Heuristic)': 'Felles-literal-faktorisering (heuristikk)',
  'Kernel Bi-Factoring (High Effort)': 'Kjerne-bifaktorisering (høy innsats)',
  'Heuristic Form Selection': 'Heuristisk formvalg',
  'Universal NAND-Only Gate Conversion': 'Universell konvertering til kun NAND-porter',
  'Universal NOR-Only Gate Conversion': 'Universell konvertering til kun NOR-porter',
  'Expression Is Already Minimal': 'Uttrykket er allerede minimalt',
  'Final Simplified Expression': 'Endelig forenklet uttrykk',
  'Constant Negation': 'Konstantnegasjon',
  'Double Negation Law': 'Dobbel negasjon',
  "De Morgan's Law": 'De Morgans lov',
  'Associative Flattening': 'Assosiativ utflating',
  'XNOR Identity (Self)': 'XNOR-identitet (seg selv)',
  'XNOR Complement': 'XNOR-komplement',
  'XOR Identity with 0': 'XOR-identitet med 0',
  'XOR Self-Cancellation': 'XOR-selvutjevning',
  'XOR with 1 (Inversion)': 'XOR med 1 (invertering)',
  'Annulment Law': 'Annulleringslov (dominans)',
  'Identity Law': 'Identitetslov',
  'Complement Law': 'Komplementlov',
  'Idempotent Law': 'Idempotenslov',
  'Absorption Law': 'Absorpsjonslov',
  'Combining (Adjacency) Law': 'Sammenslåingslov (nabolag)',
  'Complement Absorption (Redundancy)': 'Komplementabsorpsjon (redundans)',
  'Consensus Theorem': 'Konsensusteoremet',
  'Distributive Law (OR over AND)': 'Distributiv lov (OR over AND)',
};

const EXACT_TEXT: Record<string, string> = {
  'Parsed constant Boolean expression.': 'Tolket konstant boolsk uttrykk.',
  'Operator precedence follows digital logic convention: NOT (highest) → AND / NAND → XOR / XNOR → OR / NOR (lowest).':
    'Operatorpresedens følger digitalteknisk konvensjon: NOT (høyest) → AND / NAND → XOR / XNOR → OR / NOR (lavest).',
  'Quine-McCluskey systematically merges adjacent minterms/maxterms (like a programmatic Karnaugh map) and uses Petrick’s method to guarantee a minimum two-level cover.':
    'Quine-McCluskey slår systematisk sammen tilstøtende mintermer/makstermer (som et programmatisk Karnaugh-kart) og bruker Petricks metode for å garantere en minimal to-nivås dekning.',
  'High-effort heuristic search tests whether the truth table is linear over GF(2), collapsing 2^(n-1) SOP product terms into an n-input XOR/XNOR chain.':
    'Heuristisk søk med høy innsats tester om sannhetstabellen er lineær over GF(2), og kollapser 2^(n-1) SOP-produktledd til én n-inngangs XOR/XNOR-kjede.',
  'Multi-level factoring trades flat 2-level SOP depth for fewer literals and narrower fan-in gates.':
    'Flertrinns faktorisering bytter flat to-nivås SOP-dybde mot færre literaler og smalere porter.',
  'Kernel extraction identifies repeated sum/product sub-expressions across already-factored branches, yielding compact multi-level factored forms like (A+B)(C+D).':
    'Kjerneuttrekk finner gjentatte sum-/produkt-deluttrykk på tvers av allerede faktoriserte grener, og gir kompakte flertrinns former som (A+B)(C+D).',
  'Recognizing parity (XOR) and equivalence (XNOR) patterns eliminates inverters and collapses 2-level SOP expansions into compact parity gates.':
    'Gjenkjenning av paritets- (XOR) og ekvivalensmønstre (XNOR) fjerner invertere og kollapser to-nivås SOP-utvidelser til kompakte paritetsporter.',
  'Selected lower-cost dual representation from candidate search.':
    'Valgte en rimeligere dual representasjon fra kandidatsøket.',
  'Comparing SOP, POS, and factored forms finds lower literal and gate counts than two-level minimization alone.':
    'Sammenligning av SOP, POS og faktoriserte former finner lavere antall literaler og porter enn to-nivås minimering alene.',
  'Both NAND and NOR are functionally complete: any Boolean function can be implemented with a single gate type (e.g. XOR takes only 4 2-input NAND gates when NAND(A,B) is shared!).':
    'Både NAND og NOR er funksjonelt komplette: enhver boolsk funksjon kan realiseres med én enkelt porttype (f.eks. krever XOR kun 4 to-inngangs NAND-porter når NAND(A,B) deles!).',
  'No further reductions apply under the selected method and target form.':
    'Ingen ytterligere forenklinger gjelder med valgt metode og målform.',
  'Every intermediate expression is exhaustively checked against the original truth table to guarantee 100% functional equivalence.':
    'Hvert mellomuttrykk kontrolleres uttømmende mot den opprinnelige sannhetstabellen for å garantere 100 % funksjonell ekvivalens.',
  'NAND and NOR gates are defined as negated AND and OR gates. Rewriting them explicitly exposes negations for De Morgan’s laws.':
    'NAND- og NOR-porter er definert som negerte AND- og OR-porter. Eksplisitt omskriving synliggjør negasjoner for De Morgans lover.',
  'Inverting a logic constant immediately yields the opposite logic level.':
    'Invertering av en logisk konstant gir umiddelbart motsatt logisk nivå.',
  'Two consecutive NOT operations cancel each other out, removing two inverters.':
    'To påfølgende NOT-operasjoner opphever hverandre og fjerner to invertere.',
  "De Morgan's theorem flips the gate type (AND ↔ OR) when pushing an inversion bubble from the output to the inputs.":
    'De Morgans teorem snur porttypen (AND ↔ OR) når en inverteringsboble skyves fra utgangen til inngangene.',
  'Associativity lets nested gates of the same type merge cleanly before checking duplicates or complements.':
    'Assosiativitet gjør at nøstede porter av samme type slås sammen før sjekk for duplikater og komplementer.',
  'A signal is always equal to itself, so XNOR evaluates to 1.':
    'Et signal er alltid lik seg selv, så XNOR blir alltid 1.',
  'XNOR outputs 1 whenever both inputs match.': 'XNOR gir 1 når begge inngangene er like.',
  'A signal and its inverse never match, so XNOR evaluates to 0.':
    'Et signal og dets invers er aldri like, så XNOR blir alltid 0.',
  'XNOR outputs 0 whenever its two inputs differ.': 'XNOR gir 0 når de to inngangene er ulike.',
  'Dropped neutral 0 input from XOR gate.': 'Fjernet nøytral 0-inngang fra XOR-porten.',
  'XOR with 0 leaves the signal unchanged.': 'XOR med 0 lar signalet være uendret.',
  'Because XOR checks odd parity, any pair of identical inputs cancels to 0.':
    'Siden XOR sjekker odde paritet, kansellerer ethvert par av like innganger til 0.',
  'Replaced XOR with constant 1 by logical negation.': 'Erstattet XOR med konstant 1 med logisk negasjon.',
  'XORing with 1 acts as a controlled inverter.': 'XOR med 1 fungerer som en styrt inverter.',
  'An AND gate with any 0 input always outputs 0.': 'En AND-port med minst én 0-inngang gir alltid 0.',
  'An OR gate with any 1 input always outputs 1.': 'En OR-port med minst én 1-inngang gir alltid 1.',
  'A signal and its inverse cannot both be 1 at the same time.':
    'Et signal og dets invers kan ikke begge være 1 samtidig.',
  'Either a signal or its inverse must always be 1.':
    'Enten et signal eller dets invers må alltid være 1.',
  'Repeating an identical signal on an AND or OR gate does not change its truth value.':
    'Å gjenta et identisk signal på en AND- eller OR-port endrer ikke sannhetsverdien.',
  'Whenever the narrower term is true, the broader term is already true, so the narrower term is redundant.':
    'Når det smalere leddet er sant, er det bredere leddet allerede sant, så det smalere leddet er overflødig.',
  'Whenever the simpler clause is false, the longer clause cannot rescue the AND output.':
    'Når den enklere klausulen er usann, kan ikke den lengre klausulen redde AND-utgangen.',
  'Two terms that differ in only a single complemented literal cover both cases of that variable, so it drops out completely.':
    'To ledd som bare skiller seg i én komplementert literal dekker begge tilfellene av variabelen, slik at den faller helt bort.',
  'Because the un-negated term already handles the case where it is active, checking its complement in the sibling term is unnecessary.':
    'Fordi det unegerte leddet allerede dekker tilfellet der det er aktivt, er det unødvendig å sjekke komplementet i søskenleddet.',
  'Whenever the consensus term evaluates to 1, one of its two parent terms is guaranteed to be 1 regardless of the pivot variable.':
    'Når konsensusleddet evaluerer til 1, er ett av de to opphavsleddene garantert 1 uavhengig av pivotvariabelen.',
  'In Boolean algebra, OR distributes over AND, turning (A + B)(A + C) directly into the simpler expression A + BC.':
    'I boolsk algebra distribuerer OR over AND, som gjør (A + B)(A + C) direkte om til det enklere uttrykket A + BC.',
  'Unable to parse Boolean expression.': 'Kunne ikke tolke det boolske uttrykket.',
};

function translateRuleTitle(title: string): string {
  if (RULE_TITLES[title]) return RULE_TITLES[title];
  let m: RegExpMatchArray | null;
  if ((m = title.match(/^(\d+)-Variable (XOR|XNOR) Parity Synthesis \(High Effort\)$/))) {
    return `${m[1]}-variabels ${m[2]}-paritetssyntese (høy innsats)`;
  }
  if ((m = title.match(/^(XOR|XNOR) Pattern Synthesis \(Heuristic\)$/))) {
    return `${m[1]}-mønstersyntese (heuristikk)`;
  }
  if ((m = title.match(/^Rewrite (NAND|NOR) as Inverted (AND|OR)$/))) {
    return `Skriv om ${m[1]} som invertert ${m[2]}`;
  }
  return title;
}

export function localizeBooleanText(text: string, locale: Locale): string {
  if (locale === 'en' || !text) return text;
  if (EXACT_TEXT[text]) return EXACT_TEXT[text];

  let m: RegExpMatchArray | null;
  if ((m = text.match(/^Parsed (\d+) input variables? \((.+)\) into an expression tree\.$/))) {
    const n = Number(m[1]);
    return `Tolket ${n} inngangsvariab${n === 1 ? 'el' : 'ler'} (${m[2]}) til et uttrykkstre.`;
  }
  if ((m = text.match(/^Detected exact (\d+)-input (XOR|XNOR) parity across \((.+)\), collapsing the entire checkerboard truth table\.$/))) {
    return `Oppdaget eksakt ${m[1]}-inngangs ${m[2]}-paritet over (${m[3]}), som kollapser hele sjakkbrett-sannhetstabellen.`;
  }
  if ((m = text.match(/^Factored shared literal (.+) across multiple terms to reduce literals\.$/))) {
    return `Faktoriserte ut felles literal ${m[1]} på tvers av flere ledd for å redusere antall literaler.`;
  }
  if ((m = text.match(/^Extracted common sub-expression kernel (.+) across branches\.$/))) {
    return `Trakk ut felles deluttrykkskjerne ${m[1]} på tvers av grener.`;
  }
  if ((m = text.match(/^Replaced complementary pair on (.+), (.+) with a (XOR|XNOR) gate\.$/))) {
    return `Erstattet komplementært par på ${m[1]}, ${m[2]} med en ${m[3]}-port.`;
  }
  if ((m = text.match(/^Found (\d+) prime implicants? \((\d+) essential\) and selected an exact minimal (Product-of-Sums|Sum-of-Products) cover\.$/))) {
    const n = Number(m[1]);
    const form = m[3] === 'Product-of-Sums' ? 'produkt-av-summer (POS)' : 'sum-av-produkter (SOP)';
    return `Fant ${n} primimplikant${n === 1 ? '' : 'er'} (${m[2]} essensielle) og valgte en eksakt minimal ${form}-dekning.`;
  }
  if ((m = text.match(/^Synthesized the expression using only (NAND|NOR) gates via De Morgan's law and shared sub-terms\.$/))) {
    return `Syntetiserte uttrykket med kun ${m[1]}-porter ved hjelp av De Morgans lov og delte deluttrykk.`;
  }
  if ((m = text.match(/^Reduced from (\d+) gate\(s\) \/ (\d+) literal\(s\) to (\d+) gate\(s\) \/ (\d+) literal\(s\)\.$/))) {
    return `Redusert fra ${m[1]} port(er) / ${m[2]} literal(er) til ${m[3]} port(er) / ${m[4]} literal(er).`;
  }
  if ((m = text.match(/^Expressed (.+) using an inverted (AND|OR) so algebraic laws can simplify inside\.$/))) {
    return `Uttrykte ${m[1]} med en invertert ${m[2]} slik at algebraiske lover kan forenkle inni.`;
  }
  if ((m = text.match(/^Evaluated negation of constant (0|1) to (0|1)\.$/))) {
    return `Evaluerte negasjon av konstanten ${m[1]} til ${m[2]}.`;
  }
  if ((m = text.match(/^Cancelled double inversion on (.+)\.$/))) {
    return `Kansellerte dobbel invertering på ${m[1]}.`;
  }
  if ((m = text.match(/^Pushed negation through (AND|OR) to produce (AND|OR) of negated terms\.$/))) {
    return `Skjøv negasjon gjennom ${m[1]} til ${m[2]} av negerte ledd.`;
  }
  if ((m = text.match(/^Combined nested (AND|OR|XOR) gates into a single flat (AND|OR|XOR) group\.$/))) {
    return `Slo sammen nøstede ${m[1]}-porter til én flat ${m[2]}-gruppe.`;
  }
  if ((m = text.match(/^Cancelled identical pair (.+) ⊕ (.+) = 0\.$/))) {
    return `Kansellerte identisk par ${m[1]} ⊕ ${m[2]} = 0.`;
  }
  if ((m = text.match(/^Constant (0|1) dominates the (AND|OR) expression, collapsing it to (0|1)\.$/))) {
    return `Konstanten ${m[1]} dominerer ${m[2]}-uttrykket og kollapser det til ${m[3]}.`;
  }
  if ((m = text.match(/^Removed neutral constant (0|1) from the (AND|OR) gate\.$/))) {
    return `Fjernet nøytral konstant ${m[1]} fra ${m[2]}-porten.`;
  }
  if ((m = text.match(/^Constant (0|1) is the identity element for (AND|OR) and has no effect on the output\.$/))) {
    return `Konstanten ${m[1]} er identitetselementet for ${m[2]} og påvirker ikke utgangen.`;
  }
  if ((m = text.match(/^Found complementary pair (.+) and (.+), reducing the (AND|OR) group to (0|1)\.$/))) {
    return `Fant komplementært par ${m[1]} og ${m[2]}, som reduserer ${m[3]}-gruppen til ${m[4]}.`;
  }
  if ((m = text.match(/^Removed duplicate operand (.+)\.$/))) {
    return `Fjernet duplikatoperanden ${m[1]}.`;
  }
  if ((m = text.match(/^Term (.+) completely absorbs (.+)\.$/))) {
    return `Leddet ${m[1]} absorberer ${m[2]} fullstendig.`;
  }
  if ((m = text.match(/^Merged adjacent terms (.+) and (.+) to eliminate (.+)\.$/))) {
    return `Slo sammen tilstøtende ledd ${m[1]} og ${m[2]} for å eliminere ${m[3]}.`;
  }
  if ((m = text.match(/^Dropped redundant literal (.+) from (.+) using (.+)\.$/))) {
    return `Fjernet overflødig literal ${m[1]} fra ${m[2]} ved hjelp av ${m[3]}.`;
  }
  if ((m = text.match(/^Removed redundant consensus term (.+) covered by (.+) and (.+)\.$/))) {
    return `Fjernet overflødig konsensusledd ${m[1]} som allerede dekkes av ${m[2]} og ${m[3]}.`;
  }
  if ((m = text.match(/^Factored shared OR-term (.+) out of two clauses\.$/))) {
    return `Faktoriserte felles OR-ledd ${m[1]} ut av to klausuler.`;
  }
  if ((m = text.match(/^Examples: (.+)$/))) {
    return `Eksempler: ${m[1]}`;
  }
  return text;
}

export function localizeBooleanStep(step: BooleanStep, locale: Locale): BooleanStep {
  if (locale === 'en') return step;
  return {
    ...step,
    workLabel: step.workLabel ? WORK_LABELS[step.workLabel] ?? step.workLabel : undefined,
    ruleTitle: translateRuleTitle(step.ruleTitle),
    annotation: step.annotation ? localizeBooleanText(step.annotation, locale) : undefined,
    theory: step.theory ? localizeBooleanText(step.theory, locale) : undefined,
  };
}
