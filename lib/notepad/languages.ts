import type { LanguageOption } from './types';

export const SUPPORTED_LANGUAGES: readonly LanguageOption[] = [
  { id: 'plaintext', label: 'Plain Text', extensions: ['txt', 'log', 'env', 's1p', 's2p', 'spice', 'cir'] },
  { id: 'bat', label: 'Batch', extensions: ['bat', 'cmd'] },
  { id: 'c', label: 'C', extensions: ['c', 'h'] },
  { id: 'cpp', label: 'C++', extensions: ['cpp', 'hpp', 'cc', 'cxx', 'hh', 'ino'] },
  { id: 'csharp', label: 'C#', extensions: ['cs'] },
  { id: 'css', label: 'CSS', extensions: ['css'] },
  { id: 'csv', label: 'CSV / TSV', extensions: ['csv', 'tsv'] },
  { id: 'dockerfile', label: 'Dockerfile', extensions: ['dockerfile'] },
  { id: 'go', label: 'Go', extensions: ['go'] },
  { id: 'graphql', label: 'GraphQL', extensions: ['graphql', 'gql'] },
  { id: 'html', label: 'HTML', extensions: ['html', 'htm', 'svg'] },
  { id: 'ini', label: 'INI / Config', extensions: ['ini', 'cfg', 'conf', 'properties'] },
  { id: 'java', label: 'Java', extensions: ['java'] },
  { id: 'javascript', label: 'JavaScript', extensions: ['js', 'mjs', 'cjs', 'jsx'] },
  { id: 'json', label: 'JSON', extensions: ['json', 'jsonc'] },
  { id: 'kotlin', label: 'Kotlin', extensions: ['kt', 'kts'] },
  { id: 'latex', label: 'LaTeX / TeX', extensions: ['tex', 'sty', 'cls', 'bib', 'dtx'] },
  { id: 'less', label: 'LESS', extensions: ['less'] },
  { id: 'lua', label: 'Lua', extensions: ['lua'] },
  { id: 'markdown', label: 'Markdown', extensions: ['md', 'markdown'] },
  { id: 'perl', label: 'Perl', extensions: ['pl', 'pm'] },
  { id: 'php', label: 'PHP', extensions: ['php'] },
  { id: 'powershell', label: 'PowerShell', extensions: ['ps1', 'psm1', 'psd1'] },
  { id: 'python', label: 'Python', extensions: ['py', 'pyw'] },
  { id: 'r', label: 'R', extensions: ['r'] },
  { id: 'ruby', label: 'Ruby', extensions: ['rb'] },
  { id: 'rust', label: 'Rust', extensions: ['rs'] },
  { id: 'scss', label: 'SCSS', extensions: ['scss'] },
  { id: 'shell', label: 'Shell / Bash', extensions: ['sh', 'bash', 'zsh'] },
  { id: 'sql', label: 'SQL', extensions: ['sql'] },
  { id: 'swift', label: 'Swift', extensions: ['swift'] },
  { id: 'ini-toml', label: 'TOML', extensions: ['toml'] },
  { id: 'typescript', label: 'TypeScript', extensions: ['ts', 'mts', 'cts', 'tsx'] },
  { id: 'xml', label: 'XML', extensions: ['xml', 'xaml', 'plist', 'kicad_pcb', 'csproj'] },
  { id: 'yaml', label: 'YAML', extensions: ['yml', 'yaml'] },
] as const;

export interface LanguageLetterGroup {
  letter: string;
  languages: LanguageOption[];
}

/**
 * Resolves our UI language ID to a Monaco registered language ID.
 */
export function toMonacoLanguageId(langId: string): string {
  if (langId === 'ini-toml') return 'ini';
  return langId;
}

/**
 * Groups all syntax languages (excluding Plain Text, which sits pinned at the top)
 * alphabetically by their first uppercase letter.
 */
export function groupLanguagesByLetter(
  languages: readonly LanguageOption[] = SUPPORTED_LANGUAGES,
): { plainText: LanguageOption; groups: LanguageLetterGroup[] } {
  const plainText = languages.find((l) => l.id === 'plaintext') ?? {
    id: 'plaintext',
    label: 'Plain Text',
    extensions: ['txt'],
  };

  const map = new Map<string, LanguageOption[]>();
  const rest = languages
    .filter((l) => l.id !== 'plaintext')
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));

  for (const lang of rest) {
    const first = lang.label.charAt(0).toUpperCase();
    const bucket = map.get(first) ?? [];
    bucket.push(lang);
    map.set(first, bucket);
  }

  const groups: LanguageLetterGroup[] = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([letter, items]) => ({ letter, languages: items }));

  return { plainText, groups };
}

export function getLanguageLabel(langId: string): string {
  return SUPPORTED_LANGUAGES.find((l) => l.id === langId)?.label ?? 'Plain Text';
}
