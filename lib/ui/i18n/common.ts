export const en = {
  // Shared navigation & common UI actions
  'common.tools': 'Tools',
  'common.home': 'Home',
  'common.skipToContent': 'Skip to content',
  'common.close': 'Close',
  'common.copy': 'Copy',
  'common.copied': 'Copied',
  'common.reset': 'Reset',
  'common.undo': 'Undo',
  'common.redo': 'Redo',
  'common.export': 'Export',
  'common.readTheory': 'Read theory',
  'common.learnMore': 'Learn more',
  'common.search': 'Search',
  'common.clear': 'Clear',
  'common.all': 'All',
  'common.back': 'Back',

  // Header controls & accessibility labels
  'header.homeAria': 'Back to all tools',
  'header.workspaceNav': 'Workspace views',
  'header.experienceMode': 'Experience mode',
  'header.themeSelector': 'Color theme',
  'header.languageToggle': 'Switch language',
  'header.switchToNb': 'Bytt til norsk bokmål (NB)',
  'header.switchToEn': 'Switch to English (EN)',

  // Theme labels
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.hc': 'High contrast',
  'theme.hcShort': 'HC',
  'theme.system': 'System',

  // Experience mode labels
  'mode.quick': 'Quick',
  'mode.standard': 'Standard',
  'mode.teaching': 'Teaching',
  'mode.quickDesc': 'Essential controls and core outputs only',
  'mode.standardDesc': 'Full engineering workbench',
  'mode.teachingDesc': 'Inline tips, formulas, and theory links',

  // Teaching callout
  'teaching.badge': 'Teaching note',
  'teaching.readTheory': 'Read theory →',

  // Footer
  'footer.licenses': 'Licenses',
  'footer.github': 'GitHub',
  'footer.reportIssue': 'Report an issue',
  'footer.localOnly': '100% client-side — your files never leave your device',

  // Licenses page namespace
  'licenses.pageTitle': 'Licenses · yotasage',
  'licenses.title': 'Licenses',
  'licenses.lead1':
    'This site is built with and includes open-source software. The copyright notices and licence texts of those projects are listed below, as their licences require. The list is generated from the installed packages each time the site is built.',
  'licenses.lead2Prefix': 'The site itself is licensed under the GNU Affero General Public License v3.0 (',
  'licenses.lead2Mid': '), and its complete source code is on ',
  'licenses.lead2Suffix': '.',
  'licenses.section.packages': 'Software packages',
  'licenses.table.package': 'Package',
  'licenses.table.version': 'Version',
  'licenses.table.license': 'License',
  'licenses.section.pdfAssets': 'Fonts and decoders used by the PDF tools',
  'licenses.section.pdfAssetsLead': 'Data files from pdf.js that the PDF tools load to display and convert PDFs.',
  'licenses.section.pdfWasm': 'PDF processing and OCR WebAssembly modules',
  'licenses.section.pdfWasmLeadPre':
    'QPDF (for PDF repair, encryption, linearization and inspection), Ghostscript (AGPL-3.0, for vector-preserving maximum compression and PDF/A conversion, served unmodified from ',
  'licenses.section.pdfWasmLeadPost':
    ' and loaded lazily on demand), and Tesseract OCR with bundled tessdata_fast language models, all served directly from this site and run locally in the browser.',
  'licenses.section.viewer': 'Readers and decoders used by the 3D viewer',
  'licenses.section.viewerLead':
    'Files the 3D viewer loads to read CAD and compressed glTF files, and libraries that three.js includes in its file loaders. occt-import-js and Open CASCADE are covered by the GNU Lesser General Public License 2.1: they are served unmodified as separate files, and their source code is linked below.',
  'licenses.section.pcb': 'Font and code used by the PCB viewer',
  'licenses.section.pcbLead':
    "The PCB viewer draws the text of design files with Newstroke, KiCad's stroke font, using code adapted from KiCanvas. The glyphs are generated from the font author's own release, which he put under CC0. Both are part of the site's source.",
  'licenses.section.qr': 'Reader used by the QR code reader',
  'licenses.section.qrLead':
    'The QR code reader finds and decodes codes with ZXing-C++, compiled to WebAssembly by zxing-wasm (listed above) and served from this site.',
  'licenses.section.fonts': 'Site fonts',
  'licenses.section.fontsLeadPre': 'Self-hosted variable fonts served directly from ',
  'licenses.section.fontsLeadPost': ' under the SIL Open Font License 1.1, with zero external font CDN requests.',
  'licenses.noText': 'No licence text was found for this package.',
} as const;

export const nb: Record<keyof typeof en, string> = {
  // Shared navigation & common UI actions
  'common.tools': 'Verktøy',
  'common.home': 'Hjem',
  'common.skipToContent': 'Hopp til innhold',
  'common.close': 'Lukk',
  'common.copy': 'Kopier',
  'common.copied': 'Kopiert',
  'common.reset': 'Tilbakestill',
  'common.undo': 'Angre',
  'common.redo': 'Gjør om',
  'common.export': 'Eksporter',
  'common.readTheory': 'Les teori',
  'common.learnMore': 'Lær mer',
  'common.search': 'Søk',
  'common.clear': 'Tøm',
  'common.all': 'Alle',
  'common.back': 'Tilbake',

  // Header controls & accessibility labels
  'header.homeAria': 'Tilbake til alle verktøy',
  'header.workspaceNav': 'Arbeidsområder',
  'header.experienceMode': 'Visningsmodus',
  'header.themeSelector': 'Fargetema',
  'header.languageToggle': 'Bytt språk',
  'header.switchToNb': 'Bytt til norsk bokmål (NB)',
  'header.switchToEn': 'Switch to English (EN)',

  // Theme labels
  'theme.light': 'Lys',
  'theme.dark': 'Mørk',
  'theme.hc': 'Høy kontrast',
  'theme.hcShort': 'HK',
  'theme.system': 'System',

  // Experience mode labels
  'mode.quick': 'Rask',
  'mode.standard': 'Standard',
  'mode.teaching': 'Læring',
  'mode.quickDesc': 'Kun de viktigste feltene og resultatene',
  'mode.standardDesc': 'Fullverdig ingeniørverktøy',
  'mode.teachingDesc': 'Forklaringer, formler og lenker til teori',

  // Teaching callout
  'teaching.badge': 'Læringsnotat',
  'teaching.readTheory': 'Les teori →',

  // Footer
  'footer.licenses': 'Lisenser',
  'footer.github': 'GitHub',
  'footer.reportIssue': 'Rapporter et problem',
  'footer.localOnly': '100 % lokalt i nettleseren — filene dine forlater aldri enheten',

  // Licenses page namespace
  'licenses.pageTitle': 'Lisenser · yotasage',
  'licenses.title': 'Lisenser',
  'licenses.lead1':
    'Denne nettsiden er bygget med og inkluderer åpen kildekode. Opphavsrettsmerknader og lisenstekster for disse prosjektene er oppført nedenfor slik lisensene krever. Listen genereres automatisk fra installerte pakker ved hvert bygg.',
  'licenses.lead2Prefix': 'Selve nettsiden er lisensiert under GNU Affero General Public License v3.0 (',
  'licenses.lead2Mid': '), og hele kildekoden ligger på ',
  'licenses.lead2Suffix': '.',
  'licenses.section.packages': 'Programvarepakker',
  'licenses.table.package': 'Pakke',
  'licenses.table.version': 'Versjon',
  'licenses.table.license': 'Lisens',
  'licenses.section.pdfAssets': 'Skrifttyper og dekodere brukt av PDF-verktøyene',
  'licenses.section.pdfAssetsLead': 'Datafiler fra pdf.js som PDF-verktøyene laster for å vise og konvertere PDF-er.',
  'licenses.section.pdfWasm': 'WebAssembly-moduler for PDF-behandling og OCR',
  'licenses.section.pdfWasmLeadPre':
    'QPDF (for reparasjon, kryptering, linearisering og inspeksjon), Ghostscript (AGPL-3.0, for vektorbevarende maksimal komprimering og PDF/A-konvertering, servert uendret fra ',
  'licenses.section.pdfWasmLeadPost':
    ' og lastet ved behov), og Tesseract OCR med medfølgende tessdata_fast-språkmodeller — alt servert direkte fra denne siden og kjørt lokalt i nettleseren.',
  'licenses.section.viewer': 'Lesere og dekodere brukt av 3D-viseren',
  'licenses.section.viewerLead':
    'Filer som 3D-viseren laster for å lese CAD- og komprimerte glTF-filer, samt biblioteker som three.js inkluderer i sine fillastere. occt-import-js og Open CASCADE er dekket av GNU Lesser General Public License 2.1: de serveres uendret som egne filer med lenke til kildekoden nedenfor.',
  'licenses.section.pcb': 'Skrifttype og kode brukt av PCB-viseren',
  'licenses.section.pcbLead':
    'PCB-viseren tegner tekst fra designfiler med Newstroke, KiCads strekskrift, med kode tilpasset fra KiCanvas. Glyfene er generert fra skaperens egen CC0-utgivelse. Begge deler er del av sidens kildekode.',
  'licenses.section.qr': 'Leser brukt av QR-kodeleseren',
  'licenses.section.qrLead':
    'QR-kodeleseren finner og dekoder koder med ZXing-C++, kompilert til WebAssembly av zxing-wasm (oppført over) og servert fra denne siden.',
  'licenses.section.fonts': 'Nettstedets skrifttyper',
  'licenses.section.fontsLeadPre': 'Selvhostede variable skrifttyper servert direkte fra ',
  'licenses.section.fontsLeadPost': ' under SIL Open Font License 1.1, uten eksterne CDN-forespørsler.',
  'licenses.noText': 'Ingen lisenstekst ble funnet for denne pakken.',
};
