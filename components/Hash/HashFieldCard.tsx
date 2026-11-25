import React from 'react';

import { formatByteSize } from '../../lib/hash/engine';
import {
  ALGORITHM_MAP,
  FieldInputKind,
  HashAlgorithmId,
  HashFieldEntry,
  TextInputEncoding,
} from '../../lib/hash/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Hash.module.css';

interface HashFieldCardProps {
  index: number;
  field: HashFieldEntry;
  canRemove: boolean;
  selectedAlgorithms: readonly HashAlgorithmId[];
  hmacActive: boolean;
  quickMode: boolean;
  verifiedAlgorithms: ReadonlySet<HashAlgorithmId>;
  peerMatchesByAlgo: Readonly<Partial<Record<HashAlgorithmId, readonly string[]>>>;
  onUpdateLabel: (id: string, label: string) => void;
  onUpdateKind: (id: string, kind: FieldInputKind) => void;
  onUpdateText: (id: string, text: string) => void;
  onUpdateTextEncoding: (id: string, enc: TextInputEncoding) => void;
  onAttachFiles: (id: string, files: FileList | File[]) => void;
  onClearField: (id: string) => void;
  onDuplicateField: (id: string) => void;
  onRemoveField: (id: string) => void;
  onUseInVerifier: (digest: string) => void;
}

function CopyIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export default function HashFieldCard({
  index,
  field,
  canRemove,
  selectedAlgorithms,
  hmacActive,
  quickMode,
  verifiedAlgorithms,
  peerMatchesByAlgo,
  onUpdateLabel,
  onUpdateKind,
  onUpdateText,
  onUpdateTextEncoding,
  onAttachFiles,
  onClearField,
  onDuplicateField,
  onRemoveField,
  onUseInVerifier,
}: HashFieldCardProps) {
  const { t } = useI18n();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [dropOver, setDropOver] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const hasAnyDigest = selectedAlgorithms.some((algo) => Boolean(field.digests[algo]));
  const hasVerifierMatch = verifiedAlgorithms.size > 0;

  const copyText = React.useCallback((key: string, value: string) => {
    if (!value) return;
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1500);
  }, []);

  const handleCopyAll = () => {
    const lines = selectedAlgorithms
      .map((algo) => {
        const val = field.digests[algo];
        if (!val) return null;
        return `${algo}: ${val}`;
      })
      .filter((l): l is string => l !== null);
    if (lines.length === 0) return;
    copyText('all', `${field.label}\n${lines.join('\n')}`);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dropOver) setDropOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDropOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAttachFiles(field.id, e.dataTransfer.files);
    }
  };

  const errorMessage =
    field.error === 'invalidHex'
      ? t('hash.field.errInvalidHex')
      : field.error === 'invalidBase64'
        ? t('hash.field.errInvalidBase64')
        : field.error;

  return (
    <article
      className={[
        styles.fieldCard,
        dropOver ? styles.fieldCardDropOver : '',
        hasVerifierMatch ? styles.fieldCardMatched : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid="hash-field-card"
      data-field-id={field.id}
    >
      <div className={styles.fieldCardHeader}>
        <div className={styles.fieldNameWrap}>
          <span className={styles.fieldNumber}>#{index + 1}</span>
          <input
            type="text"
            className={styles.fieldNameInput}
            value={field.label}
            onChange={(e) => onUpdateLabel(field.id, e.target.value)}
            aria-label={t('hash.field.labelAria', { label: field.label })}
          />
        </div>

        <div className={styles.fieldControls}>
          <div className={styles.segmented} role="group" aria-label={`${field.label} mode`}>
            <button
              type="button"
              aria-pressed={field.kind === 'text'}
              className={[styles.segBtn, field.kind === 'text' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
              onClick={() => onUpdateKind(field.id, 'text')}
            >
              {t('hash.field.modeText')}
            </button>
            <button
              type="button"
              aria-pressed={field.kind === 'file'}
              className={[styles.segBtn, field.kind === 'file' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
              onClick={() => onUpdateKind(field.id, 'file')}
            >
              {t('hash.field.modeFile')}
            </button>
          </div>

          {!quickMode && field.kind === 'text' && (
            <select
              className={styles.select}
              value={field.textEncoding}
              onChange={(e) => onUpdateTextEncoding(field.id, e.target.value as TextInputEncoding)}
              aria-label={`${t('hash.field.encodingAria')} (${field.label})`}
            >
              <option value="utf8">{t('hash.field.encUtf8')}</option>
              <option value="hex">{t('hash.field.encHex')}</option>
              <option value="base64">{t('hash.field.encBase64')}</option>
            </select>
          )}

          {hasAnyDigest && (
            <button
              type="button"
              className={styles.buttonSmall}
              onClick={handleCopyAll}
              aria-label={`${t('hash.field.copyAll')} (${field.label})`}
            >
              {copiedKey === 'all' ? t('hash.field.copied') : t('hash.field.copyAll')}
            </button>
          )}

          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => onDuplicateField(field.id)}
            aria-label={`${t('hash.field.duplicate')} (${field.label})`}
          >
            {t('hash.field.duplicate')}
          </button>

          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => onClearField(field.id)}
            disabled={field.kind === 'text' ? field.text.length === 0 : field.file === null}
            aria-label={`${t('hash.field.clear')} (${field.label})`}
          >
            {t('hash.field.clear')}
          </button>

          {canRemove && (
            <button
              type="button"
              className={styles.buttonDanger}
              onClick={() => onRemoveField(field.id)}
              aria-label={`${t('hash.field.remove')} (${field.label})`}
            >
              {t('hash.field.remove')}
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className={styles.hiddenFileInput}
        aria-label={`${t('hash.field.chooseFile')} (${field.label})`}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onAttachFiles(field.id, e.target.files);
          }
          e.target.value = '';
        }}
      />

      <div className={styles.fieldBody}>
        {/* Left: Input pane (Text or File) */}
        <div className={styles.inputPane}>
          {field.kind === 'text' ? (
            <>
              <textarea
                className={styles.textarea}
                value={field.text}
                onChange={(e) => onUpdateText(field.id, e.target.value)}
                placeholder={t('hash.field.textPlaceholder')}
                aria-label={`${field.label} input`}
                spellCheck={false}
              />
              <div className={styles.inputFooter}>
                <span>
                  {field.byteLength !== null
                    ? `${formatByteSize(field.byteLength)} · ${field.textEncoding.toUpperCase()}`
                    : `0 B · ${field.textEncoding.toUpperCase()}`}
                </span>
                <button
                  type="button"
                  className={styles.presetBtn}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t('hash.field.chooseFile')}
                </button>
              </div>
              {errorMessage && (
                <div className={styles.inputError} role="alert">
                  {errorMessage}
                </div>
              )}
            </>
          ) : field.file ? (
            <div className={styles.fileInfoBox}>
              <div className={styles.fileMetaRow}>
                <span className={styles.fileName}>{field.file.name}</span>
                <span className={styles.fileDetails}>
                  {formatByteSize(field.file.size)} ({field.file.size.toLocaleString()} B)
                  {field.file.type ? ` · ${field.file.type}` : ''}
                </span>
              </div>
              <div className={styles.fileActions}>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t('hash.field.replaceFile')}
                </button>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => onClearField(field.id)}
                >
                  {t('hash.field.removeFile')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={styles.fileZone}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon />
              <span className={styles.fileZoneTitle}>{t('hash.field.fileDropTitle')}</span>
              <span className={styles.fileZoneSub}>{t('hash.field.fileDropSub')}</span>
            </button>
          )}
        </div>

        {/* Right: Output hashes for THIS field */}
        <div className={styles.outputPane}>
          {!hasAnyDigest && field.computing ? (
            <div className={styles.outputEmpty} role="status">
              {t('hash.field.computing')}
            </div>
          ) : !hasAnyDigest ? (
            <div className={styles.outputEmpty}>{t('hash.field.waitingInput')}</div>
          ) : (
            <ul className={styles.digestList} aria-label={`${field.label} hashes`}>
              {selectedAlgorithms.map((algo) => {
                const digest = field.digests[algo];
                const info = ALGORITHM_MAP[algo];
                const showHmacTag = hmacActive && info.supportsHmac;

                if (!digest) {
                  if (!field.computing) return null;
                  return (
                    <li
                      key={algo}
                      className={styles.digestRow}
                      data-testid="digest-row"
                      data-algo={algo}
                      data-computing="true"
                    >
                      <div className={styles.digestAlgoCol}>
                        <span className={styles.digestAlgoName}>
                          {showHmacTag ? `${t('hash.field.hmacTag')}-${info.label}` : info.label}
                        </span>
                        <span className={styles.digestAlgoBits}>{info.bits}-bit</span>
                      </div>
                      <div className={styles.digestValueCol}>
                        <span className={styles.mutedNote} role="status">
                          {t('hash.field.computing')}
                        </span>
                      </div>
                    </li>
                  );
                }

                const isVerified = verifiedAlgorithms.has(algo);
                const peers = peerMatchesByAlgo[algo] ?? [];
                const isCopied = copiedKey === algo;

                return (
                  <li
                    key={algo}
                    className={[
                      styles.digestRow,
                      isVerified
                        ? styles.digestRowVerified
                        : peers.length > 0
                          ? styles.digestRowPeerMatch
                          : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-testid="digest-row"
                    data-algo={algo}
                    data-verified={isVerified ? 'true' : 'false'}
                    data-peer-match={peers.length > 0 ? 'true' : 'false'}
                  >
                    <div className={styles.digestAlgoCol}>
                      <span className={styles.digestAlgoName}>
                        {showHmacTag ? `${t('hash.field.hmacTag')}-${info.label}` : info.label}
                      </span>
                      <span className={styles.digestAlgoBits}>{info.bits}-bit</span>
                    </div>

                    <div className={styles.digestValueCol}>
                      <code className={styles.digestOutput}>{digest}</code>
                      {(isVerified || peers.length > 0) && (
                        <div className={styles.digestStatusLine}>
                          {isVerified && (
                            <span className={styles.statusVerifiedLabel}>
                              <CheckIcon />
                              <span>{t('hash.field.badgeVerifierMatch')}</span>
                            </span>
                          )}
                          {peers.length > 0 && (
                            <span className={styles.statusPeerLabel}>
                              <span>= {t('hash.field.badgePeerMatch', { peers: peers.join(', ') })}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className={styles.digestActions}>
                      <button
                        type="button"
                        className={[styles.iconBtn, isCopied ? styles.iconBtnCopied : ''].filter(Boolean).join(' ')}
                        onClick={() => copyText(algo, digest)}
                        aria-label={t('hash.field.copyDigest', { algo, label: field.label })}
                      >
                        {isCopied ? <CheckIcon /> : <CopyIcon />}
                        <span>{isCopied ? t('hash.field.copied') : t('common.copy')}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => onUseInVerifier(digest)}
                        aria-label={t('hash.field.useInVerifierAria', { algo, label: field.label })}
                        title={t('hash.field.useInVerifierAria', { algo, label: field.label })}
                      >
                        {t('hash.field.useInVerifier')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}
