// Pure-math tokenizer and recursive-descent parser for Integral & Derivative Solvers.
// Supports implicit multiplication (2x, 3t^2, x sin(x), (x+1)(x-1)), trig powers (sin^2(x)),
// absolute value bars (|x|), unicode symbols (π, √, ²), and standard elementary functions.
// Unlike Smart Calculator's parser, never misinterprets variables like t, s, m, g, h as physical units.

import { binary, call, ident, type MathExpr, num, pow, unary } from './ast';

export class MathParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MathParseError';
  }
}

type TokKind = 'num' | 'id' | 'op' | '(' | ')' | '|' | ',' | 'eof';

interface Token {
  readonly kind: TokKind;
  readonly text: string;
  readonly pos: number;
}

const SUPERSCRIPTS: Readonly<Record<string, string>> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁻': '-',
};

const KNOWN_FUNCS = new Set([
  'sin',
  'cos',
  'tan',
  'sec',
  'csc',
  'cot',
  'asin',
  'acos',
  'atan',
  'arcsin',
  'arccos',
  'arctan',
  'sinh',
  'cosh',
  'tanh',
  'sech',
  'csch',
  'coth',
  'asinh',
  'acosh',
  'atanh',
  'arsinh',
  'arcosh',
  'artanh',
  'exp',
  'ln',
  'log',
  'log10',
  'log2',
  'sqrt',
  'cbrt',
  'abs',
]);

const FUNC_ALIASES: Readonly<Record<string, string>> = {
  arcsin: 'asin',
  arccos: 'acos',
  arctan: 'atan',
  arsinh: 'asinh',
  arcosh: 'acosh',
  artanh: 'atanh',
};

const UNICODE_IDENT_MAP: Readonly<Record<string, string>> = {
  π: 'pi',
  τ: 'tau',
  θ: 'theta',
  φ: 'phi',
  ω: 'omega',
  α: 'alpha',
  β: 'beta',
  γ: 'gamma',
  δ: 'delta',
  λ: 'lambda',
  μ: 'mu',
  σ: 'sigma',
  ε: 'epsilon',
  η: 'eta',
  ρ: 'rho',
};

function preprocess(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; ) {
    const ch = raw[i];
    if (SUPERSCRIPTS[ch] !== undefined) {
      out += '^';
      let exp = '';
      while (i < raw.length && SUPERSCRIPTS[raw[i]] !== undefined) {
        exp += SUPERSCRIPTS[raw[i++]];
      }
      out += exp.startsWith('-') ? `(${exp})` : exp;
      continue;
    }
    if (ch === '√') {
      out += 'sqrt';
      i++;
      continue;
    }
    if (UNICODE_IDENT_MAP[ch]) {
      out += ` ${UNICODE_IDENT_MAP[ch]} `;
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out
    .replace(/[×·⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/\[/g, '(')
    .replace(/\]/g, ')');
}

function tokenize(source: string): Token[] {
  const s = preprocess(source);
  const tokens: Token[] = [];
  let i = 0;
  const n = s.length;

  while (i < n) {
    while (i < n && /\s/.test(s[i])) i++;
    if (i >= n) break;

    const start = i;
    const ch = s[i];

    if (ch === '*' && s[i + 1] === '*') {
      tokens.push({ kind: 'op', text: '^', pos: start });
      i += 2;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === '|' || ch === ',') {
      tokens.push({ kind: ch, text: ch, pos: start });
      i++;
      continue;
    }
    if ('+-*/^'.includes(ch)) {
      tokens.push({ kind: 'op', text: ch, pos: start });
      i++;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < n && /[0-9]/.test(s[i + 1]))) {
      while (i < n && /[0-9]/.test(s[i])) i++;
      if (i < n && s[i] === '.') {
        i++;
        while (i < n && /[0-9]/.test(s[i])) i++;
      }
      // Scientific notation like 1e-3 (but NOT 2e^x where e is Euler's constant!)
      if (i < n && (s[i] === 'e' || s[i] === 'E')) {
        let j = i + 1;
        if (j < n && (s[j] === '+' || s[j] === '-')) j++;
        if (j < n && /[0-9]/.test(s[j])) {
          while (j < n && /[0-9]/.test(s[j])) j++;
          i = j;
        }
      }
      tokens.push({ kind: 'num', text: s.slice(start, i), pos: start });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      i++;
      while (i < n && /[A-Za-z0-9_]/.test(s[i])) i++;
      tokens.push({ kind: 'id', text: s.slice(start, i), pos: start });
      continue;
    }

    throw new MathParseError(`Unexpected character "${ch}" at position ${start + 1}`);
  }

  tokens.push({ kind: 'eof', text: '', pos: n });
  return tokens;
}

export function parseMath(input: string): MathExpr {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new MathParseError('Please enter a mathematical expression.');
  }

  const toks = tokenize(trimmed);
  let pos = 0;

  const peek = (offset = 0): Token => toks[Math.min(pos + offset, toks.length - 1)];
  const next = (): Token => toks[pos++];

  const parseAdd = (): MathExpr => {
    let left = parseMul();
    while (peek().kind === 'op' && (peek().text === '+' || peek().text === '-')) {
      const op = next().text as '+' | '-';
      const right = parseMul();
      left = binary(op, left, right);
    }
    return left;
  };

  const canStartImplicitMul = (tok: Token): boolean =>
    tok.kind === '(' || tok.kind === 'id' || tok.kind === 'num';

  const parseMul = (): MathExpr => {
    let left = parseUnary();
    while (true) {
      const t = peek();
      if (t.kind === 'op' && (t.text === '*' || t.text === '/')) {
        const op = next().text as '*' | '/';
        const right = parseUnary();
        left = binary(op, left, right);
      } else if (canStartImplicitMul(t)) {
        const right = parsePow();
        left = binary('*', left, right);
      } else {
        break;
      }
    }
    return left;
  };

  const parseUnary = (): MathExpr => {
    if (peek().kind === 'op' && (peek().text === '+' || peek().text === '-')) {
      const op = next().text as '+' | '-';
      return unary(op, parseUnary());
    }
    return parsePow();
  };

  const parsePow = (): MathExpr => {
    const base = parsePrimary();
    if (peek().kind === 'op' && peek().text === '^') {
      next();
      const exp = parseUnary();
      // Normalize e^(u) -> exp(u) for cleaner symbolic matching
      if (base.kind === 'ident' && base.name === 'e') {
        return call('exp', [exp]);
      }
      return pow(base, exp);
    }
    return base;
  };

  const parsePrimary = (): MathExpr => {
    const t = peek();

    if (t.kind === 'num') {
      next();
      const v = Number(t.text);
      if (!Number.isFinite(v)) throw new MathParseError(`Invalid number "${t.text}"`);
      return num(v);
    }

    if (t.kind === '(') {
      next();
      const inner = parseAdd();
      if (peek().kind !== ')') {
        throw new MathParseError('Missing closing parenthesis ")"');
      }
      next();
      return inner;
    }

    if (t.kind === '|') {
      next();
      const inner = parseAdd();
      if (peek().kind !== '|') {
        throw new MathParseError('Missing closing absolute value bar "|"');
      }
      next();
      return call('abs', [inner]);
    }

    if (t.kind === 'id') {
      next();
      const rawName = t.text;
      const low = rawName.toLowerCase();
      const canonicalFn = FUNC_ALIASES[low] ?? low;

      // Support sin^2(x), cos^3(2x), sec^2(x), ln^2(x)
      if (KNOWN_FUNCS.has(low) && peek().kind === 'op' && peek().text === '^') {
        next(); // consume '^'
        const powerExp = parseUnary();
        let arg: MathExpr;
        if (peek().kind === '(') {
          next();
          arg = parseAdd();
          if (peek().kind !== ')') {
            throw new MathParseError(`Missing ")" after ${rawName}^...(`);
          }
          next();
        } else {
          arg = parsePrimary();
        }
        return pow(call(canonicalFn, [arg]), powerExp);
      }

      // Standard function call: sin(x), ln(x^2 + 1), sqrt(x)
      if (KNOWN_FUNCS.has(low)) {
        if (peek().kind === '(') {
          next();
          const args: MathExpr[] = [];
          if (peek().kind !== ')') {
            args.push(parseAdd());
            while (peek().kind === ',') {
              next();
              args.push(parseAdd());
            }
          }
          if (peek().kind !== ')') {
            throw new MathParseError(`Missing ")" after arguments of ${rawName}()`);
          }
          next();
          if (args.length !== 1) {
            throw new MathParseError(`Function ${rawName}() expects 1 argument (got ${args.length})`);
          }
          return call(canonicalFn, args);
        }
        // Allow bare `sin x` or `ln x` or `sqrt x`
        if (peek().kind === 'id' || peek().kind === 'num') {
          const arg = parsePow();
          return call(canonicalFn, [arg]);
        }
        throw new MathParseError(`Expected argument after function "${rawName}"`);
      }

      // Unknown function call syntax f(...) -> clear error
      if (peek().kind === '(') {
        // Could be implicit multiplication like x(x+1) when single letter!
        if (rawName.length === 1) {
          return ident(rawName);
        }
        throw new MathParseError(`Unknown function "${rawName}()". Supported functions: sin, cos, tan, sec, csc, cot, asin, acos, atan, sinh, cosh, tanh, exp, ln, log, sqrt, cbrt, abs.`);
      }

      // Normalize known constants
      if (low === 'pi') return ident('pi');
      if (low === 'tau') return ident('tau');
      if (rawName === 'e') return ident('e');

      return ident(rawName);
    }

    throw new MathParseError(
      t.kind === 'eof'
        ? 'Unexpected end of expression.'
        : `Unexpected token "${t.text}" at position ${t.pos + 1}`,
    );
  };

  const ast = parseAdd();
  if (peek().kind !== 'eof') {
    throw new MathParseError(`Unexpected token "${peek().text}" at position ${peek().pos + 1}`);
  }
  return ast;
}
