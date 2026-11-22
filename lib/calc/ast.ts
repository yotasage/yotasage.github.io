// AST node types, constructors, and plain-text / KaTeX printers for Smart Calculator.
// Framework-free; zero external dependencies; no node:* imports.

import { formatRealLatex, formatRealNumber, type UnitSpec } from './units';

export type BinaryOp = '+' | '-' | '*' | '/' | '^' | '∠' | '||';
export type UnaryOp = '+' | '-';

export type Expr =
  | { kind: 'num'; value: number; raw?: string }
  | { kind: 'ident'; name: string }
  | { kind: 'unit'; spec: UnitSpec }
  | { kind: 'attach'; expr: Expr; unit: UnitSpec; implicitName?: string }
  | { kind: 'unary'; op: UnaryOp; arg: Expr }
  | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr; implicit?: boolean }
  | { kind: 'call'; name: string; args: readonly Expr[] }
  | { kind: 'convert'; expr: Expr; target: UnitSpec }
  | { kind: 'assign'; name: string; expr: Expr };

export const numNode = (value: number, raw?: string): Expr => ({ kind: 'num', value, raw });
export const identNode = (name: string): Expr => ({ kind: 'ident', name });
export const unitNode = (spec: UnitSpec): Expr => ({ kind: 'unit', spec });
export const attachNode = (expr: Expr, unit: UnitSpec, implicitName?: string): Expr => ({
  kind: 'attach',
  expr,
  unit,
  implicitName,
});
export const unaryNode = (op: UnaryOp, arg: Expr): Expr => ({ kind: 'unary', op, arg });
export const binaryNode = (
  op: BinaryOp,
  left: Expr,
  right: Expr,
  implicit?: boolean,
): Expr => ({ kind: 'binary', op, left, right, implicit });
export const callNode = (name: string, args: readonly Expr[]): Expr => ({ kind: 'call', name, args });
export const convertNode = (expr: Expr, target: UnitSpec): Expr => ({ kind: 'convert', expr, target });
export const assignNode = (name: string, expr: Expr): Expr => ({ kind: 'assign', name, expr });

/** Check whether an AST references a given variable name freely (ignoring call names). */
export function containsVar(expr: Expr, varName: string): boolean {
  switch (expr.kind) {
    case 'num':
    case 'unit':
      return false;
    case 'ident':
      return expr.name === varName;
    case 'attach':
    case 'convert':
    case 'assign':
      return containsVar(expr.expr, varName);
    case 'unary':
      return containsVar(expr.arg, varName);
    case 'binary':
      return containsVar(expr.left, varName) || containsVar(expr.right, varName);
    case 'call':
      return expr.args.some((a) => containsVar(a, varName));
  }
}

/** Collect all free identifier names appearing in an AST (excluding function names). */
export function collectVars(expr: Expr, out = new Set<string>()): Set<string> {
  switch (expr.kind) {
    case 'num':
    case 'unit':
      return out;
    case 'ident':
      out.add(expr.name);
      return out;
    case 'attach':
    case 'convert':
    case 'assign':
      return collectVars(expr.expr, out);
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

/** Substitute every occurrence of `varName` with `replacement`. */
export function substituteVar(expr: Expr, varName: string, replacement: Expr): Expr {
  switch (expr.kind) {
    case 'num':
    case 'unit':
      return expr;
    case 'ident':
      return expr.name === varName ? replacement : expr;
    case 'attach':
      return attachNode(substituteVar(expr.expr, varName, replacement), expr.unit, expr.implicitName);
    case 'convert':
      return convertNode(substituteVar(expr.expr, varName, replacement), expr.target);
    case 'assign':
      return assignNode(expr.name, substituteVar(expr.expr, varName, replacement));
    case 'unary':
      return unaryNode(expr.op, substituteVar(expr.arg, varName, replacement));
    case 'binary':
      return binaryNode(
        expr.op,
        substituteVar(expr.left, varName, replacement),
        substituteVar(expr.right, varName, replacement),
        expr.implicit,
      );
    case 'call':
      return callNode(
        expr.name,
        expr.args.map((a) => substituteVar(a, varName, replacement)),
      );
  }
}

// ---------------------------------------------------------------------------
// Precedence & Printers
// ---------------------------------------------------------------------------

function prec(expr: Expr): number {
  switch (expr.kind) {
    case 'assign':
      return 1;
    case 'convert':
      return 2;
    case 'binary':
      if (expr.op === '+' || expr.op === '-') return 3;
      if (expr.op === '||') return 4;
      if (expr.op === '*' || expr.op === '/') return 5;
      if (expr.op === '∠') return 6;
      return 8; // '^'
    case 'unary':
      return 7;
    case 'attach':
      return 9;
    case 'num':
    case 'ident':
    case 'unit':
    case 'call':
      return 10;
  }
}

const GREEK_TEX: Readonly<Record<string, string>> = {
  pi: '\\pi',
  π: '\\pi',
  tau: '\\tau',
  τ: '\\tau',
  omega: '\\omega',
  ω: '\\omega',
  Omega: '\\Omega',
  Ω: '\\Omega',
  lambda: '\\lambda',
  λ: '\\lambda',
  theta: '\\theta',
  θ: '\\theta',
  phi: '\\phi',
  φ: '\\phi',
  alpha: '\\alpha',
  beta: '\\beta',
  gamma: '\\gamma',
  delta: '\\delta',
  Delta: '\\Delta',
  epsilon: '\\varepsilon',
  eps0: '\\varepsilon_0',
  mu0: '\\mu_0',
  hbar: '\\hbar',
  k_B: 'k_B',
  Z0: 'Z_0',
  g0: 'g_0',
  N_A: 'N_A',
};

function identToLatex(name: string): string {
  const direct = GREEK_TEX[name];
  if (direct) return direct;
  const subIdx = name.indexOf('_');
  if (subIdx > 0 && subIdx < name.length - 1) {
    const base = name.slice(0, subIdx);
    const sub = name.slice(subIdx + 1);
    const baseTex = GREEK_TEX[base] ?? (base.length === 1 ? base : `\\text{${base}}`);
    return `${baseTex}_{${sub}}`;
  }
  return name.length === 1 ? name : `\\text{${name}}`;
}

const FUNC_TEX: Readonly<Record<string, string>> = {
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
  asinh: '\\operatorname{arsinh}',
  acosh: '\\operatorname{arcosh}',
  atanh: '\\operatorname{artanh}',
  ln: '\\ln',
  log: '\\log_{10}',
  log10: '\\log_{10}',
  log2: '\\log_{2}',
  exp: '\\exp',
  re: '\\operatorname{Re}',
  im: '\\operatorname{Im}',
  arg: '\\arg',
  angle: '\\arg',
};

/** Print an AST node as clean, human-readable mathematical plain text. */
export function exprToText(expr: Expr, parentPrec = 0): string {
  const p = prec(expr);
  let out: string;

  switch (expr.kind) {
    case 'num':
      out = formatRealNumber(expr.value, 8);
      break;
    case 'ident':
      out = expr.name === 'pi' ? 'π' : expr.name;
      break;
    case 'unit':
      out = expr.spec.symbol;
      break;
    case 'attach': {
      const inner = exprToText(expr.expr, 9);
      const sym = expr.unit.symbol;
      out = sym === '°' || sym === '%' ? `${inner}${sym}` : `${inner} ${sym}`;
      break;
    }
    case 'unary': {
      const arg = exprToText(expr.arg, 7);
      out = expr.op === '-' ? `−${arg}` : arg;
      break;
    }
    case 'binary': {
      if (expr.op === '+') {
        out = `${exprToText(expr.left, 3)} + ${exprToText(expr.right, 3)}`;
      } else if (expr.op === '-') {
        out = `${exprToText(expr.left, 3)} − ${exprToText(expr.right, 4)}`;
      } else if (expr.op === '*') {
        const l = exprToText(expr.left, 5);
        const r = exprToText(expr.right, 5);
        out = `${l}·${r}`;
      } else if (expr.op === '/') {
        const l = exprToText(expr.left, 5);
        const r = exprToText(expr.right, 6);
        out = `${l}/${r}`;
      } else if (expr.op === '^') {
        const l = exprToText(expr.left, 9);
        const r = exprToText(expr.right, 8);
        out = `${l}^${r}`;
      } else if (expr.op === '∠') {
        out = `${exprToText(expr.left, 6)} ∠ ${exprToText(expr.right, 6)}`;
      } else {
        out = `${exprToText(expr.left, 4)} ∥ ${exprToText(expr.right, 4)}`;
      }
      break;
    }
    case 'call': {
      const args = expr.args.map((a) => exprToText(a, 0)).join(', ');
      out = `${expr.name}(${args})`;
      break;
    }
    case 'convert':
      out = `${exprToText(expr.expr, 2)} → ${expr.target.symbol}`;
      break;
    case 'assign':
      out = `${expr.name} = ${exprToText(expr.expr, 0)}`;
      break;
  }

  return p < parentPrec ? `(${out})` : out;
}

/** Print an AST node as valid KaTeX LaTeX. */
export function exprToLatex(expr: Expr, parentPrec = 0): string {
  const p = prec(expr);
  let out: string;

  switch (expr.kind) {
    case 'num':
      out = formatRealLatex(expr.value, 8);
      break;
    case 'ident':
      out = identToLatex(expr.name);
      break;
    case 'unit':
      out = expr.spec.latex;
      break;
    case 'attach': {
      const inner = exprToLatex(expr.expr, 9);
      const tex = expr.unit.latex;
      out = tex === '^\\circ' || tex === '\\%' ? `${inner}${tex}` : `${inner}\\,${tex}`;
      break;
    }
    case 'unary': {
      const arg = exprToLatex(expr.arg, 7);
      out = expr.op === '-' ? `-${arg}` : arg;
      break;
    }
    case 'binary': {
      if (expr.op === '+') {
        out = `${exprToLatex(expr.left, 3)} + ${exprToLatex(expr.right, 3)}`;
      } else if (expr.op === '-') {
        out = `${exprToLatex(expr.left, 3)} - ${exprToLatex(expr.right, 4)}`;
      } else if (expr.op === '*') {
        const l = exprToLatex(expr.left, 5);
        const r = exprToLatex(expr.right, 5);
        const omitDot =
          expr.left.kind === 'num' &&
          (expr.right.kind === 'ident' ||
            expr.right.kind === 'call' ||
            (expr.right.kind === 'binary' && expr.right.op === '^' && expr.right.left.kind === 'ident'));
        out = omitDot ? `${l}\\,${r}` : `${l} \\cdot ${r}`;
      } else if (expr.op === '/') {
        out = `\\frac{${exprToLatex(expr.left, 0)}}{${exprToLatex(expr.right, 0)}}`;
      } else if (expr.op === '^') {
        const baseNeedParen = expr.left.kind === 'binary' || expr.left.kind === 'unary' || expr.left.kind === 'attach';
        const l = baseNeedParen ? `\\left(${exprToLatex(expr.left, 0)}\\right)` : exprToLatex(expr.left, 9);
        out = `${l}^{${exprToLatex(expr.right, 0)}}`;
      } else if (expr.op === '∠') {
        out = `${exprToLatex(expr.left, 6)} \\angle ${exprToLatex(expr.right, 6)}`;
      } else {
        out = `${exprToLatex(expr.left, 4)} \\parallel ${exprToLatex(expr.right, 4)}`;
      }
      break;
    }
    case 'call': {
      const fn = expr.name.toLowerCase();
      if (fn === 'sqrt' && expr.args.length === 1) {
        out = `\\sqrt{${exprToLatex(expr.args[0], 0)}}`;
      } else if (fn === 'cbrt' && expr.args.length === 1) {
        out = `\\sqrt[3]{${exprToLatex(expr.args[0], 0)}}`;
      } else if (fn === 'abs' && expr.args.length === 1) {
        out = `\\left|${exprToLatex(expr.args[0], 0)}\\right|`;
      } else if (fn === 'conj' && expr.args.length === 1) {
        out = `\\overline{${exprToLatex(expr.args[0], 0)}}`;
      } else if (fn === 'exp' && expr.args.length === 1) {
        out = `e^{${exprToLatex(expr.args[0], 0)}}`;
      } else if ((fn === 'diff' || fn === 'd') && expr.args.length >= 2) {
        const v = exprToLatex(expr.args[1], 0);
        const order = expr.args[2]?.kind === 'num' && expr.args[2].value !== 1 ? `^{${expr.args[2].value}}` : '';
        out = `\\frac{d${order}}{d${v}${order}}\\left(${exprToLatex(expr.args[0], 0)}\\right)`;
      } else if ((fn === 'int' || fn === 'integrate') && expr.args.length >= 2) {
        const v = exprToLatex(expr.args[1], 0);
        if (expr.args.length >= 4) {
          out = `\\int_{${exprToLatex(expr.args[2], 0)}}^{${exprToLatex(expr.args[3], 0)}} ${exprToLatex(expr.args[0], 0)}\\,d${v}`;
        } else {
          out = `\\int ${exprToLatex(expr.args[0], 0)}\\,d${v}`;
        }
      } else {
        const fnTex = FUNC_TEX[fn] ?? `\\operatorname{${expr.name}}`;
        const args = expr.args.map((a) => exprToLatex(a, 0)).join(', ');
        out = `${fnTex}\\left(${args}\\right)`;
      }
      break;
    }
    case 'convert':
      out = `${exprToLatex(expr.expr, 2)} \\to ${expr.target.latex}`;
      break;
    case 'assign':
      out = `${identToLatex(expr.name)} = ${exprToLatex(expr.expr, 0)}`;
      break;
  }

  return p < parentPrec ? `\\left(${out}\\right)` : out;
}
