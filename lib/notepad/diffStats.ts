import { EolMode, SUPPORTED_LANGUAGES } from './types';

export interface LineDiffStats {
  leftLines: number;
  rightLines: number;
  added: number;
  removed: number;
  unchanged: number;
  identical: boolean;
}

export function detectEol(text: string): EolMode {
  return text.includes('\r\n') ? 'CRLF' : 'LF';
}

export function applyEol(text: string, eol: EolMode): string {
  const lf = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return eol === 'CRLF' ? lf.replace(/\n/g, '\r\n') : lf;
}

export function guessLanguageFromFilename(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) return 'plaintext';
  const ext = filename.slice(dot + 1).toLowerCase();
  for (const lang of SUPPORTED_LANGUAGES) {
    if (lang.extensions.includes(ext)) return lang.id;
  }
  return 'plaintext';
}

/**
 * Computes fast line-level diff statistics (added / removed / unchanged lines)
 * using Myers/LCS-lite line comparison with fallback for very large files.
 */
export function computeLineDiffStats(
  leftText: string,
  rightText: string,
  ignoreWhitespace = false,
): LineDiffStats {
  const norm = (s: string) => {
    const lf = s.replace(/\r\n/g, '\n');
    const lines = lf.length === 0 ? [] : lf.split('\n');
    return ignoreWhitespace ? lines.map((l) => l.trim()) : lines;
  };

  const a = norm(leftText);
  const b = norm(rightText);

  if (a.length === b.length && a.every((line, i) => line === b[i])) {
    return {
      leftLines: a.length,
      rightLines: b.length,
      added: 0,
      removed: 0,
      unchanged: a.length,
      identical: true,
    };
  }

  // Strip common prefix and suffix for speed
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const fixedMatches = start + (a.length - 1 - endA);
  const midA = a.slice(start, endA + 1);
  const midB = b.slice(start, endB + 1);

  let midMatches = 0;
  if (midA.length > 0 && midB.length > 0) {
    if (midA.length * midB.length <= 2_500_000) {
      // Exact LCS length with O(min(m, n)) memory
      const [short, long] = midA.length <= midB.length ? [midA, midB] : [midB, midA];
      let prev = new Uint32Array(short.length + 1);
      let curr = new Uint32Array(short.length + 1);
      for (let i = 0; i < long.length; i++) {
        const line = long[i];
        for (let j = 0; j < short.length; j++) {
          if (line === short[j]) {
            curr[j + 1] = prev[j] + 1;
          } else {
            const up = prev[j + 1];
            const left = curr[j];
            curr[j + 1] = up > left ? up : left;
          }
        }
        const tmp = prev;
        prev = curr;
        curr = tmp;
        curr.fill(0);
      }
      midMatches = prev[short.length];
    } else {
      // Multiset intersection fallback for huge (>1500 changed lines) files
      const counts = new Map<string, number>();
      for (const line of midA) counts.set(line, (counts.get(line) ?? 0) + 1);
      for (const line of midB) {
        const c = counts.get(line) ?? 0;
        if (c > 0) {
          midMatches += 1;
          counts.set(line, c - 1);
        }
      }
    }
  }

  const unchanged = fixedMatches + midMatches;
  const removed = Math.max(0, a.length - unchanged);
  const added = Math.max(0, b.length - unchanged);

  return {
    leftLines: a.length,
    rightLines: b.length,
    added,
    removed,
    unchanged,
    identical: added === 0 && removed === 0,
  };
}
