// Names for code. Each line of the text becomes one name, made of the words in it. Words are split at spaces and
// punctuation and where the case changes: XMLHttpRequest → XML Http Request, base64Encode → base64 Encode.

import { capitalize } from './prose';

export type CodeCase = 'camel' | 'pascal' | 'snake' | 'constant' | 'kebab' | 'train' | 'dot';

// Letters that are not a plain letter with an accent, so removing the accent does not help.
const LATIN: Record<string, string> = { æ: 'ae', ø: 'o', œ: 'oe', ß: 'ss', đ: 'd', ð: 'd', þ: 'th', ł: 'l', ı: 'i' };

const JOIN: Record<CodeCase, (words: string[]) => string> = {
  camel: (words) => words.map((w, i) => (i ? capitalize(w) : w.toLowerCase())).join(''),
  pascal: (words) => words.map(capitalize).join(''),
  snake: (words) => words.join('_').toLowerCase(),
  constant: (words) => words.join('_').toUpperCase(),
  kebab: (words) => words.join('-').toLowerCase(),
  train: (words) => words.map(capitalize).join('-'),
  dot: (words) => words.join('.').toLowerCase(),
};

function splitWords(line: string): string[] {
  return line
    .replace(/['’]/g, '')
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
}

// Lower case ASCII: é → e, æ → ae, ø → o. Letters from other scripts are removed.
function toAscii(word: string): string {
  return word.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, (c) => LATIN[c] ?? '');
}

export function codeCase(text: string, kind: CodeCase, ascii: boolean): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => {
      const words = splitWords(line);
      return JOIN[kind](ascii ? words.map(toAscii).filter(Boolean) : words);
    })
    .join('\n');
}
