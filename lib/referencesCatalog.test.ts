import assert from 'node:assert/strict';
import test from 'node:test';

import { BibEntry } from './bibtex';
import {
  extractYear,
  filterAndSortReferences,
  formatBibtexEntry,
  IndexedReference,
  scanCitedKeysFromSource,
} from './referencesCatalog';
import { loadIndexedReferences } from './referencesIndex';

const SAMPLE_ITEMS: IndexedReference[] = [
  {
    bibIndex: 0,
    citedBy: ['/simsetup/main'],
    entry: {
      type: 'online',
      key: 'AD',
      fields: {
        organization: 'Analog Devices',
        title: 'Coherent Sampling vs. Window Sampling',
        url: 'https://www.analog.com/example',
      },
    },
  },
  {
    bibIndex: 1,
    citedBy: ['/resistor/main', '/smith-chart/main'],
    entry: {
      type: 'online',
      key: 'WikiE',
      fields: {
        title: 'E series of preferred numbers',
        howpublished: 'Wikipedia',
      },
    },
  },
  {
    bibIndex: 2,
    citedBy: ['/resistor/main'],
    entry: {
      type: 'article',
      key: 'Nyquist1928',
      fields: {
        author: 'Nyquist, H.',
        title: 'Thermal Agitation of Electric Charge in Conductors',
        journal: 'Physical Review',
        date: '1928-07-01',
        doi: '10.1103/PhysRev.32.110',
      },
    },
  },
  {
    bibIndex: 3,
    citedBy: [],
    entry: {
      type: 'book',
      key: 'HorowitzHill',
      fields: {
        author: 'Horowitz, Paul and Hill, Winfield',
        title: 'The Art of Electronics',
        year: '2015',
      },
    },
  },
];

const TOOL_LABELS = new Map<string, string>([
  ['/simsetup/main', 'FFT & coherent sampling'],
  ['/resistor/main', 'Resistor lookup'],
  ['/smith-chart/main', 'Smith chart'],
]);

test('extractYear reads year and ISO date fields', () => {
  assert.equal(extractYear(SAMPLE_ITEMS[0].entry), null);
  assert.equal(extractYear(SAMPLE_ITEMS[2].entry), 1928);
  assert.equal(extractYear(SAMPLE_ITEMS[3].entry), 2015);
});

test('formatBibtexEntry aligns fields and wraps values in braces', () => {
  const entry: BibEntry = {
    type: 'article',
    key: 'Nyquist1928',
    fields: { author: 'Nyquist, H.', year: '1928' },
  };
  assert.equal(
    formatBibtexEntry(entry),
    '@article{Nyquist1928,\n  author = {Nyquist, H.},\n  year   = {1928},\n}',
  );
});

test('scanCitedKeysFromSource ignores comments and matches exact string literals only', () => {
  const known = new Set(['AD', 'AN9675', 'WikiE', 'Nyquist1928']);
  const source = `
    // bib.cite('AD') should be ignored in line comments
    /* bib.cite("AN9675") should be ignored in block comments */
    const a = bib.cite('WikiE');
    const b = "Nyquist1928";
    const partial = "not_AD_key";
    const templ = \`AD\`;
  `;
  assert.deepEqual(scanCitedKeysFromSource(source, known), ['WikiE', 'Nyquist1928', 'AD']);
});

test('filterAndSortReferences filters by tool, cited/uncited, entry type, and query', () => {
  const all = filterAndSortReferences(
    SAMPLE_ITEMS,
    { query: '', tool: 'all', entryType: 'all', sort: 'bib' },
    TOOL_LABELS,
  );
  assert.deepEqual(
    all.map((x) => x.entry.key),
    ['AD', 'WikiE', 'Nyquist1928', 'HorowitzHill'],
  );

  const uncited = filterAndSortReferences(
    SAMPLE_ITEMS,
    { query: '', tool: 'uncited', entryType: 'all', sort: 'bib' },
    TOOL_LABELS,
  );
  assert.deepEqual(
    uncited.map((x) => x.entry.key),
    ['HorowitzHill'],
  );

  const byTool = filterAndSortReferences(
    SAMPLE_ITEMS,
    { query: '', tool: '/resistor/main', entryType: 'all', sort: 'bib' },
    TOOL_LABELS,
  );
  assert.deepEqual(
    byTool.map((x) => x.entry.key),
    ['WikiE', 'Nyquist1928'],
  );

  const byType = filterAndSortReferences(
    SAMPLE_ITEMS,
    { query: '', tool: 'all', entryType: 'article', sort: 'bib' },
    TOOL_LABELS,
  );
  assert.deepEqual(
    byType.map((x) => x.entry.key),
    ['Nyquist1928'],
  );

  const byQuery = filterAndSortReferences(
    SAMPLE_ITEMS,
    { query: 'smith preferred', tool: 'all', entryType: 'all', sort: 'bib' },
    TOOL_LABELS,
  );
  assert.deepEqual(
    byQuery.map((x) => x.entry.key),
    ['WikiE'],
  );
});

test('filterAndSortReferences sorts by citations, key, and year', () => {
  const byCitations = filterAndSortReferences(
    SAMPLE_ITEMS,
    { query: '', tool: 'all', entryType: 'all', sort: 'citations' },
    TOOL_LABELS,
  );
  assert.equal(byCitations[0].entry.key, 'WikiE');
  assert.equal(byCitations[byCitations.length - 1].entry.key, 'HorowitzHill');

  const newest = filterAndSortReferences(
    SAMPLE_ITEMS,
    { query: '', tool: 'all', entryType: 'all', sort: 'year-desc' },
    TOOL_LABELS,
  );
  assert.deepEqual(
    newest.map((x) => x.entry.key),
    ['HorowitzHill', 'Nyquist1928', 'AD', 'WikiE'],
  );

  const oldest = filterAndSortReferences(
    SAMPLE_ITEMS,
    { query: '', tool: 'all', entryType: 'all', sort: 'year-asc' },
    TOOL_LABELS,
  );
  assert.deepEqual(
    oldest.map((x) => x.entry.key),
    ['Nyquist1928', 'HorowitzHill', 'AD', 'WikiE'],
  );

  const byKey = filterAndSortReferences(
    SAMPLE_ITEMS,
    { query: '', tool: 'all', entryType: 'all', sort: 'key' },
    TOOL_LABELS,
  );
  assert.deepEqual(
    byKey.map((x) => x.entry.key),
    ['AD', 'HorowitzHill', 'Nyquist1928', 'WikiE'],
  );
});

test('loadIndexedReferences indexes real references.bib and maps citing tools accurately', () => {
  const { items, tools } = loadIndexedReferences();
  assert.ok(items.length > 100, `expected >100 entries in references.bib, got ${items.length}`);
  assert.deepEqual(
    tools.map((t) => t.route),
    ['/simsetup/main', '/resistor/main', '/smith-chart/main', '/em-sim/main'],
  );

  const byKey = new Map(items.map((item) => [item.entry.key, item]));
  assert.deepEqual(byKey.get('AD')?.citedBy, ['/simsetup/main']);
  assert.deepEqual(byKey.get('WikiE')?.citedBy, ['/resistor/main', '/smith-chart/main']);
  assert.deepEqual(byKey.get('Ellingson2018')?.citedBy, ['/smith-chart/main', '/em-sim/main']);
  assert.deepEqual(byKey.get('HorowitzHill')?.citedBy, []);
});
