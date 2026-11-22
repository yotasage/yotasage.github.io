// Tokenizer and recursive-descent parser for the Smart Calculator engine.
// Supports units, SI/SPICE prefixes, implicit multiplication, `in`/`to`/`as`/`->`
// conversions, phasor `∠`/`angle`, parallel `||`, assignments, and `d/dx(...)`.
// Framework-free; zero external dependencies; no node:* imports.

import {
  assignNode,
  attachNode,
  binaryNode,
  callNode,
  convertNode,
  type Expr,
  identNode,
  numNode,
  unaryNode,
} from './ast';
import { lookupConstant } from './constants';
import { dimScale, lookupBarePrefix, parseUnitExpr, parseUnitToken, type UnitSpec } from './units';
import { CalcError } from './value';

type TokKind = 'num' | 'id' | 'op' | '(' | ')' | ',' | 'arrow' | 'angle' | 'par' | 'eof';

interface Token {
  kind: TokKind;
  text: string;
  pos: number;
  end: number;
  /** True when immediately preceded by whitespace. */
  spaced: boolean;
}

const SUP_MAP: Readonly<Record<string, string>> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-',
};

function expandSuperscripts(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length;) {
    if (SUP_MAP[raw[i]] !== undefined) {
      out += '^';
      let exp = '';
      while (i < raw.length && SUP_MAP[raw[i]] !== undefined) exp += SUP_MAP[raw[i++]];
      out += exp.startsWith('-') ? `(${exp})` : exp;
    } else {
      out += raw[i++];
    }
  }
  return out;
}

function isIdStart(ch: string): boolean {
  return /[A-Za-z_°ΩΩµμπτλθφωΔεηħ%]/.test(ch);
}

function isIdContinue(ch: string): boolean {
  return /[A-Za-z0-9_°ΩΩµμπτλθφωΔεηħ%]/.test(ch);
}

function tokenize(source: string): Token[] {
  const s = expandSuperscripts(source)
    .replace(/[×·⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/∥/g, '||');

  const out: Token[] = [];
  let i = 0;
  const n = s.length;

  while (i < n) {
    let spaced = false;
    while (i < n && /\s/.test(s[i])) {
      spaced = true;
      i++;
    }
    if (i >= n) break;

    const start = i;
    const ch = s[i];

    // Arrows: -> or →
    if ((ch === '-' && s[i + 1] === '>') || ch === '→') {
      i += ch === '→' ? 1 : 2;
      out.push({ kind: 'arrow', text: s.slice(start, i), pos: start, end: i, spaced });
      continue;
    }

    // Parallel: ||
    if (ch === '|' && s[i + 1] === '|') {
      i += 2;
      out.push({ kind: 'par', text: '||', pos: start, end: i, spaced });
      continue;
    }

    // Phasor angle symbol: ∠
    if (ch === '∠') {
      i++;
      out.push({ kind: 'angle', text: '∠', pos: start, end: i, spaced });
      continue;
    }

    // Power **
    if (ch === '*' && s[i + 1] === '*') {
      i += 2;
      out.push({ kind: 'op', text: '^', pos: start, end: i, spaced });
      continue;
    }

    if (ch === '(' || ch === ')') {
      i++;
      out.push({ kind: ch, text: ch, pos: start, end: i, spaced });
      continue;
    }
    if (ch === ',') {
      i++;
      out.push({ kind: ',', text: ',', pos: start, end: i, spaced });
      continue;
    }
    if ('+-*/^='.includes(ch)) {
      i++;
      out.push({ kind: 'op', text: ch, pos: start, end: i, spaced });
      continue;
    }

    // Number literal (integer, decimal, or scientific notation e.g. 1.5e-6)
    if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < n && /[0-9]/.test(s[i + 1]))) {
      while (i < n && /[0-9_]/.test(s[i])) i++;
      if (i < n && s[i] === '.' && (i + 1 >= n || s[i + 1] !== '.')) {
        i++;
        while (i < n && /[0-9_]/.test(s[i])) i++;
      }
      // Scientific exponent only when followed by digits or +/- digits
      if (i < n && (s[i] === 'e' || s[i] === 'E')) {
        const expStart = i;
        let j = i + 1;
        if (j < n && (s[j] === '+' || s[j] === '-')) j++;
        if (j < n && /[0-9]/.test(s[j])) {
          while (j < n && /[0-9]/.test(s[j])) j++;
          i = j;
        } else {
          i = expStart;
        }
      }
      out.push({ kind: 'num', text: s.slice(start, i).replace(/_/g, ''), pos: start, end: i, spaced });
      continue;
    }

    // Degree-temperature units `°C`, `°F` or standalone `°` / `%`
    if (ch === '°') {
      if (s[i + 1] === 'C' || s[i + 1] === 'F') {
        i += 2;
      } else {
        i++;
      }
      out.push({ kind: 'id', text: s.slice(start, i), pos: start, end: i, spaced });
      continue;
    }
    if (ch === '%') {
      i++;
      out.push({ kind: 'id', text: '%', pos: start, end: i, spaced });
      continue;
    }

    // Identifiers & unit names
    if (isIdStart(ch)) {
      i++;
      while (i < n && isIdContinue(s[i]) && s[i] !== '%' && s[i] !== '°') i++;
      out.push({ kind: 'id', text: s.slice(start, i), pos: start, end: i, spaced });
      continue;
    }

    throw new CalcError(`Unexpected character "${ch}" at position ${start + 1}`);
  }

  out.push({ kind: 'eof', text: '', pos: n, end: n, spaced: true });
  return out;
}

const KNOWN_FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'sqrt', 'cbrt', 'abs', 'arg', 'angle', 're', 'im', 'conj', 'polar',
  'exp', 'ln', 'log', 'log10', 'log2',
  'floor', 'ceil', 'round', 'min', 'max',
  'db', 'db10', 'db20', 'dbm', 'fromdbm', 'fromdb', 'fromdb10', 'fromdb20', 'parallel',
  'diff', 'int', 'integrate',
]);

function isConversionKeyword(tok: Token): boolean {
  if (tok.kind === 'arrow') return true;
  if (tok.kind !== 'id') return false;
  const low = tok.text.toLowerCase();
  return low === 'to' || low === 'as' || low === 'in';
}

function isReservedName(name: string): boolean {
  const low = name.toLowerCase();
  return low === 'to' || low === 'as' || low === 'angle' || KNOWN_FUNCTIONS.has(low);
}

/**
 * Parse a Smart Calculator expression string into an AST.
 * Handles assignments (`R = 10 kOhm`), unit conversions (`100 mW in dBm`),
 * phasor notation (`10 ∠ 45 deg`), parallel (`10k || 10k`), and `d/dx(expr)`.
 */
export function parseExpression(input: string): Expr {
  const trimmed = input.trim();
  if (!trimmed) throw new CalcError('Empty expression');

  const toks = tokenize(trimmed);
  let pos = 0;

  const peek = (offset = 0): Token => toks[Math.min(pos + offset, toks.length - 1)];
  const next = (): Token => toks[pos++];

  /** Check if tokens starting at `idx` form a valid unit expression reaching EOF. */
  const tryParseTrailingUnit = (startIdx: number): UnitSpec | null => {
    if (startIdx >= toks.length - 1) return null;
    const slice = toks.slice(startIdx, toks.length - 1);
    const raw = slice.map((t) => t.text).join(' ');
    return parseUnitExpr(raw);
  };

  /** Check whether `in` at `idx` is a top-level conversion keyword rather than unit `inch`. */
  const isTopLevelInConversion = (idx: number): boolean => {
    const t = toks[idx];
    if (!t || t.kind !== 'id' || t.text.toLowerCase() !== 'in') return false;
    return tryParseTrailingUnit(idx + 1) !== null;
  };

  /** Parse an optional unit exponent (`^2`, `^-1`, `^(2)`), scaling the UnitSpec. */
  const maybeScaleUnitPow = (spec: UnitSpec): UnitSpec => {
    if (peek().kind !== 'op' || peek().text !== '^') return spec;
    const saved = pos;
    pos++; // consume '^'
    let grouped = false;
    if (peek().kind === '(') {
      grouped = true;
      pos++;
    }
    let sign = 1;
    if (peek().kind === 'op' && (peek().text === '-' || peek().text === '+')) {
      sign = peek().text === '-' ? -1 : 1;
      pos++;
    }
    if (peek().kind !== 'num') {
      pos = saved;
      return spec;
    }
    const exp = sign * Number(next().text);
    if (grouped) {
      if (peek().kind !== ')') {
        pos = saved;
        return spec;
      }
      pos++;
    }
    if (!Number.isFinite(exp)) {
      pos = saved;
      return spec;
    }
    if (exp === 1) return spec;
    const rebuilt = parseUnitExpr(`${spec.symbol}^${exp}`);
    if (rebuilt) return rebuilt;
    return {
      symbol: `${spec.symbol}^${exp}`,
      latex: `${spec.latex}^{${exp}}`,
      dim: dimScale(spec.dim, exp),
      scale: Math.pow(spec.scale, exp),
      dataKind: spec.dataKind,
    };
  };

  const parseStatement = (): Expr => {
    // Assignment: `ident = expr`
    if (
      peek(0).kind === 'id' &&
      peek(1).kind === 'op' &&
      peek(1).text === '=' &&
      !isReservedName(peek(0).text)
    ) {
      const name = next().text;
      next(); // consume '='
      const rhs = parseConvert();
      return assignNode(name, rhs);
    }
    return parseConvert();
  };

  const parseConvert = (): Expr => {
    const lhs = parseAdd();
    const t = peek();
    if (
      t.kind === 'arrow' ||
      (t.kind === 'id' && (t.text.toLowerCase() === 'to' || t.text.toLowerCase() === 'as')) ||
      isTopLevelInConversion(pos)
    ) {
      const kw = next().text;
      const target = tryParseTrailingUnit(pos);
      if (!target) {
        const rest = toks.slice(pos, toks.length - 1).map((x) => x.text).join(' ');
        throw new CalcError(`Unknown target unit after "${kw}": "${rest || '(empty)'}"`);
      }
      pos = toks.length - 1;
      return convertNode(lhs, target);
    }
    return lhs;
  };

  const parseAdd = (): Expr => {
    let left = parseParallel();
    while (peek().kind === 'op' && (peek().text === '+' || peek().text === '-')) {
      const op = next().text as '+' | '-';
      const right = parseParallel();
      left = binaryNode(op, left, right);
    }
    return left;
  };

  const parseParallel = (): Expr => {
    let left = parseMul();
    while (peek().kind === 'par') {
      next();
      const right = parseMul();
      left = binaryNode('||', left, right);
    }
    return left;
  };

  const canStartImplicitFactor = (tok: Token): boolean => {
    if (tok.kind === '(') return true;
    if (tok.kind !== 'id') return false;
    const low = tok.text.toLowerCase();
    if (low === 'to' || low === 'as' || low === 'angle') return false;
    if (low === 'in' && isTopLevelInConversion(pos)) return false;
    return true;
  };

  const parseMul = (): Expr => {
    let left = parsePhasor();
    while (true) {
      const t = peek();
      if (t.kind === 'op' && (t.text === '*' || t.text === '/')) {
        const op = next().text as '*' | '/';
        const right = parsePhasor();
        left = binaryNode(op, left, right);
      } else if (canStartImplicitFactor(t)) {
        // Attach a trailing unit directly to a parenthesized or complex expression e.g. `(50 + j*30) Ohm`
        if (t.kind === 'id' && peek(1).kind !== '(') {
          const unit = parseUnitToken(t.text);
          if (unit && !lookupConstant(t.text) && t.text !== 'j' && t.text !== 'i') {
            next();
            const scaled = maybeScaleUnitPow(unit);
            left = attachNode(left, scaled, t.text);
            continue;
          }
        }
        const right = parsePhasor();
        left = binaryNode('*', left, right, true);
      } else {
        break;
      }
    }
    return left;
  };

  const parsePhasor = (): Expr => {
    let left = parseUnary();
    while (
      peek().kind === 'angle' ||
      (peek().kind === 'id' && peek().text.toLowerCase() === 'angle' && peek(1).kind !== '(')
    ) {
      next();
      const right = parseUnary();
      left = binaryNode('∠', left, right);
    }
    return left;
  };

  const parseUnary = (): Expr => {
    if (peek().kind === 'op' && (peek().text === '+' || peek().text === '-')) {
      const op = next().text as '+' | '-';
      return unaryNode(op, parseUnary());
    }
    return parsePow();
  };

  const parsePow = (): Expr => {
    const base = parsePostfix();
    if (peek().kind === 'op' && peek().text === '^') {
      next();
      const exp = parseUnary(); // right-associative, allows x^-2
      return binaryNode('^', base, exp);
    }
    return base;
  };

  const parsePostfix = (): Expr => {
    const atom = parsePrimary();

    // Number immediately followed by a unit token or bare SI prefix (e.g. `10 kOhm`, `100 pF`, `25 um^2`, `4.7k`, `50%`)
    if (atom.kind === 'num' && peek().kind === 'id' && peek(1).kind !== '(') {
      const t = peek();
      const low = t.text.toLowerCase();

      // Special case: `10 in` (inch) vs `10 in in mm` (inch then convert) vs `10 in mm`
      if (low === 'in') {
        const afterIn = peek(1);
        const isInchThenConvert = afterIn.kind === 'id' && afterIn.text.toLowerCase() === 'in';
        const isTopConvert = isTopLevelInConversion(pos) && !isInchThenConvert;
        if (!isTopConvert) {
          next();
          const inchUnit = parseUnitToken('in');
          if (inchUnit) return attachNode(atom, maybeScaleUnitPow(inchUnit), 'in');
        }
        return atom;
      }

      if (!isConversionKeyword(t) && low !== 'angle') {
        const unit = parseUnitToken(t.text);
        if (unit) {
          // Single-letter constants (`c`, `h`, `e`) or imaginary (`i`, `j`) should not shadow `2 c`, `2 h`, etc.
          // Wait: `h` is hours (`2 h` = 2 hours) AND Planck constant (`h * f`). After a number, `2 h` means 2 hours!
          // `c` is NOT a unit (`parseUnitToken('c')` is null). `e`, `i`, `j` are NOT units.
          next();
          const scaled = maybeScaleUnitPow(unit);
          return attachNode(atom, scaled, t.text);
        }

        // Bare SI engineering multiplier immediately attached (`10k`, `100p`, `4.7M`, `10meg`)
        if (!t.spaced || t.text === 'meg' || t.text === 'Meg') {
          const mult = lookupBarePrefix(t.text);
          if (mult !== null && !lookupConstant(t.text)) {
            next();
            return numNode(atom.value * mult, `${atom.raw ?? atom.value}${t.text}`);
          }
        }
      }
    }

    return atom;
  };

  const parsePrimary = (): Expr => {
    const t = peek();

    // Derivative shorthand: `d/dx(expr)` or `d/dt(expr)`
    if (
      t.kind === 'id' &&
      t.text === 'd' &&
      peek(1).kind === 'op' &&
      peek(1).text === '/' &&
      peek(2).kind === 'id' &&
      peek(2).text.length >= 2 &&
      peek(2).text.startsWith('d') &&
      peek(3).kind === '('
    ) {
      const varName = peek(2).text.slice(1);
      pos += 4; // consume `d`, `/`, `d<var>`, `(`
      const body = parseAdd();
      if (peek().kind !== ')') throw new CalcError(`Expected ")" in d/d${varName}(...)`);
      next();
      return callNode('diff', [body, identNode(varName)]);
    }

    if (t.kind === 'num') {
      next();
      const val = Number(t.text);
      if (!Number.isFinite(val)) throw new CalcError(`Invalid number "${t.text}"`);
      return numNode(val, t.text);
    }

    if (t.kind === '(') {
      next();
      const inner = parseAdd();
      if (peek().kind !== ')') throw new CalcError('Missing closing parenthesis ")"');
      next();
      return inner;
    }

    if (t.kind === 'id') {
      next();
      // Function call: `name(arg1, arg2, ...)`
      if (peek().kind === '(') {
        next(); // consume '('
        const args: Expr[] = [];
        if (peek().kind !== ')') {
          args.push(parseAdd());
          while (peek().kind === ',') {
            next();
            args.push(parseAdd());
          }
        }
        if (peek().kind !== ')') throw new CalcError(`Missing ")" after arguments of ${t.text}()`);
        next();
        return callNode(t.text, args);
      }
      return identNode(t.text);
    }

    throw new CalcError(
      t.kind === 'eof'
        ? 'Unexpected end of expression'
        : `Unexpected token "${t.text}" at position ${t.pos + 1}`,
    );
  };

  const ast = parseStatement();
  if (peek().kind !== 'eof') {
    throw new CalcError(`Unexpected token "${peek().text}" at position ${peek().pos + 1}`);
  }
  return ast;
}
