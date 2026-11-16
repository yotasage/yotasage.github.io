// The shared equation engine (moved from lib/smith/equations.ts in EM step M2.4b; used by the Smith chart's registry
// lib/smith/equations.ts and the EM simulation's lib/emsim/equations.ts). Each equation is written as short text,
// parsed into a tree, printed as TeX for KaTeX by one printer (tex.ts) and computed on complex numbers by one
// evaluator (compile.ts). This module does not import KaTeX; a page renders the TeX through KatexSpan.
//
// Grammar: numbers (`2`, `0.5`, `1e-9`), names (`x`, `Z_0`, `Gamma_r`, `Z_in`; Greek letters by name; `j` the
// imaginary unit and `pi` constants), `+ - * / ^`, unary minus binding like a product (`-2*x/y` is −(2x/y)), calls of
// the functions in FUNCTIONS, matrices `[a, b; c, d]` and `=` chains at the top. Division is left-associative and `^`
// right-associative. A bracket the text writes around a sum or difference is kept in the tree (a `group`), so a
// derivation step shows the grouping it is about; brackets around anything else are dropped.


// ---------------------------------------------------------------------------------------------------------------
// Trees

export type Node =
  | { t: 'num'; v: number; s: string }
  | { t: 'id'; v: string }
  | { t: 'group'; a: Node }
  | { t: 'neg'; a: Node }
  | { t: 'op'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { t: 'call'; f: string; a: Node }
  | { t: 'mat'; rows: number; cols: number; xs: Node[] }
  | { t: 'eq'; xs: Node[] };

/** The functions a call may name. */
export const FUNCTIONS: ReadonlySet<string> = new Set([
  'abs', 'sqrt', 'exp', 'conj', 'ln', 'log10', 'sin', 'cos', 'tan', 'cot', 'arctan', 'arccos', 'Re', 'Im', 'arg',
]);

/** Names that are constants, never variables. */
export const CONSTANTS: ReadonlySet<string> = new Set(['j', 'pi']);

const BIN: Readonly<Record<string, number>> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };

interface Token { k: string; v: string }

const isDigit = (c: number): boolean => c >= 48 && c <= 57;
const isAlpha = (c: number): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);

function tokenize(s: string): Token[] {
  const out: Token[] = [];
  const n = s.length;
  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 32) { i++; continue; }
    if (isDigit(c)) {
      let k = i + 1;
      while (k < n && isDigit(s.charCodeAt(k))) k++;
      if (s[k] === '.' && isDigit(s.charCodeAt(k + 1))) { k += 2; while (k < n && isDigit(s.charCodeAt(k))) k++; }
      if (s[k] === 'e') {
        const sign = s[k + 1] === '-' || s[k + 1] === '+' ? 1 : 0;
        if (isDigit(s.charCodeAt(k + 1 + sign))) { k += 2 + sign; while (k < n && isDigit(s.charCodeAt(k))) k++; }
      }
      out.push({ k: 'num', v: s.slice(i, k) });
      i = k;
    } else if (isAlpha(c)) {
      let k = i + 1;
      while (k < n && (isAlpha(s.charCodeAt(k)) || isDigit(s.charCodeAt(k)))) k++;
      if (s[k] === '_') {
        const start = ++k;
        while (k < n && (isAlpha(s.charCodeAt(k)) || isDigit(s.charCodeAt(k)))) k++;
        if (k === start) throw new Error(`empty subscript at ${start} in "${s}"`);
      }
      out.push({ k: 'id', v: s.slice(i, k) });
      i = k;
    } else if ('+-*/^()[],;='.includes(s[i])) {
      out.push({ k: s[i], v: s[i] });
      i++;
    } else throw new Error(`unexpected "${s[i]}" at ${i} in "${s}"`);
  }
  return out;
}

/** Parses equation text into a tree (an `eq` node for an `=` chain). Throws on an error, naming the place. */
export function parse(text: string): Node {
  const ts = tokenize(text);
  let p = 0;
  const peek = (): string => (p < ts.length ? ts[p].k : '');
  const fail = (what: string): never => { throw new Error(`${what} at token ${p} of "${text}"`); };
  const expect = (k: string): void => { if (peek() !== k) fail(`expected "${k}"`); p++; };

  function prim(): Node {
    if (p >= ts.length) fail('unexpected end');
    const t = ts[p++];
    switch (t.k) {
      case 'num': return { t: 'num', v: Number(t.v), s: t.v };
      case 'id':
        if (peek() === '(') {
          if (!FUNCTIONS.has(t.v)) fail(`unknown function "${t.v}"`);
          p++;
          const a = expr(0);
          expect(')');
          return { t: 'call', f: t.v, a };
        }
        return { t: 'id', v: t.v };
      case '(': {
        const a = expr(0);
        expect(')');
        return a.t === 'op' && (a.op === '+' || a.op === '-') ? { t: 'group', a } : a;
      }
      case '-': return { t: 'neg', a: expr(2) };
      case '[': {
        const xs: Node[] = [];
        let cols = 0, col = 0, rows = 1;
        for (;;) {
          xs.push(expr(0));
          col++;
          const k = peek();
          p++;
          if (k === ',') continue;
          if (cols === 0) cols = col; else if (col !== cols) fail('rows of different length');
          col = 0;
          if (k === ';') { rows++; continue; }
          if (k === ']') break;
          p--;
          fail('expected "," ";" or "]"');
        }
        return { t: 'mat', rows, cols, xs };
      }
    }
    return fail(`unexpected "${t.v}"`);
  }

  function expr(min: number): Node {
    let a = prim();
    for (;;) {
      const op = peek(), pr = BIN[op];
      if (!pr || pr < min) return a;
      p++;
      const b = expr(op === '^' ? pr : pr + 1);
      a = { t: 'op', op: op as '+' | '-' | '*' | '/' | '^', a, b };
    }
  }

  const xs = [expr(0)];
  while (peek() === '=') { p++; xs.push(expr(0)); }
  if (p !== ts.length) fail('trailing input');
  return xs.length > 1 ? { t: 'eq', xs } : xs[0];
}

/** Binding strength in the text: sums 1, products 2, negation 3, powers 4, atoms 5, an `=` chain 0. */
function prec(n: Node): number {
  switch (n.t) {
    case 'op': return BIN[n.op];
    case 'neg': return 3;
    case 'eq': return 0;
    default: return 5;
  }
}

/** Prints a tree back as equation text with the fewest brackets that parse to the same tree. */
export function toText(n: Node): string {
  switch (n.t) {
    case 'num': return n.s;
    case 'id': return n.v;
    case 'group': return `(${toText(n.a)})`;
    case 'call': return `${n.f}(${toText(n.a)})`;
    case 'eq': return n.xs.map(toText).join(' = ');
    case 'mat': {
      const rows: string[] = [];
      for (let r = 0; r < n.rows; r++) rows.push(n.xs.slice(r * n.cols, (r + 1) * n.cols).map(toText).join(', '));
      return `[${rows.join('; ')}]`;
    }
    case 'neg': {
      const a = toText(n.a);
      return n.a.t === 'neg' || prec(n.a) <= 1 ? `-(${a})` : `-${a}`;
    }
    case 'op': {
      const pr = BIN[n.op];
      const pa = prec(n.a), pb = prec(n.b);
      let a = toText(n.a), b = toText(n.b);
      if (pa < pr || (n.a.t === 'neg' && pr > 1) || (n.op === '^' && pa <= 4)) a = `(${a})`;
      if (n.b.t === 'neg' || (n.op === '^' ? pb < 4 : pb <= pr)) b = `(${b})`;
      return pr === 1 ? `${a} ${n.op} ${b}` : `${a}${n.op}${b}`;
    }
  }
}

/** The free variable names of a tree (constants left out), added to `into` in order of first use. */
export function variablesOf(n: Node, into: string[] = []): string[] {
  switch (n.t) {
    case 'id': if (!CONSTANTS.has(n.v) && !into.includes(n.v)) into.push(n.v); break;
    case 'group': case 'neg': case 'call': variablesOf(n.a, into); break;
    case 'op': variablesOf(n.a, into); variablesOf(n.b, into); break;
    case 'mat': case 'eq': for (const x of n.xs) variablesOf(x, into); break;
  }
  return into;
}
