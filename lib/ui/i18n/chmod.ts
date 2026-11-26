export const en = {
  'chmod.pageTitle': 'Chmod calculator · yotasage',
  'chmod.metaDescription':
    'Calculate Unix and Linux file permissions with interactive Owner, Group, and Others checkboxes, decode octal or symbolic codes, copy ready-to-run chmod commands, and explore explained presets.',
  'chmod.title': 'Chmod calculator',
  'chmod.lead':
    'Calculate Unix file permissions by toggling Owner, Group, and Others rights, decoding an octal or symbolic code, or choosing an explained preset.',
  'chmod.tab.calculator': 'Calculator',
  'chmod.tab.guide': 'Guide & reference',

  // Quick mode banner
  'chmod.quick.badge': 'Quick mode',
  'chmod.quick.bannerText': 'Showing the streamlined calculator. Switch modes for special bits or teaching callouts.',
  'chmod.quick.switchStandard': 'Standard',
  'chmod.quick.switchTeaching': 'Teaching',

  // Code decoder input
  'chmod.decode.title': 'Decode permission code',
  'chmod.decode.label': 'Octal, symbolic, or chmod command',
  'chmod.decode.placeholder': '755, 0644, 4755, rwxr-xr-x, or chmod 600 id_ed25519',
  'chmod.decode.apply': 'Apply',
  'chmod.decode.reset': 'Reset (755)',
  'chmod.decode.hint':
    'Type a 3- or 4-digit octal code (digits 0–7), a 9/10-character symbolic string like rwxr-xr-x, or paste a full chmod command to inspect its checkboxes.',
  'chmod.decode.applied': 'Showing permissions for {octal} ({symbolic})',
  'chmod.decode.error.empty': 'Enter an octal code (such as 755 or 0644) or a symbolic string (such as rwxr-xr-x).',
  'chmod.decode.error.invalid_octal_digit':
    'Octal permissions only use digits 0–7 (found "{detail}"). Each digit is the sum of Read (4), Write (2), and Execute (1).',
  'chmod.decode.error.invalid_length':
    'Expected 3 digits (e.g. 755) or 4 digits with special bits (e.g. 4755).',
  'chmod.decode.error.invalid_symbolic':
    'Invalid symbolic permission string. Use 9 characters like rwxr-xr-x (or 10 with a leading file type like drwxr-xr-x).',
  'chmod.decode.error.invalid_format':
    'Unrecognized permission code. Try a 3- or 4-digit octal number (000–7777), a symbolic string (rwxr-xr-x), or a chmod command.',

  // Matrix
  'chmod.matrix.title': 'Permission checkboxes',
  'chmod.matrix.ariaLabel': 'Unix file permissions matrix',
  'chmod.matrix.entity': 'Entity',
  'chmod.matrix.read': 'Read',
  'chmod.matrix.write': 'Write',
  'chmod.matrix.execute': 'Execute',
  'chmod.matrix.value': 'Octal',
  'chmod.matrix.role.owner': 'Owner',
  'chmod.matrix.role.ownerSub': 'u · file creator',
  'chmod.matrix.role.group': 'Group',
  'chmod.matrix.role.groupSub': 'g · assigned group',
  'chmod.matrix.role.others': 'Others',
  'chmod.matrix.role.othersSub': 'o · everyone else',
  'chmod.matrix.toggleRowAll': 'Toggle all {role} rights',
  'chmod.matrix.clearAll': 'Clear all (000)',
  'chmod.matrix.specialToggle': 'Special bits (SUID / SGID / Sticky)',
  'chmod.matrix.specialActive': 'Active: {digit}',
  'chmod.matrix.special.setuid': 'Setuid (4)',
  'chmod.matrix.special.setuidDesc': 'Runs executable with the file owner’s privileges (s / S).',
  'chmod.matrix.special.setgid': 'Setgid (2)',
  'chmod.matrix.special.setgidDesc': 'Runs as group, or makes new files in a directory inherit its group (s / S).',
  'chmod.matrix.special.sticky': 'Sticky bit (1)',
  'chmod.matrix.special.stickyDesc': 'In a shared directory, only the file owner or root can delete or rename files (t / T).',

  // Summary & human-readable breakdown
  'chmod.summary.title': 'Final command & notation',
  'chmod.summary.octal': 'Octal',
  'chmod.summary.symbolic': 'Symbolic',
  'chmod.summary.lsPreview': 'ls -l view',
  'chmod.summary.binary': 'Binary bits',
  'chmod.summary.command': 'Final chmod command',
  'chmod.summary.targetLabel': 'Target file or directory',
  'chmod.summary.targetPlaceholder': 'filename',
  'chmod.summary.targetKindLabel': 'Target type',
  'chmod.summary.kindFile': 'File (-)',
  'chmod.summary.kindDirectory': 'Directory (d)',
  'chmod.summary.notationLabel': 'Command notation',
  'chmod.summary.notationOctal': 'Octal',
  'chmod.summary.notationSymbolic': 'Symbolic',
  'chmod.summary.flagRecursive': 'Recursive (-R)',
  'chmod.summary.flagVerbose': 'Verbose (-v)',
  'chmod.summary.copy': 'Copy',
  'chmod.summary.copied': 'Copied',
  'chmod.summary.copyOctalAria': 'Copy octal value',
  'chmod.summary.copySymbolicAria': 'Copy symbolic notation',
  'chmod.summary.copyCommandAria': 'Copy chmod command',
  'chmod.summary.breakdownTitle': 'Plain-English summary',
  'chmod.summary.none': 'no access',
  'chmod.summary.right.read': 'read',
  'chmod.summary.right.write': 'write',
  'chmod.summary.right.executeFile': 'execute',
  'chmod.summary.right.executeDir': 'enter / traverse',
  'chmod.summary.matchedPreset': 'Matches preset {octal}: {title}',

  // Security warnings
  'chmod.warn.world_writable_all':
    'Security caution (777): Everyone on the system can read, modify, and execute this path. Avoid on servers or production systems.',
  'chmod.warn.world_writable':
    'Caution: "Others" has write permission without the sticky bit. Any local user can overwrite or delete this file.',
  'chmod.warn.no_permissions':
    'All permission bits are off (000). Nobody except root can read, write, or execute this path.',
  'chmod.warn.owner_locked_out':
    'The file owner has no permissions while group or others still have access. Double-check that this is intentional.',
  'chmod.warn.setuid_active':
    'Setuid (4000) is enabled. Executables with setuid run with the file owner’s user ID — use with care.',
  'chmod.warn.setgid_active':
    'Setgid (2000) is enabled. On directories, newly created files inherit the directory’s group.',

  // Presets
  'chmod.presets.title': 'Common presets with explanations',
  'chmod.presets.subtitle': 'Select any preset to load its checkboxes and update the command immediately.',
  'chmod.presets.filterAria': 'Filter presets by category',
  'chmod.presets.filter.all': 'All',
  'chmod.presets.filter.files': 'Files',
  'chmod.presets.filter.directories': 'Directories',
  'chmod.presets.filter.private': 'Private & keys',
  'chmod.presets.filter.special': 'Special & open',
  'chmod.presets.safety.standard': 'Standard',
  'chmod.presets.safety.private': 'Private',
  'chmod.presets.safety.shared': 'Team / shared',
  'chmod.presets.safety.special': 'Special bit',
  'chmod.presets.safety.caution': 'Caution',
  'chmod.presets.active': 'Active',

  'chmod.preset.755.title': 'Executables & public directories',
  'chmod.preset.755.desc':
    'Owner has full control (rwx); group and others can read and execute or enter directories. Standard for CLI scripts, binaries, and web server folders.',
  'chmod.preset.644.title': 'Standard files & web assets',
  'chmod.preset.644.desc':
    'Owner can read and edit (rw-); group and others can read only. The default choice for regular documents, source files, HTML, CSS, and images.',
  'chmod.preset.600.title': 'Private files & SSH keys',
  'chmod.preset.600.desc':
    'Only the owner can read and write; group and others have zero access. Required by OpenSSH for private keys (~/.ssh/id_ed25519) and ideal for credentials.',
  'chmod.preset.700.title': 'Private directories & personal scripts',
  'chmod.preset.700.desc':
    'Full access for the owner only; completely hidden from other users. Standard for ~/.ssh, personal home directories, and private utility scripts.',
  'chmod.preset.640.title': 'Group-readable secrets & configs',
  'chmod.preset.640.desc':
    'Owner can edit, assigned service group can read (e.g. www-data or nginx), and everyone else is blocked. Common for app configs and database credentials.',
  'chmod.preset.750.title': 'Group-accessible directories & tools',
  'chmod.preset.750.desc':
    'Owner has full control, group members can list/enter or run scripts, and other system users have no access.',
  'chmod.preset.664.title': 'Collaborative team files',
  'chmod.preset.664.desc':
    'Both owner and group members can read and edit; others can only read. Useful in shared project workspaces.',
  'chmod.preset.775.title': 'Shared group directories',
  'chmod.preset.775.desc':
    'Owner and group can create, edit, and run files inside the directory; others can read and traverse without modifying anything.',
  'chmod.preset.400.title': 'Read-only private keys & certificates',
  'chmod.preset.400.desc':
    'Only the owner can read; nobody can edit without changing permissions first. Protects cloud PEM keys and TLS private keys from accidental edits.',
  'chmod.preset.1777.title': 'Sticky shared directory (/tmp)',
  'chmod.preset.1777.desc':
    'Anyone can create files in the directory, but the sticky bit (1) ensures only each file’s owner or root can delete or rename their files.',
  'chmod.preset.2775.title': 'Setgid collaborative directory',
  'chmod.preset.2775.desc':
    'Owner and group have full access, and the setgid bit (2) forces all newly created files inside to inherit the directory’s group.',
  'chmod.preset.777.title': 'Full access for everyone',
  'chmod.preset.777.desc':
    'Grants read, write, and execute to every user on the machine. Useful only briefly for local debugging — never leave 777 on a server.',

  // Teaching callouts
  'chmod.teaching.octalTitle': 'How octal permission math works',
  'chmod.teaching.octalBody':
    'Each entity (Owner, Group, Others) is a 3-bit number: Read = 4, Write = 2, Execute = 1. Adding the active bits yields a digit from 0 to 7 — so rwx = 4+2+1 = 7, and r-x = 4+0+1 = 5.',
  'chmod.teaching.dirExecTitle': 'Why directories need execute (x) permission',
  'chmod.teaching.dirExecBody':
    'On a regular file, execute (x) lets you run it as a program. On a directory, execute means traversal — without x, you cannot cd into the folder or open files inside it, even if you have read (r).',

  // Guide tab
  'chmod.guide.title': 'Unix & Linux chmod guide',
  'chmod.guide.intro':
    'A quick reference for reading octal and symbolic modes, understanding file vs. directory behavior, and applying permissions safely from the terminal.',
  'chmod.guide.octalTitle': 'Octal digit reference (0–7)',
  'chmod.guide.octalColDigit': 'Octal',
  'chmod.guide.octalColBinary': 'Binary',
  'chmod.guide.octalColSymbolic': 'Symbolic',
  'chmod.guide.octalColMeaning': 'Meaning',
  'chmod.guide.digit.0': 'No permissions (---)',
  'chmod.guide.digit.1': 'Execute only (--x)',
  'chmod.guide.digit.2': 'Write only (-w-)',
  'chmod.guide.digit.3': 'Write and execute (-wx)',
  'chmod.guide.digit.4': 'Read only (r--)',
  'chmod.guide.digit.5': 'Read and execute (r-x)',
  'chmod.guide.digit.6': 'Read and write (rw-)',
  'chmod.guide.digit.7': 'Read, write, and execute (rwx)',

  'chmod.guide.fileVsDirTitle': 'Files vs. directories',
  'chmod.guide.fileVsDirColRight': 'Permission',
  'chmod.guide.fileVsDirColFile': 'On a regular file',
  'chmod.guide.fileVsDirColDir': 'On a directory',
  'chmod.guide.fvd.rFile': 'Open and read the file contents.',
  'chmod.guide.fvd.rDir': 'List filenames inside the directory (ls).',
  'chmod.guide.fvd.wFile': 'Modify or truncate the file contents.',
  'chmod.guide.fvd.wDir': 'Create, rename, or delete entries inside the directory (requires x too).',
  'chmod.guide.fvd.xFile': 'Run the file as a program or script.',
  'chmod.guide.fvd.xDir': 'Enter (cd) and access files or metadata inside the directory.',

  'chmod.guide.specialTitle': 'Special permission bits (4-digit octal)',
  'chmod.guide.specialBody':
    'A leading 4th octal digit adds Setuid (4), Setgid (2), or Sticky (1). In symbolic notation, lowercase s or t means the underlying execute bit is also set; uppercase S or T means the special bit is set without execute.',
  'chmod.guide.cliTitle': 'Common terminal commands',
  'chmod.guide.cliBody':
    'Use chmod -R carefully on directories: giving every regular file execute permission via chmod -R 755 is rarely desired. Instead, combine find or use uppercase X (chmod -R u=rwX,go=rX dir) to set execute only on directories and already-executable files.',
} as const;

export const nb: Record<keyof typeof en, string> = {
  'chmod.pageTitle': 'Chmod-kalkulator · yotasage',
  'chmod.metaDescription':
    'Beregn Unix- og Linux-filrettigheter med avkrysningsbokser for Eier, Gruppe og Andre, dekod oktale eller symbolske koder, kopier ferdige chmod-kommandoer og utforsk forhåndsvalg med forklaringer.',
  'chmod.title': 'Chmod-kalkulator',
  'chmod.lead':
    'Beregn Unix-filrettigheter ved å krysse av for Eier, Gruppe og Andre, skrive inn en oktal eller symbolsk kode, eller velge et forhåndsvalg med forklaring.',
  'chmod.tab.calculator': 'Kalkulator',
  'chmod.tab.guide': 'Veiledning og oppslag',

  // Quick mode banner
  'chmod.quick.badge': 'Hurtigmodus',
  'chmod.quick.bannerText': 'Viser forenklet kalkulator. Bytt modus for spesialbit eller forklarende tips.',
  'chmod.quick.switchStandard': 'Standard',
  'chmod.quick.switchTeaching': 'Undervisning',

  // Code decoder input
  'chmod.decode.title': 'Dekod rettighetskode',
  'chmod.decode.label': 'Oktal, symbolsk eller chmod-kommando',
  'chmod.decode.placeholder': '755, 0644, 4755, rwxr-xr-x eller chmod 600 id_ed25519',
  'chmod.decode.apply': 'Bruk',
  'chmod.decode.reset': 'Tilbakestill (755)',
  'chmod.decode.hint':
    'Skriv inn en 3- eller 4-sifret oktalkode (siffer 0–7), en symbolsk streng som rwxr-xr-x, eller lim inn en hel chmod-kommando for å se avkryssingene.',
  'chmod.decode.applied': 'Viser rettigheter for {octal} ({symbolic})',
  'chmod.decode.error.empty': 'Skriv inn en oktalkode (som 755 eller 0644) eller en symbolsk streng (som rwxr-xr-x).',
  'chmod.decode.error.invalid_octal_digit':
    'Oktale rettigheter bruker bare sifrene 0–7 (fant «{detail}»). Hvert siffer er summen av Lese (4), Skrive (2) og Kjøre (1).',
  'chmod.decode.error.invalid_length':
    'Forventet 3 sifre (f.eks. 755) eller 4 sifre med spesialbit (f.eks. 4755).',
  'chmod.decode.error.invalid_symbolic':
    'Ugyldig symbolsk rettighetsstreng. Bruk 9 tegn som rwxr-xr-x (eller 10 med filtype først, som drwxr-xr-x).',
  'chmod.decode.error.invalid_format':
    'Ukjent rettighetskode. Prøv et 3- eller 4-sifret oktaltall (000–7777), en symbolsk streng (rwxr-xr-x) eller en chmod-kommando.',

  // Matrix
  'chmod.matrix.title': 'Rettighetsvalg',
  'chmod.matrix.ariaLabel': 'Matrise for Unix-filrettigheter',
  'chmod.matrix.entity': 'Rolle',
  'chmod.matrix.read': 'Lese',
  'chmod.matrix.write': 'Skrive',
  'chmod.matrix.execute': 'Kjøre',
  'chmod.matrix.value': 'Oktal',
  'chmod.matrix.role.owner': 'Eier',
  'chmod.matrix.role.ownerSub': 'u · fileier',
  'chmod.matrix.role.group': 'Gruppe',
  'chmod.matrix.role.groupSub': 'g · tilordnet gruppe',
  'chmod.matrix.role.others': 'Andre',
  'chmod.matrix.role.othersSub': 'o · alle andre',
  'chmod.matrix.toggleRowAll': 'Veksle alle rettigheter for {role}',
  'chmod.matrix.clearAll': 'Fjern alle (000)',
  'chmod.matrix.specialToggle': 'Spesialbit (SUID / SGID / Sticky)',
  'chmod.matrix.specialActive': 'Aktiv: {digit}',
  'chmod.matrix.special.setuid': 'Setuid (4)',
  'chmod.matrix.special.setuidDesc': 'Kjører programmet med fileierens rettigheter (s / S).',
  'chmod.matrix.special.setgid': 'Setgid (2)',
  'chmod.matrix.special.setgidDesc': 'Kjører som gruppen, eller lar nye filer i en mappe arve mappens gruppe (s / S).',
  'chmod.matrix.special.sticky': 'Sticky-bit (1)',
  'chmod.matrix.special.stickyDesc': 'I en delt mappe kan bare fileieren eller root slette eller gi nytt navn til filer (t / T).',

  // Summary & human-readable breakdown
  'chmod.summary.title': 'Ferdig kommando og notasjon',
  'chmod.summary.octal': 'Oktal',
  'chmod.summary.symbolic': 'Symbolsk',
  'chmod.summary.lsPreview': 'ls -l-visning',
  'chmod.summary.binary': 'Binære bit',
  'chmod.summary.command': 'Ferdig chmod-kommando',
  'chmod.summary.targetLabel': 'Fil eller mappe',
  'chmod.summary.targetPlaceholder': 'filnavn',
  'chmod.summary.targetKindLabel': 'Måltype',
  'chmod.summary.kindFile': 'Fil (-)',
  'chmod.summary.kindDirectory': 'Mappe (d)',
  'chmod.summary.notationLabel': 'Kommandonotasjon',
  'chmod.summary.notationOctal': 'Oktal',
  'chmod.summary.notationSymbolic': 'Symbolsk',
  'chmod.summary.flagRecursive': 'Rekursiv (-R)',
  'chmod.summary.flagVerbose': 'Detaljert (-v)',
  'chmod.summary.copy': 'Kopier',
  'chmod.summary.copied': 'Kopiert',
  'chmod.summary.copyOctalAria': 'Kopier oktalverdi',
  'chmod.summary.copySymbolicAria': 'Kopier symbolsk notasjon',
  'chmod.summary.copyCommandAria': 'Kopier chmod-kommando',
  'chmod.summary.breakdownTitle': 'Oppsummering i klartekst',
  'chmod.summary.none': 'ingen tilgang',
  'chmod.summary.right.read': 'lese',
  'chmod.summary.right.write': 'skrive',
  'chmod.summary.right.executeFile': 'kjøre',
  'chmod.summary.right.executeDir': 'åpne / gå inn i',
  'chmod.summary.matchedPreset': 'Samsvarer med forhåndsvalg {octal}: {title}',

  // Security warnings
  'chmod.warn.world_writable_all':
    'Sikkerhetsadvarsel (777): Alle brukere på systemet kan lese, endre og kjøre denne banen. Unngå på servere og i produksjon.',
  'chmod.warn.world_writable':
    'Forsiktig: «Andre» har skriverettighet uten sticky-bit. Enhver lokal bruker kan overskrive eller slette filen.',
  'chmod.warn.no_permissions':
    'Alle rettighetsbit er avslått (000). Ingen andre enn root kan lese, skrive eller kjøre denne banen.',
  'chmod.warn.owner_locked_out':
    'Fileieren har ingen rettigheter mens gruppe eller andre fortsatt har tilgang. Kontroller at dette er meningen.',
  'chmod.warn.setuid_active':
    'Setuid (4000) er aktivert. Kjørbare filer med setuid kjører med fileierens bruker-ID — bruk med forsiktighet.',
  'chmod.warn.setgid_active':
    'Setgid (2000) er aktivert. På mapper arver nyopprettede filer mappens gruppe.',

  // Presets
  'chmod.presets.title': 'Vanlige forhåndsvalg med forklaringer',
  'chmod.presets.subtitle': 'Velg et forhåndsvalg for å oppdatere avkryssingsboksene og kommandoen umiddelbart.',
  'chmod.presets.filterAria': 'Filtrer forhåndsvalg etter kategori',
  'chmod.presets.filter.all': 'Alle',
  'chmod.presets.filter.files': 'Filer',
  'chmod.presets.filter.directories': 'Mapper',
  'chmod.presets.filter.private': 'Privat og nøkler',
  'chmod.presets.filter.special': 'Spesial og åpen',
  'chmod.presets.safety.standard': 'Standard',
  'chmod.presets.safety.private': 'Privat',
  'chmod.presets.safety.shared': 'Team / delt',
  'chmod.presets.safety.special': 'Spesialbit',
  'chmod.presets.safety.caution': 'Advarsel',
  'chmod.presets.active': 'Aktiv',

  'chmod.preset.755.title': 'Kjørbare filer og offentlige mapper',
  'chmod.preset.755.desc':
    'Eier har full kontroll (rwx); gruppe og andre kan lese og kjøre eller åpne mapper. Standard for skript, binærfiler og webservermapper.',
  'chmod.preset.644.title': 'Standardfiler og nettressurser',
  'chmod.preset.644.desc':
    'Eier kan lese og redigere (rw-); gruppe og andre kan bare lese. Vanlig standard for dokumenter, kildekode, HTML, CSS og bilder.',
  'chmod.preset.600.title': 'Private filer og SSH-nøkler',
  'chmod.preset.600.desc':
    'Bare eieren kan lese og skrive; gruppe og andre har ingen tilgang. Kreves av OpenSSH for private nøkler (~/.ssh/id_ed25519) og er ideelt for hemmeligheter.',
  'chmod.preset.700.title': 'Private mapper og personlige skript',
  'chmod.preset.700.desc':
    'Full tilgang kun for eieren; helt skjult for andre brukere. Standard for ~/.ssh, hjemmemapper og private verktøyskript.',
  'chmod.preset.640.title': 'Gruppelesbare konfigurasjonsfiler',
  'chmod.preset.640.desc':
    'Eier kan redigere, tilordnet tjenestegruppe kan lese (f.eks. www-data eller nginx), og alle andre blokkeres. Vanlig for konfigurasjon og passordfiler.',
  'chmod.preset.750.title': 'Gruppetilgjengelige mapper og verktøy',
  'chmod.preset.750.desc':
    'Eier har full kontroll, gruppemedlemmer kan liste/åpne eller kjøre skript, mens andre systembrukere ikke har tilgang.',
  'chmod.preset.664.title': 'Delte teamfiler',
  'chmod.preset.664.desc':
    'Både eier og gruppemedlemmer kan lese og redigere; andre kan bare lese. Nyttig i delte prosjektområder.',
  'chmod.preset.775.title': 'Delte gruppemapper',
  'chmod.preset.775.desc':
    'Eier og gruppe kan opprette, endre og kjøre filer i mappen; andre kan lese og navigere uten å endre noe.',
  'chmod.preset.400.title': 'Skrivebeskyttede nøkler og sertifikater',
  'chmod.preset.400.desc':
    'Bare eieren kan lese; ingen kan endre filen uten å endre rettigheter først. Beskytter PEM- og TLS-nøkler mot utilsiktede endringer.',
  'chmod.preset.1777.title': 'Delt mappe med sticky-bit (/tmp)',
  'chmod.preset.1777.desc':
    'Alle kan opprette filer i mappen, men sticky-bit (1) sørger for at bare eieren av hver fil eller root kan slette eller gi den nytt navn.',
  'chmod.preset.2775.title': 'Delt gruppemappe med setgid',
  'chmod.preset.2775.desc':
    'Eier og gruppe har full tilgang, og setgid-bit (2) sørger for at alle nye filer i mappen automatisk arver mappens gruppe.',
  'chmod.preset.777.title': 'Full tilgang for alle',
  'chmod.preset.777.desc':
    'Gir lese-, skrive- og kjørerettigheter til alle brukere på maskinen. Kun til midlertidig lokal feilsøking — la aldri 777 stå på en server.',

  // Teaching callouts
  'chmod.teaching.octalTitle': 'Slik fungerer oktal rettighetsmatte',
  'chmod.teaching.octalBody':
    'Hver rolle (Eier, Gruppe, Andre) er et 3-bit tall: Lese = 4, Skrive = 2, Kjøre = 1. Summen av de aktive bitene gir et siffer fra 0 til 7 — så rwx = 4+2+1 = 7 og r-x = 4+0+1 = 5.',
  'chmod.teaching.dirExecTitle': 'Hvorfor mapper trenger kjørerettighet (x)',
  'chmod.teaching.dirExecBody':
    'På en vanlig fil lar x deg kjøre den som et program. På en mappe betyr x gjennomgang — uten x kan du ikke bruke cd inn i mappen eller åpne filer i den, selv om du har leserettighet (r).',

  // Guide tab
  'chmod.guide.title': 'Veiledning for Unix- og Linux-chmod',
  'chmod.guide.intro':
    'Et raskt oppslagsverk for oktal og symbolsk notasjon, forskjellen mellom filer og mapper, og trygg bruk av chmod i terminalen.',
  'chmod.guide.octalTitle': 'Oktalsiffer-tabell (0–7)',
  'chmod.guide.octalColDigit': 'Oktal',
  'chmod.guide.octalColBinary': 'Binær',
  'chmod.guide.octalColSymbolic': 'Symbolsk',
  'chmod.guide.octalColMeaning': 'Betydning',
  'chmod.guide.digit.0': 'Ingen rettigheter (---)',
  'chmod.guide.digit.1': 'Kun kjøre (--x)',
  'chmod.guide.digit.2': 'Kun skrive (-w-)',
  'chmod.guide.digit.3': 'Skrive og kjøre (-wx)',
  'chmod.guide.digit.4': 'Kun lese (r--)',
  'chmod.guide.digit.5': 'Lese og kjøre (r-x)',
  'chmod.guide.digit.6': 'Lese og skrive (rw-)',
  'chmod.guide.digit.7': 'Lese, skrive og kjøre (rwx)',

  'chmod.guide.fileVsDirTitle': 'Filer mot mapper',
  'chmod.guide.fileVsDirColRight': 'Rettighet',
  'chmod.guide.fileVsDirColFile': 'På en vanlig fil',
  'chmod.guide.fileVsDirColDir': 'På en mappe',
  'chmod.guide.fvd.rFile': 'Åpne og lese innholdet i filen.',
  'chmod.guide.fvd.rDir': 'Liste filnavnene i mappen (ls).',
  'chmod.guide.fvd.wFile': 'Endre eller tømme innholdet i filen.',
  'chmod.guide.fvd.wDir': 'Opprette, gi nytt navn til eller slette oppføringer i mappen (krever også x).',
  'chmod.guide.fvd.xFile': 'Kjøre filen som et program eller skript.',
  'chmod.guide.fvd.xDir': 'Gå inn i (cd) og få tilgang til filer eller metadata i mappen.',

  'chmod.guide.specialTitle': 'Spesialbit (4-sifret oktal)',
  'chmod.guide.specialBody':
    'Et fjerde oktalsiffer først legger til Setuid (4), Setgid (2) eller Sticky (1). I symbolsk notasjon betyr små bokstaver s eller t at kjørebiten også er på; store bokstaver S eller T betyr at spesialbiten er på uten kjørerettighet.',
  'chmod.guide.cliTitle': 'Vanlige terminalkommandoer',
  'chmod.guide.cliBody':
    'Bruk chmod -R med omtanke på mapper: å gi alle vanlige filer kjørerettighet med chmod -R 755 er sjelden ønskelig. Bruk heller find eller stor X (chmod -R u=rwX,go=rX mappe) for kun å sette kjørebit på mapper og allerede kjørbare filer.',
};
