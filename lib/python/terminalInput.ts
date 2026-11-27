// Pure helpers for xterm.js keyboard & paste input in Console stdin and REPL modes.
// Strips ANSI CSI / SS3 / OSC escape sequences so navigation keys (ArrowLeft/Right, Delete,
// Home, End, bracketed paste wrappers) never leak raw control fragments into input buffers.

export type TerminalToken =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'newline' }
  | { readonly kind: 'backspace' }
  | { readonly kind: 'eof' }
  | { readonly kind: 'up' }
  | { readonly kind: 'down' }
  | { readonly kind: 'tab' };

export interface SplitLinesResult {
  readonly lines: readonly string[];
  readonly trailing: string;
}

/**
 * Tokenizes a raw xterm `onData` chunk into semantic input tokens while cleanly discarding
 * unsupported ANSI escape sequences (CSI, SS3, OSC, 2-byte Fe, lone ESC) and non-printable
 * control characters.
 */
export function tokenizeTerminalData(data: string): TerminalToken[] {
  const tokens: TerminalToken[] = [];
  const len = data.length;
  let i = 0;

  while (i < len) {
    const ch = data[i];

    if (ch === '\x1b') {
      if (data.startsWith('\x1b[A', i)) {
        tokens.push({ kind: 'up' });
        i += 3;
        continue;
      }
      if (data.startsWith('\x1b[B', i)) {
        tokens.push({ kind: 'down' });
        i += 3;
        continue;
      }
      const next = i + 1 < len ? data[i + 1] : '';
      if (next === '[') {
        // CSI: ESC [ <param bytes 0x30-0x3F>* <intermediate bytes 0x20-0x2F>* <final byte 0x40-0x7E>
        let j = i + 2;
        while (j < len) {
          const c = data.charCodeAt(j);
          if (c >= 0x30 && c <= 0x3f) j += 1;
          else break;
        }
        while (j < len) {
          const c = data.charCodeAt(j);
          if (c >= 0x20 && c <= 0x2f) j += 1;
          else break;
        }
        if (j < len) {
          const c = data.charCodeAt(j);
          if (c >= 0x40 && c <= 0x7e) j += 1;
        }
        i = j;
        continue;
      }
      if (next === 'O') {
        // SS3: ESC O <single final char>
        i += i + 2 < len ? 3 : 2;
        continue;
      }
      if (next === ']') {
        // OSC: ESC ] ... (BEL | ST)
        let j = i + 2;
        while (j < len) {
          if (data[j] === '\x07') {
            j += 1;
            break;
          }
          if (data[j] === '\x1b' && j + 1 < len && data[j + 1] === '\\') {
            j += 2;
            break;
          }
          j += 1;
        }
        i = j;
        continue;
      }
      if (next) {
        const nextCode = next.charCodeAt(0);
        if (nextCode >= 0x40 && nextCode <= 0x5f) {
          i += 2;
          continue;
        }
      }
      i += 1;
      continue;
    }

    if (ch === '\r') {
      tokens.push({ kind: 'newline' });
      i += i + 1 < len && data[i + 1] === '\n' ? 2 : 1;
      continue;
    }

    if (ch === '\n') {
      tokens.push({ kind: 'newline' });
      i += 1;
      continue;
    }

    if (ch === '\x7f' || ch === '\b') {
      tokens.push({ kind: 'backspace' });
      i += 1;
      continue;
    }

    if (ch === '\x04') {
      tokens.push({ kind: 'eof' });
      i += 1;
      continue;
    }

    if (ch === '\t') {
      tokens.push({ kind: 'tab' });
      i += 1;
      continue;
    }

    const code = data.charCodeAt(i);
    if (code >= 0x20 && code !== 0x7f) {
      let j = i + 1;
      while (j < len) {
        const c = data.charCodeAt(j);
        if (c >= 0x20 && c !== 0x7f) j += 1;
        else break;
      }
      tokens.push({ kind: 'text', text: data.slice(i, j) });
      i = j;
      continue;
    }

    // Ignore other C0 control characters
    i += 1;
  }

  return tokens;
}

/**
 * Applies a token stream (which contains one or more newlines, e.g. Enter or multi-line paste)
 * onto the current line buffer, returning completed lines to submit and any trailing partial line.
 */
export function splitTokensIntoLines(
  initialLine: string,
  tokens: readonly TerminalToken[],
  options: { readonly tabAsSpaces?: boolean } = {},
): SplitLinesResult {
  const lines: string[] = [];
  let cur = initialLine;
  const tabStr = options.tabAsSpaces ? '    ' : '\t';

  for (const tok of tokens) {
    if (tok.kind === 'text') {
      cur += tok.text;
    } else if (tok.kind === 'tab') {
      cur += tabStr;
    } else if (tok.kind === 'backspace') {
      if (cur.length > 0) cur = cur.slice(0, -1);
    } else if (tok.kind === 'newline') {
      lines.push(cur);
      cur = '';
    }
  }

  return { lines, trailing: cur };
}
