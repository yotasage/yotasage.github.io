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
};

export const TRANSLATIONS: Record<Locale, Record<TranslationKey, string>> = {
  en,
  nb,
};
