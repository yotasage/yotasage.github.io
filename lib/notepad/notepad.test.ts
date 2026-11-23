import assert from 'node:assert/strict';
import test from 'node:test';

import { applyEol, computeLineDiffStats, detectEol, guessLanguageFromFilename } from './diffStats';
import {
  countAcrossDocuments,
  decodeExtendedEscapes,
  findMatches,
  findNextMatchIndex,
  findSelectionOccurrences,
  getTextStats,
  replaceAllMatches,
  replaceSingleMatch,
} from './search';
import { createStarterWorkspace, exportWorkspaceJson, parseWorkspaceJson } from './storage';
import { DEFAULT_SEARCH_OPTIONS, NotepadDoc, SearchOptions } from './types';

test('Extended mode replaces \\r\\n with comma on both CRLF and LF texts', () => {
  const opts: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, mode: 'extended' };

  const crlfText = 'alpha\r\nbeta\r\ngamma';
  const r1 = replaceAllMatches(crlfText, '\\r\\n', ',', opts, 'CRLF');
  assert.equal(r1.error, null);
  assert.equal(r1.count, 2);
  assert.equal(r1.text, 'alpha,beta,gamma');

  const lfText = 'alpha\nbeta\ngamma';
  const r2 = replaceAllMatches(lfText, '\\r\\n', ', ', opts, 'LF');
  assert.equal(r2.error, null);
  assert.equal(r2.count, 2);
  assert.equal(r2.text, 'alpha, beta, gamma');
});

test('Extended mode splits comma-separated text back into lines with \\r\\n or \\n', () => {
  const opts: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, mode: 'extended' };
  const csv = 'R1,R2,R3';
  const toCrlf = replaceAllMatches(csv, ',', '\\r\\n', opts, 'CRLF');
  assert.equal(toCrlf.text, 'R1\r\nR2\r\nR3');
  assert.equal(toCrlf.count, 2);

  const toLf = replaceAllMatches(csv, ',', '\\r\\n', opts, 'LF');
  assert.equal(toLf.text, 'R1\nR2\nR3');
});

test('decodeExtendedEscapes handles tabs, newlines, null chars, and escaped backslashes', () => {
  assert.equal(decodeExtendedEscapes('a\\tb\\nc\\\\d\\r\\n'), 'a\tb\nc\\d\r\n');
});

test('Regex mode supports capture groups and surfaces invalid regex errors cleanly', () => {
  const opts: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, mode: 'regex' };
  const text = 'R1=10k\nR2=4.7k\nC1=100n';
  const res = replaceAllMatches(text, '([RC]\\d+)=([\\d.]+[kn])', '$1: $2', opts, 'LF');
  assert.equal(res.error, null);
  assert.equal(res.count, 3);
  assert.equal(res.text, 'R1: 10k\nR2: 4.7k\nC1: 100n');

  const invalid = findMatches(text, '(unclosed[', opts);
  assert.equal(invalid.matches.length, 0);
  assert.ok(invalid.error && invalid.error.length > 0);
});

test('Counts symbols, characters, words, and sentences accurately across one or multiple files', () => {
  const opts: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, mode: 'normal', caseSensitive: true };
  const text = 'a -> b -> c; a -> b.\nHello world. Hello world.';

  assert.equal(findMatches(text, '->', opts).matches.length, 3);
  assert.equal(findMatches(text, ';', opts).matches.length, 1);
  assert.equal(findMatches(text, 'Hello world.', opts).matches.length, 2);

  const docs: NotepadDoc[] = [
    { id: '1', name: 'a.txt', content: 'foo bar foo', language: 'plaintext', eol: 'LF', encoding: 'utf-8', encodingConfidence: 'exact', direction: 'ltr', createdAt: 1, updatedAt: 1 },
    { id: '2', name: 'b.txt', content: 'FOO baz foo', language: 'plaintext', eol: 'LF', encoding: 'utf-8', encodingConfidence: 'exact', direction: 'ltr', createdAt: 1, updatedAt: 1 },
  ];
  const insensitive = countAcrossDocuments(docs, 'foo', { ...DEFAULT_SEARCH_OPTIONS, caseSensitive: false });
  assert.equal(insensitive.total, 4);
  assert.equal(insensitive.summaries[0].count, 2);
  assert.equal(insensitive.summaries[1].count, 2);

  const wholeWord = findMatches('cat scatter cat_1 cat', 'cat', {
    ...DEFAULT_SEARCH_OPTIONS,
    wholeWord: true,
  });
  assert.equal(wholeWord.matches.length, 2);
});

test('replaceSingleMatch updates only the targeted occurrence', () => {
  const opts: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS };
  const text = 'one two one two one';
  const found = findMatches(text, 'one', opts).matches;
  assert.equal(found.length, 3);
  const updated = replaceSingleMatch(text, found[1], 'one', 'ONE', opts);
  assert.equal(updated, 'one two ONE two one');
});

test('Selection occurrence matcher highlights symbols, words, and sentences and navigates next/prev', () => {
  const text = 'Signal ok. Noise low. Signal ok.\nCheck: -> 10k -> 10k ->';
  const sentenceMatches = findSelectionOccurrences(text, 'Signal ok.', true);
  assert.equal(sentenceMatches.length, 2);
  assert.equal(sentenceMatches[0].line, 1);
  assert.equal(sentenceMatches[0].column, 1);
  assert.equal(sentenceMatches[1].column, 23);

  const arrowMatches = findSelectionOccurrences(text, '->', true);
  assert.equal(arrowMatches.length, 3);
  assert.equal(findNextMatchIndex(arrowMatches, arrowMatches[0].start, 'next'), 1);
  assert.equal(findNextMatchIndex(arrowMatches, arrowMatches[2].start, 'next'), 0);
  assert.equal(findNextMatchIndex(arrowMatches, arrowMatches[0].start, 'prev'), 2);
});

test('Diff stats, EOL helpers, language detection, and text stats behave deterministically', () => {
  const left = 'line1\nline2\nline3';
  const right = 'line1\nline2-edited\nline3\nline4';
  const stats = computeLineDiffStats(left, right, false);
  assert.equal(stats.identical, false);
  assert.equal(stats.removed, 1);
  assert.equal(stats.added, 2);
  assert.equal(stats.unchanged, 2);

  const wsDiff = computeLineDiffStats('  hello  \nworld', 'hello\nworld', true);
  assert.equal(wsDiff.identical, true);

  assert.equal(detectEol('a\r\nb'), 'CRLF');
  assert.equal(detectEol('a\nb'), 'LF');
  assert.equal(applyEol('a\nb\rc', 'CRLF'), 'a\r\nb\r\nc');
  assert.equal(guessLanguageFromFilename('script.ts'), 'typescript');
  assert.equal(guessLanguageFromFilename('notes.txt'), 'plaintext');
  assert.equal(guessLanguageFromFilename('measurements.csv'), 'csv');
  assert.equal(guessLanguageFromFilename('table.tsv'), 'csv');
  assert.equal(guessLanguageFromFilename('paper.tex'), 'latex');
  assert.equal(guessLanguageFromFilename('references.bib'), 'latex');
  assert.equal(guessLanguageFromFilename('main.py'), 'python');
  assert.equal(guessLanguageFromFilename('lib.rs'), 'rust');

  const ts = getTextStats('one two\nthree');
  assert.equal(ts.lines, 2);
  assert.equal(ts.words, 3);
  assert.equal(ts.chars, 13);
});

test('Workspace JSON export/import round-trips cleanly and rejects invalid input', () => {
  const starter = createStarterWorkspace();
  const json = exportWorkspaceJson(starter);
  const parsed = parseWorkspaceJson(json);
  assert.equal(parsed.error, null);
  assert.ok(parsed.state);
  assert.equal(parsed.state.docs.length, starter.docs.length);
  assert.equal(parsed.state.docs[0].content, starter.docs[0].content);

  const bad = parseWorkspaceJson('{"docs": []}');
  assert.equal(bad.state, null);
  assert.ok(bad.error);
});
