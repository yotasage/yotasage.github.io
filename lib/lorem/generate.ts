import { CLASSIC_OPENING_WORDS, getCorpusWords, STYLE_HEADINGS } from './corpora';
import type { LoremBlock, LoremFormat, LoremOptions, LoremPreset, LoremResult, LoremStats, LoremStyle } from './types';

export const LIMITS = {
  paragraphs: { min: 1, max: 100 },
  wordsPerParagraph: { min: 5, max: 500 },
  totalWords: { min: 1, max: 10000 },
  wordParagraphs: { min: 1, max: 50 },
  sentences: { min: 1, max: 200 },
  wordsPerSentence: { min: 4, max: 40 },
  listItems: { min: 1, max: 100 },
  wordsPerItem: { min: 2, max: 40 },
  characters: { min: 10, max: 50000 },
} as const;

export const DEFAULT_OPTIONS: LoremOptions = {
  mode: 'paragraphs',
  style: 'classic',
  format: 'plain',
  paragraphs: 3,
  wordsPerParagraph: 50,
  varyParagraphLength: false,
  totalWords: 100,
  wordParagraphs: 1,
  sentences: 5,
  wordsPerSentence: 14,
  listItems: 6,
  wordsPerItem: 9,
  characters: 160,
  startWithLorem: true,
  includeHeadings: false,
  seed: 1,
};

export const LOREM_PRESETS: readonly LoremPreset[] = [
  {
    id: 'card',
    options: {
      mode: 'paragraphs',
      paragraphs: 1,
      wordsPerParagraph: 22,
      varyParagraphLength: false,
      includeHeadings: false,
    },
  },
  {
    id: 'hero',
    options: {
      mode: 'paragraphs',
      paragraphs: 1,
      wordsPerParagraph: 35,
      varyParagraphLength: false,
      includeHeadings: false,
    },
  },
  {
    id: 'article',
    options: {
      mode: 'paragraphs',
      paragraphs: 5,
      wordsPerParagraph: 65,
      varyParagraphLength: true,
      includeHeadings: true,
    },
  },
  {
    id: 'words100',
    options: {
      mode: 'words',
      totalWords: 100,
      wordParagraphs: 2,
    },
  },
  {
    id: 'checklist',
    options: {
      mode: 'list',
      listItems: 6,
      wordsPerItem: 8,
    },
  },
  {
    id: 'meta',
    options: {
      mode: 'characters',
      characters: 160,
    },
  },
];

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const rounded = Math.round(value);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 1;
  const n = Math.floor(Math.abs(seed)) % 999999999;
  return n === 0 ? 1 : n;
}

/** Fast deterministic Mulberry32 PRNG returning floats in [0, 1). */
export function createRng(seed: number): () => number {
  let state = normalizeSeed(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomNextSeed(currentSeed: number): number {
  const rand = Math.floor(Math.random() * 899999) + 100000;
  return rand === currentSeed ? rand + 1 : rand;
}

function capitalize(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

interface WordStream {
  next: () => string;
}

function createWordStream(style: LoremStyle, startWithLorem: boolean, rng: () => number): WordStream {
  const words = getCorpusWords(style);
  const openingQueue: string[] = style === 'classic' && startWithLorem ? [...CLASSIC_OPENING_WORDS] : [];
  let queueIndex = 0;

  if (style === 'cicero') {
    // Cycle sequentially from a deterministic starting offset in Cicero's passage.
    const offset = startWithLorem ? 0 : Math.floor(rng() * words.length);
    let idx = offset;
    return {
      next: () => {
        const w = words[idx % words.length].toLowerCase();
        idx += 1;
        return w;
      },
    };
  }

  let prev = '';
  return {
    next: () => {
      if (queueIndex < openingQueue.length) {
        const w = openingQueue[queueIndex];
        queueIndex += 1;
        prev = w;
        return w;
      }
      let candidate = words[Math.floor(rng() * words.length)];
      // Avoid immediate duplicate words.
      if (candidate === prev) {
        candidate = words[(Math.floor(rng() * words.length) + 1) % words.length];
      }
      prev = candidate;
      return candidate;
    },
  };
}

/**
 * Formats an exact sequence of `wordCount` words into natural sentences
 * with capitalization, commas, and sentence-ending punctuation.
 */
function buildSentenceBlock(
  wordCount: number,
  stream: WordStream,
  rng: () => number,
  targetSentenceLen = 13,
  isOpeningClassic = false,
): string {
  if (wordCount <= 0) return '';

  const rawWords: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    rawWords.push(stream.next());
  }

  const out: string[] = [];
  let idx = 0;

  // Preserve the canonical punctuation of the classic opening sentence if present.
  if (isOpeningClassic && wordCount >= 5) {
    const openingLen = Math.min(wordCount, CLASSIC_OPENING_WORDS.length);
    for (let i = 0; i < openingLen; i++) {
      let w = rawWords[i];
      if (i === 0) w = capitalize(w);
      if (i === 4 && openingLen > 6) w += ',';
      else if (i === 7 && openingLen > 9) w += ',';
      if (i === openingLen - 1) w += '.';
      out.push(w);
    }
    idx = openingLen;
  }

  while (idx < wordCount) {
    const remaining = wordCount - idx;
    let sentenceLen: number;

    if (remaining <= 6) {
      sentenceLen = remaining;
    } else {
      const minLen = Math.max(5, Math.round(targetSentenceLen * 0.65));
      const maxLen = Math.max(minLen + 2, Math.round(targetSentenceLen * 1.35));
      sentenceLen = minLen + Math.floor(rng() * (maxLen - minLen + 1));
      if (sentenceLen >= remaining) {
        sentenceLen = remaining;
      } else if (remaining - sentenceLen < 4) {
        // Avoid leaving a tiny 1-3 word orphan sentence at the end of a paragraph.
        sentenceLen = remaining;
      }
    }

    const commaIndex =
      sentenceLen >= 9 && rng() < 0.55
        ? Math.max(3, Math.min(sentenceLen - 4, Math.floor(sentenceLen * (0.38 + rng() * 0.24))))
        : -1;

    for (let i = 0; i < sentenceLen; i++) {
      let w = rawWords[idx + i];
      if (i === 0) w = capitalize(w);
      if (i === commaIndex) w += ',';
      if (i === sentenceLen - 1) {
        const roll = rng();
        const endMark = sentenceLen >= 7 && roll < 0.06 ? '?' : '.';
        w += endMark;
      }
      out.push(w);
    }

    idx += sentenceLen;
  }

  return out.join(' ');
}

/**
 * Splits `totalWords` across `parts` paragraphs evenly, returning counts that sum to `totalWords`.
 */
function distributeWords(totalWords: number, parts: number): number[] {
  const safeParts = Math.min(parts, Math.max(1, totalWords));
  const base = Math.floor(totalWords / safeParts);
  const remainder = totalWords % safeParts;
  const counts: number[] = [];
  for (let i = 0; i < safeParts; i++) {
    counts.push(base + (i < remainder ? 1 : 0));
  }
  return counts;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeLatex(text: string): string {
  return text
    .replaceAll('\\', '\\textbackslash{}')
    .replaceAll('&', '\\&')
    .replaceAll('%', '\\%')
    .replaceAll('$', '\\$')
    .replaceAll('#', '\\#')
    .replaceAll('_', '\\_')
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}');
}

function formatBlocks(blocks: LoremBlock[], mode: LoremOptions['mode'], format: LoremFormat): string {
  if (mode === 'list') {
    const items = blocks.map((b) => b.text);
    switch (format) {
      case 'plain':
        return items.map((item) => `• ${item}`).join('\n');
      case 'html':
        return `<ul>\n${items.map((item) => `  <li>${escapeHtml(item)}</li>`).join('\n')}\n</ul>`;
      case 'markdown':
        return items.map((item) => `- ${item}`).join('\n');
      case 'json':
        return JSON.stringify(items, null, 2);
      case 'latex':
        return `\\begin{itemize}\n${items.map((item) => `  \\item ${escapeLatex(item)}`).join('\n')}\n\\end{itemize}`;
    }
  }

  switch (format) {
    case 'plain':
      return blocks
        .map((b) => (b.heading ? `${b.heading}\n${b.text}` : b.text))
        .join('\n\n');

    case 'html':
      return blocks
        .map((b) =>
          b.heading
            ? `<h2>${escapeHtml(b.heading)}</h2>\n<p>${escapeHtml(b.text)}</p>`
            : `<p>${escapeHtml(b.text)}</p>`,
        )
        .join('\n\n');

    case 'markdown':
      return blocks
        .map((b) => (b.heading ? `## ${b.heading}\n\n${b.text}` : b.text))
        .join('\n\n');

    case 'json': {
      const hasHeadings = blocks.some((b) => Boolean(b.heading));
      if (hasHeadings) {
        return JSON.stringify(
          blocks.map((b) => ({ heading: b.heading ?? '', body: b.text })),
          null,
          2,
        );
      }
      return JSON.stringify(
        blocks.map((b) => b.text),
        null,
        2,
      );
    }

    case 'latex':
      return blocks
        .map((b) =>
          b.heading
            ? `\\section*{${escapeLatex(b.heading)}}\n${escapeLatex(b.text)}`
            : escapeLatex(b.text),
        )
        .join('\n\n');
  }
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function countSentences(text: string): number {
  const matches = text.match(/[.!?]+(?=\s|$)/g);
  if (matches && matches.length > 0) return matches.length;
  return text.trim() ? 1 : 0;
}

export function computeStats(blocks: LoremBlock[], plainText: string): LoremStats {
  const bodyPlain = blocks.map((b) => b.text).join('\n\n');
  const words = countWords(bodyPlain);
  const sentences = countSentences(bodyPlain);
  const characters = plainText.length;
  const charactersNoSpaces = plainText.replace(/\s+/g, '').length;
  const bytes = new TextEncoder().encode(plainText).length;
  // Average adult silent reading speed ~220 words/minute.
  const readingSeconds = words === 0 ? 0 : Math.max(1, Math.round((words / 220) * 60));

  return {
    words,
    paragraphs: blocks.length,
    sentences,
    characters,
    charactersNoSpaces,
    bytes,
    readingSeconds,
  };
}

export function generateLorem(rawOptions: Partial<LoremOptions>): LoremResult {
  const opts: LoremOptions = {
    ...DEFAULT_OPTIONS,
    ...rawOptions,
  };

  const seed = normalizeSeed(opts.seed);
  const rng = createRng(seed);
  const stream = createWordStream(opts.style, opts.startWithLorem, rng);
  const useOpeningClassic = opts.style === 'classic' && opts.startWithLorem;

  const headingsPool = STYLE_HEADINGS[opts.style];
  const headingOffset = Math.floor(rng() * headingsPool.length);
  const pickHeading = (index: number): string => headingsPool[(headingOffset + index) % headingsPool.length];

  const blocks: LoremBlock[] = [];

  if (opts.mode === 'paragraphs') {
    const count = clampInt(opts.paragraphs, LIMITS.paragraphs.min, LIMITS.paragraphs.max);
    const targetWords = clampInt(
      opts.wordsPerParagraph,
      LIMITS.wordsPerParagraph.min,
      LIMITS.wordsPerParagraph.max,
    );

    for (let i = 0; i < count; i++) {
      let paraWords = targetWords;
      if (opts.varyParagraphLength) {
        const delta = Math.max(2, Math.round(targetWords * 0.25));
        const minW = Math.max(LIMITS.wordsPerParagraph.min, targetWords - delta);
        const maxW = Math.min(LIMITS.wordsPerParagraph.max, targetWords + delta);
        paraWords = minW + Math.floor(rng() * (maxW - minW + 1));
      }

      const text = buildSentenceBlock(paraWords, stream, rng, 13, i === 0 && useOpeningClassic);
      blocks.push({
        ...(opts.includeHeadings ? { heading: pickHeading(i) } : {}),
        text,
      });
    }
  } else if (opts.mode === 'words') {
    const totalWords = clampInt(opts.totalWords, LIMITS.totalWords.min, LIMITS.totalWords.max);
    const splitCount = clampInt(opts.wordParagraphs, LIMITS.wordParagraphs.min, LIMITS.wordParagraphs.max);
    const perParaCounts = distributeWords(totalWords, splitCount);

    for (let i = 0; i < perParaCounts.length; i++) {
      const text = buildSentenceBlock(perParaCounts[i], stream, rng, 13, i === 0 && useOpeningClassic);
      blocks.push({ text });
    }
  } else if (opts.mode === 'sentences') {
    const sentenceCount = clampInt(opts.sentences, LIMITS.sentences.min, LIMITS.sentences.max);
    const targetLen = clampInt(
      opts.wordsPerSentence,
      LIMITS.wordsPerSentence.min,
      LIMITS.wordsPerSentence.max,
    );

    const sentences: string[] = [];
    for (let i = 0; i < sentenceCount; i++) {
      let len: number;
      if (i === 0 && useOpeningClassic && targetLen >= 8) {
        len = Math.min(CLASSIC_OPENING_WORDS.length, Math.max(8, targetLen));
      } else {
        const delta = Math.max(1, Math.round(targetLen * 0.25));
        const minL = Math.max(LIMITS.wordsPerSentence.min, targetLen - delta);
        const maxL = Math.min(LIMITS.wordsPerSentence.max, targetLen + delta);
        len = minL + Math.floor(rng() * (maxL - minL + 1));
      }

      // Build exactly one sentence of `len` words.
      const words: string[] = [];
      for (let w = 0; w < len; w++) {
        words.push(stream.next());
      }
      const commaPos =
        i === 0 && useOpeningClassic && len > 6
          ? 4
          : len >= 10 && rng() < 0.5
            ? Math.max(3, Math.min(len - 4, Math.floor(len * 0.45)))
            : -1;

      const rendered = words.map((w, idx) => {
        let out = idx === 0 ? capitalize(w) : w;
        if (idx === commaPos) out += ',';
        if (idx === len - 1) out += '.';
        return out;
      });
      sentences.push(rendered.join(' '));
    }

    blocks.push({ text: sentences.join(' ') });
  } else if (opts.mode === 'list') {
    const itemCount = clampInt(opts.listItems, LIMITS.listItems.min, LIMITS.listItems.max);
    const wordsPerItem = clampInt(opts.wordsPerItem, LIMITS.wordsPerItem.min, LIMITS.wordsPerItem.max);

    for (let i = 0; i < itemCount; i++) {
      const words: string[] = [];
      for (let w = 0; w < wordsPerItem; w++) {
        words.push(stream.next());
      }
      const rendered = words.map((w, idx) => {
        let out = idx === 0 ? capitalize(w) : w;
        if (idx === words.length - 1) out += '.';
        return out;
      });
      blocks.push({ text: rendered.join(' ') });
    }
  } else if (opts.mode === 'characters') {
    const targetChars = clampInt(opts.characters, LIMITS.characters.min, LIMITS.characters.max);
    // Estimate generous word budget (~5 chars/word average) and build sentences until >= targetChars.
    const chunks: string[] = [];
    let currentLen = 0;
    let first = true;
    while (currentLen < targetChars + 40) {
      const batchWords = Math.max(20, Math.ceil((targetChars - currentLen) / 4) + 12);
      const piece = buildSentenceBlock(Math.min(batchWords, 300), stream, rng, 12, first && useOpeningClassic);
      chunks.push(piece);
      currentLen += piece.length + 1;
      first = false;
    }

    const combined = chunks.join(' ');
    let exact: string;
    if (combined.length <= targetChars) {
      exact = combined;
    } else {
      // Trim to targetChars cleanly, ending with a period without exceeding or falling short.
      const slice = combined.slice(0, targetChars);
      const lastChar = slice[slice.length - 1];
      if (lastChar === ' ') {
        // Replace trailing space with a period to preserve exact character length.
        const trimmedEnd = slice.slice(0, -1).replace(/[,;:\s]+$/, '');
        const padNeeded = targetChars - trimmedEnd.length;
        if (padNeeded === 1) {
          exact = `${trimmedEnd}.`;
        } else {
          // Fill remaining chars with a short word or pad gracefully on last word.
          const base = combined.slice(0, targetChars - 1).replace(/\s+$/, '');
          const shortfall = targetChars - 1 - base.length;
          exact = `${base}${'a'.repeat(Math.max(0, shortfall))}.`;
        }
      } else if (lastChar === ',' || lastChar === ';' || lastChar === ':') {
        exact = `${slice.slice(0, -1)}.`;
      } else if (lastChar === '.' || lastChar === '!' || lastChar === '?') {
        exact = slice;
      } else {
        exact = `${slice.slice(0, -1)}.`;
      }
    }

    blocks.push({ text: exact });
  }

  const plainText = formatBlocks(blocks, opts.mode, 'plain');
  const output = formatBlocks(blocks, opts.mode, opts.format);
  const stats = computeStats(blocks, plainText);

  return {
    blocks,
    output,
    plainText,
    stats,
  };
}

export function getFormatFileExtension(format: LoremFormat): string {
  switch (format) {
    case 'plain':
      return '.txt';
    case 'html':
      return '.html';
    case 'markdown':
      return '.md';
    case 'json':
      return '.json';
    case 'latex':
      return '.tex';
  }
}

export function getFormatMimeType(format: LoremFormat): string {
  switch (format) {
    case 'plain':
      return 'text/plain;charset=utf-8';
    case 'html':
      return 'text/html;charset=utf-8';
    case 'markdown':
      return 'text/markdown;charset=utf-8';
    case 'json':
      return 'application/json;charset=utf-8';
    case 'latex':
      return 'application/x-tex;charset=utf-8';
  }
}
