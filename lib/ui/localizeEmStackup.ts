import type { Locale } from './translations';

const REF_WHAT_NB: Record<string, string> = {
  A: 'JLCPCBs impedanskalkulators stablingsmaler (API, hentet 2026-11-16): tykkelser og εr',
  U1: 'JLCPCBs impedansside: stablinger, maskeparametere, kobber',
  U2: 'JLCPCBs kalkulatorguide: εr-tabeller, kobber, maske, toppbredde for bane',
  U3: 'JLCPCBs spesifikasjoner: FR-4 εr for 2-lags kort',
  G: 'JLCPCBs API-data for impedansmaler (2025-05-09), raw_json',
  S: 'JLCPCBs nettkalkulator (Polar Si9000): inndataene den sender, brukt av «som JLCPCBs kalkulator»',
};

export function localizeEmRefWhat(refKey: string, fallback: string, locale: Locale): string {
  if (locale === 'en') return fallback;
  return REF_WHAT_NB[refKey] ?? fallback;
}

export function localizeEmStackupName(name: string, locale: Locale): string {
  if (locale === 'en' || !name) return name;
  return name
    .replace(/(\d+)\s+layers/g, '$1 lag')
    .replace(/\bouter\b/g, 'ytre')
    .replace(/\binner\b/g, 'indre')
    .replace(/\(JLCPCB’s default\)/g, '(JLCPCBs standard)')
    .replace(
      /\(marked to be withdrawn, yet JLCPCB’s “No requirement” choice\)/g,
      '(merket for utfasing, men fortsatt JLCPCBs «Ingen krav»-valg)',
    );
}

export function localizeEmLayerName(name: string, locale: Locale): string {
  if (locale === 'en' || !name) return name;
  if (name === 'Top mask') return 'Toppmaske';
  if (name === 'Bottom mask') return 'Bunnmaske';
  let out = name
    .replace(/\(top\)/g, '(topp)')
    .replace(/\(bottom\)/g, '(bunn)')
    .replace(/^Core FR-4 core, etched bare \(([^)]+)\)$/, 'Kjerne FR-4, etset bar ($1)')
    .replace(/^Core FR-4 core \(([^)]+)\)$/, 'Kjerne FR-4 ($1)')
    .replace(/^Core /, 'Kjerne ');
  out = localizeEmMaterial(out, locale);
  return out;
}

export function localizeEmMaterial(material: string, locale: Locale): string {
  if (locale === 'en' || !material) return material;
  if (material === 'LPI solder mask') return 'LPI-loddemaske';
  return material
    .replace(/FR-4 core, etched bare \(([^)]+)\)/g, 'FR-4-kjerne, etset bar ($1)')
    .replace(/FR-4 core \(([^)]+)\)/g, 'FR-4-kjerne ($1)');
}
