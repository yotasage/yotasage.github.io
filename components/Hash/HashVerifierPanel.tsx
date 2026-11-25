import React from 'react';

import { buildDigestDiff } from '../../lib/hash/engine';
import {
  CrossFieldSummary,
  DiffSegment,
  DigestEncoding,
  HashAlgorithmId,
  HashFieldEntry,
  VerificationSummary,
} from '../../lib/hash/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Hash.module.css';

interface HashVerifierPanelProps {
  expectedHash: string;
  onExpectedHashChange: (value: string) => void;
  verification: VerificationSummary;
  crossField: CrossFieldSummary;
  fields: readonly HashFieldEntry[];
  selectedAlgorithms: readonly HashAlgorithmId[];
  encoding: DigestEncoding;
  onEnableAlgorithms: (algos: readonly HashAlgorithmId[]) => void;
}

function CheckCircleIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.4 2.4 4.8-5.2" />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

function InfoCircleIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function DiffSegmentsView({ segments }: { segments: readonly DiffSegment[] }) {
  return (
    <code className={styles.diffCode}>
      {segments.map((seg, i) => (
        <span key={i} className={seg.same ? styles.diffSame : styles.diffChanged}>
          {seg.text}
        </span>
      ))}
    </code>
  );
}

export default function HashVerifierPanel({
  expectedHash,
  onExpectedHashChange,
  verification,
  crossField,
  fields,
  selectedAlgorithms,
  encoding,
  onEnableAlgorithms,
}: HashVerifierPanelProps) {
  const { t } = useI18n();
  const inputId = React.useId();

  const activeFields = React.useMemo(
    () => fields.filter((f) => crossField.activeFieldIds.includes(f.id)),
    [fields, crossField.activeFieldIds],
  );

  const [pairAId, setPairAId] = React.useState<string>('');
  const [pairBId, setPairBId] = React.useState<string>('');
  const [pairAlgo, setPairAlgo] = React.useState<HashAlgorithmId>('SHA-256');

  // Keep pairwise comparison selectors aligned with existing active fields and selected algorithms
  const resolvedAId = activeFields.some((f) => f.id === pairAId) ? pairAId : (activeFields[0]?.id ?? '');
  const groupOfA = crossField.fieldGroupIndex[resolvedAId];
  const defaultBField =
    activeFields.find(
      (f) => f.id !== resolvedAId && crossField.fieldGroupIndex[f.id] !== groupOfA,
    ) ?? activeFields.find((f) => f.id !== resolvedAId);
  const resolvedBId =
    activeFields.some((f) => f.id === pairBId && f.id !== resolvedAId)
      ? pairBId
      : (defaultBField?.id ?? '');
  const resolvedPairAlgo = selectedAlgorithms.includes(pairAlgo)
    ? pairAlgo
    : selectedAlgorithms.includes('SHA-256')
      ? 'SHA-256'
      : (selectedAlgorithms[0] ?? 'SHA-256');

  const pairFieldA = activeFields.find((f) => f.id === resolvedAId) ?? null;
  const pairFieldB = activeFields.find((f) => f.id === resolvedBId) ?? null;

  const pairDigestA = pairFieldA?.digests[resolvedPairAlgo] ?? '';
  const pairDigestB = pairFieldB?.digests[resolvedPairAlgo] ?? '';
  const pairDiff =
    pairDigestA && pairDigestB ? buildDigestDiff(pairDigestA, pairDigestB) : null;
  const pairIdentical = Boolean(pairDigestA && pairDigestB && pairDigestA.toLowerCase() === pairDigestB.toLowerCase());

  // On verifier mismatch, pick the first active field with a candidate algorithm for a character-level diff
  const mismatchComparison = React.useMemo(() => {
    if (verification.status !== 'mismatch' || !verification.parsed.hexLower) return null;
    for (const algo of verification.parsed.candidateAlgorithms) {
      if (!selectedAlgorithms.includes(algo)) continue;
      for (const field of activeFields) {
        const computed = field.digests[algo];
        if (!computed) continue;
        const expectedDisplay =
          encoding === 'base64'
            ? verification.parsed.format === 'base64'
              ? verification.parsed.cleaned
              : verification.parsed.hexLower
            : encoding === 'hex-upper'
              ? verification.parsed.hexLower.toUpperCase()
              : verification.parsed.hexLower;
        const computedDisplay =
          encoding === 'base64' && verification.parsed.format !== 'base64'
            ? computed
            : computed;
        if (expectedDisplay.length === computedDisplay.length) {
          return {
            fieldLabel: field.label,
            algo,
            diff: buildDigestDiff(expectedDisplay, computedDisplay),
          };
        }
      }
    }
    return null;
  }, [verification, selectedAlgorithms, activeFields, encoding]);

  const matchListText = React.useMemo(() => {
    return verification.matches.map((m) => `${m.fieldLabel} (${m.algorithm})`).join(', ');
  }, [verification.matches]);

  return (
    <section className={styles.card} aria-label={t('hash.verifier.title')}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{t('hash.verifier.title')}</h2>
      </div>

      <div className={styles.verifyGrid}>
        {/* Left: Dedicated Expected Hash Verifier */}
        <div className={styles.verifyCol}>
          <label htmlFor={inputId} className={styles.fieldLabel}>
            {t('hash.verifier.expectedLabel')}
          </label>
          <div className={styles.expectedRow}>
            <input
              id={inputId}
              type="text"
              className={styles.expectedInput}
              value={expectedHash}
              onChange={(e) => onExpectedHashChange(e.target.value)}
              placeholder={t('hash.verifier.expectedPlaceholder')}
              spellCheck={false}
              autoComplete="off"
            />
            {expectedHash.length > 0 && (
              <button
                type="button"
                className={styles.buttonSmall}
                onClick={() => onExpectedHashChange('')}
                aria-label={t('hash.verifier.clear')}
              >
                {t('hash.verifier.clear')}
              </button>
            )}
          </div>

          {verification.status === 'idle' ? (
            <p className={styles.mutedNote} style={{ margin: 0 }}>
              {t('hash.verifier.pasteHint')}
            </p>
          ) : (
            <>
              {verification.parsed.bitLength !== null && (
                <div className={styles.metaLine}>
                  <span>
                    {t('hash.verifier.detected', {
                      bits: verification.parsed.bitLength,
                      format: verification.parsed.format.toUpperCase(),
                      algos: verification.parsed.candidateAlgorithms.join(' / '),
                    })}
                  </span>
                  {verification.parsed.extractedFilename && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {t('hash.verifier.extractedFile', { name: verification.parsed.extractedFilename })}
                      </span>
                    </>
                  )}
                  {verification.missingCandidateAlgorithms.length > 0 && (
                    <button
                      type="button"
                      className={styles.presetBtn}
                      onClick={() => onEnableAlgorithms(verification.missingCandidateAlgorithms)}
                    >
                      {t('hash.verifier.enableCandidates', {
                        algos: verification.missingCandidateAlgorithms.join(', '),
                      })}
                    </button>
                  )}
                </div>
              )}

              <div
                className={[
                  styles.verdictBox,
                  verification.status === 'match'
                    ? styles.verdictMatch
                    : verification.status === 'mismatch'
                      ? styles.verdictMismatch
                      : verification.status === 'invalid'
                        ? styles.verdictWarn
                        : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="status"
                aria-live="polite"
                data-testid="verifier-status"
                data-status={verification.status}
              >
                <div className={styles.verdictHeadline}>
                  {verification.status === 'match' && (
                    <>
                      <span className={styles.statusGoodText}>
                        <CheckCircleIcon />
                      </span>
                      <span className={styles.statusGoodText}>{t('hash.verifier.statusMatch')}</span>
                    </>
                  )}
                  {verification.status === 'mismatch' && (
                    <>
                      <span className={styles.statusBadText}>
                        <XCircleIcon />
                      </span>
                      <span className={styles.statusBadText}>{t('hash.verifier.statusMismatch')}</span>
                    </>
                  )}
                  {verification.status === 'invalid' && (
                    <>
                      <span className={styles.statusWarnText}>
                        <InfoCircleIcon />
                      </span>
                      <span className={styles.statusWarnText}>{t('hash.verifier.statusInvalid')}</span>
                    </>
                  )}
                  {verification.status === 'waiting' && (
                    <>
                      <InfoCircleIcon />
                      <span>{t('hash.verifier.statusWaiting')}</span>
                    </>
                  )}
                </div>

                {verification.status === 'match' && (
                  <p className={styles.verdictSub}>
                    {t('hash.verifier.matchDetail', { list: matchListText })}
                  </p>
                )}
                {verification.status === 'mismatch' && (
                  <p className={styles.verdictSub}>
                    {t('hash.verifier.mismatchDetail', { count: activeFields.length })}
                  </p>
                )}
              </div>

              {mismatchComparison && (
                <div className={styles.diffBlock}>
                  <div className={styles.diffHeader}>
                    <span>
                      {t('hash.verifier.diffTitle', {
                        field: mismatchComparison.fieldLabel,
                        algo: mismatchComparison.algo,
                      })}
                    </span>
                    <span className={styles.monoNum}>
                      {t('hash.verifier.diffStats', {
                        same: mismatchComparison.diff.matchingChars,
                        total: mismatchComparison.diff.totalChars,
                      })}
                    </span>
                  </div>
                  <div className={styles.diffLine}>
                    <span className={styles.diffTag}>{t('hash.verifier.diffExpected')}</span>
                    <DiffSegmentsView segments={mismatchComparison.diff.segmentsA} />
                  </div>
                  <div className={styles.diffLine}>
                    <span className={styles.diffTag}>{t('hash.verifier.diffComputed')}</span>
                    <DiffSegmentsView segments={mismatchComparison.diff.segmentsB} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Cross-Field Comparison & Pairwise Diff */}
        <div className={styles.compareCol}>
          <span className={styles.fieldLabel}>{t('hash.compare.title')}</span>

          {activeFields.length < 2 ? (
            <p className={styles.mutedNote} style={{ margin: 0 }}>
              {t('hash.compare.needTwo')}
            </p>
          ) : (
            <>
              <div
                className={[
                  styles.verdictBox,
                  crossField.allIdentical ? styles.verdictMatch : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="status"
                aria-live="polite"
                data-testid="crossfield-summary"
              >
                <div className={styles.verdictHeadline}>
                  {crossField.allIdentical ? (
                    <>
                      <span className={styles.statusGoodText}>
                        <CheckCircleIcon />
                      </span>
                      <span className={styles.statusGoodText}>
                        {t('hash.compare.allMatch', { count: activeFields.length })}
                      </span>
                    </>
                  ) : crossField.allDistinct ? (
                    <>
                      <InfoCircleIcon />
                      <span>{t('hash.compare.allDiffer', { count: activeFields.length })}</span>
                    </>
                  ) : (
                    <>
                      <InfoCircleIcon />
                      <span>
                        {t('hash.compare.grouped', {
                          count: activeFields.length,
                          groups: crossField.groups.length,
                        })}
                      </span>
                    </>
                  )}
                </div>

                {!crossField.allIdentical && !crossField.allDistinct && (
                  <ul className={styles.groupList}>
                    {crossField.groups.map((grp) => (
                      <li key={grp.groupIndex} className={styles.groupItem}>
                        <span className={styles.groupIndex}>
                          {t('hash.compare.groupLabel', { n: grp.groupIndex + 1 })}
                        </span>
                        <span>{grp.fieldLabels.join(' = ')}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {pairFieldA && pairFieldB && (
                <div className={styles.diffBlock}>
                  <div className={styles.pairControls}>
                    <select
                      className={styles.select}
                      value={resolvedAId}
                      onChange={(e) => setPairAId(e.target.value)}
                      aria-label={t('hash.compare.fieldA')}
                    >
                      {activeFields.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <span className={styles.mutedNote} aria-hidden="true">vs</span>
                    <select
                      className={styles.select}
                      value={resolvedBId}
                      onChange={(e) => setPairBId(e.target.value)}
                      aria-label={t('hash.compare.fieldB')}
                    >
                      {activeFields
                        .filter((f) => f.id !== resolvedAId)
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                    </select>
                    <select
                      className={styles.select}
                      value={resolvedPairAlgo}
                      onChange={(e) => setPairAlgo(e.target.value as HashAlgorithmId)}
                      aria-label={t('hash.compare.algorithm')}
                    >
                      {selectedAlgorithms.map((algo) => (
                        <option key={algo} value={algo}>
                          {algo}
                        </option>
                      ))}
                    </select>
                  </div>

                  {pairDiff && (
                    <>
                      <div className={styles.diffHeader}>
                        <span className={pairIdentical ? styles.statusGoodText : styles.statusBadText}>
                          {pairIdentical
                            ? t('hash.compare.pairIdentical', { algo: resolvedPairAlgo })
                            : t('hash.compare.pairDifferent', { algo: resolvedPairAlgo })}
                        </span>
                        <span className={styles.monoNum}>
                          {t('hash.verifier.diffStats', {
                            same: pairDiff.matchingChars,
                            total: pairDiff.totalChars,
                          })}
                        </span>
                      </div>
                      <div className={styles.diffLine}>
                        <span className={styles.diffTag}>{pairFieldA.label}</span>
                        <DiffSegmentsView segments={pairDiff.segmentsA} />
                      </div>
                      <div className={styles.diffLine}>
                        <span className={styles.diffTag}>{pairFieldB.label}</span>
                        <DiffSegmentsView segments={pairDiff.segmentsB} />
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
