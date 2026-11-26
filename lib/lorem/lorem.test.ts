import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampInt,
  countSentences,
  countWords,
  DEFAULT_OPTIONS,
  generateLorem,
  getFormatFileExtension,
  LOREM_PRESETS,
} from './generate';

test('default paragraphs mode produces 3 paragraphs of 50 words each starting with Lorem ipsum', () => {
  const res = generateLorem(DEFAULT_OPTIONS);
  assert.equal(res.blocks.length, 3);
  assert.equal(res.stats.paragraphs, 3);
  assert.equal(res.stats.words, 150);
  for (const block of res.blocks) {
    assert.equal(countWords(block.text), 50);
  }
  assert.ok(res.blocks[0].text.startsWith('Lorem ipsum dolor sit amet, consectetur adipiscing elit'));
});

test('paragraphs mode honors exact wordsPerParagraph across custom counts', () => {
  const res = generateLorem({
    mode: 'paragraphs',
    paragraphs: 5,
    wordsPerParagraph: 30,
    varyParagraphLength: false,
    seed: 42,
  });
  assert.equal(res.blocks.length, 5);
  assert.equal(res.stats.words, 150);
  for (const block of res.blocks) {
    assert.equal(countWords(block.text), 30);
  }
});

test('paragraphs mode with varyParagraphLength stays within ±25% bounds', () => {
  const res = generateLorem({
    mode: 'paragraphs',
    paragraphs: 12,
    wordsPerParagraph: 60,
    varyParagraphLength: true,
    seed: 123,
  });
  assert.equal(res.blocks.length, 12);
  const counts = res.blocks.map((b) => countWords(b.text));
  for (const c of counts) {
    assert.ok(c >= 45 && c <= 75, `expected ${c} in [45, 75]`);
  }
  const uniqueCounts = new Set(counts);
  assert.ok(uniqueCounts.size > 1, 'expected varied paragraph lengths');
});

test('words mode produces exact total word count both as single block and split paragraphs', () => {
  const single = generateLorem({
    mode: 'words',
    totalWords: 75,
    wordParagraphs: 1,
    seed: 7,
  });
  assert.equal(single.blocks.length, 1);
  assert.equal(single.stats.words, 75);
  assert.equal(countWords(single.plainText), 75);

  const split = generateLorem({
    mode: 'words',
    totalWords: 100,
    wordParagraphs: 3,
    seed: 7,
  });
  assert.equal(split.blocks.length, 3);
  assert.equal(split.stats.words, 100);
  assert.deepEqual(
    split.blocks.map((b) => countWords(b.text)),
    [34, 33, 33],
  );
});

test('words mode handles small edge cases (1 word, 3 words)', () => {
  const one = generateLorem({ mode: 'words', totalWords: 1, wordParagraphs: 4, seed: 1 });
  assert.equal(one.blocks.length, 1);
  assert.equal(one.stats.words, 1);

  const three = generateLorem({ mode: 'words', totalWords: 3, wordParagraphs: 1, seed: 1 });
  assert.equal(three.stats.words, 3);
  assert.ok(three.plainText.endsWith('.'));
});

test('sentences mode produces exact sentence count', () => {
  const res = generateLorem({
    mode: 'sentences',
    sentences: 7,
    wordsPerSentence: 12,
    seed: 19,
  });
  assert.equal(res.blocks.length, 1);
  assert.equal(countSentences(res.plainText), 7);
});

test('list mode produces exact item count and words per item', () => {
  const res = generateLorem({
    mode: 'list',
    listItems: 6,
    wordsPerItem: 8,
    format: 'markdown',
    seed: 99,
  });
  assert.equal(res.blocks.length, 6);
  for (const b of res.blocks) {
    assert.equal(countWords(b.text), 8);
  }
  const lines = res.output.split('\n');
  assert.equal(lines.length, 6);
  assert.ok(lines.every((l) => l.startsWith('- ')));
});

test('characters mode produces exact character count', () => {
  for (const target of [25, 140, 160, 280, 500]) {
    const res = generateLorem({
      mode: 'characters',
      characters: target,
      seed: target,
    });
    assert.equal(res.plainText.length, target, `expected exact length ${target}`);
    assert.equal(res.stats.characters, target);
  }
});

test('output formats render valid HTML, Markdown, JSON, and LaTeX', () => {
  const html = generateLorem({
    mode: 'paragraphs',
    paragraphs: 2,
    wordsPerParagraph: 20,
    includeHeadings: true,
    format: 'html',
    seed: 5,
  });
  assert.ok(html.output.includes('<h2>'));
  assert.ok(html.output.includes('<p>'));

  const md = generateLorem({
    mode: 'paragraphs',
    paragraphs: 2,
    wordsPerParagraph: 20,
    includeHeadings: true,
    format: 'markdown',
    seed: 5,
  });
  assert.ok(md.output.includes('## '));

  const json = generateLorem({
    mode: 'paragraphs',
    paragraphs: 2,
    wordsPerParagraph: 20,
    includeHeadings: false,
    format: 'json',
    seed: 5,
  });
  const parsed = JSON.parse(json.output) as string[];
  assert.equal(parsed.length, 2);

  const tex = generateLorem({
    mode: 'list',
    listItems: 3,
    wordsPerItem: 5,
    format: 'latex',
    seed: 5,
  });
  assert.ok(tex.output.includes('\\begin{itemize}'));
  assert.ok(tex.output.includes('\\item '));
  assert.ok(tex.output.includes('\\end{itemize}'));

  assert.equal(getFormatFileExtension('plain'), '.txt');
  assert.equal(getFormatFileExtension('html'), '.html');
  assert.equal(getFormatFileExtension('markdown'), '.md');
  assert.equal(getFormatFileExtension('json'), '.json');
  assert.equal(getFormatFileExtension('latex'), '.tex');
});

test('all styles generate distinct corpora and Norwegian includes Nordic diacritics', () => {
  const classic = generateLorem({ style: 'classic', mode: 'words', totalWords: 80, seed: 3 });
  const cicero = generateLorem({ style: 'cicero', mode: 'words', totalWords: 80, startWithLorem: true, seed: 3 });
  const english = generateLorem({ style: 'english', mode: 'words', totalWords: 80, seed: 3 });
  const norwegian = generateLorem({ style: 'norwegian', mode: 'words', totalWords: 120, seed: 3 });

  assert.ok(cicero.plainText.startsWith('Sed ut perspiciatis'));
  assert.notEqual(classic.plainText, english.plainText);
  assert.match(norwegian.plainText, /[æøåÆØÅ]/);
});

test('determinism: identical seeds yield identical output and different seeds differ', () => {
  const a = generateLorem({ mode: 'paragraphs', paragraphs: 2, wordsPerParagraph: 30, startWithLorem: false, seed: 777 });
  const b = generateLorem({ mode: 'paragraphs', paragraphs: 2, wordsPerParagraph: 30, startWithLorem: false, seed: 777 });
  const c = generateLorem({ mode: 'paragraphs', paragraphs: 2, wordsPerParagraph: 30, startWithLorem: false, seed: 778 });

  assert.equal(a.output, b.output);
  assert.notEqual(a.output, c.output);
});

test('presets and clamping stay safe on extreme inputs', () => {
  assert.equal(clampInt(-5, 1, 100), 1);
  assert.equal(clampInt(999999, 1, 100), 100);
  assert.equal(clampInt(Number.NaN, 5, 50), 5);

  for (const preset of LOREM_PRESETS) {
    const res = generateLorem(preset.options);
    assert.ok(res.output.length > 0, `preset ${preset.id} should produce output`);
    assert.ok(res.stats.words > 0, `preset ${preset.id} should have words`);
  }
});
