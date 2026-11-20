// Synthetic PDF, PNG, and JPEG fixtures generated in memory with @cantoo/pdf-lib and fflate.
import { degrees, PDFDocument, PDFName, PDFNumber, PDFString, StandardFonts } from '@cantoo/pdf-lib';
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
