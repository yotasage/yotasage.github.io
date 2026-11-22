import React from 'react';

import PageHead from '../../components/PageHead';
import Camera, { CameraHit } from '../../components/QrRead/Camera';
import ResultCard, { Reading } from '../../components/QrRead/ResultCard';
import SourceView, { Source } from '../../components/QrRead/SourceView';
import { Status } from '../../components/QrRead/Status';
import PillTabs, { PillTabItem } from '../../components/UI/PillTabs';
import TeachingCallout from '../../components/UI/TeachingCallout';
import ToolHeader, { WorkspaceTab } from '../../components/UI/ToolHeader';
import { encode } from '../../lib/qr/encoder';
import { scanImageFile, scanPdf, Scanned } from '../../lib/qrread/images';
import { stopScanWorker } from '../../lib/qrread/scanClient';
import { sequences } from '../../lib/qrread/sequence';
import type { Detection, FormatSet } from '../../lib/qrread/zxing';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/QrRead.module.css';

type WorkspaceId = 'workbench' | 'guide';
type InputTabId = 'file' | 'camera' | 'text';

const IMAGE_TYPES = 'image/*,application/pdf,.pdf,.svg,.heic,.heif,.avif,.webp';

const reading = (d: Detection): Reading => ({ text: d.text, bytes: d.bytes, detection: d });

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

/** A picture of three codes made with the site's own generator, to try the reader without a code at hand. */
function exampleImage(): Promise<Blob> {
  const codes: [string, Parameters<typeof encode>[1]][] = [
    ['WIFI:T:WPA;S:Example network;P:correct horse battery staple;;', { symbology: 'qr2', version: 'auto', ecLevel: 'M', mask: 'auto', mode: 'auto', charset: 'utf-8', eci: 'auto' }],
    ['BEGIN:VCARD\r\nVERSION:3.0\r\nN:Lovelace;Ada;;;\r\nFN:Ada Lovelace\r\nORG:Analytical Engines\r\nTEL;TYPE=CELL:+4712345678\r\nEMAIL:ada@example.com\r\nEND:VCARD', { symbology: 'qr2', version: 'auto', ecLevel: 'L', mask: 'auto', mode: 'auto', charset: 'utf-8', eci: 'auto' }],
    ['https://yotasage.github.io/qrcode/main', { symbology: 'rmqr', version: 'auto', ecLevel: 'M', mask: 'auto', mode: 'auto', charset: 'utf-8', eci: 'auto' }],
  ];
  const scale = 6;
  const syms = codes.map(([text, o]) => encode(text, o));
  const gap = 8 * scale;
  const width = syms.reduce((w, s) => w + (s.width + 8) * scale + gap, gap);
  const height = Math.max(...syms.map((s) => (s.height + 8) * scale)) + 2 * gap;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';
  let ox = gap;
  for (const s of syms) {
    const oy = gap + 4 * scale;
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
      if (s.modules[y * s.width + x]) ctx.fillRect(ox + (x + 4) * scale, oy + y * scale, scale, scale);
    }
    ox += (s.width + 8) * scale + gap;
  }
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}

function ScanEmptyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <rect x="7" y="7" width="4" height="4" rx="0.6" />
      <rect x="13" y="7" width="4" height="4" rx="0.6" />
      <rect x="7" y="13" width="4" height="4" rx="0.6" />
      <path d="M13 13h4v4h-4" />
    </svg>
  );
}

export default function QrReader() {
  useDesignSystemPage('#0d9488', '#2ec5a6');
  const { t } = useI18n();
  const { mode: expMode, setMode: setExpMode } = useExperienceMode();

  const [workspace, setWorkspace] = React.useState<WorkspaceId>('workbench');
  const [inputTab, setInputTab] = React.useState<InputTabId>('file');
  const [sources, setSources] = React.useState<Source[]>([]);
  const [formats, setFormats] = React.useState<FormatSet>('qr');
  const [text, setText] = React.useState('');
  const [dragging, setDragging] = React.useState(false);
  const [pasteNote, setPasteNote] = React.useState('');
  const nextId = React.useRef(1);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const formatsRef = React.useRef(formats);
  formatsRef.current = formats;
  const sourcesRef = React.useRef(sources);
  sourcesRef.current = sources;

  const add = React.useCallback((s: Omit<Source, 'id'>): number => {
    const id = nextId.current++;
    setSources((all) => [{ ...s, id }, ...all]);
    return id;
  }, []);
  const update = React.useCallback((id: number, patch: Partial<Source>) => {
    setSources((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);
  const done = (r: Scanned): Partial<Source> => ({ status: 'done', previewUrl: r.previewUrl, width: r.width, height: r.height, readings: r.detections.map(reading) });

  const readFiles = React.useCallback(async (files: File[], kind: Source['kind'] = 'image') => {
    setWorkspace('workbench');
    for (const file of files) {
      const options = { formats: formatsRef.current, thorough: true };
      if (isPdf(file)) {
        const first = add({ name: file.name, kind: 'pdf', status: 'reading', readings: [] });
        try {
          let firstUsed = false;
          await scanPdf(new Uint8Array(await file.arrayBuffer()), options, (page, pages, r) => {
            const name = pages > 1 ? `${file.name}, page ${page} of ${pages}` : file.name;
            if (!firstUsed) { firstUsed = true; update(first, { name, ...done(r) }); } else add({ name, kind: 'pdf', ...done(r) } as Omit<Source, 'id'>);
          });
        } catch (e) {
          update(first, { status: 'error', error: `The PDF could not be opened${e instanceof Error && e.message ? `: ${e.message}` : '.'}` });
        }
        continue;
      }
      const id = add({ name: file.name || 'Pasted image', kind, status: 'reading', readings: [] });
      try {
        update(id, done(await scanImageFile(file, options)));
      } catch (e) {
        update(id, { status: 'error', error: e instanceof Error ? e.message : 'The image could not be read.' });
      }
    }
  }, [add, update]);

  const readText = React.useCallback((value: string) => {
    if (!value) return;
    setWorkspace('workbench');
    add({ name: 'Text', kind: 'text', status: 'done', readings: [{ text: value, bytes: new TextEncoder().encode(value), detection: null }] });
  }, [add]);

  const runExample = React.useCallback(async () => {
    await readFiles([new File([await exampleImage()], 'Example codes', { type: 'image/png' })], 'example');
  }, [readFiles]);

  const onCamera = React.useCallback((hit: CameraHit) => {
    const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const id = add({ name: `Camera, ${time}`, kind: 'camera', status: 'done', previewUrl: hit.previewUrl, width: hit.width, height: hit.height, readings: hit.detections.map(reading) });
    // Bring the new result into view (on a phone it is under the camera).
    requestAnimationFrame(() => document.getElementById(`source-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }, [add]);

  // Pasting anywhere on the page: an image is read, text goes to the text field (unless typed into a field).
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/') || isPdf(f));
      if (files.length) {
        e.preventDefault();
        readFiles(files);
        return;
      }
      const target = e.target as HTMLElement;
      if (typeof target?.closest === 'function' && target.closest('input, textarea, select, [contenteditable]')) return;
      const pasted = e.clipboardData?.getData('text/plain');
      if (pasted) {
        e.preventDefault();
        setText(pasted);
        readText(pasted);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [readFiles, readText]);

  // Leaving the page: the worker and the pictures are let go.
  React.useEffect(() => () => {
    stopScanWorker();
    for (const s of sourcesRef.current) if (s.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(s.previewUrl);
  }, []);

  async function pasteButton() {
    setPasteNote('');
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((mt) => mt.startsWith('image/'));
        if (type) files.push(new File([await item.getType(type)], 'Pasted image', { type }));
      }
      if (files.length) readFiles(files, 'image');
      else setPasteNote('There is no picture on the clipboard. Copy an image or take a screenshot first.');
    } catch {
      setPasteNote('This browser does not let the page read the clipboard from a button: press Ctrl+V (or ⌘V) instead.');
    }
  }

  function remove(id: number) {
    const s = sources.find((x) => x.id === id);
    if (s?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(s.previewUrl);
    setSources(sources.filter((x) => x.id !== id));
  }

  function clearAll() {
    for (const s of sources) if (s.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(s.previewUrl);
    setSources([]);
  }

  const joined = React.useMemo(
    () => sequences(sources.flatMap((s) => s.readings.map((r) => r.detection).filter(Boolean))),
    [sources],
  );

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = React.useMemo(
    () => [
      { id: 'workbench', label: t('qrread.workbench'), badge: sources.length > 0 ? sources.length : undefined },
      { id: 'guide', label: t('qrread.guide') },
    ],
    [t, sources.length],
  );

  const inputTabs: readonly PillTabItem<InputTabId>[] = React.useMemo(() => {
    if (expMode === 'quick') {
      return [
        { id: 'file', label: t('qrread.tab.file') },
        { id: 'camera', label: t('qrread.tab.camera') },
      ];
    }
    return [
      { id: 'file', label: t('qrread.tab.file') },
      { id: 'camera', label: t('qrread.tab.camera') },
      { id: 'text', label: t('qrread.tab.text') },
    ];
  }, [expMode, t]);

  const activeInputTab: InputTabId = expMode === 'quick' && inputTab === 'text' ? 'file' : inputTab;
  const openGuide = () => setWorkspace('guide');

  return (
    <div
      className={styles.page}
      data-ds="v2"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !e.relatedTarget) setDragging(false); }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        readFiles([...e.dataTransfer.files]);
      }}
    >
      <PageHead
        title={t('qrread.pageTitle')}
        description="Scan QR, Micro QR, and rMQR codes from your camera, images, clipboard, or PDFs and inspect Wi-Fi, eSIM, contact, payment, or raw byte payloads locally."
        path="/qr-reader/main"
      />

      <ToolHeader<WorkspaceId>
        title={t('qrread.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode
      />

      <main className={styles.main}>
        {/* Workbench Workspace */}
        <div className={styles.workspacePanel} hidden={workspace !== 'workbench'}>
          <div className={styles.layout}>
            {/* Left / Primary Input Column */}
            <div className={styles.inputCol}>
              <Status />

              {expMode === 'quick' && (
                <div className={styles.quickBanner} role="region" aria-label={t('qrread.quick.badge')}>
                  <div className={styles.quickBannerText}>
                    <span className={styles.quickBadge}>{t('qrread.quick.badge')}</span>
                    <span>{t('qrread.quick.bannerText')}</span>
                  </div>
                  <div className={styles.quickActions}>
                    <button type="button" className={styles.smallButton} onClick={() => setExpMode('standard')}>
                      {t('qrread.quick.switchStandard')}
                    </button>
                    <button type="button" className={styles.smallButton} onClick={() => setExpMode('teaching')}>
                      {t('qrread.quick.switchTeaching')}
                    </button>
                  </div>
                </div>
              )}

              <PillTabs<InputTabId>
                items={inputTabs}
                value={activeInputTab}
                onChange={setInputTab}
                ariaLabel={t('qrread.tabsAria')}
                idPrefix="qrread"
              />

              {/* Input Tab 1: File / Paste */}
              <div
                id="qrread-panel-file"
                role="tabpanel"
                aria-labelledby="qrread-tab-file"
                className={styles.tabPanel}
                hidden={activeInputTab !== 'file'}
              >
                <section className={styles.card} aria-labelledby="open-title">
                  <h2 id="open-title">Images and PDFs</h2>
                  <div className={[styles.drop, dragging ? styles.dropActive : ''].filter(Boolean).join(' ')}>
                    <p>Drop images or PDFs here, paste a picture with Ctrl+V, or choose a file below.</p>
                    <div className={styles.controlRow}>
                      <button type="button" className={styles.primaryButton} onClick={() => fileInput.current?.click()}>Choose files</button>
                      <button type="button" className={styles.button} onClick={pasteButton}>Paste image</button>
                      <button type="button" className={styles.button} onClick={runExample}>{t('qrread.results.tryExample')}</button>
                    </div>
                    <input
                      ref={fileInput}
                      type="file"
                      accept={IMAGE_TYPES}
                      multiple
                      hidden
                      onChange={(e) => { readFiles([...(e.target.files ?? [])]); e.target.value = ''; }}
                    />
                    {pasteNote && <p className={styles.muted} role="status">{pasteNote}</p>}
                  </div>
                  <label className={styles.checkbox}>
                    <input type="checkbox" checked={formats === 'all'} onChange={(e) => setFormats(e.target.checked ? 'all' : 'qr')} />
                    <span>Other barcodes too (Data Matrix, Aztec, PDF417, EAN, Code 128 and more)</span>
                  </label>
                </section>
              </div>

              {/* Input Tab 2: Camera (unmounts cleanly when switching tabs or workspace so camera track stops) */}
              {workspace === 'workbench' && activeInputTab === 'camera' && (
                <div
                  id="qrread-panel-camera"
                  role="tabpanel"
                  aria-labelledby="qrread-tab-camera"
                >
                  <Camera formats={formats} onHit={onCamera} />
                </div>
              )}

              {/* Input Tab 3: Text (kept mounted via hidden so typed text is never lost) */}
              <div
                id="qrread-panel-text"
                role="tabpanel"
                aria-labelledby="qrread-tab-text"
                className={styles.tabPanel}
                hidden={activeInputTab !== 'text'}
              >
                <section className={styles.card} aria-labelledby="text-title">
                  <h2 id="text-title">Text</h2>
                  <p className={styles.muted}>Paste raw payload text from another reader to inspect it with the same structured parsers.</p>
                  <form onSubmit={(e) => { e.preventDefault(); readText(text); }}>
                    <textarea
                      className={styles.textarea}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="WIFI:T:WPA;S:My network;P:password;;"
                      spellCheck={false}
                      aria-label="Content of a code"
                    />
                    <div className={styles.controlRow}>
                      <button type="submit" className={styles.primaryButton} disabled={!text}>Read text</button>
                      {text && (
                        <button type="button" className={styles.button} onClick={() => setText('')}>
                          {t('common.clear')}
                        </button>
                      )}
                    </div>
                  </form>
                </section>
              </div>

              <TeachingCallout title={t('qrread.teaching.wasmTitle')} onTheoryClick={openGuide}>
                {t('qrread.teaching.wasmBody')}
              </TeachingCallout>

              <TeachingCallout title={t('qrread.teaching.parsersTitle')} onTheoryClick={openGuide}>
                {t('qrread.teaching.parsersBody')}
              </TeachingCallout>
            </div>

            {/* Right Results Column */}
            <section className={styles.resultsArea} aria-labelledby="results-title">
              <div className={styles.resultsHead}>
                <h2 id="results-title">
                  {t('qrread.results.title')}
                  {sources.length > 0 && <span className={styles.countBadge}>{sources.length}</span>}
                </h2>
                {sources.length > 0 && (
                  <button type="button" className={styles.linkButton} onClick={clearAll}>
                    {t('qrread.results.clearAll')}
                  </button>
                )}
              </div>

              {sources.length === 0 && (
                <div className={styles.emptyCard}>
                  <span className={styles.emptyIcon}><ScanEmptyIcon /></span>
                  <h3 className={styles.emptyTitle}>{t('qrread.results.emptyTitle')}</h3>
                  <p className={styles.empty}>{t('qrread.results.emptyDesc')}</p>
                  <div className={styles.controlRow}>
                    <button type="button" className={styles.primaryButton} onClick={runExample}>
                      {t('qrread.results.tryExample')}
                    </button>
                  </div>
                </div>
              )}

              <TeachingCallout title={t('qrread.teaching.rawTitle')} onTheoryClick={openGuide}>
                {t('qrread.teaching.rawBody')}
              </TeachingCallout>

              {joined.map((g) => (
                <section key={`${g.id}/${g.size}`} className={styles.source} aria-label="Joined message">
                  <header className={styles.sourceHead}>
                    <h3>Message split over {g.size} codes</h3>
                    <span className={styles.muted}>parity {g.id}</span>
                  </header>
                  {g.complete ? (
                    <ResultCard reading={{ text: g.text, bytes: g.bytes, detection: null }} label="Joined" what={`Joined from ${g.size} codes`} id={`joined-${g.id}`} />
                  ) : (
                    <p>
                      Read {g.parts.filter(Boolean).length} of {g.size}: still missing{' '}
                      {g.parts.map((p, i) => (p ? null : i + 1)).filter(Boolean).join(', ')}. Read the others (in any order,
                      from any picture) to join the message.
                    </p>
                  )}
                </section>
              ))}

              {sources.map((s) => (
                <div key={s.id} id={`source-${s.id}`}>
                  <SourceView source={s} onRemove={() => remove(s.id)} />
                </div>
              ))}
            </section>
          </div>
        </div>

        {/* Supported Formats & Privacy Guide Workspace */}
        <div className={styles.workspacePanel} hidden={workspace !== 'guide'}>
          <div className={styles.guideLayout}>
            <div className={styles.guideHeader}>
              <h2>{t('qrread.guide.title')}</h2>
              <p className={styles.guideLead}>{t('qrread.guide.lead')}</p>
            </div>

            <div className={styles.guideGrid}>
              <section className={styles.card}>
                <h2>Supported symbologies</h2>
                <ul className={styles.guideList}>
                  <li><strong>QR Code Model 2</strong> — all versions (1–40), including Structured Append multi-symbol messages.</li>
                  <li><strong>Micro QR Code</strong> — compact M1–M4 symbols with a single finder pattern.</li>
                  <li><strong>rMQR Code</strong> — all 32 rectangular Micro QR sizes (ISO/IEC 23941).</li>
                  <li><strong>QR Code Model 1</strong> — legacy versions 1–6 (versions 7+ are not supported by ZXing-C++).</li>
                  <li><strong>Optional 1D &amp; 2D barcodes</strong> — enable &ldquo;Other barcodes too&rdquo; to decode Data Matrix, Aztec, PDF417, MaxiCode, EAN-13/8, UPC-A/E, Code 128, Code 39, ITF, and Codabar.</li>
                </ul>
              </section>

              <section className={styles.card}>
                <h2>100% client-side WebAssembly</h2>
                <ul className={styles.guideList}>
                  <li><strong>Zero uploads</strong> — images, screenshots, PDF pages, and camera video never leave your browser.</li>
                  <li><strong>Self-hosted ZXing-C++ WASM</strong> — decoded inside a dedicated Web Worker from local <code className={styles.mono}>/qr/</code> assets with zero CDN requests.</li>
                  <li><strong>Local PDF rasterization</strong> — multi-page PDFs are rendered locally via self-hosted <code className={styles.mono}>pdf.js</code> before scanning each page.</li>
                  <li><strong>Safe inspection first</strong> — links, Wi-Fi credentials, payment details, and raw bytes are displayed clearly so you can verify them before taking action.</li>
                </ul>
              </section>
            </div>

            <section className={styles.card}>
              <h2>Structured content parsers</h2>
              <div className={styles.guideGrid}>
                <ul className={styles.guideList}>
                  <li><strong>Wi-Fi</strong> (<code className={styles.mono}>WIFI:</code>) — SSID, security mode, hidden flag, masked password with reveal &amp; copy.</li>
                  <li><strong>eSIM</strong> (<code className={styles.mono}>LPA:1$…</code>) — SM-DP+ address, matching ID, confirmation code flag, and OID.</li>
                  <li><strong>Contacts &amp; Calendar</strong> — vCard (2.1 / 3.0 / 4.0), MeCard, and iCalendar (<code className={styles.mono}>VEVENT</code>) with downloadable <code className={styles.mono}>.vcf</code> / <code className={styles.mono}>.ics</code> files.</li>
                  <li><strong>Links, Email, SMS &amp; Geo</strong> — HTTP/HTTPS URLs with safety checks, <code className={styles.mono}>mailto:</code>, <code className={styles.mono}>MATMSG:</code>, <code className={styles.mono}>SMSTO:</code>, and <code className={styles.mono}>geo:</code> coordinates.</li>
                </ul>
                <ul className={styles.guideList}>
                  <li><strong>Payments</strong> — European EPC SEPA credit transfer QR, Swiss QR bill (<code className={styles.mono}>SPC</code>) with IBAN/reference checks, and cryptocurrency URIs.</li>
                  <li><strong>2FA / OTP</strong> — <code className={styles.mono}>otpauth://</code> and Google Authenticator migration exports (<code className={styles.mono}>otpauth-migration://</code>) with live TOTP codes computed via Web Crypto.</li>
                  <li><strong>Industry &amp; Travel</strong> — GS1 Digital Link / element strings, Matter smart-home onboarding (<code className={styles.mono}>MT:</code>), and IATA BCBP boarding passes.</li>
                  <li><strong>Encrypted text</strong> — AES-GCM payloads generated on this site&rsquo;s QR Code Generator can be decrypted right inside the result card.</li>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </main>

      {dragging && <div className={styles.dropOverlay} aria-hidden>Drop images or PDFs to scan</div>}
    </div>
  );
}
