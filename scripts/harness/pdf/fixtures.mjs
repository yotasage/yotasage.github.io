// Synthetic PDF, PNG, and JPEG fixtures generated in memory with @cantoo/pdf-lib and fflate.
import { degrees, PDFArray, PDFDocument, PDFName, PDFNumber, PDFString, StandardFonts } from '@cantoo/pdf-lib';
import { zlibSync } from 'fflate';

function concatBytes(parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

// IEEE 802.3 CRC-32 for PNG chunks.
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}

function crc32(bytes, start = 0, end = bytes.length) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/**
 * Generates a valid 8-bit RGBA PNG with non-trivial alpha (0, 128, 255) so pdf-lib embeds an SMask.
 */
export function makeRgbaPng(width = 32, height = 24) {
  const rowBytes = width * 4;
  const raw = new Uint8Array(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const p = rowStart + 1 + x * 4;
      raw[p] = Math.round((x / Math.max(1, width - 1)) * 255);
      raw[p + 1] = Math.round((y / Math.max(1, height - 1)) * 255);
      raw[p + 2] = 180;
      raw[p + 3] = x < 4 && y < 4 ? 0 : x < width / 2 ? 255 : 128;
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA

  return concatBytes([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlibSync(raw)),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

function buildExifApp1Segment() {
  const encoder = new TextEncoder();
  const makeStr = encoder.encode('TestCam\0'); // 8 bytes
  const artistStr = encoder.encode('Alice Tester\0'); // 13 bytes

  // Little-endian TIFF header (8 bytes) + IFD0 (2 + 2*12 + 4 = 30 bytes) + string data
  const ifdOffset = 8;
  const dataOffset = ifdOffset + 2 + 2 * 12 + 4; // 38
  const makeOffset = dataOffset;
  const artistOffset = makeOffset + makeStr.length;
  const tiffLen = artistOffset + artistStr.length;

  const tiff = new Uint8Array(tiffLen);
  const dv = new DataView(tiff.buffer);
  // Byte order 'II' (little-endian), TIFF magic 42, IFD0 offset 8
  tiff[0] = 0x49;
  tiff[1] = 0x49;
  dv.setUint16(2, 42, true);
  dv.setUint32(4, ifdOffset, true);

  // IFD0: 2 entries
  dv.setUint16(ifdOffset, 2, true);
  // Entry 0: 0x010F Make (ASCII, count = makeStr.length)
  const e0 = ifdOffset + 2;
  dv.setUint16(e0, 0x010f, true);
  dv.setUint16(e0 + 2, 2, true);
  dv.setUint32(e0 + 4, makeStr.length, true);
  dv.setUint32(e0 + 8, makeOffset, true);
  // Entry 1: 0x013B Artist (ASCII, count = artistStr.length)
  const e1 = e0 + 12;
  dv.setUint16(e1, 0x013b, true);
  dv.setUint16(e1 + 2, 2, true);
  dv.setUint32(e1 + 4, artistStr.length, true);
  dv.setUint32(e1 + 8, artistOffset, true);
  // Next IFD offset = 0
  dv.setUint32(e1 + 12, 0, true);

  tiff.set(makeStr, makeOffset);
  tiff.set(artistStr, artistOffset);

  const header = encoder.encode('Exif\0\0');
  const payloadLen = 2 + header.length + tiff.length;
  const segHeader = Uint8Array.from([0xff, 0xe1, (payloadLen >>> 8) & 0xff, payloadLen & 0xff]);
  return concatBytes([segHeader, header, tiff]);
}

/**
 * Generates a valid baseline DCT JPEG (multiples of 8 for width/height), optionally containing an EXIF APP1 block.
 */
export function makeMinimalJpeg(width = 32, height = 32, { withExif = false } = {}) {
  const w = Math.max(8, Math.ceil(width / 8) * 8);
  const h = Math.max(8, Math.ceil(height / 8) * 8);

  const soi = Uint8Array.from([0xff, 0xd8]);
  const app0 = Uint8Array.from([
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
  const exif = withExif ? buildExifApp1Segment() : new Uint8Array(0);

  // Quantization table 0 (64 entries of 16)
  const dqt = new Uint8Array(2 + 2 + 1 + 64);
  dqt.set([0xff, 0xdb, 0x00, 0x43, 0x00], 0);
  dqt.fill(16, 5);

  // SOF0: 8-bit precision, 3 components (YCbCr 4:4:4, sampling 1x1)
  const sof0 = Uint8Array.from([
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (h >>> 8) & 0xff, h & 0xff,
    (w >>> 8) & 0xff, w & 0xff,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
  ]);

  // DHT DC table 0: 1 code of length 1 -> code '0' = symbol 0x00 (DC diff 0)
  const dhtDc = Uint8Array.from([
    0xff, 0xc4, 0x00, 0x14, 0x00,
    1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0x00,
  ]);

  // DHT AC table 0: 1 code of length 1 -> code '0' = symbol 0x00 (EOB)
  const dhtAc = Uint8Array.from([
    0xff, 0xc4, 0x00, 0x14, 0x10,
    1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0x00,
  ]);

  // SOS: 3 components all using DC table 0 / AC table 0
  const sos = Uint8Array.from([
    0xff, 0xda, 0x00, 0x0c, 0x03,
    0x01, 0x00,
    0x02, 0x00,
    0x03, 0x00,
    0x00, 0x3f, 0x00,
  ]);

  // Each 8x8 block takes 2 zero bits (DC diff=0, AC EOB=0).
  const blocks = (w / 8) * (h / 8) * 3;
  const scanData = new Uint8Array(Math.ceil((blocks * 2) / 8));
  const eoi = Uint8Array.from([0xff, 0xd9]);

  return concatBytes([soi, app0, exif, dqt, sof0, dhtDc, dhtAc, sos, scanData, eoi]);
}

/**
 * Distinct page dimensions for index `i`: width = 300 + i * 20, height = 400 + i * 15.
 */
export function pageDimensionsFor(index, offset = 0) {
  return { width: 300 + offset + index * 20, height: 400 + offset + index * 15 };
}

/**
 * Multi-page PDF where every page has unique dimensions so exact page order is provable.
 */
export async function makeMultiPagePdf(count = 4, { dimOffset = 0, labelPrefix = 'Page' } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < count; i++) {
    const { width, height } = pageDimensionsFor(i, dimOffset);
    const page = doc.addPage([width, height]);
    page.drawText(`${labelPrefix} ${i + 1}`, { x: 24, y: height - 48, size: 18, font });
  }
  return doc.save();
}

/**
 * 4-page PDF with initial rotations 0, 90, 180, 270 degrees.
 */
export async function makeRotatedPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const initial = [0, 90, 180, 270];
  for (let i = 0; i < initial.length; i++) {
    const { width, height } = pageDimensionsFor(i);
    const page = doc.addPage([width, height]);
    page.setRotation(degrees(initial[i]));
    page.drawText(`Rot ${initial[i]}`, { x: 24, y: height - 48, size: 16, font });
  }
  return doc.save();
}

/**
 * 2-page PDF with an embedded JPEG (32x32) on page 1 and an RGBA PNG (32x24, with SMask) on page 2.
 */
export async function makeImagePdf() {
  const jpeg = makeMinimalJpeg(32, 32);
  const png = makeRgbaPng(32, 24);
  const doc = await PDFDocument.create();
  const jpgImg = await doc.embedJpg(jpeg);
  const pngImg = await doc.embedPng(png);

  const p1 = doc.addPage([400, 400]);
  p1.drawImage(jpgImg, { x: 40, y: 200, width: 120, height: 120 });

  const p2 = doc.addPage([400, 400]);
  p2.drawImage(pngImg, { x: 40, y: 200, width: 120, height: 90 });

  const bytes = await doc.save();
  return { bytes, jpeg, png };
}

/**
 * PDF with Info dictionary fields, XMP metadata stream, and a JPEG containing an EXIF APP1 block.
 */
export async function makeMetadataPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const jpegExif = makeMinimalJpeg(32, 32, { withExif: true });
  const img = await doc.embedJpg(jpegExif);

  const page = doc.addPage([400, 400]);
  page.drawText('Metadata fixture', { x: 24, y: 350, size: 16, font });
  page.drawImage(img, { x: 24, y: 200, width: 96, height: 96 });

  doc.setTitle('Confidential Brief');
  doc.setAuthor('Alice Example');
  doc.setSubject('Internal Review');
  doc.setKeywords(['secret', 'draft']);
  doc.setCreator('FixtureCreator 1.0');
  doc.setProducer('FixtureProducer 2.0');

  const xmpXml = [
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">',
    '<dc:creator><rdf:Seq><rdf:li>Alice XMP</rdf:li></rdf:Seq></dc:creator>',
    '<xmp:CreatorTool>SecretTool 9</xmp:CreatorTool>',
    '</rdf:Description>',
    '</rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
  ].join('');
  const xmpStream = doc.context.stream(new TextEncoder().encode(xmpXml), {
    Type: 'Metadata',
    Subtype: 'XML',
  });
  const xmpRef = doc.context.register(xmpStream);
  doc.catalog.set(PDFName.of('Metadata'), xmpRef);

  return doc.save();
}

/**
 * 4-page PDF encrypted with @cantoo/pdf-lib.
 */
export async function makeEncryptedPdf(userPassword = 'secret', ownerPassword = 'owner') {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 4; i++) {
    const { width, height } = pageDimensionsFor(i, 50);
    const page = doc.addPage([width, height]);
    page.drawText(`Locked page ${i + 1}`, { x: 24, y: height - 48, size: 16, font });
  }
  await doc.encrypt({ userPassword, ownerPassword });
  return doc.save();
}

/**
 * 6-page PDF with 3 top-level /Outlines bookmarks pointing to pages 1, 3, and 5.
 */
export async function makeBookmarkedPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = [];
  for (let i = 0; i < 6; i++) {
    const { width, height } = pageDimensionsFor(i);
    const page = doc.addPage([width, height]);
    page.drawText(`Chapter page ${i + 1}`, { x: 24, y: height - 48, size: 16, font });
    pages.push(page);
  }

  const ctx = doc.context;
  const outlinesRef = ctx.nextRef();
  const itemSpecs = [
    { title: 'Chapter 1', pageIndex: 0, ref: ctx.nextRef() },
    { title: 'Chapter 2', pageIndex: 2, ref: ctx.nextRef() },
    { title: 'Chapter 3', pageIndex: 4, ref: ctx.nextRef() },
  ];

  for (let i = 0; i < itemSpecs.length; i++) {
    const spec = itemSpecs[i];
    const dict = ctx.obj({
      Title: PDFString.of(spec.title),
      Parent: outlinesRef,
      Dest: [pages[spec.pageIndex].ref, PDFName.of('Fit')],
    });
    if (i > 0) dict.set(PDFName.of('Prev'), itemSpecs[i - 1].ref);
    if (i + 1 < itemSpecs.length) dict.set(PDFName.of('Next'), itemSpecs[i + 1].ref);
    ctx.assign(spec.ref, dict);
  }

  const outlinesDict = ctx.obj({
    Type: 'Outlines',
    First: itemSpecs[0].ref,
    Last: itemSpecs[itemSpecs.length - 1].ref,
    Count: PDFNumber.of(itemSpecs.length),
  });
  ctx.assign(outlinesRef, outlinesDict);
  doc.catalog.set(PDFName.of('Outlines'), outlinesRef);

  return doc.save();
}

/**
 * 2-page PDF with large uncompressed content streams and an unreachable unused stream
 * so lossless compression is guaranteed to reduce file size.
 */
export async function makeCompressiblePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const repetitiveOps = new TextEncoder().encode('q 1 0 0 1 0 0 cm Q\n'.repeat(600));
  for (let i = 0; i < 2; i++) {
    const page = doc.addPage([420, 595]);
    page.drawText(`Compressible page ${i + 1}`, { x: 24, y: 540, size: 16, font });
    const extraStream = doc.context.stream(repetitiveOps);
    const extraRef = doc.context.register(extraStream);
    const existing = page.node.get(PDFName.of('Contents'));
    page.node.set(PDFName.of('Contents'), doc.context.obj(existing ? [existing, extraRef] : [extraRef]));
  }

  // Unreachable indirect stream (dropped by removeUnusedObjects).
  const junk = new TextEncoder().encode('UNUSED_STREAM_DATA_'.repeat(1200));
  doc.context.register(doc.context.stream(junk));

  return doc.save({ useObjectStreams: false });
}

/**
 * 1-page PDF containing 3 /Subtype /Form XObjects:
 *  - FmChart: non-zero /BBox [10, 20, 170, 140] (160x120 pt) with filled/stroked vector paths and text
 *  - FmScaled: /BBox [0, 0, 100, 60] with /Matrix [1.5, 0, 0, 2, 20, 10] (transformed 150x120 pt)
 *  - FmTiny: tiny 8x8 Form XObject skipped by default minSizePt = 16
 */
export async function makeVectorFormPdf({ userPassword, ownerPassword } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  await font.embed();
  const ctx = doc.context;

  // 1) Qualifying Form XObject with non-zero /BBox, vector paths (fill+stroke), and a text label.
  const chartOps = [
    '0.12 0.38 0.72 rg',
    '0.05 0.15 0.35 RG',
    '1.5 w',
    '20 30 140 90 re B',
    '0.85 0.25 0.20 RG',
    '2 w',
    '30 50 m 70 105 115 45 150 100 c S',
    'BT',
    '0 0 0 rg',
    '/F1 12 Tf',
    '36 124 Td',
    '(Vector Chart) Tj',
    'ET',
  ].join('\n');
  const chartForm = ctx.stream(new TextEncoder().encode(chartOps), {
    Type: 'XObject',
    Subtype: 'Form',
    FormType: 1,
    BBox: [10, 20, 170, 140],
    Resources: { Font: { F1: font.ref } },
  });
  const chartRef = ctx.register(chartForm);

  // 2) Qualifying Form XObject with /Matrix scaling + translation (100x60 -> 150x120).
  const scaledOps = [
    '0.15 0.62 0.38 rg',
    '0.08 0.30 0.18 RG',
    '1 w',
    '5 5 90 50 re B',
    '10 10 m 90 50 l 10 50 m 90 10 l S',
  ].join('\n');
  const scaledForm = ctx.stream(new TextEncoder().encode(scaledOps), {
    Type: 'XObject',
    Subtype: 'Form',
    FormType: 1,
    BBox: [0, 0, 100, 60],
    Matrix: [1.5, 0, 0, 2, 20, 10],
    Resources: {},
  });
  const scaledRef = ctx.register(scaledForm);

  // 3) Tiny 8x8 Form XObject (should be skipped when minSizePt = 16).
  const tinyOps = '0 0 0 rg 0 0 8 8 re f';
  const tinyForm = ctx.stream(new TextEncoder().encode(tinyOps), {
    Type: 'XObject',
    Subtype: 'Form',
    FormType: 1,
    BBox: [0, 0, 8, 8],
    Resources: {},
  });
  const tinyRef = ctx.register(tinyForm);

  const page = doc.addPage([595, 842]);
  page.drawText('Embedded Vector XObjects Fixture', { x: 40, y: 800, size: 14, font });

  const pageResources = page.node.lookup(PDFName.of('Resources'));
  pageResources.set(
    PDFName.of('XObject'),
    ctx.obj({
      FmChart: chartRef,
      FmScaled: scaledRef,
      FmTiny: tinyRef,
    }),
  );

  const drawFormsOps = [
    'q 1 0 0 1 50 560 cm /FmChart Do Q',
    'q 1 0 0 1 60 320 cm /FmScaled Do Q',
    'q 1 0 0 1 40 200 cm /FmTiny Do Q',
  ].join('\n');
  const drawRef = ctx.register(ctx.stream(new TextEncoder().encode(drawFormsOps)));
  const existing = page.node.get(PDFName.of('Contents'));
  const existingRefs = existing instanceof PDFArray ? existing.asArray() : existing ? [existing] : [];
  page.node.set(PDFName.of('Contents'), ctx.obj([...existingRefs, drawRef]));

  if (userPassword) {
    await doc.encrypt({ userPassword, ownerPassword: ownerPassword ?? 'owner' });
  }

  return doc.save();
}

/**
 * 1-page A4 (595x842) PDF with inline vector graphics:
 *  - Full-page white background fill + full-width header rule (ignored by auto-detect)
 *  - Top schematic-like cluster (x: 80..340, vpY: 132..272) with short labels
 *  - Wide prose paragraph between them (vpY: 352..402, must not merge into either figure)
 *  - Bottom plot-like axes + curve cluster (x: 90..350, vpY: 532..692) with short labels
 *  - Empty right-side region (x: 420..550, vpY: 540..700) for empty tighten & drag-a-box tests
 */
export async function makeInlineVectorPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  await font.embed();
  const ctx = doc.context;

  const page = doc.addPage([595, 842]);

  // Draw prose paragraph & short labels first via pdf-lib so font resources are attached cleanly.
  // Top figure short labels (PDF y = 570..710 => vpY = 132..272)
  page.drawText('Vin', { x: 86, y: 646, size: 10, font });
  page.drawText('R1', { x: 164, y: 668, size: 10, font });
  page.drawText('C1', { x: 244, y: 618, size: 10, font });
  page.drawText('Vout', { x: 306, y: 646, size: 10, font });

  // Wide prose paragraph in the middle (PDF y = 445..485 => vpY = 357..397)
  page.drawText(
    'This is a wide body prose paragraph describing the schematic diagram above and the measured response curve below in full detail.',
    { x: 40, y: 478, size: 9, font },
  );
  page.drawText(
    'Auto-detection should keep wide narrative text completely separate from both vector illustrations on the page without merging.',
    { x: 40, y: 462, size: 9, font },
  );

  // Bottom figure short labels (PDF y = 150..310 => vpY = 532..692)
  page.drawText('Gain (dB)', { x: 96, y: 294, size: 10, font });
  page.drawText('Freq (MHz)', { x: 210, y: 156, size: 10, font });

  // Vector operators: background fill, header rule, top schematic, bottom plot.
  const vecOps = [
    // Full-page white background fill (role: background)
    'q 1 1 1 rg 0 0 595 842 re f Q',
    // Full-width header separator rule (role: rule; width 535 > 50% of 595, lineWidth 1)
    'q 0.25 0.25 0.25 RG 1 w 30 790 m 565 790 l S Q',

    // Top figure: schematic-like blocks + wires (x: 84..336, pdfY: 576..704 => vpY: 138..266)
    'q 0.1 0.25 0.55 RG 0.92 0.96 1.0 rg 1.5 w',
    '84 624 44 40 re B',
    '152 624 48 40 re B',
    '228 604 44 60 re B',
    '296 624 40 40 re B',
    // Connecting wires and feedback loop
    '128 644 m 152 644 l S',
    '200 644 m 228 644 l S',
    '272 644 m 296 644 l S',
    '176 664 m 176 696 l 316 696 l 316 664 l S',
    '106 624 m 106 584 l 250 584 l 250 604 l S',
    'Q',

    // Bottom figure: plot axes + ticks + curve (x: 96..344, pdfY: 170..296 => vpY: 546..672)
    'q 0.15 0.15 0.15 RG 1.5 w',
    // Y-axis & X-axis
    '112 292 m 112 174 l 340 174 l S',
    // Tick marks along axes
    '106 214 m 112 214 l S',
    '106 254 m 112 254 l S',
    '170 168 m 170 174 l S',
    '230 168 m 230 174 l S',
    '290 168 m 290 174 l S',
    // Response curve
    '0.80 0.20 0.22 RG 2 w',
    '116 186 m 168 282 238 278 334 196 c S',
    // Secondary dashed trace
    '0.15 0.55 0.35 RG [4 3] 0 d 1.5 w',
    '116 202 m 180 232 l 248 248 l 334 222 l S',
    'Q',
  ].join('\n');

  const bgAndVecRef = ctx.register(ctx.stream(new TextEncoder().encode(vecOps)));
  const existing = page.node.get(PDFName.of('Contents'));
  const existingRefs = existing instanceof PDFArray ? existing.asArray() : existing ? [existing] : [];
  // Place background & vectors BEFORE text so white fill does not obscure labels.
  page.node.set(PDFName.of('Contents'), ctx.obj([bgAndVecRef, ...existingRefs]));

  return doc.save();
}

/**
 * 4-page bookmarked PDF with distinct searchable markers on different pages for Read PDF tests.
 */
export async function makeReaderPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  doc.setTitle('Reader Verification Manual');
  doc.setAuthor('PDF Harness');

  const pageSpecs = [
    { heading: 'ALPHA_HEADING', body: 'Introduction to client-side reading on page one.' },
    { heading: 'BETA_SECTION', body: 'Second page notes and reference overview.' },
    { heading: 'GAMMA_SECTION', body: 'Unique search target: QUANTUM_MARKER appears on page three.' },
    { heading: 'DELTA_APPENDIX', body: 'Final appendix page of the reader fixture.' },
  ];

  const pages = [];
  for (let i = 0; i < pageSpecs.length; i++) {
    const page = doc.addPage([500, 650]);
    page.drawText(pageSpecs[i].heading, { x: 40, y: 580, size: 20, font });
    page.drawText(pageSpecs[i].body, { x: 40, y: 530, size: 13, font });
    page.drawText(`Page ${i + 1} of ${pageSpecs.length}`, { x: 40, y: 40, size: 10, font });
    pages.push(page);
  }

  const ctx = doc.context;
  const outlinesRef = ctx.nextRef();
  const itemSpecs = [
    { title: 'Alpha Overview', pageIndex: 0, ref: ctx.nextRef() },
    { title: 'Gamma Quantum', pageIndex: 2, ref: ctx.nextRef() },
    { title: 'Delta Appendix', pageIndex: 3, ref: ctx.nextRef() },
  ];

  for (let i = 0; i < itemSpecs.length; i++) {
    const spec = itemSpecs[i];
    const dict = ctx.obj({
      Title: PDFString.of(spec.title),
      Parent: outlinesRef,
      Dest: [pages[spec.pageIndex].ref, PDFName.of('Fit')],
    });
    if (i > 0) dict.set(PDFName.of('Prev'), itemSpecs[i - 1].ref);
    if (i + 1 < itemSpecs.length) dict.set(PDFName.of('Next'), itemSpecs[i + 1].ref);
    ctx.assign(spec.ref, dict);
  }

  const outlinesDict = ctx.obj({
    Type: 'Outlines',
    First: itemSpecs[0].ref,
    Last: itemSpecs[itemSpecs.length - 1].ref,
    Count: PDFNumber.of(itemSpecs.length),
  });
  ctx.assign(outlinesRef, outlinesDict);
  doc.catalog.set(PDFName.of('Outlines'), outlinesRef);

  return doc.save();
}

/**
 * 2-page PDF with interactive AcroForm fields (TextField + CheckBox) and mixed annotations:
 *  - Page 1: 2 Widgets (fullName='Ada Lovelace', agreed=checked), 1 Highlight with /AP/N,
 *            1 Text sticky-note without /AP, 1 Link annotation
 *  - Page 2: 1 Square with offset /BBox + /Matrix /AP/N, 1 Text note without /AP
 */
export async function makeAnnotatedFormPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const ctx = doc.context;

  const p1 = doc.addPage([500, 650]);
  p1.drawText('Annotated Form Fixture', { x: 40, y: 600, size: 18, font });

  const p2 = doc.addPage([500, 650]);
  p2.drawText('Second Annotated Page', { x: 40, y: 600, size: 18, font });

  // Interactive AcroForm fields on page 1
  const form = doc.getForm();
  const nameField = form.createTextField('fullName');
  nameField.setText('Ada Lovelace');
  nameField.addToPage(p1, { x: 50, y: 520, width: 200, height: 24 });

  const agreeField = form.createCheckBox('agreed');
  agreeField.check();
  agreeField.addToPage(p1, { x: 50, y: 480, width: 18, height: 18 });

  form.updateFieldAppearances(font);

  // Page 1 Highlight annotation with /AP /N Form XObject
  const hlStream = ctx.stream(new TextEncoder().encode('q 1 0.95 0.2 rg 0 0 140 18 re f Q'), {
    Type: 'XObject',
    Subtype: 'Form',
    FormType: 1,
    BBox: [0, 0, 140, 18],
    Matrix: [1, 0, 0, 1, 0, 0],
    Resources: {},
  });
  const hlApRef = ctx.register(hlStream);
  const hlAnnot = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Highlight',
      Rect: [50, 420, 190, 438],
      Contents: PDFString.of('Highlighted passage'),
      AP: { N: hlApRef },
    }),
  );

  // Page 1 Text sticky-note annotation WITHOUT /AP
  const note1Annot = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [260, 420, 284, 444],
      Contents: PDFString.of('Review note without appearance'),
    }),
  );

  // Page 1 Link annotation
  const linkAnnot = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [50, 360, 180, 380],
      A: { S: 'URI', URI: PDFString.of('https://example.com') },
    }),
  );

  p1.node.addAnnot(hlAnnot);
  p1.node.addAnnot(note1Annot);
  p1.node.addAnnot(linkAnnot);

  // Page 2 Square annotation with non-zero /BBox and translating /Matrix
  const sqStream = ctx.stream(new TextEncoder().encode('q 0.9 0.2 0.2 RG 2 w 12 12 96 46 re S Q'), {
    Type: 'XObject',
    Subtype: 'Form',
    FormType: 1,
    BBox: [10, 10, 110, 60],
    Matrix: [1, 0, 0, 1, -10, -10],
    Resources: {},
  });
  const sqApRef = ctx.register(sqStream);
  const sqAnnot = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Square',
      Rect: [60, 400, 160, 450],
      AP: { N: sqApRef },
    }),
  );

  // Page 2 Text sticky-note WITHOUT /AP
  const note2Annot = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [200, 400, 224, 424],
      Contents: PDFString.of('Second note'),
    }),
  );

  p2.node.addAnnot(sqAnnot);
  p2.node.addAnnot(note2Annot);

  return doc.save();
}
