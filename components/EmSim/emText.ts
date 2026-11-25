// Shared localization helpers for EM Simulation components and pure helpers.
// Node harnesses default to 'en'; EmSimTool syncs the active UI locale via setEmLocale().

import { translate } from '../../lib/ui/i18n';
import type { Locale, TranslationKey } from '../../lib/ui/translations';
import { TRANSLATIONS } from '../../lib/ui/translations';
import type { JlcPart } from '../../lib/emsim/jlcCalc';
import type { TraceKind } from '../../lib/emsim/structure';
import { KIND_INFO } from '../../lib/emsim/structure';
import type { FieldDrive, FieldQty } from './fieldTypes';
import { TOPIC_TITLE, WHYS } from './whys';

let currentLocale: Locale = 'en';

export function setEmLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getEmLocale(): Locale {
  return currentLocale;
}

export function emT(key: TranslationKey, vars?: Record<string, string | number>, locale: Locale = currentLocale): string {
  return translate(locale, key, vars);
}

export function emHasKey(key: string): key is TranslationKey {
  return key in TRANSLATIONS.en;
}

export function topicTitle(id: string, locale: Locale = currentLocale): string {
  const k = `em.topic.${id}`;
  return emHasKey(k) ? translate(locale, k) : TOPIC_TITLE[id] ?? id;
}

export function whyLabel(k: string, locale: Locale = currentLocale): string {
  const tk = `em.why.${k}.l`;
  return emHasKey(tk) ? translate(locale, tk) : WHYS[k]?.label ?? k;
}

export function whyText(k: string, locale: Locale = currentLocale): string {
  const tk = `em.why.${k}.t`;
  return emHasKey(tk) ? translate(locale, tk) : WHYS[k]?.text ?? '';
}

export function kindName(kind: TraceKind, locale: Locale = currentLocale): string {
  const tk = `em.kind.${kind}`;
  return emHasKey(tk) ? translate(locale, tk) : KIND_INFO[kind]?.name ?? kind;
}

export function modeLabel(raw: string | undefined, index: number, locale: Locale = currentLocale): string {
  if (!raw) return translate(locale, 'em.tools.modeN', { n: index + 1 });
  if (raw === 'odd') return translate(locale, 'em.res.modeOdd');
  if (raw === 'even') return translate(locale, 'em.res.modeEven');
  return raw;
}

export function jlcPartLabel(part: JlcPart, locale: Locale = currentLocale): string {
  return translate(locale, `em.calc.part.${part}` as TranslationKey);
}

export function fieldQtyLabel(qty: FieldQty, locale: Locale = currentLocale): string {
  return translate(locale, `em.fld.qty.${qty}` as TranslationKey);
}

export function fieldDriveLabel(drive: FieldDrive, locale: Locale = currentLocale): string {
  return translate(locale, `em.fld.drv.${drive}` as TranslationKey);
}

export function neglectText(k: string, locale: Locale = currentLocale): string {
  if (k === 'solder mask') return translate(locale, 'em.calc.neglect.solderMask');
  if (k === 'copper thickness') return translate(locale, 'em.calc.neglect.copperThickness');
  if (k === 'finite ground width') return translate(locale, 'em.calc.neglect.finiteGround');
  return translate(locale, 'em.calc.neglectOther', { what: k });
}

export function neglectName(k: string, locale: Locale = currentLocale): string {
  if (k === 'solder mask') return translate(locale, 'em.calc.neglectName.solderMask');
  if (k === 'copper thickness') return translate(locale, 'em.calc.neglectName.copperThickness');
  if (k === 'finite ground width') return translate(locale, 'em.calc.neglectName.finiteGround');
  return k;
}
