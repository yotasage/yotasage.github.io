// Shared math formatting & sizing helpers (pure TypeScript, framework-free).
// Used by KatexSpan, SafeKatex, Equations/math, and MathSettingsProvider.

export const DEFAULT_MATH_SCALE = 115;
export const MIN_MATH_SCALE = 60;
export const MAX_MATH_SCALE = 300;
export const MATH_SCALE_PRESETS = [90, 100, 115, 130, 150] as const;

export const MATH_SCALE_STORAGE_KEY = 'ds.mathScale';
export const FULL_FRACTIONS_STORAGE_KEY = 'ds.mathFullFractions';

/**
 * Clamp and round a math scale percentage into the safe range [60, 300].
 * Non-finite inputs fall back to DEFAULT_MATH_SCALE.
 */
export function clampMathScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MATH_SCALE;
  const rounded = Math.round(value);
  if (rounded < MIN_MATH_SCALE) return MIN_MATH_SCALE;
  if (rounded > MAX_MATH_SCALE) return MAX_MATH_SCALE;
  return rounded;
}

/**
 * Parse a user-entered percentage string (e.g. "135", "135%", "125.4").
 * Returns null if the string does not represent a finite positive number.
 */
export function parseMathScaleInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/%$/, '').trim();
  if (!cleaned) return null;
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return clampMathScale(num);
}

/**
 * Promote standalone `\frac` commands to `\dfrac` so inline and nested fractions
 * render at full display size (matching LaTeX `\displaystyle` / `amsmath` `\dfrac`)
 * instead of shrinking to hard-to-read scriptsize in MathML output.
 *
 * Preserves:
 * - Escaped linebreaks (`\\frac` stays `\\frac`)
 * - Other fraction commands (`\dfrac`, `\tfrac`, `\cfrac`, `\fracfoo`)
 * - Fractions nested inside explicit superscripts or subscripts (`x^{\frac{1}{2}}`,
 *   `\int_0^{\frac{\pi}{2}}`) so exponents and limits keep natural LaTeX proportions.
 */
export function promoteFractionsToDisplay(tex: string): string {
  if (!tex || !tex.includes('\\frac')) return tex;

  let out = '';
  // Each entry on the brace stack records whether that `{...}` group was opened
  // directly after `^` or `_` (a script group).
  const braceIsScript: boolean[] = [];
  let scriptDepth = 0;
  let pendingScript = false;

  const n = tex.length;
  let i = 0;

  while (i < n) {
    const ch = tex[i];

    if (ch === '\\') {
      // Escaped control symbol (including `\\` newline, `\{`, `\}`, `\_`, `\^`, etc.)
      if (i + 1 < n && !/[A-Za-z]/.test(tex[i + 1])) {
        out += tex.slice(i, i + 2);
        i += 2;
        pendingScript = false;
        continue;
      }

      // Control sequence `\<letters>`
      let j = i + 1;
      while (j < n && /[A-Za-z]/.test(tex[j])) j++;
      const cmd = tex.slice(i + 1, j);

      if (cmd === 'frac' && scriptDepth === 0 && !pendingScript) {
        out += '\\dfrac';
      } else {
        out += tex.slice(i, j);
      }

      i = j;
      pendingScript = false;
      continue;
    }

    if (ch === '^' || ch === '_') {
      out += ch;
      pendingScript = true;
      i++;
      continue;
    }

    if (ch === '{') {
      out += ch;
      braceIsScript.push(pendingScript);
      if (pendingScript) scriptDepth++;
      pendingScript = false;
      i++;
      continue;
    }

    if (ch === '}') {
      out += ch;
      const wasScript = braceIsScript.pop();
      if (wasScript && scriptDepth > 0) scriptDepth--;
      pendingScript = false;
      i++;
      continue;
    }

    if (pendingScript && /\s/.test(ch)) {
      out += ch;
      i++;
      continue;
    }

    out += ch;
    pendingScript = false;
    i++;
  }

  return out;
}
