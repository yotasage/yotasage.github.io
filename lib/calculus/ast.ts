// Pure mathematical AST, structural utilities, plain-text/LaTeX printers, and numeric evaluator
// for the Integral and Derivative Solvers. Framework-free; zero external dependencies.

export type MathBinaryOp = '+' | '-' | '*' | '/' | '^';
export type MathUnaryOp = '+' | '-';

export type MathExpr =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'ident'; readonly name: string }
  | { readonly kind: 'unary'; readonly op: MathUnaryOp; readonly arg: MathExpr }
  | {
      readonly kind: 'binary';
      readonly op: MathBinaryOp;
      readonly left: MathExpr;
      readonly right: MathExpr;
    }
  | { readonly kind: 'call'; readonly name: string; readonly args: readonly MathExpr[] };

export const EPS = 1e-11;

export const num = (value: number): MathExpr => ({
  kind: 'num',
  value: Object.is(value, -0) || Math.abs(value) < 1e-15 ? 0 : value,
});
export const ident = (name: string): MathExpr => ({ kind: 'ident', name });
export const unary = (op: MathUnaryOp, arg: MathExpr): MathExpr => ({ kind: 'unary', op, arg });
export const neg = (arg: MathExpr): MathExpr => unary('-', arg);
export const binary = (op: MathBinaryOp, left: MathExpr, right: MathExpr): MathExpr => ({
  kind: 'binary',
  op,
  left,
  right,
});
export const add = (l: MathExpr, r: MathExpr): MathExpr => binary('+', l, r);
export const sub = (l: MathExpr, r: MathExpr): MathExpr => binary('-', l, r);
export const mul = (l: MathExpr, r: MathExpr): MathExpr => binary('*', l, r);
export const div = (l: MathExpr, r: MathExpr): MathExpr => binary('/', l, r);
export const pow = (l: MathExpr, r: MathExpr): MathExpr => binary('^', l, r);
export const call = (name: string, args: readonly MathExpr[]): MathExpr => ({
  kind: 'call',
  name: name.toLowerCase(),
  args,
});

export function isNum(e: MathExpr, value?: number): e is { readonly kind: 'num'; readonly value: number } {
  if (e.kind !== 'num') return false;
  return value === undefined ? true : Math.abs(e.value - value) < EPS;
}

export const isZero = (e: MathExpr): boolean => isNum(e, 0);
export const isOne = (e: MathExpr): boolean => isNum(e, 1);
export const isNegOne = (e: MathExpr): boolean => isNum(e, -1);

export function isCleanNumber(x: number): boolean {
  if (!Number.isFinite(x)) return false;
  if (Number.isInteger(x)) return Math.abs(x) <= 1e12;
  const scaled = x * 1e6;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

export function gcdInt(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

export function containsVar(expr: MathExpr, varName: string): boolean {
  switch (expr.kind) {
    case 'num':
      return false;
    case 'ident':
      return expr.name === varName;
    case 'unary':
      return containsVar(expr.arg, varName);
    case 'binary':
      return containsVar(expr.left, varName) || containsVar(expr.right, varName);
    case 'call':
      return expr.args.some((a) => containsVar(a, varName));
  }
}

export function collectVars(expr: MathExpr, out = new Set<string>()): Set<string> {
  switch (expr.kind) {
    case 'num':
      return out;
    case 'ident':
      if (expr.name !== 'pi' && expr.name !== 'e' && expr.name !== 'tau') {
        out.add(expr.name);
      }
      return out;
    case 'unary':
      return collectVars(expr.arg, out);
    case 'binary':
      collectVars(expr.left, out);
      return collectVars(expr.right, out);
    case 'call':
      for (const a of expr.args) collectVars(a, out);
      return out;
  }
}

export function substituteVar(expr: MathExpr, varName: string, replacement: MathExpr): MathExpr {
  switch (expr.kind) {
    case 'num':
      return expr;
    case 'ident':
      return expr.name === varName ? replacement : expr;
    case 'unary':
      return unary(expr.op, substituteVar(expr.arg, varName, replacement));
    case 'binary':
      return binary(
        expr.op,
        substituteVar(expr.left, varName, replacement),
        substituteVar(expr.right, varName, replacement),
      );
    case 'call':
      return call(
        expr.name,
        expr.args.map((a) => substituteVar(a, varName, replacement)),
      );
  }
}

export function exprEqual(a: MathExpr, b: MathExpr): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'num':
      return b.kind === 'num' && Math.abs(a.value - b.value) < EPS;
    case 'ident':
      return b.kind === 'ident' && a.name === b.name;
    case 'unary':
      return b.kind === 'unary' && a.op === b.op && exprEqual(a.arg, b.arg);
    case 'binary':
      return (
        b.kind === 'binary' &&
        a.op === b.op &&
        exprEqual(a.left, b.left) &&
        exprEqual(a.right, b.right)
      );
    case 'call':
      return (
        b.kind === 'call' &&
        a.name === b.name &&
        a.args.length === b.args.length &&
        a.args.every((arg, i) => exprEqual(arg, b.args[i]))
      );
  }
}

export function astSize(expr: MathExpr): number {
  switch (expr.kind) {
    case 'num':
    case 'ident':
      return 1;
    case 'unary':
      return 1 + astSize(expr.arg);
    case 'binary':
      return 1 + astSize(expr.left) + astSize(expr.right);
    case 'call':
      return 1 + expr.args.reduce((sum, a) => sum + astSize(a), 0);
  }
}

// ---------------------------------------------------------------------------
// Formatting & Printers
// ---------------------------------------------------------------------------

export function formatNum(n: number, sigDigits = 8): string {
  if (!Number.isFinite(n)) return String(n);
  if (Math.abs(n) < 1e-14) return '0';
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const rounded = Number(n.toPrecision(sigDigits));
  if (Math.abs(rounded) >= 1e-4 && Math.abs(rounded) < 1e9) {
    return String(rounded);
  }
  return rounded.toExponential(Math.min(6, sigDigits - 1)).replace('e+', 'e');
}

const GREEK_LATEX: Readonly<Record<string, string>> = {
  pi: '\\pi',
  tau: '\\tau',
  theta: '\\theta',
  phi: '\\phi',
  omega: '\\omega',
  alpha: '\\alpha',
  beta: '\\beta',
  gamma: '\\gamma',
  delta: '\\delta',
  lambda: '\\lambda',
  mu: '\\mu',
  sigma: '\\sigma',
  epsilon: '\\varepsilon',
  eta: '\\eta',
  rho: '\\rho',
};

const FUNC_LATEX: Readonly<Record<string, string>> = {
  sin: '\\sin',
  cos: '\\cos',
  tan: '\\tan',
  sec: '\\sec',
  csc: '\\csc',
  cot: '\\cot',
  asin: '\\arcsin',
  acos: '\\arccos',
  atan: '\\arctan',
  sinh: '\\sinh',
  cosh: '\\cosh',
  tanh: '\\tanh',
  sech: '\\operatorname{sech}',
  csch: '\\operatorname{csch}',
  coth: '\\coth',
  asinh: '\\operatorname{arsinh}',
  acosh: '\\operatorname{arcosh}',
  atanh: '\\operatorname{artanh}',
  ln: '\\ln',
  log: '\\log_{10}',
  log10: '\\log_{10}',
  log2: '\\log_{2}',
  exp: '\\exp',
};

const TRIG_POW_FUNCS = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh']);

export function identToLatex(name: string): string {
  if (GREEK_LATEX[name]) return GREEK_LATEX[name];
  const idx = name.indexOf('_');
  if (idx > 0 && idx < name.length - 1) {
    const base = name.slice(0, idx);
    const subStr = name.slice(idx + 1);
    const baseTex = GREEK_LATEX[base] ?? (base.length === 1 ? base : `\\text{${base}}`);
    return `${baseTex}_{${subStr}}`;
  }
  return name.length === 1 ? name : `\\text{${name}}`;
}

function prec(e: MathExpr): number {
  switch (e.kind) {
    case 'binary':
      if (e.op === '+' || e.op === '-') return 2;
      if (e.op === '*' || e.op === '/') return 4;
      return 7; // '^'
    case 'unary':
      return 5;
    case 'num':
    case 'ident':
    case 'call':
      return 9;
  }
}

export function toText(expr: MathExpr, parentPrec = 0): string {
  const p = prec(expr);
  let out: string;

  switch (expr.kind) {
    case 'num':
      out = formatNum(expr.value);
      break;
    case 'ident':
      out = expr.name === 'pi' ? 'π' : expr.name;
      break;
    case 'unary': {
      const a = toText(expr.arg, 6);
      out = expr.op === '-' ? `-${a}` : a;
      break;
    }
    case 'binary': {
      if (expr.op === '+') {
        out = `${toText(expr.left, 2)} + ${toText(expr.right, 2)}`;
      } else if (expr.op === '-') {
        out = `${toText(expr.left, 2)} - ${toText(expr.right, 3)}`;
      } else if (expr.op === '*') {
        const l = toText(expr.left, 4);
        const r = toText(expr.right, 4);
        out = `${l}*${r}`;
      } else if (expr.op === '/') {
        const l = toText(expr.left, 4);
        const r = toText(expr.right, 5);
        out = `${l}/${r}`;
      } else {
        const l = toText(expr.left, 8);
        const r = toText(expr.right, 7);
        out = `${l}^${r}`;
      }
      break;
    }
    case 'call':
      out = `${expr.name}(${expr.args.map((a) => toText(a, 0)).join(', ')})`;
      break;
  }

  return p < parentPrec ? `(${out})` : out;
}

export function toLatex(expr: MathExpr, parentPrec = 0): string {
  const p = prec(expr);
  let out: string;

  switch (expr.kind) {
    case 'num':
      out = formatNum(expr.value);
      break;
    case 'ident':
      out = identToLatex(expr.name);
      break;
    case 'unary': {
      const needsParen = expr.arg.kind === 'binary' && (expr.arg.op === '+' || expr.arg.op === '-');
      const a = needsParen ? `\\left(${toLatex(expr.arg, 0)}\\right)` : toLatex(expr.arg, 5);
      out = expr.op === '-' ? `-${a}` : a;
      break;
    }
    case 'binary': {
      if (expr.op === '+') {
        out = `${toLatex(expr.left, 2)} + ${toLatex(expr.right, 2)}`;
      } else if (expr.op === '-') {
        out = `${toLatex(expr.left, 2)} - ${toLatex(expr.right, 3)}`;
      } else if (expr.op === '*') {
        const l = toLatex(expr.left, 4);
        const r = toLatex(expr.right, 4);
        let rightHead: MathExpr = expr.right;
        while (rightHead.kind === 'binary' && rightHead.op === '*') {
          rightHead = rightHead.left;
        }
        const rightStartsSymbolic =
          rightHead.kind === 'ident' ||
          rightHead.kind === 'call' ||
          (rightHead.kind === 'binary' && rightHead.op === '^' && rightHead.left.kind !== 'num');
        const omitDot =
          (expr.left.kind === 'num' && rightStartsSymbolic) ||
          (expr.left.kind === 'ident' && rightHead.kind === 'call') ||
          (expr.left.kind === 'binary' &&
            expr.left.op === '^' &&
            expr.left.left.kind === 'ident' &&
            rightHead.kind === 'call');
        out = omitDot ? `${l}\\,${r}` : `${l} \\cdot ${r}`;
      } else if (expr.op === '/') {
        out = `\\frac{${toLatex(expr.left, 0)}}{${toLatex(expr.right, 0)}}`;
      } else {
        // Pretty trig/hyperbolic power: sin(u)^2 -> \sin^{2}(u)
        if (
          expr.left.kind === 'call' &&
          expr.left.args.length === 1 &&
          TRIG_POW_FUNCS.has(expr.left.name) &&
          expr.right.kind === 'num' &&
          Number.isInteger(expr.right.value) &&
          expr.right.value >= 2
        ) {
          const fnTex = FUNC_LATEX[expr.left.name] ?? `\\operatorname{${expr.left.name}}`;
          out = `${fnTex}^{${expr.right.value}}\\left(${toLatex(expr.left.args[0], 0)}\\right)`;
        } else {
          const baseNeedsParen =
            expr.left.kind === 'binary' ||
            expr.left.kind === 'unary' ||
            (expr.left.kind === 'call' && expr.left.name !== 'sqrt') ||
            (expr.left.kind === 'num' && expr.left.value < 0);
          const l = baseNeedsParen
            ? `\\left(${toLatex(expr.left, 0)}\\right)`
            : toLatex(expr.left, 8);
          out = `${l}^{${toLatex(expr.right, 0)}}`;
        }
      }
      break;
    }
    case 'call': {
      const fn = expr.name;
      if (fn === 'sqrt' && expr.args.length === 1) {
        out = `\\sqrt{${toLatex(expr.args[0], 0)}}`;
      } else if (fn === 'cbrt' && expr.args.length === 1) {
        out = `\\sqrt[3]{${toLatex(expr.args[0], 0)}}`;
      } else if (fn === 'abs' && expr.args.length === 1) {
        out = `\\left|${toLatex(expr.args[0], 0)}\\right|`;
      } else if (fn === 'exp' && expr.args.length === 1) {
        out = `e^{${toLatex(expr.args[0], 0)}}`;
      } else {
        const fnTex = FUNC_LATEX[fn] ?? `\\operatorname{${fn}}`;
        const argStr = expr.args.map((a) => toLatex(a, 0)).join(', ');
        out = `${fnTex}\\left(${argStr}\\right)`;
      }
      break;
    }
  }

  return p < parentPrec ? `\\left(${out}\\right)` : out;
}

// ---------------------------------------------------------------------------
// Numeric Evaluation (for verification, definite bounds, tangent lines, quadrature)
// ---------------------------------------------------------------------------

export function evalMath(
  expr: MathExpr,
  env: Readonly<Record<string, number>> = {},
): number {
  switch (expr.kind) {
    case 'num':
      return expr.value;
    case 'ident': {
      if (Object.prototype.hasOwnProperty.call(env, expr.name)) {
        return env[expr.name];
      }
      if (expr.name === 'pi') return Math.PI;
      if (expr.name === 'e') return Math.E;
      if (expr.name === 'tau') return 2 * Math.PI;
      return Number.NaN;
    }
    case 'unary': {
      const v = evalMath(expr.arg, env);
      return expr.op === '-' ? -v : v;
    }
    case 'binary': {
      const l = evalMath(expr.left, env);
      const r = evalMath(expr.right, env);
      switch (expr.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          return l / r;
        case '^':
          return Math.pow(l, r);
      }
    }
    case 'call': {
      if (expr.args.length !== 1) return Number.NaN;
      const x = evalMath(expr.args[0], env);
      switch (expr.name) {
        case 'sin':
          return Math.sin(x);
        case 'cos':
          return Math.cos(x);
        case 'tan':
          return Math.tan(x);
        case 'sec':
          return 1 / Math.cos(x);
        case 'csc':
          return 1 / Math.sin(x);
        case 'cot':
          return 1 / Math.tan(x);
        case 'asin':
          return Math.asin(x);
        case 'acos':
          return Math.acos(x);
        case 'atan':
          return Math.atan(x);
        case 'sinh':
          return Math.sinh(x);
        case 'cosh':
          return Math.cosh(x);
        case 'tanh':
          return Math.tanh(x);
        case 'sech':
          return 1 / Math.cosh(x);
        case 'csch':
          return 1 / Math.sinh(x);
        case 'coth':
          return 1 / Math.tanh(x);
        case 'asinh':
          return Math.asinh(x);
        case 'acosh':
          return Math.acosh(x);
        case 'atanh':
          return Math.atanh(x);
        case 'exp':
          return Math.exp(x);
        case 'ln':
          return Math.log(x);
        case 'log':
        case 'log10':
          return Math.log10(x);
        case 'log2':
          return Math.log2(x);
        case 'sqrt':
          return Math.sqrt(x);
        case 'cbrt':
          return Math.cbrt(x);
        case 'abs':
          return Math.abs(x);
        default:
          return Number.NaN;
      }
    }
  }
}
