import assert from 'node:assert/strict';
import test from 'node:test';

import { applyExtractionTemplate, compileForExecution, executeRegex } from './engine';
import { REGEX_EXAMPLES } from './examples';
import { filterFlagsForFlavor, generateLanguageSnippet } from './flavors';
import { flattenTokens, parseRegexPattern } from './parser';
import { SYNTAX_REFERENCE_GROUPS } from './theory';

test('parser breaks down groups, named groups, character classes, quantifiers, and lookarounds', () => {
  const tokens = parseRegexPattern('^(?<year>\\d{4})-(?:0[1-9]|1[0-2])(?=-\\d{2})');
  assert.equal(tokens[0].kind, 'anchor');
  assert.equal(tokens[0].raw, '^');

  assert.equal(tokens[1].kind, 'namedGroup');
  assert.equal(tokens[1].groupName, 'year');
  assert.equal(tokens[1].groupIndex, 1);
  assert.equal(tokens[1].children?.[0].kind, 'shorthand');
  assert.equal(tokens[1].children?.[0].quantifier?.min, 4);
  assert.equal(tokens[1].children?.[0].quantifier?.max, 4);

  assert.equal(tokens[2].kind, 'literal');
  assert.equal(tokens[2].raw, '-');

  assert.equal(tokens[3].kind, 'nonCapturingGroup');
  assert.equal(tokens[4].kind, 'lookahead');
});

test('parser handles lazy and possessive quantifiers and extended mode comments', () => {
  const lazy = parseRegexPattern('<.+?>');
  assert.equal(lazy[1].kind, 'dot');
  assert.equal(lazy[1].quantifier?.mode, 'lazy');

  const verbose = parseRegexPattern('^\\d+ # digits\n  [a-z]+ # letters', true);
  const kinds = verbose.map((t) => t.kind);
  assert.deepEqual(kinds, ['anchor', 'shorthand', 'comment', 'charClass', 'comment']);
});

test('compileForExecution supports Python named groups, verbose /x, custom delimiters, and Go/Rust warnings', () => {
  const py = compileForExecution('(?P<word>\\w+) # word\n (?P=word)', 'python', ['g', 'x'], 'none');
  assert.equal(py.error, undefined);
  assert.equal(py.jsSource, '(?<word>\\w+)\\k<word>');

  const delimWarn = compileForExecution('https://example.com', 'pcre2', ['g'], '/');
  assert.ok(delimWarn.warnings.some((w) => w.code === 'unescaped-delimiter'));

  const delimOk = compileForExecution('https://example.com', 'pcre2', ['g'], '#');
  assert.equal(delimOk.warnings.some((w) => w.code === 'unescaped-delimiter'), false);

  const goWarn = compileForExecution('\\d+(?=px)', 'go', ['g'], 'none');
  assert.ok(goWarn.warnings.some((w) => w.code === 'lookahead-unsupported'));

  const rustBackrefWarn = compileForExecution('(\\w+)\\s+\\1', 'rust', ['g'], 'none');
  assert.ok(rustBackrefWarn.warnings.some((w) => w.code === 'backref-unsupported'));

  const invalid = compileForExecution('([unclosed', 'js', ['g'], '/');
  assert.ok(invalid.error);
});

test('executeRegex aligns individual sub-tokens and capturing groups to exact test text ranges', () => {
  const res = executeRegex('(?<user>[a-z]+)@(?<host>[a-z]+\\.[a-z]{2,})', 'Contact ada@labs.no or bob@dev.org.', 'js', ['g'], '/');
  assert.equal(res.valid, true);
  assert.equal(res.matches.length, 2);
  assert.equal(res.matches[0].fullMatch, 'ada@labs.no');
  assert.equal(res.matches[0].groups[0].name, 'user');
  assert.equal(res.matches[0].groups[0].value, 'ada');
  assert.equal(res.matches[0].groups[1].name, 'host');
  assert.equal(res.matches[0].groups[1].value, 'labs.no');

  // Verify non-group literal "@" token also mapped directly to '@' spans in the test text!
  const flat = flattenTokens(res.tokens);
  const atToken = flat.find((t) => t.kind === 'literal' && t.raw === '@');
  assert.ok(atToken);
  const atSpans = res.tokenSpansByTokenId[atToken.id];
  assert.equal(atSpans?.length, 2);
  assert.equal(atSpans?.[0].text, '@');
  assert.equal(atSpans?.[0].start, 11);
  assert.equal(atSpans?.[1].text, '@');
});

test('executeRegex guards against zero-length infinite loops', () => {
  const res = executeRegex('a*', 'bbb', 'js', ['g'], '/');
  assert.equal(res.valid, true);
  assert.equal(res.matches.length, 4);
  assert.equal(res.truncated, false);
});

test('executeRegex respects non-global mode (stops at first match)', () => {
  const res = executeRegex('\\d+', 'a1 b2 c3', 'js', [], '/');
  assert.equal(res.valid, true);
  assert.equal(res.matches.length, 1);
  assert.equal(res.matches[0].fullMatch, '1');
});

test('applyExtractionTemplate handles extract list mode and replace mode with named, numbered, and escape tokens', () => {
  const text = '2026-01-15 and 2026-11-26';
  const exec = executeRegex('(?<y>\\d{4})-(?<m>\\d{2})-(?<d>\\d{2})', text, 'js', ['g'], '/');

  const extracted = applyExtractionTemplate(text, exec.matches, '$i: $<d>.$<m>.$<y> ($$)', 'extract', 'comma');
  assert.equal(extracted.output, '1: 15.01.2026 ($), 2: 26.11.2026 ($)');

  const pyExtracted = applyExtractionTemplate(text, exec.matches, '\\g<d>/\\2/\\1', 'extract', 'newline');
  assert.equal(pyExtracted.output, '15/01/2026\n26/11/2026');

  const replaced = applyExtractionTemplate(text, exec.matches, '$3.$2.$1', 'replace');
  assert.equal(replaced.output, '15.01.2026 and 26.11.2026');

  const jsonOut = applyExtractionTemplate(text, exec.matches, '$0', 'extract', 'json');
  assert.deepEqual(JSON.parse(jsonOut.output), ['2026-01-15', '2026-11-26']);
});

test('all built-in examples compile cleanly and match at least twice', () => {
  for (const ex of REGEX_EXAMPLES) {
    const res = executeRegex(ex.pattern, ex.testText, ex.flavor, ex.flags, ex.delimiter);
    assert.equal(res.valid, true, `Example "${ex.id}" failed: ${res.error}`);
    assert.ok(res.matches.length >= 2, `Example "${ex.id}" expected >=2 matches, got ${res.matches.length}`);
    const out = applyExtractionTemplate(ex.testText, res.matches, ex.template, ex.extractionMode, ex.joinMode);
    assert.ok(out.output.length > 0, `Example "${ex.id}" produced empty template output`);
  }
});

test('all theory try-snippets compile cleanly and produce matches', () => {
  for (const group of SYNTAX_REFERENCE_GROUPS) {
    for (const row of group.rows) {
      const s = row.trySnippet;
      const res = executeRegex(s.pattern, s.testText, s.flavor ?? 'js', s.flags, s.delimiter ?? '/');
      assert.equal(res.valid, true, `Theory row "${row.token}" failed: ${res.error}`);
      assert.ok(res.matches.length > 0, `Theory row "${row.token}" expected >0 matches`);
    }
  }
});

test('flavor helpers filter unsupported flags and generate language snippets', () => {
  assert.deepEqual(filterFlagsForFlavor(['g', 'x', 'y'], 'go'), ['g']);
  assert.deepEqual(filterFlagsForFlavor(['g', 'x', 'y'], 'js'), ['g', 'y']);

  const pyCode = generateLanguageSnippet({
    flavor: 'python',
    pattern: '(?P<n>\\d+)',
    flags: ['g', 'i'],
    delimiter: 'none',
    template: 'val=$<n>',
    extractionMode: 'extract',
  });
  assert.ok(pyCode.includes('re.compile'));
  assert.ok(pyCode.includes('re.IGNORECASE'));
  assert.ok(pyCode.includes('\\g<n>'));

  const pcreCode = generateLanguageSnippet({
    flavor: 'pcre2',
    pattern: 'https://example.com',
    flags: ['g', 'i'],
    delimiter: '#',
    template: '$0',
    extractionMode: 'extract',
  });
  assert.ok(pcreCode.includes('#https://example.com#i'));
});
