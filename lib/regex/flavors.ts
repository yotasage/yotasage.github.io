import {
  DelimiterOption,
  ExtractionMode,
  RegexFlavorId,
  RegexFlavorSpec,
  RegexFlagId,
} from './types';

export const DELIMITER_OPTIONS: readonly { value: DelimiterOption; label: string }[] = [
  { value: '/', label: '/ … /' },
  { value: '~', label: '~ … ~' },
  { value: '#', label: '# … #' },
  { value: '%', label: '% … %' },
  { value: '@', label: '@ … @' },
  { value: '!', label: '! … !' },
  { value: 'none', label: 'None' },
];

export const ALL_FLAGS: readonly {
  id: RegexFlagId;
  name: string;
  shortDesc: string;
}[] = [
  { id: 'g', name: 'Global', shortDesc: 'Find all matches instead of stopping after the first match' },
  { id: 'i', name: 'Insensitive', shortDesc: 'Ignore uppercase/lowercase letter differences' },
  { id: 'm', name: 'Multiline', shortDesc: 'Make ^ and $ match start/end of every line' },
  { id: 's', name: 'Single line (dotAll)', shortDesc: 'Allow . to match newline characters as well' },
  { id: 'u', name: 'Unicode', shortDesc: 'Enable full Unicode code points and \\p{...} properties' },
  { id: 'x', name: 'Extended (verbose)', shortDesc: 'Ignore unescaped whitespace and allow # comments' },
  { id: 'y', name: 'Sticky', shortDesc: 'Match only starting at the exact lastIndex position' },
];

export const FLAVORS: Record<RegexFlavorId, RegexFlavorSpec> = {
  js: {
    id: 'js',
    name: 'JavaScript (ECMAScript)',
    shortName: 'JavaScript',
    engineType: 'backtracking',
    defaultDelimiter: '/',
    supportsDelimiters: true,
    defaultFlags: ['g', 'm'],
    supportedFlags: ['g', 'i', 'm', 's', 'u', 'y'],
    namedGroupSyntax: '(?<name>...)',
    supportsLookahead: true,
    supportsLookbehind: true,
    supportsBackreferences: true,
    supportsPossessive: false,
    literalPrefix: '/',
    literalSuffix: '/',
    summary: 'Native browser ECMAScript RegExp engine with lookarounds, named groups, and Unicode properties.',
  },
  pcre2: {
    id: 'pcre2',
    name: 'PCRE2 (PHP / Perl)',
    shortName: 'PCRE2',
    engineType: 'backtracking',
    defaultDelimiter: '/',
    supportsDelimiters: true,
    defaultFlags: ['g', 'm'],
    supportedFlags: ['g', 'i', 'm', 's', 'u', 'x'],
    namedGroupSyntax: '(?<name>...) or (?P<name>...)',
    supportsLookahead: true,
    supportsLookbehind: true,
    supportsBackreferences: true,
    supportsPossessive: true,
    literalPrefix: '/',
    literalSuffix: '/',
    summary: 'Perl-Compatible Regular Expressions with custom delimiters, extended /x comments, and rich grouping.',
  },
  python: {
    id: 'python',
    name: 'Python (re)',
    shortName: 'Python',
    engineType: 'backtracking',
    defaultDelimiter: 'none',
    supportsDelimiters: false,
    defaultFlags: ['g', 'm'],
    supportedFlags: ['g', 'i', 'm', 's', 'u', 'x'],
    namedGroupSyntax: '(?P<name>...)',
    supportsLookahead: true,
    supportsLookbehind: true,
    supportsBackreferences: true,
    supportsPossessive: false,
    literalPrefix: 'r"',
    literalSuffix: '"',
    summary: 'Python standard library re module using raw strings r"...", (?P<name>...) groups, and re.VERBOSE.',
  },
  go: {
    id: 'go',
    name: 'Go (RE2)',
    shortName: 'Go (RE2)',
    engineType: 'dfa',
    defaultDelimiter: 'none',
    supportsDelimiters: false,
    defaultFlags: ['g', 'm'],
    supportedFlags: ['g', 'i', 'm', 's'],
    namedGroupSyntax: '(?P<name>...)',
    supportsLookahead: false,
    supportsLookbehind: false,
    supportsBackreferences: false,
    supportsPossessive: false,
    literalPrefix: '`',
    literalSuffix: '`',
    summary: 'Linear-time finite automaton (RE2). Guarantees O(n) safety by disallowing backreferences and lookarounds.',
  },
  rust: {
    id: 'rust',
    name: 'Rust (regex)',
    shortName: 'Rust',
    engineType: 'dfa',
    defaultDelimiter: 'none',
    supportsDelimiters: false,
    defaultFlags: ['g', 'm'],
    supportedFlags: ['g', 'i', 'm', 's', 'u', 'x'],
    namedGroupSyntax: '(?P<name>...) or (?<name>...)',
    supportsLookahead: false,
    supportsLookbehind: false,
    supportsBackreferences: false,
    supportsPossessive: false,
    literalPrefix: 'r#"',
    literalSuffix: '"#',
    summary: 'Linear-time Rust regex crate with Unicode support and verbose /x mode, without backtracking lookarounds.',
  },
  java: {
    id: 'java',
    name: 'Java (java.util.regex)',
    shortName: 'Java',
    engineType: 'backtracking',
    defaultDelimiter: 'none',
    supportsDelimiters: false,
    defaultFlags: ['g', 'm'],
    supportedFlags: ['g', 'i', 'm', 's', 'u', 'x'],
    namedGroupSyntax: '(?<name>...)',
    supportsLookahead: true,
    supportsLookbehind: true,
    supportsBackreferences: true,
    supportsPossessive: true,
    literalPrefix: '"',
    literalSuffix: '"',
    summary: 'JVM Pattern engine with possessive quantifiers, Unicode classes, and COMMENTS (/x) mode.',
  },
  dotnet: {
    id: 'dotnet',
    name: '.NET (C# Regex)',
    shortName: '.NET (C#)',
    engineType: 'backtracking',
    defaultDelimiter: 'none',
    supportsDelimiters: false,
    defaultFlags: ['g', 'm'],
    supportedFlags: ['g', 'i', 'm', 's', 'x'],
    namedGroupSyntax: '(?<name>...)',
    supportsLookahead: true,
    supportsLookbehind: true,
    supportsBackreferences: true,
    supportsPossessive: false,
    literalPrefix: '@"',
    literalSuffix: '"',
    summary: 'Microsoft .NET Regex supporting variable-length lookbehinds, verbatim @"..." strings, and IgnorePatternWhitespace.',
  },
};

export const FLAVOR_LIST: readonly RegexFlavorSpec[] = [
  FLAVORS.js,
  FLAVORS.pcre2,
  FLAVORS.python,
  FLAVORS.go,
  FLAVORS.rust,
  FLAVORS.java,
  FLAVORS.dotnet,
];

export function filterFlagsForFlavor(
  flags: readonly RegexFlagId[],
  flavor: RegexFlavorId,
): RegexFlagId[] {
  const allowed = new Set(FLAVORS[flavor].supportedFlags);
  const out: RegexFlagId[] = [];
  for (const f of flags) {
    if (allowed.has(f) && !out.includes(f)) out.push(f);
  }
  return out;
}

export function getDelimiterDisplay(
  delimiter: DelimiterOption,
  flavor: RegexFlavorId,
): { open: string; close: string; active: boolean } {
  if (delimiter !== 'none') {
    return { open: delimiter, close: delimiter, active: true };
  }
  const spec = FLAVORS[flavor];
  if (!spec.supportsDelimiters) {
    return { open: spec.literalPrefix, close: spec.literalSuffix, active: false };
  }
  return { open: '', close: '', active: false };
}

function escapeForDoubleQuotes(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function escapeForSingleQuotes(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function escapeForDelimiter(pattern: string, delimiter: string): string {
  if (!delimiter) return pattern;
  let out = '';
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\' && i + 1 < pattern.length) {
      out += ch + pattern[i + 1];
      i++;
      continue;
    }
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    if (!inClass && ch === delimiter) {
      out += '\\' + ch;
    } else {
      out += ch;
    }
  }
  return out;
}

export function generateLanguageSnippet(options: {
  flavor: RegexFlavorId;
  pattern: string;
  flags: readonly RegexFlagId[];
  delimiter: DelimiterOption;
  template: string;
  extractionMode: ExtractionMode;
}): string {
  const { flavor, pattern, flags, delimiter, template, extractionMode } = options;
  const activeFlags = filterFlagsForFlavor(flags, flavor);
  const flagStr = activeFlags.join('');
  const safeTemplate = template || '$0';

  if (flavor === 'js') {
    const jsFlagStr = activeFlags.filter((f) => f !== 'x').join('');
    const literalDelim = '/';
    const escaped = escapeForDelimiter(pattern || '(?:)', literalDelim);
    if (extractionMode === 'replace') {
      return [
        `const regex = /${escaped}/${jsFlagStr};`,
        `const result = text.replace(regex, ${JSON.stringify(safeTemplate)});`,
      ].join('\n');
    }
    return [
      `const regex = /${escaped}/${jsFlagStr || 'g'};`,
      `const matches = [...text.matchAll(regex)];`,
      `const extracted = matches.map((m) => m[0].replace(new RegExp(regex.source, regex.flags.replace('g', '')), ${JSON.stringify(safeTemplate)}));`,
    ].join('\n');
  }

  if (flavor === 'pcre2') {
    const delim = delimiter === 'none' ? '/' : delimiter;
    const pcreFlags = activeFlags.filter((f) => f !== 'g' && f !== 'y').join('');
    const escaped = escapeForDelimiter(pattern, delim);
    const phpPattern = `${delim}${escaped}${delim}${pcreFlags}`;
    if (extractionMode === 'replace') {
      return [
        `$pattern = '${escapeForSingleQuotes(phpPattern)}';`,
        `$result = preg_replace($pattern, '${escapeForSingleQuotes(safeTemplate)}', $text);`,
      ].join('\n');
    }
    const fn = activeFlags.includes('g') ? 'preg_match_all' : 'preg_match';
    return [
      `$pattern = '${escapeForSingleQuotes(phpPattern)}';`,
      `${fn}($pattern, $text, $matches, PREG_SET_ORDER);`,
    ].join('\n');
  }

  if (flavor === 'python') {
    const pyFlags: string[] = [];
    if (activeFlags.includes('i')) pyFlags.push('re.IGNORECASE');
    if (activeFlags.includes('m')) pyFlags.push('re.MULTILINE');
    if (activeFlags.includes('s')) pyFlags.push('re.DOTALL');
    if (activeFlags.includes('x')) pyFlags.push('re.VERBOSE');
    const flagsArg = pyFlags.length > 0 ? `, ${pyFlags.join(' | ')}` : '';
    const pyPat = pattern.replace(/"/g, '\\"');
    const pyRepl = safeTemplate
      .replace(/\$<([^>]+)>/g, '\\g<$1>')
      .replace(/\$(\d+)/g, '\\g<$1>')
      .replace(/\$&/g, '\\g<0>');
    if (extractionMode === 'replace') {
      return [
        'import re',
        `pattern = re.compile(r"${pyPat}"${flagsArg})`,
        `result = pattern.sub(${JSON.stringify(pyRepl)}, text)`,
      ].join('\n');
    }
    return [
      'import re',
      `pattern = re.compile(r"${pyPat}"${flagsArg})`,
      `extracted = [m.expand(${JSON.stringify(pyRepl)}) for m in pattern.finditer(text)]`,
    ].join('\n');
  }

  if (flavor === 'go') {
    const inlineFlags = activeFlags.filter((f) => f === 'i' || f === 'm' || f === 's').join('');
    const goPat = (inlineFlags ? `(?${inlineFlags})` : '') + pattern;
    const goLiteral = goPat.includes('`') ? `"${escapeForDoubleQuotes(goPat)}"` : `\`${goPat}\``;
    if (extractionMode === 'replace') {
      return [
        `re := regexp.MustCompile(${goLiteral})`,
        `result := re.ReplaceAllString(text, ${JSON.stringify(safeTemplate)})`,
      ].join('\n');
    }
    return [
      `re := regexp.MustCompile(${goLiteral})`,
      `matches := re.FindAllStringSubmatch(text, -1)`,
    ].join('\n');
  }

  if (flavor === 'rust') {
    const inlineFlags = activeFlags.filter((f) => f === 'i' || f === 'm' || f === 's' || f === 'x').join('');
    const rustPat = (inlineFlags ? `(?${inlineFlags})` : '') + pattern;
    if (extractionMode === 'replace') {
      return [
        `let re = Regex::new(r#"${rustPat}"#)?;`,
        `let result = re.replace_all(text, ${JSON.stringify(safeTemplate)});`,
      ].join('\n');
    }
    return [
      `let re = Regex::new(r#"${rustPat}"#)?;`,
      `for caps in re.captures_iter(text) {`,
      `    println!("{:?}", &caps[0]);`,
      `}`,
    ].join('\n');
  }

  if (flavor === 'java') {
    const javaFlags: string[] = [];
    if (activeFlags.includes('i')) javaFlags.push('Pattern.CASE_INSENSITIVE');
    if (activeFlags.includes('m')) javaFlags.push('Pattern.MULTILINE');
    if (activeFlags.includes('s')) javaFlags.push('Pattern.DOTALL');
    if (activeFlags.includes('x')) javaFlags.push('Pattern.COMMENTS');
    if (activeFlags.includes('u')) javaFlags.push('Pattern.UNICODE_CHARACTER_CLASS');
    const flagsArg = javaFlags.length > 0 ? `, ${javaFlags.join(' | ')}` : '';
    const javaPat = escapeForDoubleQuotes(pattern);
    if (extractionMode === 'replace') {
      return [
        `Pattern p = Pattern.compile("${javaPat}"${flagsArg});`,
        `String result = p.matcher(text).replaceAll("${escapeForDoubleQuotes(safeTemplate)}");`,
      ].join('\n');
    }
    return [
      `Pattern p = Pattern.compile("${javaPat}"${flagsArg});`,
      `Matcher m = p.matcher(text);`,
      `while (m.find()) { System.out.println(m.group(0)); }`,
    ].join('\n');
  }

  // .NET (C#)
  const csFlags: string[] = [];
  if (activeFlags.includes('i')) csFlags.push('RegexOptions.IgnoreCase');
  if (activeFlags.includes('m')) csFlags.push('RegexOptions.Multiline');
  if (activeFlags.includes('s')) csFlags.push('RegexOptions.Singleline');
  if (activeFlags.includes('x')) csFlags.push('RegexOptions.IgnorePatternWhitespace');
  const opts = csFlags.length > 0 ? `, ${csFlags.join(' | ')}` : '';
  const csPat = pattern.replace(/"/g, '""');
  const csTpl = safeTemplate.replace(/\$<([^>]+)>/g, '${$1}');
  if (extractionMode === 'replace') {
    return [
      `var regex = new Regex(@"${csPat}"${opts});`,
      `string result = regex.Replace(text, ${JSON.stringify(csTpl)});`,
    ].join('\n');
  }
  return [
    `var regex = new Regex(@"${csPat}"${opts});`,
    `foreach (Match m in regex.Matches(text))`,
    `    Console.WriteLine(m.Result(${JSON.stringify(csTpl)})); // flags: ${flagStr || 'none'}`,
  ].join('\n');
}
