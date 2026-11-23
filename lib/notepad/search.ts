import { DocumentMatchSummary, NotepadDoc, SearchOptions, TextMatch } from './types';

export interface SearchResult {
  matches: TextMatch[];
  error: string | null;
}

export interface ReplaceResult {
  text: string;
  count: number;
  error: string | null;
}

const MAX_MATCHES = 50_000;

export function escapeRegexLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Decodes Extended search/replace escape sequences:
 * \r\n, \n, \r, \t, \0, \\ (preserving unknown escapes literally).
 */
export function decodeExtendedEscapes(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch !== '\\' || i + 1 >= input.length) {
      out += ch;
      continue;
    }
    const next = input[i + 1];
    switch (next) {
      case 'n':
        out += '\n';
        i++;
        break;
      case 'r':
        out += '\r';
        i++;
        break;
      case 't':
        out += '\t';
        i++;
        break;
      case '0':
        out += '\0';
        i++;
        break;
      case '\\':
        out += '\\';
        i++;
        break;
      default:
        out += ch;
        break;
    }
  }
  return out;
}

function buildLineStarts(text: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}

function offsetToLineColumn(lineStarts: readonly number[], offset: number): { line: number; column: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (lineStarts[mid] <= offset) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const idx = Math.max(0, hi);
  return { line: idx + 1, column: offset - lineStarts[idx] + 1 };
}

/**
 * Compiles a search query into a global RegExp.
 * In Extended mode, `\r\n` matches both actual `\r\n` and normalized `\n` line breaks
 * so users who type `\r\n` always get the expected result regardless of
 * whether the buffer uses LF or CRLF internally.
 */
export function buildSearchRegex(
  query: string,
  options: SearchOptions,
): { regex: RegExp | null; error: string | null } {
  if (!query) return { regex: null, error: null };

  let source: string;
  if (options.mode === 'regex') {
    // Allow \r\n in regex mode to also match bare \n when text has LF line endings.
    source = query.replace(/\\r\\n/g, '(?:\\r\\n|\\n)');
  } else if (options.mode === 'extended') {
    const decoded = decodeExtendedEscapes(query);
    if (!decoded) return { regex: null, error: null };
    // Split on CRLF so each CRLF matches either \r\n or \n in the text buffer.
    const parts = decoded.split('\r\n').map((part) => escapeRegexLiteral(part));
    source = parts.join('(?:\\r\\n|\\n)');
  } else {
    source = escapeRegexLiteral(query);
  }

  if (options.wholeWord) {
    source = `\\b(?:${source})\\b`;
  }

  let flags = 'g';
  if (!options.caseSensitive) flags += 'i';
  if (options.mode === 'regex') {
    flags += 'm';
    if (options.dotMatchesNewline) flags += 's';
  }

  try {
    return { regex: new RegExp(source, flags), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid regular expression';
    return { regex: null, error: message };
  }
}

export function findMatches(text: string, query: string, options: SearchOptions): SearchResult {
  if (!query) return { matches: [], error: null };
  const { regex, error } = buildSearchRegex(query, options);
  if (error || !regex) return { matches: [], error };

  const lineStarts = buildLineStarts(text);
  const matches: TextMatch[] = [];
  regex.lastIndex = 0;

  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const start = m.index;
    const matchedText = m[0];
    const end = start + matchedText.length;

    if (end > start) {
      const sPos = offsetToLineColumn(lineStarts, start);
      const ePos = offsetToLineColumn(lineStarts, end);
      matches.push({
        start,
        end,
        line: sPos.line,
        column: sPos.column,
        endLine: ePos.line,
        endColumn: ePos.column,
        matchedText,
      });
    }

    if (matches.length >= MAX_MATCHES) break;
    if (matchedText.length === 0) {
      regex.lastIndex = start + 1;
      if (regex.lastIndex > text.length) break;
    }
  }

  return { matches, error: null };
}

function resolveReplacementString(
  rawReplacement: string,
  options: SearchOptions,
  targetEol: '\r\n' | '\n',
): string {
  if (options.mode === 'extended') {
    const decoded = decodeExtendedEscapes(rawReplacement);
    return targetEol === '\n' ? decoded.replace(/\r\n/g, '\n') : decoded;
  }
  if (options.mode === 'regex') {
    // Support \n, \r\n, \t in regex replacements while preserving $1, $&, etc.
    let out = '';
    for (let i = 0; i < rawReplacement.length; i++) {
      const ch = rawReplacement[i];
      if (ch === '\\' && i + 1 < rawReplacement.length) {
        const next = rawReplacement[i + 1];
        if (next === 'n') {
          out += '\n';
          i++;
          continue;
        }
        if (next === 'r') {
          if (rawReplacement[i + 2] === '\\' && rawReplacement[i + 3] === 'n') {
            out += targetEol;
            i += 3;
            continue;
          }
          out += '\r';
          i++;
          continue;
        }
        if (next === 't') {
          out += '\t';
          i++;
          continue;
        }
        if (next === '\\') {
          out += '\\';
          i++;
          continue;
        }
      }
      out += ch;
    }
    return out;
  }
  return rawReplacement;
}

export function replaceAllMatches(
  text: string,
  query: string,
  replacement: string,
  options: SearchOptions,
  eol: 'CRLF' | 'LF' = 'LF',
): ReplaceResult {
  if (!query) return { text, count: 0, error: null };
  const { regex, error } = buildSearchRegex(query, options);
  if (error || !regex) return { text, count: 0, error };

  const targetEol: '\r\n' | '\n' = eol === 'CRLF' ? '\r\n' : '\n';
  const resolved = resolveReplacementString(replacement, options, targetEol);
  let count = 0;

  const nextText = text.replace(regex, (...args) => {
    const fullMatch = args[0] as string;
    if (fullMatch.length === 0) return fullMatch;
    count += 1;
    if (options.mode !== 'regex') return resolved;

    // Expand standard JS regex replacement tokens ($&, $1..$99, $$, $`, $')
    const offset = args[args.length - 2] as number;
    const whole = args[args.length - 1] as string;
    const captures = args.slice(1, args.length - 2) as (string | undefined)[];
    return resolved.replace(/\$(?:\$|&|`|'|(\d{1,2}))/g, (token, groupNum?: string) => {
      if (token === '$$') return '$';
      if (token === '$&') return fullMatch;
      if (token === '$`') return whole.slice(0, offset);
      if (token === "$'") return whole.slice(offset + fullMatch.length);
      if (groupNum) {
        const idx = Number.parseInt(groupNum, 10) - 1;
        return idx >= 0 && idx < captures.length ? (captures[idx] ?? '') : token;
      }
      return token;
    });
  });

  return { text: nextText, count, error: null };
}

export function replaceSingleMatch(
  text: string,
  match: TextMatch,
  query: string,
  replacement: string,
  options: SearchOptions,
  eol: 'CRLF' | 'LF' = 'LF',
): string {
  const slice = text.slice(match.start, match.end);
  const res = replaceAllMatches(slice, query, replacement, options, eol);
  if (res.error) return text;
  return text.slice(0, match.start) + res.text + text.slice(match.end);
}

export function countAcrossDocuments(
  docs: readonly NotepadDoc[],
  query: string,
  options: SearchOptions,
): { summaries: DocumentMatchSummary[]; total: number; error: string | null } {
  if (!query) return { summaries: [], total: 0, error: null };
  const summaries: DocumentMatchSummary[] = [];
  let total = 0;

  for (const doc of docs) {
    const res = findMatches(doc.content, query, options);
    if (res.error) return { summaries: [], total: 0, error: res.error };
    summaries.push({
      docId: doc.id,
      docName: doc.name,
      count: res.matches.length,
      matches: res.matches,
    });
    total += res.matches.length;
  }

  return { summaries, total, error: null };
}

/**
 * Smart selection matcher: finds every exact occurrence of ANY
 * selected text — single symbols (e.g. `,`, `;`, `->`), characters, words, or full sentences.
 */
export function findSelectionOccurrences(
  text: string,
  selectedText: string,
  caseSensitive = true,
): TextMatch[] {
  if (!selectedText || selectedText.length > 4000) return [];
  // Ignore selections that are purely whitespace newlines unless it's a single non-empty char
  if (selectedText.trim().length === 0 && selectedText.length > 1) return [];

  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? selectedText : selectedText.toLowerCase();
  const lineStarts = buildLineStarts(text);
  const matches: TextMatch[] = [];

  let pos = 0;
  while (pos <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, pos);
    if (found === -1) break;
    const end = found + needle.length;
    const sPos = offsetToLineColumn(lineStarts, found);
    const ePos = offsetToLineColumn(lineStarts, end);
    matches.push({
      start: found,
      end,
      line: sPos.line,
      column: sPos.column,
      endLine: ePos.line,
      endColumn: ePos.column,
      matchedText: text.slice(found, end),
    });
    pos = end;
    if (matches.length >= 10_000) break;
  }

  return matches;
}

export function findNextMatchIndex(
  matches: readonly TextMatch[],
  currentOffset: number,
  direction: 'next' | 'prev',
): number {
  if (matches.length === 0) return -1;
  if (direction === 'next') {
    for (let i = 0; i < matches.length; i++) {
      if (matches[i].start > currentOffset) return i;
    }
    return 0;
  }
  for (let i = matches.length - 1; i >= 0; i--) {
    if (matches[i].start < currentOffset) return i;
  }
  return matches.length - 1;
}

export function getTextStats(text: string): {
  lines: number;
  words: number;
  chars: number;
  bytes: number;
} {
  const chars = text.length;
  const lines = chars === 0 ? 1 : text.split(/\r\n|\n|\r/).length;
  const trimmed = text.trim();
  const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
  const bytes = new TextEncoder().encode(text).length;
  return { lines, words, chars, bytes };
}
