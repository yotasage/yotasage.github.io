// The band figures in words (step M7.3; the texts of M7.2b's figures rewritten): shared by the figures under the plot
// and the report, framework-free so the harness checks them in Node. An interval with an open end runs on past the
// swept band, so its width is only known to be at least the part swept, and the loaded Q from such a width at most.

import { formatAmount, formatReturnLoss } from '../../lib/quantity';
import type { BandFigures, Interval } from '../../lib/smith/sweep';
import { translate } from '../../lib/ui/i18n';
import type { Locale } from '../../lib/ui/translations';
import { getSmithLocale } from './smithText';

export const hzText = (f: number, d: number): string => formatAmount(f, 'Hz', d, true);

/** Where an interval lies: "95.10 MHz – 104.9 MHz", or in words when it runs past the band's start or end. */
export function spanText(iv: Interval, d: number, locale: Locale = getSmithLocale()): string {
  const lo = hzText(iv.lo, d), hi = hzText(iv.hi, d);
  if (iv.openLo && iv.openHi) return translate(locale, 'sm.bt.wholeBand', { lo, hi });
  if (iv.openLo) return translate(locale, 'sm.bt.openLo', { lo, hi });
  if (iv.openHi) return translate(locale, 'sm.bt.openHi', { lo, hi });
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
export function figureTexts(fig: BandFigures, f0: number, limit: number, d: number, locale: Locale = getSmithLocale()): FigureTexts {
  const a = fig.atF0, q = fig.q;
  let f0Text: FigureText;
  if (a) {
    const open = a.openLo || a.openHi, least = open ? translate(locale, 'sm.bt.atLeast') : '';
    f0Text = [
      `${spanText(a, d, locale)}:`,
      translate(locale, 'sm.bt.f0Detail', {
        least,
        bw: formatAmount(a.hi - a.lo, 'Hz', d, true),
        frac: formatAmount(100 * fig.fractional, '%', d, true),
      }),
    ];
  } else if (!(f0 >= fig.start && f0 <= fig.stop)) {
    f0Text = [translate(locale, 'sm.bt.none'), translate(locale, 'sm.bt.f0Outside', { f0: hzText(f0, d) })];
  } else {
    f0Text = [translate(locale, 'sm.bt.none'), translate(locale, 'sm.bt.f0Worse')];
  }
  let qText: FigureText;
  if (!q) qText = [translate(locale, 'sm.bt.none'), translate(locale, 'sm.bt.qNone')];
  else if (q.openLo || q.openHi) {
    qText = [
      translate(locale, 'sm.bt.qAtMost', { q: formatAmount(q.q, '', d, true) }),
      translate(locale, 'sm.bt.qOpenDetail', {
        f: hzText(q.f, d),
        both: q.openLo && q.openHi ? translate(locale, 'sm.bt.qBothSides') : '',
      }),
    ];
  } else qText = [formatAmount(q.q, '', d, true), translate(locale, 'sm.bt.atFreq', { f: hzText(q.f, d) })];
  return {
    worst: [formatReturnLoss(fig.worstRL, d), translate(locale, 'sm.bt.atFreq', { f: hzText(fig.worst.f, d) })],
    best: [formatReturnLoss(fig.bestRL, d), translate(locale, 'sm.bt.atFreq', { f: hzText(fig.best.f, d) })],
    vswr: [formatAmount(fig.maxVswr, '', d, true), ''],
    limitLabel: translate(locale, 'sm.bt.limitLabel', { limit: formatAmount(limit, 'dB', 4) }),
    intervals: fig.intervals.length === 0 ? [translate(locale, 'sm.bt.nowhere')] : fig.intervals.map((iv) => spanText(iv, d, locale)),
    f0: f0Text,
    q: qText,
  };
}
