// Sentence case, title case and capitalized case.
//
// Without a dictionary, the words that must keep their capitals are found from how they are written: acronyms (NASA),
// words with capitals inside (iPhone, MHz), web addresses, and, in sentence case, names (a capital in the middle of a
// sentence). Each is checked against the rest of its line, so text written in capitals, or a title with a capital on
// every word, is still changed. Terms the user lists always get the capitals they are written with.

export type TitleStyle = 'chicago' | 'apa';

export interface ProseOptions {
  // Keep acronyms, words with capitals inside and web addresses as they are written.
  keepSpecial: boolean;
  // Sentence case: keep words with a capital in the middle of a sentence.
  keepNames: boolean;
  // Sentence case: every new line starts a sentence.
  newLineSentence: boolean;
  // Sentence case: the English word i is written I.
  englishI: boolean;
  titleStyle: TitleStyle;
  terms: string[];
}

interface Word {
  start: number;
  end: number;
  text: string;
  line: number;
  // A web address, e-mail address, file name or dotted abbreviation (e.g., U.S.), changed as one word.
  address: boolean;
  // Written as it is.
  kept: boolean;
}

// Letters and digits, with apostrophes inside (don't, rock'n'roll).
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;
// Splits the punctuation in front of a word from the rest, and drops the punctuation after it.
const CORE = /^([^\p{L}\p{N}]*)([\s\S]*?)[^\p{L}\p{M}\p{N}]*$/u;
const ADDRESS = /^[a-z][a-z\d+.-]*:\/\/|^www\.|@|[\p{L}\p{N}][._\\][\p{L}\p{N}]/iu;
const NEW_LINE = /\r\n|\r|\n/g;
const HYPHEN = /^[-‐‑]$/;

const ARTICLES = ['a', 'an', 'the'];
// Chicago Manual of Style: articles, the conjunctions and, but, for, or and nor, the words to and as, and prepositions
// of any length. Prepositions that are often adverbs in titles (up, down, out, off, like) are left out, since Chicago
// gives them a capital then (Look Up).
const CHICAGO_SMALL = new Set([
  ...ARTICLES, 'and', 'but', 'for', 'or', 'nor', 'to', 'as',
  'about', 'above', 'across', 'after', 'against', 'along', 'amid', 'among', 'around', 'at', 'before', 'behind', 'below',
  'beneath', 'beside', 'besides', 'between', 'beyond', 'by', 'despite', 'during', 'except', 'from', 'in', 'inside',
  'into', 'of', 'on', 'onto', 'outside', 'over', 'per', 'since', 'through', 'throughout', 'till', 'toward', 'towards',
  'under', 'underneath', 'unlike', 'until', 'upon', 'versus', 'via', 'vs', 'with', 'within', 'without',
]);
// APA style: articles, and conjunctions and prepositions of up to three letters.
const APA_SMALL = new Set([
  ...ARTICLES, 'and', 'as', 'but', 'for', 'if', 'nor', 'or', 'so', 'yet',
  'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to', 'up', 'via', 'vs',
]);
const SMALL_WORDS = new Set([...CHICAGO_SMALL, ...APA_SMALL]);

// Abbreviations whose full stop does not end a sentence.
const ABBREVIATIONS = new Set(['e.g', 'eg', 'i.e', 'ie', 'vs', 'cf', 'approx', 'incl', 'ca', 'viz', 'al']);
// Written with a capital when followed by a full stop.
const TITLES = new Set(['mr', 'mrs', 'dr', 'prof']);
const ENGLISH_I = /^i(?:['’](?:m|ll|d|ve))?$/i;

const hasLower = (s: string) => /\p{Ll}/u.test(s);
// NASA's counts as written in capitals.
const stem = (word: string) => word.replace(/['’]s$/i, '');
// Capitals only, at least two of them or one with a digit: NASA, PDF, 5G, H2O.
const allCapitals = (s: string) => !hasLower(s) && (s.match(/\p{Lu}/gu)?.length ?? 0) >= (/\p{N}/u.test(s) ? 1 : 2);
// A capital after the first letter, and lower case letters too: iPhone, McDonald, MHz, PDFs.
const capitalInside = (s: string) => hasLower(s) && /^.+\p{Lu}/u.test(s);

// Upper case for the first letter, lower case for the rest. A word starting with a digit (1st) stays in lower case.
export function capitalize(word: string): string {
  const lower = word.toLowerCase();
  const first = String.fromCodePoint(lower.codePointAt(0));
  return first.toUpperCase() + lower.slice(first.length);
}

function findWords(text: string): Word[] {
  const words: Word[] = [];
  let line = 0;
  let last = 0;
  for (const chunk of text.matchAll(/\S+/g)) {
    line += text.slice(last, chunk.index).match(NEW_LINE)?.length ?? 0;
    last = chunk.index;
    const [, lead, core] = CORE.exec(chunk[0]);
    if (!core) continue;
    const at = chunk.index + lead.length;
    if (ADDRESS.test(core)) {
      words.push({ start: at, end: at + core.length, text: core, line, address: true, kept: false });
      continue;
    }
    for (const w of core.matchAll(WORD)) {
      words.push({ start: at + w.index, end: at + w.index + w[0].length, text: w[0], line, address: false, kept: false });
    }
  }
  return words;
}

// Acronyms and web addresses are not kept in lines where words in capitals outnumber words with lower case letters
// more than two to one, so text written in capitals is changed too.
function keepSpecial(words: Word[]) {
  const balance = new Map<number, number>();
  for (const w of words) {
    const s = stem(w.text);
    const score = hasLower(s) ? -2 : allCapitals(s) ? 1 : 0;
    balance.set(w.line, (balance.get(w.line) ?? 0) + score);
  }
  for (const w of words) {
    const s = stem(w.text);
    w.kept = capitalInside(s) || (balance.get(w.line) <= 0 && (w.address || allCapitals(s)));
  }
}

// Words with a capital in the middle of a sentence are taken as names (John, Oslo) and kept, except in lines where they
// outnumber words in lower case more than two to one, which are taken as titles. Small words such as of and the are
// not counted, since titles have them in lower case.
function keepNames(words: Word[], starts: boolean[]) {
  const isName = (w: Word, i: number) => !starts[i] && !w.kept && /^\p{Lu}/u.test(w.text) && hasLower(w.text);
  const balance = new Map<number, number>();
  words.forEach((w, i) => {
    const lower = !w.kept && /^\p{Ll}/u.test(w.text) && !SMALL_WORDS.has(w.text.toLowerCase());
    const score = isName(w, i) ? 1 : lower ? -2 : 0;
    balance.set(w.line, (balance.get(w.line) ?? 0) + score);
  });
  words.forEach((w, i) => {
    if (isName(w, i) && balance.get(w.line) <= 0) w.kept = true;
  });
}

// gaps[i] is the text before word i, and the last gap the text after the last word.
function prepare(text: string, special: boolean): { words: Word[]; gaps: string[] } {
  const words = findWords(text);
  if (special) keepSpecial(words);
  const gaps = words.map((w, i) => text.slice(i ? words[i - 1].end : 0, w.start));
  gaps.push(text.slice(words.at(-1)?.end ?? 0));
  return { words, gaps };
}

function rebuild(gaps: string[], words: string[]): string {
  const out = [gaps[0]];
  words.forEach((w, i) => out.push(w, gaps[i + 1]));
  return out.join('');
}

// Whether the gap after a word has one of the marks, not counting the full stop after an abbreviation.
function breaksAt(prev: Word, gap: string, marks: RegExp): boolean {
  if (gap.startsWith('.') && ABBREVIATIONS.has(prev.text.toLowerCase())) gap = gap.slice(1);
  return marks.test(gap);
}

// Terms may be several words (New York); the spaces between them are kept as they are in the text.
function applyTerms(text: string, terms: string[]): string {
  const list = terms.map((t) => t.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!list.length) return text;
  const key = (s: string) => s.toLowerCase().split(/\s+/).join(' ');
  const byKey = new Map(list.map((t) => [key(t), t]));
  const pattern = list.map((t) => t.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')).join('|');
  const re = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${pattern})(?![\\p{L}\\p{M}\\p{N}])`, 'giu');
  return text.replace(re, (match) => {
    const term = byKey.get(key(match));
    if (!term) return match;
    const parts = term.split(/\s+/);
    let i = 0;
    return match.replace(/\S+/g, () => parts[i++]);
  });
}

export function sentenceCase(text: string, options: ProseOptions): string {
  const { words, gaps } = prepare(text, options.keepSpecial);
  const starts = words.map((w, i) => i === 0
    || breaksAt(words[i - 1], gaps[i], /[.!?…]/)
    || (options.newLineSentence && /[\r\n]/.test(gaps[i])));
  if (options.keepNames) keepNames(words, starts);
  const out = words.map((w, i) => {
    if (w.kept) return w.text;
    const lower = w.text.toLowerCase();
    const capital = starts[i]
      || (TITLES.has(lower) && gaps[i + 1].startsWith('.'))
      || (options.englishI && ENGLISH_I.test(w.text));
    return capital ? capitalize(w.text) : lower;
  });
  return applyTerms(rebuild(gaps, out), options.terms);
}

export function titleCase(text: string, options: ProseOptions): string {
  const small = options.titleStyle === 'apa' ? APA_SMALL : CHICAGO_SMALL;
  const { words, gaps } = prepare(text, options.keepSpecial);
  // Every line is a title. A colon, a dash or the end of a sentence starts a subtitle.
  const starts = words.map((w, i) => i === 0 || /[\r\n]/.test(gaps[i]) || breaksAt(words[i - 1], gaps[i], /[:.!?…—–]/));
  const out = words.map((w, i) => {
    if (w.kept) return w.text;
    const lower = w.text.toLowerCase();
    // The first and last word of a title or subtitle always get a capital.
    const edge = starts[i] || i === words.length - 1 || starts[i + 1];
    // So does the first part of a hyphenated word (To-Do, In-Depth); the later parts follow the rules (Out-of-Date).
    const compoundStart = HYPHEN.test(gaps[i + 1]) && !HYPHEN.test(gaps[i]);
    return !edge && !compoundStart && small.has(lower) ? lower : capitalize(w.text);
  });
  return applyTerms(rebuild(gaps, out), options.terms);
}

export function capitalizedCase(text: string, options: ProseOptions): string {
  const { words, gaps } = prepare(text, options.keepSpecial);
  return applyTerms(rebuild(gaps, words.map((w) => (w.kept ? w.text : capitalize(w.text)))), options.terms);
}
