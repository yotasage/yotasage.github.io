// Hardened canvas-only inline PDF viewer for /python/main using lib/pdf/pdfjs.ts.
// Security (security.md §4): QuickJS scripting stripped by copy-pdfjs-assets.mjs, enableXfa: false,
// self-hosted /pdfjs/ assets only, and clean pdf.destroy() teardown on unmount or file change.

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';

import { loadPdfjs, openPdf, renderPage } from '../../lib/pdf/pdfjs';
import { useI18n } from '../../lib/ui/i18n';
import plotStyles from '../../styles/PythonPlots.module.css';

const PYTHON_PDF_WORKER_SRC = '/python/pdf-worker.js';

export interface PdfPreviewProps {
  bytes: Uint8Array;
  path: string;
  onDownload?: () => void;
}

const PDF_SCALES = [0.75, 1, 1.25, 1.5] as const;

export default function PdfPreview({ bytes, path, onDownload }: PdfPreviewProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);

  const [docReadySeq, setDocReadySeq] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Open PDF document whenever bytes change, and always destroy on cleanup
  useEffect(() => {
    let cancelled = false;
    let closeFn: (() => Promise<void>) | null = null;
    docRef.current = null;
    setLoading(true);
    setError(null);
    setPageCount(0);
    setPageNum(1);

    void loadPdfjs()
      .then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = PYTHON_PDF_WORKER_SRC;
        return openPdf(bytes);
      })
      .then(({ doc, close }) => {
        if (cancelled) {
          void close();
          return;
        }
        docRef.current = doc;
        closeFn = close;
        setPageCount(doc.numPages);
        setPageNum(1);
        setDocReadySeq((s) => s + 1);
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(t('python.pdfLoadFailed', { reason: msg }));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      docRef.current = null;
      if (closeFn) {
        void closeFn();
      }
    };
  }, [bytes, t]);

  // Render active page to canvas
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || pageCount === 0) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void doc
      .getPage(pageNum)
      .then((page) => renderPage(page, scale))
      .then((rendered) => {
        if (cancelled) return;
        const target = canvasRef.current;
        if (target) {
          target.width = rendered.width;
          target.height = rendered.height;
          const ctx = target.getContext('2d');
          if (ctx) {
            ctx.drawImage(rendered, 0, 0);
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(t('python.pdfLoadFailed', { reason: msg }));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [docReadySeq, pageCount, pageNum, scale, t]);

  return (
    <>
      <div className={plotStyles.stageToolbar}>
        <div className={plotStyles.stageToolbarGroup}>
          <button
            type="button"
            className={plotStyles.toolBtn}
            disabled={pageNum <= 1 || loading}
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            data-testid="python-pdf-prev"
          >
            {t('python.pdfPrev')}
          </button>
          <span className={plotStyles.viewerMeta} data-testid="python-pdf-page-info">
            {pageCount > 0
              ? t('python.pdfPageOf', { page: pageNum, total: pageCount })
              : t('python.pdfLoading')}
          </span>
          <button
            type="button"
            className={plotStyles.toolBtn}
            disabled={pageNum >= pageCount || loading}
            onClick={() => setPageNum((p) => Math.min(pageCount, p + 1))}
            data-testid="python-pdf-next"
          >
            {t('python.pdfNext')}
          </button>
        </div>

        <div className={plotStyles.stageToolbarGroup}>
          {PDF_SCALES.map((s) => (
            <button
              key={s}
              type="button"
              className={[plotStyles.toolBtn, scale === s ? plotStyles.toolBtnActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => setScale(s)}
              data-testid={`python-pdf-scale-${Math.round(s * 100)}`}
            >
              {Math.round(s * 100)}%
            </button>
          ))}
          {onDownload && (
            <button
              type="button"
              className={plotStyles.toolBtn}
              onClick={onDownload}
              data-testid="python-pdf-download"
            >
              {t('python.filesDownload')}
            </button>
          )}
          {/* Plain hard <a> link exits COOP/COEP cleanly into /pdf/main */}
          <a
            href="/pdf/main"
            className={plotStyles.toolBtn}
            data-testid="python-pdf-tools-link"
          >
            {t('python.pdfOpenTools')}
          </a>
        </div>
      </div>

      {error ? (
        <div className={plotStyles.errorBanner} role="alert" data-testid="python-pdf-error">
          {error}
        </div>
      ) : (
        <div className={plotStyles.pdfStage} data-testid="python-pdf-stage">
          <canvas
            ref={canvasRef}
            className={plotStyles.pdfCanvas}
            aria-label={`${path} (${pageNum}/${pageCount || 1})`}
            data-rendered={loading ? 'false' : 'true'}
            data-testid="python-pdf-canvas"
          />
        </div>
      )}
    </>
  );
}
