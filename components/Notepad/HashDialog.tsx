import { useEffect, useState } from 'react';

import {
  computeAllDigests,
  computeDigestHex,
  HASH_ALGORITHMS,
  HashAlgorithm,
} from '../../lib/notepad/cryptoHash';
import { applyEol } from '../../lib/notepad/diffStats';
import { encodeTextWithEncoding, getEncodingShortLabel } from '../../lib/notepad/encoding';
import { NotepadDoc } from '../../lib/notepad/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Notepad.module.css';

export interface HashDialogProps {
  open: boolean;
  initialAlgorithm: HashAlgorithm | 'ALL';
  activeDoc: NotepadDoc;
  docs: readonly NotepadDoc[];
  selectedText: string;
  onClose: () => void;
}

type HashScope = 'active' | 'selection' | 'allFiles';

export default function HashDialog({
  open,
  initialAlgorithm,
  activeDoc,
  docs,
  selectedText,
  onClose,
}: HashDialogProps) {
  const { t } = useI18n();
  const [scope, setScope] = useState<HashScope>('active');
  const [selectedAlgo, setSelectedAlgo] = useState<HashAlgorithm>(
    initialAlgorithm === 'ALL' ? 'SHA-256' : initialAlgorithm,
  );
  const [uppercase, setUppercase] = useState(false);
  const [expectedHash, setExpectedHash] = useState('');
  const [digests, setDigests] = useState<Record<HashAlgorithm, string> | null>(null);
  const [allFileRows, setAllFileRows] = useState<{ id: string; name: string; hash: string; bytes: number }[]>([]);
  const [byteCount, setByteCount] = useState(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initialAlgorithm !== 'ALL') {
      setSelectedAlgo(initialAlgorithm);
    }
    setScope(selectedText.length > 0 ? 'selection' : 'active');
    setExpectedHash('');
    setCopiedKey(null);
  }, [open, initialAlgorithm, selectedText.length]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    const run = async () => {
      if (scope === 'allFiles') {
        const rows = await Promise.all(
          docs.map(async (doc) => {
            const payload = applyEol(doc.content, doc.eol);
            const encoded = encodeTextWithEncoding(payload, doc.encoding).bytes;
            const hash = await computeDigestHex(selectedAlgo, encoded);
            return { id: doc.id, name: doc.name, hash, bytes: encoded.length };
          }),
        );
        if (alive) setAllFileRows(rows);
        return;
      }

      const rawText =
        scope === 'selection' && selectedText.length > 0
          ? selectedText
          : applyEol(activeDoc.content, activeDoc.eol);
      const bytes = encodeTextWithEncoding(rawText, activeDoc.encoding).bytes;
      const result = await computeAllDigests(bytes);
      if (alive) {
        setByteCount(bytes.length);
        setDigests(result);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [open, scope, selectedAlgo, activeDoc, docs, selectedText]);

  if (!open) return null;

  const fmt = (h: string) => (uppercase ? h.toUpperCase() : h.toLowerCase());

  const copyValue = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1600);
    } catch {
      // Clipboard blocked
    }
  };

  const cleanedExpected = expectedHash.trim().toLowerCase();
  const matchedAlgo =
    cleanedExpected.length >= 16 && digests
      ? HASH_ALGORITHMS.find((algo) => digests[algo].toLowerCase() === cleanedExpected) ?? null
      : null;

  return (
    <div
      className={styles.modalBackdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.modalDialogWide}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scratchpad-hash-title"
      >
        <div className={styles.modalHeader}>
          <h2 id="scratchpad-hash-title" className={styles.modalTitle}>
            {t('notepad.hash.title')}
          </h2>
          <button
            type="button"
            className={styles.closeIconBtn}
            onClick={onClose}
            aria-label={t('notepad.closeFile')}
          >
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.hashControlsRow}>
            <div className={styles.segmentedGroup} role="group" aria-label={t('notepad.hash.scope')}>
              <button
                type="button"
                aria-pressed={scope === 'active'}
                className={[styles.segBtn, scope === 'active' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                onClick={() => setScope('active')}
              >
                {t('notepad.hash.scopeActive')}
              </button>
              <button
                type="button"
                aria-pressed={scope === 'selection'}
                disabled={selectedText.length === 0}
                className={[styles.segBtn, scope === 'selection' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                onClick={() => setScope('selection')}
              >
                {t('notepad.hash.scopeSelection')}
              </button>
              <button
                type="button"
                aria-pressed={scope === 'allFiles'}
                className={[styles.segBtn, scope === 'allFiles' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                onClick={() => setScope('allFiles')}
              >
                {t('notepad.hash.scopeAllFiles')}
              </button>
            </div>

            <button
              type="button"
              aria-pressed={uppercase}
              className={[styles.toggleBtn, uppercase ? styles.toggleBtnActive : ''].filter(Boolean).join(' ')}
              onClick={() => setUppercase((u) => !u)}
            >
              {uppercase ? 'UPPER' : 'lower'}
            </button>
          </div>

          {scope !== 'allFiles' ? (
            <>
              <p className={styles.syncMeta}>
                {scope === 'selection'
                  ? t('notepad.hash.selectionMeta', {
                      bytes: byteCount,
                      encoding: getEncodingShortLabel(activeDoc.encoding),
                    })
                  : t('notepad.hash.fileMeta', {
                      name: activeDoc.name,
                      bytes: byteCount,
                      encoding: getEncodingShortLabel(activeDoc.encoding),
                      eol: activeDoc.eol,
                    })}
              </p>

              <div className={styles.hashList}>
                {HASH_ALGORITHMS.map((algo) => {
                  const val = digests ? fmt(digests[algo]) : '…';
                  const isHighlighted = initialAlgorithm === algo;
                  const isVerifyMatch = matchedAlgo === algo;
                  return (
                    <div
                      key={algo}
                      className={[
                        styles.hashRow,
                        isHighlighted ? styles.hashRowFocused : '',
                        isVerifyMatch ? styles.hashRowMatched : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <div className={styles.hashRowHead}>
                        <span className={styles.hashAlgoName}>{algo}</span>
                        <button
                          type="button"
                          className={styles.statusActionBtn}
                          onClick={() => void copyValue(algo, val)}
                          disabled={!digests}
                        >
                          {copiedKey === algo ? t('notepad.hash.copied') : t('notepad.hash.copy')}
                        </button>
                      </div>
                      <code className={styles.hashValue} data-testid={`hash-val-${algo.toLowerCase()}`}>
                        {val}
                      </code>
                    </div>
                  );
                })}
              </div>

              <div className={styles.hashVerifyBox}>
                <label htmlFor="scratchpad-verify-hash" className={styles.syncHeading}>
                  {t('notepad.hash.verifyLabel')}
                </label>
                <div className={styles.hashVerifyRow}>
                  <input
                    id="scratchpad-verify-hash"
                    type="text"
                    className={styles.findInput}
                    value={expectedHash}
                    onChange={(e) => setExpectedHash(e.target.value)}
                    placeholder={t('notepad.hash.verifyPlaceholder')}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  {cleanedExpected.length > 0 && (
                    <span
                      className={matchedAlgo ? styles.syncFeedbackOk : styles.syncFeedbackErr}
                      role="status"
                      aria-live="polite"
                    >
                      {matchedAlgo
                        ? t('notepad.hash.verifyMatch', { algo: matchedAlgo })
                        : t('notepad.hash.verifyMismatch')}
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={styles.hashControlsRow}>
                <div className={styles.segmentedGroup} role="group" aria-label={t('notepad.hash.algorithm')}>
                  {HASH_ALGORITHMS.map((algo) => (
                    <button
                      key={algo}
                      type="button"
                      aria-pressed={selectedAlgo === algo}
                      className={[styles.segBtn, selectedAlgo === algo ? styles.segBtnActive : '']
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setSelectedAlgo(algo)}
                    >
                      {algo}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.cmdBtn}
                  onClick={() =>
                    void copyValue(
                      'all',
                      allFileRows.map((r) => `${fmt(r.hash)}  ${r.name}`).join('\n'),
                    )
                  }
                >
                  {copiedKey === 'all' ? t('notepad.hash.copied') : t('notepad.hash.copyAll')}
                </button>
              </div>
              <div className={styles.hashList}>
                {allFileRows.map((row) => (
                  <div key={row.id} className={styles.hashRow}>
                    <div className={styles.hashRowHead}>
                      <span className={styles.hashAlgoName}>
                        {row.name} <span className={styles.syncMeta}>({row.bytes} B)</span>
                      </span>
                      <button
                        type="button"
                        className={styles.statusActionBtn}
                        onClick={() => void copyValue(row.id, fmt(row.hash))}
                      >
                        {copiedKey === row.id ? t('notepad.hash.copied') : t('notepad.hash.copy')}
                      </button>
                    </div>
                    <code className={styles.hashValue}>{fmt(row.hash)}</code>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.cmdBtn}
            disabled={scope === 'allFiles' || !digests}
            onClick={() => {
              if (!digests) return;
              const summary = HASH_ALGORITHMS.map((a) => `${a}: ${fmt(digests[a])}`).join('\n');
              void copyValue('all-single', summary);
            }}
          >
            {copiedKey === 'all-single' ? t('notepad.hash.copied') : t('notepad.hash.copyAll')}
          </button>
          <button type="button" className={styles.cmdBtnPrimary} onClick={onClose}>
            {t('notepad.closeFile')}
          </button>
        </div>
      </div>
    </div>
  );
}
