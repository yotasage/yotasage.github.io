export type LoremMode = 'paragraphs' | 'words' | 'sentences' | 'list' | 'characters';

export type LoremFormat = 'plain' | 'html' | 'markdown' | 'json' | 'latex';

export type LoremStyle = 'classic' | 'cicero' | 'english' | 'norwegian';

export interface LoremOptions {
  mode: LoremMode;
  style: LoremStyle;
  format: LoremFormat;
  /** Number of paragraphs in 'paragraphs' mode, or paragraph splits in 'words' mode. */
  paragraphs: number;
  /** Target words per paragraph in 'paragraphs' mode. */
  wordsPerParagraph: number;
  /** Whether paragraph lengths vary naturally around wordsPerParagraph (±25%) or match exactly. */
  varyParagraphLength: boolean;
  /** Exact total word count in 'words' mode. */
  totalWords: number;
  /** Number of paragraphs to distribute totalWords across in 'words' mode (1 = single block). */
  wordParagraphs: number;
  /** Number of sentences in 'sentences' mode. */
  sentences: number;
  /** Target words per sentence in 'sentences' mode. */
  wordsPerSentence: number;
  /** Number of list items in 'list' mode. */
  listItems: number;
  /** Target words per list item in 'list' mode. */
  wordsPerItem: number;
  /** Exact character count in 'characters' mode. */
  characters: number;
  /** Begin with the classic "Lorem ipsum dolor sit amet..." opening when using Classic Latin. */
  startWithLorem: boolean;
  /** Include short section headings before paragraphs (in paragraphs mode). */
  includeHeadings: boolean;
  /** Deterministic PRNG seed for reproducible output. */
  seed: number;
}

export interface LoremBlock {
  heading?: string;
  text: string;
}

export interface LoremStats {
  words: number;
  paragraphs: number;
  sentences: number;
  characters: number;
  charactersNoSpaces: number;
  bytes: number;
  readingSeconds: number;
}

export interface LoremResult {
  blocks: LoremBlock[];
  /** Formatted output string ready for copy/download (Plain, HTML, Markdown, JSON, or LaTeX). */
  output: string;
  /** Plain-text content used for counting words/sentences/characters accurately. */
  plainText: string;
  stats: LoremStats;
}

export interface LoremPreset {
  id: string;
  options: Partial<LoremOptions>;
}
