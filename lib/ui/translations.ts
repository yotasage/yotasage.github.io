import { en as calculatorEn, nb as calculatorNb } from './i18n/calculator';
import { en as commonEn, nb as commonNb } from './i18n/common';
import { en as eeEn, nb as eeNb } from './i18n/ee';
import { en as homeEn, nb as homeNb } from './i18n/home';
import { en as notepadEn, nb as notepadNb } from './i18n/notepad';
import { en as paintEn, nb as paintNb } from './i18n/paint';
import { en as pdfEn, nb as pdfNb } from './i18n/pdf';
import { en as simsetupEn, nb as simsetupNb } from './i18n/simsetup';
import { en as utilitiesEn, nb as utilitiesNb } from './i18n/utilities';
import { en as viewersEn, nb as viewersNb } from './i18n/viewers';

export type Locale = 'en' | 'nb';

export const LOCALES: readonly Locale[] = ['en', 'nb'] as const;

export const en = {
  ...commonEn,
  ...homeEn,
  ...calculatorEn,
  ...simsetupEn,
  ...eeEn,
  ...utilitiesEn,
  ...notepadEn,
  ...paintEn,
  ...pdfEn,
  ...viewersEn,
} as const;

export type TranslationKey = keyof typeof en;

export const nb: Record<TranslationKey, string> = {
  ...commonNb,
  ...homeNb,
  ...calculatorNb,
  ...simsetupNb,
  ...eeNb,
  ...utilitiesNb,
  ...notepadNb,
  ...paintNb,
  ...pdfNb,
  ...viewersNb,
};

export const TRANSLATIONS: Record<Locale, Record<TranslationKey, string>> = {
  en,
  nb,
};
