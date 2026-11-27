import React from 'react';

import {
  compareFieldDigests,
  formatChecksumManifest,
  formatDigest,
  verifyExpectedHash,
} from '../../lib/hash/engine';
import {
  DEFAULT_ALGORITHMS,
  DigestEncoding,
  FieldInputKind,
  HASH_ALGORITHMS,
  HashAlgorithmId,
  HashFieldEntry,
  HashFileAttachment,
  TextInputEncoding,
} from '../../lib/hash/types';
import {
  cancelFieldHashJob,
  disposeHashWorkers,
  runFieldHashJob,
  WorkerInputPayload,
} from '../../lib/hash/workerClient';
import type { HashExamplePreset } from '../../lib/toolExamples/presets';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Hash.module.css';
import HashFieldCard from './HashFieldCard';
import HashToolbar from './HashToolbar';
import HashVerifierPanel from './HashVerifierPanel';

interface HashWorkbenchProps {
  quickMode: boolean;
  exampleRequest?: { preset: HashExamplePreset; seq: number } | null;
}

interface WorkbenchField extends HashFieldEntry {
  readonly inputRevision: number;
}

interface FieldComputeCache {
  inputSig: string;
  rawDigests: Partial<Record<HashAlgorithmId, Uint8Array>>;
  inFlightKey: string | null;
  byteLength: number | null;
  error: string | null;
}

const ORDERED_ALGO_IDS: readonly HashAlgorithmId[] = HASH_ALGORITHMS.map((a) => a.id);

function createEmptyField(id: string, label: string): WorkbenchField {
  return {
    id,
    label,
    kind: 'text',
    text: '',
    textEncoding: 'utf8',
    file: null,
    digests: {},
    byteLength: null,
    error: null,
    computing: false,
    inputRevision: 0,
  };
}

function createFileAttachment(file: File): HashFileAttachment {
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    file,
  };
}

function formatCachedDigests(
  rawDigests: Partial<Record<HashAlgorithmId, Uint8Array>>,
  algorithms: readonly HashAlgorithmId[],
  encoding: DigestEncoding,
): Partial<Record<HashAlgorithmId, string>> {
  const out: Partial<Record<HashAlgorithmId, string>> = {};
  for (const algo of algorithms) {
    const raw = rawDigests[algo];
    if (raw) {
      out[algo] = formatDigest(raw, encoding);
    }
  }
  return out;
}

function digestsEqual(
  a: Partial<Record<HashAlgorithmId, string>>,
  b: Partial<Record<HashAlgorithmId, string>>,
  algorithms: readonly HashAlgorithmId[],
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const algo of algorithms) {
    if (a[algo] !== b[algo]) return false;
  }
  return true;
}

export default function HashWorkbench({ quickMode, exampleRequest = null }: HashWorkbenchProps) {
  const { t } = useI18n();
  const nextIdRef = React.useRef(3);
  const batchFileInputRef = React.useRef<HTMLInputElement>(null);

  const [selectedAlgorithms, setSelectedAlgorithms] = React.useState<readonly HashAlgorithmId[]>(DEFAULT_ALGORITHMS);
  const [encoding, setEncoding] = React.useState<DigestEncoding>('hex-lower');
  const [hmacEnabled, setHmacEnabled] = React.useState(false);
  const [hmacKey, setHmacKey] = React.useState('');
  const [hashEmpty, setHashEmpty] = React.useState(false);
  const [expectedHash, setExpectedHash] = React.useState('');
  const [manifestCopied, setManifestCopied] = React.useState(false);

  const [fields, setFields] = React.useState<WorkbenchField[]>(() => [
    createEmptyField('field-1', 'Input 1'),
    createEmptyField('field-2', 'Input 2'),
  ]);

  const effectiveHmacKey = !quickMode && hmacEnabled && hmacKey.length > 0 ? hmacKey : '';
  const effectiveHmacBytes = React.useMemo(
    () => (effectiveHmacKey.length > 0 ? new TextEncoder().encode(effectiveHmacKey) : null),
    [effectiveHmacKey],
  );

  // Per-field raw digest cache and active-job tracking (never blocks main thread or re-hashes unchanged fields)
  const cacheRef = React.useRef<Map<string, FieldComputeCache>>(new Map());
  const fieldsRef = React.useRef(fields);
  fieldsRef.current = fields;
  const encodingRef = React.useRef(encoding);
  encodingRef.current = encoding;
  const selectedAlgorithmsRef = React.useRef(selectedAlgorithms);
  selectedAlgorithmsRef.current = selectedAlgorithms;

  // Terminate all workers when leaving the tool
  React.useEffect(() => {
    return () => {
      disposeHashWorkers();
    };
  }, []);

  // Instant 0ms re-formatting when switching between hex, HEX, and Base64 (no re-hashing!)
  React.useEffect(() => {
    const algos = selectedAlgorithmsRef.current;
    setFields((prev) => {
      let changed = false;
      const next = prev.map((f) => {
        const cache = cacheRef.current.get(f.id);
        if (!cache) return f;
        const formatted = formatCachedDigests(cache.rawDigests, algos, encoding);
        if (digestsEqual(f.digests, formatted, algos)) return f;
        changed = true;
        return { ...f, digests: formatted };
      });
      return changed ? next : prev;
    });
  }, [encoding]);

  // Lightweight trigger key using integer per-field revisions (never copies large text strings)
  const algoKey = selectedAlgorithms.join(',');
  const revisionKey = fields.map((f) => `${f.id}:${f.inputRevision}`).join('|');

  React.useEffect(() => {
    const currentFields = fieldsRef.current;
    const algos = selectedAlgorithms;
    const hmacBytes = effectiveHmacBytes;
    const cacheMap = cacheRef.current;
    const currentIds = new Set(currentFields.map((f) => f.id));

    // Clean up removed fields and stop their workers immediately
    for (const cachedId of Array.from(cacheMap.keys())) {
      if (!currentIds.has(cachedId)) {
        cancelFieldHashJob(cachedId);
        cacheMap.delete(cachedId);
      }
    }

    const immediateUpdates = new Map<
      string,
      {
        digests: Partial<Record<HashAlgorithmId, string>>;
        byteLength: number | null;
        error: string | null;
        computing: boolean;
      }
    >();

    for (const field of currentFields) {
      const inputSig = `${field.inputRevision}|${hashEmpty ? '1' : '0'}|${effectiveHmacKey}`;
      let cache = cacheMap.get(field.id);

      if (!cache || cache.inputSig !== inputSig) {
        cancelFieldHashJob(field.id);
        cache = {
          inputSig,
          rawDigests: {},
          inFlightKey: null,
          byteLength: null,
          error: null,
        };
        cacheMap.set(field.id, cache);
      }

      // Check empty / waiting states first
      let payload: WorkerInputPayload | null = null;
      if (field.kind === 'file') {
        if (!field.file) {
          cancelFieldHashJob(field.id);
          cache.inFlightKey = null;
          cache.byteLength = null;
          cache.error = null;
          immediateUpdates.set(field.id, {
            digests: {},
            byteLength: null,
            error: null,
            computing: false,
          });
          continue;
        }
        if (field.file.file) {
          payload = { kind: 'blob', blob: field.file.file };
        } else if (field.file.bytes) {
          payload = { kind: 'bytes', bytes: field.file.bytes };
        } else {
          continue;
        }
      } else {
        if (field.text.length === 0 && !hashEmpty) {
          cancelFieldHashJob(field.id);
          cache.inFlightKey = null;
          cache.byteLength = 0;
          cache.error = null;
          immediateUpdates.set(field.id, {
            digests: {},
            byteLength: 0,
            error: null,
            computing: false,
          });
          continue;
        }
        payload = { kind: 'text', text: field.text, textEncoding: field.textEncoding };
      }

      // If this exact input already failed parsing (e.g. invalid hex/base64), keep cached error
      if (cache.error !== null) {
        immediateUpdates.set(field.id, {
          digests: {},
          byteLength: null,
          error: cache.error,
          computing: false,
        });
        continue;
      }

      const missingAlgos = algos.filter((a) => !cache.rawDigests[a]);

      if (missingAlgos.length === 0) {
        if (cache.inFlightKey !== null) {
          cancelFieldHashJob(field.id);
          cache.inFlightKey = null;
        }
        immediateUpdates.set(field.id, {
          digests: formatCachedDigests(cache.rawDigests, algos, encodingRef.current),
          byteLength: cache.byteLength ?? (field.kind === 'file' && field.file ? field.file.size : field.byteLength),
          error: null,
          computing: false,
        });
        continue;
      }

      const jobKey = `${inputSig}::${missingAlgos.join(',')}`;
      if (cache.inFlightKey === jobKey) {
        // Already running in a worker for this exact field input & missing algorithms — leave undisturbed!
        continue;
      }

      cache.inFlightKey = jobKey;
      const existingFormatted = formatCachedDigests(cache.rawDigests, algos, encodingRef.current);
      immediateUpdates.set(field.id, {
        digests: existingFormatted,
        byteLength: field.kind === 'file' && field.file ? field.file.size : cache.byteLength ?? field.byteLength,
        error: null,
        computing: true,
      });

      const fieldId = field.id;
      const expectedSig = inputSig;
      const expectedJobKey = jobKey;

      runFieldHashJob(
        fieldId,
        {
          payload,
          algorithms: missingAlgos,
          hmacKey: hmacBytes,
        },
        {
          onDigest: (algo, rawBytes) => {
            const activeCache = cacheRef.current.get(fieldId);
            if (!activeCache || activeCache.inputSig !== expectedSig) return;
            activeCache.rawDigests[algo] = rawBytes;

            const currentAlgos = selectedAlgorithmsRef.current;
            const currentEnc = encodingRef.current;
            const formatted = formatCachedDigests(activeCache.rawDigests, currentAlgos, currentEnc);

            setFields((prev) =>
              prev.map((f) => (f.id === fieldId ? { ...f, digests: formatted, error: null } : f)),
            );
          },
          onDone: (byteLength) => {
            const activeCache = cacheRef.current.get(fieldId);
            if (!activeCache || activeCache.inputSig !== expectedSig || activeCache.inFlightKey !== expectedJobKey) {
              return;
            }
            activeCache.inFlightKey = null;
            activeCache.byteLength = byteLength;
            activeCache.error = null;

            const currentAlgos = selectedAlgorithmsRef.current;
            const currentEnc = encodingRef.current;
            const formatted = formatCachedDigests(activeCache.rawDigests, currentAlgos, currentEnc);

            setFields((prev) =>
              prev.map((f) =>
                f.id === fieldId
                  ? { ...f, digests: formatted, byteLength, error: null, computing: false }
                  : f,
              ),
            );
          },
          onError: (message) => {
            const activeCache = cacheRef.current.get(fieldId);
            if (!activeCache || activeCache.inputSig !== expectedSig || activeCache.inFlightKey !== expectedJobKey) {
              return;
            }
            activeCache.inFlightKey = null;
            activeCache.error = message;
            activeCache.byteLength = null;

            setFields((prev) =>
              prev.map((f) =>
                f.id === fieldId
                  ? { ...f, digests: {}, byteLength: null, error: message, computing: false }
                  : f,
              ),
            );
          },
        },
      );
    }

    if (immediateUpdates.size > 0) {
      setFields((prev) => {
        let changed = false;
        const next = prev.map((f) => {
          const upd = immediateUpdates.get(f.id);
          if (!upd) return f;
          if (
            f.computing === upd.computing &&
            f.byteLength === upd.byteLength &&
            f.error === upd.error &&
            digestsEqual(f.digests, upd.digests, algos)
          ) {
            return f;
          }
          changed = true;
          return {
            ...f,
            digests: upd.digests,
            byteLength: upd.byteLength,
            error: upd.error,
            computing: upd.computing,
          };
        });
        return changed ? next : prev;
      });
    }
    // revisionKey tracks per-field input mutations without serializing multi-MB content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [algoKey, hashEmpty, effectiveHmacKey, revisionKey]);

  const handleToggleAlgorithm = React.useCallback((algo: HashAlgorithmId) => {
    setSelectedAlgorithms((prev) => {
      if (prev.includes(algo)) {
        if (prev.length === 1) return prev;
        return prev.filter((a) => a !== algo);
      }
      const next = new Set([...prev, algo]);
      return ORDERED_ALGO_IDS.filter((id) => next.has(id));
    });
  }, []);

  const handleSelectAlgorithms = React.useCallback((algos: readonly HashAlgorithmId[]) => {
    const next = new Set(algos);
    setSelectedAlgorithms(ORDERED_ALGO_IDS.filter((id) => next.has(id)));
  }, []);

  const handleEnableAlgorithms = React.useCallback((algos: readonly HashAlgorithmId[]) => {
    setSelectedAlgorithms((prev) => {
      const next = new Set([...prev, ...algos]);
      return ORDERED_ALGO_IDS.filter((id) => next.has(id));
    });
  }, []);

  const handleAddField = React.useCallback(() => {
    const num = nextIdRef.current++;
    const label = t('hash.field.defaultLabel', { n: num });
    setFields((prev) => [...prev, createEmptyField(`field-${num}`, label)]);
  }, [t]);

  const handleAddBatchFiles = React.useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    const attachments = files.map(createFileAttachment);

    setFields((prev) => {
      const next = [...prev];
      for (const att of attachments) {
        const emptyIdx = next.findIndex((f) => f.kind === 'text' && f.text === '' && !f.file);
        if (emptyIdx !== -1) {
          next[emptyIdx] = {
            ...next[emptyIdx],
            label: att.name,
            kind: 'file',
            file: att,
            digests: {},
            byteLength: att.size,
            error: null,
            computing: true,
            inputRevision: next[emptyIdx].inputRevision + 1,
          };
        } else {
          const num = nextIdRef.current++;
          next.push({
            id: `field-${num}`,
            label: att.name,
            kind: 'file',
            text: '',
            textEncoding: 'utf8',
            file: att,
            digests: {},
            byteLength: att.size,
            error: null,
            computing: true,
            inputRevision: 1,
          });
        }
      }
      return next;
    });
  }, []);

  const handleAttachFilesToField = React.useCallback((id: string, fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    const [first, ...rest] = files.map(createFileAttachment);

    setFields((prev) => {
      const updated = prev.map((f) =>
        f.id === id
          ? {
              ...f,
              label: first.name,
              kind: 'file' as FieldInputKind,
              file: first,
              digests: {},
              byteLength: first.size,
              error: null,
              computing: true,
              inputRevision: f.inputRevision + 1,
            }
          : f,
      );
      for (const extra of rest) {
        const num = nextIdRef.current++;
        updated.push({
          id: `field-${num}`,
          label: extra.name,
          kind: 'file',
          text: '',
          textEncoding: 'utf8',
          file: extra,
          digests: {},
          byteLength: extra.size,
          error: null,
          computing: true,
          inputRevision: 1,
        });
      }
      return updated;
    });
  }, []);

  const handleUpdateLabel = React.useCallback((id: string, label: string) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, label } : f)));
  }, []);

  const handleUpdateKind = React.useCallback((id: string, kind: FieldInputKind) => {
    setFields((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, kind, error: null, inputRevision: f.inputRevision + 1 } : f,
      ),
    );
  }, []);

  const handleUpdateText = React.useCallback((id: string, text: string) => {
    setFields((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, text, error: null, inputRevision: f.inputRevision + 1 } : f,
      ),
    );
  }, []);

  const handleUpdateTextEncoding = React.useCallback((id: string, textEncoding: TextInputEncoding) => {
    setFields((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, textEncoding, error: null, inputRevision: f.inputRevision + 1 } : f,
      ),
    );
  }, []);

  const handleClearField = React.useCallback((id: string) => {
    cancelFieldHashJob(id);
    cacheRef.current.delete(id);
    setFields((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              text: '',
              file: null,
              digests: {},
              byteLength: null,
              error: null,
              computing: false,
              inputRevision: f.inputRevision + 1,
            }
          : f,
      ),
    );
  }, []);

  const handleDuplicateField = React.useCallback((id: string) => {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx === -1) return prev;
      const src = prev[idx];
      const num = nextIdRef.current++;
      const newId = `field-${num}`;

      // Reuse already-computed raw digests for instant duplication without re-hashing
      const srcCache = cacheRef.current.get(src.id);
      if (srcCache) {
        cacheRef.current.set(newId, {
          inputSig: srcCache.inputSig,
          rawDigests: { ...srcCache.rawDigests },
          inFlightKey: null,
          byteLength: srcCache.byteLength,
          error: srcCache.error,
        });
      }

      const copy: WorkbenchField = {
        ...src,
        id: newId,
        label: `${src.label} (copy)`,
        computing: false,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }, []);

  const handleRemoveField = React.useCallback((id: string) => {
    cancelFieldHashJob(id);
    cacheRef.current.delete(id);
    setFields((prev) => (prev.length <= 1 ? prev : prev.filter((f) => f.id !== id)));
  }, []);

  const lastExampleSeqRef = React.useRef(0);
  React.useEffect(() => {
    if (!exampleRequest || exampleRequest.seq === lastExampleSeqRef.current) return;
    lastExampleSeqRef.current = exampleRequest.seq;
    const { preset } = exampleRequest;
    for (const id of Array.from(cacheRef.current.keys())) {
      cancelFieldHashJob(id);
    }
    cacheRef.current.clear();
    const nextAlgos = new Set(preset.algorithms);
    setSelectedAlgorithms(ORDERED_ALGO_IDS.filter((id) => nextAlgos.has(id)));
    setEncoding(preset.encoding);
    setHmacEnabled(Boolean(preset.hmacEnabled));
    setHmacKey(preset.hmacKey ?? '');
    setExpectedHash(preset.expectedHash ?? '');
    nextIdRef.current = preset.fields.length + 1;
    setFields(
      preset.fields.map((f, idx) => ({
        ...createEmptyField(`field-${idx + 1}`, f.label),
        text: f.text,
        textEncoding: f.textEncoding ?? 'utf8',
        inputRevision: 1,
      })),
    );
  }, [exampleRequest]);

  const handleClearAll = React.useCallback(() => {
    for (const id of Array.from(cacheRef.current.keys())) {
      cancelFieldHashJob(id);
    }
    cacheRef.current.clear();
    nextIdRef.current = 3;
    setFields([
      createEmptyField('field-1', t('hash.field.defaultLabel', { n: 1 })),
      createEmptyField('field-2', t('hash.field.defaultLabel', { n: 2 })),
    ]);
    setExpectedHash('');
  }, [t]);

  const verification = React.useMemo(
    () => verifyExpectedHash(expectedHash, fields, selectedAlgorithms, encoding),
    [expectedHash, fields, selectedAlgorithms, encoding],
  );

  const crossField = React.useMemo(
    () => compareFieldDigests(fields, selectedAlgorithms),
    [fields, selectedAlgorithms],
  );

  const verifiedByField = React.useMemo(() => {
    const map = new Map<string, Set<HashAlgorithmId>>();
    for (const match of verification.matches) {
      let set = map.get(match.fieldId);
      if (!set) {
        set = new Set();
        map.set(match.fieldId, set);
      }
      set.add(match.algorithm);
    }
    return map;
  }, [verification.matches]);

  const primaryManifestAlgo: HashAlgorithmId = selectedAlgorithms.includes('SHA-256')
    ? 'SHA-256'
    : (selectedAlgorithms[0] ?? 'SHA-256');

  const hasAnyActiveField = crossField.activeFieldIds.length > 0;

  const handleCopyManifest = () => {
    const text = formatChecksumManifest(fields, primaryManifestAlgo);
    if (!text) return;
    navigator.clipboard?.writeText(text).catch(() => {});
    setManifestCopied(true);
    window.setTimeout(() => setManifestCopied(false), 1600);
  };

  return (
    <div className={styles.workbenchStack}>
      <HashToolbar
        selectedAlgorithms={selectedAlgorithms}
        onToggleAlgorithm={handleToggleAlgorithm}
        onSelectAlgorithms={handleSelectAlgorithms}
        encoding={encoding}
        onEncodingChange={setEncoding}
        hmacEnabled={hmacEnabled}
        onHmacEnabledChange={setHmacEnabled}
        hmacKey={hmacKey}
        onHmacKeyChange={setHmacKey}
        hashEmpty={hashEmpty}
        onHashEmptyChange={setHashEmpty}
        quickMode={quickMode}
      />

      <HashVerifierPanel
        expectedHash={expectedHash}
        onExpectedHashChange={setExpectedHash}
        verification={verification}
        crossField={crossField}
        fields={fields}
        selectedAlgorithms={selectedAlgorithms}
        encoding={encoding}
        onEnableAlgorithms={handleEnableAlgorithms}
      />

      <section aria-label={t('hash.fields.title')}>
        <div className={styles.fieldsHeader} style={{ marginBottom: 12 }}>
          <div className={styles.fieldsTitleWrap}>
            <h2 className={styles.cardTitle}>{t('hash.fields.title')}</h2>
            <span className={styles.fieldsCount} data-testid="fields-count">
              {t('hash.fields.count', { count: fields.length })}
            </span>
          </div>

          <div className={styles.fieldsActions}>
            <button type="button" className={styles.primaryButton} onClick={handleAddField}>
              + {t('hash.fields.addField')}
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={() => batchFileInputRef.current?.click()}
            >
              + {t('hash.fields.addFiles')}
            </button>
            {hasAnyActiveField && (
              <button type="button" className={styles.button} onClick={handleCopyManifest}>
                {manifestCopied
                  ? t('hash.fields.copiedManifest')
                  : `${t('hash.fields.copyManifest')} (${primaryManifestAlgo})`}
              </button>
            )}
            <button type="button" className={styles.button} onClick={handleClearAll}>
              {t('hash.fields.clearAll')}
            </button>
          </div>
        </div>

        <input
          ref={batchFileInputRef}
          type="file"
          multiple
          className={styles.hiddenFileInput}
          aria-label={t('hash.fields.addFiles')}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleAddBatchFiles(e.target.files);
            }
            e.target.value = '';
          }}
        />

        <div className={styles.fieldsList}>
          {fields.map((field, index) => (
            <HashFieldCard
              key={field.id}
              index={index}
              field={field}
              canRemove={fields.length > 1}
              selectedAlgorithms={selectedAlgorithms}
              hmacActive={effectiveHmacBytes !== null}
              quickMode={quickMode}
              verifiedAlgorithms={verifiedByField.get(field.id) ?? EMPTY_ALGO_SET}
              peerMatchesByAlgo={crossField.fieldMatchesByAlgorithm[field.id] ?? EMPTY_PEER_MAP}
              onUpdateLabel={handleUpdateLabel}
              onUpdateKind={handleUpdateKind}
              onUpdateText={handleUpdateText}
              onUpdateTextEncoding={handleUpdateTextEncoding}
              onAttachFiles={handleAttachFilesToField}
              onClearField={handleClearField}
              onDuplicateField={handleDuplicateField}
              onRemoveField={handleRemoveField}
              onUseInVerifier={setExpectedHash}
            />
          ))}
        </div>

        <p className={styles.mutedNote} style={{ marginTop: 12 }}>
          {t('hash.fields.dropHint')}
        </p>
      </section>
    </div>
  );
}

const EMPTY_ALGO_SET: ReadonlySet<HashAlgorithmId> = new Set();
const EMPTY_PEER_MAP: Readonly<Partial<Record<HashAlgorithmId, readonly string[]>>> = {};
