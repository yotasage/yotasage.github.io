// Maths as MathML for the equation panels and the derivation dialog of the Smith chart and the EM simulation (moved
// from components/Smith/MathPanel.tsx by EM step M4.3a, docs/em-sim/notes-M0.5.md item 1b). KaTeX writes MathML only,
// which the browser draws itself (no stylesheet, no fonts). Only modules loaded on use import this, so KaTeX stays out
// of a page's first load where the page wants that.

import katex from 'katex';

import { promoteFractionsToDisplay } from '../../lib/ui/mathFormat';

// A page's sentinel colours (\color{#0aCCVV}: colour CC, the variable's index VV in its row) become a class and the
// variable's target in the MathML (learning.md §2 of the Smith chart: \htmlClass is dropped in MathML output).
const SENTINEL = /mathcolor="#0a([0-9a-f]{2})([0-9a-f]{2})"/g;

/**
 * TeX as MathML in display style unless `inline` (maths within a sentence: a derivation's reasons). The sentinel
 * colours become `classes[colour]` and `data-mt` = `targets[index]` (pages without sentinels pass neither).
 */
export function mathHtml(tex: string, targets: readonly string[] = [], inline = false, classes: readonly string[] = []): string {
  const normalized = promoteFractionsToDisplay(tex);
  return katex.renderToString(inline ? normalized : `\\displaystyle ${normalized}`, { output: 'mathml' }).replace(SENTINEL, (_, c: string, v: string) => {
    const t = targets[parseInt(v, 16)];
    return `class="${classes[parseInt(c, 16)] ?? ''}"${t ? ` data-mt="${t}"` : ''}`;
  });
}
