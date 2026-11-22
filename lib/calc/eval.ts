// Single-expression and multi-line notebook evaluators for the Smart Calculator engine.
// Handles variable scopes, `ans`/`ansN`/`prev`/`lineN`, complex impedances, unit conversions,
// companion hints, symbolic calculus results, and definite integration.
// Framework-free; zero external dependencies; no node:* imports.

import {
  type Expr,
  exprToLatex,
  exprToText,
} from './ast';
import {
  differentiate,
  integrateNumeric,
  integrateSymbolic,
  simplifyExpr,
} from './calculus';
import { lookupConstant } from './constants';
import { parseExpression } from './parse';
import { dimEqual, dimIsZero, parseUnitToken, suggestConversions, type UnitSpec } from './units';
import {
  applyUnit,
  CalcError,
  type CalcValue,
  type CompanionHint,
  formatBaseSI,
  formatValueLatex,
  formatValueText,
  fromNumberAndUnit,
  getCompanionHints,
  makeComplex,
  makeScalar,
  vAbs,
  vAcos,
  vAcosh,
  vAdd,
  vAngle,
  vArg,
  vAsin,
  vAsinh,
  vAtan,
  vAtan2,
  vAtanh,
  vCbrt,
  vCeil,
  vConj,
  vConvert,
  vCos,
  vCosh,
  vDb,
  vDb10,
  vDb20,
  vDbm,
  vDiv,
  vExp,
  vFloor,
  vFromDbm,
  vIm,
  vLn,
  vLog10,
  vLog2,
  vMax,
  vMin,
  vMul,
  vNeg,
  vParallel,
  vPolar,
  vPow,
  vRe,
  vRound,
  vSin,
  vSinh,
  vSqrt,
  vSub,
  vTan,
  vTanh,
} from './value';

export interface EvalEnv {
  vars?: Readonly<Record<string, CalcValue>>;
  ans?: CalcValue;
  historyValues?: readonly CalcValue[];
  /** Notebook line values (1-indexed via `line1`, `line2`, ...). */
  lineValues?: readonly (CalcValue | undefined)[];
  prev?: CalcValue;
}

export interface EvalNumericResult {
  kind: 'value';
  value: CalcValue;
  text: string;
  latex: string;
  baseSI: string;
  inputLatex: string;
  assignedName?: string;
  hints: CompanionHint[];
  conversions: UnitSpec[];
  methodNote?: string;
}

export interface EvalSymbolicResult {
  kind: 'symbolic';
  expr: Expr;
  text: string;
  latex: string;
  inputLatex: string;
  isIndefiniteIntegral?: boolean;
  assignedName?: string;
}

export type EvalResult = EvalNumericResult | EvalSymbolicResult;

export interface NotebookLineResult {
  lineNumber: number;
  raw: string;
  kind: 'empty' | 'comment' | 'value' | 'symbolic' | 'error';
  result?: EvalResult;
  error?: string;
}

export interface NotebookEvaluation {
  lines: NotebookLineResult[];
  vars: Record<string, CalcValue>;
}

const ZERO_EPS = 1e-14;
const isPurelyImag = (v: CalcValue): boolean =>
  Math.abs(v.im) > ZERO_EPS * Math.max(1, Math.abs(v.re)) && Math.abs(v.re) <= ZERO_EPS * Math.abs(v.im);
const isPurelyReal = (v: CalcValue): boolean =>
  Math.abs(v.im) <= ZERO_EPS * Math.max(1, Math.abs(v.re));

function extractAttachedUnit(expr: Expr): UnitSpec | null {
  if (expr.kind === 'attach') return expr.unit;
  if (expr.kind === 'unary') return extractAttachedUnit(expr.arg);
  if (expr.kind === 'binary' && expr.op === '*') {
    return extractAttachedUnit(expr.right) ?? extractAttachedUnit(expr.left);
  }
  return null;
}

/** Evaluate a parsed AST to a CalcValue inside `env`. */
export function evalAstNumeric(expr: Expr, env: EvalEnv = {}): CalcValue {
  const vars = env.vars ?? {};

  switch (expr.kind) {
    case 'num':
      return makeScalar(expr.value);

    case 'unit':
      return fromNumberAndUnit(1, expr.spec);

    case 'attach': {
      // Allow user variables (e.g. `C = 100 pF`) to take precedence over single-letter units in `2 C`.
      if (expr.implicitName && Object.prototype.hasOwnProperty.call(vars, expr.implicitName)) {
        return vMul(evalAstNumeric(expr.expr, env), vars[expr.implicitName]);
      }
      const base = evalAstNumeric(expr.expr, env);
      return applyUnit(base, expr.unit);
    }

    case 'ident': {
      const name = expr.name;
      if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];

      if (name === 'ans') {
        if (env.ans) return env.ans;
        throw new CalcError('No previous result available for "ans"');
      }
      if (name === 'prev') {
        if (env.prev) return env.prev;
        if (env.ans) return env.ans;
        throw new CalcError('No previous line result available for "prev"');
      }

      const ansMatch = /^ans(\d+)$/.exec(name);
      if (ansMatch) {
        const idx = Number(ansMatch[1]) - 1;
        const found = env.historyValues?.[idx];
        if (found) return found;
        throw new CalcError(`History entry "${name}" does not exist`);
      }

      const lineMatch = /^line(\d+)$/.exec(name);
      if (lineMatch) {
        const idx = Number(lineMatch[1]) - 1;
        const found = env.lineValues?.[idx];
        if (found) return found;
        throw new CalcError(`Line "${name}" does not have a numeric result`);
      }

      if (name === 'j' || name === 'i') return makeComplex(0, 1);

      const constant = lookupConstant(name);
      if (constant) return makeScalar(constant.value, constant.dim);

      const unit = parseUnitToken(name);
      if (unit) return fromNumberAndUnit(1, unit);

      throw new CalcError(`Unknown identifier: "${name}"`);
    }

    case 'unary': {
      const v = evalAstNumeric(expr.arg, env);
      return expr.op === '-' ? vNeg(v) : v;
    }

    case 'binary': {
      const l = evalAstNumeric(expr.left, env);
      const r = evalAstNumeric(expr.right, env);
      switch (expr.op) {
        case '+':
        case '-': {
          // Convenience for complex impedance shorthand: `50 + j*30 Ohm` or `50 - j*20 kOhm`
          if (
            dimIsZero(l.dim) &&
            !l.logKind &&
            !l.dataKind &&
            isPurelyReal(l) &&
            !dimIsZero(r.dim) &&
            isPurelyImag(r)
          ) {
            const unit = r.unitHint ?? extractAttachedUnit(expr.right);
            if (unit) {
              const promotedL = applyUnit(l, unit);
              return expr.op === '+' ? vAdd(promotedL, r) : vSub(promotedL, r);
            }
          }
          if (
            dimIsZero(r.dim) &&
            !r.logKind &&
            !r.dataKind &&
            isPurelyImag(r) &&
            !dimIsZero(l.dim) &&
            isPurelyReal(l)
          ) {
            const unit = l.unitHint ?? extractAttachedUnit(expr.left);
            if (unit) {
              const promotedR = applyUnit(r, unit);
              return expr.op === '+' ? vAdd(l, promotedR) : vSub(l, promotedR);
            }
          }
          return expr.op === '+' ? vAdd(l, r) : vSub(l, r);
        }
        case '*':
          return vMul(l, r);
        case '/':
          return vDiv(l, r);
        case '^':
          return vPow(l, r);
        case '∠':
          return vPolar(l, r);
        case '||':
          return vParallel(l, r);
      }
    }

    case 'convert': {
      const inner = evalAstNumeric(expr.expr, env);
      return vConvert(inner, expr.target);
    }

    case 'assign':
      return evalAstNumeric(expr.expr, env);

    case 'call':
      return evalFunctionCall(expr.name, expr.args, env);
  }
}

function evalFunctionCall(rawName: string, args: readonly Expr[], env: EvalEnv): CalcValue {
  const fn = rawName.toLowerCase();

  // Definite integral inside a numeric expression: `int(expr, x, a, b)`
  if ((fn === 'int' || fn === 'integrate') && args.length === 4) {
    return evalDefiniteIntegral(args[0], args[1], args[2], args[3], env).value;
  }

  const evalArgs = args.map((a) => evalAstNumeric(a, env));
  const req = (count: number) => {
    if (evalArgs.length !== count) {
      throw new CalcError(`${rawName}() expects ${count} argument${count === 1 ? '' : 's'} (got ${evalArgs.length})`);
    }
  };

  switch (fn) {
    case 'sin': req(1); return vSin(evalArgs[0]);
    case 'cos': req(1); return vCos(evalArgs[0]);
    case 'tan': req(1); return vTan(evalArgs[0]);
    case 'sec': req(1); return vDiv(makeScalar(1), vCos(evalArgs[0]));
    case 'csc': req(1); return vDiv(makeScalar(1), vSin(evalArgs[0]));
    case 'cot': req(1); return vDiv(makeScalar(1), vTan(evalArgs[0]));
    case 'asin': req(1); return vAsin(evalArgs[0]);
    case 'acos': req(1); return vAcos(evalArgs[0]);
    case 'atan': req(1); return vAtan(evalArgs[0]);
    case 'atan2': req(2); return vAtan2(evalArgs[0], evalArgs[1]);
    case 'sinh': req(1); return vSinh(evalArgs[0]);
    case 'cosh': req(1); return vCosh(evalArgs[0]);
    case 'tanh': req(1); return vTanh(evalArgs[0]);
    case 'asinh': req(1); return vAsinh(evalArgs[0]);
    case 'acosh': req(1); return vAcosh(evalArgs[0]);
    case 'atanh': req(1); return vAtanh(evalArgs[0]);
    case 'sqrt': req(1); return vSqrt(evalArgs[0]);
    case 'cbrt': req(1); return vCbrt(evalArgs[0]);
    case 'abs': req(1); return vAbs(evalArgs[0]);
    case 'arg': req(1); return vArg(evalArgs[0]);
    case 'angle': req(1); return vAngle(evalArgs[0]);
    case 're': req(1); return vRe(evalArgs[0]);
    case 'im': req(1); return vIm(evalArgs[0]);
    case 'conj': req(1); return vConj(evalArgs[0]);
    case 'polar': req(2); return vPolar(evalArgs[0], evalArgs[1]);
    case 'exp': req(1); return vExp(evalArgs[0]);
    case 'ln': req(1); return vLn(evalArgs[0]);
    case 'log':
    case 'log10': req(1); return vLog10(evalArgs[0]);
    case 'log2': req(1); return vLog2(evalArgs[0]);
    case 'floor': req(1); return vFloor(evalArgs[0]);
    case 'ceil': req(1); return vCeil(evalArgs[0]);
    case 'round': req(1); return vRound(evalArgs[0]);
    case 'min': return vMin(...evalArgs);
    case 'max': return vMax(...evalArgs);
    case 'db': req(1); return vDb(evalArgs[0]);
    case 'db20': req(1); return vDb20(evalArgs[0]);
    case 'db10': req(1); return vDb10(evalArgs[0]);
    case 'dbm': req(1); return vDbm(evalArgs[0]);
    case 'fromdbm': req(1); return vFromDbm(evalArgs[0]);
    case 'fromdb':
    case 'fromdb20': {
      req(1);
      const a = evalArgs[0];
      if (!dimIsZero(a.dim) || (a.logKind && a.logKind !== 'dB') || a.dataKind) {
        throw new CalcError(`${rawName}() expects a dB or dimensionless value`);
      }
      return makeScalar(Math.pow(10, a.re / 20));
    }
    case 'fromdb10': {
      req(1);
      const a = evalArgs[0];
      if (!dimIsZero(a.dim) || (a.logKind && a.logKind !== 'dB') || a.dataKind) {
        throw new CalcError(`${rawName}() expects a dB or dimensionless value`);
      }
      return makeScalar(Math.pow(10, a.re / 10));
    }
    case 'parallel': return vParallel(...evalArgs);
    default:
      throw new CalcError(`Unknown function: "${rawName}()"`);
  }
}

function evalDefiniteIntegral(
  body: Expr,
  varArg: Expr,
  lowerExpr: Expr,
  upperExpr: Expr,
  env: EvalEnv,
): { value: CalcValue; methodNote: string } {
  if (varArg.kind !== 'ident') {
    throw new CalcError('Integration variable must be an identifier (e.g. int(x^2, x, 0, 3))');
  }
  const varName = varArg.name;
  const loVal = evalAstNumeric(lowerExpr, env);
  const hiVal = evalAstNumeric(upperExpr, env);
  if (!dimEqual(loVal.dim, hiVal.dim)) {
    throw new CalcError('Integration bounds must have matching dimensions');
  }
  if (Math.abs(loVal.im) > ZERO_EPS || Math.abs(hiVal.im) > ZERO_EPS) {
    throw new CalcError('Definite integration requires real bounds');
  }

  const baseVars = env.vars ?? {};
  const evalAt = (x: number): CalcValue =>
    evalAstNumeric(body, {
      ...env,
      vars: { ...baseVars, [varName]: makeScalar(x, loVal.dim) },
    });

  // Sample midpoint to determine output dimension & realness
  const mid = 0.5 * (loVal.re + hiVal.re);
  const sample = evalAt(mid);
  const outDim = vMul(sample, makeScalar(1, loVal.dim)).dim;

  const numResult = integrateNumeric(
    (x) => {
      const v = evalAt(x);
      if (Math.abs(v.im) > ZERO_EPS * Math.max(1, Math.abs(v.re))) {
        throw new CalcError('Numerical definite integration requires a real integrand');
      }
      return v.re;
    },
    loVal.re,
    hiVal.re,
  );

  // Try exact FTC when dimensionless & closed-form antiderivative exists, verified against G7-K15
  if (dimIsZero(loVal.dim) && dimIsZero(sample.dim)) {
    const anti = integrateSymbolic(body, varName);
    if (anti) {
      try {
        const fb = evalAstNumeric(anti, { ...env, vars: { ...baseVars, [varName]: hiVal } });
        const fa = evalAstNumeric(anti, { ...env, vars: { ...baseVars, [varName]: loVal } });
        const diff = vSub(fb, fa);
        if (
          Number.isFinite(diff.re) &&
          Math.abs(diff.im) <= 1e-9 &&
          Math.abs(diff.re - numResult.value) <= 1e-5 * Math.max(1, Math.abs(numResult.value))
        ) {
          return {
            value: makeScalar(Math.abs(diff.re) < 1e-14 ? 0 : diff.re, outDim),
            methodNote: 'Exact FTC (verified numerically)',
          };
        }
      } catch {
        // Fall through to numerical result
      }
    }
  }

  return {
    value: makeScalar(numResult.value, outDim),
    methodNote: 'Adaptive Gauss-Kronrod G7-K15',
  };
}

function buildNumericResult(
  value: CalcValue,
  inputLatex: string,
  assignedName?: string,
  methodNote?: string,
): EvalNumericResult {
  return {
    kind: 'value',
    value,
    text: formatValueText(value),
    latex: formatValueLatex(value),
    baseSI: formatBaseSI(value),
    inputLatex,
    assignedName,
    hints: getCompanionHints(value),
    conversions: suggestConversions({
      dim: value.dim,
      angleKind: value.angleKind,
      logKind: value.logKind,
      tempKind: value.tempKind,
      dataKind: value.dataKind,
    }),
    methodNote,
  };
}

/**
 * Parse and evaluate a single Smart Calculator input string.
 * Supports numeric/unit arithmetic, assignments, conversions, phasors,
 * symbolic `diff`/`d/dx`, symbolic `int`/`integrate`, and definite `int(f, x, a, b)`.
 */
export function evaluateInput(input: string, env: EvalEnv = {}): EvalResult {
  const ast = parseExpression(input);
  const inputLatex = exprToLatex(ast);

  const assignedName = ast.kind === 'assign' ? ast.name : undefined;
  const target = ast.kind === 'assign' ? ast.expr : ast;

  if (target.kind === 'call') {
    const fn = target.name.toLowerCase();

    // Symbolic differentiation: diff(expr, x) or diff(expr, x, n)
    if (fn === 'diff') {
      if (target.args.length < 2 || target.args.length > 3) {
        throw new CalcError('diff() expects 2 or 3 arguments: diff(expr, x[, order])');
      }
      const varArg = target.args[1];
      if (varArg.kind !== 'ident') {
        throw new CalcError('Differentiation variable must be an identifier (e.g. diff(x^3, x))');
      }
      let order = 1;
      if (target.args.length === 3) {
        const ordVal = evalAstNumeric(target.args[2], env);
        order = ordVal.re;
      }
      const derived = simplifyExpr(differentiate(target.args[0], varArg.name, order));
      return {
        kind: 'symbolic',
        expr: derived,
        text: exprToText(derived),
        latex: exprToLatex(derived),
        inputLatex,
        assignedName,
      };
    }

    // Indefinite or definite integration
    if (fn === 'int' || fn === 'integrate') {
      if (target.args.length === 2) {
        const varArg = target.args[1];
        if (varArg.kind !== 'ident') {
          throw new CalcError('Integration variable must be an identifier (e.g. int(x^2, x))');
        }
        const anti = integrateSymbolic(target.args[0], varArg.name);
        if (!anti) {
          throw new CalcError(
            `No closed-form antiderivative found for ${exprToText(target.args[0])}. Pass bounds int(expr, ${varArg.name}, a, b) for numerical integration.`,
          );
        }
        const simplified = simplifyExpr(anti);
        return {
          kind: 'symbolic',
          expr: simplified,
          text: `${exprToText(simplified)} + C`,
          latex: `${exprToLatex(simplified)} + C`,
          inputLatex,
          isIndefiniteIntegral: true,
          assignedName,
        };
      }
      if (target.args.length === 4) {
        const def = evalDefiniteIntegral(target.args[0], target.args[1], target.args[2], target.args[3], env);
        return buildNumericResult(def.value, inputLatex, assignedName, def.methodNote);
      }
      throw new CalcError(`${target.name}() expects 2 arguments (indefinite) or 4 arguments (definite: expr, x, a, b)`);
    }
  }

  const value = evalAstNumeric(target, env);
  return buildNumericResult(value, inputLatex, assignedName);
}

/** Strip inline `# ...` or `// ...` comments from a notebook line. */
function stripInlineComment(raw: string): string {
  const hashIdx = raw.indexOf('#');
  const slashIdx = raw.indexOf('//');
  let cut = raw.length;
  if (hashIdx >= 0 && hashIdx < cut) cut = hashIdx;
  if (slashIdx >= 0 && slashIdx < cut) cut = slashIdx;
  return raw.slice(0, cut).trim();
}

/**
 * Evaluate a multi-line Notebook scratchpad top-to-bottom.
 * Supports `# comments`, `// comments`, variable assignments, `prev`, and `line1`..`lineN`.
 */
export function evaluateNotebook(
  text: string,
  initialVars: Readonly<Record<string, CalcValue>> = {},
): NotebookEvaluation {
  const rawLines = text.split(/\r?\n/);
  const vars: Record<string, CalcValue> = { ...initialVars };
  const lineValues: (CalcValue | undefined)[] = [];
  const results: NotebookLineResult[] = [];
  let prev: CalcValue | undefined;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const trimmed = raw.trim();
    if (!trimmed) {
      lineValues.push(undefined);
      results.push({ lineNumber: i + 1, raw, kind: 'empty' });
      continue;
    }
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      lineValues.push(undefined);
      results.push({ lineNumber: i + 1, raw, kind: 'comment' });
      continue;
    }

    const code = stripInlineComment(raw);
    try {
      const res = evaluateInput(code, { vars, ans: prev, prev, lineValues });
      if (res.kind === 'value') {
        if (res.assignedName) vars[res.assignedName] = res.value;
        prev = res.value;
        lineValues.push(res.value);
        results.push({ lineNumber: i + 1, raw, kind: 'value', result: res });
      } else {
        lineValues.push(undefined);
        results.push({ lineNumber: i + 1, raw, kind: 'symbolic', result: res });
      }
    } catch (err) {
      lineValues.push(undefined);
      const message = err instanceof Error ? err.message : String(err);
      results.push({ lineNumber: i + 1, raw, kind: 'error', error: message });
    }
  }

  return { lines: results, vars };
}
