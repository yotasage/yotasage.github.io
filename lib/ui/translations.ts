export type Locale = 'en' | 'nb';

export const LOCALES: readonly Locale[] = ['en', 'nb'] as const;

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

  // Home namespace
  'home.pageTitle': 'Tools · yotasage',
  'home.metaDescription':
    'Fast, open-source engineering and utility tools that run completely in your browser — no ads, no uploads, no sign-up.',
  'home.title': 'Tools that run right in your browser',
  'home.subtitle': 'Fast, ad-free browser tools that run completely on your device.',
  'home.eyebrow': 'Open-source · Client-side',
  'home.heroLead':
    'A fast, distraction-free workbench for electronics, RF engineering, documents, 3D models, and everyday utilities. Everything runs locally on your device — no servers, no ads, and your files never leave your computer.',
  'home.promise.browser': 'Runs in your browser',
  'home.promise.local': 'Files never leave your device',
  'home.promise.noAds': 'No ads or tracking',
  'home.promise.noSignup': 'No sign-up',
  'home.filterAria': 'Filter tools by category',
  'home.cat.all': 'All',
  'home.cat.electronics': 'Electronics & RF',
  'home.cat.documents': 'Documents & 3D',
  'home.cat.utilities': 'Codes & Utilities',
  'home.searchPlaceholder': 'Search tools…',
  'home.searchAria': 'Search tools',
  'home.searchClear': 'Clear search',
  'home.allCategories': 'All tools',
  'home.toolsNavAria': 'Tools',
  'home.resultsCount': 'Showing {count} of {total} tools',
  'home.noResults': 'No tools match "{query}".',
  'home.noResultsHint': 'Try another keyword, or clear your search and category filter.',
  'home.resetFilters': 'Show all tools',
  'home.openTool': 'Open tool',
  'home.pdfSubToolsCount': '{count} built-in PDF tools',
  'home.tool.simsetup.title': 'Simulation setup',
  'home.tool.simsetup.category': 'Signal processing',
  'home.tool.simsetup.desc':
    'Compute coherent sampling parameters (f₀, Fs, Ncyc, Npts) for FFTs and simulations, and validate them against prime-ratio and power-of-two rules.',
  'home.tool.resistor.title': 'Resistor lookup',
  'home.tool.resistor.category': 'Electronics',
  'home.tool.resistor.desc':
    'Decode colour bands and SMD markings, find nearest E3–E192 standard values, solve series/parallel combinations, and design dividers or shunts over temperature.',
  'home.tool.smith.title': 'Smith chart',
  'home.tool.smith.category': 'RF & Microwave',
  'home.tool.smith.desc':
    'Build and drag impedance-matching networks on interactive Z, Y, and ZY grids with auto-solving, frequency sweeps, and SVG, TikZ, CSV, or Touchstone export.',
  'home.tool.pcb.title': 'PCB viewer',
  'home.tool.pcb.category': 'Electronics',
  'home.tool.pcb.desc':
    'Inspect Gerber, Excellon, KiCad, Altium, PADS, and EAGLE boards layer by layer or realistically, measure nets, export 1:1 drawings, or convert to KiCad.',
  'home.tool.emsim.title': 'EM simulation',
  'home.tool.emsim.category': 'RF & Signal Integrity',
  'home.tool.emsim.desc':
    'Solve microstrip, stripline, coplanar, and differential-pair impedance with a 2D/3D field solver, interactive stackups, JLCPCB/KiCad presets, and via analysis.',
  'home.tool.pdf.title': 'PDF tools',
  'home.tool.pdf.category': 'Documents',
  'home.tool.pdf.desc':
    'A complete private PDF suite: read, compare, merge, split, compress, OCR, sign, redact, convert, and scrub metadata entirely on your device.',
  'home.tool.viewer3d.title': '3D viewer',
  'home.tool.viewer3d.category': '3D models',
  'home.tool.viewer3d.desc':
    'Inspect CAD and mesh models (STEP, IGES, STL, 3MF, OBJ, glTF, FBX, USDZ) with interactive section cuts, measurements, and export to STL, OBJ, PLY, or GLB.',
  'home.tool.qrcode.title': 'QR code generator',
  'home.tool.qrcode.category': 'Codes',
  'home.tool.qrcode.desc':
    'Create standard, Micro QR, and rMQR codes with full control over version, error correction, mask, and encoding — exportable as PNG, SVG, or PDF.',
  'home.tool.qrreader.title': 'QR code reader',
  'home.tool.qrreader.category': 'Codes',
  'home.tool.qrreader.desc':
    'Scan QR, Micro QR, and rMQR codes from your camera, images, clipboard, or PDFs — parsing Wi-Fi, eSIM, contacts, payments, and 2FA alongside raw bytes.',
  'home.tool.base64.title': 'Base64 image converter',
  'home.tool.base64.category': 'Images',
  'home.tool.base64.desc':
    'Encode images into Base64 or ready-to-paste data URLs for HTML, CSS, and Markdown, or decode Base64 strings back into downloadable previews.',
  'home.tool.textcase.title': 'Text case converter',
  'home.tool.textcase.category': 'Text',
  'home.tool.textcase.desc':
    'Transform prose and code identifiers live across Sentence, Title, UPPER, camelCase, snake_case, and kebab-case with character, word, and line counts.',

  // Simulation setup namespace
  'simsetup.pageTitle': 'Simulation Setup · yotasage',
  'simsetup.title': 'Simulation Setup',
  'simsetup.subtitle':
    'Compute coherent sampling parameters (f₀, Fs, Ncyc, Npts) for FFTs and simulations, and validate them against prime-ratio and power-of-two rules.',
  'simsetup.workbench': 'Workbench',
  'simsetup.examples': 'Examples & Guide',
  'simsetup.theory': 'Theory',

  'simsetup.helperNavAria': 'Helper tools',
  'simsetup.helper.primes': 'Primes',
  'simsetup.helper.powers': 'Powers of 2',
  'simsetup.helper.rules': 'Rules',

  'simsetup.calc.title': 'Calculator',
  'simsetup.calc.quickTitle': 'Coherent sampling calculator',
  'simsetup.calc.boxTitle': 'Box {n}',
  'simsetup.calc.calculate': 'Calculate',
  'simsetup.calc.precision': 'Precision',
  'simsetup.calc.precisionTitle': 'Significant digits shown for calculated values',
  'simsetup.calc.digits': 'digits',
  'simsetup.calc.precisionError': 'Precision must be a whole number from 1 to {max}. Using {current}.',
  'simsetup.calc.format': 'Format',
  'simsetup.calc.formatPlain': 'Plain (2340571.4286 Hz)',
  'simsetup.calc.formatSi': 'SI prefixes (2.3405714286 MHz)',
  'simsetup.calc.grouping': 'Grouping',
  'simsetup.calc.groupingTitle': 'How long numbers are split into groups of three digits',
  'simsetup.calc.groupNone': 'None (1000000)',
  'simsetup.calc.groupSpace': 'Space (1 000 000)',
  'simsetup.calc.groupUnderscore': 'Underscore, Python (1_000_000)',
  'simsetup.calc.addBox': 'Add box',
  'simsetup.calc.duplicate': 'Duplicate',
  'simsetup.calc.remove': 'Remove',
  'simsetup.calc.duplicateAria': 'Duplicate {title}',
  'simsetup.calc.removeAria': 'Remove {title}',
  'simsetup.calc.derivedSpectrum': 'Periods & resolution',
  'simsetup.calc.derivedTiming': 'Time window & range',

  'simsetup.check.tooLarge': 'Too large to check',
  'simsetup.check.notInteger': 'Not an integer',
  'simsetup.check.prime': 'Prime',
  'simsetup.check.odd': 'Odd, not prime',
  'simsetup.check.even': 'Even',
  'simsetup.check.coprime': 'No common factor with Npts',
  'simsetup.check.commonFactor': 'Common factor {factor} with Npts',
  'simsetup.check.powerOfTwo': 'Power of 2',
  'simsetup.check.notPowerOfTwo': 'Not a power of 2',

  'simsetup.prime.title': 'Prime numbers',
  'simsetup.prime.inputAria': 'Prime candidate number',
  'simsetup.prime.enterWhole': 'Enter a whole number',
  'simsetup.prime.notWhole': 'Not a whole number',
  'simsetup.prime.maxDigits': 'At most {max} digits',
  'simsetup.prime.notPrime': 'Not prime',
  'simsetup.prime.isPrime': 'Prime',
  'simsetup.prime.probablyPrime': 'Probably prime',
  'simsetup.prime.next': 'Next',
  'simsetup.prime.prev': 'Prev',
  'simsetup.prime.apply': 'Apply to Ncyc',
  'simsetup.prime.applied': 'Applied to Box 1',
  'simsetup.prime.applyHint': 'Apply this prime number to Box 1 Ncyc',

  'simsetup.power.title': 'Powers of 2',
  'simsetup.power.inputAria': 'Power of 2 candidate number',
  'simsetup.power.enterWhole': 'Enter a whole number',
  'simsetup.power.notWhole': 'Not a whole number',
  'simsetup.power.minOne': 'Must be 1 or more',
  'simsetup.power.exact': 'Exact power of 2',
  'simsetup.power.notExact': 'Not a power of 2',
  'simsetup.power.next': 'Next',
  'simsetup.power.prev': 'Prev',
  'simsetup.power.apply': 'Apply to Npts',
  'simsetup.power.applied': 'Applied to Box 1',
  'simsetup.power.applyHint': 'Apply this power of 2 to Box 1 Npts',

  'simsetup.rules.title': 'Coherence checklist',
  'simsetup.rules.subtitle': 'Live status for Box 1 against coherent sampling rules.',
  'simsetup.rules.statusCoherent': 'Coherent',
  'simsetup.rules.statusAcceptable': 'Acceptable',
  'simsetup.rules.statusIssue': 'Rule broken',
  'simsetup.rules.statusIncomplete': 'Incomplete',
  'simsetup.rules.rule1Title': 'Rule 1 · Prime or odd cycles',
  'simsetup.rules.rule1Desc': 'Ncyc should be an integer (ideally prime) with no common factor with Npts.',
  'simsetup.rules.rule2Title': 'Rule 2 · Power-of-two FFT length',
  'simsetup.rules.rule2Desc': 'Npts should be an exact power of 2 for radix-2 FFT computation.',
  'simsetup.rules.rule3Title': 'Rule 3 · Relative primality',
  'simsetup.rules.rule3Desc': 'f0 and FS should be relatively prime (not checked numerically).',
  'simsetup.rules.openPrimes': 'Pick prime',
  'simsetup.rules.openPowers': 'Pick 2ⁿ',
  'simsetup.rules.openTheory': 'Read full theory & references →',
  'simsetup.rules.noData': 'Enter valid parameters to run checks.',

  'simsetup.quick.badge': 'Quick mode',
  'simsetup.quick.bannerText':
    'Need multi-box comparisons, precision/format options, or prime & power-of-2 helpers?',
  'simsetup.quick.switchStandard': 'Switch to Standard',
  'simsetup.quick.switchTeaching': 'Try Teaching mode',

  'simsetup.teaching.ratioTitle': 'Why coherent sampling eliminates spectral leakage',
  'simsetup.teaching.ratioBody':
    'Coherent sampling forces an exact integer number of signal cycles into the FFT window so the first and last samples connect seamlessly with zero discontinuity. Choose any three parameters and the calculator solves for the fourth:',
  'simsetup.teaching.helperTitle': 'Why prime Ncyc and 2ᵏ samples matter',
  'simsetup.teaching.helperBody':
    'When Npts is a power of 2 (2ᵏ), every prime Ncyc > 2 is automatically coprime with Npts. That guarantees every sample hits a distinct phase of the sinusoid and prevents aliased harmonics from landing on the same FFT bin.',

  'simsetup.presets.title': 'Starter presets',
  'simsetup.presets.subtitle':
    'Load a verified coherent sampling configuration straight into Box 1 and inspect the derived timing and spectrum.',
  'simsetup.presets.load': 'Load in Workbench →',
  'simsetup.presets.audio.title': 'Audio ADC (48 kHz)',
  'simsetup.presets.audio.tag': 'Audio · 4096-pt FFT',
  'simsetup.presets.audio.desc':
    'Classic ~1 kHz sinusoidal ADC test at 48 kHz sample rate with prime 83 cycles (972.66 Hz) and 11.7 Hz bin spacing.',
  'simsetup.presets.rf.title': 'RF IF Sampling (100 MHz)',
  'simsetup.presets.rf.tag': 'RF · 16384-pt FFT',
  'simsetup.presets.rf.desc':
    'High-speed 100 MSPS intermediate-frequency capture near 10.7 MHz using prime 1753 cycles for sharp SFDR analysis.',
  'simsetup.presets.sensor.title': 'Sensor Acquisition (1 kHz)',
  'simsetup.presets.sensor.tag': 'DAQ · 1024-pt FFT',
  'simsetup.presets.sensor.desc':
    'Low-frequency 1 kHz DAQ setup (~51.76 Hz test tone, 1.024 s window) suited for vibration and industrial sensors.',
  'simsetup.presets.spice.title': 'SPICE Transient (10 MHz)',
  'simsetup.presets.spice.tag': 'SPICE · 2048-pt FFT',
  'simsetup.presets.spice.desc':
    'Uses SPICE meg syntax (10meg) and a 10 µs settling offset (tstart) before capturing 101 prime cycles (~493.16 kHz).',

  'simsetup.guide.title': 'How to use',
  'simsetup.guide.subtitle':
    'Input syntax, SPICE tips, digit grouping, coherent-sampling checks, and number helper shortcuts.',

  'simsetup.theory.parametersTitle': 'Parameters',
  'simsetup.theory.coherentTitle': 'Coherent sampling',
  'simsetup.theory.referencesTitle': 'References',
  'simsetup.theory.symbol': 'Symbol',
  'simsetup.theory.description': 'Description',
  'simsetup.theory.calculatedAs': 'Calculated as',
  'simsetup.theory.unit': 'Unit',
  'simsetup.theory.typedIn': 'Typed in',
  'simsetup.theory.inCalculator': 'In the calculator:',
  'simsetup.theory.notCheckedByCalc': 'Not checked by the calculator.',
  'simsetup.theory.source': 'Source:',
  'simsetup.theory.notes': 'Notes',
  'simsetup.theory.rule': 'Rule',
  'simsetup.theory.note': 'Note',

  // Resistor lookup namespace
  'resistor.pageTitle': 'Resistor Lookup · yotasage',
  'resistor.title': 'Resistor Lookup',
  'resistor.workbench': 'Workbench',
  'resistor.examples': 'Examples',
  'resistor.theory': 'Theory & Reference',

  'resistor.tabsAria': 'Workbench tools',
  'resistor.tab.lookup': 'Lookup',
  'resistor.tab.drawing': 'Bands & Export',
  'resistor.tab.combinations': 'Combinations',
  'resistor.tab.design': 'Design',

  'resistor.theoryTabsAria': 'Theory and reference sections',
  'resistor.theoryTab.theory': 'Theory',
  'resistor.theoryTab.reference': 'Reference Tables',
  'resistor.theoryTab.references': 'References',
  'resistor.referencesLead':
    'The sources of the tables and of the theory on this page, in the order they are first cited.',

  'resistor.quick.badge': 'Quick mode',
  'resistor.quick.bannerText':
    'Showing Lookup and Bands & Export. Switch to Standard for series/parallel combinations and divider or gain design.',
  'resistor.quick.switchStandard': 'Switch to Standard',
  'resistor.quick.switchTeaching': 'Try Teaching mode',

  'resistor.teaching.inputTitle': 'Smart input syntax & stepping',
  'resistor.teaching.inputBody':
    'Type a value (4k7, 4.7k, 49.9), an SMD marking (472, 01C), or band colours (yellow violet red gold). Press Up/Down arrows inside the field to step through the active E-series.',
  'resistor.teaching.lookupTitle': 'Why E-series use logarithmic spacing',
  'resistor.teaching.lookupBody':
    'IEC 60063 spaces preferred values geometrically across each decade so maximum rounding error stays constant and matches the component tolerance (E12 ≈ ±10%, E24 ≈ ±5%, E96 ≈ ±1%).',
  'resistor.teaching.drawingTitle': 'Interactive band & SMD decoding',
  'resistor.teaching.drawingBody':
    'Click any coloured band on the axial drawing to change it directly, or edit the SMD code. Four bands carry 2 digits + multiplier + tolerance; 5- and 6-band parts add a third digit and TCR.',
  'resistor.teaching.combosTitle': 'Trimming values with combinations',
  'resistor.teaching.combosBody':
    'Adding a small series resistor trims upward, while paralleling a much larger resistor trims downward slightly. Two common E24 parts often achieve tighter accuracy than a single E96 part.',
  'resistor.teaching.designTitle': 'Worst-case vs. RSS tolerance budgets',
  'resistor.teaching.designBody':
    'Worst-case assumes every resistor hits its tolerance and temperature drift limit together. Root-sum-square (RSS) models independent random variations across production parts.',

  'resistor.examples.title': 'Practical engineering examples',
  'resistor.examples.subtitle':
    'Click any preset to load its value, marking, and typical tolerance straight into the Workbench.',
  'resistor.examples.try': 'Load in Workbench →',
  'resistor.examples.i2c.title': '4.7 kΩ I²C Pull-Up',
  'resistor.examples.i2c.tag': 'Digital · E24 ±5%',
  'resistor.examples.i2c.desc':
    'Standard pull-up resistor for 3.3 V / 5 V I²C bus lines (SDA and SCL) balancing rise time against sink current.',
  'resistor.examples.led.title': '330 Ω LED Limiter',
  'resistor.examples.led.tag': 'Indicator · 5 V rail',
  'resistor.examples.led.desc':
    'Classic current-limiting resistor for a red or green indicator LED (~9–10 mA from a 5 V logic output).',
  'resistor.examples.rf.title': '49.9 Ω 1% RF Termination',
  'resistor.examples.rf.tag': 'RF · E96 ±1%',
  'resistor.examples.rf.desc':
    'Nearest E96 standard value to 50 Ω for impedance-matched RF ports, coaxial terminations, and high-speed lines.',
  'resistor.examples.opamp.title': '100 kΩ Op-Amp Feedback',
  'resistor.examples.opamp.tag': 'Analog · E96 ±1%',
  'resistor.examples.opamp.desc':
    'Precision feedback resistor paired with 10 kΩ for an inverting gain of −10 or non-inverting gain of 11.',
  'resistor.examples.smd3.title': '472 3-Digit SMD',
  'resistor.examples.smd3.tag': 'SMD · 3-digit code',
  'resistor.examples.smd3.desc':
    'Standard 3-digit surface-mount marking: digits 4 and 7 followed by 2 zeros (47 × 10² = 4.7 kΩ).',
  'resistor.examples.eia96.title': '01C EIA-96 10 kΩ',
  'resistor.examples.eia96.tag': 'SMD · EIA-96 1%',
  'resistor.examples.eia96.desc':
    'Compact 0603 1% precision marking: code 01 maps to 100 in the E96 table, multiplied by C (×100) = 10 kΩ.',

  // Smith chart namespace
  'smith.pageTitle': 'Smith Chart · yotasage',
  'smith.title': 'Smith Chart',
  'smith.workbench': 'Workbench',
  'smith.learn': 'Learn & Challenges',
  'smith.theory': 'Theory & References',

  'smith.inspectorTabsAria': 'Inspector tools',
  'smith.tab.circuit': 'Circuit',
  'smith.tab.solver': 'Solver',
  'smith.tab.sweep': 'Sweep',
  'smith.tab.equations': 'Equations',
  'smith.tab.export': 'Export',

  'smith.theoryTabsAria': 'Theory and reference sections',
  'smith.theoryTab.theory': 'Theory',
  'smith.theoryTab.references': 'References',
  'smith.referencesLead':
    'The sources of the theory on this page, in the order they are first cited.',

  'smith.quick.badge': 'Quick mode',
  'smith.quick.bannerText':
    'Showing Circuit and Export. Switch to Standard for the Solver, Frequency Sweep, and live Equations.',
  'smith.quick.switchStandard': 'Switch to Standard',
  'smith.quick.switchTeaching': 'Try Teaching mode',

  'smith.teaching.gridTitle': 'Reading Z and Y circles',
  'smith.teaching.gridBody':
    'Constant-resistance (r) circles are tangent at the right open-circuit point (Γ = +1), while constant-conductance (g) circles mirror them on the left (Γ = −1). Switch between Z, Y, and ZY grids to read impedance and admittance together.',
  'smith.teaching.circuitTitle': 'Matching with series vs. shunt arcs',
  'smith.teaching.circuitBody':
    'A series reactance walks along a constant-r circle (inductor clockwise, capacitor counter-clockwise). A shunt susceptance walks along a constant-g circle. Drag any handle on the chart to steer a node onto r = 1 or g = 1.',
  'smith.teaching.solverTitle': 'Solver construction circles',
  'smith.teaching.solverBody':
    'Mark one or two parts as unknown and choose a target (such as VSWR = 1). The solver intersects the forward locus from the load with the reverse locus from the goal — yielding two, one, or zero exact matches.',
  'smith.teaching.sweepTitle': 'Frequency sweep bandwidth & Q',
  'smith.teaching.sweepBody':
    'Lumped elements match at f₀ and spread into a frequency trace across the band. Higher intermediate Q = |x|/r narrows the VSWR bandwidth; place markers to inspect return loss and impedance at the band edges.',
  'smith.teaching.equationsTitle': 'Live equations & cross-highlighting',
  'smith.teaching.equationsBody':
    'Hover or focus any variable to highlight its arc, node, or readout row on the chart. Click a derivation link to inspect the full algebraic steps.',

  // EM simulation namespace
  'emsim.pageTitle': 'EM Simulation · yotasage',
  'emsim.title': 'EM Simulation',
  'emsim.workbench': 'Workbench',
  'emsim.examples': 'Examples',
  'emsim.theory': 'Theory & References',

  'emsim.tabsAria': 'Workbench sections',
  'emsim.tab.stackup': 'Stackup',
  'emsim.tab.trace': 'Trace',
  'emsim.tab.via': 'Via',
  'emsim.tab.waves': 'Waves',
  'emsim.tab.export': 'Export',

  'emsim.theoryTabsAria': 'Theory and reference sections',
  'emsim.theoryTab.theory': 'Theory',
  'emsim.theoryTab.references': 'References',

  'emsim.prefs.units': 'Units',
  'emsim.prefs.unitsAria': 'Length units',
  'emsim.prefs.digits': 'Digits',
  'emsim.prefs.digitsAria': 'Significant digits',
  'emsim.prefs.copyLink': 'Copy link',
  'emsim.prefs.linkCopied': 'Link copied',
  'emsim.undoTitle': 'Undo (Ctrl+Z)',
  'emsim.redoTitle': 'Redo (Ctrl+Shift+Z)',

  'emsim.loading.via': 'Loading the 3D via editor and solver…',
  'emsim.loading.waves': 'Loading the WebGPU / CPU full-wave FDTD solver…',
  'emsim.loading.export': 'Loading figure, data, and report export…',
  'emsim.loading.examples': 'Loading worked examples…',
  'emsim.loading.theory': 'Loading theory, equations, and references…',
  'emsim.loading.references': 'The sources the theory cites appear once the theory has loaded.',

  'emsim.quick.badge': 'Quick mode',
  'emsim.quick.bannerText':
    'Showing Stackup and Trace. Switch to Standard for 3D Vias, Full-Wave FDTD, and TikZ / Touchstone Export.',
  'emsim.quick.switchStandard': 'Switch to Standard',
  'emsim.quick.switchTeaching': 'Try Teaching mode',

  'emsim.teaching.stackupTitle': 'Why the board stackup sets impedance',
  'emsim.teaching.stackupBody':
    'Characteristic impedance is governed primarily by dielectric height (h), relative permittivity (εr), and copper thickness. Start from a JLCPCB stackup or drop a KiCad .kicad_pcb + .kicad_pro to import real tolerances and net classes.',
  'emsim.teaching.traceTitle': '2D quasi-TEM field solver & live handles',
  'emsim.teaching.traceBody':
    'Drag the handles on the cross-section to tune width, spacing, or height interactively. The 2D boundary-element solver computes per-unit-length L and C matrices including solder mask and trapezoidal etch — click any underlined result to inspect its exact equation.',
  'emsim.teaching.viaTitle': 'Via capacitance, inductance & stub resonance',
  'emsim.teaching.viaBody':
    'A via transition behaves like a short lumped section of impedance √(L/C): pads and tight antipads add capacitance while the barrel and distant return vias add inductance. Any unused stub beyond the exit layer creates a quarter-wave resonance notch.',
  'emsim.teaching.wavesTitle': 'When to run 3D full-wave FDTD',
  'emsim.teaching.wavesBody':
    'Quasi-static models hold well below λ/8 where transverse fields dominate. Run the in-browser WebGPU / CPU FDTD solver when edge speeds are very fast, stubs resonate near the signal band, or return vias sit far from the barrel.',

  // QR code generator namespace
  'qrgen.pageTitle': 'QR Code Generator · yotasage',
  'qrgen.title': 'QR Code Generator',
  'qrgen.workbench': 'Workbench',
  'qrgen.guide': 'Guide & Theory',

  'qrgen.tabsAria': 'Generator sections',
  'qrgen.tab.content': 'Content',
  'qrgen.tab.symbol': 'Symbol',
  'qrgen.tab.encoding': 'Encoding',
  'qrgen.tab.style': 'Style & Export',
  'qrgen.tab.decrypt': 'Decrypt',

  'qrgen.quick.badge': 'Quick mode',
  'qrgen.quick.bannerText':
    'Showing Content and Style & Export. Switch to Standard for Symbol version/mask, Encoding/ECI/GS1, and Decrypt.',
  'qrgen.quick.switchStandard': 'Switch to Standard',
  'qrgen.quick.switchTeaching': 'Try Teaching mode',

  'qrgen.preview.title': 'Live preview',
  'qrgen.preview.download': 'Download',
  'qrgen.preview.detailsTitle': 'Symbol details',
  'qrgen.preview.modules': 'modules',

  'qrgen.teaching.ecTitle': 'Reed-Solomon error correction (L / M / Q / H)',
  'qrgen.teaching.ecBody':
    'QR codes embed redundant Reed-Solomon codewords so damaged or occluded symbols remain scannable: L restores ~7%, M ~15%, Q ~25%, and H ~30%. Always choose Q or H when placing a centre logo.',
  'qrgen.teaching.quietTitle': 'Versions, capacity & quiet zones',
  'qrgen.teaching.quietBody':
    'Model 2 scales from Version 1 (21 × 21) to Version 40 (177 × 177), growing by 4 modules per side per version. ISO/IEC 18004 requires a 4-module quiet zone around square QR codes (2 modules for Micro QR and rMQR) so cameras can isolate the finder patterns.',
  'qrgen.teaching.familyTitle': 'Why Micro QR and rMQR exist',
  'qrgen.teaching.familyBody':
    'Micro QR uses a single finder pattern to fit small parts (down to 11 × 11 modules). Rectangular Micro QR (rMQR, ISO/IEC 23941) stays as short as 7 modules tall for cables, tubes, and narrow PCB or label edges.',
  'qrgen.teaching.encodingTitle': 'Encoding modes & bit efficiency',
  'qrgen.teaching.encodingBody':
    'Auto mode mixes segments to minimize symbol size: Numeric packs 3 digits into 10 bits (3.33 bits/char), Alphanumeric packs 2 chars into 11 bits (5.5 bits/char), Byte uses 8 bits/byte, and Kanji packs Shift JIS characters into 13 bits.',

  'qrgen.guide.title': 'QR Code Guide & Theory',
  'qrgen.guide.lead':
    'Standards, symbol families, Reed-Solomon error correction budgets, quiet zone requirements, and encoding modes.',

  // QR code reader namespace
  'qrread.pageTitle': 'QR Code Reader · yotasage',
  'qrread.title': 'QR Code Reader',
  'qrread.workbench': 'Workbench',
  'qrread.guide': 'Supported Formats',

  'qrread.tabsAria': 'Input sources',
  'qrread.tab.file': 'Image / PDF',
  'qrread.tab.camera': 'Camera',
  'qrread.tab.text': 'Text',

  'qrread.quick.badge': 'Quick mode',
  'qrread.quick.bannerText':
    'Showing Image / PDF and Camera scanning. Switch to Standard to paste raw payload text or inspect extra details.',
  'qrread.quick.switchStandard': 'Switch to Standard',
  'qrread.quick.switchTeaching': 'Try Teaching mode',

  'qrread.results.title': 'Decoded results',
  'qrread.results.clearAll': 'Clear all',
  'qrread.results.emptyTitle': 'No codes decoded yet',
  'qrread.results.emptyDesc':
    'Drop an image or PDF, paste a screenshot with Ctrl+V, start your camera, or try a built-in example with three QR codes.',
  'qrread.results.tryExample': 'Try an example',

  'qrread.teaching.wasmTitle': 'Local decoding with ZXing-C++ WebAssembly',
  'qrread.teaching.wasmBody':
    'Images, PDF pages, and camera frames are decoded inside a background Web Worker using a self-hosted ZXing-C++ WebAssembly module (/qr/). Pictures and video frames never leave your device.',
  'qrread.teaching.parsersTitle': 'Structured payload parsers',
  'qrread.teaching.parsersBody':
    'Decoded text and bytes are matched against standards for Wi-Fi, eSIM LPA activation codes, vCard/MeCard contacts, iCalendar events, EPC/Swiss QR bills, and TOTP 2FA URIs — giving readable previews without blind execution.',
  'qrread.teaching.rawTitle': 'Raw bytes, ECI & symbol geometry',
  'qrread.teaching.rawBody':
    'Switch to the Raw or Symbol tab inside any result card to inspect hex dumps, non-printable control characters, Extended Channel Interpretation (ECI) encodings, version, mask, and error correction level.',

  'qrread.guide.title': 'Supported Formats & Privacy',
  'qrread.guide.lead':
    'Every barcode symbology, structured content parser, and client-side privacy guarantee built into this reader.',

  // Base64 image converter namespace
  'base64.pageTitle': 'Base64 Image Converter · yotasage',
  'base64.title': 'Base64 Image Converter',
  'base64.workbench': 'Workbench',
  'base64.guide': 'Guide & Theory',

  'base64.tabsAria': 'Conversion direction',
  'base64.tab.encode': 'Image → Base64',
  'base64.tab.decode': 'Base64 → Image',

  'base64.lead':
    'Turn an image into Base64, a data URL, or a ready-made HTML, CSS, or Markdown snippet, and decode Base64 back into an image. Everything runs locally in your browser.',

  'base64.quick.badge': 'Quick mode',
  'base64.quick.bannerText':
    'Focused single-panel view with Encode / Decode tabs. Switch to Standard for side-by-side split view, or Teaching for Base64 theory tips.',
  'base64.quick.switchStandard': 'Switch to Standard',
  'base64.quick.switchTeaching': 'Try Teaching mode',

  'base64.encoder.title': 'Image to Base64',
  'base64.encoder.selectImage': 'Select image',
  'base64.encoder.dropHint': 'or drop an image here, or paste one (Ctrl+V)',
  'base64.encoder.chooseAnother': 'Choose another image',
  'base64.encoder.remove': 'Remove',
  'base64.encoder.imageSection': 'Image',
  'base64.encoder.outputSection': 'Output',
  'base64.encoder.copy': 'Copy',
  'base64.encoder.copied': 'Copied ✓',
  'base64.encoder.downloadTxt': 'Download .txt',

  'base64.decoder.title': 'Base64 to image',
  'base64.decoder.paste': 'Paste',
  'base64.decoder.openFile': 'Open text file',
  'base64.decoder.clear': 'Clear',
  'base64.decoder.imageSection': 'Image',
  'base64.decoder.copyImage': 'Copy image',
  'base64.decoder.copied': 'Copied ✓',

  'base64.teaching.overheadTitle': 'Why Base64 is ~33% larger than binary',
  'base64.teaching.overheadBody':
    'Base64 packs every 3 bytes (24 bits) into 4 printable 6-bit ASCII characters, with up to two = padding characters at the end. Raw text output is therefore roughly 4/3 the original byte size (before HTTP gzip/Brotli).',
  'base64.teaching.dataUrlTitle': 'Anatomy of a Data URL',
  'base64.teaching.dataUrlBody':
    'A data URL starts with data:<mime>;base64,<payload> (for example data:image/png;base64,iVBORw0…). For SVG, percent-encoded UTF-8 text is often shorter and easier to read than Base64.',
  'base64.teaching.inlineTitle': 'When to inline vs serve external files',
  'base64.teaching.inlineBody':
    'Inline tiny icons, placeholders, or single-file HTML emails (< 4–10 KB) to save an HTTP request. Keep photos and larger assets as normal image files so browsers can cache them independently and avoid bloating HTML/CSS.',

  'base64.guide.title': 'Base64 Image Guide & Theory',
  'base64.guide.lead':
    'How Base64 encoding works, the ~33% size overhead math, MIME types, ready-made snippets, and privacy.',
  'base64.guide.encodingTitle': 'How Base64 encoding works',
  'base64.guide.encodingBody':
    'Binary files contain arbitrary byte values (0–255) that break text formats like HTML, CSS, JSON, and email. Base64 splits the bit stream into 6-bit groups (64 symbols: A–Z, a–z, 0–9, plus + / in standard Base64 or - _ in URL-safe Base64) so any image can travel safely as plain ASCII text.',
  'base64.guide.overheadTitle': 'The ~33% size overhead',
  'base64.guide.overheadBody':
    'Three 8-bit bytes (24 bits) always become four 6-bit Base64 characters. If the byte length is not a multiple of 3, one or two = padding characters complete the final 4-character block. Resizing or converting to WebP/JPEG before encoding often saves far more than Base64 adds.',
  'base64.guide.mimeTitle': 'Data URLs & MIME types',
  'base64.guide.mimeBody':
    'Browsers identify an inlined image by the MIME type in the data URL prefix — or by inspecting the file magic bytes when decoding raw Base64.',
  'base64.guide.snippetsTitle': 'HTML, CSS & Markdown snippets',
  'base64.guide.snippetsBody':
    'Pick a snippet format in the encoder to wrap the data URL directly for web pages, stylesheets, or Markdown documents.',
  'base64.guide.privacyTitle': '100% client-side & private',
  'base64.guide.privacyBody':
    'All file reading, canvas format conversion, Base64 encoding, and decoding run locally in your browser. Images and text never leave your device, and converting to PNG/JPEG/WebP strips EXIF and GPS metadata.',

  // Text case converter namespace
  'textcase.pageTitle': 'Text Case Converter · yotasage',
  'textcase.title': 'Text Case Converter',
  'textcase.workbench': 'Workbench',
  'textcase.guide': 'Naming & Case Guide',

  'textcase.lead':
    'Convert text between prose styles (Sentence case, Title Case, UPPER CASE) and code identifiers (camelCase, PascalCase, snake_case, kebab-case) locally in your browser.',

  'textcase.quick.badge': 'Quick mode',
  'textcase.quick.bannerText':
    'Streamlined Input, Case selector, and Result. Switch to Standard for Title Case style (Chicago/APA), acronym preservation, custom fixed capitals, and ASCII options.',
  'textcase.quick.switchStandard': 'Switch to Standard',
  'textcase.quick.switchTeaching': 'Try Teaching mode',

  'textcase.input.title': 'Input',
  'textcase.input.placeholder': 'Type or paste text here, or drop a text file.',
  'textcase.input.paste': 'Paste',
  'textcase.input.openFile': 'Open text file',
  'textcase.input.clear': 'Clear',

  'textcase.case.aria': 'Case',
  'textcase.case.textGroup': 'Text',
  'textcase.case.codeGroup': 'Names in code',

  'textcase.result.title': 'Result',
  'textcase.result.placeholder': 'The result appears here.',
  'textcase.result.copy': 'Copy',
  'textcase.result.copied': 'Copied ✓',
  'textcase.result.download': 'Download',
  'textcase.result.useAsInput': 'Use as input',
  'textcase.result.options': 'Options',

  'textcase.teaching.titleCaseTitle': 'Chicago vs APA Title Case rules',
  'textcase.teaching.titleCaseBody':
    'Both styles capitalize the first and last word, nouns, verbs, and adjectives. Chicago lowercases all prepositions regardless of length (between, through, with), whereas APA capitalizes prepositions and conjunctions of 4+ letters.',
  'textcase.teaching.codeNamesTitle': 'Code identifier conventions & smart splitting',
  'textcase.teaching.codeNamesBody':
    'Use camelCase for JS/TS variables, PascalCase for types/components, snake_case for Python/SQL/Rust, CONSTANT_CASE for environment variables, and kebab-case for URLs and CSS classes. Smart splitting breaks acronyms like XMLHttpRequest cleanly into XML · Http · Request.',

  'textcase.guide.title': 'Naming & Capitalization Guide',
  'textcase.guide.lead':
    'Prose capitalization standards (Sentence case, Chicago vs APA Title Case) and code identifier conventions.',
  'textcase.guide.proseTitle': 'Prose capitalization styles',
  'textcase.guide.proseBody':
    'Sentence case is preferred in modern UI copy and technical documentation because lowercase word shapes are faster to scan. You can preserve proper nouns, technical acronyms (NASA, MHz, iPhone), and disable English "I" capitalization when writing Norwegian or Swedish where "i" is a preposition.',
  'textcase.guide.titleRulesTitle': 'Chicago vs APA Title Case',
  'textcase.guide.titleRulesBody':
    'Both guides keep articles (a, an, the) and short coordinating conjunctions (and, but, for, or, nor) lowercase unless first or last. They differ on longer prepositions:',
  'textcase.guide.codeTitle': 'Code naming conventions',
  'textcase.guide.codeBody':
    'Each line in the input becomes one identifier. Words are split on whitespace, punctuation, and case transitions (including acronym boundaries like HTMLParser → html_parser).',
  'textcase.guide.asciiTitle': 'ASCII transliteration & saved terms',
  'textcase.guide.asciiBody':
    'Enable ASCII-only mode to fold diacritics and Nordic letters (é → e, æ → ae, ø → o, å → a) into portable identifiers. Custom fixed-capital terms (such as GitHub, iPhone, or NTNU) are stored locally in your browser.',

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

  // PDF tools suite namespace
  'pdf.pageTitle': 'PDF Tools · yotasage',
  'pdf.title': 'PDF Tools',
  'pdf.eyebrow': '{count} Local Browser PDF Tools',
  'pdf.lead':
    "Everything runs locally in your browser. Files never leave your device, with no ads, no accounts, and no limits beyond your device's memory.",
  'pdf.allTools': 'All PDF tools',
  'pdf.searchPlaceholder': 'Search {count} PDF tools…',
  'pdf.searchAria': 'Search PDF tools',
  'pdf.searchClear': 'Clear search',
  'pdf.filterAria': 'Filter PDF tools by category',
  'pdf.cat.all': 'All',
  'pdf.cat.view': 'View',
  'pdf.cat.organize': 'Organize',
  'pdf.cat.optimize': 'Optimize',
  'pdf.cat.edit': 'Edit & annotate',
  'pdf.cat.toPdf': 'Convert to PDF',
  'pdf.cat.fromPdf': 'Convert from PDF',
  'pdf.cat.security': 'Security',
  'pdf.resultsCount': 'Showing {count} of {total} PDF tools',
  'pdf.noResults': 'No PDF tools match "{query}".',
  'pdf.noResultsHint': 'Try a different keyword or reset the category filter.',
  'pdf.resetFilters': 'Reset filters',
  'pdf.localHint': 'Your files are processed in this browser and are never uploaded.',
  'pdf.roadmapPrefix': 'More tools are planned — see the ',
  'pdf.roadmapLink': 'roadmap',
  'pdf.teaching.privacyTitle': 'How local browser PDF processing works',
  'pdf.teaching.privacyBody':
    'Every PDF tool runs directly in your browser using JavaScript and self-hosted WebAssembly (pdf-lib, pdf.js, QPDF, Ghostscript, and Tesseract OCR) inside Web Workers. Files stay in device memory, chain between tools via Continue with…, and never touch a server.',

  // 3D viewer namespace
  'viewer3d.pageTitle': '3D Viewer · yotasage',
  'viewer3d.title': '3D Viewer',
  'viewer3d.workbench': 'Workbench',
  'viewer3d.guide': 'Formats & Guide',
  'viewer3d.lead':
    'Inspect STEP, IGES, STL, 3MF, OBJ, glTF, FBX, USDZ, and point-cloud models locally in your browser: orbit, cut sections, measure distances, inspect volume, and export to STL, OBJ, PLY, GLB, or PNG.',
  'viewer3d.loading': 'Loading 3D viewer…',

  'viewer3d.drop.title': 'Open a 3D model',
  'viewer3d.drop.desc':
    'Turn, zoom, cut cross-sections, measure surface distances, check bounding size and volume, and export as STL, OBJ, PLY, GLB, or PNG.',
  'viewer3d.drop.selectBtn': 'Select 3D file',
  'viewer3d.drop.tryExample': 'Try an example model',
  'viewer3d.drop.loadingExample': 'Loading example…',
  'viewer3d.drop.exampleError': 'Could not load the example model. Please try again.',
  'viewer3d.drop.hint':
    'or drop files here. For OBJ and glTF models with separate materials, buffers, or textures, select or drop all files together.',
  'viewer3d.drop.localHint': 'Your files are read locally in this browser and are never uploaded.',
  'viewer3d.drop.allFormats': 'All supported formats →',

  'viewer3d.quick.badge': 'Quick mode',
  'viewer3d.quick.bannerText':
    'Drop any CAD or mesh file below to inspect immediately. Switch to Standard for full format notes, or Teaching for B-Rep & sectioning tips.',
  'viewer3d.quick.switchStandard': 'Switch to Standard',
  'viewer3d.quick.switchTeaching': 'Try Teaching mode',

  'viewer3d.teaching.cadTitle': 'CAD B-Rep solids vs. polygon meshes',
  'viewer3d.teaching.cadBody':
    'STEP, IGES, and BREP store exact mathematical curves and surfaces (B-Rep), which Open CASCADE tessellates into triangles locally in a Web Worker. STL, OBJ, and glTF already store meshes — use Mesh quality (Draft / Normal / Fine) on CAD files to balance smoothness against triangle count.',
  'viewer3d.teaching.sectionTitle': 'Section planes, orthographic view & measurement',
  'viewer3d.teaching.sectionBody':
    'Cut along X, Y, or Z to inspect internal cavities and wall thickness (cut interiors highlight in orange). Toggle Orthographic projection to compare proportions without perspective distortion, and use Measure to click two surface points.',
  'viewer3d.teaching.openGuide': 'Read Formats & Controls Guide →',

  'viewer3d.guide.title': '3D Formats & Controls Guide',
  'viewer3d.guide.lead':
    'Every CAD, 3D-printing, scene, and point-cloud format read locally in the browser, plus camera controls, sectioning, measuring, and export tips.',
  'viewer3d.guide.formatsTitle': 'Supported 3D formats',
  'viewer3d.guide.controlsTitle': 'Camera & viewport controls',
  'viewer3d.guide.toolsTitle': 'Sectioning, measuring & export',
  'viewer3d.guide.privacyTitle': 'Local Open CASCADE & privacy',
  'viewer3d.guide.privacyBody':
    'CAD files (STEP, IGES, BREP) are parsed and tessellated locally inside a Web Worker using self-hosted Open CASCADE (occt-import-js, LGPL-2.1). Companion materials, buffers, and textures are matched strictly from files you open — nothing is ever uploaded or fetched remotely.',
  'viewer3d.guide.backToWorkbench': 'Back to Workbench →',

  // PCB viewer namespace
  'pcb.pageTitle': 'PCB Viewer · yotasage',
  'pcb.title': 'PCB Viewer',
  'pcb.workbench': 'Workbench',
  'pcb.guide': 'Formats & Guide',
  'pcb.lead':
    'Inspect Gerber & Excellon manufacturing sets or native KiCad, Altium, PADS, and EAGLE boards layer by layer or in realistic solder-mask view, highlight nets and components, measure pads, and export PNG, SVG, 1:1 PDF, DXF, BOM/PnP, or KiCad.',
  'pcb.loading': 'Loading PCB viewer…',

  'pcb.drop.title': 'Open Gerber files or an EDA board',
  'pcb.drop.desc':
    'Select Gerber and drill files, a project folder, a ZIP archive, or a KiCad, Altium, PADS, or EAGLE board. Inspect layers or realistic mask & finish from top or bottom, highlight nets and parts, measure, and export.',
  'pcb.drop.selectFiles': 'Select files',
  'pcb.drop.selectFolder': 'Select folder',
  'pcb.drop.tryExample': 'Try an example board',
  'pcb.drop.loadingExample': 'Loading example…',
  'pcb.drop.exampleError': 'Could not load the example board. Please try again.',
  'pcb.drop.hint':
    'or drop files, ZIP archives, or a whole project folder here. Other project files can come along — the file list shows how each file was classified.',
  'pcb.drop.localHint': 'Your files are read locally in this browser and are never uploaded.',
  'pcb.drop.allFormats': 'All supported formats →',

  'pcb.quick.badge': 'Quick mode',
  'pcb.quick.bannerText':
    'Drop Gerber/drill files, a ZIP, or a native board below to inspect immediately. Switch to Standard for full details, or Teaching for Gerber vs. EDA tips.',
  'pcb.quick.switchStandard': 'Switch to Standard',
  'pcb.quick.switchTeaching': 'Try Teaching mode',

  'pcb.teaching.formatsTitle': 'Gerber / Excellon vs. native EDA boards',
  'pcb.teaching.formatsBody':
    'Gerber (RS-274X / X2) and Excellon drill files are fabrication outputs describing each copper, mask, silkscreen, and drill layer independently. Native design files (KiCad, Altium, PADS, EAGLE) also carry full component metadata, netlists, BOM/pick-and-place tables, and can be converted to KiCad.',
  'pcb.teaching.viewsTitle': 'Layer view vs. Realistic board view',
  'pcb.teaching.viewsBody':
    'Use Layer view to inspect individual copper pours, clearances, and drill hits in distinct colours. Switch to Realistic view to verify solder-mask openings, silkscreen legibility, and surface finish (ENIG / HASL) from both Top and Bottom.',
  'pcb.teaching.openGuide': 'Read Formats & Workflow Guide →',

  'pcb.guide.title': 'Supported Formats & Workflow Guide',
  'pcb.guide.lead':
    'All 9 manufacturing and native EDA formats supported locally, plus realistic vs. layer rendering, inspection, measurement, and export capabilities.',
  'pcb.guide.formatsTitle': 'Supported PCB & manufacturing formats',
  'pcb.guide.viewsTitle': 'Layer vs. Realistic view & navigation',
  'pcb.guide.inspectTitle': 'Inspect, highlight, measure & export',
  'pcb.guide.privacyTitle': '100 % local browser rendering',
  'pcb.guide.privacyBody':
    'Every Gerber, Excellon, KiCad, Altium, PADS, EAGLE, and ZIP archive is parsed and rendered directly in Canvas 2D on your device. Board designs and assembly files never leave your browser.',
  'pcb.guide.backToWorkbench': 'Back to Workbench →',
} as const;

export type TranslationKey = keyof typeof en;

export const nb: Record<TranslationKey, string> = {
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

  // Home namespace
  'home.pageTitle': 'Verktøy · yotasage',
  'home.metaDescription':
    'Raske verktøy med åpen kildekode for ingeniørfag, dokumenter og daglige oppgaver som kjører helt lokalt i nettleseren — uten reklame, opplastinger eller innlogging.',
  'home.title': 'Verktøy som kjører rett i nettleseren',
  'home.subtitle': 'Raske, reklamefrie nettleserverktøy som kjører helt lokalt på enheten din.',
  'home.eyebrow': 'Åpen kildekode · Lokalt i nettleseren',
  'home.heroLead':
    'En rask og ryddig verktøykasse for elektronikk, RF-teknikk, dokumenter, 3D-modeller og daglige oppgaver. Alt kjører lokalt på enheten din — ingen servere, ingen reklame, og filene dine forlater aldri maskinen.',
  'home.promise.browser': 'Kjører i nettleseren',
  'home.promise.local': 'Filene forlater aldri enheten',
  'home.promise.noAds': 'Ingen reklame eller sporing',
  'home.promise.noSignup': 'Ingen innlogging',
  'home.filterAria': 'Filtrer verktøy etter kategori',
  'home.cat.all': 'Alle',
  'home.cat.electronics': 'Elektronikk og RF',
  'home.cat.documents': 'Dokumenter og 3D',
  'home.cat.utilities': 'Koder og nytteverktøy',
  'home.searchPlaceholder': 'Søk i verktøy…',
  'home.searchAria': 'Søk i verktøy',
  'home.searchClear': 'Tøm søk',
  'home.allCategories': 'Alle verktøy',
  'home.toolsNavAria': 'Verktøy',
  'home.resultsCount': 'Viser {count} av {total} verktøy',
  'home.noResults': 'Ingen verktøy passer med «{query}».',
  'home.noResultsHint': 'Prøv et annet søkeord, eller tilbakestill søket og kategorifilteret.',
  'home.resetFilters': 'Vis alle verktøy',
  'home.openTool': 'Åpne verktøy',
  'home.pdfSubToolsCount': '{count} innebygde PDF-verktøy',
  'home.tool.simsetup.title': 'Simuleringsoppsett',
  'home.tool.simsetup.category': 'Signalbehandling',
  'home.tool.simsetup.desc':
    'Beregn koherente samplingsparametre (f₀, Fs, Ncyc, Npts) for FFT og simuleringer, og kontroller dem mot regler for primtall og toerpotenser.',
  'home.tool.resistor.title': 'Motstandsoppslag',
  'home.tool.resistor.category': 'Elektronikk',
  'home.tool.resistor.desc':
    'Dekod fargebånd og SMD-merking, finn nærmeste E3–E192-verdier, beregn serie- og parallellkoblinger, og dimensjoner delere eller shunter over temperatur.',
  'home.tool.smith.title': 'Smith-diagram',
  'home.tool.smith.category': 'RF og mikrobølge',
  'home.tool.smith.desc':
    'Bygg og dra impedanstilpasningsnettverk på interaktive Z-, Y- og ZY-rutenett med automatisk løser, frekvenssveip og eksport til SVG, TikZ, CSV og Touchstone.',
  'home.tool.pcb.title': 'PCB-viser',
  'home.tool.pcb.category': 'Elektronikk',
  'home.tool.pcb.desc':
    'Inspiser Gerber-, Excellon-, KiCad-, Altium-, PADS- og EAGLE-kort lag for lag eller realistisk, mål nett, eksporter 1:1-tegninger eller konverter til KiCad.',
  'home.tool.emsim.title': 'EM-simulering',
  'home.tool.emsim.category': 'RF og signalintegritet',
  'home.tool.emsim.desc':
    'Beregn impedans for PCB-baner og differensialpar med 2D/3D-feltløser, interaktive stackups, JLCPCB/KiCad-maler og via-analyse.',
  'home.tool.pdf.title': 'PDF-verktøy',
  'home.tool.pdf.category': 'Dokumenter',
  'home.tool.pdf.desc':
    'En komplett privat PDF-pakke: les, sammenlign, slå sammen, del, komprimer, kjør OCR, signer, sladd, konverter og fjern metadata helt lokalt.',
  'home.tool.viewer3d.title': '3D-viser',
  'home.tool.viewer3d.category': '3D-modeller',
  'home.tool.viewer3d.desc':
    'Se CAD- og mesh-modeller (STEP, IGES, STL, 3MF, OBJ, glTF, FBX, USDZ) med snittvisning, måleverktøy og eksport til STL, OBJ, PLY eller GLB.',
  'home.tool.qrcode.title': 'QR-kodegenerator',
  'home.tool.qrcode.category': 'Koder',
  'home.tool.qrcode.desc':
    'Lag standard QR-, Micro QR- og rMQR-koder med full kontroll over versjon, feilkorrigering, maske og koding — med eksport til PNG, SVG eller PDF.',
  'home.tool.qrreader.title': 'QR-kodeleser',
  'home.tool.qrreader.category': 'Koder',
  'home.tool.qrreader.desc':
    'Skann QR-, Micro QR- og rMQR-koder fra kamera, bilder, utklippstavle eller PDF — med tolkning av Wi-Fi, eSIM, kontakter, betalinger, 2FA og rådata.',
  'home.tool.base64.title': 'Base64-bildekonverterer',
  'home.tool.base64.category': 'Bilder',
  'home.tool.base64.desc':
    'Konverter bilder til Base64 eller data-URL-er for HTML, CSS og Markdown, eller dekod Base64-strenger tilbake til bilder du kan forhåndsvise og laste ned.',
  'home.tool.textcase.title': 'Tekstformatkonverterer',
  'home.tool.textcase.category': 'Tekst',
  'home.tool.textcase.desc':
    'Endre store/små bokstaver og kodeidentifikatorer i sanntid (Sentence, Title, UPPER, camelCase, snake_case, kebab-case) med tegn-, ord- og linjeteller.',

  // Simulation setup namespace
  'simsetup.pageTitle': 'Simuleringsoppsett · yotasage',
  'simsetup.title': 'Simuleringsoppsett',
  'simsetup.subtitle':
    'Beregn koherente samplingsparametre (f₀, Fs, Ncyc, Npts) for FFT og simuleringer, og kontroller dem mot regler for primtall og toerpotenser.',
  'simsetup.workbench': 'Arbeidsbenk',
  'simsetup.examples': 'Eksempler og guide',
  'simsetup.theory': 'Teori',

  'simsetup.helperNavAria': 'Hjelpeverktøy',
  'simsetup.helper.primes': 'Primtall',
  'simsetup.helper.powers': 'Toerpotenser',
  'simsetup.helper.rules': 'Regler',

  'simsetup.calc.title': 'Kalkulator',
  'simsetup.calc.quickTitle': 'Kalkulator for koherent sampling',
  'simsetup.calc.boxTitle': 'Boks {n}',
  'simsetup.calc.calculate': 'Beregn',
  'simsetup.calc.precision': 'Presisjon',
  'simsetup.calc.precisionTitle': 'Antall gjeldende siffer for beregnede verdier',
  'simsetup.calc.digits': 'siffer',
  'simsetup.calc.precisionError': 'Presisjon må være et heltall fra 1 til {max}. Bruker {current}.',
  'simsetup.calc.format': 'Format',
  'simsetup.calc.formatPlain': 'Vanlig (2340571.4286 Hz)',
  'simsetup.calc.formatSi': 'SI-prefiks (2.3405714286 MHz)',
  'simsetup.calc.grouping': 'Gruppering',
  'simsetup.calc.groupingTitle': 'Hvordan lange tall deles inn i grupper på tre siffer',
  'simsetup.calc.groupNone': 'Ingen (1000000)',
  'simsetup.calc.groupSpace': 'Mellomrom (1 000 000)',
  'simsetup.calc.groupUnderscore': 'Understrek, Python (1_000_000)',
  'simsetup.calc.addBox': 'Ny boks',
  'simsetup.calc.duplicate': 'Dupliser',
  'simsetup.calc.remove': 'Fjern',
  'simsetup.calc.duplicateAria': 'Dupliser {title}',
  'simsetup.calc.removeAria': 'Fjern {title}',
  'simsetup.calc.derivedSpectrum': 'Perioder og oppløsning',
  'simsetup.calc.derivedTiming': 'Tidsvindu og område',

  'simsetup.check.tooLarge': 'For stort til å sjekke',
  'simsetup.check.notInteger': 'Ikke et heltall',
  'simsetup.check.prime': 'Primtall',
  'simsetup.check.odd': 'Oddetall, ikke primtall',
  'simsetup.check.even': 'Partall',
  'simsetup.check.coprime': 'Ingen felles faktor med Npts',
  'simsetup.check.commonFactor': 'Felles faktor {factor} med Npts',
  'simsetup.check.powerOfTwo': 'Toerpotens',
  'simsetup.check.notPowerOfTwo': 'Ikke en toerpotens',

  'simsetup.prime.title': 'Primtall',
  'simsetup.prime.inputAria': 'Tall for primtallssjekk',
  'simsetup.prime.enterWhole': 'Skriv inn et heltall',
  'simsetup.prime.notWhole': 'Ikke et heltall',
  'simsetup.prime.maxDigits': 'Maks {max} siffer',
  'simsetup.prime.notPrime': 'Ikke primtall',
  'simsetup.prime.isPrime': 'Primtall',
  'simsetup.prime.probablyPrime': 'Sannsynlig primtall',
  'simsetup.prime.next': 'Neste',
  'simsetup.prime.prev': 'Forrige',
  'simsetup.prime.apply': 'Bruk som Ncyc',
  'simsetup.prime.applied': 'Lagt inn i Boks 1',
  'simsetup.prime.applyHint': 'Bruk dette primtallet som Ncyc i Boks 1',

  'simsetup.power.title': 'Toerpotenser',
  'simsetup.power.inputAria': 'Tall for toerpotenssjekk',
  'simsetup.power.enterWhole': 'Skriv inn et heltall',
  'simsetup.power.notWhole': 'Ikke et heltall',
  'simsetup.power.minOne': 'Må være 1 eller større',
  'simsetup.power.exact': 'Eksakt toerpotens',
  'simsetup.power.notExact': 'Ikke en toerpotens',
  'simsetup.power.next': 'Neste',
  'simsetup.power.prev': 'Forrige',
  'simsetup.power.apply': 'Bruk som Npts',
  'simsetup.power.applied': 'Lagt inn i Boks 1',
  'simsetup.power.applyHint': 'Bruk denne toerpotensen som Npts i Boks 1',

  'simsetup.rules.title': 'Sjekkliste for koherens',
  'simsetup.rules.subtitle': 'Sanntidsstatus for Boks 1 mot reglene for koherent sampling.',
  'simsetup.rules.statusCoherent': 'Koherent',
  'simsetup.rules.statusAcceptable': 'Akseptabel',
  'simsetup.rules.statusIssue': 'Regelbrudd',
  'simsetup.rules.statusIncomplete': 'Ufullstendig',
  'simsetup.rules.rule1Title': 'Regel 1 · Primtall eller oddetall sykluser',
  'simsetup.rules.rule1Desc': 'Ncyc bør være et heltall (helst primtall) uten felles faktor med Npts.',
  'simsetup.rules.rule2Title': 'Regel 2 · Toerpotens FFT-lengde',
  'simsetup.rules.rule2Desc': 'Npts bør være en eksakt toerpotens for radix-2 FFT.',
  'simsetup.rules.rule3Title': 'Regel 3 · Innbyrdes primiske',
  'simsetup.rules.rule3Desc': 'f0 og FS bør være innbyrdes primiske (sjekkes ikke numerisk).',
  'simsetup.rules.openPrimes': 'Velg primtall',
  'simsetup.rules.openPowers': 'Velg 2ⁿ',
  'simsetup.rules.openTheory': 'Les full teori og referanser →',
  'simsetup.rules.noData': 'Skriv inn gyldige verdier for å kjøre sjekker.',

  'simsetup.quick.badge': 'Rask modus',
  'simsetup.quick.bannerText':
    'Trenger du sammenligning av flere bokser, formatvalg eller primtalls- og toerpotenshjelpere?',
  'simsetup.quick.switchStandard': 'Bytt til Standard',
  'simsetup.quick.switchTeaching': 'Prøv Læringsmodus',

  'simsetup.teaching.ratioTitle': 'Hvorfor koherent sampling fjerner spektrallekkasje',
  'simsetup.teaching.ratioBody':
    'Koherent sampling tvinger et eksakt heltall sykluser inn i FFT-vinduet slik at første og siste prøve møtes uten brudd. Velg tre parametre så løser kalkulatoren for den fjerde:',
  'simsetup.teaching.helperTitle': 'Hvorfor primtall Ncyc og 2ᵏ prøver er viktig',
  'simsetup.teaching.helperBody':
    'Når Npts er en toerpotens (2ᵏ), er hvert primtall Ncyc > 2 automatisk koprimisk med Npts. Dermed treffer hver prøve en unik fase av sinuskurven og hindrer at foldede harmoniske havner i samme FFT-bøtte.',

  'simsetup.presets.title': 'Ferdige maler',
  'simsetup.presets.subtitle':
    'Last inn et verifisert koherent oppsett rett i Boks 1 og se beregnet tidsvindu og frekvensområde.',
  'simsetup.presets.load': 'Last i arbeidsbenk →',
  'simsetup.presets.audio.title': 'Lyd-ADC (48 kHz)',
  'simsetup.presets.audio.tag': 'Lyd · 4096-pkt FFT',
  'simsetup.presets.audio.desc':
    'Klassisk ~1 kHz sinustest ved 48 kHz samplingsfrekvens med 83 primtallssykluser (972,66 Hz) og 11,7 Hz oppløsning.',
  'simsetup.presets.rf.title': 'RF MF-sampling (100 MHz)',
  'simsetup.presets.rf.tag': 'RF · 16384-pkt FFT',
  'simsetup.presets.rf.desc':
    'Høyhastighets 100 MSPS mellomfrekvensopptak nær 10,7 MHz med 1753 primtallssykluser for ren SFDR-analyse.',
  'simsetup.presets.sensor.title': 'Sensoropptak (1 kHz)',
  'simsetup.presets.sensor.tag': 'DAQ · 1024-pkt FFT',
  'simsetup.presets.sensor.desc':
    'Lavfrekvent 1 kHz DAQ-oppsett (~51,76 Hz testtone, 1,024 s vindu) for vibrasjons- og industrisensorer.',
  'simsetup.presets.spice.title': 'SPICE-transient (10 MHz)',
  'simsetup.presets.spice.tag': 'SPICE · 2048-pkt FFT',
  'simsetup.presets.spice.desc':
    'Bruker SPICE-syntaksen meg (10meg) og 10 µs innsvingningstid (tstart) før opptak av 101 primtallssykluser (~493,16 kHz).',

  'simsetup.guide.title': 'Slik bruker du verktøyet',
  'simsetup.guide.subtitle':
    'Tallsyntaks, SPICE-tips, siffergruppering, koherenssjekker og snarveier for tallhjelpere.',

  'simsetup.theory.parametersTitle': 'Parametre',
  'simsetup.theory.coherentTitle': 'Koherent sampling',
  'simsetup.theory.referencesTitle': 'Referanser',
  'simsetup.theory.symbol': 'Symbol',
  'simsetup.theory.description': 'Beskrivelse',
  'simsetup.theory.calculatedAs': 'Beregnes som',
  'simsetup.theory.unit': 'Enhet',
  'simsetup.theory.typedIn': 'Skrives inn',
  'simsetup.theory.inCalculator': 'I kalkulatoren:',
  'simsetup.theory.notCheckedByCalc': 'Kontrolleres ikke av kalkulatoren.',
  'simsetup.theory.source': 'Kilde:',
  'simsetup.theory.notes': 'Noter',
  'simsetup.theory.rule': 'Regel',
  'simsetup.theory.note': 'Note',

  // Resistor lookup namespace
  'resistor.pageTitle': 'Motstandsoppslag · yotasage',
  'resistor.title': 'Motstandsoppslag',
  'resistor.workbench': 'Arbeidsbenk',
  'resistor.examples': 'Eksempler',
  'resistor.theory': 'Teori og referanser',

  'resistor.tabsAria': 'Verktøy i arbeidsbenken',
  'resistor.tab.lookup': 'Oppslag',
  'resistor.tab.drawing': 'Bånd og eksport',
  'resistor.tab.combinations': 'Kombinasjoner',
  'resistor.tab.design': 'Design',

  'resistor.theoryTabsAria': 'Teori- og referanseseksjoner',
  'resistor.theoryTab.theory': 'Teori',
  'resistor.theoryTab.reference': 'Referansetabeller',
  'resistor.theoryTab.references': 'Kilder',
  'resistor.referencesLead':
    'Kildene til tabellene og teorien på denne siden, i rekkefølgen de først siteres.',

  'resistor.quick.badge': 'Rask modus',
  'resistor.quick.bannerText':
    'Viser Oppslag og Bånd og eksport. Bytt til Standard for serie-/parallellkombinasjoner og deler- eller forsterkerdesign.',
  'resistor.quick.switchStandard': 'Bytt til Standard',
  'resistor.quick.switchTeaching': 'Prøv Læringsmodus',

  'resistor.teaching.inputTitle': 'Smart inntasting og trinnvis endring',
  'resistor.teaching.inputBody':
    'Skriv en verdi (4k7, 4.7k, 49.9), en SMD-kode (472, 01C) eller fargebånd (yellow violet red gold). Bruk pil opp/ned i feltet for å gå trinnvis gjennom aktiv E-serie.',
  'resistor.teaching.lookupTitle': 'Hvorfor E-seriene er logaritmisk fordelt',
  'resistor.teaching.lookupBody':
    'IEC 60063 fordeler standardverdier geometrisk i hvert dekade slik at maksimal avrundingsfeil er konstant og passer toleransen (E12 ≈ ±10 %, E24 ≈ ±5 %, E96 ≈ ±1 %).',
  'resistor.teaching.drawingTitle': 'Interaktiv bånd- og SMD-dekoding',
  'resistor.teaching.drawingBody':
    'Klikk på et fargebånd i tegningen for å endre det direkte, eller rediger SMD-koden. Fire bånd gir 2 siffer + multiplikator + toleranse; 5 og 6 bånd legger til tredje siffer og TCR.',
  'resistor.teaching.combosTitle': 'Finjustering med motstandskombinasjoner',
  'resistor.teaching.combosBody':
    'En liten motstand i serie justerer oppover, mens en mye større motstand i parallell justerer svakt nedover. To vanlige E24-verdier gir ofte høyere presisjon enn én E96-verdi.',
  'resistor.teaching.designTitle': 'Verstefall kontra RSS-toleransebudsjett',
  'resistor.teaching.designBody':
    'Verstefallsanalyse antar at alle motstander treffer toleranse- og temperaturgrensen samtidig. Kvadratrotsum (RSS) modellerer uavhengige tilfeldige avvik i produksjon.',

  'resistor.examples.title': 'Praktiske elektronikkeksempler',
  'resistor.examples.subtitle':
    'Klikk på en mal for å laste verdi, merking og typisk toleranse rett inn i arbeidsbenken.',
  'resistor.examples.try': 'Last i arbeidsbenk →',
  'resistor.examples.i2c.title': '4,7 kΩ I²C Pull-Up',
  'resistor.examples.i2c.tag': 'Digital · E24 ±5 %',
  'resistor.examples.i2c.desc':
    'Standard pull-up-motstand for 3,3 V / 5 V I²C-busslinjer (SDA og SCL) som balanserer stigetid mot strømtrekk.',
  'resistor.examples.led.title': '330 Ω LED-formotstand',
  'resistor.examples.led.tag': 'Indikator · 5 V',
  'resistor.examples.led.desc':
    'Klassisk strømbegrensningsmotstand for en rød eller grønn indikator-LED (~9–10 mA fra en 5 V-utgang).',
  'resistor.examples.rf.title': '49,9 Ω 1 % RF-terminering',
  'resistor.examples.rf.tag': 'RF · E96 ±1 %',
  'resistor.examples.rf.desc':
    'Nærmeste E96-standardverdi til 50 Ω for impedanstilpassede RF-porter, koaksialterminering og høyhastighetslinjer.',
  'resistor.examples.opamp.title': '100 kΩ Op-amp tilbakekobling',
  'resistor.examples.opamp.tag': 'Analog · E96 ±1 %',
  'resistor.examples.opamp.desc':
    'Presisjonsmotstand i tilbakekobling sammen med 10 kΩ for inverterende forsterkning −10 eller ikke-inverterende 11.',
  'resistor.examples.smd3.title': '472 3-sifret SMD',
  'resistor.examples.smd3.tag': 'SMD · 3-sifret kode',
  'resistor.examples.smd3.desc':
    'Standard 3-sifret overflatemontert merking: sifrene 4 og 7 etterfulgt av 2 nuller (47 × 10² = 4,7 kΩ).',
  'resistor.examples.eia96.title': '01C EIA-96 10 kΩ',
  'resistor.examples.eia96.tag': 'SMD · EIA-96 1 %',
  'resistor.examples.eia96.desc':
    'Kompakt 0603 1 % presisjonsmerking: kode 01 tilsvarer 100 i E96-tabellen, multiplisert med C (×100) = 10 kΩ.',

  // Smith chart namespace
  'smith.pageTitle': 'Smith-diagram · yotasage',
  'smith.title': 'Smith-diagram',
  'smith.workbench': 'Arbeidsbenk',
  'smith.learn': 'Lær og oppgaver',
  'smith.theory': 'Teori og referanser',

  'smith.inspectorTabsAria': 'Inspektørverktøy',
  'smith.tab.circuit': 'Krets',
  'smith.tab.solver': 'Løser',
  'smith.tab.sweep': 'Sveip',
  'smith.tab.equations': 'Ligninger',
  'smith.tab.export': 'Eksport',

  'smith.theoryTabsAria': 'Teori- og referanseseksjoner',
  'smith.theoryTab.theory': 'Teori',
  'smith.theoryTab.references': 'Referanser',
  'smith.referencesLead':
    'Kildene til teorien på denne siden, i rekkefølgen de først siteres.',

  'smith.quick.badge': 'Rask modus',
  'smith.quick.bannerText':
    'Viser Krets og Eksport. Bytt til Standard for automatisk løser, frekvenssveip og sanntidsligninger.',
  'smith.quick.switchStandard': 'Bytt til Standard',
  'smith.quick.switchTeaching': 'Prøv Læringsmodus',

  'smith.teaching.gridTitle': 'Lese Z- og Y-sirkler',
  'smith.teaching.gridBody':
    'Sirkler med konstant resistans (r) tangerer åpen-krets-punktet til høyre (Γ = +1), mens konstant konduktans (g) speiler dem til venstre (Γ = −1). Bytt mellom Z-, Y- og ZY-rutenett for å lese impedans og admittans samtidig.',
  'smith.teaching.circuitTitle': 'Tilpasning med serie- og parallellbuer',
  'smith.teaching.circuitBody':
    'En seriereaktans følger en konstant r-sirkel (spole med klokken, kondensator mot klokken). En parallellsusceptans følger en konstant g-sirkel. Dra et håndtak på diagrammet for å styre en node inn på r = 1 eller g = 1.',
  'smith.teaching.solverTitle': 'Konstruksjonssirkler i løseren',
  'smith.teaching.solverBody':
    'Marker én eller to komponenter som ukjente og velg et mål (for eksempel VSWR = 1). Løseren skjærer sirkelen fra lasten med sirkelen fra målet — og gir to, én eller ingen eksakte løsninger.',
  'smith.teaching.sweepTitle': 'Frekvenssveip, båndbredde og Q',
  'smith.teaching.sweepBody':
    'Diskrete komponenter tilpasser ved f₀ og sprer seg til et frekvensspor over båndet. Høyere Q = |x|/r gir smalere VSWR-båndbredde; legg til markører for å måle refleksjonstap og impedans ved båndkantene.',
  'smith.teaching.equationsTitle': 'Levende ligninger og kryssmarkering',
  'smith.teaching.equationsBody':
    'Hold over eller fokuser på en variabel for å utheve buen, noden eller avlesningen på diagrammet. Klikk på en utledningslenke for å se hele utregningen.',

  // EM simulation namespace
  'emsim.pageTitle': 'EM-simulering · yotasage',
  'emsim.title': 'EM-simulering',
  'emsim.workbench': 'Arbeidsbenk',
  'emsim.examples': 'Eksempler',
  'emsim.theory': 'Teori og referanser',

  'emsim.tabsAria': 'Verktøy i arbeidsbenken',
  'emsim.tab.stackup': 'Lagoppbygging',
  'emsim.tab.trace': 'Bane',
  'emsim.tab.via': 'Via',
  'emsim.tab.waves': 'Bølger',
  'emsim.tab.export': 'Eksport',

  'emsim.theoryTabsAria': 'Teori- og referanseseksjoner',
  'emsim.theoryTab.theory': 'Teori',
  'emsim.theoryTab.references': 'Referanser',

  'emsim.prefs.units': 'Enheter',
  'emsim.prefs.unitsAria': 'Lengdeenheter',
  'emsim.prefs.digits': 'Siffer',
  'emsim.prefs.digitsAria': 'Gjeldende siffer',
  'emsim.prefs.copyLink': 'Kopier lenke',
  'emsim.prefs.linkCopied': 'Lenke kopiert',
  'emsim.undoTitle': 'Angre (Ctrl+Z)',
  'emsim.redoTitle': 'Gjør om (Ctrl+Shift+Z)',

  'emsim.loading.via': 'Laster 3D via-editor og beregningsmotor…',
  'emsim.loading.waves': 'Laster fullbølge FDTD-løser (WebGPU / CPU)…',
  'emsim.loading.export': 'Laster figur-, data- og rapporteksport…',
  'emsim.loading.examples': 'Laster gjennomgåtte eksempler…',
  'emsim.loading.theory': 'Laster teori, ligninger og referanser…',
  'emsim.loading.references': 'Kildene teorien siterer vises så snart teorien er lastet.',

  'emsim.quick.badge': 'Rask modus',
  'emsim.quick.bannerText':
    'Viser Lagoppbygging og Bane. Bytt til Standard for 3D-viaer, fullbølge-FDTD og eksport til TikZ / Touchstone.',
  'emsim.quick.switchStandard': 'Bytt til Standard',
  'emsim.quick.switchTeaching': 'Prøv Læringsmodus',

  'emsim.teaching.stackupTitle': 'Hvorfor lagoppbyggingen styrer impedansen',
  'emsim.teaching.stackupBody':
    'Karakteristisk impedans bestemmes hovedsakelig av dielektrisk høyde (h), relativ permittivitet (εr) og kobbertykkelse. Start med en JLCPCB-mal eller slipp en KiCad .kicad_pcb + .kicad_pro for å hente reelle toleranser og nettklasser.',
  'emsim.teaching.traceTitle': '2D kvasi-TEM feltløser og håndtak',
  'emsim.teaching.traceBody':
    'Dra i håndtakene på tverrsnittet for å justere bredde, avstand eller høyde direkte. 2D-feltløseren beregner L- og C-matriser per lengdeenhet inkludert loddemaske og trapesetsing — klikk på et understreket resultat for å se ligningen.',
  'emsim.teaching.viaTitle': 'Via-kapasitans, induktans og stub-resonans',
  'emsim.teaching.viaBody':
    'En via-overgang oppfører seg som en kort seksjon med impedans √(L/C): pader og trange antipader øker kapasitansen, mens sylinder og fjerne returviaer øker induktansen. En ubrukt stub etter utgangslaget gir kvartbølge-resonans.',
  'emsim.teaching.wavesTitle': 'Når bør du kjøre 3D fullbølge-FDTD',
  'emsim.teaching.wavesBody':
    'Kvasi-statiske modeller er nøyaktige langt under λ/8. Kjør 3D FDTD-løseren (WebGPU / CPU) i nettleseren når stigetidene er svært korte, en stub resonerer nær signalbåndet, eller returviaene ligger langt fra signalviaen.',

  // QR code generator namespace
  'qrgen.pageTitle': 'QR-kodegenerator · yotasage',
  'qrgen.title': 'QR-kodegenerator',
  'qrgen.workbench': 'Arbeidsbenk',
  'qrgen.guide': 'Guide og teori',

  'qrgen.tabsAria': 'Generatorseksjoner',
  'qrgen.tab.content': 'Innhold',
  'qrgen.tab.symbol': 'Symbol',
  'qrgen.tab.encoding': 'Koding',
  'qrgen.tab.style': 'Stil og eksport',
  'qrgen.tab.decrypt': 'Dekrypter',

  'qrgen.quick.badge': 'Rask modus',
  'qrgen.quick.bannerText':
    'Viser Innhold og Stil og eksport. Bytt til Standard for symbolversjon/maske, koding/ECI/GS1 og dekryptering.',
  'qrgen.quick.switchStandard': 'Bytt til Standard',
  'qrgen.quick.switchTeaching': 'Prøv Læringsmodus',

  'qrgen.preview.title': 'Forhåndsvisning',
  'qrgen.preview.download': 'Last ned',
  'qrgen.preview.detailsTitle': 'Symboldetaljer',
  'qrgen.preview.modules': 'moduler',

  'qrgen.teaching.ecTitle': 'Reed-Solomon feilkorrigering (L / M / Q / H)',
  'qrgen.teaching.ecBody':
    'QR-koder legger inn redundante Reed-Solomon-kodeord slik at skadede eller delvis tildekkede symboler fortsatt kan skannes: L gjenoppretter ~7 %, M ~15 %, Q ~25 % og H ~30 %. Velg alltid Q eller H ved logo i midten.',
  'qrgen.teaching.quietTitle': 'Versjoner, kapasitet og stille sone',
  'qrgen.teaching.quietBody':
    'Modell 2 skalerer fra versjon 1 (21 × 21) til versjon 40 (177 × 177), med 4 ekstra moduler per side for hvert trinn. ISO/IEC 18004 krever en stille sone på 4 moduler rundt kvadratiske QR-koder (2 moduler for Micro QR og rMQR) slik at kameraet finner søkemønstrene.',
  'qrgen.teaching.familyTitle': 'Hvorfor Micro QR og rMQR finnes',
  'qrgen.teaching.familyBody':
    'Micro QR bruker bare ett søkemønster for å passe på små komponenter (ned til 11 × 11 moduler). Rektangulær Micro QR (rMQR, ISO/IEC 23941) er ned til 7 moduler høy for kabler, rør og smale kretskort- eller etikettkanter.',
  'qrgen.teaching.encodingTitle': 'Kodemoduser og biteffektivitet',
  'qrgen.teaching.encodingBody':
    'Automatisk modus kombinerer segmenter for å krympe symbolet: Numerisk pakker 3 siffer på 10 bit (3,33 bit/tegn), Alfanumerisk 2 tegn på 11 bit (5,5 bit/tegn), Byte bruker 8 bit/byte, og Kanji pakker Shift JIS-tegn på 13 bit.',

  'qrgen.guide.title': 'Guide og teori for QR-koder',
  'qrgen.guide.lead':
    'Standarder, symbolfamilier, Reed-Solomon feilkorrigeringsbudsjett, krav til stille sone og kodemoduser.',

  // QR code reader namespace
  'qrread.pageTitle': 'QR-kodeleser · yotasage',
  'qrread.title': 'QR-kodeleser',
  'qrread.workbench': 'Arbeidsbenk',
  'qrread.guide': 'Støttede formater',

  'qrread.tabsAria': 'Inndatakilder',
  'qrread.tab.file': 'Bilde / PDF',
  'qrread.tab.camera': 'Kamera',
  'qrread.tab.text': 'Tekst',

  'qrread.quick.badge': 'Rask modus',
  'qrread.quick.bannerText':
    'Viser skanning fra bilde/PDF og kamera. Bytt til Standard for å lime inn rå payload-tekst eller inspisere flere detaljer.',
  'qrread.quick.switchStandard': 'Bytt til Standard',
  'qrread.quick.switchTeaching': 'Prøv Læringsmodus',

  'qrread.results.title': 'Dekodede resultater',
  'qrread.results.clearAll': 'Tøm alle',
  'qrread.results.emptyTitle': 'Ingen koder dekodet ennå',
  'qrread.results.emptyDesc':
    'Slipp et bilde eller en PDF, lim inn et skjermbilde med Ctrl+V, start kameraet, eller prøv et innebygd eksempel med tre QR-koder.',
  'qrread.results.tryExample': 'Prøv et eksempel',

  'qrread.teaching.wasmTitle': 'Lokal dekoding med ZXing-C++ WebAssembly',
  'qrread.teaching.wasmBody':
    'Bilder, PDF-sider og kamerabilder dekodes i en lokal Web Worker med en selvhostet ZXing-C++ WebAssembly-modul (/qr/). Bilder og video forlater aldri enheten din.',
  'qrread.teaching.parsersTitle': 'Strukturerte innholdstolkere',
  'qrread.teaching.parsersBody':
    'Dekodet tekst og rå byte gjenkjennes mot standarder for Wi-Fi, eSIM LPA-aktiveringskoder, vCard/MeCard-kontakter, iCalendar-hendelser, EPC/sveitsiske QR-fakturaer og TOTP 2FA — med trygge forhåndsvisninger.',
  'qrread.teaching.rawTitle': 'Rå byte, ECI og symbolgeometri',
  'qrread.teaching.rawBody':
    'Åpne fanene Raw eller Symbol på et resultat for å inspisere heksdump, kontrolltegn, ECI-tegnsett, versjon, maske og feilkorrigeringsnivå.',

  'qrread.guide.title': 'Støttede formater og personvern',
  'qrread.guide.lead':
    'Alle strekkodesymboler, strukturerte innholdstolkere og lokale personverngarantier i denne leseren.',

  // Base64 image converter namespace
  'base64.pageTitle': 'Base64-bildekonverterer · yotasage',
  'base64.title': 'Base64-bildekonverterer',
  'base64.workbench': 'Arbeidsbenk',
  'base64.guide': 'Guide og teori',

  'base64.tabsAria': 'Konverteringsretning',
  'base64.tab.encode': 'Bilde → Base64',
  'base64.tab.decode': 'Base64 → Bilde',

  'base64.lead':
    'Gjør et bilde om til Base64, en data-URL eller en ferdig HTML-, CSS- eller Markdown-kodebit, og dekod Base64 tilbake til et bilde. Alt kjører lokalt i nettleseren din.',

  'base64.quick.badge': 'Rask modus',
  'base64.quick.bannerText':
    'Fokusert enkeltvisning med faner for Koding / Dekoding. Bytt til Standard for side-ved-side arbeidsbenk, eller Læring for Base64-teori.',
  'base64.quick.switchStandard': 'Bytt til Standard',
  'base64.quick.switchTeaching': 'Prøv Læringsmodus',

  'base64.encoder.title': 'Bilde til Base64',
  'base64.encoder.selectImage': 'Velg bilde',
  'base64.encoder.dropHint': 'eller slipp et bilde her, eller lim inn (Ctrl+V)',
  'base64.encoder.chooseAnother': 'Velg et annet bilde',
  'base64.encoder.remove': 'Fjern',
  'base64.encoder.imageSection': 'Bilde',
  'base64.encoder.outputSection': 'Utdata',
  'base64.encoder.copy': 'Kopier',
  'base64.encoder.copied': 'Kopiert ✓',
  'base64.encoder.downloadTxt': 'Last ned .txt',

  'base64.decoder.title': 'Base64 til bilde',
  'base64.decoder.paste': 'Lim inn',
  'base64.decoder.openFile': 'Åpne tekstfil',
  'base64.decoder.clear': 'Tøm',
  'base64.decoder.imageSection': 'Bilde',
  'base64.decoder.copyImage': 'Kopier bilde',
  'base64.decoder.copied': 'Kopiert ✓',

  'base64.teaching.overheadTitle': 'Hvorfor Base64 er ~33 % større enn binærdata',
  'base64.teaching.overheadBody':
    'Base64 pakker hver gruppe på 3 byte (24 bit) inn i 4 skrivbare 6-bit ASCII-tegn, med inntil to = som fylltegn til slutt. Råtekst blir derfor omtrent 4/3 av opprinnelig bytestørrelse (før HTTP gzip/Brotli).',
  'base64.teaching.dataUrlTitle': 'Oppbygningen av en Data-URL',
  'base64.teaching.dataUrlBody':
    'En data-URL starter med data:<mime>;base64,<data> (for eksempel data:image/png;base64,iVBORw0…). For SVG er prosentkodet UTF-8-tekst ofte kortere og lettere å lese enn Base64.',
  'base64.teaching.inlineTitle': 'Når bør du bygge inn vs bruke eksterne filer',
  'base64.teaching.inlineBody':
    'Bygg inn små ikoner, plassholdere eller enkeltfil-eposter (< 4–10 KB) for å spare en HTTP-forespørsel. Behold bilder og større grafikk som egne bildefiler slik at nettleseren kan mellomlagre dem uten å blåse opp HTML/CSS.',

  'base64.guide.title': 'Guide og teori for Base64-bilder',
  'base64.guide.lead':
    'Hvordan Base64-koding fungerer, matematikken bak ~33 % størrelsesøkning, MIME-typer, kodeeksempler og personvern.',
  'base64.guide.encodingTitle': 'Hvordan Base64-koding fungerer',
  'base64.guide.encodingBody':
    'Binærfiler inneholder byteverdier (0–255) som ødelegger tekstformater som HTML, CSS, JSON og e-post. Base64 deler bitstrømmen i 6-bit grupper (64 tegn: A–Z, a–z, 0–9, pluss + / i standard Base64 eller - _ i URL-sikker Base64) slik at et bilde kan sendes trygt som ren ASCII-tekst.',
  'base64.guide.overheadTitle': 'Størrelsesøkningen på ~33 %',
  'base64.guide.overheadBody':
    'Tre 8-bit byte (24 bit) blir alltid fire 6-bit Base64-tegn. Hvis lengden ikke går opp i 3, fylles siste 4-tegnsblokk ut med ett eller to =-tegn. Skalering eller konvertering til WebP/JPEG før koding sparer ofte langt mer enn Base64 legger til.',
  'base64.guide.mimeTitle': 'Data-URL-er og MIME-typer',
  'base64.guide.mimeBody':
    'Nettlesere identifiserer innebygde bilder fra MIME-typen i data-URL-prefikset — eller fra filens magiske byte ved dekoding av ren Base64.',
  'base64.guide.snippetsTitle': 'HTML-, CSS- og Markdown-kodebiter',
  'base64.guide.snippetsBody':
    'Velg ønsket utdataformat i koderen for å pakke data-URL-en ferdig for nettsider, stilark eller Markdown-dokumenter.',
  'base64.guide.privacyTitle': '100 % lokalt og privat',
  'base64.guide.privacyBody':
    'All fillesing, bildekonvertering, Base64-koding og dekoding kjører lokalt i nettleseren din. Bilder og tekst forlater aldri enheten, og konvertering til PNG/JPEG/WebP fjerner EXIF- og GPS-metadata.',

  // Text case converter namespace
  'textcase.pageTitle': 'Tekstformatkonverterer · yotasage',
  'textcase.title': 'Tekstformatkonverterer',
  'textcase.workbench': 'Arbeidsbenk',
  'textcase.guide': 'Navne- og skriveregelguide',

  'textcase.lead':
    'Konverter tekst mellom prosastiler (Setningsformat, Tittelformat, STORE BOKSTAVER) og kodenavn (camelCase, PascalCase, snake_case, kebab-case) lokalt i nettleseren.',

  'textcase.quick.badge': 'Rask modus',
  'textcase.quick.bannerText':
    'Strømlinjeformet Inndata, Formatvelger og Resultat. Bytt til Standard for tittelstil (Chicago/APA), bevaring av akronymer, faste skrivemåter og ASCII-valg.',
  'textcase.quick.switchStandard': 'Bytt til Standard',
  'textcase.quick.switchTeaching': 'Prøv Læringsmodus',

  'textcase.input.title': 'Inndata',
  'textcase.input.placeholder': 'Skriv eller lim inn tekst her, eller slipp en tekstfil.',
  'textcase.input.paste': 'Lim inn',
  'textcase.input.openFile': 'Åpne tekstfil',
  'textcase.input.clear': 'Tøm',

  'textcase.case.aria': 'Tekstformat',
  'textcase.case.textGroup': 'Tekst',
  'textcase.case.codeGroup': 'Navn i kode',

  'textcase.result.title': 'Resultat',
  'textcase.result.placeholder': 'Resultatet vises her.',
  'textcase.result.copy': 'Kopier',
  'textcase.result.copied': 'Kopiert ✓',
  'textcase.result.download': 'Last ned',
  'textcase.result.useAsInput': 'Bruk som inndata',
  'textcase.result.options': 'Innstillinger',

  'textcase.teaching.titleCaseTitle': 'Chicago kontra APA for tittelformat',
  'textcase.teaching.titleCaseBody':
    'Begge stilene bruker stor forbokstav på første og siste ord, substantiv, verb og adjektiv. Chicago bruker små bokstaver på alle preposisjoner uansett lengde (between, through, with), mens APA bruker stor forbokstav på preposisjoner og konjunksjoner med 4 eller flere bokstaver.',
  'textcase.teaching.codeNamesTitle': 'Navnekonvensjoner i kode og smart orddeling',
  'textcase.teaching.codeNamesBody':
    'Bruk camelCase for JS/TS-variabler, PascalCase for typer/komponenter, snake_case for Python/SQL/Rust, CONSTANT_CASE for miljøvariabler og kebab-case for URL-er og CSS-klasser. Smart deling skiller akronymer som XMLHttpRequest rent til XML · Http · Request.',

  'textcase.guide.title': 'Guide til navnekonvensjoner og bokstavstørrelse',
  'textcase.guide.lead':
    'Skriveregler for prosa (setningsformat, Chicago vs APA tittelformat) og navnestandarder i programmering.',
  'textcase.guide.proseTitle': 'Prosastiler',
  'textcase.guide.proseBody':
    'Setningsformat foretrekkes i moderne brukergrensesnitt og norsk fagtekst fordi ordformer med små bokstaver leses raskere. Du kan bevare egennavn og forkortelser (NASA, MHz, iPhone), samt slå av engelsk stor «I» når du skriver norsk eller svensk der «i» er en preposisjon.',
  'textcase.guide.titleRulesTitle': 'Chicago kontra APA tittelformat',
  'textcase.guide.titleRulesBody':
    'Begge stilmanualene holder artikler (a, an, the) og korte konjunksjoner (and, but, for, or, nor) med små bokstaver når de ikke står først eller sist. Forskjellen ligger i lengre preposisjoner:',
  'textcase.guide.codeTitle': 'Navnekonvensjoner i kode',
  'textcase.guide.codeBody':
    'Hver linje i inndata blir ett navn. Ord deles ved mellomrom, tegnsetting og skifte i bokstavstørrelse (inkludert akronymgrenser som HTMLParser → html_parser).',
  'textcase.guide.asciiTitle': 'ASCII-translitterering og lagrede ord',
  'textcase.guide.asciiBody':
    'Slå på kun ASCII for å gjøre om aksenter og nordiske bokstaver (é → e, æ → ae, ø → o, å → a) til portable kodenavn. Ord med fast skrivemåte (som GitHub, iPhone eller NTNU) lagres lokalt i nettleseren din.',

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

  // PDF tools suite namespace
  'pdf.pageTitle': 'PDF-verktøy · yotasage',
  'pdf.title': 'PDF-verktøy',
  'pdf.eyebrow': '{count} lokale PDF-verktøy i nettleseren',
  'pdf.lead':
    'Alt kjører lokalt i nettleseren din. Filer forlater aldri enheten din — ingen reklame, ingen innlogging og ingen grenser utover enhetens minne.',
  'pdf.allTools': 'Alle PDF-verktøy',
  'pdf.searchPlaceholder': 'Søk i {count} PDF-verktøy…',
  'pdf.searchAria': 'Søk i PDF-verktøy',
  'pdf.searchClear': 'Tøm søk',
  'pdf.filterAria': 'Filtrer PDF-verktøy etter kategori',
  'pdf.cat.all': 'Alle',
  'pdf.cat.view': 'Vis',
  'pdf.cat.organize': 'Organiser',
  'pdf.cat.optimize': 'Optimaliser',
  'pdf.cat.edit': 'Rediger og merk',
  'pdf.cat.toPdf': 'Konverter til PDF',
  'pdf.cat.fromPdf': 'Konverter fra PDF',
  'pdf.cat.security': 'Sikkerhet',
  'pdf.resultsCount': 'Viser {count} av {total} PDF-verktøy',
  'pdf.noResults': 'Ingen PDF-verktøy samsvarer med «{query}».',
  'pdf.noResultsHint': 'Prøv et annet søkeord eller tilbakestill kategorifilteret.',
  'pdf.resetFilters': 'Tilbakestill filtre',
  'pdf.localHint': 'Filene dine behandles i denne nettleseren og lastes aldri opp.',
  'pdf.roadmapPrefix': 'Flere verktøy er planlagt — se ',
  'pdf.roadmapLink': 'veikartet',
  'pdf.teaching.privacyTitle': 'Slik fungerer lokal PDF-behandling i nettleseren',
  'pdf.teaching.privacyBody':
    'Hvert PDF-verktøy kjører direkte i nettleseren med JavaScript og selvhostet WebAssembly (pdf-lib, pdf.js, QPDF, Ghostscript og Tesseract OCR) i Web Workers. Filene blir i enhetens minne, kan kjedes videre mellom verktøy via Continue with…, og berører aldri en server.',

  // 3D viewer namespace
  'viewer3d.pageTitle': '3D-viser · yotasage',
  'viewer3d.title': '3D-viser',
  'viewer3d.workbench': 'Arbeidsbenk',
  'viewer3d.guide': 'Formater og guide',
  'viewer3d.lead':
    'Inspiser STEP-, IGES-, STL-, 3MF-, OBJ-, glTF-, FBX-, USDZ- og punktskymodeller lokalt i nettleseren: roter, lag tverrsnitt, mål avstander, sjekk volum og eksporter til STL, OBJ, PLY, GLB eller PNG.',
  'viewer3d.loading': 'Laster 3D-viser…',

  'viewer3d.drop.title': 'Åpne en 3D-modell',
  'viewer3d.drop.desc':
    'Roter, zoom, skjær tverrsnitt, mål overflateavstander, sjekk mål og volum, og eksporter som STL, OBJ, PLY, GLB eller PNG.',
  'viewer3d.drop.selectBtn': 'Velg 3D-fil',
  'viewer3d.drop.tryExample': 'Prøv en eksempelmodell',
  'viewer3d.drop.loadingExample': 'Laster eksempel…',
  'viewer3d.drop.exampleError': 'Kunne ikke laste eksempelmodellen. Prøv igjen.',
  'viewer3d.drop.hint':
    'eller slipp filer her. For OBJ- og glTF-modeller med egne material-, buffer- eller teksturfiler, velg eller slipp alle filene sammen.',
  'viewer3d.drop.localHint': 'Filene dine leses lokalt i denne nettleseren og lastes aldri opp.',
  'viewer3d.drop.allFormats': 'Alle støttede formater →',

  'viewer3d.quick.badge': 'Rask modus',
  'viewer3d.quick.bannerText':
    'Slipp en CAD- eller mesh-fil nedenfor for å vise den med én gang. Bytt til Standard for formatnoter, eller Læring for tips om B-Rep og snittvisning.',
  'viewer3d.quick.switchStandard': 'Bytt til Standard',
  'viewer3d.quick.switchTeaching': 'Prøv Læringsmodus',

  'viewer3d.teaching.cadTitle': 'CAD B-Rep-solider kontra polygonmesh',
  'viewer3d.teaching.cadBody':
    'STEP, IGES og BREP lagrer eksakte matematiske kurver og flater (B-Rep), som Open CASCADE deler opp i trekanter lokalt i en Web Worker. STL, OBJ og glTF lagrer allerede mesh — juster Mesh quality (Draft / Normal / Fine) på CAD-filer for å balansere glatthet mot ytelse.',
  'viewer3d.teaching.sectionTitle': 'Snittplan, ortografisk visning og måling',
  'viewer3d.teaching.sectionBody':
    'Skjær langs X, Y eller Z for å inspisere hulrom og veggtykkelse (innsiden av snittet vises i oransje). Slå på Ortografisk projeksjon for å sammenligne mål uten perspektivforvrengning, og bruk Measure for å klikke to overflatepunkter.',
  'viewer3d.teaching.openGuide': 'Les format- og kontrollguide →',

  'viewer3d.guide.title': 'Format- og kontrollguide for 3D',
  'viewer3d.guide.lead':
    'Alle CAD-, 3D-print-, scene- og punktskyformater som leses lokalt i nettleseren, pluss kamerakontroller, snittvisning, måling og eksport.',
  'viewer3d.guide.formatsTitle': 'Støttede 3D-formater',
  'viewer3d.guide.controlsTitle': 'Kamera- og visningskontroller',
  'viewer3d.guide.toolsTitle': 'Snittvisning, måling og eksport',
  'viewer3d.guide.privacyTitle': 'Lokal Open CASCADE og personvern',
  'viewer3d.guide.privacyBody':
    'CAD-filer (STEP, IGES, BREP) leses og tesselleres lokalt i en Web Worker med selvhostet Open CASCADE (occt-import-js, LGPL-2.1). Tilhørende materialer, buffere og teksturer matches kun mot filene du selv åpner — ingenting lastes opp eller hentes over nett.',
  'viewer3d.guide.backToWorkbench': 'Tilbake til arbeidsbenk →',

  // PCB viewer namespace
  'pcb.pageTitle': 'PCB-viser · yotasage',
  'pcb.title': 'PCB-viser',
  'pcb.workbench': 'Arbeidsbenk',
  'pcb.guide': 'Formater og guide',
  'pcb.lead':
    'Inspiser Gerber- og Excellon-produksjonsfiler eller native KiCad-, Altium-, PADS- og EAGLE-kort lag for lag eller i realistisk loddemaskevisning, uthev nett og komponenter, mål pader og eksporter PNG, SVG, 1:1 PDF, DXF, BOM/PnP eller KiCad.',
  'pcb.loading': 'Laster PCB-viser…',

  'pcb.drop.title': 'Åpne Gerber-filer eller et EDA-kretskort',
  'pcb.drop.desc':
    'Velg Gerber- og borefiler, en prosjektmappe, et ZIP-arkiv eller et KiCad-, Altium-, PADS- eller EAGLE-kort. Se hvert lag eller realistisk kort fra topp eller bunn, uthev nett og deler, mål og eksporter.',
  'pcb.drop.selectFiles': 'Velg filer',
  'pcb.drop.selectFolder': 'Velg mappe',
  'pcb.drop.tryExample': 'Prøv et eksempelkort',
  'pcb.drop.loadingExample': 'Laster eksempel…',
  'pcb.drop.exampleError': 'Kunne ikke laste eksempelkortet. Prøv igjen.',
  'pcb.drop.hint':
    'eller slipp filer, ZIP-arkiver eller en hel prosjektmappe her. Andre prosjektfiler kan følge med — fillisten viser hvordan hver fil ble klassifisert.',
  'pcb.drop.localHint': 'Filene dine leses lokalt i denne nettleseren og lastes aldri opp.',
  'pcb.drop.allFormats': 'Alle støttede formater →',

  'pcb.quick.badge': 'Rask modus',
  'pcb.quick.bannerText':
    'Slipp Gerber-/borefiler, en ZIP eller et kretskort nedenfor for å åpne med én gang. Bytt til Standard for detaljer, eller Læring for Gerber vs. EDA-tips.',
  'pcb.quick.switchStandard': 'Bytt til Standard',
  'pcb.quick.switchTeaching': 'Prøv Læringsmodus',

  'pcb.teaching.formatsTitle': 'Gerber / Excellon kontra native EDA-kort',
  'pcb.teaching.formatsBody':
    'Gerber (RS-274X / X2) og Excellon-borefiler er produksjonsfiler som beskriver hvert kobber-, loddemaske-, silketrykk- og borelag hver for seg. Native designfiler (KiCad, Altium, PADS, EAGLE) inneholder også komponentfotavtrykk, nettliste, BOM/plassering og kan konverteres til KiCad.',
  'pcb.teaching.viewsTitle': 'Lagvisning kontra realistisk kortvisning',
  'pcb.teaching.viewsBody':
    'Bruk Lagvisning for å sjekke kobberfyll, klaringer og borehull i tydelige lagfarger. Bytt til Realistisk visning for å kontrollere loddemaskeåpninger, lesbarhet på silketrykk og overflatebehandling (ENIG / HASL) fra både topp og bunn.',
  'pcb.teaching.openGuide': 'Les format- og arbeidsflytguide →',

  'pcb.guide.title': 'Støttede formater og arbeidsflyt',
  'pcb.guide.lead':
    'Alle 9 produksjons- og EDA-formater som støttes lokalt, pluss realistisk kontra lagvisning, inspeksjon, måling og eksportmuligheter.',
  'pcb.guide.formatsTitle': 'Støttede PCB- og produksjonsformater',
  'pcb.guide.viewsTitle': 'Lagvisning, realistisk visning og navigasjon',
  'pcb.guide.inspectTitle': 'Inspiser, uthev, mål og eksporter',
  'pcb.guide.privacyTitle': '100 % lokal gjengivelse i nettleseren',
  'pcb.guide.privacyBody':
    'Alle Gerber-, Excellon-, KiCad-, Altium-, PADS-, EAGLE- og ZIP-arkiver leses og tegnes direkte i Canvas 2D på enheten din. Kretskortdesign og monteringsfiler forlater aldri nettleseren.',
  'pcb.guide.backToWorkbench': 'Tilbake til arbeidsbenk →',
};

export const TRANSLATIONS: Record<Locale, Record<TranslationKey, string>> = {
  en,
  nb,
};
