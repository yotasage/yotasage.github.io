export type RegexFlavorId = 'js' | 'pcre2' | 'python' | 'go' | 'rust' | 'java' | 'dotnet';

export type DelimiterOption = '/' | '~' | '#' | '%' | '@' | '!' | 'none';

export type RegexFlagId = 'g' | 'i' | 'm' | 's' | 'u' | 'y' | 'x';

export type ExtractionMode = 'extract' | 'replace';

export type ExtractJoinMode = 'newline' | 'comma' | 'tab' | 'none' | 'json';

export type RegexTokenKind =
  | 'group'
  | 'nonCapturingGroup'
  | 'namedGroup'
  | 'lookahead'
  | 'negLookahead'
  | 'lookbehind'
  | 'negLookbehind'
  | 'charClass'
  | 'negCharClass'
  | 'shorthand'
  | 'anchor'
  | 'alternation'
  | 'backreference'
  | 'escape'
  | 'literal'
  | 'dot'
  | 'inlineFlag'
  | 'comment';

export type QuantifierMode = 'greedy' | 'lazy' | 'possessive';

export interface RegexQuantifier {
  raw: string;
  min: number;
  max: number | null;
  mode: QuantifierMode;
  start: number;
  end: number;
}

export interface RegexToken {
  id: string;
  kind: RegexTokenKind;
  raw: string;
  /** Raw text excluding any attached quantifier (for syntax display). */
  coreRaw: string;
  start: number;
  end: number;
  /** 1-based capture group index when kind is 'group' or 'namedGroup'. */
  groupIndex?: number;
  /** Group name when kind is 'namedGroup' or named backreference. */
  groupName?: string;
  /** Referenced group number for numeric backreferences. */
  refIndex?: number;
  /** Attached quantifier if present (e.g. +, *, {2,4}?). */
  quantifier?: RegexQuantifier;
  /** Short English/technical token label (used as fallback or code tag). */
  label: string;
  /** Detailed explanation of what this token matches. */
  description: string;
  /** Detailed quantifier explanation if a quantifier is attached. */
  quantifierDescription?: string;
  /** Child tokens for groups or alternations. */
  children?: RegexToken[];
  /** True when the token participates in matching text (can be linked to test spans). */
  matchable: boolean;
}

export interface FlavorFlagInfo {
  id: RegexFlagId;
  label: string;
  shortDesc: string;
  supported: boolean;
}

export interface RegexFlavorSpec {
  id: RegexFlavorId;
  name: string;
  shortName: string;
  engineType: 'backtracking' | 'dfa';
  defaultDelimiter: DelimiterOption;
  supportsDelimiters: boolean;
  defaultFlags: readonly RegexFlagId[];
  supportedFlags: readonly RegexFlagId[];
  namedGroupSyntax: string;
  supportsLookahead: boolean;
  supportsLookbehind: boolean;
  supportsBackreferences: boolean;
  supportsPossessive: boolean;
  literalPrefix: string;
  literalSuffix: string;
  summary: string;
}

export interface GroupCapture {
  index: number;
  name?: string;
  value: string | undefined;
  start: number;
  end: number;
}

export interface TokenMatchSpan {
  tokenId: string;
  matchIndex: number;
  start: number;
  end: number;
  text: string;
  groupIndex?: number;
}

export interface MatchItem {
  matchIndex: number;
  fullMatch: string;
  start: number;
  end: number;
  groups: GroupCapture[];
  tokenSpans: TokenMatchSpan[];
}

export interface RegexDiagnostic {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface ExecutionResult {
  valid: boolean;
  error?: string;
  warnings: RegexDiagnostic[];
  matches: MatchItem[];
  truncated: boolean;
  elapsedMs: number;
  compiledSource: string;
  compiledFlags: string;
  tokens: RegexToken[];
  groupNames: { index: number; name?: string }[];
  /** Map from tokenId to all matched text spans across all matches. */
  tokenSpansByTokenId: Record<string, TokenMatchSpan[]>;
}

export interface RegexExample {
  id: string;
  category: 'logs' | 'web' | 'data' | 'code' | 'text';
  flavor: RegexFlavorId;
  delimiter: DelimiterOption;
  flags: readonly RegexFlagId[];
  pattern: string;
  testText: string;
  template: string;
  extractionMode: ExtractionMode;
  joinMode: ExtractJoinMode;
}
