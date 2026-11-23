// Pure, browser-safe helpers for the site-wide /references catalog:
// search indexing, filtering by citing tool or entry type, sorting, BibTeX formatting,
// and source-string citation key extraction.

import { BibEntry, formatNames, latexToText } from './bibtex';

export interface ToolRefInfo {
  route: string;
  /** Translation key in lib/ui/translations.ts when available (e.g. 'home.tool.resistor.title'). */
  titleKey?: string;
  /** English fallback title for routes without a dedicated home.tool.*.title key. */
  fallbackTitle: string;
  /** Number of distinct references.bib entries cited by this tool. */
  count: number;
}

export interface IndexedReference {
  entry: BibEntry;
  /** Zero-based index in references.bib (preserves original file order). */
  bibIndex: number;
  /** Routes of tools that cite this entry, ordered consistently. */
  citedBy: string[];
}

export type ToolFilter = 'all' | 'cited' | 'uncited' | string;
export type EntryTypeFilter = 'all' | string;
export type SortMode = 'bib' | 'key' | 'year-desc' | 'year-asc' | 'citations';

export interface ReferencesFilterState {
  query: string;
  tool: ToolFilter;
  entryType: EntryTypeFilter;
  sort: SortMode;
}

const YEAR_RE = /\b(\d{4})\b/;

/** Extracts a 4-digit publication year from `year` or `date` fields, or null when absent. */
export function extractYear(entry: BibEntry): number | null {
  const raw = entry.fields.year ?? entry.fields.date;
  if (!raw) return null;
  const m = YEAR_RE.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1000 && n <= 9999 ? n : null;
}

/** Reconstructs a clean BibTeX entry string from a parsed BibEntry. */
export function formatBibtexEntry(entry: BibEntry): string {
  const fieldEntries = Object.entries(entry.fields);
  if (fieldEntries.length === 0) {
    return `@${entry.type}{${entry.key},\n}`;
  }
  const pad = Math.max(...fieldEntries.map(([name]) => name.length));
  const lines = fieldEntries.map(([name, value]) => `  ${name.padEnd(pad)} = {${value}},`);
  return `@${entry.type}{${entry.key},\n${lines.join('\n')}\n}`;
}

/** Normalizes an entry's metadata and citing tool names into one lowercase search string. */
export function buildSearchableText(
  item: IndexedReference,
  toolLabels: ReadonlyMap<string, string>,
): string {
  const f = item.entry.fields;
  const parts: string[] = [item.entry.key, item.entry.type];

  if (f.author) {
    parts.push(latexToText(f.author), formatNames(f.author));
  }
  if (f.editor) {
    parts.push(latexToText(f.editor), formatNames(f.editor));
  }

  for (const fieldName of [
    'title',
    'organization',
    'institution',
    'journal',
    'booktitle',
    'howpublished',
    'publisher',
    'type',
    'number',
    'year',
    'date',
    'doi',
    'url',
    'note',
  ]) {
    const value = f[fieldName];
    if (value) parts.push(latexToText(value));
  }

  for (const route of item.citedBy) {
    const label = toolLabels.get(route);
    if (label) parts.push(label);
  }

  return parts.join(' ').toLowerCase();
}

/** Filters and sorts indexed references according to user toolbar controls. */
export function filterAndSortReferences(
  items: readonly IndexedReference[],
  state: ReferencesFilterState,
  toolLabels: ReadonlyMap<string, string>,
): IndexedReference[] {
  const tokens = state.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  const filtered = items.filter((item) => {
    if (state.tool === 'cited' && item.citedBy.length === 0) return false;
    if (state.tool === 'uncited' && item.citedBy.length > 0) return false;
    if (
      state.tool !== 'all' &&
      state.tool !== 'cited' &&
      state.tool !== 'uncited' &&
      !item.citedBy.includes(state.tool)
    ) {
      return false;
    }

    if (state.entryType !== 'all' && item.entry.type !== state.entryType) {
      return false;
    }

    if (tokens.length > 0) {
      const hay = buildSearchableText(item, toolLabels);
      for (const token of tokens) {
        if (!hay.includes(token)) return false;
      }
    }

    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    switch (state.sort) {
      case 'bib':
        return a.bibIndex - b.bibIndex;
      case 'key':
        return a.entry.key.localeCompare(b.entry.key, 'en', { sensitivity: 'base' });
      case 'year-desc': {
        const ya = extractYear(a.entry);
        const yb = extractYear(b.entry);
        if (ya === null && yb === null) return a.bibIndex - b.bibIndex;
        if (ya === null) return 1;
        if (yb === null) return -1;
        return yb - ya || a.bibIndex - b.bibIndex;
      }
      case 'year-asc': {
        const ya = extractYear(a.entry);
        const yb = extractYear(b.entry);
        if (ya === null && yb === null) return a.bibIndex - b.bibIndex;
        if (ya === null) return 1;
        if (yb === null) return -1;
        return ya - yb || a.bibIndex - b.bibIndex;
      }
      case 'citations': {
        const diff = b.citedBy.length - a.citedBy.length;
        return diff !== 0 ? diff : a.bibIndex - b.bibIndex;
      }
    }
  });

  return sorted;
}

/**
 * Strips // and /* *\/ comments from JS/TS source and returns every string literal
 * value that exactly matches a key in `knownKeys` (in first-seen order).
 */
export function scanCitedKeysFromSource(
  source: string,
  knownKeys: ReadonlySet<string>,
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const record = (value: string) => {
    if (knownKeys.has(value) && !seen.has(value)) {
      seen.add(value);
      found.push(value);
    }
  };

  let i = 0;
  const len = source.length;
  while (i < len) {
    const ch = source[i];
    const next = source[i + 1];

    // Line comment
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < len && source[i] !== '\n') i++;
      continue;
    }

    // Block comment
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // Single- or double-quoted string literal
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      let value = '';
      while (i < len) {
        const c = source[i];
        if (c === '\\' && i + 1 < len) {
          value += source[i + 1];
          i += 2;
          continue;
        }
        if (c === quote) {
          i++;
          break;
        }
        if (c === '\n') break;
        value += c;
        i++;
      }
      record(value);
      continue;
    }

    // Template literal (simple uninterpolated literal matches)
    if (ch === '`') {
      i++;
      let value = '';
      let hasExpr = false;
      while (i < len) {
        const c = source[i];
        if (c === '\\' && i + 1 < len) {
          value += source[i + 1];
          i += 2;
          continue;
        }
        if (c === '$' && source[i + 1] === '{') {
          hasExpr = true;
          // Skip until matching closing brace (simple nesting)
          i += 2;
          let depth = 1;
          while (i < len && depth > 0) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') depth--;
            i++;
          }
          continue;
        }
        if (c === '`') {
          i++;
          break;
        }
        value += c;
        i++;
      }
      if (!hasExpr) record(value);
      continue;
    }

    i++;
  }

  return found;
}
