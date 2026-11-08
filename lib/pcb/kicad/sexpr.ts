// A fast reader for KiCad's S-expression files (.kicad_pcb, .kicad_mod). A list becomes an array whose first element
// is usually its head symbol ("footprint", "at"…); atoms stay strings, except in lists that only ever hold
// coordinates and sizes (xy, start, end, at…), whose numbers are read as numbers, which saves most of the work on
// large boards. Lists the viewer never needs (uuid, tstamp, 3D models, embedded files) are skipped without being
// built. A board is read one top-level item at a time (`next`), so the caller can pause between items, show progress
// and let each item's tree go before the next one is built.

export type SExpr = string | number | SExpr[];

const OPEN = 40;
const CLOSE = 41;
const QUOTE = 34;
const BACKSLASH = 92;
const SPACE = 32;
const MINUS = 45;
const PLUS = 43;
const DOT = 46;
const D0 = 48;
const D9 = 57;
const LOWER_E = 101;
const UPPER_E = 69;

// Lists that are not read at all.
const SKIPPED = new Set(['uuid', 'tstamp', 'tedit', 'model', 'embedded_files', 'image', 'generated', 'teardrops', 'path']);

// Lists whose numeric atoms are read as numbers.
const NUMERIC = new Set(['xy', 'start', 'mid', 'end', 'center', 'at', 'size', 'width', 'thickness', 'offset', 'rect_delta', 'xyz', 'radius']);

// Interned symbols: the same short symbol appears millions of times in a large board ("fp_line", "layer", "F.SilkS").
const INTERN_BITS = 12;
const INTERN_MAX_LEN = 32;

function isSpace(c: number): boolean {
  return c === SPACE || (c >= 9 && c <= 13);
}

function isDelimiter(c: number): boolean {
  return c === OPEN || c === CLOSE || c === QUOTE || isSpace(c);
}

export class SexprError extends Error {}

export class SexprReader {
  readonly text: string;
  pos = 0;
  // How many lists of each skipped kind were passed over (images, for a note).
  readonly skipped = new Map<string, number>();
  private interned: (string | undefined)[] = new Array(1 << INTERN_BITS);
  // Depth of the root list once it is open (1), so `next` knows when it ends.
  private rootOpen = false;

  constructor(text: string) {
    this.text = text;
    // A byte order mark.
    if (text.charCodeAt(0) === 0xfeff) this.pos = 1;
  }

  get length(): number {
    return this.text.length;
  }

  private skipSpace() {
    const s = this.text;
    let i = this.pos;
    const n = s.length;
    while (i < n && isSpace(s.charCodeAt(i))) i += 1;
    this.pos = i;
  }

  private fail(message: string): never {
    // The line of the error, to help someone looking at the file.
    let line = 1;
    for (let i = 0; i < this.pos && i < this.text.length; i += 1) if (this.text.charCodeAt(i) === 10) line += 1;
    throw new SexprError(`${message} (line ${line})`);
  }

  // A quoted string, with KiCad's escapes (\" \\ \n \r \t).
  private quoted(): string {
    const s = this.text;
    let i = this.pos + 1;
    const start = i;
    const n = s.length;
    while (i < n) {
      const c = s.charCodeAt(i);
      if (c === QUOTE) {
        this.pos = i + 1;
        return s.slice(start, i);
      }
      if (c === BACKSLASH) break;
      i += 1;
    }
    // With escapes.
    let out = s.slice(start, i);
    while (i < n) {
      const c = s.charCodeAt(i);
      if (c === QUOTE) {
        this.pos = i + 1;
        return out;
      }
      if (c === BACKSLASH && i + 1 < n) {
        const e = s[i + 1];
        out += e === 'n' ? '\n' : e === 'r' ? '\r' : e === 't' ? '\t' : e;
        i += 2;
        continue;
      }
      out += s[i];
      i += 1;
    }
    this.pos = n;
    return this.fail('A quoted string does not end');
  }

  // An unquoted atom, interned when short.
  private symbol(): string {
    const s = this.text;
    const start = this.pos;
    let i = start;
    const n = s.length;
    let h = 0;
    while (i < n) {
      const c = s.charCodeAt(i);
      if (isDelimiter(c)) break;
      h = (h * 31 + c) | 0;
      i += 1;
    }
    this.pos = i;
    const len = i - start;
    if (len > INTERN_MAX_LEN) return s.slice(start, i);
    const slot = (h ^ (h >>> INTERN_BITS) ^ len) & ((1 << INTERN_BITS) - 1);
    const known = this.interned[slot];
    if (known !== undefined && known.length === len) {
      let same = true;
      for (let k = 0; k < len; k += 1) {
        if (known.charCodeAt(k) !== s.charCodeAt(start + k)) {
          same = false;
          break;
        }
      }
      if (same) return known;
    }
    const str = s.slice(start, i);
    this.interned[slot] = str;
    return str;
  }

  // A number, read in place (without making a string first); NaN if the atom is not a plain number.
  private number(): number {
    const s = this.text;
    let i = this.pos;
    const n = s.length;
    let neg = false;
    let c = s.charCodeAt(i);
    if (c === MINUS || c === PLUS) {
      neg = c === MINUS;
      i += 1;
      c = s.charCodeAt(i);
    }
    let value = 0;
    let digits = 0;
    while (c >= D0 && c <= D9) {
      value = value * 10 + (c - D0);
      digits += 1;
      i += 1;
      c = s.charCodeAt(i);
    }
    if (c === DOT) {
      i += 1;
      c = s.charCodeAt(i);
      let scale = 1;
      let frac = 0;
      while (c >= D0 && c <= D9) {
        // Up to 15 decimals exactly; KiCad writes at most 6 (nanometres).
        if (scale < 1e15) {
          frac = frac * 10 + (c - D0);
          scale *= 10;
        }
        digits += 1;
        i += 1;
        c = s.charCodeAt(i);
      }
      value += frac / scale;
    }
    if (c === LOWER_E || c === UPPER_E || !digits || (i < n && !isDelimiter(c))) {
      // Exponents and anything unusual: let the standard conversion decide.
      const start = this.pos;
      while (i < n && !isDelimiter(s.charCodeAt(i))) i += 1;
      this.pos = i;
      const text = s.slice(start, i);
      const v = Number(text);
      return Number.isFinite(v) ? v : NaN;
    }
    this.pos = i;
    return neg ? -value : value;
  }

  // Skips the rest of a list whose opening parenthesis has been read.
  private skipList() {
    const s = this.text;
    let i = this.pos;
    const n = s.length;
    let depth = 1;
    while (i < n) {
      const c = s.charCodeAt(i);
      if (c === OPEN) depth += 1;
      else if (c === CLOSE) {
        depth -= 1;
        if (depth === 0) {
          this.pos = i + 1;
          return;
        }
      } else if (c === QUOTE) {
        i += 1;
        while (i < n) {
          const q = s.charCodeAt(i);
          if (q === BACKSLASH) i += 2;
          else if (q === QUOTE) break;
          else i += 1;
        }
      }
      i += 1;
    }
    this.pos = n;
    this.fail('A list does not end');
  }

  // The rest of a list whose opening parenthesis has been read; null if it is skipped.
  private list(): SExpr[] | null {
    this.skipSpace();
    const s = this.text;
    const out: SExpr[] = [];
    let numeric = false;
    if (this.pos < s.length) {
      const c = s.charCodeAt(this.pos);
      if (c !== OPEN && c !== CLOSE && c !== QUOTE) {
        const head = this.symbol();
        if (SKIPPED.has(head)) {
          this.skipped.set(head, (this.skipped.get(head) ?? 0) + 1);
          this.skipList();
          return null;
        }
        numeric = NUMERIC.has(head);
        out.push(head);
      }
    }
    for (;;) {
      this.skipSpace();
      if (this.pos >= s.length) this.fail('A list does not end');
      const c = s.charCodeAt(this.pos);
      if (c === CLOSE) {
        this.pos += 1;
        return out;
      }
      if (c === OPEN) {
        this.pos += 1;
        const child = this.list();
        if (child) out.push(child);
      } else if (c === QUOTE) {
        out.push(this.quoted());
      } else if (numeric && (c === MINUS || c === PLUS || c === DOT || (c >= D0 && c <= D9))) {
        const start = this.pos;
        const v = this.number();
        out.push(Number.isNaN(v) ? s.slice(start, this.pos) : v);
      } else {
        out.push(this.symbol());
      }
    }
  }

  // Reads a whole expression (a file that is one list, as a footprint).
  readAll(): SExpr[] {
    this.skipSpace();
    if (this.text.charCodeAt(this.pos) !== OPEN) this.fail('The file does not start with "("');
    this.pos += 1;
    return this.list() ?? [];
  }

  // Opens the root list and returns its head symbol ("kicad_pcb").
  openRoot(): string {
    this.skipSpace();
    if (this.text.charCodeAt(this.pos) !== OPEN) this.fail('The file does not start with "("');
    this.pos += 1;
    this.skipSpace();
    this.rootOpen = true;
    return this.symbol();
  }

  // The next item of the root list (a list or an atom), or undefined at its end. Skipped lists are passed over.
  next(): SExpr | undefined {
    if (!this.rootOpen) return undefined;
    for (;;) {
      this.skipSpace();
      if (this.pos >= this.text.length) {
        this.rootOpen = false;
        return undefined;
      }
      const c = this.text.charCodeAt(this.pos);
      if (c === CLOSE) {
        this.pos += 1;
        this.rootOpen = false;
        return undefined;
      }
      if (c === OPEN) {
        this.pos += 1;
        const l = this.list();
        if (l) return l;
        continue;
      }
      return c === QUOTE ? this.quoted() : this.symbol();
    }
  }
}

// --- Helpers for reading the trees ---

export function isList(e: SExpr | undefined): e is SExpr[] {
  return Array.isArray(e);
}

export function head(e: SExpr | undefined): string | undefined {
  return Array.isArray(e) && typeof e[0] === 'string' ? e[0] : undefined;
}

// The first child list with this head.
export function child(e: SExpr[] | undefined, name: string): SExpr[] | undefined {
  if (!e) return undefined;
  for (let i = 1; i < e.length; i += 1) {
    const c = e[i];
    if (Array.isArray(c) && c[0] === name) return c;
  }
  return undefined;
}

// Every child list with this head.
export function children(e: SExpr[] | undefined, name: string): SExpr[][] {
  const out: SExpr[][] = [];
  if (!e) return out;
  for (let i = 1; i < e.length; i += 1) {
    const c = e[i];
    if (Array.isArray(c) && c[0] === name) out.push(c);
  }
  return out;
}

export function num(e: SExpr | undefined, fallback = NaN): number {
  if (typeof e === 'number') return e;
  if (typeof e === 'string') {
    const v = Number(e);
    return Number.isFinite(v) ? v : fallback;
  }
  return fallback;
}

export function str(e: SExpr | undefined): string | undefined {
  if (typeof e === 'string') return e;
  if (typeof e === 'number') return String(e);
  return undefined;
}

// Whether a list holds this symbol as an atom (flags such as `hide`, `locked`, `bold`).
export function hasAtom(e: SExpr[] | undefined, name: string): boolean {
  if (!e) return false;
  for (let i = 1; i < e.length; i += 1) if (e[i] === name) return true;
  return false;
}

// A yes/no value as KiCad writes it in different versions: `(hide yes)`, `(hide)`, or the bare atom `hide`.
export function flag(e: SExpr[] | undefined, name: string): boolean {
  if (!e) return false;
  for (let i = 1; i < e.length; i += 1) {
    const c = e[i];
    if (c === name) return true;
    if (Array.isArray(c) && c[0] === name) return c.length < 2 || c[1] === 'yes' || c[1] === 'true';
  }
  return false;
}
