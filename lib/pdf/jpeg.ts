// Reads and removes the metadata segments of JPEG files (as stored in DCTDecode image streams) without touching the
// compressed image data.

interface Segment {
  marker: number;
  start: number;
  end: number;
}

interface JpegLayout {
  segments: Segment[];
  // Offset of the first start-of-scan marker, where the image data begins.
  scanStart: number;
  // Offset just after the end-of-image marker; anything after it (previews, multi-picture data) is not the image.
  imageEnd: number;
}

function layout(b: Uint8Array): JpegLayout | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  const segments: Segment[] = [];
  let pos = 2;
  for (;;) {
    while (b[pos] === 0xff && b[pos + 1] === 0xff) pos++;
    if (pos + 4 > b.length || b[pos] !== 0xff) return null;
    const marker = b[pos + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const standalone = marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
    const end = standalone ? pos + 2 : pos + 2 + ((b[pos + 2] << 8) | b[pos + 3]);
    if (end > b.length) return null;
    segments.push({ marker, start: pos, end });
    pos = end;
  }
  const scanStart = pos;
  // Inside the scan data 0xFF is always followed by 0x00, a restart marker or another marker between scans.
  let imageEnd = b.length;
  for (let i = scanStart; i + 1 < b.length; i++) {
    if (b[i] === 0xff && b[i + 1] === 0xd9) {
      imageEnd = i + 2;
      break;
    }
  }
  return { segments, scanStart, imageEnd };
}

function startsWith(b: Uint8Array, offset: number, ascii: string): boolean {
  for (let i = 0; i < ascii.length; i++) if (b[offset + i] !== ascii.charCodeAt(i)) return false;
  return true;
}

type Kind = 'EXIF' | 'XMP' | 'IPTC' | 'comment' | 'app data' | null;

// What a segment holds, or null for the segments that are needed to display the image.
function kindOf(b: Uint8Array, s: Segment): Kind {
  const data = s.start + 4;
  if (s.marker === 0xfe) return 'comment';
  if (s.marker < 0xe0 || s.marker > 0xef) return null;
  if (s.marker === 0xe0) return startsWith(b, data, 'JFIF\0') ? null : 'app data';
  if (s.marker === 0xe2 && startsWith(b, data, 'ICC_PROFILE\0')) return null;
  // Adobe segment: says how to convert the colours.
  if (s.marker === 0xee) return null;
  if (s.marker === 0xe1 && startsWith(b, data, 'Exif\0')) return 'EXIF';
  if (s.marker === 0xe1 && startsWith(b, data, 'http://ns.adobe.com/')) return 'XMP';
  if (s.marker === 0xed) return 'IPTC';
  return 'app data';
}

const TIFF_TAGS: Record<number, string> = {
  0x010f: 'Camera make',
  0x0110: 'Camera model',
  0x0131: 'Software',
  0x0132: 'Date',
  0x013b: 'Artist',
  0x8298: 'Copyright',
  0x9003: 'Date taken',
  0xa430: 'Camera owner',
  0xa431: 'Camera serial number',
  0xa434: 'Lens',
};

// The identifying fields of an EXIF block that starts at `tiff` (the byte order mark).
function readExif(b: Uint8Array, tiff: number): string[] {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (o: number) => view.getUint16(tiff + o, little);
  const u32 = (o: number) => view.getUint32(tiff + o, little);
  const out: string[] = [];
  const gps: Record<number, number[] | string> = {};

  function ascii(entry: number) {
    const count = u32(entry + 4);
    const at = count > 4 ? u32(entry + 8) : entry + 8;
    let s = '';
    for (let i = 0; i < count && tiff + at + i < b.length; i++) {
      const c = b[tiff + at + i];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  }

  function ifd(offset: number, gpsIfd: boolean) {
    if (offset <= 0 || tiff + offset + 2 > b.length) return;
    const count = u16(offset);
    for (let i = 0; i < count; i++) {
      const e = offset + 2 + i * 12;
      if (tiff + e + 12 > b.length) return;
      const tag = u16(e);
      const type = u16(e + 2);
      if (gpsIfd) {
        if (type === 2) gps[tag] = ascii(e);
        else if (type === 5) {
          const at = u32(e + 8);
          gps[tag] = [0, 1, 2].map((k) => u32(at + k * 8) / (u32(at + k * 8 + 4) || 1));
        }
      } else if (tag === 0x8769) ifd(u32(e + 8), false);
      else if (tag === 0x8825) ifd(u32(e + 8), true);
      else if (TIFF_TAGS[tag] && type === 2) {
        const value = ascii(e);
        if (value) out.push(`${TIFF_TAGS[tag]}: ${value}`);
      }
    }
  }

  try {
    ifd(u32(4), false);
  } catch {
    // Truncated EXIF: keep what was read.
  }
  const lat = gps[2];
  const lon = gps[4];
  if (Array.isArray(lat) && Array.isArray(lon)) {
    const deg = (v: number[]) => v[0] + v[1] / 60 + v[2] / 3600;
    out.push(`GPS position: ${deg(lat).toFixed(5)}° ${gps[1] || 'N'}, ${deg(lon).toFixed(5)}° ${gps[3] || 'E'}`);
  } else if (Object.keys(gps).length) {
    out.push('GPS data');
  }
  return out;
}

export interface JpegMetadata {
  kinds: string[];
  fields: string[];
}

export function jpegMetadata(b: Uint8Array): JpegMetadata | null {
  const l = layout(b);
  if (!l) return null;
  const kinds = new Set<string>();
  const fields: string[] = [];
  for (const s of l.segments) {
    const kind = kindOf(b, s);
    if (!kind) continue;
    kinds.add(kind);
    if (kind === 'EXIF') fields.push(...readExif(b, s.start + 10));
  }
  if (l.imageEnd < b.length - 2) kinds.add('extra data after the image');
  return kinds.size ? { kinds: [...kinds], fields } : null;
}

// The JPEG without metadata segments and trailing data, or null when there is nothing to remove.
export function stripJpegMetadata(b: Uint8Array): Uint8Array | null {
  const l = layout(b);
  if (!l) return null;
  const keep = l.segments.filter((s) => !kindOf(b, s));
  if (keep.length === l.segments.length && l.imageEnd >= b.length - 2) return null;
  const parts = [b.subarray(0, 2), ...keep.map((s) => b.subarray(s.start, s.end)), b.subarray(l.scanStart, l.imageEnd)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
