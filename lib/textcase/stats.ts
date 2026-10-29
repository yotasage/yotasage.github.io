export interface TextStats {
  characters: number;
  words: number;
  lines: number;
}

// Characters as they are seen: an emoji made of several code points, or a letter and an accent stored apart, count once.
function countCharacters(text: string): number {
  if (typeof Intl.Segmenter !== 'function') return Array.from(text).length;
  let n = 0;
  for (const _ of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) n++;
  return n;
}

// Words are counted as in a word processor: everything between spaces that has a letter or a digit, so e-mail is one.
export function textStats(text: string): TextStats {
  let words = 0;
  for (const m of text.matchAll(/\S+/g)) if (/[\p{L}\p{N}]/u.test(m[0])) words++;
  return {
    characters: countCharacters(text),
    words,
    lines: text ? text.split(/\r\n|\r|\n/).length : 0,
  };
}
