import assert from 'node:assert/strict';
import test from 'node:test';

import {
  alignDelimitedText,
  buildDelimitedTable,
  detectDelimiter,
  filterTableRows,
  isNumericCell,
  parseDelimitedRow,
  shrinkDelimitedText,
  sortTableRows,
} from './csvTools';

test('detectDelimiter identifies comma, semicolon, tab, pipe, colon, and file extension hints', () => {
  assert.equal(detectDelimiter('name,age,score\nalice,30,98.5\nbob,25,87'), ',');
  assert.equal(detectDelimiter('name;age;score\nalice;30;98,5\nbob;25;87,2'), ';');
  assert.equal(detectDelimiter('name\tage\tscore\nalice\t30\t98\nbob\t25\t87'), '\t');
  assert.equal(detectDelimiter('name|age|score\nalice|30|98\nbob|25|87'), '|');
  assert.equal(detectDelimiter('root:x:0:0:root\ndaemon:x:1:1:daemon'), ':');

  // Strong extension hints
  assert.equal(detectDelimiter('a,b,c\n1,2,3', 'metrics.tsv'), '\t');
  assert.equal(detectDelimiter('a,b,c\n1,2,3', 'records.PSV'), '|');

  // Ignores comments, blank lines, and delimiters inside quotes
  assert.equal(
    detectDelimiter('# a;b;c;d;e\n\n"a;b",10\n"c;d",20'),
    ',',
  );

  // Timestamps with colons should not override commas
  assert.equal(
    detectDelimiter('event,time\nstart,12:30:00\nstop,13:45:10'),
    ',',
  );

  // Fallback to comma on empty or delimiter-free text
  assert.equal(detectDelimiter(''), ',');
  assert.equal(detectDelimiter('just one column'), ',');
});

test('parseDelimitedRow handles RFC-4180 quotes, embedded delimiters, escaped quotes, and alignment spaces', () => {
  const row = parseDelimitedRow('Alice, "hello, world", "say ""hi""", 42', ',');
  assert.equal(row.fields.length, 4);
  assert.deepEqual(row.fields[0], { raw: 'Alice', value: 'Alice', quoted: false });
  assert.deepEqual(row.fields[1], { raw: '"hello, world"', value: 'hello, world', quoted: true });
  assert.deepEqual(row.fields[2], { raw: '"say ""hi"""', value: 'say "hi"', quoted: true });
  assert.deepEqual(row.fields[3], { raw: ' 42', value: '42', quoted: false });

  // Preserves internal whitespace inside quoted fields
  const spaced = parseDelimitedRow('  "  keep me  "  ,  trim me  ', ',');
  assert.deepEqual(spaced.fields[0], { raw: '"  keep me  "', value: '  keep me  ', quoted: true });
  assert.deepEqual(spaced.fields[1], { raw: '  trim me  ', value: 'trim me', quoted: false });

  // Trailing empty field
  const trailing = parseDelimitedRow('a,b,', ',');
  assert.equal(trailing.fields.length, 3);
  assert.equal(trailing.fields[2].value, '');
});

test('isNumericCell recognizes standard numbers, sci notation, currency, percentages, and NaN/Inf', () => {
  for (const ok of ['0', '42', '-3.14', '+0.5', '.5', '1e-6', '2.5E+8', '99.5%', '$19.99', '-€1,234.50', 'NaN', '-Inf', 'Infinity']) {
    assert.equal(isNumericCell(ok), true, `expected numeric: ${ok}`);
  }
  for (const bad of ['', '   ', 'abc', '12px', '12:30:00', '2026-01-01', '1.2.3', '$', '%', '.']) {
    assert.equal(isNumericCell(bad), false, `expected non-numeric: ${bad}`);
  }
});

test('alignDelimitedText auto-aligns numeric columns right, keeps header left, preserves comments, blank lines, and CRLF', () => {
  const input = [
    '# Sensor log',
    '',
    'part,qty,price,note',
    'R1,5,$0.10,"10k, 1%"',
    'CAP100,120,$12.50,"low ESR"',
  ].join('\r\n');

  const aligned = alignDelimitedText(input, { alignment: 'auto', hasHeader: true });
  assert.equal(aligned.error, null);
  assert.equal(aligned.delimiter, ',');
  assert.equal(aligned.rowCount, 3);
  assert.equal(aligned.colCount, 4);
  assert.ok(aligned.output.includes('\r\n'));

  const lines = aligned.output.split('\r\n');
  assert.equal(lines[0], '# Sensor log');
  assert.equal(lines[1], '');
  // Header row left-aligned, numeric columns right-aligned on data rows, zero trailing spaces
  assert.equal(lines[2], 'part  , qty, price , note');
  assert.equal(lines[3], 'R1    ,   5,  $0.10, "10k, 1%"');
  assert.equal(lines[4], 'CAP100, 120, $12.50, "low ESR"');

  for (const line of lines) {
    assert.equal(line, line.trimEnd(), `unexpected trailing whitespace in: "${line}"`);
  }

  // Explicit left and right alignment modes
  const leftAligned = alignDelimitedText('a,b\n1,200\n30,4', { alignment: 'left' });
  assert.equal(leftAligned.output, 'a , b\n1 , 200\n30, 4');

  const rightAligned = alignDelimitedText('a,b\n1,200\n30,4', { alignment: 'right' });
  assert.equal(rightAligned.output, ' a,   b\n 1, 200\n30,   4');
});

test('shrinkDelimitedText round-trips aligned CSV and TSV without corrupting quoted spaces or comments', () => {
  const original = [
    '# Header comment',
    'name,note,amount',
    'Alice,"  foo,  bar  ",10',
    'Bob,"say ""ok""",250',
    '',
  ].join('\n');

  const aligned = alignDelimitedText(original);
  const shrunk = shrinkDelimitedText(aligned.output);
  assert.equal(shrunk.error, null);
  assert.equal(shrunk.delimiter, ',');
  assert.equal(shrunk.rowCount, 3);
  assert.equal(shrunk.output, original);

  // Tab-delimited round-trip
  const tsv = 'key\tval\na\t1\nlongkey\t200';
  const tsvAligned = alignDelimitedText(tsv, { fileName: 'data.tsv' });
  assert.equal(tsvAligned.delimiter, '\t');
  assert.ok(tsvAligned.output.includes('\t'));
  const tsvShrunk = shrinkDelimitedText(tsvAligned.output, 'auto', 'data.tsv');
  assert.equal(tsvShrunk.output, tsv);
});

test('buildDelimitedTable parses headers, generates headers when hasHeader=false, infers colTypes, and respects maxRows', () => {
  const csv = '# comment\nitem,qty,cost\nResistor,10,$0.05\nCapacitor,2,$1.20\nInductor,5,$0.80';

  const withHeader = buildDelimitedTable(csv, { hasHeader: true });
  assert.equal(withHeader.delimiter, ',');
  assert.deepEqual(withHeader.headers, ['item', 'qty', 'cost']);
  assert.deepEqual(withHeader.colTypes, ['text', 'number', 'number']);
  assert.equal(withHeader.colCount, 3);
  assert.equal(withHeader.totalRows, 3);
  assert.equal(withHeader.rows.length, 3);

  const capped = buildDelimitedTable(csv, { hasHeader: true, maxRows: 2 });
  assert.equal(capped.totalRows, 3);
  assert.equal(capped.rows.length, 2);

  const noHeader = buildDelimitedTable('10,foo\n20,bar', { hasHeader: false });
  assert.deepEqual(noHeader.headers, ['Column 1', 'Column 2']);
  assert.deepEqual(noHeader.colTypes, ['number', 'text']);
  assert.equal(noHeader.rows.length, 2);
});

test('sortTableRows supports numeric vs lexical sorting and filterTableRows filters case-insensitively', () => {
  const rows = [
    ['Beta', '100'],
    ['alpha', '2'],
    ['Gamma', '10'],
    ['Delta', ''],
  ];

  const numAsc = sortTableRows(rows, 1, 'asc', 'number');
  assert.deepEqual(
    numAsc.map((r) => r[1]),
    ['2', '10', '100', ''],
  );
  // Original array not mutated
  assert.equal(rows[0][0], 'Beta');

  const numDesc = sortTableRows(rows, 1, 'desc', 'number');
  assert.deepEqual(
    numDesc.map((r) => r[1]),
    ['100', '10', '2', ''],
  );

  const lexAsc = sortTableRows(rows, 1, 'asc', 'text');
  assert.deepEqual(
    lexAsc.map((r) => r[1]),
    ['', '10', '100', '2'],
  );

  const nameAsc = sortTableRows(rows, 0, 'asc', 'text');
  assert.deepEqual(
    nameAsc.map((r) => r[0]),
    ['alpha', 'Beta', 'Delta', 'Gamma'],
  );

  assert.deepEqual(filterTableRows(rows, 'GAM'), [['Gamma', '10']]);
  assert.deepEqual(filterTableRows(rows, '10'), [
    ['Beta', '100'],
    ['Gamma', '10'],
  ]);
  assert.equal(filterTableRows(rows, '   ').length, 4);
});
