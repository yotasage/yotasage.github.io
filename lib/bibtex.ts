// Reads BibTeX (.bib) files and turns their LaTeX into plain text.
//
// Format: http://www.bibtex.org/Format/
// The biblatex fields (date, urldate, @online, …) are read like any other field: https://ctan.org/pkg/biblatex

export interface BibEntry {
  type: string; // lower case: 'article', 'book', 'online', …
  key: string;
  // Field names in lower case. Values are as written in the file, with @string macros expanded
  // and the outer braces or quotes removed. Use latexToText() to show them.
  fields: Record<string, string>;
}

export class BibtexError extends Error {}

// BibTeX's predefined month macros, so "month = jun" works.
const MONTHS: Record<string, string> = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June',
  jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December',
};

const NAME = /[^\s"#%'(),={}]+/y;

export function parseBibtex(source: string, fileName = 'BibTeX file'): BibEntry[] {
  const entries: BibEntry[] = [];
  const keys = new Set<string>();
  const strings: Record<string, string> = { ...MONTHS };
  let pos = 0;

  function fail(message: string): never {
    const line = source.slice(0, pos).split('\n').length;
    throw new BibtexError(`${fileName}, line ${line}: ${message}`);
  }

  // Whitespace and % comments.
  function skipSpace() {
    while (pos < source.length) {
      if (/\s/.test(source[pos])) pos++;
      else if (source[pos] === '%') while (pos < source.length && source[pos] !== '\n') pos++;
      else break;
    }
  }

  function expect(char: string) {
    if (source[pos] !== char) fail(`Expected "${char}" but found "${source[pos] ?? 'end of file'}"`);
    pos++;
  }

  function readName(what: string): string {
    NAME.lastIndex = pos;
    const match = NAME.exec(source);
    if (!match) fail(`Expected ${what}`);
    pos += match[0].length;
    return match[0];
  }

  // {…} with nested braces. Returns the text between the outer braces.
  function readBraced(): string {
    const start = pos + 1;
    let depth = 0;
    for (; pos < source.length; pos++) {
      if (source[pos] === '{') depth++;
      else if (source[pos] === '}' && --depth === 0) return source.slice(start, pos++);
    }
    return fail('Missing "}"');
  }

  // "…", where quotes inside braces do not end the value.
  function readQuoted(): string {
    const start = ++pos;
    let depth = 0;
    for (; pos < source.length; pos++) {
      if (source[pos] === '{') depth++;
      else if (source[pos] === '}') depth--;
      else if (source[pos] === '"' && depth === 0) return source.slice(start, pos++);
    }
    return fail('Missing closing quote');
  }

  // {…}, "…", a number or an @string name, possibly joined with #.
  function readValue(): string {
    let value = '';
    for (;;) {
      skipSpace();
      if (source[pos] === '{') value += readBraced();
      else if (source[pos] === '"') value += readQuoted();
      else {
        const name = readName('a value');
        if (/^\d+$/.test(name)) value += name;
        else if (name.toLowerCase() in strings) value += strings[name.toLowerCase()];
        else fail(`Unknown @string "${name}"`);
      }
      skipSpace();
      if (source[pos] !== '#') return value;
      pos++;
    }
  }

  for (;;) {
    // Everything outside entries is a comment, as in BibTeX.
    while (pos < source.length && source[pos] !== '@') {
      if (source[pos] === '%') while (pos < source.length && source[pos] !== '\n') pos++;
      else pos++;
    }
    if (pos >= source.length) break;
    pos++;
    // An @ that is not followed by a word, as in "an @ sign", is just text.
    NAME.lastIndex = pos;
    if (!NAME.test(source)) continue;

    const type = readName('an entry type after "@"').toLowerCase();
    skipSpace();
    const open = source[pos];
    if (open !== '{' && open !== '(') fail(`Expected "{" after @${type}`);
    const close = open === '{' ? '}' : ')';

    if (type === 'comment') {
      if (open === '{') readBraced();
      continue;
    }
    pos++;
    skipSpace();

    if (type === 'preamble') {
      readValue();
      expect(close);
      continue;
    }
    if (type === 'string') {
      const name = readName('a @string name');
      skipSpace();
      expect('=');
      strings[name.toLowerCase()] = readValue();
      expect(close);
      continue;
    }

    const key = readName('a citation key');
    if (keys.has(key)) fail(`The key "${key}" is used more than once`);
    const fields: Record<string, string> = {};
    skipSpace();
    for (;;) {
      if (source[pos] === close) break;
      if (pos >= source.length) fail(`Missing "${close}" at the end of ${key}`);
      expect(',');
      skipSpace();
      if (source[pos] === close) break; // comma after the last field
      const name = readName('a field name').toLowerCase();
      skipSpace();
      expect('=');
      fields[name] = readValue();
    }
    pos++;
    keys.add(key);
    entries.push({ type, key, fields });
  }
  return entries;
}

// Accents written as \"o, \"{o} or {\"o}, as combining characters.
const ACCENTS: Record<string, string> = {
  '"': '̈', "'": '́', '`': '̀', '^': '̂', '~': '̃', '=': '̄', '.': '̇',
  u: '̆', v: '̌', H: '̋', c: '̧', k: '̨', r: '̊',
};

const LETTERS: Record<string, string> = {
  aa: 'å', AA: 'Å', ae: 'æ', AE: 'Æ', o: 'ø', O: 'Ø', oe: 'œ', OE: 'Œ', ss: 'ß', l: 'ł', L: 'Ł', i: 'ı', j: 'ȷ',
};

/** Plain text for a field value: \"o → ö, \aa → å, \emph{x} → x, -- → –, ~ → no-break space, braces removed. */
export function latexToText(value: string): string {
  return value
    .replace(/\\([`'^"~=.])\s*\{?([A-Za-z])\}?/g, (_, accent: string, letter: string) => letter + ACCENTS[accent])
    .replace(/\\([uvHckr])(?:\s+|\{)([A-Za-z])\}?/g, (_, accent: string, letter: string) => letter + ACCENTS[accent])
    .replace(/\\(aa|AA|ae|AE|oe|OE|ss|o|O|l|L|i|j)(?![A-Za-z])\s*(?:\{\})?/g, (_, name: string) => LETTERS[name])
    .replace(/\\(LaTeX|TeX|BibTeX)(?![A-Za-z])\s*(?:\{\})?/g, '$1')
    // Other commands: \emph{x}, \url{x}, \textbf{x}, … keep their argument, and the rest their name.
    .replace(/\\[A-Za-z]+\s*(?=\{)/g, '')
    .replace(/\\([A-Za-z]+)\s*/g, '$1')
    .replace(/\\([&%$#_{}])/g, '$1')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // After the line above, since \s also matches the no-break space.
    .replace(/~/g, ' ')
    .normalize('NFC');
}

// Splits on the word "and" outside braces, so {Barnes and Noble} stays one name.
export function splitNames(value: string): string[] {
  const names: string[][] = [[]];
  for (const word of splitOutsideBraces(value, /\s/)) {
    if (word.toLowerCase() === 'and') names.push([]);
    else names[names.length - 1].push(word);
  }
  return names.filter((words) => words.length > 0).map((words) => words.join(' '));
}

// Splits on a separator outside braces.
function splitOutsideBraces(value: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '{') depth++;
    else if (char === '}') depth--;
    if (depth === 0 && separator.test(char)) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

/**
 * One name as in IEEE style: "Last, First Middle" or "First Middle Last" → "F. M. Last".
 * A name in braces, such as {Analog Devices}, is an organization and is kept as it is.
 */
export function formatName(name: string): string {
  const trimmed = name.trim();
  if (/^\{.*\}$/s.test(trimmed) && splitOutsideBraces(trimmed, /\s/).length === 1) return latexToText(trimmed);

  const commaParts = splitOutsideBraces(trimmed, /,/);
  let last: string;
  let first: string;
  if (commaParts.length > 1) {
    last = commaParts[0];
    first = commaParts[commaParts.length - 1];
  } else {
    const words = splitOutsideBraces(trimmed, /\s/);
    last = words.pop() ?? '';
    first = words.join(' ');
  }
  const initials = latexToText(first)
    .split(/\s+/)
    .filter((word) => word !== '')
    .map((word) => word.split('-').filter((part) => part !== '').map((part) => `${[...part][0]}.`).join('-'))
    .join(' ');
  return [initials, latexToText(last)].filter((p) => p !== '').join(' ');
}

/** "A", "A and B", "A, B, and C"; more than six authors become "A et al." as in IEEE style. */
export function formatNames(value: string): string {
  const names = splitNames(value).map(formatName);
  if (names.length > 6) return `${names[0]} et al.`;
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}
