// When the Via section suggests a full-wave run (step M7.1a, from notes-M6.4c.md "For M7" and fullwave-verify.md §5),
// and the hand-over to the Waves section: the link's click asks for the via and the hash #waves loads the section; a
// section not mounted yet reads the request when it mounts. In the Via chunk: no engine here.

import type { ViaModelResult } from '../../lib/emsim/viamodel';
import type { Locale } from '../../lib/ui/translations';
import { emT, getEmLocale } from './emText';

export type WavesKindAsk = 'via' | 'trace';
export const FEED_OVER_MM = 0.1; // a feed crossing its antipad by more reads low in the model (−15 % at 0.3 mm)
export const WAVES_EVENT = 'emsim-waves';
let asked: WavesKindAsk | null = null;

/** The reasons to check this via full-wave (empty: the model holds as far as M6.4c measured). Without numbers (the
 *  flags above have them), so the line keeps its length while a handle is dragged. */
export function suggestFullWave(r: ViaModelResult, locale: Locale = getEmLocale()): string[] {
  const out: string[] = [];
  for (const f of r.flags) {
    if (f.code === 'feed-over-antipad' && f.numbers[0] > FEED_OVER_MM) out.push(emT('em.wav.sug.feedOver', undefined, locale));
    if (f.code === 'return-far') out.push(emT('em.wav.sug.returnFar', undefined, locale));
    if (f.code === 'no-return') out.push(emT('em.wav.sug.noReturn', undefined, locale));
  }
  if (r.valid && r.band > r.valid.fMax) out.push(emT('em.wav.sug.band', undefined, locale));
  const st = r.stubs.filter((s) => s.fRes < 2 * r.band).sort((a, b) => a.fRes - b.fRes)[0];
  if (st) out.push(emT('em.wav.sug.stub', { side: emT(st.side === 'entry' ? 'em.via.entry' : 'em.via.exit', undefined, locale) }, locale));
  return out;
}

/** Asks the Waves section for a kind (the link's click; the hash loads the section). */
export function askWaves(kind: WavesKindAsk): void {
  asked = kind;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(WAVES_EVENT, { detail: kind }));
}
/** The kind asked before the section mounted (read once). */
export function takeWavesAsk(): WavesKindAsk | null { const k = asked; asked = null; return k; }
