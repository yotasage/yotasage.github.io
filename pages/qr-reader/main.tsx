import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import HomeIcon from '../../components/icons/home';
import Camera, { CameraHit } from '../../components/QrRead/Camera';
import ResultCard, { Reading } from '../../components/QrRead/ResultCard';
import SourceView, { Source } from '../../components/QrRead/SourceView';
import { Status } from '../../components/QrRead/Status';
import { encode } from '../../lib/qr/encoder';
import { scanImageFile, scanPdf, Scanned } from '../../lib/qrread/images';
import { stopScanWorker } from '../../lib/qrread/scanClient';
import { sequences } from '../../lib/qrread/sequence';
import type { Detection, FormatSet } from '../../lib/qrread/zxing';
import styles from '../../styles/QrRead.module.css';

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

export default function QrReader() {
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

  const readText = (value: string) => {
    if (!value) return;
    add({ name: 'Text', kind: 'text', status: 'done', readings: [{ text: value, bytes: new TextEncoder().encode(value), detection: null }] });
  };

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
  }, [readFiles]);

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
        const type = item.types.find((t) => t.startsWith('image/'));
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

  const joined = React.useMemo(() => sequences(sources.flatMap((s) => s.readings.map((r) => r.detection).filter(Boolean))), [sources]);

  return (
    <div
      className={styles.page}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !e.relatedTarget) setDragging(false); }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        readFiles([...e.dataTransfer.files]);
      }}
    >
      <Head>
        <title>QR code reader</title>
        <meta name="description" content="Read QR codes with your camera or from images and PDFs, and see what they hold. Runs in your browser." />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <style jsx global>{`
        html,
        body {
          margin: 0;
          padding: 0;
          background: #2b2b2b;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>

      <header className={styles.header}>
        <Link href="/" className={styles.homeLink} aria-label="Home"><HomeIcon /></Link>
        <h1 className={styles.title}>QR code reader</h1>
      </header>
      <p className={styles.lead}>
        Read QR codes with your camera, or from images, screenshots and PDFs, and see what they hold. Everything is read
        in your browser: pictures and video never leave your device.
      </p>
      <Status />

      <div className={styles.layout}>
        <section className={[styles.card, styles.openCard].join(' ')} aria-labelledby="open-title">
          <h2 id="open-title">Images and PDFs</h2>
          <div className={[styles.drop, dragging ? styles.dropActive : ''].join(' ')}>
            <p>Drop images or PDFs here, paste a picture with Ctrl+V, or</p>
            <div className={styles.controlRow}>
              <button type="button" className={styles.primaryButton} onClick={() => fileInput.current?.click()}>Choose files</button>
              <button type="button" className={styles.button} onClick={pasteButton}>Paste image</button>
              <button type="button" className={styles.button} onClick={async () => readFiles([new File([await exampleImage()], 'Example codes', { type: 'image/png' })], 'example')}>Try an example</button>
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

        <div className={styles.cameraArea}>
          <Camera formats={formats} onHit={onCamera} />
        </div>

        <section className={[styles.card, styles.textCard].join(' ')} aria-labelledby="text-title">
          <h2 id="text-title">Text</h2>
          <p className={styles.muted}>Paste what another reader showed you to see it the same way.</p>
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
              <button type="submit" className={styles.button} disabled={!text}>Read text</button>
            </div>
          </form>
        </section>

        <section className={styles.resultsArea} aria-labelledby="results-title">
          <div className={styles.resultsHead}>
            <h2 id="results-title">Results</h2>
            {sources.length > 0 && <button type="button" className={styles.linkButton} onClick={clearAll}>Clear all</button>}
          </div>
          {sources.length === 0 && (
            <p className={styles.empty}>Codes you read appear here, newest first, each with a preview of what it holds, its raw text and bytes, and the symbol.</p>
          )}
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
      {dragging && <div className={styles.dropOverlay} aria-hidden>Drop to read</div>}
    </div>
  );
}
