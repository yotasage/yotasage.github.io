// Character set helpers for byte mode and Kanji mode.

export type Charset = 'utf-8' | 'iso-8859-1' | 'shift_jis';

// ECI assignment numbers (AIM ECI specification) for the supported character sets.
export const CHARSET_ECI: Record<Charset, number> = {
  'iso-8859-1': 3,
  'shift_jis': 20,
  'utf-8': 26,
};

export const CHARSET_LABELS: Record<Charset, string> = {
  'utf-8': 'UTF-8',
  'iso-8859-1': 'ISO-8859-1 (Latin-1)',
  'shift_jis': 'Shift JIS',
};

let sjisMap: Map<string, number> | null = null;

// Builds a Unicode -> Shift JIS map by running every Shift JIS code through the browser's decoder.
// Single byte codes are stored as 0x00-0xFF, double byte codes as 0x8140-0xFCFC.
function shiftJisMap(): Map<string, number> {
  if (sjisMap) return sjisMap;

  const map = new Map<string, number>();
  const decoder = new TextDecoder('shift_jis', { fatal: false });
  const add = (code: number, bytes: Uint8Array) => {
    const s = decoder.decode(bytes);
    if (s.length === 0 || s.includes('�') || [...s].length !== 1) return;
    if (!map.has(s)) map.set(s, code);
  };

  for (let b = 0; b < 0x80; b++) add(b, Uint8Array.of(b));
  for (let b = 0xa1; b <= 0xdf; b++) add(b, Uint8Array.of(b));

  // NEC selected IBM extensions (lead bytes 0xED, 0xEE) duplicate the IBM extensions at 0xFA-0xFC,
  // so they are visited last to make the IBM codes win.
  const leads: number[] = [];
  for (let l = 0x81; l <= 0x9f; l++) leads.push(l);
  for (let l = 0xe0; l <= 0xfc; l++) if (l !== 0xed && l !== 0xee) leads.push(l);
  leads.push(0xed, 0xee);
  for (const lead of leads) {
    for (let trail = 0x40; trail <= 0xfc; trail++) {
      if (trail === 0x7f) continue;
      add((lead << 8) | trail, Uint8Array.of(lead, trail));
    }
  }

  sjisMap = map;
  return map;
}

// Encodes a single character (one code point). Returns null when the charset cannot represent it.
export function encodeChar(ch: string, charset: Charset): number[] | null {
  if (charset === 'utf-8') return Array.from(new TextEncoder().encode(ch));
  if (charset === 'iso-8859-1') {
    const cp = ch.codePointAt(0);
    return cp <= 0xff ? [cp] : null;
  }
  const code = shiftJisMap().get(ch);
  if (code === undefined) return null;
  return code > 0xff ? [code >> 8, code & 0xff] : [code];
}

// Returns the 13 bit Kanji mode value of a character, or -1 when it cannot be encoded in Kanji mode.
export function kanjiValue(ch: string): number {
  const cp = ch.codePointAt(0);
  if (cp < 0x80) return -1;
  const code = shiftJisMap().get(ch);
  if (code === undefined || code < 0x100) return -1;
  let v: number;
  if (code >= 0x8140 && code <= 0x9ffc) v = code - 0x8140;
  else if (code >= 0xe040 && code <= 0xebbf) v = code - 0xc140;
  else return -1;
  return (v >> 8) * 0xc0 + (v & 0xff);
}

export function encodeString(text: string, charset: Charset): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const bytes = encodeChar(ch, charset);
    if (!bytes) throw new Error(`The character "${ch}" cannot be represented in ${CHARSET_LABELS[charset]}.`);
    out.push(...bytes);
  }
  return Uint8Array.from(out);
}
