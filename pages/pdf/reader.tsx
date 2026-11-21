import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfReader } from '../../components/PdfTools/PdfReader';
import ToolIcon from '../../components/PdfTools/ToolIcon';
import { DropTarget, FilePickerButton, PdfPage } from '../../components/PdfTools/ToolPage';
import { errorMessage, isPasswordError, isPdf, readBytes, uid } from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { openPdf } from '../../lib/pdf/pdfjs';
import { PdfThumbPool } from '../../lib/pdf/thumbs';
import { READER } from '../../lib/pdf/tools';
import styles from '../../styles/PdfTools.module.css';

interface LoadedReaderDoc {
  id: string;
  name: string;
  bytes: Uint8Array;
  doc: PDFDocumentProxy;
  close: () => Promise<void>;
  pool: PdfThumbPool;
  numPages: number;
}

interface LockedFile {
  name: string;
  bytes: Uint8Array;
  error: string | null;
  busy: boolean;
}

export default function PdfReaderPage() {
  const [loaded, setLoaded] = React.useState<LoadedReaderDoc | null>(null);
  const [locked, setLocked] = React.useState<LockedFile | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const activeDocRef = React.useRef<LoadedReaderDoc | null>(null);
  const loadSeqRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  const disposeDoc = React.useCallback((entry: LoadedReaderDoc | null) => {
    if (!entry) return;
    entry.pool.dispose();
    void entry.close().catch(() => undefined);
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadSeqRef.current += 1;
      disposeDoc(activeDocRef.current);
      activeDocRef.current = null;
    };
  }, [disposeDoc]);

  const openBytes = React.useCallback(
    async (name: string, bytes: Uint8Array, password?: string) => {
      const seq = ++loadSeqRef.current;
      setError(null);
      setLoading(true);
      if (password !== undefined) {
        setLocked((prev) => (prev ? { ...prev, busy: true, error: null } : null));
      }

      try {
        const handle = await openPdf(bytes, password);
        if (!mountedRef.current || loadSeqRef.current !== seq) {
          void handle.close().catch(() => undefined);
          return;
        }

        const pool = new PdfThumbPool(bytes, { password, maxCached: 120, thumbWidth: 200 });
        const next: LoadedReaderDoc = {
          id: uid(),
          name,
          bytes,
          doc: handle.doc,
          close: handle.close,
          pool,
          numPages: handle.doc.numPages,
        };

        const prev = activeDocRef.current;
        activeDocRef.current = next;
        setLocked(null);
        setLoaded(next);
        disposeDoc(prev);
      } catch (e) {
        if (!mountedRef.current || loadSeqRef.current !== seq) return;
        if (isPasswordError(e)) {
          setLocked({
            name,
            bytes,
            error: password !== undefined ? 'Incorrect password. Try again.' : null,
            busy: false,
          });
        } else {
          setLocked(null);
          setError(errorMessage(e));
        }
      } finally {
        if (mountedRef.current && loadSeqRef.current === seq) {
          setLoading(false);
        }
      }
    },
    [disposeDoc],
  );

  const loadFiles = React.useCallback(
    async (files: File[]) => {
      const pdf = files.find(isPdf);
      if (!pdf) {
        setNotice('Please select a PDF file.');
        return;
      }
      setNotice(files.length > 1 ? 'Only the first PDF was opened. Read PDF views one document at a time.' : null);
      setLocked(null);
      try {
        const bytes = await readBytes(pdf);
        await openBytes(pdf.name, bytes);
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [openBytes],
  );

  React.useEffect(() => {
    const handoff = consumeHandoff();
    if (handoff?.length) {
      void loadFiles(handoffToFiles(handoff));
    }
  }, [loadFiles]);

  return (
    <PdfPage
      title={READER.title}
      lead={!loaded ? READER.description : undefined}
      showHub
    >
      {notice && (
        <p className={styles.note} style={{ marginBottom: '0.75rem' }}>
          {notice}
        </p>
      )}
      {error && (
        <div className={styles.error} style={{ marginBottom: '0.75rem' }} role="alert">
          {error}
        </div>
      )}

      {locked && (
        <div style={{ marginBottom: '1rem' }}>
          <PasswordPrompt
            fileName={locked.name}
            error={locked.error}
            busy={locked.busy}
            onSubmit={(pw) => openBytes(locked.name, locked.bytes, pw)}
            onCancel={() => {
              setLocked(null);
              setLoading(false);
            }}
          />
        </div>
      )}

      {loaded ? (
        <PdfReader
          docId={loaded.id}
          fileName={loaded.name}
          bytes={loaded.bytes}
          doc={loaded.doc}
          pool={loaded.pool}
          numPages={loaded.numPages}
          onOpenFiles={loadFiles}
        />
      ) : (
        <DropTarget onFiles={loadFiles} className={styles.hero}>
          <ToolIcon name={READER.icon} color={READER.color} size={72} />
          <h2>{READER.title}</h2>
          <p>{READER.description}</p>
          <FilePickerButton
            accept=".pdf,application/pdf"
            multiple={false}
            onFiles={loadFiles}
            className={styles.heroButton}
          >
            {loading ? 'Opening PDF…' : 'Select PDF file'}
          </FilePickerButton>
          <span className={styles.hint}>or drop a PDF anywhere here</span>
          <span className={styles.hint}>Your files stay in this browser and are never uploaded.</span>
        </DropTarget>
      )}
    </PdfPage>
  );
}
