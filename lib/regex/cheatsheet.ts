export interface CheatSheetItem {
  readonly id: string;
  readonly token: string;
  readonly copyToken?: string;
  readonly descKey: string;
  readonly note?: string;
}

export interface CheatSheetSection {
  readonly id:
    | 'classes'
    | 'anchors'
    | 'quantifiers'
    | 'groups'
    | 'lookarounds'
    | 'flags'
    | 'escapes'
    | 'templates';
  readonly titleKey: string;
  readonly items: readonly CheatSheetItem[];
}

export const CHEAT_SHEET_SECTIONS: readonly CheatSheetSection[] = [
  {
    id: 'classes',
    titleKey: 'regex.cs.sec.classes',
    items: [
      { id: 'dot', token: '.', descKey: 'regex.cs.classes.dot' },
      { id: 'digit', token: '\\d', descKey: 'regex.cs.classes.digit', note: '[0-9]' },
      { id: 'nondigit', token: '\\D', descKey: 'regex.cs.classes.nondigit', note: '[^0-9]' },
      { id: 'word', token: '\\w', descKey: 'regex.cs.classes.word', note: '[A-Za-z0-9_]' },
      { id: 'nonword', token: '\\W', descKey: 'regex.cs.classes.nonword', note: '[^A-Za-z0-9_]' },
      { id: 'space', token: '\\s', descKey: 'regex.cs.classes.space' },
      { id: 'nonspace', token: '\\S', descKey: 'regex.cs.classes.nonspace' },
      { id: 'set', token: '[abc]', descKey: 'regex.cs.classes.set' },
      { id: 'negset', token: '[^abc]', descKey: 'regex.cs.classes.negset' },
      { id: 'range', token: '[a-z0-9]', descKey: 'regex.cs.classes.range' },
      { id: 'unicodeProp', token: '\\p{L}', descKey: 'regex.cs.classes.unicode', note: '/u' },
    ],
  },
  {
    id: 'anchors',
    titleKey: 'regex.cs.sec.anchors',
    items: [
      { id: 'caret', token: '^', descKey: 'regex.cs.anchors.caret' },
      { id: 'dollar', token: '$', descKey: 'regex.cs.anchors.dollar' },
      { id: 'boundary', token: '\\b', descKey: 'regex.cs.anchors.boundary' },
      { id: 'nonboundary', token: '\\B', descKey: 'regex.cs.anchors.nonboundary' },
      { id: 'strStart', token: '\\A', descKey: 'regex.cs.anchors.strStart', note: 'PCRE/Py/Go' },
      { id: 'strEnd', token: '\\Z', descKey: 'regex.cs.anchors.strEnd', note: 'PCRE/Py/Go' },
    ],
  },
  {
    id: 'quantifiers',
    titleKey: 'regex.cs.sec.quantifiers',
    items: [
      { id: 'star', token: 'a*', descKey: 'regex.cs.quant.star' },
      { id: 'plus', token: 'a+', descKey: 'regex.cs.quant.plus' },
      { id: 'opt', token: 'a?', descKey: 'regex.cs.quant.opt' },
      { id: 'exact', token: 'a{3}', descKey: 'regex.cs.quant.exact' },
      { id: 'min', token: 'a{3,}', descKey: 'regex.cs.quant.min' },
      { id: 'range', token: 'a{2,5}', descKey: 'regex.cs.quant.range' },
      { id: 'lazy', token: '*? +? ??', copyToken: '+?', descKey: 'regex.cs.quant.lazy' },
      { id: 'possessive', token: '*+ ++', copyToken: '++', descKey: 'regex.cs.quant.possessive', note: 'PCRE/Java' },
    ],
  },
  {
    id: 'groups',
    titleKey: 'regex.cs.sec.groups',
    items: [
      { id: 'capture', token: '(abc)', descKey: 'regex.cs.groups.capture' },
      { id: 'noncap', token: '(?:abc)', descKey: 'regex.cs.groups.noncap' },
      { id: 'named', token: '(?<name>abc)', descKey: 'regex.cs.groups.named' },
      { id: 'pyNamed', token: '(?P<name>abc)', descKey: 'regex.cs.groups.pyNamed', note: 'Py/Go/PCRE' },
      { id: 'alt', token: 'a|b', descKey: 'regex.cs.groups.alt' },
      { id: 'backref', token: '\\1', descKey: 'regex.cs.groups.backref' },
      { id: 'namedBackref', token: '\\k<name>', descKey: 'regex.cs.groups.namedBackref' },
    ],
  },
  {
    id: 'lookarounds',
    titleKey: 'regex.cs.sec.lookarounds',
    items: [
      { id: 'posLa', token: '(?=abc)', descKey: 'regex.cs.look.posLa' },
      { id: 'negLa', token: '(?!abc)', descKey: 'regex.cs.look.negLa' },
      { id: 'posLb', token: '(?<=abc)', descKey: 'regex.cs.look.posLb' },
      { id: 'negLb', token: '(?<!abc)', descKey: 'regex.cs.look.negLb' },
    ],
  },
  {
    id: 'flags',
    titleKey: 'regex.cs.sec.flags',
    items: [
      { id: 'flagG', token: 'g', descKey: 'regex.cs.flags.g' },
      { id: 'flagI', token: 'i', descKey: 'regex.cs.flags.i' },
      { id: 'flagM', token: 'm', descKey: 'regex.cs.flags.m' },
      { id: 'flagS', token: 's', descKey: 'regex.cs.flags.s' },
      { id: 'flagU', token: 'u', descKey: 'regex.cs.flags.u' },
      { id: 'flagY', token: 'y', descKey: 'regex.cs.flags.y', note: 'JS' },
      { id: 'flagX', token: 'x', descKey: 'regex.cs.flags.x', note: 'PCRE/Py' },
      { id: 'inlineFlag', token: '(?i)', descKey: 'regex.cs.flags.inline', note: 'PCRE/Py/Go' },
    ],
  },
  {
    id: 'escapes',
    titleKey: 'regex.cs.sec.escapes',
    items: [
      { id: 'meta', token: '\\. \\* \\+ \\?', copyToken: '\\.', descKey: 'regex.cs.esc.meta' },
      { id: 'nl', token: '\\n', descKey: 'regex.cs.esc.nl' },
      { id: 'cr', token: '\\r', descKey: 'regex.cs.esc.cr' },
      { id: 'tab', token: '\\t', descKey: 'regex.cs.esc.tab' },
      { id: 'hex', token: '\\x41', descKey: 'regex.cs.esc.hex' },
      { id: 'u4', token: '\\u00E9', descKey: 'regex.cs.esc.u4' },
      { id: 'uCode', token: '\\u{1F600}', descKey: 'regex.cs.esc.uCode', note: '/u' },
    ],
  },
  {
    id: 'templates',
    titleKey: 'regex.cs.sec.templates',
    items: [
      { id: 'tplFull', token: '$0 / $&', copyToken: '$0', descKey: 'regex.cs.tpl.full' },
      { id: 'tplNum', token: '$1 .. $9', copyToken: '$1', descKey: 'regex.cs.tpl.num' },
      { id: 'tplNamed', token: '$<name>', descKey: 'regex.cs.tpl.named' },
      { id: 'tplPyNamed', token: '\\g<name>', descKey: 'regex.cs.tpl.pyNamed' },
      { id: 'tplIdx', token: '$i', descKey: 'regex.cs.tpl.index' },
      { id: 'tplNl', token: '\\n / \\t', copyToken: '\\n', descKey: 'regex.cs.tpl.ws' },
      { id: 'tplDollar', token: '$$', descKey: 'regex.cs.tpl.dollar' },
    ],
  },
];
