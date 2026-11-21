// Client-side PDF/A-1b, PDF/A-2b and PDF/A-3b compliance inspector and Ghostscript WebAssembly converter.
// 100% DOM-free so it runs identically in browsers (offloading Ghostscript to its Web Worker) and in Node.js.

import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFRawStream,
  PDFStream,
} from '@cantoo/pdf-lib';

import { runGhostscript } from './ghostscript';
import { filterNames, N, nameOf, text, walkDicts } from './objects';
import { checkQpdf } from './qpdf';

export type PdfALevel = '1b' | '2b' | '3b';
export type PdfAColorStrategy = 'RGB' | 'Gray' | 'CMYK';

export interface PdfACheckItem {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface PdfAComplianceReport {
  isPdfA: boolean;
  pdfaidPart: 1 | 2 | 3 | null;
  pdfaidConformance: string | null;
  hasOutputIntent: boolean;
  outputCondition: string | null;
  hasXmpMetadata: boolean;
  hasTrailerId: boolean;
  isEncrypted: boolean;
  totalFonts: number;
  unembeddedFonts: string[];
  forbiddenFeatures: string[];
  checks: PdfACheckItem[];
}

export interface PdfAConvertOptions {
  level: PdfALevel;
  colorStrategy?: PdfAColorStrategy;
  compatibilityPolicy?: 'continue' | 'strict';
  title?: string;
  password?: string;
}

export interface PdfAConvertResult {
  bytes: Uint8Array;
  level: PdfALevel;
  beforeReport: PdfAComplianceReport;
  afterReport: PdfAComplianceReport;
  qpdfOk: boolean;
  warnings: string[];
  beforeBytes: number;
  afterBytes: number;
}

interface ColorProfileSpec {
  iccRomPath: string;
  components: 1 | 3 | 4;
  outputConditionId: string;
  colorConversionStrategy: PdfAColorStrategy;
  processColorModel: 'DeviceRGB' | 'DeviceGray' | 'DeviceCMYK';
}

const COLOR_PROFILES: Record<PdfAColorStrategy, ColorProfileSpec> = {
  RGB: {
    iccRomPath: '%rom%iccprofiles/srgb.icc',
    components: 3,
    outputConditionId: 'sRGB IEC61966-2.1',
    colorConversionStrategy: 'RGB',
    processColorModel: 'DeviceRGB',
  },
  Gray: {
    iccRomPath: '%rom%iccprofiles/default_gray.icc',
    components: 1,
    outputConditionId: 'Gray Gamma 2.2',
    colorConversionStrategy: 'Gray',
    processColorModel: 'DeviceGray',
  },
  CMYK: {
    iccRomPath: '%rom%iccprofiles/default_cmyk.icc',
    components: 4,
    outputConditionId: 'CGATS TR 001',
    colorConversionStrategy: 'CMYK',
    processColorModel: 'DeviceCMYK',
  },
};

const LEVEL_CONFIG: Record<PdfALevel, { part: 1 | 2 | 3; compatibilityLevel: '1.4' | '1.7' }> = {
  '1b': { part: 1, compatibilityLevel: '1.4' },
  '2b': { part: 2, compatibilityLevel: '1.7' },
  '3b': { part: 3, compatibilityLevel: '1.7' },
};

const PASSWORD_ERROR_RE = /requires a password|Password did not work|Cannot decrypt/i;
const UNREADABLE_INPUT_RE = /Couldn't initialise file/i;

function hasPdfHeader(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

function decodeStreamBytes(stream: PDFStream): Uint8Array {
  if (stream instanceof PDFRawStream) {
    const filters = filterNames(stream.dict);
    if (filters && filters.length > 0) {
      try {
        return decodePDFRawStream(stream).decode();
      } catch {
        return stream.contents;
      }
    }
    return stream.contents;
  }
  return stream.getContents();
}

function parsePdfAId(xmp: string): { part: 1 | 2 | 3 | null; conformance: string | null } {
  const partElem = /<pdfaid:part(?:\s[^>]*)?>\s*([123])\s*<\/pdfaid:part>/i.exec(xmp);
  const partAttr = /\bpdfaid:part\s*=\s*["']\s*([123])\s*["']/i.exec(xmp);
  const partRaw = partElem?.[1] ?? partAttr?.[1] ?? null;
  const part = partRaw === '1' ? 1 : partRaw === '2' ? 2 : partRaw === '3' ? 3 : null;

  const confElem = /<pdfaid:conformance(?:\s[^>]*)?>\s*([A-Za-z])\s*<\/pdfaid:conformance>/i.exec(xmp);
  const confAttr = /\bpdfaid:conformance\s*=\s*["']\s*([A-Za-z])\s*["']/i.exec(xmp);
  const confRaw = confElem?.[1] ?? confAttr?.[1] ?? null;
  const conformance = confRaw ? confRaw.toUpperCase() : null;

  return { part, conformance };
}

function hasEmbeddedFontFile(fontDict: PDFDict): boolean {
  const descriptor = fontDict.lookup(N('FontDescriptor'));
  if (!(descriptor instanceof PDFDict)) return false;
  return (
    descriptor.lookup(N('FontFile')) !== undefined ||
    descriptor.lookup(N('FontFile2')) !== undefined ||
    descriptor.lookup(N('FontFile3')) !== undefined
  );
}

function formatFontName(fontDict: PDFDict): string {
  const raw = nameOf(fontDict, 'BaseFont') ?? nameOf(fontDict, 'Name') ?? 'Unnamed font';
  return raw.replace(/^\//, '');
}

function psString(value: string): string {
  let asciiOnly = true;
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0x7e) {
      asciiOnly = false;
      break;
    }
  }
  if (!asciiOnly) {
    // UTF-16BE with BOM as a PostScript hex string so Ghostscript pdfmark preserves Unicode titles.
    let hex = 'FEFF';
    for (let i = 0; i < value.length; i++) {
      hex += value.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
    }
    return `<${hex}>`;
  }
  let escaped = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0x5c) escaped += '\\\\';
    else if (code === 0x28) escaped += '\\(';
    else if (code === 0x29) escaped += '\\)';
    else if (code === 0x0a) escaped += '\\n';
    else if (code === 0x0d) escaped += '\\r';
    else if (code === 0x09) escaped += '\\t';
    else if (code < 0x20) escaped += `\\${code.toString(8).padStart(3, '0')}`;
    else escaped += value[i];
  }
  return `(${escaped})`;
}

function buildPdfADefPs(profile: ColorProfileSpec, title?: string): string {
  const lines = [
    '%!',
    '[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark',
    `[{icc_PDFA} << /N ${profile.components} >> /PUT pdfmark`,
    `[{icc_PDFA} ${psString(profile.iccRomPath)} (r) file /PUT pdfmark`,
    '[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark',
    '[{OutputIntent_PDFA} <<',
    '  /Type /OutputIntent',
    '  /S /GTS_PDFA1',
    '  /DestOutputProfile {icc_PDFA}',
    `  /OutputConditionIdentifier ${psString(profile.outputConditionId)}`,
    `  /Info ${psString(profile.outputConditionId)}`,
    '>> /PUT pdfmark',
    '[{Catalog} << /OutputIntents [ {OutputIntent_PDFA} ] >> /PUT pdfmark',
  ];
  const trimmedTitle = title?.trim();
  if (trimmedTitle) {
    lines.push(`[ /Title ${psString(trimmedTitle)} /DOCINFO pdfmark`);
  }
  return `${lines.join('\n')}\n`;
}

function collectWarnings(stdout: string, stderr: string, qpdfWarnings: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (line: string) => {
    const cleaned = line.trim();
    if (!cleaned || seen.has(cleaned)) return;
    seen.add(cleaned);
    out.push(cleaned);
  };
  for (const line of `${stderr}\n${stdout}`.split(/\r?\n/)) {
    if (line.trim()) push(line);
  }
  for (const w of qpdfWarnings) push(w);
  return out;
}

/**
 * Inspects a PDF for ISO PDF/A compliance indicators: XMP pdfaid identification, embedded fonts,
 * GTS_PDFA1 OutputIntent ICC profile, encryption, forbidden actions/media, and trailer document ID.
 */
export async function inspectPdfA(bytes: Uint8Array, password?: string): Promise<PdfAComplianceReport> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, {
      updateMetadata: false,
      ...(password !== undefined ? { password } : {}),
    });
  } catch {
    doc = await PDFDocument.load(bytes, {
      updateMetadata: false,
      ignoreEncryption: true,
      ...(password !== undefined ? { password } : {}),
    });
  }

  const isEncrypted = Boolean(doc.isEncrypted || doc.context.trailerInfo.Encrypt);

  // 1. Catalog /Metadata XMP stream & pdfaid part/conformance
  let hasXmpMetadata = false;
  let pdfaidPart: 1 | 2 | 3 | null = null;
  let pdfaidConformance: string | null = null;
  const metadataObj = doc.catalog.lookup(N('Metadata'));
  if (metadataObj instanceof PDFStream) {
    const raw = decodeStreamBytes(metadataObj);
    const xmpText = new TextDecoder('utf-8', { fatal: false }).decode(raw);
    if (xmpText.trim().length > 0) {
      hasXmpMetadata = true;
      const parsed = parsePdfAId(xmpText);
      pdfaidPart = parsed.part;
      pdfaidConformance = parsed.conformance;
    }
  }

  // 2. Catalog /OutputIntents (/S /GTS_PDFA1 + /DestOutputProfile)
  let hasOutputIntent = false;
  let outputCondition: string | null = null;
  const outputIntentsObj = doc.catalog.lookup(N('OutputIntents'));
  if (outputIntentsObj instanceof PDFArray) {
    for (const entry of outputIntentsObj.asArray()) {
      const intent = doc.context.lookup(entry);
      if (!(intent instanceof PDFDict)) continue;
      if (nameOf(intent, 'S') !== 'GTS_PDFA1') continue;
      const destProfile = intent.lookup(N('DestOutputProfile'));
      if (destProfile instanceof PDFStream) {
        hasOutputIntent = true;
        const cond =
          text(intent.lookup(N('OutputConditionIdentifier'))) ||
          text(intent.lookup(N('Info'))) ||
          text(intent.lookup(N('OutputCondition'))) ||
          '';
        outputCondition = cond.trim() || null;
        break;
      }
    }
  }

  // 3. Trailer /ID
  const rawId = doc.context.trailerInfo.ID;
  const resolvedId = rawId ? doc.context.lookup(rawId) : undefined;
  const hasTrailerId = resolvedId instanceof PDFArray && resolvedId.size() >= 1;

  // 4. Walk all reachable dictionaries for fonts and forbidden PDF/A features
  const fontDicts: PDFDict[] = [];
  const seenFontDicts = new Set<PDFDict>();
  const descendantFontDicts = new Set<PDFDict>();
  const forbiddenSet = new Set<string>();

  walkDicts(doc.context, (dict) => {
    const type = nameOf(dict, 'Type');
    const subtype = nameOf(dict, 'Subtype');
    const actionType = nameOf(dict, 'S');

    if (type === 'Font' && !seenFontDicts.has(dict)) {
      seenFontDicts.add(dict);
      fontDicts.push(dict);
      if (subtype === 'Type0') {
        const descendants = dict.lookup(N('DescendantFonts'));
        if (descendants instanceof PDFArray) {
          for (const dRef of descendants.asArray()) {
            const desc = doc.context.lookup(dRef);
            if (desc instanceof PDFDict) descendantFontDicts.add(desc);
          }
        }
      }
    }

    if (actionType === 'JavaScript' || dict.has(N('JS')) || dict.has(N('JavaScript'))) {
      forbiddenSet.add('JavaScript');
    }
    if (actionType === 'Launch') {
      forbiddenSet.add('Launch');
    }
    if (subtype === 'Sound' || actionType === 'Sound') {
      forbiddenSet.add('Sound');
    }
    if (subtype === 'Movie' || actionType === 'Movie') {
      forbiddenSet.add('Movie');
    }
    if (subtype === 'RichMedia' || actionType === 'RichMediaExecute') {
      forbiddenSet.add('RichMedia');
    }
    if (dict.has(N('EmbeddedFiles'))) {
      forbiddenSet.add('EmbeddedFiles');
    }
  });

  // Evaluate fonts (handling Type0 via DescendantFonts, skipping Type3)
  let totalFonts = 0;
  const unembeddedSet = new Set<string>();

  for (const fontDict of fontDicts) {
    const subtype = nameOf(fontDict, 'Subtype');
    if (subtype === 'Type3') continue;
    if (descendantFontDicts.has(fontDict)) continue;

    totalFonts += 1;
    let embedded = false;

    if (subtype === 'Type0') {
      const descendants = fontDict.lookup(N('DescendantFonts'));
      if (descendants instanceof PDFArray && descendants.size() > 0) {
        const descDicts = descendants
          .asArray()
          .map((d) => doc.context.lookup(d))
          .filter((d): d is PDFDict => d instanceof PDFDict);
        embedded = descDicts.length > 0 && descDicts.every((d) => hasEmbeddedFontFile(d));
      }
    } else {
      embedded = hasEmbeddedFontFile(fontDict);
    }

    if (!embedded) {
      unembeddedSet.add(formatFontName(fontDict));
    }
  }

  const unembeddedFonts = Array.from(unembeddedSet);
  const forbiddenFeatures = Array.from(forbiddenSet);
  const hardForbidden = forbiddenFeatures.filter((f) => !(pdfaidPart === 3 && f === 'EmbeddedFiles'));

  const isPdfA =
    hasXmpMetadata &&
    pdfaidPart !== null &&
    pdfaidConformance !== null &&
    hasOutputIntent &&
    hasTrailerId &&
    !isEncrypted &&
    unembeddedFonts.length === 0 &&
    hardForbidden.length === 0;

  const checks: PdfACheckItem[] = [
    {
      id: 'xmp-pdfaid',
      label: 'PDF/A XMP identification',
      status:
        hasXmpMetadata && pdfaidPart !== null && pdfaidConformance !== null
          ? 'pass'
          : hasXmpMetadata
            ? 'warn'
            : 'fail',
      detail:
        hasXmpMetadata && pdfaidPart !== null && pdfaidConformance !== null
          ? `PDF/A-${pdfaidPart}${pdfaidConformance.toLowerCase()} declared in XMP metadata`
          : hasXmpMetadata
            ? 'XMP metadata stream is present, but missing pdfaid:part / pdfaid:conformance'
            : 'No XMP metadata stream with pdfaid identification',
    },
    {
      id: 'fonts',
      label: 'Embedded fonts',
      status: unembeddedFonts.length === 0 ? 'pass' : 'fail',
      detail:
        unembeddedFonts.length === 0
          ? totalFonts === 0
            ? 'No external fonts used'
            : `All ${totalFonts} font${totalFonts === 1 ? '' : 's'} embedded`
          : `${unembeddedFonts.length} unembedded font${unembeddedFonts.length === 1 ? '' : 's'}: ${unembeddedFonts.slice(0, 5).join(', ')}${unembeddedFonts.length > 5 ? ` (+${unembeddedFonts.length - 5} more)` : ''}`,
    },
    {
      id: 'output-intent',
      label: 'OutputIntent ICC profile',
      status: hasOutputIntent ? 'pass' : 'fail',
      detail: hasOutputIntent
        ? `GTS_PDFA1 ICC profile present${outputCondition ? ` (${outputCondition})` : ''}`
        : 'Missing GTS_PDFA1 OutputIntent with embedded ICC colour profile',
    },
    {
      id: 'encryption',
      label: 'Encryption',
      status: !isEncrypted ? 'pass' : 'fail',
      detail: !isEncrypted
        ? 'Unencrypted (required by PDF/A)'
        : 'Document is encrypted — PDF/A forbids encryption',
    },
    {
      id: 'forbidden',
      label: 'Forbidden actions & media',
      status:
        hardForbidden.length > 0
          ? 'fail'
          : forbiddenFeatures.length > 0
            ? 'warn'
            : 'pass',
      detail:
        hardForbidden.length > 0
          ? `Disallowed features found: ${hardForbidden.join(', ')}`
          : forbiddenFeatures.length > 0
            ? 'Embedded files present (allowed in PDF/A-3)'
            : 'No JavaScript, launch actions, multimedia, or disallowed attachments',
    },
    {
      id: 'trailer-id',
      label: 'Trailer document ID',
      status: hasTrailerId ? 'pass' : 'warn',
      detail: hasTrailerId
        ? 'Trailer /ID array present'
        : 'Missing trailer /ID array (will be generated during conversion)',
    },
  ];

  return {
    isPdfA,
    pdfaidPart,
    pdfaidConformance,
    hasOutputIntent,
    outputCondition,
    hasXmpMetadata,
    hasTrailerId,
    isEncrypted,
    totalFonts,
    unembeddedFonts,
    forbiddenFeatures,
    checks,
  };
}

/**
 * Converts a PDF to ISO-compliant archival PDF/A-1b, PDF/A-2b, or PDF/A-3b using self-hosted
 * Ghostscript 10.08.0 WebAssembly, then verifies both PDF/A compliance and QPDF structural integrity.
 */
export async function convertToPdfA(
  bytes: Uint8Array,
  opts: PdfAConvertOptions,
): Promise<PdfAConvertResult> {
  if (bytes.length === 0) {
    throw new Error('The input PDF is empty.');
  }

  const levelCfg = LEVEL_CONFIG[opts.level];
  const colorStrategy: PdfAColorStrategy = opts.colorStrategy ?? 'RGB';
  const profile = COLOR_PROFILES[colorStrategy];

  const beforeReport = await inspectPdfA(bytes, opts.password);
  const pdfaDefPs = buildPdfADefPs(profile, opts.title);

  const args: string[] = [
    `-dPDFA=${levelCfg.part}`,
    '-dBATCH',
    '-dNOPAUSE',
    '-dQUIET',
    '-sDEVICE=pdfwrite',
    `-dCompatibilityLevel=${levelCfg.compatibilityLevel}`,
    `-dPDFACompatibilityPolicy=${opts.compatibilityPolicy === 'strict' ? 2 : 1}`,
    `-sColorConversionStrategy=${profile.colorConversionStrategy}`,
    `-sProcessColorModel=${profile.processColorModel}`,
    '-dEmbedAllFonts=true',
    '-dSubsetFonts=true',
    '-dAutoRotatePages=/None',
    `--permit-file-read=${profile.iccRomPath}`,
  ];

  if (opts.password !== undefined && opts.password !== '') {
    args.push(`-sPDFPassword=${opts.password}`);
  }

  args.push('-sOutputFile=$OUT', '/PDFA_def.ps', '$IN');

  const res = await runGhostscript(bytes, args, {
    extraFiles: { '/PDFA_def.ps': pdfaDefPs },
  });

  const combined = `${res.stderr}\n${res.stdout}`;

  if (PASSWORD_ERROR_RE.test(combined)) {
    const err = new Error('This PDF is password protected or the password is incorrect.');
    err.name = 'EncryptedPDFError';
    throw err;
  }

  if (res.exitCode !== 0 || UNREADABLE_INPUT_RE.test(combined)) {
    const detail = res.stderr.trim() || res.stdout.trim() || `exit code ${res.exitCode}`;
    throw new Error(`Ghostscript PDF/A conversion failed: ${detail}`);
  }

  if (!res.output || !hasPdfHeader(res.output)) {
    const detail = res.stderr.trim() || res.stdout.trim() || 'no valid PDF output produced';
    throw new Error(`Ghostscript PDF/A conversion failed: ${detail}`);
  }

  const outBytes = res.output;
  const afterReport = await inspectPdfA(outBytes);
  const qpdfCheck = await checkQpdf(outBytes);
  const warnings = collectWarnings(res.stdout, res.stderr, qpdfCheck.warnings);

  return {
    bytes: outBytes,
    level: opts.level,
    beforeReport,
    afterReport,
    qpdfOk: qpdfCheck.ok,
    warnings,
    beforeBytes: bytes.length,
    afterBytes: outBytes.length,
  };
}
