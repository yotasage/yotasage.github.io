// The side panel's texts while a handle is dragged (step M3.3a, engine.md §9): React renders the panels from the
// committed circuit only, so during a drag the path layer calls `writeLive` in its frame with the circuit as dragged
// and the texts that change are written straight into the DOM: the node table from the dragged part on, the goal
// distance, the part's tile and card fields, and the circuit input. Every element written holds one text that React
// itself writes with the same functions, so the commit on release renders exactly what is shown. The texts come in two
// halves (each text costs layout and paint: 3–5 ms a frame at 4× CPU for all of them): the part's own texts, the
// circuit input, the goal and the first half of the changed table rows; then the other rows.

import { formatAmount } from '../../lib/quantity';
import type { Circuit } from '../../lib/smith/network';
import { circuitInputGamma, formsOf, formValue } from '../../lib/smith/state';
import { nodeTexts } from './Nodes';
import { GOAL_MAG } from './pathLayer';
import { READOUT_DIGITS, readoutTexts } from './readout';
import { formText } from './Strip';

const INPUT = [['z', 0], ['Z', 1], ['gamma', 4], ['vswr', 6], ['rl', 7]] as const;
const g = [0, 0];
const texts: string[] = [];

const put = (el: Element | null, t: string): void => { if (el && el.textContent !== t) el.textContent = t; };

/**
 * Writes the texts that the dragged part (index from the load) changes, for the circuit c, under root: `half` 0 the
 * part's own texts, the circuit input, the goal and the first half of the node rows after the part, 1 the rest of the
 * rows, −1 all of them.
 */
export function writeLive(root: ParentNode, c: Circuit, part: number, half = -1): void {
  const n = c.parts.length, mid = part + 1 + ((n - part + 1) >> 1);
  const rows = nodeTexts(c);
  for (let k = half === 1 ? mid : part + 1, end = half === 0 ? mid - 1 : n; k <= end; k++) {
    const row = root.querySelector(`[data-node-row="${k}"]`);
    if (!row) break;
    put(row.querySelector('[data-v="z"]'), rows[k].z);
    put(row.querySelector('[data-v="gamma"]'), rows[k].gamma);
    put(row.querySelector('[data-v="vswr"]'), rows[k].vswr);
    put(row.querySelector('[data-v="rl"]'), rows[k].rl);
  }
  if (half === 1) return;
  circuitInputGamma(g, 0, c);
  const mag = Math.hypot(g[0], g[1]);
  const goal = root.querySelector('[data-goal-text]');
  if (goal) {
    put(goal.querySelector('[data-goal-distance]'), formatAmount(mag, '', READOUT_DIGITS, true));
    put(goal.querySelector('strong'), mag <= GOAL_MAG ? 'inside' : 'outside');
    goal.toggleAttribute('data-inside', mag <= GOAL_MAG);
  }
  const p = c.parts[part], forms = formsOf(p.kind);
  put(root.querySelector(`[data-tile="${part}"] [data-tile-value]`), formText(forms[0], formValue(forms[0].id, p, c)));
  const card = root.querySelector(`[data-card="${part}"]`);
  if (card) {
    for (const f of forms) {
      const input = card.querySelector<HTMLInputElement>(`[data-name="p${part + 1}-${f.id}"] input`);
      if (!input || input === document.activeElement) continue;
      const t = formText(f, formValue(f.id, p, c));
      if (input.value !== t) input.value = t;
    }
  }
  readoutTexts(g[0], g[1], c.z0, texts);
  for (const [key, i] of INPUT) put(root.querySelector(`[data-input="${key}"]`), texts[i]);
}
