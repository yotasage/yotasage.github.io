// Framework-free, browser-safe citation metadata lookup and multi-format serializer.
// Consumes build-time metadata generated into lib/generated/page-meta.json.
import rawMeta from './generated/page-meta.json';

export type PageKind = 'project' | 'tool' | 'page';

export interface PageCitationMeta {
  route: string;
  url: string;
  title: string;
  description?: string;
  kind: PageKind;
  citeKey: string;
  sourcePath: string;
  commit: string;
  commitShort: string;
  lastChanged: string;
  lastChangedIso: string;
  contentHash: string;
  contentHashFull: string;
  fileCount: number;
}

export interface ProjectCitationMeta {
  name: string;
  title: string;
  author: string;
  origin: string;
  repository: string;
  license: string;
  commit: string;
  commitShort: string;
  lastChanged: string;
  lastChangedIso: string;
  contentHash: string;
  contentHashFull: string;
  routeCount: number;
}

export interface PageMetaManifest {
  project: ProjectCitationMeta;
  routes: Record<string, PageCitationMeta>;
}

export type CitationScope = 'tool' | 'project';

export type CitationLocale = 'en' | 'nb';

export type CitationFormatId = 'biblatex' | 'bibtex' | 'ris' | 'word' | 'csl' | 'cff' | 'text';

export type PlainTextStyle = 'ieee' | 'apa' | 'harvard' | 'chicago' | 'mla';

export interface CitationOptions {
  scope: CitationScope;
  accessedDate?: string;
  includeAccessedDate: boolean;
  includeHash: boolean;
  currentUrl?: string;
  includePageState: boolean;
  locale?: CitationLocale;
}

export interface ResolvedCitationTarget {
  citeKey: string;
  title: string;
  subtitle: string;
  siteTitle: string;
  author: string;
  url: string;
  repository: string;
  license: string;
  lastChanged: string;
  year: string;
  month: string;
  day: string;
  commit: string;
  commitShort: string;
  contentHash: string;
  contentHashFull: string;
  sourcePath: string;
  sourceBlobUrl: string;
  commitUrl: string;
  isProject: boolean;
}

export interface CitationDownloadMeta {
  filename: string;
  mimeType: string;
}

const manifest = rawMeta as PageMetaManifest;

const BIBTEX_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;
const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
const IEEE_MONTHS = [
  'Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.',
  'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.',
] as const;
const MLA_MONTHS = [
  'Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June',
  'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.',
] as const;
const NB_FULL_MONTHS = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
] as const;
const NB_SHORT_MONTHS = [
  'jan.', 'feb.', 'mar.', 'apr.', 'mai', 'jun.',
  'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'des.',
] as const;

interface ParsedDate {
  iso: string;
  year: string;
  month: string;
  day: string;
  yearNum: number;
  monthNum: number;
  dayNum: number;
}

function parseIsoDate(value?: string): ParsedDate | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const yearNum = Number(match[1]);
  const monthNum = Number(match[2]);
  const dayNum = Number(match[3]);
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;
  return {
    iso: `${match[1]}-${match[2]}-${match[3]}`,
    year: match[1],
    month: match[2],
    day: match[3],
    yearNum,
    monthNum,
    dayNum,
  };
}

function normalizePathname(pathname: string): string {
  const withoutHash = pathname.split('#', 1)[0] ?? '';
  const withoutQuery = withoutHash.split('?', 1)[0] ?? '';
  const collapsed = withoutQuery.replace(/\/{2,}/g, '/');
  const withLeading = collapsed.startsWith('/') ? collapsed : `/${collapsed}`;
  if (withLeading.length > 1 && withLeading.endsWith('/')) {
    return withLeading.slice(0, -1);
  }
  return withLeading || '/';
}

function humanizePath(route: string): string {
  const cleaned = route.replace(/^\/+/, '').replace(/\/main$/, '');
  if (!cleaned) return manifest.project.title;
  const words = cleaned.split(/[/_-]+/).filter(Boolean);
  if (words.length === 0) return manifest.project.title;
  const joined = words.join(' ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

function synthesizeKey(route: string): string {
  const cleaned = route
    .replace(/^\/+/, '')
    .replace(/\/main$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned ? `yotasage_${cleaned}` : 'yotasage_site';
}

export function getProjectMeta(): ProjectCitationMeta {
  return manifest.project;
}

export function getPageMeta(pathname: string): PageCitationMeta {
  const normalized = normalizePathname(pathname);
  const exact = manifest.routes[normalized];
  if (exact) return exact;

  if (normalized === '/' && manifest.routes['/']) {
    return manifest.routes['/'];
  }

  const project = manifest.project;
  return {
    route: normalized,
    url: normalized === '/' ? `${project.origin}/` : `${project.origin}${normalized}`,
    title: humanizePath(normalized),
    kind: normalized === '/' ? 'project' : 'page',
    citeKey: synthesizeKey(normalized),
    sourcePath: '',
    commit: project.commit,
    commitShort: project.commitShort,
    lastChanged: project.lastChanged,
    lastChangedIso: project.lastChangedIso,
    contentHash: project.contentHash,
    contentHashFull: project.contentHashFull,
    fileCount: 0,
  };
}

function buildTargetUrl(baseUrl: string, origin: string, opts: CitationOptions, isProject: boolean): string {
  if (isProject || !opts.includePageState || !opts.currentUrl) {
    return baseUrl;
  }
  try {
    const parsed = new URL(opts.currentUrl, origin);
    const suffix = `${parsed.search}${parsed.hash}`;
    return suffix ? `${baseUrl}${suffix}` : baseUrl;
  } catch {
    return baseUrl;
  }
}

export function resolveCitationTarget(
  page: PageCitationMeta,
  project: ProjectCitationMeta,
  opts: CitationOptions,
): ResolvedCitationTarget {
  const isProject = opts.scope === 'project' || page.kind === 'project';
  const lastChanged = isProject ? project.lastChanged : page.lastChanged;
  const parsed = parseIsoDate(lastChanged);
  const commit = isProject ? project.commit : page.commit;
  const commitShort = isProject ? project.commitShort : page.commitShort;
  const contentHash = isProject ? project.contentHash : page.contentHash;
  const contentHashFull = isProject ? project.contentHashFull : page.contentHashFull;
  const baseUrl = isProject ? `${project.origin}/` : page.url;
  const url = buildTargetUrl(baseUrl, project.origin, opts, isProject);
  const sourcePath = isProject ? '' : page.sourcePath;
  const commitUrl = commit ? `${project.repository}/commit/${commit}` : project.repository;

  let sourceBlobUrl: string;
  if (!isProject && sourcePath) {
    const ref = commit || 'main';
    sourceBlobUrl = `${project.repository}/blob/${ref}/${sourcePath}`;
  } else if (commit) {
    sourceBlobUrl = `${project.repository}/tree/${commit}`;
  } else {
    sourceBlobUrl = project.repository;
  }

  return {
    citeKey: isProject ? 'yotasage_site' : page.citeKey,
    title: isProject ? project.title : page.title,
    subtitle: isProject ? 'Client-side browser engineering and utility tools' : project.name,
    siteTitle: project.name,
    author: project.author,
    url,
    repository: project.repository,
    license: project.license,
    lastChanged: parsed?.iso ?? lastChanged,
    year: parsed?.year ?? '',
    month: parsed?.month ?? '',
    day: parsed?.day ?? '',
    commit,
    commitShort,
    contentHash,
    contentHashFull,
    sourcePath,
    sourceBlobUrl,
    commitUrl,
    isProject,
  };
}

function citationKeyWithYear(target: ResolvedCitationTarget): string {
  return target.year ? `${target.citeKey}_${target.year}` : target.citeKey;
}

function versionFingerprint(target: ResolvedCitationTarget): string {
  const parts: string[] = [];
  if (target.commitShort && target.commitShort !== 'unknown') {
    parts.push(`commit ${target.commitShort}`);
  }
  if (target.contentHash) {
    parts.push(`sha256:${target.contentHash}`);
  }
  return parts.join(', ');
}

function escapeBibText(value: string, asciiDashes = false): string {
  let out = value
    .replaceAll('\\', '\\textbackslash{}')
    .replaceAll('&', '\\&')
    .replaceAll('%', '\\%')
    .replaceAll('$', '\\$')
    .replaceAll('#', '\\#')
    .replaceAll('_', '\\_')
    .replaceAll('{', '(')
    .replaceAll('}', ')');
  if (asciiDashes) {
    out = out.replaceAll('—', '---').replaceAll('–', '--');
  }
  return out;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function escapeYamlString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', ' ');
}

function deterministicGuid(seedHex: string): string {
  const hex = seedHex.replace(/[^0-9a-f]/gi, '').padEnd(32, '0').slice(0, 32).toUpperCase();
  return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}}`;
}

function getAccessedDate(opts: CitationOptions): ParsedDate | null {
  if (!opts.includeAccessedDate) return null;
  return parseIsoDate(opts.accessedDate);
}

export function formatBibLaTeX(target: ResolvedCitationTarget, opts: CitationOptions): string {
  const key = citationKeyWithYear(target);
  const accessed = getAccessedDate(opts);
  const version = opts.includeHash ? versionFingerprint(target) : '';
  const noteText = target.isProject
    ? `Client-side browser engineering and utility tools; source repository: ${target.repository}`
    : `Client-side web tool; source repository: ${target.repository}`;

  const fields: Array<[string, string]> = [
    ['author', `{{${escapeBibText(target.author)}}}`],
    ['title', `{{${escapeBibText(target.title)}}}`],
  ];
  if (!target.isProject) {
    fields.push(['titleaddon', `{${escapeBibText(target.siteTitle)}}`]);
  }
  if (target.lastChanged) {
    fields.push(['date', `{${target.lastChanged}}`]);
  }
  if (version) {
    fields.push(['version', `{${escapeBibText(version)}}`]);
  }
  fields.push(['url', `{${target.url}}`]);
  if (accessed) {
    fields.push(['urldate', `{${accessed.iso}}`]);
  }
  if (target.license) {
    fields.push(['license', `{${escapeBibText(target.license)}}`]);
  }
  fields.push(['note', `{${escapeBibText(noteText)}}`]);

  const pad = Math.max(...fields.map(([name]) => name.length));
  const body = fields
    .map(([name, val], idx) => `  ${name.padEnd(pad)} = ${val}${idx < fields.length - 1 ? ',' : ''}`)
    .join('\n');

  return `@software{${key},\n${body}\n}`;
}

export function formatBibTeX(target: ResolvedCitationTarget, opts: CitationOptions): string {
  const key = citationKeyWithYear(target);
  const accessed = getAccessedDate(opts);
  const version = opts.includeHash ? versionFingerprint(target) : '';
  const monthIdx = target.month ? Number(target.month) - 1 : -1;
  const monthMacro = monthIdx >= 0 && monthIdx < 12 ? BIBTEX_MONTHS[monthIdx] : '';

  const noteParts: string[] = [];
  if (!target.isProject) {
    noteParts.push(target.siteTitle);
  }
  if (target.lastChanged) {
    noteParts.push(`last changed ${target.lastChanged}`);
  }
  if (version) {
    noteParts.push(version);
  }
  if (accessed) {
    noteParts.push(`accessed ${accessed.iso}`);
  }
  if (target.license) {
    noteParts.push(target.license);
  }

  const fields: Array<[string, string]> = [
    ['author', `{{${escapeBibText(target.author, true)}}}`],
    ['title', `{{${escapeBibText(target.title, true)}}}`],
  ];
  if (target.year) {
    fields.push(['year', `{${target.year}}`]);
  }
  if (monthMacro) {
    fields.push(['month', monthMacro]);
  }
  fields.push(['howpublished', `{\\url{${target.url}}}`]);
  fields.push(['note', `{${escapeBibText(noteParts.join('; '), true)}}`]);

  const pad = Math.max(...fields.map(([name]) => name.length));
  const body = fields
    .map(([name, val], idx) => `  ${name.padEnd(pad)} = ${val}${idx < fields.length - 1 ? ',' : ''}`)
    .join('\n');

  return `@misc{${key},\n${body}\n}`;
}

export function formatRIS(target: ResolvedCitationTarget, opts: CitationOptions): string {
  const accessed = getAccessedDate(opts);
  const lines: string[] = [
    'TY  - COMP',
    `AU  - ${target.author}`,
    `TI  - ${target.title}`,
  ];
  if (!target.isProject) {
    lines.push(`T2  - ${target.siteTitle}`);
  }
  lines.push('M3  - Computer software');
  if (target.year) {
    lines.push(`PY  - ${target.year}`);
  }
  if (target.year && target.month && target.day) {
    lines.push(`DA  - ${target.year}/${target.month}/${target.day}/`);
  }
  if (accessed) {
    lines.push(`Y2  - ${accessed.year}/${accessed.month}/${accessed.day}/`);
  }
  if (opts.includeHash) {
    const parts: string[] = [];
    if (target.commitShort && target.commitShort !== 'unknown') {
      parts.push(`commit ${target.commitShort}`);
    }
    if (target.contentHash) {
      parts.push(`(sha256:${target.contentHash})`);
    }
    if (parts.length > 0) {
      lines.push(`VL  - ${parts.join(' ')}`);
    }
  }
  lines.push(`PB  - ${target.siteTitle}`);
  lines.push(`UR  - ${target.url}`);
  lines.push(`N1  - License: ${target.license}. Source: ${target.repository}`);
  lines.push('ER  - ');
  return lines.join('\n');
}

export function formatWordXml(target: ResolvedCitationTarget, opts: CitationOptions): string {
  const tag = citationKeyWithYear(target);
  const accessed = getAccessedDate(opts);
  const version = opts.includeHash ? versionFingerprint(target) : '';
  const guid = deterministicGuid(target.contentHashFull || target.commit || target.citeKey);

  const commentParts: string[] = [];
  if (version) commentParts.push(version);
  commentParts.push(`License: ${target.license}`);
  commentParts.push(`Source: ${target.repository}`);

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<b:Sources SelectedStyle="" xmlns:b="http://schemas.openxmlformats.org/officeDocument/2006/bibliography" xmlns="http://schemas.openxmlformats.org/officeDocument/2006/bibliography">',
    '  <b:Source>',
    `    <b:Tag>${escapeXml(tag)}</b:Tag>`,
    '    <b:SourceType>InternetSite</b:SourceType>',
    `    <b:Guid>${guid}</b:Guid>`,
    `    <b:Title>${escapeXml(target.title)}</b:Title>`,
    `    <b:InternetSiteTitle>${escapeXml(target.siteTitle)}</b:InternetSiteTitle>`,
    '    <b:Author>',
    '      <b:Author>',
    `        <b:Corporate>${escapeXml(target.author)}</b:Corporate>`,
    '      </b:Author>',
    '    </b:Author>',
  ];
  if (target.year) lines.push(`    <b:Year>${escapeXml(target.year)}</b:Year>`);
  if (target.month) lines.push(`    <b:Month>${Number(target.month)}</b:Month>`);
  if (target.day) lines.push(`    <b:Day>${Number(target.day)}</b:Day>`);
  if (accessed) {
    lines.push(`    <b:YearAccessed>${escapeXml(accessed.year)}</b:YearAccessed>`);
    lines.push(`    <b:MonthAccessed>${accessed.monthNum}</b:MonthAccessed>`);
    lines.push(`    <b:DayAccessed>${accessed.dayNum}</b:DayAccessed>`);
  }
  lines.push(`    <b:URL>${escapeXml(target.url)}</b:URL>`);
  lines.push(`    <b:Comments>${escapeXml(commentParts.join('; '))}</b:Comments>`);
  lines.push('  </b:Source>');
  lines.push('</b:Sources>');

  return lines.join('\n');
}

export function formatCslJson(target: ResolvedCitationTarget, opts: CitationOptions): string {
  const parsed = parseIsoDate(target.lastChanged);
  const accessed = getAccessedDate(opts);
  const version = opts.includeHash ? versionFingerprint(target) : '';

  const item: Record<string, unknown> = {
    id: citationKeyWithYear(target),
    type: 'software',
    title: target.title,
  };
  if (!target.isProject) {
    item['container-title'] = target.siteTitle;
  }
  item.author = [{ literal: target.author }];
  if (parsed) {
    item.issued = { 'date-parts': [[parsed.yearNum, parsed.monthNum, parsed.dayNum]] };
  }
  if (accessed) {
    item.accessed = { 'date-parts': [[accessed.yearNum, accessed.monthNum, accessed.dayNum]] };
  }
  if (version) {
    item.version = version;
  }
  item.URL = target.url;
  item.note = `License: ${target.license}; source repository: ${target.repository}`;

  return JSON.stringify([item], null, 2);
}

export function formatCff(target: ResolvedCitationTarget, opts: CitationOptions): string {
  const displayTitle = target.isProject ? target.title : `${target.title} — ${target.siteTitle}`;
  const versionSlug = [
    target.commitShort && target.commitShort !== 'unknown' ? `commit-${target.commitShort}` : '',
    target.contentHash ? `sha256-${target.contentHash}` : '',
  ]
    .filter(Boolean)
    .join('-');

  const lines: string[] = [
    'cff-version: 1.2.0',
    'message: "If you use this software, please cite it using these metadata."',
    'type: software',
    `title: "${escapeYamlString(displayTitle)}"`,
    'authors:',
    `  - alias: "${escapeYamlString(target.author)}"`,
  ];
  if (target.lastChanged) {
    lines.push(`date-released: "${escapeYamlString(target.lastChanged)}"`);
  }
  if (opts.includeHash && versionSlug) {
    lines.push(`version: "${escapeYamlString(versionSlug)}"`);
  }
  if (opts.includeHash && target.commit) {
    lines.push(`commit: "${escapeYamlString(target.commit)}"`);
  }
  lines.push(`url: "${escapeYamlString(target.url)}"`);
  lines.push(`repository-code: "${escapeYamlString(target.repository)}"`);
  lines.push(`license: "${escapeYamlString(target.license)}"`);

  return lines.join('\n');
}

function formatDateIeee(date: ParsedDate | null): string {
  if (!date) return 'n.d.';
  return `${IEEE_MONTHS[date.monthNum - 1]} ${date.dayNum}, ${date.year}`;
}

function formatDateFull(date: ParsedDate | null): string {
  if (!date) return 'n.d.';
  return `${FULL_MONTHS[date.monthNum - 1]} ${date.dayNum}, ${date.year}`;
}

function formatDateDayMonthYear(date: ParsedDate | null): string {
  if (!date) return 'n.d.';
  return `${date.dayNum} ${FULL_MONTHS[date.monthNum - 1]} ${date.year}`;
}

function formatDateApa(date: ParsedDate | null): string {
  if (!date) return 'n.d.';
  return `${date.year}, ${FULL_MONTHS[date.monthNum - 1]} ${date.dayNum}`;
}

function formatDateMla(date: ParsedDate | null): string {
  if (!date) return 'n.d.';
  return `${date.dayNum} ${MLA_MONTHS[date.monthNum - 1]} ${date.year}`;
}

function formatDateNbShort(date: ParsedDate | null): string {
  if (!date) return 'u.å.';
  return `${date.dayNum}. ${NB_SHORT_MONTHS[date.monthNum - 1]} ${date.year}`;
}

function formatDateNbFull(date: ParsedDate | null): string {
  if (!date) return 'u.å.';
  return `${date.dayNum}. ${NB_FULL_MONTHS[date.monthNum - 1]} ${date.year}`;
}

function formatDateNbApa(date: ParsedDate | null): string {
  if (!date) return 'u.å.';
  return `${date.year}, ${date.dayNum}. ${NB_FULL_MONTHS[date.monthNum - 1]}`;
}

function formatDateNbNumeric(date: ParsedDate): string {
  return `${date.day}.${date.month}.${date.year}`;
}

export function formatInTextCitation(
  target: ResolvedCitationTarget,
  style: PlainTextStyle,
  locale: CitationLocale = 'en',
): string {
  const noDate = locale === 'nb' ? 'u.å.' : 'n.d.';
  const year = target.year || noDate;
  switch (style) {
    case 'ieee':
      return '[1]';
    case 'apa':
    case 'harvard':
      return `(${target.author}, ${year})`;
    case 'chicago':
      return `(${target.author} ${year})`;
    case 'mla':
      return `(${target.author})`;
  }
}

export function formatPlainText(
  target: ResolvedCitationTarget,
  style: PlainTextStyle,
  opts: CitationOptions,
): string {
  const locale = opts.locale ?? 'en';
  const issued = parseIsoDate(target.lastChanged);
  const accessed = getAccessedDate(opts);
  const version = opts.includeHash ? versionFingerprint(target) : '';

  switch (style) {
    case 'ieee': {
      const site = target.isProject ? '' : ` ${target.siteTitle},`;
      const ver = version ? ` (${version})` : '';
      if (locale === 'nb') {
        const acc = accessed ? ` (Lastet ned: ${formatDateNbNumeric(accessed)}).` : '.';
        return `${target.author}. «${target.title}.»${site} ${formatDateNbShort(issued)}${ver}. [Internett]. Tilgjengelig fra: ${target.url}${acc}`;
      }
      const acc = accessed ? ` [Accessed: ${formatDateIeee(accessed)}].` : '';
      return `${target.author}, "${target.title},"${site} ${formatDateIeee(issued)}${ver}. [Online]. Available: ${target.url}.${acc}`;
    }
    case 'apa': {
      const site = target.isProject ? '' : ` ${target.siteTitle}.`;
      if (locale === 'nb') {
        const verParen = version ? ` (Versjon ${version})` : '';
        const retrieved = accessed ? `Hentet ${formatDateNbFull(accessed)} fra ` : '';
        return `${target.author}. (${formatDateNbApa(issued)}). ${target.title}${verParen} [Programvare].${site} ${retrieved}${target.url}`;
      }
      const verParen = version ? ` (Version ${version})` : '';
      const retrieved = accessed ? `Retrieved ${formatDateFull(accessed)}, from ` : '';
      return `${target.author}. (${formatDateApa(issued)}). ${target.title}${verParen} [Computer software].${site} ${retrieved}${target.url}`;
    }
    case 'harvard': {
      const site = target.isProject ? '' : ` ${target.siteTitle}.`;
      if (locale === 'nb') {
        const yearOrUa = target.year || 'u.å.';
        const verParen = version ? ` (Versjon ${version})` : '';
        const acc = accessed ? ` (Lest: ${formatDateNbFull(accessed)}).` : '.';
        return `${target.author} (${yearOrUa}) ${target.title}${verParen} [Programvare].${site} Tilgjengelig fra: ${target.url}${acc}`;
      }
      const yearOrNd = target.year || 'n.d.';
      const verParen = version ? ` (Version ${version})` : '';
      const acc = accessed ? ` (Accessed: ${formatDateDayMonthYear(accessed)}).` : '.';
      return `${target.author} (${yearOrNd}) ${target.title}${verParen} [Computer software].${site} Available at: ${target.url}${acc}`;
    }
    case 'chicago': {
      const site = target.isProject ? '' : ` ${target.siteTitle}.`;
      if (locale === 'nb') {
        const verSentence = version ? ` Versjon ${version}.` : '';
        const accSentence = accessed ? ` Hentet ${formatDateNbFull(accessed)}.` : '';
        return `${target.author}. «${target.title}.»${site} Sist endret ${formatDateNbFull(issued)}.${verSentence}${accSentence} ${target.url}.`;
      }
      const verSentence = version ? ` Version ${version}.` : '';
      const accSentence = accessed ? ` Accessed ${formatDateFull(accessed)}.` : '';
      return `${target.author}. "${target.title}."${site} Last modified ${formatDateFull(issued)}.${verSentence}${accSentence} ${target.url}.`;
    }
    case 'mla': {
      const siteComma = target.isProject ? '' : ` ${target.siteTitle},`;
      const verComma = version ? ` ${version},` : '';
      if (locale === 'nb') {
        const accNb = accessed ? ` Hentet ${formatDateNbShort(accessed)}.` : '';
        return `${target.author}. «${target.title}.»${siteComma}${verComma} ${formatDateNbShort(issued)}, ${target.url}.${accNb}`;
      }
      const acc = accessed ? ` Accessed ${formatDateMla(accessed)}.` : '';
      return `${target.author}. "${target.title}."${siteComma}${verComma} ${formatDateMla(issued)}, ${target.url}.${acc}`;
    }
  }
}

export function getFormatDownloadMeta(
  format: CitationFormatId,
  target: ResolvedCitationTarget,
): CitationDownloadMeta | null {
  const base = citationKeyWithYear(target);
  switch (format) {
    case 'biblatex':
      return { filename: `${base}.bib`, mimeType: 'application/x-bibtex;charset=utf-8' };
    case 'bibtex':
      return { filename: `${base}-bibtex.bib`, mimeType: 'application/x-bibtex;charset=utf-8' };
    case 'ris':
      return { filename: `${base}.ris`, mimeType: 'application/x-research-info-systems;charset=utf-8' };
    case 'word':
      return { filename: `${base}-word.xml`, mimeType: 'application/xml;charset=utf-8' };
    case 'csl':
      return { filename: `${base}.csl.json`, mimeType: 'application/vnd.citationstyles.csl+json;charset=utf-8' };
    case 'cff':
      return { filename: 'CITATION.cff', mimeType: 'text/yaml;charset=utf-8' };
    case 'text':
      return null;
  }
}

export function formatCitation(
  format: Exclude<CitationFormatId, 'text'>,
  target: ResolvedCitationTarget,
  opts: CitationOptions,
): string {
  switch (format) {
    case 'biblatex':
      return formatBibLaTeX(target, opts);
    case 'bibtex':
      return formatBibTeX(target, opts);
    case 'ris':
      return formatRIS(target, opts);
    case 'word':
      return formatWordXml(target, opts);
    case 'csl':
      return formatCslJson(target, opts);
    case 'cff':
      return formatCff(target, opts);
  }
}
