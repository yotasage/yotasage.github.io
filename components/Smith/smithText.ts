// Locale-aware display helpers for Smith Chart UI strings that originate in pure lib/smith modules.
// Keeping these in components/Smith/ preserves 100% backwards compatibility with lib/smith unit tests.

import type { Circuit, Form, Unknown } from '../../lib/smith/state';
import { translate } from '../../lib/ui/i18n';
import type { Locale, TranslationKey } from '../../lib/ui/translations';

let activeLocale: Locale = 'en';
export const getSmithLocale = (): Locale => activeLocale;
export const setSmithLocale = (locale: Locale): void => {
  activeLocale = locale;
};

/** Localized part kind name (0..9). */
export const kindName = (kind: number, locale: Locale = activeLocale): string =>
  translate(locale, `sm.kind.${kind}` as TranslationKey);

/** Localized short part name for strip tiles (0..9). */
export const kindShort = (kind: number, locale: Locale): string =>
  translate(locale, `sm.short.${kind}` as TranslationKey);

/** Localized part value name ("R", "L", "C", "length"/"lengde", "Zt"). */
export const valueName = (kind: number, locale: Locale): string =>
  translate(locale, `sm.valName.${kind}` as TranslationKey);

/** Localized unknown description ("f0", "part 1 (Series C)", "part 2's Zc"). */
export function unknownLabel(c: Circuit, u: Unknown, locale: Locale): string {
  if (u.param === 'f0') return 'f0';
  const p = c.parts[u.part];
  if (u.param === 'zc') return translate(locale, 'sm.strip.unknownZc', { n: u.part + 1 });
  return translate(locale, 'sm.strip.unknownPart', {
    n: u.part + 1,
    kind: p ? kindName(p.kind, locale) : '?',
  });
}

/** Localized form label (Length / θ at f0 / symbols unchanged). */
export function formLabel(form: Form, locale: Locale): string {
  if (form.id === 'len') return translate(locale, 'sm.form.len');
  if (form.id === 'deg') return translate(locale, 'sm.form.deg');
  return form.label;
}

/** Localized form hint. */
export function formHint(form: Form, locale: Locale): string | undefined {
  if (!form.hint) return undefined;
  if (form.hint === 'normalised') return translate(locale, 'sm.form.hint.norm');
  if (form.hint === 'at f0') return translate(locale, 'sm.form.hint.atF0');
  if (form.hint === 'wavelengths at f0') return translate(locale, 'sm.form.hint.wl');
  if (form.hint === 'electrical degrees') return translate(locale, 'sm.form.hint.deg');
  return form.hint;
}

const PROBLEM_KEYS: Readonly<Record<string, TranslationKey>> = {
  'Z0 must be a positive number of ohms': 'sm.err.z0',
  'f0 must be a positive frequency': 'sm.err.f0',
  'R must be 0 or more (∞ is an open)': 'sm.err.loadR',
  'X must be a finite number of ohms': 'sm.err.loadX',
  'R must be 0 or more': 'sm.err.valR',
  'L must be 0 or more': 'sm.err.valL',
  'C must be 0 or more': 'sm.err.valC',
  'the length must be 0 or more and finite': 'sm.err.valLen',
  'Zt must be a positive number of ohms': 'sm.err.valZt',
  'Zc must be a positive number of ohms': 'sm.err.valZc',
  'not a number': 'sm.err.notNum',
  'unknown part': 'sm.err.unknownPart',
  'a series C has negative reactance (or 0 for a short)': 'sm.err.xNeg',
  'a series L has positive reactance (or 0 for a short)': 'sm.err.xPos',
  'a shunt L has negative susceptance (or 0 for an open)': 'sm.err.bNeg',
  'a shunt C has positive susceptance (or 0 for an open)': 'sm.err.bPos',
  'a logarithmic band cannot start at 0 Hz': 'sm.err.bandLog0',
  'the start must be 0 Hz or more': 'sm.err.bandStart',
  'the stop must be above the start': 'sm.err.bandStop',
  'the band is too narrow for that many points': 'sm.err.bandNarrow',
};

/** Maps lib/smith/state.ts English validation errors to the active locale. */
export function localizeProblem(msg: string, locale: Locale): string {
  if (!msg || locale === 'en') return msg;
  const key = PROBLEM_KEYS[msg];
  if (key) return translate(locale, key);
  const pts = /^the points must be a whole number from 2 to (.+)$/.exec(msg);
  if (pts) return translate(locale, 'sm.err.bandPts', { max: pts[1] });
  const lim = /^the limit must be a return loss above 0 dB and at most (.+) dB$/.exec(msg);
  if (lim) return translate(locale, 'sm.err.limit', { max: lim[1] });
  return msg;
}

const UNIT_KEYS: Readonly<Record<string, TranslationKey>> = {
  Ω: 'sm.unit.ohms',
  S: 'sm.unit.siemens',
  H: 'sm.unit.henries',
  F: 'sm.unit.farads',
  Hz: 'sm.unit.hertz',
  λ: 'sm.unit.wavelengths',
  '°': 'sm.unit.degrees',
};

export const unitWord = (unit: string, locale: Locale = activeLocale): string =>
  UNIT_KEYS[unit] ? translate(locale, UNIT_KEYS[unit]) : unit;

/** Localized title for a Smith equation registry id, falling back to fallbackTitle. */
export function eqTitle(id: string, fallbackTitle: string, locale: Locale = activeLocale): string {
  const key = `sm.eq.${id}` as TranslationKey;
  const out = translate(locale, key);
  return out === key ? fallbackTitle : out;
}
