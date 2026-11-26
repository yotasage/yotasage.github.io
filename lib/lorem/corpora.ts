import type { LoremStyle } from './types';

export const CLASSIC_OPENING_WORDS: readonly string[] = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
  'magna', 'aliqua',
];

export const CLASSIC_WORDS: readonly string[] = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
  'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
  'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo',
  'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate',
  'velit', 'esse', 'cillum', 'eu', 'fugiat', 'nulla', 'pariatur', 'excepteur',
  'sint', 'occaecat', 'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui',
  'officia', 'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum', 'curabitur',
  'pretium', 'tincidunt', 'lacus', 'nulla', 'gravida', 'orci', 'a', 'odio',
  'nullam', 'varius', 'turpis', 'commodo', 'pharetra', 'est', 'eros', 'bibendum',
  'elit', 'nec', 'luctus', 'magna', 'felis', 'sollicitudin', 'mauris', 'integer',
  'in', 'mauris', 'eu', 'nibh', 'euismod', 'gravida', 'duis', 'ac', 'tellus',
  'et', 'risus', 'vulputate', 'vehicula', 'donec', 'lobortis', 'risus', 'a',
  'elit', 'etiam', 'tempor', 'ut', 'ullamcorper', 'ligula', 'eu', 'tempor',
  'congue', 'eros', 'est', 'euismod', 'turpis', 'id', 'tincidunt', 'sapien',
  'risus', 'a', 'quam', 'maecenas', 'fermentum', 'consequat', 'mi', 'donec',
  'fermentum', 'pellentesque', 'malesuada', 'nulla', 'a', 'mi', 'duis', 'sapien',
  'sem', 'aliquet', 'nec', 'commodo', 'eget', 'consequat', 'aliquam', 'neque',
  'faucibus', 'nisl', 'tincidunt', 'eget', 'nullam', 'non', 'nisi', 'est',
  'vestibulum', 'ante', 'ipsum', 'primis', 'in', 'faucibus', 'orci', 'luctus',
  'et', 'ultrices', 'posuere', 'cubilia', 'curae', 'phasellus', 'viverra',
  'nulla', 'ut', 'metus', 'varius', 'laoreet', 'quisque', 'rutrum', 'aenean',
  'imperdiet', 'etiam', 'ultricies', 'nisi', 'vel', 'augue', 'curabitur',
  'ullamcorper', 'ultricies', 'nisi', 'nam', 'eget', 'dui', 'etiam', 'rhoncus',
  'maecenas', 'tempus', 'tellus', 'eget', 'condimentum', 'rhoncus', 'sem',
  'quam', 'semper', 'libero', 'sit', 'amet', 'adipiscing', 'sem', 'neque', 'sed',
  'ipsum', 'nam', 'quam', 'nunc', 'blandit', 'vel', 'luctus', 'pulvinar',
  'hendrerit', 'id', 'lorem', 'maecenas', 'nec', 'odio', 'et', 'ante',
  'tincidunt', 'tempus', 'donec', 'vitae', 'sapien', 'ut', 'libero', 'venenatis',
  'faucibus', 'nullam', 'quis', 'ante', 'etiam', 'sit', 'amet', 'orci', 'eget',
  'eros', 'faucibus', 'tincidunt', 'duis', 'leo', 'sed', 'fringilla', 'mauris',
  'sit', 'amet', 'nibh', 'donec', 'sodales', 'sagittis', 'magna', 'sed',
  'consequat', 'leo', 'eget', 'bibendum', 'sodales', 'augue', 'velit', 'cursus',
  'nunc', 'vivamus', 'elementum', 'semper', 'nisi', 'aenean', 'vulputate',
  'eleifend', 'tellus', 'aenean', 'leo', 'ligula', 'porttitor', 'eu',
  'consequat', 'vitae', 'eleifend', 'ac', 'enim', 'aliquam', 'lorem', 'ante',
  'dapibus', 'in', 'viverra', 'quis', 'feugiat', 'a', 'tellus', 'phasellus',
  'viverra', 'nulla', 'ut', 'metus', 'varius', 'laoreet', 'morbi', 'mattis',
  'ullamcorper', 'velit', 'phasellus', 'gravida', 'semper', 'nisi', 'nullam',
  'vel', 'sem', 'in', 'enim', 'justo', 'rhoncus', 'ut', 'imperdiet', 'a',
  'venenatis', 'vitae', 'justo', 'nullam', 'dictum', 'felis', 'eu', 'pede',
  'mollis', 'pretium', 'integer', 'tincidunt', 'cras', 'dapibus', 'praesent',
  'porttitor', 'nulla', 'vitae', 'posuere', 'iaculis', 'arcu', 'nisl',
  'dignissim', 'dolor', 'a', 'pretium', 'mi', 'sem', 'ut', 'ipsum',
];

/**
 * Authentic Latin excerpt from Cicero's "De finibus bonorum et malorum" (45 BC),
 * Book 1, sections 10.32–33 — the historical source of Lorem Ipsum.
 */
export const CICERO_PASSAGE: readonly string[] = [
  'Sed', 'ut', 'perspiciatis', 'unde', 'omnis', 'iste', 'natus', 'error', 'sit',
  'voluptatem', 'accusantium', 'doloremque', 'laudantium', 'totam', 'rem',
  'aperiam', 'eaque', 'ipsa', 'quae', 'ab', 'illo', 'inventore', 'veritatis',
  'et', 'quasi', 'architecto', 'beatae', 'vitae', 'dicta', 'sunt', 'explicabo',
  'nemo', 'enim', 'ipsam', 'voluptatem', 'quia', 'voluptas', 'sit', 'aspernatur',
  'aut', 'odit', 'aut', 'fugit', 'sed', 'quia', 'consequuntur', 'magni',
  'dolores', 'eos', 'qui', 'ratione', 'voluptatem', 'sequi', 'nesciunt', 'neque',
  'porro', 'quisquam', 'est', 'qui', 'dolorem', 'ipsum', 'quia', 'dolor', 'sit',
  'amet', 'consectetur', 'adipisci', 'velit', 'sed', 'quia', 'non', 'numquam',
  'eius', 'modi', 'tempora', 'incidunt', 'ut', 'labore', 'et', 'dolore', 'magnam',
  'aliquam', 'quaerat', 'voluptatem', 'ut', 'enim', 'ad', 'minima', 'veniam',
  'quis', 'nostrum', 'exercitationem', 'ullam', 'corporis', 'suscipit',
  'laboriosam', 'nisi', 'ut', 'aliquid', 'ex', 'ea', 'commodi', 'consequatur',
  'quis', 'autem', 'vel', 'eum', 'iure', 'reprehenderit', 'qui', 'in', 'ea',
  'voluptate', 'velit', 'esse', 'quam', 'nihil', 'molestiae', 'consequatur',
  'vel', 'illum', 'qui', 'dolorem', 'eum', 'fugiat', 'quo', 'voluptas', 'nulla',
  'pariatur', 'at', 'vero', 'eos', 'et', 'accusamus', 'et', 'iusto', 'odio',
  'dignissimos', 'ducimus', 'qui', 'blanditiis', 'praesentium', 'voluptatum',
  'deleniti', 'atque', 'corrupti', 'quos', 'dolores', 'et', 'quas', 'molestias',
  'excepturi', 'sint', 'occaecati', 'cupiditate', 'non', 'provident', 'similique',
  'sunt', 'in', 'culpa', 'qui', 'officia', 'deserunt', 'mollitia', 'animi', 'id',
  'est', 'laborum', 'et', 'dolorum', 'fuga', 'et', 'harum', 'quidem', 'rerum',
  'facilis', 'est', 'et', 'expedita', 'distinctio', 'nam', 'libero', 'tempore',
  'cum', 'soluta', 'nobis', 'est', 'eligendi', 'optio', 'cumque', 'nihil',
  'impedit', 'quo', 'minus', 'id', 'quod', 'maxime', 'placeat', 'facere',
  'possimus', 'omnis', 'voluptas', 'assumenda', 'est', 'omnis', 'dolor',
  'repellendus', 'temporibus', 'autem', 'quibusdam', 'et', 'aut', 'officiis',
  'debitis', 'aut', 'rerum', 'necessitatibus', 'saepe', 'eveniet', 'ut', 'et',
  'voluptates', 'repudiandae', 'sint', 'et', 'molestiae', 'non', 'recusandae',
  'itaque', 'earum', 'rerum', 'hic', 'tenetur', 'a', 'sapiente', 'delectus', 'ut',
  'aut', 'reiciendis', 'voluptatibus', 'maiores', 'alias', 'consequatur', 'aut',
  'perferendis', 'doloribus', 'asperiores', 'repellat',
];

/**
 * Neutral English placeholder vocabulary with realistic letter and word-length
 * distribution for testing UI layouts, docs, and specifications.
 */
export const ENGLISH_WORDS: readonly string[] = [
  'the', 'of', 'and', 'to', 'in', 'for', 'with', 'on', 'from', 'that', 'by',
  'system', 'layout', 'design', 'interface', 'component', 'module', 'section',
  'column', 'margin', 'spacing', 'baseline', 'grid', 'alignment', 'contrast',
  'typography', 'heading', 'paragraph', 'caption', 'label', 'button', 'dialog',
  'table', 'summary', 'document', 'report', 'reference', 'archive', 'version',
  'release', 'draft', 'review', 'notes', 'outline', 'structure', 'pattern',
  'balance', 'rhythm', 'measure', 'hierarchy', 'clarity', 'reading', 'surface',
  'border', 'padding', 'container', 'panel', 'toolbar', 'sidebar', 'viewport',
  'responsive', 'breakpoint', 'scale', 'proportion', 'sample', 'preview',
  'content', 'placeholder', 'copy', 'text', 'block', 'line', 'character',
  'width', 'height', 'offset', 'anchor', 'position', 'scroll', 'focus', 'state',
  'active', 'neutral', 'subtle', 'primary', 'secondary', 'compact', 'expanded',
  'clear', 'direct', 'simple', 'steady', 'consistent', 'readable', 'structured',
  'measured', 'calibrated', 'verified', 'local', 'portable', 'modular',
  'flexible', 'accurate', 'predictable', 'reliable', 'clean', 'ordered',
  'aligned', 'arranged', 'grouped', 'paired', 'spaced', 'centered', 'framed',
  'display', 'render', 'format', 'export', 'inspect', 'compare', 'measure',
  'adjust', 'update', 'confirm', 'select', 'browse', 'filter', 'search',
  'switch', 'toggle', 'preserve', 'maintain', 'support', 'present', 'organize',
  'across', 'within', 'between', 'before', 'after', 'through', 'during',
  'around', 'under', 'above', 'along', 'without', 'while', 'when', 'where',
  'each', 'every', 'other', 'first', 'second', 'third', 'next', 'final',
  'common', 'standard', 'typical', 'average', 'natural', 'short', 'medium',
  'longer', 'detail', 'context', 'example', 'figure', 'metric', 'value',
  'range', 'limit', 'target', 'count', 'total', 'index', 'entry', 'record',
  'item', 'list', 'group', 'field', 'input', 'output', 'result', 'option',
];

/**
 * Neutral Norwegian Bokmål placeholder vocabulary including æ, ø, å for
 * verifying Nordic diacritics, hyphenation, and word-wrapping in layouts.
 */
export const NORWEGIAN_WORDS: readonly string[] = [
  'og', 'i', 'av', 'til', 'for', 'med', 'på', 'som', 'fra', 'ved', 'om', 'et',
  'en', 'den', 'det', 'de', 'skal', 'kan', 'blir', 'gir', 'viser', 'bruker',
  'oppsett', 'utforming', 'lesbarhet', 'struktur', 'overskrift', 'avsnitt',
  'spalte', 'marg', 'avstand', 'grunnlinje', 'rutenett', 'kontrast', 'skrift',
  'typografi', 'tabell', 'felt', 'knapp', 'meny', 'panel', 'ramme', 'flate',
  'innhold', 'eksempel', 'utkast', 'rapport', 'dokument', 'notat', 'oversikt',
  'sammendrag', 'referanse', 'versjon', 'visning', 'forhåndsvisning', 'mal',
  'størrelse', 'bredde', 'høyde', 'lengde', 'antall', 'verdi', 'grense', 'mål',
  'måling', 'område', 'punkt', 'linje', 'tegn', 'ord', 'setning', 'liste',
  'gruppe', 'valg', 'innstilling', 'resultat', 'utdata', 'inndata', 'format',
  'enkel', 'tydelig', 'ryddig', 'rolig', 'jevn', 'fast', 'variert', 'naturlig',
  'kort', 'middels', 'lengre', 'første', 'andre', 'tredje', 'neste', 'siste',
  'vanlig', 'lokal', 'rask', 'presis', 'stabil', 'åpen', 'klar', 'ren',
  'tilpasset', 'balansert', 'samlet', 'delt', 'plassert', 'justert', 'ordnet',
  'mellom', 'gjennom', 'under', 'over', 'etter', 'før', 'uten', 'mens', 'når',
  'hver', 'alle', 'flere', 'ulike', 'samme', 'egen', 'ny', 'stor', 'liten',
  'håndtere', 'bevare', 'sammenligne', 'kontrollere', 'oppdatere', 'velge',
  'tilpasse', 'eksportere', 'kopiere', 'søke', 'filtrere', 'bytte', 'beregne',
  'spørsmål', 'løsning', 'øvelse', 'prøve', 'særpreg', 'håndbok', 'årsak',
  'bølge', 'kilde', 'tråd', 'fløyel', 'grønn', 'blå', 'grå', 'høy', 'lav',
  'nær', 'fjern', 'særskilt', 'nøye', 'årlig', 'daglig', 'måned', 'år', 'uke',
  'støtte', 'verktøy', 'side', 'blokk', 'del', 'kapittel', 'steg', 'prosess',
];

export const STYLE_HEADINGS: Record<LoremStyle, readonly string[]> = {
  classic: [
    'De finibus bonorum',
    'Curabitur pretium lacus',
    'Vestibulum ante ipsum',
    'Maecenas fermentum mi',
    'Phasellus viverra metus',
    'Praesent porttitor nulla',
    'Integer euismod gravida',
    'Aenean vulputate tellus',
    'Donec lobortis risus',
    'Quisque rutrum imperdiet',
  ],
  cicero: [
    'De finibus bonorum et malorum',
    'Ratione voluptatem sequi',
    'Corporis suscipit laboriosam',
    'Praesentium voluptatum deleniti',
    'Temporibus autem quibusdam',
    'Voluptatibus maiores alias',
    'Inventore veritatis quasi',
    'Officia deserunt mollitia',
  ],
  english: [
    'Layout structure and rhythm',
    'Typography and reading measure',
    'Component spacing overview',
    'Responsive viewport notes',
    'Visual hierarchy guidelines',
    'Document formatting summary',
    'Surface contrast and alignment',
    'Reference block architecture',
  ],
  norwegian: [
    'Struktur og leserytme',
    'Typografi og linjebredde',
    'Avstand og rutenett',
    'Tilpasning på små skjermer',
    'Kontrast og visuell balanse',
    'Oppsett for lengre avsnitt',
    'Prøvetekst med norske tegn',
    'Oversikt over tekstblokker',
  ],
};

export function getCorpusWords(style: LoremStyle): readonly string[] {
  switch (style) {
    case 'classic':
      return CLASSIC_WORDS;
    case 'cicero':
      return CICERO_PASSAGE;
    case 'english':
      return ENGLISH_WORDS;
    case 'norwegian':
      return NORWEGIAN_WORDS;
  }
}
