export const en = {
  // Page metadata & Home card
  'python.pageTitle': 'Python Playground · yotasage',
  'python.metaDescription':
    'Run Python 3.14 locally in your browser with Pyodide (NumPy, SciPy, pandas, SymPy, matplotlib, Pillow), Monaco Editor, interactive Console & REPL, and network access off by default.',
  'python.ogAlt':
    'Python Playground running CPython 3.14 locally in the browser with Monaco Editor, xterm.js console and REPL, and network access off by default',
  'python.title': 'Python Playground',
  'python.cardTitle': 'Python Playground',
  'python.cardCategory': 'Code & Computing',
  'python.cardDesc':
    'Run Python 3.14 locally in your browser (Pyodide with NumPy, SciPy, pandas, SymPy, matplotlib, Pillow) with Monaco Editor, interactive Console + REPL, Soft/Force Stop, and network access blocked by default.',

  // Toolbar & actions
  'python.run': 'Run',
  'python.runTitle': 'Run {file} (Ctrl+Enter / Cmd+Enter)',
  'python.toggleFilesShow': 'Files',
  'python.toggleFilesHide': 'Hide files',
  'python.stop': 'Stop',
  'python.stopTitle': 'Interrupt running Python script (Ctrl+C in terminal)',
  'python.forceStop': 'Force stop',
  'python.forceStopTitle': 'Immediately terminate the Python worker and restart cleanly',
  'python.restart': 'Restart',
  'python.restartTitle': 'Restart the Python worker cleanly',
  'python.networkBtn': 'Network',
  'python.networkOffShort': 'Network: Off',
  'python.networkPkgShort': 'Network: PyPI',
  'python.networkHostsShort': 'Network: {count} host(s)',
  'python.networkAllShort': 'Network: ALL',
  'python.clearConsole': 'Clear',
  'python.copyConsole': 'Copy',
  'python.copiedConsole': 'Copied',
  'python.scrollBottom': 'Bottom',
  'python.cancel': 'Cancel',
  'python.close': 'Close',

  // Tabs & panes
  'python.tabEditor': 'Editor',
  'python.tabConsole': 'Console',
  'python.tabRepl': 'REPL',
  'python.tabFiles': 'Files',
  'python.tabPlots': 'Plots',
  'python.paneNavAria': 'Switch between editor and output panes',
  'python.outputNavAria': 'Switch between console, REPL, and plots',
  'python.editorTabsAria': 'Open workspace files',
  'python.editorFile': 'main.py',
  'python.editorNoFile': 'Select or create a file in the Files panel to start editing.',
  'python.editorCloseTab': 'Close {file}',
  'python.editorTabLimitNotice': 'At most 15 tabs can be open at once. Close an unsaved tab first.',
  'python.binaryFileNotice':
    'Binary or large file ({size}). No inline preview is available for this format; download it to inspect locally.',
  'python.loadingEditor': 'Loading Monaco Editor…',
  'python.loadingTerminal': 'Loading terminal…',
  'python.editorLoadFailed': 'Could not load Monaco Editor: {reason}',
  'python.terminalLoadFailed': 'Could not load terminal: {reason}',

  // Plots gallery & hardened inline viewers
  'python.viewerModeAria': 'Toggle file preview and source code',
  'python.viewerPreview': 'Preview',
  'python.viewerCode': 'Code',
  'python.viewerFit': 'Fit',
  'python.viewerZoomIn': 'Zoom in',
  'python.viewerZoomOut': 'Zoom out',
  'python.viewerCheckerboard': 'Grid',
  'python.viewerLoading': 'Loading preview…',
  'python.viewerReadFailed': 'Could not read this file from the workspace.',
  'python.plotsEmptyTitle': 'No plots yet',
  'python.plotsEmptyDesc':
    'Figures from plt.show() and PIL.Image.show() appear directly here without saving to disk.',
  'python.plotsCopyPng': 'Copy PNG',
  'python.plotsCopyUnsupported':
    'Image clipboard copy is unavailable in this browser; use Download PNG instead.',
  'python.plotsDownloadPng': 'PNG',
  'python.plotsExportSvg': 'Export SVG',
  'python.plotsExportPdf': 'Export PDF',
  'python.plotsExportEvicted':
    'Vector export is unavailable because this older figure was evicted from memory (PNG copy remains available).',
  'python.plotsClearAll': 'Clear all',
  'python.plotsHistoryAria': 'Plot history thumbnails',
  'python.plotsDeleteItem': 'Delete plot #{index}',
  'python.pdfPrev': 'Prev',
  'python.pdfNext': 'Next',
  'python.pdfPageOf': 'Page {page} / {total}',
  'python.pdfLoading': 'Rendering PDF…',
  'python.pdfLoadFailed': 'Could not render PDF: {reason}',
  'python.pdfOpenTools': 'Open PDF tools',
  'python.tableEmpty': 'This table file is empty.',
  'python.tableStats': '{rows} rows · {cols} columns',
  'python.tableTruncated': 'Showing first {shown} of {total} rows',
  'python.jsonInvalid': 'Invalid JSON: {reason}',
  'python.htmlScriptsOffNotice': 'Sandboxed HTML preview (scripts disabled).',
  'python.htmlScriptsOnNotice':
    'Sandboxed HTML preview (scripts ON — isolated opaque origin, all network connections blocked).',
  'python.htmlAllowScriptsLabel': 'Allow scripts (sandboxed, offline)',

  // Runtime status & tiers
  'python.statusIdle': 'Idle',
  'python.statusBooting': 'Starting Python…',
  'python.statusReady': 'Ready',
  'python.statusRunning': 'Running',
  'python.statusStopping': 'Stopping…',
  'python.statusCrashed': 'Worker stopped',
  'python.statusBlocked': 'Blocked (check network)',
  'python.statusWaitingApproval': 'Awaiting confirmation',
  'python.tier1Badge': 'Tier 1 · Full',
  'python.tier1Desc':
    'Cross-origin isolated (SharedArrayBuffer). Blocking input() and fast Soft Stop (KeyboardInterrupt) are available.',
  'python.tier2Badge': 'Tier 2 · JSPI',
  'python.tier2Desc':
    'Not cross-origin isolated, using WebAssembly JSPI. Blocking input() works; Stop restarts the worker.',
  'python.tier3Badge': 'Tier 3 · Limited',
  'python.tier3Desc':
    'Not cross-origin isolated and no JSPI. Blocking input() is unavailable (use await async_input()); Stop restarts the worker.',
  'python.lanNote':
    'When network access is turned on, browser-allowed requests can also contact devices on your local network if permitted by the mode.',
  'python.crashBanner': 'The Python worker stopped unexpectedly ({reason}). Click Restart to start a fresh runtime.',
  'python.runFinishedOk': 'Finished in {ms} ms',
  'python.runFinishedInterrupted': 'Interrupted ({ms} ms)',
  'python.runFinishedForceStopped': 'Force-stopped; worker restarted',
  'python.runFinishedError': 'Exited with code {code} ({ms} ms)',

  // Program output framing & interactive input/REPL
  'python.programOutput': 'Program output',
  'python.programOutputHint': 'Everything inside this frame is produced by your Python program.',
  'python.programAsks': 'The program asks:',
  'python.stdinPlaceholder': 'Type response and press Enter…',
  'python.stdinSend': 'Send',
  'python.stdinEof': 'EOF',
  'python.replDisabledRunning': 'REPL is paused while a script is running.',
  'python.replReadyBanner': 'Python {version} interactive REPL (shares variables from your last Run).',
  'python.replPlaceholder': 'Enter Python expression or statement…',
  'python.replSubmit': 'Submit',
  'python.tracebackLabel': 'Traceback jump:',
  'python.tracebackLine': '{file}:{line}',

  // Files panel, CRUD, drag-drop, ZIP, storage & Web Locks
  'python.filesTitle': 'Workspace files',
  'python.filesEmpty': 'No files yet. Create a file, drop files here, or pick an example.',
  'python.filesNewFile': '+ File',
  'python.filesNewFolder': '+ Folder',
  'python.filesUpload': 'Upload',
  'python.filesImportZip': 'Import .zip',
  'python.filesExportZip': 'Export .zip',
  'python.filesNewFileLabel': 'New file path (e.g. helper.py or pkg/mod.py)',
  'python.filesNewFolderLabel': 'New folder path (e.g. data or pkg/sub)',
  'python.filesRenameLabel': 'Rename "{path}" to:',
  'python.filesMoveLabel': 'Move "{path}" to new path:',
  'python.filesDeleteConfirm': 'Delete "{path}"? Folders are deleted with all their contents.',
  'python.filesCreate': 'Create',
  'python.filesSave': 'Save',
  'python.filesDelete': 'Delete',
  'python.filesRename': 'Rename',
  'python.filesMove': 'Move',
  'python.filesDownload': 'Download',
  'python.filesNewBadge': 'New',
  'python.filesDropOverlay': 'Drop files or folders to add to /workspace',
  'python.filesDropHint': 'Drag & drop files or folders here',
  'python.filesStorageLabel': 'Workspace',
  'python.filesBrowserQuota': 'Browser storage: {used} / {quota}',
  'python.filesEntriesCount': '{count} items',
  'python.filesDismiss': 'Dismiss',
  'python.filesZipEmpty': 'No files to export.',
  'python.filesCapExceeded': 'Storage cap reached: {detail}',
  'python.filesQuotaExceeded': 'Browser storage quota exceeded: {detail}',
  'python.filesInvalidPath': 'Invalid path: {detail}',
  'python.filesInvalidZip': 'ZIP import rejected: {detail}',
  'python.filesReadOnlyLocked': 'Workspace is open in another tab; edits are paused.',

  // Second-tab Web Locks notice
  'python.lockBannerTitle': 'Workspace is open in another browser tab',
  'python.lockBannerDesc':
    'To prevent conflicting writes, autosave and file changes are paused in this tab while another tab owns the workspace. Close the other tab and click Check again to take over.',
  'python.lockBannerRetry': 'Check again',

  // Built-in examples
  'python.examplesPlaceholder': 'Load an example…',
  'python.examplesAria': 'Load a built-in Python example',
  'python.example.hello.title': 'Hello & input()',
  'python.example.hello.desc': 'Interactive prompt and basic loop.',
  'python.example.modules.title': 'Multi-file modules',
  'python.example.modules.desc': 'Imports functions from helpers.py.',
  'python.example.numpy_scipy.title': 'NumPy & SciPy signal',
  'python.example.numpy_scipy.desc': 'Linear algebra solve and Butterworth filter.',
  'python.example.matplotlib_plot.title': 'Matplotlib plot to PNG',
  'python.example.matplotlib_plot.desc': 'Renders a damped sine wave into sine_wave.png.',
  'python.example.pillow_image.title': 'Pillow gradient image',
  'python.example.pillow_image.desc': 'Generates gradient.png with Pillow.',
  'python.example.csv_data.title': 'CSV & pandas table',
  'python.example.csv_data.desc': 'Writes weather.csv and summarises it with pandas.',
  'python.example.asyncio_tasks.title': 'Asyncio concurrent tasks',
  'python.example.asyncio_tasks.desc': 'Runs concurrent coroutines with asyncio.gather.',

  // W1 — First-visit blocking dialog
  'python.w1Title': 'Before you start',
  'python.w1Body':
    'This tool runs Python code in your browser. Only run code you wrote or understand. Code written by someone else can read, change and delete every file you put in this tool, and any notes or files saved in Scratchpad on this site (including open Scratchpad tabs). While network access is off, which is the default, your browser blocks the code from sending anything to the internet. If you turn network access on, the code can send those files to any server you allow. This site never uploads your files itself.',
  'python.w1SecretNote': 'Never type passwords or other secrets into a program.',
  'python.w1Ack': 'I understand, open Python Playground',

  // W2 — Honest status note at top of page
  'python.w2Title': 'About this tool & current status',
  'python.w2Summary': 'Runs Python locally in your browser (Pyodide). Network access is off by default.',
  'python.w2WorksLabel': 'Works now (v1 complete):',
  'python.w2Works':
    'CPython 3.14.2 via self-hosted Pyodide (NumPy, SciPy, pandas, SymPy, matplotlib, Pillow); persistent IndexedDB workspace with file tree, multi-tab Monaco Editor with autosave, drag-drop upload, safe ZIP import/export, Web Locks, and examples; xterm.js Console & REPL; Soft/Force Stop and blocking input(); live Plots gallery (plt.show(), PIL.Image.show(), vector SVG/PDF export); hardened Image, SVG, PDF, CSV/TSV, JSON, and sandboxed HTML viewers; and network access blocked by default.',
  'python.w2VerifiedLabel': 'Verified:',
  'python.w2Verified':
    'Cross-browser engine, persistence, plots/viewers, security, and UI harnesses passing in Edge, Firefox, and WebKit (CSP enforcement, off-mode exfiltration battery, forged-message filtering, SVG/HTML viewer XSS checks, 100-plot Blob URL leak & 16-figure eviction cap checks, stop latency, reload/Force Stop persistence, and Web Locks).',
  'python.w2NotYetLabel': 'Planned next:',
  'python.w2NotYet':
    'Package manager UI and wheel uploads (Phases 5–6) and virtual display/GUI support (Phase 7+). Note: pyodide.code.run_js is disabled by the worker CSP.',
  'python.w2MobileLabel': 'Phones & touch:',
  'python.w2MobileNote':
    'Monaco Editor has limited touch support on phones (no native drag selection handles, unreliable double-tap word selection, and virtual keyboards lack Ctrl+Enter / Ctrl+C). Use the on-screen Run, Stop, Clear, and Copy buttons.',
  'python.w2Promise': 'The site never uploads your files. Code you run here can, if you allow network access.',

  // W3 — Active network banner under header
  'python.w3All': 'Network access is ON for all sites. Code you run can send your files anywhere.',
  'python.w3Pkg': 'Network access: package index only (pypi.org, files.pythonhosted.org).',
  'python.w3Hosts': 'Network access: {hosts} only.',
  'python.w3ReloadOff': 'Reload with network off',

  // W4 — Network confirmation (settings switch + on-load blocking dialog)
  'python.w4TitleSwitch': 'Turn on network access?',
  'python.w4TitleLoad': 'This link turned network access on.',
  'python.w4BodySwitch':
    'After the page reloads, code you run here can connect to {target}. It can send the files in this tool to those servers and download more code. Turn it on only for code you trust. It turns off again every time you open the tool without choosing it.',
  'python.w4BodyLoad':
    'This link turned network access on. Code you run here can connect to {target}. It can send the files in this tool to those servers and download more code. Turn it on only for code you trust. It turns off again every time you open the tool without choosing it.',
  'python.w4TargetPkg': 'PyPI (pypi.org, files.pythonhosted.org)',
  'python.w4TargetHosts': 'these sites: {hosts}',
  'python.w4TargetAll': 'any site',
  'python.w4AllCheckbox': 'I understand that code can send my files anywhere.',
  'python.w4ConfirmSwitch': 'Reload with network on',
  'python.w4ConfirmLoad': 'Continue with network on',
  'python.w4ReloadOff': 'Reload with network off',

  // W5 — File added notice (used when workspace files are added)
  'python.w5Notice':
    'Files you add (.py, .whl, .zip, .html) can run code when you press Run. Only add files you trust.',

  // W6 — Package install confirmation (used before installing from PyPI)
  'python.w6Body':
    'Install package {name} ({version}) from {host}? A package runs code when it is imported. Only install packages you trust.',
  'python.w6Install': 'Install',

  // W7 — Fail-closed dialog when CSP cannot be confirmed in Off mode
  'python.w7Title': 'Network block not confirmed',
  'python.w7Body':
    "The browser's network block could not be confirmed, so code you run now might be able to reach the internet.",
  'python.w7Reload': 'Reload to repair',
  'python.w7RunAnyway': 'Run anyway',

  // W8 — External link confirmation dialog
  'python.w8Title': 'Open external link from program output?',
  'python.w8Body': 'Links can carry data from your session. Only open links you trust.',
  'python.w8Open': 'Open link',

  // W9 — Storage & Clear all data
  'python.w9Title': 'Stored data',
  'python.w9Body':
    'Your files and package list stay in this browser until you delete them. On a shared computer, use Clear all data. A private window forgets everything when it is closed.',
  'python.clearAllBtn': 'Clear all data',
  'python.clearAllConfirmText':
    'Remove all Python Playground databases, settings, caches, and service worker registration, then reload?',
  'python.clearAllConfirmBtn': 'Yes, clear and reload',

  // Network settings dialog
  'python.netDialogTitle': 'Network & Data Settings',
  'python.netModeLegend': 'Network access for this page load',
  'python.netModeOffTitle': 'Off (default)',
  'python.netModeOffDesc':
    'The browser blocks cross-origin requests from your Python code. Bundled scientific packages still work.',
  'python.netModePkgTitle': 'Package index (PyPI)',
  'python.netModePkgDesc':
    'Allows connections to pypi.org and files.pythonhosted.org only so micropip can download packages.',
  'python.netModeHostsTitle': 'Selected hosts',
  'python.netModeHostsDesc':
    'Allows HTTPS connections to up to 5 plain DNS hostnames you type below (no wildcards, IP addresses, or ports).',
  'python.netModeAllTitle': 'Everything',
  'python.netModeAllDesc':
    'Removes network restrictions for this load. Only use with code you fully trust.',
  'python.netHostsLabel': 'Allowed HTTPS hostnames (one per line or comma-separated, max 5)',
  'python.netHostsPlaceholder': 'api.example.com\ndata.example.org',
  'python.netHostsEmpty': 'Enter at least one valid https:// DNS hostname.',
  'python.netHostsMax': 'At most 5 hostnames are allowed.',
  'python.netHostsInvalid': 'Invalid hostname "{host}": {reason}',
  'python.netApplyOff': 'Reload with network off',
  'python.netNoChange': 'Current mode',
} as const;

export const nb: Record<keyof typeof en, string> = {
  // Page metadata & Home card
  'python.pageTitle': 'Python-lekeplass · yotasage',
  'python.metaDescription':
    'Kjør Python 3.14 lokalt i nettleseren med Pyodide (NumPy, SciPy, pandas, SymPy, matplotlib, Pillow), Monaco Editor, interaktiv konsoll og REPL, og nettverkstilgang avslått som standard.',
  'python.ogAlt':
    'Python-lekeplass som kjører CPython 3.14 lokalt i nettleseren med Monaco Editor, xterm.js-konsoll og REPL, og nettverkstilgang avslått som standard',
  'python.title': 'Python-lekeplass',
  'python.cardTitle': 'Python-lekeplass',
  'python.cardCategory': 'Kode og beregning',
  'python.cardDesc':
    'Kjør Python 3.14 lokalt i nettleseren (Pyodide med NumPy, SciPy, pandas, SymPy, matplotlib, Pillow) med Monaco Editor, interaktiv konsoll + REPL, myk/tvungen stopp og nettverk blokkert som standard.',

  // Toolbar & actions
  'python.run': 'Kjør',
  'python.runTitle': 'Kjør {file} (Ctrl+Enter / Cmd+Enter)',
  'python.toggleFilesShow': 'Filer',
  'python.toggleFilesHide': 'Skjul filer',
  'python.stop': 'Stopp',
  'python.stopTitle': 'Avbryt kjørende Python-skript (Ctrl+C i terminalen)',
  'python.forceStop': 'Tving stopp',
  'python.forceStopTitle': 'Avslutt Python-arbeideren umiddelbart og start på nytt',
  'python.restart': 'Start på nytt',
  'python.restartTitle': 'Start Python-arbeideren på nytt',
  'python.networkBtn': 'Nettverk',
  'python.networkOffShort': 'Nettverk: Av',
  'python.networkPkgShort': 'Nettverk: PyPI',
  'python.networkHostsShort': 'Nettverk: {count} vert(er)',
  'python.networkAllShort': 'Nettverk: ALLE',
  'python.clearConsole': 'Tøm',
  'python.copyConsole': 'Kopier',
  'python.copiedConsole': 'Kopiert',
  'python.scrollBottom': 'Bunn',
  'python.cancel': 'Avbryt',
  'python.close': 'Lukk',

  // Tabs & panes
  'python.tabEditor': 'Editor',
  'python.tabConsole': 'Konsoll',
  'python.tabRepl': 'REPL',
  'python.tabFiles': 'Filer',
  'python.tabPlots': 'Plott',
  'python.paneNavAria': 'Bytt mellom editor og utdata',
  'python.outputNavAria': 'Bytt mellom konsoll, REPL og plott',
  'python.editorTabsAria': 'Åpne arbeidsområdefiler',
  'python.editorFile': 'main.py',
  'python.editorNoFile': 'Velg eller opprett en fil i Fil-panelet for å begynne å redigere.',
  'python.editorCloseTab': 'Lukk {file}',
  'python.editorTabLimitNotice': 'Maksimalt 15 faner kan være åpne samtidig. Lukk en ulagret fane først.',
  'python.binaryFileNotice':
    'Binær eller stor fil ({size}). Ingen innebygd forhåndsvisning for dette formatet; last ned filen for å åpne den lokalt.',
  'python.loadingEditor': 'Laster Monaco Editor…',
  'python.loadingTerminal': 'Laster terminal…',
  'python.editorLoadFailed': 'Kunne ikke laste Monaco Editor: {reason}',
  'python.terminalLoadFailed': 'Kunne ikke laste terminalen: {reason}',

  // Plots gallery & hardened inline viewers
  'python.viewerModeAria': 'Bytt mellom forhåndsvisning og kildekode',
  'python.viewerPreview': 'Visning',
  'python.viewerCode': 'Kode',
  'python.viewerFit': 'Tilpass',
  'python.viewerZoomIn': 'Zoom inn',
  'python.viewerZoomOut': 'Zoom ut',
  'python.viewerCheckerboard': 'Rutenett',
  'python.viewerLoading': 'Laster forhåndsvisning…',
  'python.viewerReadFailed': 'Kunne ikke lese filen fra arbeidsområdet.',
  'python.plotsEmptyTitle': 'Ingen plott ennå',
  'python.plotsEmptyDesc':
    'Figurer fra plt.show() og PIL.Image.show() vises direkte her uten å lagres på disk.',
  'python.plotsCopyPng': 'Kopier PNG',
  'python.plotsCopyUnsupported':
    'Kopiering av bilde til utklippstavle støttes ikke her; bruk PNG-nedlasting i stedet.',
  'python.plotsDownloadPng': 'PNG',
  'python.plotsExportSvg': 'Eksporter SVG',
  'python.plotsExportPdf': 'Eksporter PDF',
  'python.plotsExportEvicted':
    'Vektoreksport er ikke tilgjengelig fordi denne eldre figuren ble frigjort fra minnet (PNG-kopien finnes fortsatt).',
  'python.plotsClearAll': 'Tøm alle',
  'python.plotsHistoryAria': 'Miniatyrbilder av plott',
  'python.plotsDeleteItem': 'Slett plott #{index}',
  'python.pdfPrev': 'Forrige',
  'python.pdfNext': 'Neste',
  'python.pdfPageOf': 'Side {page} / {total}',
  'python.pdfLoading': 'Tegner PDF…',
  'python.pdfLoadFailed': 'Kunne ikke åpne PDF: {reason}',
  'python.pdfOpenTools': 'Åpne PDF-verktøy',
  'python.tableEmpty': 'Tabellfilen er tom.',
  'python.tableStats': '{rows} rader · {cols} kolonner',
  'python.tableTruncated': 'Viser de første {shown} av {total} rader',
  'python.jsonInvalid': 'Ugyldig JSON: {reason}',
  'python.htmlScriptsOffNotice': 'Sandkasse-HTML-visning (skript deaktivert).',
  'python.htmlScriptsOnNotice':
    'Sandkasse-HTML-visning (skript PÅ — isolert opphav, alle nettverkskall blokkert).',
  'python.htmlAllowScriptsLabel': 'Tillat skript (sandkasse, frakoblet)',

  // Runtime status & tiers
  'python.statusIdle': 'Inaktiv',
  'python.statusBooting': 'Starter Python…',
  'python.statusReady': 'Klar',
  'python.statusRunning': 'Kjører',
  'python.statusStopping': 'Stopper…',
  'python.statusCrashed': 'Arbeider stoppet',
  'python.statusBlocked': 'Blokkert (sjekk nettverk)',
  'python.statusWaitingApproval': 'Venter på bekreftelse',
  'python.tier1Badge': 'Nivå 1 · Full',
  'python.tier1Desc':
    'Cross-origin-isolert (SharedArrayBuffer). Blokkerende input() og rask myk stopp (KeyboardInterrupt) er tilgjengelig.',
  'python.tier2Badge': 'Nivå 2 · JSPI',
  'python.tier2Desc':
    'Ikke cross-origin-isolert, bruker WebAssembly JSPI. Blokkerende input() virker; Stopp starter arbeideren på nytt.',
  'python.tier3Badge': 'Nivå 3 · Begrenset',
  'python.tier3Desc':
    'Ikke cross-origin-isolert og uten JSPI. Blokkerende input() er ikke tilgjengelig (bruk await async_input()); Stopp starter arbeideren på nytt.',
  'python.lanNote':
    'Når nettverkstilgang er slått på, kan forespørsler som nettleseren tillater også kontakte enheter på lokalnettet ditt dersom modusen tillater det.',
  'python.crashBanner': 'Python-arbeideren stoppet uventet ({reason}). Klikk Start på nytt for å starte en ny økt.',
  'python.runFinishedOk': 'Ferdig på {ms} ms',
  'python.runFinishedInterrupted': 'Avbrutt ({ms} ms)',
  'python.runFinishedForceStopped': 'Tvangsstoppet; arbeider startet på nytt',
  'python.runFinishedError': 'Avsluttet med kode {code} ({ms} ms)',

  // Program output framing & interactive input/REPL
  'python.programOutput': 'Programutdata',
  'python.programOutputHint': 'Alt inne i denne rammen kommer fra Python-programmet ditt.',
  'python.programAsks': 'Programmet spør:',
  'python.stdinPlaceholder': 'Skriv svar og trykk Enter…',
  'python.stdinSend': 'Send',
  'python.stdinEof': 'EOF',
  'python.replDisabledRunning': 'REPL er satt på pause mens et skript kjører.',
  'python.replReadyBanner': 'Python {version} interaktiv REPL (deler variabler fra siste kjøring).',
  'python.replPlaceholder': 'Skriv Python-uttrykk eller -setning…',
  'python.replSubmit': 'Send',
  'python.tracebackLabel': 'Hopp til feil:',
  'python.tracebackLine': '{file}:{line}',

  // Files panel, CRUD, drag-drop, ZIP, storage & Web Locks
  'python.filesTitle': 'Arbeidsområdefiler',
  'python.filesEmpty': 'Ingen filer ennå. Opprett en fil, slipp filer her, eller velg et eksempel.',
  'python.filesNewFile': '+ Fil',
  'python.filesNewFolder': '+ Mappe',
  'python.filesUpload': 'Last opp',
  'python.filesImportZip': 'Importer .zip',
  'python.filesExportZip': 'Eksporter .zip',
  'python.filesNewFileLabel': 'Ny filsti (f.eks. helper.py eller pkg/mod.py)',
  'python.filesNewFolderLabel': 'Ny mappesti (f.eks. data eller pkg/sub)',
  'python.filesRenameLabel': 'Gi nytt navn til «{path}»:',
  'python.filesMoveLabel': 'Flytt «{path}» til ny sti:',
  'python.filesDeleteConfirm': 'Slette «{path}»? Mapper slettes med alt innhold.',
  'python.filesCreate': 'Opprett',
  'python.filesSave': 'Lagre',
  'python.filesDelete': 'Slett',
  'python.filesRename': 'Gi navn',
  'python.filesMove': 'Flytt',
  'python.filesDownload': 'Last ned',
  'python.filesNewBadge': 'Ny',
  'python.filesDropOverlay': 'Slipp filer eller mapper for å legge til i /workspace',
  'python.filesDropHint': 'Dra og slipp filer eller mapper hit',
  'python.filesStorageLabel': 'Arbeidsområde',
  'python.filesBrowserQuota': 'Nettleserlagring: {used} / {quota}',
  'python.filesEntriesCount': '{count} elementer',
  'python.filesDismiss': 'Lukk',
  'python.filesZipEmpty': 'Ingen filer å eksportere.',
  'python.filesCapExceeded': 'Lagringsgrense nådd: {detail}',
  'python.filesQuotaExceeded': 'Nettleserens lagringskvote er full: {detail}',
  'python.filesInvalidPath': 'Ugyldig filsti: {detail}',
  'python.filesInvalidZip': 'ZIP-import avvist: {detail}',
  'python.filesReadOnlyLocked': 'Arbeidsområdet er åpent i en annen fane; endringer er satt på pause.',

  // Second-tab Web Locks notice
  'python.lockBannerTitle': 'Arbeidsområdet er åpent i en annen nettleserfane',
  'python.lockBannerDesc':
    'For å unngå konflikter er autolagring og filendringer satt på pause i denne fanen mens en annen fane eier arbeidsområdet. Lukk den andre fanen og klikk Sjekk igjen for å ta over.',
  'python.lockBannerRetry': 'Sjekk igjen',

  // Built-in examples
  'python.examplesPlaceholder': 'Last inn et eksempel…',
  'python.examplesAria': 'Last inn et innebygd Python-eksempel',
  'python.example.hello.title': 'Hei og input()',
  'python.example.hello.desc': 'Interaktiv spørring og enkel løkke.',
  'python.example.modules.title': 'Flerfils-moduler',
  'python.example.modules.desc': 'Importerer funksjoner fra helpers.py.',
  'python.example.numpy_scipy.title': 'NumPy og SciPy-signal',
  'python.example.numpy_scipy.desc': 'Lineært ligningssystem og Butterworth-filter.',
  'python.example.matplotlib_plot.title': 'Matplotlib-plott til PNG',
  'python.example.matplotlib_plot.desc': 'Tegner en dempet sinusbølge til sine_wave.png.',
  'python.example.pillow_image.title': 'Pillow-gradientbilde',
  'python.example.pillow_image.desc': 'Lager gradient.png med Pillow.',
  'python.example.csv_data.title': 'CSV og pandas-tabell',
  'python.example.csv_data.desc': 'Skriver weather.csv og oppsummerer den med pandas.',
  'python.example.asyncio_tasks.title': 'Asyncio samtidige oppgaver',
  'python.example.asyncio_tasks.desc': 'Kjører samtidige korutiner med asyncio.gather.',

  // W1 — First-visit blocking dialog
  'python.w1Title': 'Før du begynner',
  'python.w1Body':
    'Dette verktøyet kjører Python-kode i nettleseren din. Kjør bare kode du har skrevet selv eller forstår. Kode skrevet av andre kan lese, endre og slette alle filer du legger i dette verktøyet, samt notater eller filer lagret i Scratchpad på dette nettstedet (inkludert åpne Scratchpad-faner). Mens nettverkstilgang er av, som er standard, blokkerer nettleseren koden fra å sende noe til internett. Hvis du slår på nettverkstilgang, kan koden sende disse filene til enhver server du tillater. Dette nettstedet laster aldri opp filene dine selv.',
  'python.w1SecretNote': 'Skriv aldri inn passord eller andre hemmeligheter i et program.',
  'python.w1Ack': 'Jeg forstår, åpne Python-lekeplass',

  // W2 — Honest status note at top of page
  'python.w2Title': 'Om dette verktøyet og status',
  'python.w2Summary': 'Kjører Python lokalt i nettleseren din (Pyodide). Nettverkstilgang er avslått som standard.',
  'python.w2WorksLabel': 'Fungerer nå (v1 ferdig):',
  'python.w2Works':
    'CPython 3.14.2 via egenhostet Pyodide (NumPy, SciPy, pandas, SymPy, matplotlib, Pillow); varig IndexedDB-arbeidsområde med filutforsker, flerfane-Monaco Editor med autolagring, dra-og-slipp, trygg ZIP-import/eksport, Web Locks og eksempler; xterm.js-konsoll og REPL; myk/tvungen stopp og blokkerende input(); plottgalleri (plt.show(), PIL.Image.show(), SVG/PDF-vektoreksport); sikre bilde-, SVG-, PDF-, CSV/TSV-, JSON- og sandkasse-HTML-visere; og nettverk blokkert som standard.',
  'python.w2VerifiedLabel': 'Verifisert:',
  'python.w2Verified':
    'Motor-, lagrings-, plott/viser-, sikkerhets- og UI-tester på tvers av Edge, Firefox og WebKit (CSP-håndheving, utgående blokkering i Av-modus, filtrering av forfalskede meldinger, XSS-sjekk av SVG/HTML-visere, 100-plotts Blob URL- og 16-figurers minnegrense, stopp-latens, filoverlevelse og Web Locks).',
  'python.w2NotYetLabel': 'Planlagt videre:',
  'python.w2NotYet':
    'Pakkebehandler-UI og wheel-opplasting (fase 5–6) og virtuell skjerm/GUI (fase 7+). Merk: pyodide.code.run_js er deaktivert av arbeiderens CSP.',
  'python.w2MobileLabel': 'Mobil og berøring:',
  'python.w2MobileNote':
    'Monaco Editor har begrenset berøringsstøtte på mobil (ingen vanlige markeringshåndtak, upålitelig dobbelttrykk for ordvalg, og skjermtastatur mangler Ctrl+Enter / Ctrl+C). Bruk knappene på skjermen for Kjør, Stopp, Tøm og Kopier.',
  'python.w2Promise': 'Nettstedet laster aldri opp filene dine. Kode du kjører her kan gjøre det hvis du tillater nettverkstilgang.',

  // W3 — Active network banner under header
  'python.w3All': 'Nettverkstilgang er PÅ for alle nettsteder. Kode du kjører kan sende filene dine hvor som helst.',
  'python.w3Pkg': 'Nettverkstilgang: kun pakkeindeks (pypi.org, files.pythonhosted.org).',
  'python.w3Hosts': 'Nettverkstilgang: kun {hosts}.',
  'python.w3ReloadOff': 'Last inn på nytt uten nettverk',

  // W4 — Network confirmation (settings switch + on-load blocking dialog)
  'python.w4TitleSwitch': 'Slå på nettverkstilgang?',
  'python.w4TitleLoad': 'Denne lenken slo på nettverkstilgang.',
  'python.w4BodySwitch':
    'Etter at siden lastes inn på nytt, kan kode du kjører her koble til {target}. Den kan sende filene i dette verktøyet til disse serverne og laste ned mer kode. Slå det bare på for kode du stoler på. Det slås av igjen hver gang du åpner verktøyet uten å velge det.',
  'python.w4BodyLoad':
    'Denne lenken slo på nettverkstilgang. Kode du kjører her kan koble til {target}. Den kan sende filene i dette verktøyet til disse serverne og laste ned mer kode. Slå det bare på for kode du stoler på. Det slås av igjen hver gang du åpner verktøyet uten å velge det.',
  'python.w4TargetPkg': 'PyPI (pypi.org, files.pythonhosted.org)',
  'python.w4TargetHosts': 'disse nettstedene: {hosts}',
  'python.w4TargetAll': 'hvilket som helst nettsted',
  'python.w4AllCheckbox': 'Jeg forstår at kode kan sende filene mine hvor som helst.',
  'python.w4ConfirmSwitch': 'Last inn på nytt med nettverk på',
  'python.w4ConfirmLoad': 'Fortsett med nettverk på',
  'python.w4ReloadOff': 'Last inn på nytt uten nettverk',

  // W5 — File added notice
  'python.w5Notice':
    'Filer du legger til (.py, .whl, .zip, .html) kan kjøre kode når du trykker Kjør. Legg bare til filer du stoler på.',

  // W6 — Package install confirmation
  'python.w6Body':
    'Installere pakken {name} ({version}) fra {host}? En pakke kjører kode når den importeres. Installer bare pakker du stoler på.',
  'python.w6Install': 'Installer',

  // W7 — Fail-closed dialog
  'python.w7Title': 'Nettverksblokkering ikke bekreftet',
  'python.w7Body':
    'Nettleserens nettverksblokkering kunne ikke bekreftes, så kode du kjører nå kan muligens nå internett.',
  'python.w7Reload': 'Last inn på nytt for å reparere',
  'python.w7RunAnyway': 'Kjør likevel',

  // W8 — External link confirmation dialog
  'python.w8Title': 'Åpne ekstern lenke fra programutdata?',
  'python.w8Body': 'Lenker kan inneholde data fra økten din. Åpne bare lenker du stoler på.',
  'python.w8Open': 'Åpne lenke',

  // W9 — Storage & Clear all data
  'python.w9Title': 'Lagrede data',
  'python.w9Body':
    'Filene og pakkelisten din blir liggende i denne nettleseren til du sletter dem. På en delt datamaskin bør du bruke Slett alle data. Et privat vindu glemmer alt når det lukkes.',
  'python.clearAllBtn': 'Slett alle data',
  'python.clearAllConfirmText':
    'Fjerne alle databaser, innstillinger, buffere og service worker-registreringen for Python-lekeplassen, og laste inn på nytt?',
  'python.clearAllConfirmBtn': 'Ja, slett og last på nytt',

  // Network settings dialog
  'python.netDialogTitle': 'Nettverk og lagring',
  'python.netModeLegend': 'Nettverkstilgang for denne sideinnlastingen',
  'python.netModeOffTitle': 'Av (standard)',
  'python.netModeOffDesc':
    'Nettleseren blokkerer forespørsler til andre nettsteder fra Python-koden. Innebygde vitenskapelige pakker fungerer likevel.',
  'python.netModePkgTitle': 'Pakkeindeks (PyPI)',
  'python.netModePkgDesc':
    'Tillater kun tilkobling til pypi.org og files.pythonhosted.org slik at micropip kan laste ned pakker.',
  'python.netModeHostsTitle': 'Valgte verter',
  'python.netModeHostsDesc':
    'Tillater HTTPS-tilkoblinger til opptil 5 vanlige DNS-vertsnavn du skriver inn under (ingen jokertegn, IP-adresser eller porter).',
  'python.netModeAllTitle': 'Alt',
  'python.netModeAllDesc':
    'Fjerner nettverksbegrensninger for denne innlastingen. Bruk kun med kode du stoler helt på.',
  'python.netHostsLabel': 'Tillatte HTTPS-vertsnavn (ett per linje eller kommaseparert, maks 5)',
  'python.netHostsPlaceholder': 'api.example.com\ndata.example.org',
  'python.netHostsEmpty': 'Skriv inn minst ett gyldig https://-DNS-vertsnavn.',
  'python.netHostsMax': 'Maksimalt 5 vertsnavn er tillatt.',
  'python.netHostsInvalid': 'Ugyldig vertsnavn «{host}»: {reason}',
  'python.netApplyOff': 'Last inn på nytt uten nettverk',
  'python.netNoChange': 'Gjeldende modus',
};
