import { en as booleanEn, nb as booleanNb } from './i18n/boolean';
import { en as calculatorEn, nb as calculatorNb } from './i18n/calculator';
import { en as calculusEn, nb as calculusNb } from './i18n/calculus';
import { en as commonEn, nb as commonNb } from './i18n/common';
import { en as eeEn, nb as eeNb } from './i18n/ee';
import { en as homeEn, nb as homeNb } from './i18n/home';
import { en as notepadEn, nb as notepadNb } from './i18n/notepad';
import { en as paintEn, nb as paintNb } from './i18n/paint';
import { en as pdfEn, nb as pdfNb } from './i18n/pdf';
import { en as pythonEn, nb as pythonNb } from './i18n/python';
import { en as pythonDisplayEn, nb as pythonDisplayNb } from './i18n/python-display';
import { en as pythonExamplesEn, nb as pythonExamplesNb } from './i18n/python-examples';
import { en as pythonFilesEn, nb as pythonFilesNb } from './i18n/python-files';
import { en as pythonLayoutEn, nb as pythonLayoutNb } from './i18n/python-layout';
import { en as pythonPackagesEn, nb as pythonPackagesNb } from './i18n/python-packages';
import { en as simsetupEn, nb as simsetupNb } from './i18n/simsetup';
import { en as utilitiesEn, nb as utilitiesNb } from './i18n/utilities';
import { en as viewersEn, nb as viewersNb } from './i18n/viewers';

export type Locale = 'en' | 'nb';

export const LOCALES: readonly Locale[] = ['en', 'nb'] as const;

export const en = {
  ...commonEn,
  ...homeEn,
  ...booleanEn,
  ...calculatorEn,
  ...calculusEn,
  ...simsetupEn,
  ...eeEn,
  ...utilitiesEn,
  ...notepadEn,
  ...paintEn,
  ...pdfEn,
  ...pythonEn,
  ...pythonExamplesEn,
  ...pythonDisplayEn,
  ...pythonFilesEn,
  ...pythonLayoutEn,
  ...pythonPackagesEn,
  ...viewersEn,
} as const;

export type TranslationKey = keyof typeof en;

export const nb: Record<TranslationKey, string> = {
  ...commonNb,
  ...homeNb,
  ...booleanNb,
  ...calculatorNb,
  ...calculusNb,
  ...simsetupNb,
  ...eeNb,
  ...utilitiesNb,
  ...notepadNb,
  ...paintNb,
  ...pdfNb,
  ...pythonNb,
  ...pythonExamplesNb,
  ...pythonDisplayNb,
  ...pythonFilesNb,
  ...pythonLayoutNb,
  ...pythonPackagesNb,
  ...viewersNb,
};

export const TRANSLATIONS: Record<Locale, Record<TranslationKey, string>> = {
  en,
  nb,
};
