import { DelimiterOption, ExtractionMode, RegexFlavorId, RegexFlagId } from './types';

export interface TheoryTrySnippet {
  pattern: string;
  testText: string;
  flags: readonly RegexFlagId[];
  template: string;
  extractionMode?: ExtractionMode;
  flavor?: RegexFlavorId;
  delimiter?: DelimiterOption;
}

export interface SyntaxRefRow {
  token: string;
  nameKey: string;
  descKey: string;
  example: string;
  trySnippet: TheoryTrySnippet;
}

export interface SyntaxRefGroup {
  id: 'classes' | 'anchors' | 'quantifiers' | 'groups' | 'lookarounds' | 'flags';
  titleKey: string;
  introKey: string;
  rows: readonly SyntaxRefRow[];
}

export const SYNTAX_REFERENCE_GROUPS: readonly SyntaxRefGroup[] = [
  {
    id: 'classes',
    titleKey: 'regex.theory.sec.classes',
    introKey: 'regex.theory.sec.classesIntro',
    rows: [
      {
        token: '.',
        nameKey: 'regex.ref.dot.name',
        descKey: 'regex.ref.dot.desc',
        example: 'c.t -> cat, cut',
        trySnippet: {
          pattern: 'c.t',
          testText: 'cat, cot, cut, c-t, cart',
          flags: ['g'],
          template: '$0',
        },
      },
      {
        token: '\\d / \\D',
        nameKey: 'regex.ref.digit.name',
        descKey: 'regex.ref.digit.desc',
        example: '\\d{4} -> 2026',
        trySnippet: {
          pattern: '\\d{4}',
          testText: 'Order #2026-4812 shipped in 3 days (code 9041).',
          flags: ['g'],
          template: '$0',
        },
      },
      {
        token: '\\w / \\W',
        nameKey: 'regex.ref.word.name',
        descKey: 'regex.ref.word.desc',
        example: '\\w+ -> item_1',
        trySnippet: {
          pattern: '\\w+',
          testText: 'user_42 = "active"; count += 1;',
          flags: ['g'],
          template: '$0',
        },
      },
      {
        token: '\\s / \\S',
        nameKey: 'regex.ref.space.name',
        descKey: 'regex.ref.space.desc',
        example: '\\s+ -> collapse spaces',
        trySnippet: {
          pattern: '\\s+',
          testText: 'Too    many   spaces\tand\t tabs',
          flags: ['g'],
          template: ' ',
          extractionMode: 'replace',
        },
      },
      {
        token: '[a-z] / [^0-9]',
        nameKey: 'regex.ref.set.name',
        descKey: 'regex.ref.set.desc',
        example: '[A-F0-9]{2} -> FF, 0A',
        trySnippet: {
          pattern: '[A-F0-9]{2}',
          testText: 'Bytes: 0A 7F FF ZZ 1C',
          flags: ['g'],
          template: '0x$0',
        },
      },
    ],
  },
  {
    id: 'anchors',
    titleKey: 'regex.theory.sec.anchors',
    introKey: 'regex.theory.sec.anchorsIntro',
    rows: [
      {
        token: '^ and $',
        nameKey: 'regex.ref.caretDollar.name',
        descKey: 'regex.ref.caretDollar.desc',
        example: '^ERROR.*$',
        trySnippet: {
          pattern: '^ERROR: .+$',
          testText: 'INFO: started\nERROR: disk full\nWARN: retry\nERROR: timeout',
          flags: ['g', 'm'],
          template: '$0',
        },
      },
      {
        token: '\\b / \\B',
        nameKey: 'regex.ref.boundary.name',
        descKey: 'regex.ref.boundary.desc',
        example: '\\bcat\\b (not scatter)',
        trySnippet: {
          pattern: '\\bcat\\b',
          testText: 'The cat saw a caterpillar scatter past another cat.',
          flags: ['g'],
          template: '$0',
        },
      },
    ],
  },
  {
    id: 'quantifiers',
    titleKey: 'regex.theory.sec.quantifiers',
    introKey: 'regex.theory.sec.quantifiersIntro',
    rows: [
      {
        token: '* , + , ?',
        nameKey: 'regex.ref.basicQuant.name',
        descKey: 'regex.ref.basicQuant.desc',
        example: 'colou?r -> color, colour',
        trySnippet: {
          pattern: 'colou?r',
          testText: 'color, colour, colouur',
          flags: ['g'],
          template: '$0',
        },
      },
      {
        token: '{n} , {n,} , {n,m}',
        nameKey: 'regex.ref.rangeQuant.name',
        descKey: 'regex.ref.rangeQuant.desc',
        example: '\\d{2,4}',
        trySnippet: {
          pattern: '\\b\\d{2,4}\\b',
          testText: '1, 42, 404, 2026, 99999',
          flags: ['g'],
          template: '$0',
        },
      },
      {
        token: '*? , +? , ??',
        nameKey: 'regex.ref.lazyQuant.name',
        descKey: 'regex.ref.lazyQuant.desc',
        example: '<.+?> -> each tag separately',
        trySnippet: {
          pattern: '<(?<tag>.+?)>',
          testText: '<em>bold</em> and <code>regex</code>',
          flags: ['g'],
          template: '$<tag>',
        },
      },
    ],
  },
  {
    id: 'groups',
    titleKey: 'regex.theory.sec.groups',
    introKey: 'regex.theory.sec.groupsIntro',
    rows: [
      {
        token: '(abc) / (?:abc)',
        nameKey: 'regex.ref.group.name',
        descKey: 'regex.ref.group.desc',
        example: '(?:Mr|Ms)\\. (\\w+)',
        trySnippet: {
          pattern: '(?:Mr|Ms)\\. (\\w+)',
          testText: 'Mr. Turing and Ms. Lovelace attended.',
          flags: ['g'],
          template: 'Surname: $1',
        },
      },
      {
        token: '(?<name>...)',
        nameKey: 'regex.ref.namedGroup.name',
        descKey: 'regex.ref.namedGroup.desc',
        example: '(?<key>\\w+)=(?<val>\\w+)',
        trySnippet: {
          pattern: '(?<key>\\w+)=(?<val>[^\\s,]+)',
          testText: 'env=prod, region=eu-north, replicas=3',
          flags: ['g'],
          template: '"$<key>": "$<val>"',
        },
      },
      {
        token: 'a|b',
        nameKey: 'regex.ref.alt.name',
        descKey: 'regex.ref.alt.desc',
        example: 'GET|POST|PUT',
        trySnippet: {
          pattern: '\\b(GET|POST|DELETE)\\s+(/[^\\s]+)',
          testText: 'GET /health\nPOST /orders\nPATCH /ignored\nDELETE /sessions/4',
          flags: ['g'],
          template: '$1 -> $2',
        },
      },
      {
        token: '\\1 / \\k<name>',
        nameKey: 'regex.ref.backref.name',
        descKey: 'regex.ref.backref.desc',
        example: '(["\']).*?\\1',
        trySnippet: {
          pattern: '(["\'])(?<text>.*?)\\1',
          testText: `const a = "hello"; const b = 'world'; const bad = "mismatch';`,
          flags: ['g'],
          template: '$<text>',
        },
      },
    ],
  },
  {
    id: 'lookarounds',
    titleKey: 'regex.theory.sec.lookarounds',
    introKey: 'regex.theory.sec.lookaroundsIntro',
    rows: [
      {
        token: '(?=...) / (?!...)',
        nameKey: 'regex.ref.lookahead.name',
        descKey: 'regex.ref.lookahead.desc',
        example: '\\d+(?=px)',
        trySnippet: {
          pattern: '\\d+(?=px)',
          testText: 'margin: 16px 2rem 24px 0;',
          flags: ['g'],
          template: '$0 px',
        },
      },
      {
        token: '(?<=...) / (?<!...)',
        nameKey: 'regex.ref.lookbehind.name',
        descKey: 'regex.ref.lookbehind.desc',
        example: '(?<=\\$)\\d+\\.\\d{2}',
        trySnippet: {
          pattern: '(?<=\\$)\\d+\\.\\d{2}',
          testText: 'Items: $19.99, €14.50, $4.25, £8.00',
          flags: ['g'],
          template: 'USD $0',
        },
      },
    ],
  },
];

export const QUICK_INSERT_TOKENS: readonly {
  category: string;
  token: string;
  hint: string;
}[] = [
  { category: 'Classes', token: '\\d', hint: 'Digit (0–9)' },
  { category: 'Classes', token: '\\w', hint: 'Word char' },
  { category: 'Classes', token: '\\s', hint: 'Whitespace' },
  { category: 'Classes', token: '[a-z]', hint: 'Char range' },
  { category: 'Classes', token: '[^\\s]', hint: 'Negated set' },
  { category: 'Anchors', token: '^', hint: 'Start of line' },
  { category: 'Anchors', token: '$', hint: 'End of line' },
  { category: 'Anchors', token: '\\b', hint: 'Word boundary' },
  { category: 'Quantifiers', token: '+', hint: '1 or more' },
  { category: 'Quantifiers', token: '*', hint: '0 or more' },
  { category: 'Quantifiers', token: '?', hint: 'Optional / lazy' },
  { category: 'Quantifiers', token: '{2,4}', hint: '2 to 4 times' },
  { category: 'Groups', token: '(...)', hint: 'Capture group' },
  { category: 'Groups', token: '(?:...)', hint: 'Non-capturing' },
  { category: 'Groups', token: '(?<name>...)', hint: 'Named group' },
  { category: 'Lookarounds', token: '(?=...)', hint: 'Pos. lookahead' },
  { category: 'Lookarounds', token: '(?!...)', hint: 'Neg. lookahead' },
  { category: 'Lookarounds', token: '(?<=...)', hint: 'Pos. lookbehind' },
];
