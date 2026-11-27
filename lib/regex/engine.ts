import { filterFlagsForFlavor, FLAVORS } from './flavors';
import { flattenTokens, parseRegexPattern } from './parser';
import {
  DelimiterOption,
  ExecutionResult,
  ExtractJoinMode,
  ExtractionMode,
  GroupCapture,
  MatchItem,
  RegexDiagnostic,
  RegexFlavorId,
  RegexFlagId,
  RegexToken,
  TokenMatchSpan,
} from './types';

const MAX_MATCHES = 2000;

interface CompileOutput {
  jsSource: string;
  jsFlags: string;
  warnings: RegexDiagnostic[];
  error?: string;
}

/**
 * Strips unescaped whitespace and `# ...` comments outside character classes
 * when extended (/x) verbose mode is enabled.
 */
function stripExtendedMode(pattern: string): string {
  let out = '';
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\' && i + 1 < pattern.length) {
      out += ch + pattern[i + 1];
      i++;
      continue;
    }
    if (!inClass && ch === '[') {
      inClass = true;
      out += ch;
      continue;
    }
    if (inClass && ch === ']') {
      inClass = false;
      out += ch;
      continue;
    }
    if (!inClass) {
      if (/\s/.test(ch)) continue;
      if (ch === '#') {
        while (i < pattern.length && pattern[i] !== '\n') i++;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/**
 * Finds unescaped occurrences of the active delimiter outside character classes.
 */
function hasUnescapedDelimiter(pattern: string, delimiter: string): boolean {
  if (!delimiter || delimiter === 'none') return false;
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\' && i + 1 < pattern.length) {
      i++;
      continue;
    }
    if (!inClass && ch === '[') {
      inClass = true;
      continue;
    }
    if (inClass && ch === ']') {
      inClass = false;
      continue;
    }
    if (!inClass && ch === delimiter) {
      return true;
    }
  }
  return false;
}

/**
 * Transpiles flavor-specific syntax (Python (?P<name>...), (?P=name), inline comments (?#...),
 * escaped custom delimiters, and /x verbose whitespace) into valid ECMAScript RegExp source
 * while reporting honest flavor diagnostics.
 */
export function compileForExecution(
  pattern: string,
  flavor: RegexFlavorId,
  flags: readonly RegexFlagId[],
  delimiter: DelimiterOption,
): CompileOutput {
  const spec = FLAVORS[flavor];
  const warnings: RegexDiagnostic[] = [];
  const activeFlags = filterFlagsForFlavor(flags, flavor);

  if (delimiter !== 'none' && hasUnescapedDelimiter(pattern, delimiter)) {
    warnings.push({
      severity: 'warning',
      code: 'unescaped-delimiter',
      message: `Unescaped delimiter "${delimiter}" found inside the pattern. Escape it as \\${delimiter} or pick another delimiter such as ~ or #.`,
    });
  }

  let src = pattern;
  const extended = activeFlags.includes('x');
  if (extended) {
    src = stripExtendedMode(src);
  }

  // Strip inline comments (?#...) outside character classes
  let strippedComments = '';
  let inClass = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length) {
      // Unescape custom non-slash delimiter escapes like \~ or \# so JS unicode mode doesn't reject them
      const next = src[i + 1];
      if (!inClass && delimiter !== 'none' && delimiter !== '/' && next === delimiter) {
        strippedComments += next;
      } else {
        strippedComments += ch + next;
      }
      i++;
      continue;
    }
    if (!inClass && ch === '[') {
      inClass = true;
      strippedComments += ch;
      continue;
    }
    if (inClass && ch === ']') {
      inClass = false;
      strippedComments += ch;
      continue;
    }
    if (!inClass && ch === '(' && src.slice(i, i + 3) === '(?#') {
      const close = src.indexOf(')', i + 3);
      if (close !== -1) {
        i = close;
        continue;
      }
    }
    strippedComments += ch;
  }
  src = strippedComments;

  // Transpile Python / PCRE2 named group syntax (?P<name>...) and (?P=name)
  const usedPyNamed = /\(\?P<[A-Za-z_][A-Za-z0-9_]*>/.test(src);
  if (usedPyNamed) {
    if (flavor === 'js' || flavor === 'java' || flavor === 'dotnet') {
      warnings.push({
        severity: 'warning',
        code: 'py-named-group',
        message: `${spec.shortName} uses (?<name>...) rather than (?P<name>...). Converted automatically for preview.`,
      });
    }
    src = src.replace(/\(\?P<([A-Za-z_][A-Za-z0-9_]*)>/g, '(?<$1>');
  }

  if (/\(\?P=[A-Za-z_][A-Za-z0-9_]*\)/.test(src)) {
    src = src.replace(/\(\?P=([A-Za-z_][A-Za-z0-9_]*)\)/g, '\\k<$1>');
  }

  // Handle \A and \Z / \z in non-JS flavors
  let extraFlags = new Set<string>(activeFlags.filter((f) => f !== 'x'));
  if (/\\A/.test(src)) {
    if (flavor === 'js') {
      warnings.push({
        severity: 'warning',
        code: 'anchor-A-js',
        message: 'JavaScript does not support \\A. Use ^ without the m flag to match start of string.',
      });
    }
    src = src.replace(/(^|[^\\])\\A/g, '$1^');
  }
  if (/\\[Zz]/.test(src)) {
    if (flavor === 'js') {
      warnings.push({
        severity: 'warning',
        code: 'anchor-Z-js',
        message: 'JavaScript does not support \\Z/\\z. Use $ without the m flag to match end of string.',
      });
    }
    src = src.replace(/(^|[^\\])\\[Zz]/g, '$1$');
  }

  // Extract leading standalone inline flags like (?i) or (?im)
  const leadingInline = src.match(/^\(\?([ims]+)\)/);
  if (leadingInline) {
    for (const f of leadingInline[1]) {
      extraFlags.add(f);
    }
    src = src.slice(leadingInline[0].length);
  }

  // Possessive quantifiers (*+, ++, ?+, {m,n}+) are not native in ECMAScript
  const hasPossessive = /(?:\*|\+|\?|\{\d+(?:,\d*)?\})\+/.test(src);
  if (hasPossessive) {
    if (!spec.supportsPossessive) {
      warnings.push({
        severity: 'warning',
        code: 'possessive-unsupported',
        message: `${spec.shortName} does not support possessive quantifiers (*+, ++, ?+).`,
      });
    } else {
      warnings.push({
        severity: 'warning',
        code: 'possessive-emulated',
        message: `Possessive quantifiers (*+, ++) are simulated as greedy in browser preview.`,
      });
    }
    src = src.replace(/(\*|\+|\?|\{\d+(?:,\d*)?\})\+/g, '$1');
  }

  // Flavor-specific engine compatibility warnings (e.g. Go RE2 & Rust regex)
  const parsedTokens = parseRegexPattern(pattern, extended);
  const flat = flattenTokens(parsedTokens);

  if (!spec.supportsLookahead && flat.some((t) => t.kind === 'lookahead' || t.kind === 'negLookahead')) {
    warnings.push({
      severity: 'warning',
      code: 'lookahead-unsupported',
      message: `${spec.name} uses a linear-time finite automaton and does not support lookahead assertions (?=...) / (?!...). Preview still runs via ECMAScript.`,
    });
  }
  if (!spec.supportsLookbehind && flat.some((t) => t.kind === 'lookbehind' || t.kind === 'negLookbehind')) {
    warnings.push({
      severity: 'warning',
      code: 'lookbehind-unsupported',
      message: `${spec.name} does not support lookbehind assertions (?<=...) / (?<!...). Preview still runs via ECMAScript.`,
    });
  }
  if (!spec.supportsBackreferences && flat.some((t) => t.kind === 'backreference')) {
    warnings.push({
      severity: 'warning',
      code: 'backref-unsupported',
      message: `${spec.name} guarantees linear-time execution by disallowing backreferences (\\1, \\k<name>). Preview still runs via ECMAScript.`,
    });
  }

  // Add 'd' (hasIndices) for exact capture group start/end offsets when supported
  const jsFlagOrder = ['g', 'i', 'm', 's', 'u', 'y'];
  const jsFlags = jsFlagOrder.filter((f) => extraFlags.has(f)).join('') + 'd';

  try {
    new RegExp(src, jsFlags);
    return { jsSource: src, jsFlags, warnings };
  } catch (err) {
    return {
      jsSource: src,
      jsFlags,
      warnings,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

interface InstrumentedMapping {
  regex: RegExp;
  slotToTokenId: Map<number, { tokenId: string; groupIndex?: number }>;
}

/**
 * Builds an instrumented RegExp wrapping matchable tokens in capturing groups
 * so we can compute exact [start, end] spans for EVERY individual token in the regex!
 * Safely remaps numeric backreferences when wrapping adds extra capture slots.
 */
function buildInstrumentedRegex(
  tokens: readonly RegexToken[],
  jsFlags: string,
  delimiter: DelimiterOption,
): InstrumentedMapping | null {
  const slotToTokenId = new Map<number, { tokenId: string; groupIndex?: number }>();
  const origGroupToNewSlot = new Map<number, number>();
  let nextSlot = 1;

  // First pass: assign capture slots so we know how original group numbers shift
  const tokenSlot = new Map<string, number>();

  const assignSlots = (list: readonly RegexToken[]) => {
    for (const tok of list) {
      if (tok.kind === 'comment' || tok.kind === 'inlineFlag' || tok.kind === 'alternation' || tok.kind === 'anchor') {
        continue;
      }
      if (tok.kind === 'group' || tok.kind === 'namedGroup') {
        const slot = nextSlot++;
        tokenSlot.set(tok.id, slot);
        if (tok.groupIndex !== undefined) {
          origGroupToNewSlot.set(tok.groupIndex, slot);
        }
        slotToTokenId.set(slot, { tokenId: tok.id, groupIndex: tok.groupIndex });
        if (tok.children) assignSlots(tok.children);
        continue;
      }
      if (tok.kind === 'nonCapturingGroup') {
        const slot = nextSlot++;
        tokenSlot.set(tok.id, slot);
        slotToTokenId.set(slot, { tokenId: tok.id });
        if (tok.children) assignSlots(tok.children);
        continue;
      }
      if (tok.kind === 'lookahead' || tok.kind === 'negLookahead' || tok.kind === 'lookbehind' || tok.kind === 'negLookbehind') {
        // Do not wrap inside lookarounds to keep assertion semantics untouched
        continue;
      }
      if (tok.matchable) {
        const slot = nextSlot++;
        tokenSlot.set(tok.id, slot);
        slotToTokenId.set(slot, { tokenId: tok.id });
      }
    }
  };

  assignSlots(tokens);

  if (nextSlot > 120) {
    // Keep instrumentation lightweight for massive patterns
    return null;
  }

  const sanitizeRaw = (raw: string): string => {
    let out = raw;
    if (delimiter !== 'none' && delimiter !== '/') {
      out = out.replace(new RegExp(`\\\\${delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), delimiter);
    }
    out = out.replace(/(\*|\+|\?|\{\d+(?:,\d*)?\})\+/g, '$1');
    return out;
  };

  const emitList = (list: readonly RegexToken[]): string => {
    let out = '';
    for (const tok of list) {
      if (tok.kind === 'comment' || tok.kind === 'inlineFlag') {
        continue;
      }
      if (tok.kind === 'alternation') {
        out += '|';
        continue;
      }
      if (tok.kind === 'anchor') {
        if (tok.raw === '\\A') out += '^';
        else if (tok.raw === '\\Z' || tok.raw === '\\z') out += '$';
        else out += tok.raw;
        continue;
      }
      if (
        tok.kind === 'lookahead' ||
        tok.kind === 'negLookahead' ||
        tok.kind === 'lookbehind' ||
        tok.kind === 'negLookbehind'
      ) {
        out += sanitizeRaw(tok.raw);
        continue;
      }

      const quant = tok.quantifier
        ? tok.quantifier.mode === 'possessive'
          ? tok.quantifier.raw.slice(0, -1)
          : tok.quantifier.raw
        : '';

      if (tok.kind === 'group' || tok.kind === 'namedGroup' || tok.kind === 'nonCapturingGroup') {
        const inner = tok.children ? emitList(tok.children) : '';
        if (quant) {
          // Wrap the whole quantified group so the slot captures all repetitions
          if (tok.kind === 'namedGroup' && tok.groupName) {
            out += `(?<${tok.groupName}>(?:${inner})${quant})`;
          } else {
            out += `((?:${inner})${quant})`;
          }
        } else if (tok.kind === 'namedGroup' && tok.groupName) {
          out += `(?<${tok.groupName}>${inner})`;
        } else {
          out += `(${inner})`;
        }
        continue;
      }

      if (tok.kind === 'backreference') {
        let refExpr = sanitizeRaw(tok.coreRaw);
        if (tok.refIndex !== undefined) {
          const mapped = origGroupToNewSlot.get(tok.refIndex);
          if (mapped !== undefined) {
            refExpr = `\\${mapped}`;
          }
        } else if (tok.groupName) {
          refExpr = `\\k<${tok.groupName}>`;
        }
        out += `(${refExpr}${quant})`;
        continue;
      }

      if (tok.matchable) {
        out += `(${sanitizeRaw(tok.coreRaw)}${quant})`;
        continue;
      }

      out += sanitizeRaw(tok.raw);
    }
    return out;
  };

  try {
    const source = emitList(tokens);
    // Keep same flags minus g/y since we align against the anchored match window, or keep full flags with d
    const alignFlags = jsFlags.replace(/[gy]/g, '') + (jsFlags.includes('d') ? '' : 'd');
    const regex = new RegExp(source, alignFlags);
    return { regex, slotToTokenId };
  } catch {
    return null;
  }
}

export function executeRegex(
  pattern: string,
  testText: string,
  flavor: RegexFlavorId,
  flags: readonly RegexFlagId[],
  delimiter: DelimiterOption,
): ExecutionResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const activeFlags = filterFlagsForFlavor(flags, flavor);
  const extended = activeFlags.includes('x');
  const tokens = parseRegexPattern(pattern, extended);

  const flatTokens = flattenTokens(tokens);
  const groupNames: { index: number; name?: string }[] = [];
  for (const tok of flatTokens) {
    if ((tok.kind === 'group' || tok.kind === 'namedGroup') && tok.groupIndex !== undefined) {
      groupNames.push({ index: tok.groupIndex, name: tok.groupName });
    }
  }

  if (!pattern) {
    return {
      valid: true,
      warnings: [],
      matches: [],
      truncated: false,
      elapsedMs: 0,
      compiledSource: '',
      compiledFlags: activeFlags.join(''),
      tokens: [],
      groupNames: [],
      tokenSpansByTokenId: {},
    };
  }

  const compiled = compileForExecution(pattern, flavor, activeFlags, delimiter);
  if (compiled.error) {
    return {
      valid: false,
      error: compiled.error,
      warnings: compiled.warnings,
      matches: [],
      truncated: false,
      elapsedMs: 0,
      compiledSource: compiled.jsSource,
      compiledFlags: compiled.jsFlags,
      tokens,
      groupNames,
      tokenSpansByTokenId: {},
    };
  }

  const matches: MatchItem[] = [];
  const tokenSpansByTokenId: Record<string, TokenMatchSpan[]> = {};
  let truncated = false;

  const isGlobal = compiled.jsFlags.includes('g');
  const isSticky = compiled.jsFlags.includes('y');
  const re = new RegExp(compiled.jsSource, compiled.jsFlags);
  const instrumented = buildInstrumentedRegex(tokens, compiled.jsFlags, delimiter);

  const pushSpan = (span: TokenMatchSpan) => {
    const bucket = tokenSpansByTokenId[span.tokenId];
    if (bucket) bucket.push(span);
    else tokenSpansByTokenId[span.tokenId] = [span];
  };

  let execMatch: RegExpExecArray | null;
  let safety = 0;

  while ((execMatch = re.exec(testText)) !== null) {
    safety++;
    if (matches.length >= MAX_MATCHES || safety > MAX_MATCHES + 50) {
      truncated = true;
      break;
    }

    const matchIndex = matches.length;
    const start = execMatch.index;
    const fullMatch = execMatch[0];
    const end = start + fullMatch.length;

    const indicesArr = (execMatch as RegExpExecArray & { indices?: ([number, number] | undefined)[] }).indices;
    const groups: GroupCapture[] = [];

    for (let gi = 1; gi < execMatch.length; gi++) {
      const meta = groupNames.find((g) => g.index === gi);
      const val = execMatch[gi];
      const range = indicesArr?.[gi];
      groups.push({
        index: gi,
        name: meta?.name,
        value: val,
        start: range ? range[0] : -1,
        end: range ? range[1] : -1,
      });
    }

    const tokenSpans: TokenMatchSpan[] = [];

    // Try sub-token instrumented alignment against the exact match window (or full text with sticky)
    let aligned = false;
    if (instrumented) {
      try {
        const stickyFlags = instrumented.regex.flags.includes('y')
          ? instrumented.regex.flags
          : `${instrumented.regex.flags}y`;
        const alignRe = new RegExp(instrumented.regex.source, stickyFlags);
        alignRe.lastIndex = start;
        const alignExec = alignRe.exec(testText) as
          | (RegExpExecArray & { indices?: ([number, number] | undefined)[] })
          | null;

        if (alignExec && alignExec.index === start && alignExec[0] === fullMatch && alignExec.indices) {
          aligned = true;
          for (const [slot, info] of instrumented.slotToTokenId.entries()) {
            const pair = alignExec.indices[slot];
            if (!pair) continue;
            const span: TokenMatchSpan = {
              tokenId: info.tokenId,
              matchIndex,
              start: pair[0],
              end: pair[1],
              text: testText.slice(pair[0], pair[1]),
              groupIndex: info.groupIndex,
            };
            tokenSpans.push(span);
            pushSpan(span);
          }
        }
      } catch {
        aligned = false;
      }
    }

    // Fallback: link at least capturing groups using native `indices`
    if (!aligned) {
      for (const tok of flatTokens) {
        if (tok.groupIndex !== undefined) {
          const cap = groups.find((g) => g.index === tok.groupIndex);
          if (cap && cap.start >= 0 && cap.end >= cap.start) {
            const span: TokenMatchSpan = {
              tokenId: tok.id,
              matchIndex,
              start: cap.start,
              end: cap.end,
              text: testText.slice(cap.start, cap.end),
              groupIndex: tok.groupIndex,
            };
            tokenSpans.push(span);
            pushSpan(span);
          }
        }
      }
    }

    matches.push({
      matchIndex,
      fullMatch,
      start,
      end,
      groups,
      tokenSpans,
    });

    if (!isGlobal && !isSticky) break;
    if (fullMatch.length === 0) {
      if (re.lastIndex >= testText.length) break;
      re.lastIndex += 1;
    }
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    valid: true,
    warnings: compiled.warnings,
    matches,
    truncated,
    elapsedMs: Math.max(0, Number((t1 - t0).toFixed(2))),
    compiledSource: compiled.jsSource,
    compiledFlags: compiled.jsFlags,
    tokens,
    groupNames,
    tokenSpansByTokenId,
  };
}

/**
 * Expands an extraction/replacement template for a single match.
 * Supports: $0, $&, $1..$99, $<name>, \g<name>, \1..\9, $`, $', $$, $i / ${index}, \n, \t, \r.
 */
export function expandTemplateForMatch(
  template: string,
  match: MatchItem,
  fullText: string,
): string {
  let out = '';
  let i = 0;

  while (i < template.length) {
    const ch = template[i];

    // Backslash escapes: \n, \t, \r, \\, \g<name>, \1..\9
    if (ch === '\\' && i + 1 < template.length) {
      const next = template[i + 1];
      if (next === 'n') {
        out += '\n';
        i += 2;
        continue;
      }
      if (next === 't') {
        out += '\t';
        i += 2;
        continue;
      }
      if (next === 'r') {
        out += '\r';
        i += 2;
        continue;
      }
      if (next === '\\') {
        out += '\\';
        i += 2;
        continue;
      }
      if (next === 'g' && template[i + 2] === '<') {
        const close = template.indexOf('>', i + 3);
        if (close !== -1) {
          const ref = template.slice(i + 3, close);
          if (/^\d+$/.test(ref)) {
            const idx = Number.parseInt(ref, 10);
            out += idx === 0 ? match.fullMatch : (match.groups.find((g) => g.index === idx)?.value ?? '');
          } else {
            out += match.groups.find((g) => g.name === ref)?.value ?? '';
          }
          i = close + 1;
          continue;
        }
      }
      if (next >= '0' && next <= '9') {
        const idx = Number.parseInt(next, 10);
        out += idx === 0 ? match.fullMatch : (match.groups.find((g) => g.index === idx)?.value ?? '');
        i += 2;
        continue;
      }
    }

    // Dollar tokens: $$, $&, $0, $1..$99, $<name>, $`, $', $i, ${index}
    if (ch === '$' && i + 1 < template.length) {
      const next = template[i + 1];
      if (next === '$') {
        out += '$';
        i += 2;
        continue;
      }
      if (next === '&') {
        out += match.fullMatch;
        i += 2;
        continue;
      }
      if (next === '`') {
        out += fullText.slice(0, match.start);
        i += 2;
        continue;
      }
      if (next === "'") {
        out += fullText.slice(match.end);
        i += 2;
        continue;
      }
      if (next === 'i' && !/[A-Za-z0-9_]/.test(template[i + 2] ?? '')) {
        out += String(match.matchIndex + 1);
        i += 2;
        continue;
      }
      if (template.slice(i, i + 8) === '${index}') {
        out += String(match.matchIndex + 1);
        i += 8;
        continue;
      }
      if (next === '<') {
        const close = template.indexOf('>', i + 2);
        if (close !== -1) {
          const name = template.slice(i + 2, close);
          out += match.groups.find((g) => g.name === name)?.value ?? '';
          i = close + 1;
          continue;
        }
      }
      if (next >= '0' && next <= '9') {
        let numStr = next;
        let endIdx = i + 2;
        if (endIdx < template.length && template[endIdx] >= '0' && template[endIdx] <= '9') {
          const twoDigit = Number.parseInt(numStr + template[endIdx], 10);
          if (twoDigit <= match.groups.length) {
            numStr += template[endIdx];
            endIdx += 1;
          }
        }
        const idx = Number.parseInt(numStr, 10);
        out += idx === 0 ? match.fullMatch : (match.groups.find((g) => g.index === idx)?.value ?? '');
        i = endIdx;
        continue;
      }
    }

    out += ch;
    i += 1;
  }

  return out;
}

export function applyExtractionTemplate(
  testText: string,
  matches: readonly MatchItem[],
  template: string,
  mode: ExtractionMode,
  joinMode: ExtractJoinMode = 'newline',
): { output: string; items: string[] } {
  if (matches.length === 0) {
    return {
      output: mode === 'replace' ? testText : '',
      items: [],
    };
  }

  const effectiveTemplate = template;

  if (mode === 'replace') {
    let result = '';
    let cursor = 0;
    const items: string[] = [];
    for (const m of matches) {
      if (m.start < cursor) continue;
      result += testText.slice(cursor, m.start);
      const replaced = expandTemplateForMatch(effectiveTemplate, m, testText);
      items.push(replaced);
      result += replaced;
      cursor = m.end;
    }
    result += testText.slice(cursor);
    return { output: result, items };
  }

  const items = matches.map((m) => expandTemplateForMatch(effectiveTemplate, m, testText));

  if (joinMode === 'json') {
    return { output: JSON.stringify(items, null, 2), items };
  }
  const sep =
    joinMode === 'newline'
      ? '\n'
      : joinMode === 'comma'
        ? ', '
        : joinMode === 'tab'
          ? '\t'
          : '';
  return { output: items.join(sep), items };
}
