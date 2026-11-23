export const en = {
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
  'emsim.status.aria': 'Status and release notes for this tool',
  'emsim.status.badge': "What's new",
  'emsim.status.show': 'Details',
  'emsim.status.hide': 'Hide',
  'emsim.status.more': 'Assumptions & limitations',
} as const;

export const nb: Record<keyof typeof en, string> = {
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
  'emsim.status.aria': 'Status og nytt i dette verktøyet',
  'emsim.status.badge': 'Nytt',
  'emsim.status.show': 'Detaljer',
  'emsim.status.hide': 'Skjul',
  'emsim.status.more': 'Forutsetninger og begrensninger',
};
