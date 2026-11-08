// Aperture macros (%AM): parsing the body once, and turning it into the parts of an aperture for each %AD that uses
// it. All primitives of the current specification are supported, and the deprecated 2 (vector line), 22 (lower left
// line) and 6 (moiré). Exposure off erases the parts of the same macro before it, never what is under the flash.
import { ccwPoly } from '../geometry';
import { AperturePart, Pt } from '../model';
import { rectPoly, regularPoly, ringPoly, rotatePoly, rotatePt, thermalQuarter, vectorLinePoly } from './shapes';

type Expr = (vars: number[]) => number;

type Statement = { kind: 'var'; n: number; expr: Expr } | { kind: 'prim'; code: number; params: Expr[] };

export interface Macro {
  name: string;
  body: Statement[];
}

// Arithmetic expressions: numbers, $n, unary + and -, + - x / and brackets. Uppercase X is accepted for
// multiplication, as some old files use it.
function parseExpr(text: string): Expr {
  let i = 0;
  const s = text.replace(/\s+/g, '');
  const fail = () => {
    throw new Error(`cannot read the expression "${text}"`);
  };
  const factor = (): Expr => {
    const ch = s[i];
    if (ch === '+') {
      i += 1;
      return factor();
    }
    if (ch === '-') {
      i += 1;
      const f = factor();
      return (v) => -f(v);
    }
    if (ch === '(') {
      i += 1;
      const e = sum();
      if (s[i] !== ')') fail();
      i += 1;
      return e;
    }
    if (ch === '$') {
      i += 1;
      const m = /^\d+/.exec(s.slice(i));
      if (!m) fail();
      i += m[0].length;
      const n = Number(m[0]);
      return (v) => v[n] ?? 0;
    }
    const m = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(s.slice(i));
    if (!m) fail();
    i += m[0].length;
    const value = Number(m[0]);
    return () => value;
  };
  const product = (): Expr => {
    let left = factor();
    for (;;) {
      const op = s[i];
      if (op !== 'x' && op !== 'X' && op !== '/') return left;
      i += 1;
      const l = left;
      const r = factor();
      left = op === '/' ? (v) => l(v) / r(v) : (v) => l(v) * r(v);
    }
  };
  const sum = (): Expr => {
    let left = product();
    for (;;) {
      const op = s[i];
      if (op !== '+' && op !== '-') return left;
      i += 1;
      const l = left;
      const r = product();
      left = op === '+' ? (v) => l(v) + r(v) : (v) => l(v) - r(v);
    }
  };
  if (!s) return () => 0;
  const e = sum();
  if (i < s.length) fail();
  return e;
}

// `words` are the body of the %AM block, already split at '*'.
export function parseMacro(name: string, words: string[]): Macro {
  const body: Statement[] = [];
  for (const raw of words) {
    const word = raw.trim();
    if (!word) continue;
    // Comments: primitive code 0 followed by text.
    if (/^0(\s|$)/.test(word) || /^0,?[^\d$.+\-(]/.test(word)) continue;
    const assign = /^\$(\d+)\s*=(.*)$/s.exec(word);
    if (assign) {
      body.push({ kind: 'var', n: Number(assign[1]), expr: parseExpr(assign[2]) });
      continue;
    }
    const fields = word.replace(/\s+/g, '').split(',');
    const code = Number(fields[0]);
    if (!Number.isInteger(code)) throw new Error(`macro ${name} has an unknown statement "${word}"`);
    if (code === 0) continue;
    body.push({ kind: 'prim', code, params: fields.slice(1).map(parseExpr) });
  }
  return { name, body };
}

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

// The parts of an aperture made from a macro with the parameters of an %AD command, in file units.
export function evaluateMacro(macro: Macro, args: number[], warn: (message: string) => void): AperturePart[] {
  const vars: number[] = [];
  args.forEach((v, i) => {
    vars[i + 1] = v;
  });
  const parts: AperturePart[] = [];
  const polyPart = (dark: boolean, pts: Pt[] | null, rot: number) => {
    if (pts && pts.length >= 3) parts.push({ dark, poly: ccwPoly(rotatePoly(pts, rot)) });
  };
  for (const st of macro.body) {
    if (st.kind === 'var') {
      vars[st.n] = finite(st.expr(vars));
      continue;
    }
    const p = st.params.map((e) => finite(e(vars)));
    const at = (i: number) => p[i] ?? 0;
    switch (st.code) {
      case 1: {
        // Circle: exposure, diameter, x, y[, rotation]
        const dark = at(0) !== 0;
        const r = Math.abs(at(1)) / 2;
        if (r > 0) parts.push({ dark, circle: { c: rotatePt({ x: at(2), y: at(3) }, at(4)), r } });
        break;
      }
      case 2:
      case 20:
        // Vector line: exposure, width, start x, start y, end x, end y, rotation
        polyPart(at(0) !== 0, vectorLinePoly({ x: at(2), y: at(3) }, { x: at(4), y: at(5) }, Math.abs(at(1))), at(6));
        break;
      case 21: {
        // Center line: exposure, width, height, center x, center y, rotation
        const w = Math.abs(at(1));
        const h = Math.abs(at(2));
        if (w > 0 && h > 0) polyPart(at(0) !== 0, rectPoly(at(3), at(4), w, h), at(5));
        break;
      }
      case 22: {
        // Lower left line: exposure, width, height, lower left x, lower left y, rotation
        const w = Math.abs(at(1));
        const h = Math.abs(at(2));
        if (w > 0 && h > 0) polyPart(at(0) !== 0, rectPoly(at(3) + w / 2, at(4) + h / 2, w, h), at(5));
        break;
      }
      case 4: {
        // Outline: exposure, n, then n + 1 points, rotation
        const n = Math.round(at(1));
        const pts: Pt[] = [];
        for (let k = 0; k <= n; k += 1) pts.push({ x: at(2 + 2 * k), y: at(3 + 2 * k) });
        const last = pts[pts.length - 1];
        if (pts.length > 1 && last.x === pts[0].x && last.y === pts[0].y) pts.pop();
        polyPart(at(0) !== 0, pts, at(4 + 2 * n));
        break;
      }
      case 5: {
        // Polygon: exposure, vertices, center x, center y, diameter, rotation
        const n = Math.round(at(1));
        if (n >= 3 && at(4) > 0) polyPart(at(0) !== 0, regularPoly(at(2), at(3), Math.abs(at(4)), n, 0), at(5));
        break;
      }
      case 6: {
        // Moiré: center x, center y, outer diameter, ring thickness, gap, rings, crosshair thickness and length,
        // rotation. Exposure is always on.
        const [cx, cy, outer, thickness, gap, rings, crossW, crossLen, rot] = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(at);
        let d = outer;
        for (let k = 0; k < Math.round(rings) && d > 0; k += 1) {
          const inner = d - 2 * thickness;
          polyPart(true, ringPoly(cx, cy, d / 2, Math.max(0, inner / 2)), rot);
          d = inner - 2 * gap;
        }
        if (crossW > 0 && crossLen > 0) {
          polyPart(true, rectPoly(cx, cy, crossLen, crossW), rot);
          polyPart(true, rectPoly(cx, cy, crossW, crossLen), rot);
        }
        break;
      }
      case 7: {
        // Thermal: center x, center y, outer diameter, inner diameter, gap, rotation. Exposure is always on. The four
        // quarters are separate solid parts, so it does not erase earlier parts of the macro.
        const [cx, cy, outer, inner, gap, rot] = [0, 1, 2, 3, 4, 5].map(at);
        for (let q = 0; q < 4; q += 1) {
          const quarter = thermalQuarter(Math.abs(outer) / 2, Math.abs(inner) / 2, Math.abs(gap), q);
          if (quarter) polyPart(true, quarter.map((pt) => ({ x: pt.x + cx, y: pt.y + cy })), rot);
        }
        break;
      }
      default:
        warn(`Macro ${macro.name} uses primitive ${st.code}, which does not exist; it was left out.`);
    }
  }
  return parts;
}
