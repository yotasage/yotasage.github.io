// The band figures in words (step M7.3; the texts of M7.2b's figures rewritten): shared by the figures under the plot
// and the report, framework-free so the harness checks them in Node. An interval with an open end runs on past the
// swept band, so its width is only known to be at least the part swept, and the loaded Q from such a width at most.

import { formatAmount, formatReturnLoss } from '../../lib/quantity';
import type { BandFigures, Interval } from '../../lib/smith/sweep';

export const hzText = (f: number, d: number): string => formatAmount(f, 'Hz', d, true);

/** Where an interval lies: "95.10 MHz – 104.9 MHz", or in words when it runs past the band's start or end. */
export function spanText(iv: Interval, d: number): string {
  const lo = hzText(iv.lo, d), hi = hzText(iv.hi, d);
  if (iv.openLo && iv.openHi) return `the whole band (${lo} – ${hi}), perhaps beyond both ends`;
  if (iv.openLo) return `from before the band’s start (${lo}) to ${hi}`;
  if (iv.openHi) return `from ${lo} to past the band’s end (${hi})`;
  return `${lo} – ${hi}`;
}

/** A figure's text: the value, and where or how in a quieter second part ('' when none). */
export type FigureText = readonly [string, string];

export interface FigureTexts {
  worst: FigureText;
  best: FigureText;
  vswr: FigureText;
  /** The intervals' label ("Return loss ≥ 10 dB") and one text per interval (or one saying there is none). */
  limitLabel: string;
  intervals: readonly string[];
  f0: FigureText;
  q: FigureText;
}

/** Every band figure in words, at `d` significant digits; f0 and the limit (a return loss in dB) as the page has them. */
export function figureTexts(fig: BandFigures, f0: number, limit: number, d: number): FigureTexts {
  const a = fig.atF0, q = fig.q;
  let f0Text: FigureText;
  if (a) {
    const open = a.openLo || a.openHi, least = open ? 'at least ' : '';
    f0Text = [`${spanText(a, d)}:`, `${least}${formatAmount(a.hi - a.lo, 'Hz', d, true)} wide, ${least}${formatAmount(100 * fig.fractional, '%', d, true)} of f0`];
  } else if (!(f0 >= fig.start && f0 <= fig.stop)) {
    f0Text = ['none:', `f0 (${hzText(f0, d)}) is outside the band`];
  } else {
    f0Text = ['none:', 'the match at f0 is worse than the limit'];
  }
  let qText: FigureText;
  if (!q) qText = ['none:', 'no power is delivered at the best match'];
  else if (q.openLo || q.openHi) {
    qText = [`at most ${formatAmount(q.q, '', d, true)}`,
      `at ${hzText(q.f, d)}; the band ends before the power falls to half${q.openLo && q.openHi ? ' on both sides' : ''}, so the true width is larger`];
  } else qText = [formatAmount(q.q, '', d, true), `at ${hzText(q.f, d)}`];
  return {
    worst: [formatReturnLoss(fig.worstRL, d), `at ${hzText(fig.worst.f, d)}`],
    best: [formatReturnLoss(fig.bestRL, d), `at ${hzText(fig.best.f, d)}`],
    vswr: [formatAmount(fig.maxVswr, '', d, true), ''],
    limitLabel: `Return loss ≥ ${formatAmount(limit, 'dB', 4)}`,
    intervals: fig.intervals.length === 0 ? ['nowhere in the band'] : fig.intervals.map((iv) => spanText(iv, d)),
    f0: f0Text,
    q: qText,
  };
}
