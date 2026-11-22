export const en = {
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

export const nb: Record<keyof typeof en, string> = {
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
