import { QuantifierMode, RegexQuantifier, RegexToken } from './types';

interface ParseState {
  pattern: string;
  pos: number;
  nextTokenId: number;
  nextGroupIndex: number;
  extendedMode: boolean;
}

const SHORTHAND_DESCRIPTIONS: Record<string, { label: string; desc: string }> = {
  '\\d': { label: 'Digit', desc: 'Matches any ASCII digit (0–9).' },
  '\\D': { label: 'Non-digit', desc: 'Matches any character that is not a digit ([^0-9]).' },
  '\\w': { label: 'Word character', desc: 'Matches any letter, digit, or underscore ([A-Za-z0-9_]).' },
  '\\W': { label: 'Non-word character', desc: 'Matches any character except letters, digits, and underscore.' },
  '\\s': { label: 'Whitespace', desc: 'Matches any space, tab, newline, or Unicode whitespace character.' },
  '\\S': { label: 'Non-whitespace', desc: 'Matches any character that is not whitespace.' },
  '\\t': { label: 'Tab', desc: 'Matches a horizontal tab character (U+0009).' },
  '\\n': { label: 'Line feed', desc: 'Matches a newline / line-feed character (U+000A).' },
  '\\r': { label: 'Carriage return', desc: 'Matches a carriage-return character (U+000D).' },
  '\\f': { label: 'Form feed', desc: 'Matches a form-feed character (U+000C).' },
  '\\v': { label: 'Vertical tab', desc: 'Matches a vertical tab character (U+000B).' },
  '\\0': { label: 'Null byte', desc: 'Matches the NUL character (U+0000).' },
};

const ANCHOR_DESCRIPTIONS: Record<string, { label: string; desc: string }> = {
  '^': { label: 'Start anchor', desc: 'Asserts position at the start of the string (or start of a line with the m flag).' },
  '$': { label: 'End anchor', desc: 'Asserts position at the end of the string (or end of a line with the m flag).' },
  '\\b': { label: 'Word boundary', desc: 'Asserts a boundary between a word character (\\w) and a non-word character or edge.' },
  '\\B': { label: 'Non-word boundary', desc: 'Asserts a position that is NOT a word boundary.' },
  '\\A': { label: 'Start of string', desc: 'Asserts position strictly at the very beginning of the entire input string.' },
  '\\Z': { label: 'End of string', desc: 'Asserts position at the end of the string (or before a final trailing newline).' },
  '\\z': { label: 'Absolute end', desc: 'Asserts position strictly at the absolute end of the input string.' },
  '\\G': { label: 'End of previous match', desc: 'Asserts position where the previous match ended (or start of string).' },
};

function describeQuantifier(q: RegexQuantifier): string {
  let rangeText: string;
  if (q.min === 0 && q.max === null) {
    rangeText = '0 or more times';
  } else if (q.min === 1 && q.max === null) {
    rangeText = '1 or more times';
  } else if (q.min === 0 && q.max === 1) {
    rangeText = '0 or 1 time (optional)';
  } else if (q.max === null) {
    rangeText = `at least ${q.min} times`;
  } else if (q.min === q.max) {
    rangeText = `exactly ${q.min} ${q.min === 1 ? 'time' : 'times'}`;
  } else {
    rangeText = `between ${q.min} and ${q.max} times`;
  }

  if (q.mode === 'lazy') {
    return `Matches ${rangeText}, as few times as possible (lazy / non-greedy).`;
  }
  if (q.mode === 'possessive') {
    return `Matches ${rangeText}, without giving back matched characters (possessive).`;
  }
  return `Matches ${rangeText}, as many times as possible (greedy).`;
}

function tryReadQuantifier(state: ParseState): RegexQuantifier | undefined {
  const { pattern, pos } = state;
  if (pos >= pattern.length) return undefined;

  const ch = pattern[pos];
  let min = 0;
  let max: number | null = null;
  let end = pos;

  if (ch === '*') {
    min = 0;
    max = null;
    end = pos + 1;
  } else if (ch === '+') {
    min = 1;
    max = null;
    end = pos + 1;
  } else if (ch === '?') {
    min = 0;
    max = 1;
    end = pos + 1;
  } else if (ch === '{') {
    const rest = pattern.slice(pos);
    const match = rest.match(/^\{(\d+)(?:,(\d*))?\}/);
    if (!match) return undefined;
    min = Number.parseInt(match[1], 10);
    if (match[2] === undefined) {
      max = min;
    } else if (match[2] === '') {
      max = null;
    } else {
      max = Number.parseInt(match[2], 10);
    }
    end = pos + match[0].length;
  } else {
    return undefined;
  }

  let mode: QuantifierMode = 'greedy';
  if (end < pattern.length) {
    if (pattern[end] === '?') {
      mode = 'lazy';
      end += 1;
    } else if (pattern[end] === '+') {
      mode = 'possessive';
      end += 1;
    }
  }

  const raw = pattern.slice(pos, end);
  state.pos = end;
  return { raw, min, max, mode, start: pos, end };
}

function describeCharClass(raw: string, negated: boolean): string {
  const inner = raw.slice(negated ? 2 : 1, raw.endsWith(']') ? -1 : undefined);
  if (!inner) {
    return negated ? 'Negated empty character class.' : 'Empty character class.';
  }

  const parts: string[] = [];
  let i = 0;
  while (i < inner.length) {
    if (inner[i] === '\\' && i + 1 < inner.length) {
      const seq = inner.slice(i, i + 2);
      if (SHORTHAND_DESCRIPTIONS[seq]) {
        parts.push(SHORTHAND_DESCRIPTIONS[seq].label.toLowerCase());
      } else {
        parts.push(`"${inner[i + 1]}"`);
      }
      i += 2;
      continue;
    }
    if (i + 2 < inner.length && inner[i + 1] === '-' && inner[i + 2] !== ']') {
      const from = inner[i];
      const to = inner[i + 2];
      parts.push(`range ${from}–${to}`);
      i += 3;
      continue;
    }
    parts.push(`"${inner[i]}"`);
    i += 1;
  }

  const summary = parts.slice(0, 6).join(', ') + (parts.length > 6 ? `, … (+${parts.length - 6} more)` : '');
  return negated
    ? `Matches any single character NOT in the set: ${summary}.`
    : `Matches any single character from the set: ${summary}.`;
}

function readCharClass(state: ParseState): RegexToken {
  const start = state.pos;
  const { pattern } = state;
  state.pos += 1; // consume '['
  let negated = false;
  if (state.pos < pattern.length && pattern[state.pos] === '^') {
    negated = true;
    state.pos += 1;
  }
  // A ']' right at the start of a class is literal
  if (state.pos < pattern.length && pattern[state.pos] === ']') {
    state.pos += 1;
  }
  while (state.pos < pattern.length) {
    const c = pattern[state.pos];
    if (c === '\\' && state.pos + 1 < pattern.length) {
      state.pos += 2;
      continue;
    }
    if (c === ']') {
      state.pos += 1;
      break;
    }
    state.pos += 1;
  }

  const coreRaw = pattern.slice(start, state.pos);
  const quantifier = tryReadQuantifier(state);
  const end = state.pos;
  const raw = pattern.slice(start, end);

  return {
    id: `tok_${state.nextTokenId++}`,
    kind: negated ? 'negCharClass' : 'charClass',
    raw,
    coreRaw,
    start,
    end,
    quantifier,
    label: negated ? 'Negated character class' : 'Character class',
    description: describeCharClass(coreRaw, negated),
    quantifierDescription: quantifier ? describeQuantifier(quantifier) : undefined,
    matchable: true,
  };
}

function readEscape(state: ParseState): RegexToken {
  const start = state.pos;
  const { pattern } = state;
  const next = pattern[start + 1];

  if (next === undefined) {
    state.pos += 1;
    return {
      id: `tok_${state.nextTokenId++}`,
      kind: 'escape',
      raw: '\\',
      coreRaw: '\\',
      start,
      end: state.pos,
      label: 'Trailing backslash',
      description: 'Incomplete escape sequence at end of pattern.',
      matchable: false,
    };
  }

  const two = pattern.slice(start, start + 2);

  // Anchors like \b, \B, \A, \Z, \z, \G
  if (ANCHOR_DESCRIPTIONS[two]) {
    state.pos += 2;
    return {
      id: `tok_${state.nextTokenId++}`,
      kind: 'anchor',
      raw: two,
      coreRaw: two,
      start,
      end: state.pos,
      label: ANCHOR_DESCRIPTIONS[two].label,
      description: ANCHOR_DESCRIPTIONS[two].desc,
      matchable: false,
    };
  }

  // Shorthands like \d, \w, \s, \t, \n
  if (SHORTHAND_DESCRIPTIONS[two]) {
    state.pos += 2;
    const quantifier = tryReadQuantifier(state);
    const end = state.pos;
    return {
      id: `tok_${state.nextTokenId++}`,
      kind: 'shorthand',
      raw: pattern.slice(start, end),
      coreRaw: two,
      start,
      end,
      quantifier,
      label: SHORTHAND_DESCRIPTIONS[two].label,
      description: SHORTHAND_DESCRIPTIONS[two].desc,
      quantifierDescription: quantifier ? describeQuantifier(quantifier) : undefined,
      matchable: true,
    };
  }

  // Named backreference \k<name>
  if (next === 'k' && pattern[start + 2] === '<') {
    const closeIdx = pattern.indexOf('>', start + 3);
    if (closeIdx !== -1) {
      const name = pattern.slice(start + 3, closeIdx);
      state.pos = closeIdx + 1;
      const coreRaw = pattern.slice(start, state.pos);
      const quantifier = tryReadQuantifier(state);
      const end = state.pos;
      return {
        id: `tok_${state.nextTokenId++}`,
        kind: 'backreference',
        raw: pattern.slice(start, end),
        coreRaw,
        start,
        end,
        groupName: name,
        quantifier,
        label: `Backreference "${name}"`,
        description: `Matches the exact same text previously captured by named group "${name}".`,
        quantifierDescription: quantifier ? describeQuantifier(quantifier) : undefined,
        matchable: true,
      };
    }
  }

  // Unicode property escape \p{...} or \P{...}
  if ((next === 'p' || next === 'P') && pattern[start + 2] === '{') {
    const closeIdx = pattern.indexOf('}', start + 3);
    if (closeIdx !== -1) {
      const prop = pattern.slice(start + 3, closeIdx);
      state.pos = closeIdx + 1;
      const coreRaw = pattern.slice(start, state.pos);
      const quantifier = tryReadQuantifier(state);
      const end = state.pos;
      const negated = next === 'P';
      return {
        id: `tok_${state.nextTokenId++}`,
        kind: 'shorthand',
        raw: pattern.slice(start, end),
        coreRaw,
        start,
        end,
        quantifier,
        label: negated ? `Negated Unicode property (${prop})` : `Unicode property (${prop})`,
        description: negated
          ? `Matches any Unicode character that does NOT have property "${prop}".`
          : `Matches any Unicode character with property "${prop}".`,
        quantifierDescription: quantifier ? describeQuantifier(quantifier) : undefined,
        matchable: true,
      };
    }
  }

  // Hex \xHH or Unicode \uHHHH / \u{...}
  if (next === 'x' && /^[0-9a-fA-F]{2}/.test(pattern.slice(start + 2))) {
    state.pos = start + 4;
    const hex = pattern.slice(start + 2, start + 4);
    const coreRaw = pattern.slice(start, state.pos);
    const quantifier = tryReadQuantifier(state);
    const end = state.pos;
    return {
      id: `tok_${state.nextTokenId++}`,
      kind: 'escape',
      raw: pattern.slice(start, end),
      coreRaw,
      start,
      end,
      quantifier,
      label: `Hex character 0x${hex}`,
      description: `Matches character with hexadecimal code 0x${hex} (decimal ${Number.parseInt(hex, 16)}).`,
      quantifierDescription: quantifier ? describeQuantifier(quantifier) : undefined,
      matchable: true,
    };
  }

  if (next === 'u') {
    const braceMatch = pattern.slice(start + 2).match(/^\{([0-9a-fA-F]+)\}/);
    const fourMatch = pattern.slice(start + 2).match(/^([0-9a-fA-F]{4})/);
    if (braceMatch || fourMatch) {
      const hex = braceMatch ? braceMatch[1] : fourMatch![1];
      state.pos = start + 2 + (braceMatch ? braceMatch[0].length : 4);
      const coreRaw = pattern.slice(start, state.pos);
      const quantifier = tryReadQuantifier(state);
      const end = state.pos;
      return {
        id: `tok_${state.nextTokenId++}`,
        kind: 'escape',
        raw: pattern.slice(start, end),
        coreRaw,
        start,
        end,
        quantifier,
        label: `Unicode U+${hex.toUpperCase()}`,
        description: `Matches Unicode code point U+${hex.toUpperCase()}.`,
        quantifierDescription: quantifier ? describeQuantifier(quantifier) : undefined,
        matchable: true,
      };
    }
  }

  // Numeric backreference \1..\9 (or \10.. if <= known groups)
  if (next >= '1' && next <= '9') {
    let digits = next;
    let cursor = start + 2;
    while (cursor < pattern.length && pattern[cursor] >= '0' && pattern[cursor] <= '9') {
      const candidate = Number.parseInt(digits + pattern[cursor], 10);
      if (candidate < state.nextGroupIndex) {
        digits += pattern[cursor];
        cursor++;
      } else {
        break;
      }
    }
    const refIndex = Number.parseInt(digits, 10);
    state.pos = cursor;
    const coreRaw = pattern.slice(start, state.pos);
    const quantifier = tryReadQuantifier(state);
    const end = state.pos;
    return {
      id: `tok_${state.nextTokenId++}`,
      kind: 'backreference',
      raw: pattern.slice(start, end),
      coreRaw,
      start,
      end,
      refIndex,
      quantifier,
      label: `Backreference #${refIndex}`,
      description: `Matches the exact same text most recently captured by group #${refIndex}.`,
      quantifierDescription: quantifier ? describeQuantifier(quantifier) : undefined,
      matchable: true,
    };
  }

  // Escaped literal character (e.g. \., \/, \+, \[, \\)
  state.pos += 2;
  const coreRaw = two;
  const quantifier = tryReadQuantifier(state);
  const end = state.pos;
  return {
    id: `tok_${state.nextTokenId++}`,
    kind: 'escape',
    raw: pattern.slice(start, end),
    coreRaw,
    start,
    end,
    quantifier,
    label: `Escaped "${next}"`,
    description: `Matches the literal character "${next}" (escaped so it loses special regex meaning).`,
    quantifierDescription: quantifier ? describeQuantifier(quantifier) : undefined,
    matchable: true,
  };
}

function readGroup(state: ParseState): RegexToken {
  const start = state.pos;
  const { pattern } = state;
  state.pos += 1; // consume '('

  let kind: RegexToken['kind'] = 'group';
  let groupIndex: number | undefined;
  let groupName: string | undefined;
  let label = '';
  let description = '';
  let matchable = true;

  if (pattern[state.pos] === '?') {
    const rest = pattern.slice(state.pos);

    // Inline comment (?#...)
    if (rest.startsWith('?#')) {
      const closeIdx = pattern.indexOf(')', state.pos + 2);
      state.pos = closeIdx === -1 ? pattern.length : closeIdx + 1;
      const raw = pattern.slice(start, state.pos);
      return {
        id: `tok_${state.nextTokenId++}`,
        kind: 'comment',
        raw,
        coreRaw: raw,
        start,
        end: state.pos,
        label: 'Inline comment',
        description: 'Ignored by the regex engine; documents the pattern inline.',
        matchable: false,
      };
    }

    // Python named backreference (?P=name)
    const pyBackref = rest.match(/^\?P=([A-Za-z_][A-Za-z0-9_]*)\)/);
    if (pyBackref) {
      state.pos += pyBackref[0].length;
      const coreRaw = pattern.slice(start, state.pos);
      const quantifier = tryReadQuantifier(state);
      const end = state.pos;
      return {
        id: `tok_${state.nextTokenId++}`,
        kind: 'backreference',
        raw: pattern.slice(start, end),
        coreRaw,
        start,
        end,
        groupName: pyBackref[1],
        quantifier,
        label: `Backreference "${pyBackref[1]}"`,
        description: `Matches the exact same text previously captured by Python named group "${pyBackref[1]}".`,
        quantifierDescription: quantifier ? describeQuantifier(quantifier) : undefined,
        matchable: true,
      };
    }

    // Standalone inline modifier (?imsx-imsx)
    const inlineMod = rest.match(/^\?([imsxuU-]+)\)/);
    if (inlineMod) {
      state.pos += inlineMod[0].length;
      const raw = pattern.slice(start, state.pos);
      return {
        id: `tok_${state.nextTokenId++}`,
        kind: 'inlineFlag',
        raw,
        coreRaw: raw,
        start,
        end: state.pos,
        label: `Inline flags (${inlineMod[1]})`,
        description: `Modifies active pattern flags (${inlineMod[1]}) for the remainder of the scope.`,
        matchable: false,
      };
    }

    // Non-capturing group (?:...) or scoped flags (?i:...)
    const scopedNonCap = rest.match(/^\?([imsx-]*):/);
    if (scopedNonCap) {
      kind = 'nonCapturingGroup';
      state.pos += scopedNonCap[0].length;
      label = scopedNonCap[1] ? `Scoped group (?${scopedNonCap[1]}:)` : 'Non-capturing group';
      description = scopedNonCap[1]
        ? `Groups tokens with scoped flags (${scopedNonCap[1]}) without creating a numbered capture.`
        : 'Groups tokens together for quantifiers or alternation without capturing a numbered group.';
    } else if (rest.startsWith('?=')) {
      kind = 'lookahead';
      state.pos += 2;
      matchable = false;
      label = 'Positive lookahead';
      description = 'Asserts that the following text matches this subpattern, without consuming characters.';
    } else if (rest.startsWith('?!')) {
      kind = 'negLookahead';
      state.pos += 2;
      matchable = false;
      label = 'Negative lookahead';
      description = 'Asserts that the following text does NOT match this subpattern, without consuming characters.';
    } else if (rest.startsWith('?<=')) {
      kind = 'lookbehind';
      state.pos += 3;
      matchable = false;
      label = 'Positive lookbehind';
      description = 'Asserts that the text immediately before this position matches this subpattern.';
    } else if (rest.startsWith('?<!')) {
      kind = 'negLookbehind';
      state.pos += 3;
      matchable = false;
      label = 'Negative lookbehind';
      description = 'Asserts that the text immediately before this position does NOT match this subpattern.';
    } else {
      // Named capturing group (?<name>...) or (?P<name>...)
      const namedMatch = rest.match(/^\?P?<([A-Za-z_][A-Za-z0-9_]*)>/);
      if (namedMatch) {
        kind = 'namedGroup';
        groupIndex = state.nextGroupIndex++;
        groupName = namedMatch[1];
        state.pos += namedMatch[0].length;
        label = `Named group #${groupIndex} "${groupName}"`;
        description = `Captures its matched substring as both group #${groupIndex} and named group "${groupName}".`;
      } else {
        // Fallback capturing group
        kind = 'group';
        groupIndex = state.nextGroupIndex++;
        label = `Capturing group #${groupIndex}`;
        description = `Groups tokens and captures the matched substring as group #${groupIndex}.`;
      }
    }
  } else {
    kind = 'group';
    groupIndex = state.nextGroupIndex++;
    label = `Capturing group #${groupIndex}`;
    description = `Groups tokens and captures the matched substring as group #${groupIndex} (accessible as $${groupIndex}).`;
  }

  const children = parseSequence(state, true);
  if (state.pos < pattern.length && pattern[state.pos] === ')') {
    state.pos += 1;
  }

  const coreRaw = pattern.slice(start, state.pos);
  const quantifier = matchable ? tryReadQuantifier(state) : undefined;
  const end = state.pos;
  const raw = pattern.slice(start, end);

  return {
    id: `tok_${state.nextTokenId++}`,
    kind,
    raw,
    coreRaw,
    start,
    end,
    groupIndex,
    groupName,
    quantifier,
    label,
    description,
    quantifierDescription: quantifier ? describeQuantifier(quantifier) : undefined,
    children,
    matchable,
  };
}

function isSpecialAtomChar(ch: string): boolean {
  return (
    ch === '\\' ||
    ch === '[' ||
    ch === '(' ||
    ch === ')' ||
    ch === '|' ||
    ch === '^' ||
    ch === '$' ||
    ch === '.' ||
    ch === '*' ||
    ch === '+' ||
    ch === '?' ||
    ch === '{'
  );
}

function isQuantifierStart(pattern: string, idx: number): boolean {
  if (idx >= pattern.length) return false;
  const ch = pattern[idx];
  if (ch === '*' || ch === '+' || ch === '?') return true;
  if (ch === '{') {
    return /^\{\d+(?:,\d*)?\}/.test(pattern.slice(idx));
  }
  return false;
}

function parseSequence(state: ParseState, stopAtCloseParen: boolean): RegexToken[] {
  const tokens: RegexToken[] = [];
  const { pattern } = state;

  while (state.pos < pattern.length) {
    const ch = pattern[state.pos];

    if (stopAtCloseParen && ch === ')') {
      break;
    }

    // Extended (/x) mode whitespace & # comments
    if (state.extendedMode) {
      if (/\s/.test(ch)) {
        state.pos += 1;
        continue;
      }
      if (ch === '#') {
        const start = state.pos;
        while (state.pos < pattern.length && pattern[state.pos] !== '\n') {
          state.pos += 1;
        }
        const raw = pattern.slice(start, state.pos);
        tokens.push({
          id: `tok_${state.nextTokenId++}`,
          kind: 'comment',
          raw,
          coreRaw: raw,
          start,
          end: state.pos,
          label: 'Verbose comment',
          description: 'Ignored comment in extended (/x) mode until end of line.',
          matchable: false,
        });
        continue;
      }
    }

    if (ch === '|') {
      const start = state.pos;
      state.pos += 1;
      tokens.push({
        id: `tok_${state.nextTokenId++}`,
        kind: 'alternation',
        raw: '|',
        coreRaw: '|',
        start,
        end: state.pos,
        label: 'Alternation (OR)',
        description: 'Matches either the expression on the left or the expression on the right.',
        matchable: false,
      });
      continue;
    }

    if (ch === '^' || ch === '$') {
      const start = state.pos;
      state.pos += 1;
      tokens.push({
        id: `tok_${state.nextTokenId++}`,
        kind: 'anchor',
        raw: ch,
        coreRaw: ch,
        start,
        end: state.pos,
        label: ANCHOR_DESCRIPTIONS[ch].label,
        description: ANCHOR_DESCRIPTIONS[ch].desc,
        matchable: false,
      });
      continue;
    }

    if (ch === '.') {
      const start = state.pos;
      state.pos += 1;
      const quantifier = tryReadQuantifier(state);
      const end = state.pos;
      tokens.push({
        id: `tok_${state.nextTokenId++}`,
        kind: 'dot',
        raw: pattern.slice(start, end),
        coreRaw: '.',
        start,
        end,
        quantifier,
        label: 'Any character',
        description: 'Matches any single character except line terminators (or any character including newlines with the s flag).',
        quantifierDescription: quantifier ? describeQuantifier(quantifier) : undefined,
        matchable: true,
      });
      continue;
    }

    if (ch === '[') {
      tokens.push(readCharClass(state));
      continue;
    }

    if (ch === '\\') {
      tokens.push(readEscape(state));
      continue;
    }

    if (ch === '(') {
      tokens.push(readGroup(state));
      continue;
    }

    // Plain literal characters: group consecutive unquantified literals into one clean literal token,
    // while keeping a quantified final character as its own token!
    const start = state.pos;
    if (isQuantifierStart(pattern, state.pos + 1)) {
      state.pos += 1;
      const coreRaw = ch;
      const quantifier = tryReadQuantifier(state);
      const end = state.pos;
      tokens.push({
        id: `tok_${state.nextTokenId++}`,
        kind: 'literal',
        raw: pattern.slice(start, end),
        coreRaw,
        start,
        end,
        quantifier,
        label: `Literal "${coreRaw}"`,
        description: `Matches the character "${coreRaw}" literally.`,
        quantifierDescription: quantifier ? describeQuantifier(quantifier) : undefined,
        matchable: true,
      });
      continue;
    }

    let litEnd = state.pos + 1;
    while (litEnd < pattern.length) {
      const c = pattern[litEnd];
      if (isSpecialAtomChar(c)) break;
      if (state.extendedMode && (/\s/.test(c) || c === '#')) break;
      // Stop before a character that has a quantifier attached to it
      if (isQuantifierStart(pattern, litEnd + 1)) break;
      litEnd += 1;
    }

    state.pos = litEnd;
    const coreRaw = pattern.slice(start, litEnd);
    tokens.push({
      id: `tok_${state.nextTokenId++}`,
      kind: 'literal',
      raw: coreRaw,
      coreRaw,
      start,
      end: litEnd,
      label: coreRaw.length === 1 ? `Literal "${coreRaw}"` : `Literal "${coreRaw}"`,
      description:
        coreRaw.length === 1
          ? `Matches the character "${coreRaw}" literally.`
          : `Matches the exact characters "${coreRaw}" literally (case-sensitive unless the i flag is set).`,
      matchable: true,
    });
  }

  return tokens;
}

export function parseRegexPattern(pattern: string, extendedMode = false): RegexToken[] {
  if (!pattern) return [];
  const state: ParseState = {
    pattern,
    pos: 0,
    nextTokenId: 1,
    nextGroupIndex: 1,
    extendedMode,
  };
  return parseSequence(state, false);
}

export function flattenTokens(tokens: readonly RegexToken[]): RegexToken[] {
  const out: RegexToken[] = [];
  const walk = (list: readonly RegexToken[]) => {
    for (const tok of list) {
      out.push(tok);
      if (tok.children && tok.children.length > 0) {
        walk(tok.children);
      }
    }
  };
  walk(tokens);
  return out;
}
