import { CodeCase, codeCase } from './code';
import { capitalizedCase, ProseOptions, sentenceCase, titleCase } from './prose';

export type CaseId = 'sentence' | 'lower' | 'upper' | 'capitalized' | 'title' | 'alternating' | 'inverse' | CodeCase;

export interface CaseInfo {
  id: CaseId;
  // The name written in its own case, as on its button.
  label: string;
  description: string;
}

export const TEXT_CASES: CaseInfo[] = [
  { id: 'sentence', label: 'Sentence case', description: 'A capital letter at the start of every sentence, and the rest in lower case.' },
  { id: 'lower', label: 'lower case', description: 'Every letter in lower case.' },
  { id: 'upper', label: 'UPPER CASE', description: 'Every letter in capitals.' },
  { id: 'capitalized', label: 'Capitalized Case', description: 'A capital letter at the start of every word, and the rest in lower case.' },
  {
    id: 'title',
    label: 'Title Case',
    description: 'A capital letter at the start of every word except small words such as a, the, and, of and in. The first and last word, and the first word after a colon, always get one.',
  },
  { id: 'alternating', label: 'aLtErNaTiNg cAsE', description: 'Lower and upper case take turns, starting every word in lower case.' },
  { id: 'inverse', label: 'iNVERSE cASE', description: 'Capitals become lower case, and lower case becomes capitals.' },
];

export const CODE_CASES: CaseInfo[] = [
  { id: 'camel', label: 'camelCase', description: 'Words joined, with a capital on every word but the first. For variables in JavaScript, Java and C#.' },
  { id: 'pascal', label: 'PascalCase', description: 'Words joined, with a capital on every word. For classes and types.' },
  { id: 'snake', label: 'snake_case', description: 'Words in lower case joined by underscores. For Python and databases.' },
  { id: 'constant', label: 'CONSTANT_CASE', description: 'Words in capitals joined by underscores. For constants and environment variables.' },
  { id: 'kebab', label: 'kebab-case', description: 'Words in lower case joined by hyphens. For URLs, file names and CSS.' },
  { id: 'train', label: 'Train-Case', description: 'Words with a capital joined by hyphens. For HTTP headers.' },
  { id: 'dot', label: 'dot.case', description: 'Words in lower case joined by dots. For settings and translation keys.' },
];

// The cases that use ProseOptions.
export const PROSE_CASES: ReadonlySet<CaseId> = new Set<CaseId>(['sentence', 'title', 'capitalized']);

export interface CaseOptions extends ProseOptions {
  // Names for code: only ASCII letters and digits.
  ascii: boolean;
}

function alternatingCase(text: string): string {
  return text.replace(/\S+/g, (word) => {
    let n = 0;
    return word.replace(/\p{L}/gu, (c) => (n++ % 2 ? c.toUpperCase() : c.toLowerCase()));
  });
}

function inverseCase(text: string): string {
  return text.replace(/\p{L}/gu, (c) => {
    const upper = c.toUpperCase();
    return upper === c ? c.toLowerCase() : upper;
  });
}

export function convertCase(text: string, id: CaseId, options: CaseOptions): string {
  switch (id) {
    case 'sentence': return sentenceCase(text, options);
    case 'lower': return text.toLowerCase();
    case 'upper': return text.toUpperCase();
    case 'capitalized': return capitalizedCase(text, options);
    case 'title': return titleCase(text, options);
    case 'alternating': return alternatingCase(text);
    case 'inverse': return inverseCase(text);
    default: return codeCase(text, id, options.ascii);
  }
}
