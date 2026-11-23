export const en = {
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
  'base64.encoder.useCamera': 'Use camera',
  'base64.encoder.takePhoto': 'Take photo',
  'base64.encoder.dropHint': 'or drop an image here, paste one (Ctrl+V), or take a photo with your camera',
  'base64.encoder.chooseAnother': 'Choose another image',
  'base64.encoder.remove': 'Remove',
  'base64.encoder.imageSection': 'Image',
  'base64.encoder.outputSection': 'Output',
  'base64.encoder.copy': 'Copy',
  'base64.encoder.copied': 'Copied ✓',
  'base64.encoder.downloadTxt': 'Download .txt',

  'base64.camera.title': 'Camera capture',
  'base64.camera.starting': 'Starting camera…',
  'base64.camera.capture': 'Take photo',
  'base64.camera.capturing': 'Capturing…',
  'base64.camera.switch': 'Switch camera',
  'base64.camera.torchOn': 'Flash on',
  'base64.camera.torchOff': 'Flash off',
  'base64.camera.format': 'Capture format',
  'base64.camera.selectCamera': 'Select camera',
  'base64.camera.rear': 'Rear camera',
  'base64.camera.front': 'Front camera',
  'base64.camera.nativePicker': 'Device camera app',
  'base64.camera.localHint': 'Photos are captured and encoded locally in your browser — nothing is uploaded.',

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
} as const;

export const nb: Record<keyof typeof en, string> = {
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
  'base64.encoder.useCamera': 'Bruk kamera',
  'base64.encoder.takePhoto': 'Ta bilde',
  'base64.encoder.dropHint': 'eller slipp et bilde her, lim inn (Ctrl+V), eller ta et bilde med kameraet',
  'base64.encoder.chooseAnother': 'Velg et annet bilde',
  'base64.encoder.remove': 'Fjern',
  'base64.encoder.imageSection': 'Bilde',
  'base64.encoder.outputSection': 'Utdata',
  'base64.encoder.copy': 'Kopier',
  'base64.encoder.copied': 'Kopiert ✓',
  'base64.encoder.downloadTxt': 'Last ned .txt',

  'base64.camera.title': 'Kamerabilde',
  'base64.camera.starting': 'Starter kamera…',
  'base64.camera.capture': 'Ta bilde',
  'base64.camera.capturing': 'Lagrer bilde…',
  'base64.camera.switch': 'Bytt kamera',
  'base64.camera.torchOn': 'Lys på',
  'base64.camera.torchOff': 'Lys av',
  'base64.camera.format': 'Bildeformat',
  'base64.camera.selectCamera': 'Velg kamera',
  'base64.camera.rear': 'Bakre kamera',
  'base64.camera.front': 'Frontkamera',
  'base64.camera.nativePicker': 'Enhetens kameraapp',
  'base64.camera.localHint': 'Bilder tas og kodes lokalt i nettleseren din — ingenting lastes opp.',

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
};
