export type EolMode = 'CRLF' | 'LF';

export type LayoutMode = 'single' | 'split' | 'grid' | 'diff';

export type SearchMode = 'normal' | 'extended' | 'regex';

export type DiffViewStyle = 'side-by-side' | 'inline';

export type TextDirection = 'ltr' | 'rtl';

export type FileEncoding =
  | 'utf-8'
  | 'utf-8-bom'
  | 'utf-16le-bom'
  | 'utf-16be-bom'
  | 'windows-1252'
  | 'iso-8859-1';

export type EncodingConfidence = 'exact' | 'likely';

export interface NotepadDoc {
  id: string;
  name: string;
  content: string;
  language: string;
  eol: EolMode;
  encoding: FileEncoding;
  encodingConfidence: EncodingConfidence;
  direction: TextDirection;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SearchOptions {
  mode: SearchMode;
  caseSensitive: boolean;
  wholeWord: boolean;
  dotMatchesNewline: boolean;
}

export interface TextMatch {
  start: number;
  end: number;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  matchedText: string;
}

export interface DocumentMatchSummary {
  docId: string;
  docName: string;
  count: number;
  matches: TextMatch[];
}

export interface SymbolSettings {
  showWhitespaceAndTab: boolean;
  showEol: boolean;
  showNonPrinting: boolean;
  showIndentGuide: boolean;
  showWrapSymbol: boolean;
}

export interface EditorSettings {
  wordWrap: boolean;
  showWhitespace: boolean;
  showMinimap: boolean;
  fontSize: number;
  symbols: SymbolSettings;
}

export interface NotepadWorkspaceState {
  version: 1;
  docs: NotepadDoc[];
  layout: LayoutMode;
  /** Document IDs assigned to grid/split panes (up to 16 panes for 4x4 grid). */
  paneDocIds: string[];
  activePane: number;
  gridRows: number;
  gridCols: number;
  /** Relative column percentage weights (sum to 100, length === gridCols). */
  gridColSizes: number[];
  /** Relative row percentage weights (sum to 100, length === gridRows). */
  gridRowSizes: number[];
  diffLeftId: string;
  diffRightId: string;
  diffStyle: DiffViewStyle;
  diffIgnoreWhitespace: boolean;
  settings: EditorSettings;
  savedAt: number;
}

export interface LanguageOption {
  id: string;
  label: string;
  extensions: readonly string[];
}

export { SUPPORTED_LANGUAGES } from './languages';

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  mode: 'normal',
  caseSensitive: false,
  wholeWord: false,
  dotMatchesNewline: false,
};

export const DEFAULT_SYMBOL_SETTINGS: SymbolSettings = {
  showWhitespaceAndTab: false,
  showEol: false,
  showNonPrinting: false,
  showIndentGuide: true,
  showWrapSymbol: false,
};

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  wordWrap: true,
  showWhitespace: false,
  showMinimap: false,
  fontSize: 13.5,
  symbols: { ...DEFAULT_SYMBOL_SETTINGS },
};

export const MAX_GRID_DIM = 4;

export function createEqualTrackSizes(count: number): number[] {
  const n = Math.max(1, Math.min(MAX_GRID_DIM, Math.floor(count)));
  const base = Number((100 / n).toFixed(2));
  const arr = Array.from({ length: n }, () => base);
  const sumExceptLast = arr.slice(0, -1).reduce((a, b) => a + b, 0);
  arr[n - 1] = Number((100 - sumExceptLast).toFixed(2));
  return arr;
}
