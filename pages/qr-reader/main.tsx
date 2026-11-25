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
            const name = pages > 1 ? t('qrread.src.pdfPage', { name: file.name, page, pages }) : file.name;
            if (!firstUsed) { firstUsed = true; update(first, { name, ...done(r) }); } else add({ name, kind: 'pdf', ...done(r) } as Omit<Source, 'id'>);
          });
        } catch (e) {
          update(first, {
            status: 'error',
            error: e instanceof Error && e.message
              ? t('qrread.src.pdfErrMsg', { msg: e.message })
              : t('qrread.src.pdfErr'),
          });
        }
        continue;
      }
      const id = add({ name: file.name || t('qrread.src.pastedImage'), kind, status: 'reading', readings: [] });
      try {
        update(id, done(await scanImageFile(file, options)));
      } catch (e) {
        update(id, { status: 'error', error: e instanceof Error ? e.message : t('qrread.src.imgErr') });
      }
    }
  }, [add, update, t]);

  const readText = React.useCallback((value: string) => {
    if (!value) return;
    setWorkspace('workbench');
    add({ name: t('qrread.src.text'), kind: 'text', status: 'done', readings: [{ text: value, bytes: new TextEncoder().encode(value), detection: null }] });
  }, [add, t]);

  const runExample = React.useCallback(async () => {
    await readFiles([new File([await exampleImage()], t('qrread.src.exampleCodes'), { type: 'image/png' })], 'example');
  }, [readFiles, t]);

  const onCamera = React.useCallback((hit: CameraHit) => {
    const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const id = add({ name: t('qrread.src.cameraAt', { time }), kind: 'camera', status: 'done', previewUrl: hit.previewUrl, width: hit.width, height: hit.height, readings: hit.detections.map(reading) });
    // Bring the new result into view (on a phone it is under the camera).
    requestAnimationFrame(() => document.getElementById(`source-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }, [add, t]);

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
        if (type) files.push(new File([await item.getType(type)], t('qrread.src.pastedImage'), { type }));
      }
      if (files.length) readFiles(files, 'image');
      else setPasteNote(t('qrread.src.noClipboardImg'));
    } catch {
      setPasteNote(t('qrread.src.noClipboardBtn'));
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
        ogImage="/og/qr-tools.png"
        ogAlt="QR code generator displaying a scannable QR symbol with encoding and export controls"
      />

      <ToolHeader<WorkspaceId>
        title={t('qrread.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode
        allowWideView
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
                  <h2 id="open-title">{t('qrread.open.title')}</h2>
                  <div className={[styles.drop, dragging ? styles.dropActive : ''].filter(Boolean).join(' ')}>
                    <p>{t('qrread.open.dropHint')}</p>
                    <div className={styles.controlRow}>
                      <button type="button" className={styles.primaryButton} onClick={() => fileInput.current?.click()}>{t('qrread.open.chooseFiles')}</button>
                      <button type="button" className={styles.button} onClick={pasteButton}>{t('qrread.open.pasteImage')}</button>
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
                    <span>{t('qrread.open.otherBarcodes')}</span>
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
                  <h2 id="text-title">{t('qrread.text.title')}</h2>
                  <p className={styles.muted}>{t('qrread.text.hint')}</p>
                  <form onSubmit={(e) => { e.preventDefault(); readText(text); }}>
                    <textarea
                      className={styles.textarea}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="WIFI:T:WPA;S:My network;P:password;;"
                      spellCheck={false}
                      aria-label={t('qrread.text.aria')}
                    />
                    <div className={styles.controlRow}>
                      <button type="submit" className={styles.primaryButton} disabled={!text}>{t('qrread.text.readBtn')}</button>
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
                <section key={`${g.id}/${g.size}`} className={styles.source} aria-label={t('qrread.joined.aria')}>
                  <header className={styles.sourceHead}>
                    <h3>{t('qrread.joined.title', { size: g.size })}</h3>
                    <span className={styles.muted}>{t('qrread.joined.parity', { id: g.id })}</span>
                  </header>
                  {g.complete ? (
                    <ResultCard reading={{ text: g.text, bytes: g.bytes, detection: null }} label={t('qrread.joined.label')} what={t('qrread.joined.what', { size: g.size })} id={`joined-${g.id}`} />
                  ) : (
                    <p>
                      {t('qrread.joined.partial', {
                        have: g.parts.filter(Boolean).length,
                        size: g.size,
                        missing: g.parts.map((p, i) => (p ? null : i + 1)).filter(Boolean).join(', '),
                      })}
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
                <h2>{t('qrread.guide.symTitle')}</h2>
                <ul className={styles.guideList}>
                  <li><strong>{t('qrread.guide.symQr2Strong')}</strong>{t('qrread.guide.symQr2')}</li>
                  <li><strong>{t('qrread.guide.symMicroStrong')}</strong>{t('qrread.guide.symMicro')}</li>
                  <li><strong>{t('qrread.guide.symRmqrStrong')}</strong>{t('qrread.guide.symRmqr')}</li>
                  <li><strong>{t('qrread.guide.symQr1Strong')}</strong>{t('qrread.guide.symQr1')}</li>
                  <li><strong>{t('qrread.guide.symOtherStrong')}</strong>{t('qrread.guide.symOther')}</li>
                </ul>
              </section>

              <section className={styles.card}>
                <h2>{t('qrread.guide.wasmTitle')}</h2>
                <ul className={styles.guideList}>
                  <li><strong>{t('qrread.guide.wasmZeroStrong')}</strong>{t('qrread.guide.wasmZero')}</li>
                  <li><strong>{t('qrread.guide.wasmZxingStrong')}</strong>{t('qrread.guide.wasmZxingPre')}<code className={styles.mono}>/qr/</code>{t('qrread.guide.wasmZxingPost')}</li>
                  <li><strong>{t('qrread.guide.wasmPdfStrong')}</strong>{t('qrread.guide.wasmPdfPre')}<code className={styles.mono}>pdf.js</code>{t('qrread.guide.wasmPdfPost')}</li>
                  <li><strong>{t('qrread.guide.wasmSafeStrong')}</strong>{t('qrread.guide.wasmSafe')}</li>
                </ul>
              </section>
            </div>

            <section className={styles.card}>
              <h2>{t('qrread.guide.parsersTitle')}</h2>
              <div className={styles.guideGrid}>
                <ul className={styles.guideList}>
                  <li><strong>{t('qrread.guide.pWifiStrong')}</strong> (<code className={styles.mono}>WIFI:</code>){t('qrread.guide.pWifi')}</li>
                  <li><strong>{t('qrread.guide.pEsimStrong')}</strong> (<code className={styles.mono}>LPA:1$…</code>){t('qrread.guide.pEsim')}</li>
                  <li><strong>{t('qrread.guide.pContactsStrong')}</strong>{t('qrread.guide.pContactsPre')}<code className={styles.mono}>VEVENT</code>{t('qrread.guide.pContactsMid')}<code className={styles.mono}>.vcf</code> / <code className={styles.mono}>.ics</code>{t('qrread.guide.pContactsPost')}</li>
                  <li><strong>{t('qrread.guide.pLinksStrong')}</strong>{t('qrread.guide.pLinksPre')}<code className={styles.mono}>mailto:</code>, <code className={styles.mono}>MATMSG:</code>, <code className={styles.mono}>SMSTO:</code>{t('qrread.guide.pLinksAnd')}<code className={styles.mono}>geo:</code>{t('qrread.guide.pLinksPost')}</li>
                </ul>
                <ul className={styles.guideList}>
                  <li><strong>{t('qrread.guide.pPayStrong')}</strong>{t('qrread.guide.pPayPre')}<code className={styles.mono}>SPC</code>{t('qrread.guide.pPayPost')}</li>
                  <li><strong>{t('qrread.guide.pOtpStrong')}</strong>{t('qrread.guide.pOtpPre')}<code className={styles.mono}>otpauth://</code>{t('qrread.guide.pOtpMid')}<code className={styles.mono}>otpauth-migration://</code>{t('qrread.guide.pOtpPost')}</li>
                  <li><strong>{t('qrread.guide.pIndStrong')}</strong>{t('qrread.guide.pIndPre')}<code className={styles.mono}>MT:</code>{t('qrread.guide.pIndPost')}</li>
                  <li><strong>{t('qrread.guide.pEncStrong')}</strong>{t('qrread.guide.pEnc')}</li>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </main>

      {dragging && <div className={styles.dropOverlay} aria-hidden>{t('qrread.open.dropOverlay')}</div>}
    </div>
  );
}
