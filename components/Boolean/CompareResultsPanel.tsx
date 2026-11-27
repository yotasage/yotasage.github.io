import { useMemo, useState } from 'react';

import {
  exportCompareCsv,
  formatCounterexampleText,
  type CompareRow,
  type CompareSuccess,
} from '../../lib/boolean/compare';
import { varToLatex } from '../../lib/boolean/parse';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Boolean.module.css';
import cStyles from '../../styles/BooleanCompare.module.css';
import dStyles from '../../styles/BooleanDiagrams.module.css';
import KatexSpan from '../KatexSpan';
import { TableSelectionBar, useTableSelection } from './useTableSelection';

const MAX_TABLE_ROWS = 64;

export interface CompareResultsPanelProps {
  readonly result: CompareSuccess;
  readonly labelA?: string;
  readonly labelB?: string;
  readonly onOpenInSimplifier?: (expr: string) => void;
}

export default function CompareResultsPanel({
  result,
  labelA,
  labelB,
  onOpenInSimplifier,
}: CompareResultsPanelProps) {
  const { t } = useI18n();
  const [filterMode, setFilterMode] = useState<'all' | 'mismatches'>('all');
  const [copiedCsv, setCopiedCsv] = useState(false);

  const effectiveLabelA = labelA ?? result.sourceA.label;
  const effectiveLabelB = labelB ?? result.sourceB.label;

  const effectiveFilter: 'all' | 'mismatches' =
    result.mismatchCount === 0 && filterMode === 'mismatches' ? 'all' : filterMode;

  const filteredRows = useMemo(() => {
    if (effectiveFilter === 'mismatches') {
      return result.rows.filter((r) => r.status === 'missing' || r.status === 'extra');
    }
    return result.rows;
  }, [result.rows, effectiveFilter]);

  const visibleRows = useMemo(() => filteredRows.slice(0, MAX_TABLE_ROWS), [filteredRows]);
  const isTruncated = filteredRows.length > MAX_TABLE_ROWS;

  const statusText = (row: CompareRow): string => {
    switch (row.status) {
      case 'match':
        return `✓ ${t('boolean.compare.table.statusMatch')}`;
      case 'missing':
        return `− ${t('boolean.compare.table.statusMissing')}`;
      case 'extra':
        return `+ ${t('boolean.compare.table.statusExtra')}`;
      case 'dont-care':
        return `× ${t('boolean.compare.table.statusDC')}`;
    }
  };

  const tableGrid = useMemo<readonly (readonly string[])[]>(() => {
    const header = [
      '#',
      ...result.variables,
      effectiveLabelA,
      effectiveLabelB,
      t('boolean.compare.table.colStatus'),
    ];
    const body = visibleRows.map((row) => [
      String(row.index),
      ...result.variables.map((v) => String(row.inputs[v] ?? 0)),
      String(row.valA),
      String(row.valB),
      statusText(row),
    ]);
    return [header, ...body];
  }, [result.variables, effectiveLabelA, effectiveLabelB, visibleRows, t]);

  const selection = useTableSelection(tableGrid);

  const verdictHeading = (() => {
    switch (result.relation) {
      case 'equivalent':
        return t('boolean.compare.verdict.equivalent');
      case 'complement':
        return t('boolean.compare.verdict.complement');
      case 'a-implies-b':
        return t('boolean.compare.verdict.aImpliesB');
      case 'b-implies-a':
        return t('boolean.compare.verdict.bImpliesA');
      case 'different':
        return t('boolean.compare.verdict.notEquivalent');
    }
  })();

  const verdictExplain = (() => {
    switch (result.relation) {
      case 'equivalent':
        return result.dontCareRows > 0
          ? t('boolean.compare.explain.equivalentWithDC', {
              checked: result.checkedRows,
              dc: result.dontCareRows,
            })
          : t('boolean.compare.explain.equivalent', { checked: result.checkedRows });
      case 'complement':
        return t('boolean.compare.explain.complement');
      case 'a-implies-b':
        return t('boolean.compare.explain.aImpliesB', { extra: result.extraCount });
      case 'b-implies-a':
        return t('boolean.compare.explain.bImpliesA', { missing: result.missingCount });
      case 'different':
        return t('boolean.compare.explain.different', {
          mismatches: result.mismatchCount,
          checked: result.checkedRows,
          missing: result.missingCount,
          extra: result.extraCount,
        });
    }
  })();

  const handleCopyCsv = async () => {
    try {
      await navigator.clipboard.writeText(exportCompareCsv(result));
      setCopiedCsv(true);
      window.setTimeout(() => setCopiedCsv(false), 1500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const bIsAlreadyMinimal =
    result.equivalent &&
    result.sourceB.metrics &&
    result.minimalReference &&
    result.sourceB.metrics.literals <= result.minimalReference.metrics.literals &&
    result.sourceB.metrics.gates <= result.minimalReference.metrics.gates;

  const canSimplifyFurther =
    result.equivalent &&
    result.sourceB.metrics &&
    result.minimalReference &&
    (result.minimalReference.metrics.literals < result.sourceB.metrics.literals ||
      (result.minimalReference.metrics.literals === result.sourceB.metrics.literals &&
        result.minimalReference.metrics.gates < result.sourceB.metrics.gates));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.05rem', minWidth: 0 }}>
      {/* Verdict Card */}
      <section
        className={[
          cStyles.verdictCard,
          result.equivalent ? cStyles.verdictEquivalent : cStyles.verdictMismatch,
        ].join(' ')}
        role="status"
        aria-live="polite"
        data-testid="compare-verdict"
        data-equivalent={result.equivalent ? 'true' : 'false'}
        data-relation={result.relation}
      >
        <div className={cStyles.verdictTop}>
          <div className={cStyles.verdictLeadBlock}>
            <span
              className={[
                cStyles.verdictIcon,
                result.equivalent ? cStyles.verdictIconOk : cStyles.verdictIconBad,
              ].join(' ')}
              aria-hidden="true"
            >
              {result.equivalent ? '✓' : '✕'}
            </span>
            <div style={{ minWidth: 0 }}>
              <h2 className={cStyles.verdictHeading}>{verdictHeading}</h2>
              <p className={cStyles.verdictExplain}>{verdictExplain}</p>
            </div>
          </div>

          {onOpenInSimplifier && result.sourceA.kind === 'expression' && (
            <button
              type="button"
              className={[styles.btn, styles.btnSmall].join(' ')}
              onClick={() => onOpenInSimplifier(result.sourceA.text)}
              data-testid="compare-open-simplifier-btn"
            >
              {t('boolean.compare.openInSimplifier')}
            </button>
          )}
        </div>

        <div className={cStyles.verdictMetrics}>
          <span className={styles.metricItem}>
            <span className={styles.metricLabel}>{t('boolean.compare.stat.agreement')}:</span>
            <span className={styles.metricVal}>
              {t('boolean.compare.stat.rowsMatched', {
                matched: result.matchCount,
                checked: result.checkedRows,
                pct: result.agreementPercent,
              })}
            </span>
          </span>

          {result.mismatchCount > 0 && (
            <span className={styles.metricItem}>
              <span className={styles.metricLabel}>{t('boolean.compare.stat.mismatches')}:</span>
              <span className={styles.verifyBad}>{result.mismatchCount}</span>
            </span>
          )}

          {result.dontCareRows > 0 && (
            <span className={styles.metricItem}>
              <span className={styles.metricLabel}>{t('boolean.compare.stat.dontCares')}:</span>
              <span className={styles.metricVal}>{result.dontCareRows}</span>
            </span>
          )}

          {result.sourceA.metrics && result.sourceB.metrics && (
            <span className={styles.metricItem}>
              <span className={styles.metricLabel}>{t('boolean.compare.stat.complexity')}:</span>
              <span className={styles.metricVal}>
                {t('boolean.compare.stat.complexityVal', {
                  gA: result.sourceA.metrics.gates,
                  gB: result.sourceB.metrics.gates,
                  lA: result.sourceA.metrics.literals,
                  lB: result.sourceB.metrics.literals,
                })}
              </span>
            </span>
          )}

          {bIsAlreadyMinimal && (
            <span className={styles.verifyOk}>✓ {t('boolean.compare.stat.alreadyMinimal')}</span>
          )}

          {canSimplifyFurther && result.minimalReference && (
            <span className={styles.metricItem}>
              <span className={styles.metricLabel}>{t('boolean.compare.stat.canSimplify')}:</span>
              <KatexSpan text={result.minimalReference.latex} />
            </span>
          )}
        </div>

        {/* Variable mismatch advisory */}
        {(result.onlyInA.length > 0 || result.onlyInB.length > 0) && (
          <div className={cStyles.varWarnBanner} data-testid="compare-var-warning">
            <span className={cStyles.varWarnTitle}>{t('boolean.compare.varWarn.title')}</span>
            <span>
              {[
                result.onlyInA.length > 0
                  ? t('boolean.compare.varWarn.onlyA', { vars: result.onlyInA.join(', ') })
                  : '',
                result.onlyInB.length > 0
                  ? t('boolean.compare.varWarn.onlyB', { vars: result.onlyInB.join(', ') })
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <span>
              {result.dependMismatch
                ? t('boolean.compare.varWarn.typoHint')
                : t('boolean.compare.varWarn.vacuousHint')}
            </span>
          </div>
        )}

        {/* Diagnostic breakdown when not equivalent */}
        {!result.equivalent && (
          <div className={cStyles.diagGrid} data-testid="compare-diagnostics">
            {result.firstCounterexample && (
              <div className={cStyles.diagBox}>
                <span className={cStyles.diagLabel}>{t('boolean.compare.diag.counterexample')}</span>
                <div className={cStyles.diagValue} data-testid="compare-first-counterexample">
                  {formatCounterexampleText(result.firstCounterexample, result.variables)}
                </div>
                <span className={cStyles.diagSub}>
                  {t('boolean.compare.diag.counterexampleDetail', {
                    labelA: effectiveLabelA,
                    labelB: effectiveLabelB,
                    valA: String(result.firstCounterexample.valA),
                    valB: String(result.firstCounterexample.valB),
                    row: result.firstCounterexample.index,
                  })}
                </span>
              </div>
            )}

            {result.diffFormula && (
              <div className={cStyles.diagBox}>
                <span className={cStyles.diagLabel}>
                  <span>{t('boolean.compare.diag.diffExpr')}</span>
                  {onOpenInSimplifier && (
                    <button
                      type="button"
                      className={styles.ruleJumpBtn}
                      onClick={() => onOpenInSimplifier(result.diffFormula!.text)}
                    >
                      {t('boolean.compare.diag.simplifyDiff')}
                    </button>
                  )}
                </span>
                <div className={cStyles.diagValue}>
                  <KatexSpan text={result.diffFormula.latex} />
                </div>
                <span className={cStyles.diagSub}>
                  Σm({result.diffFormula.minterms.slice(0, 10).join(', ')}
                  {result.diffFormula.minterms.length > 10 ? ', …' : ''})
                </span>
              </div>
            )}

            {result.missingFormula && (
              <div className={cStyles.diagBox}>
                <span className={cStyles.diagLabel}>{t('boolean.compare.diag.missingExpr')}</span>
                <div className={cStyles.diagValue}>
                  <KatexSpan text={result.missingFormula.latex} />
                </div>
                <span className={cStyles.diagSub}>
                  Σm({result.missingFormula.minterms.slice(0, 10).join(', ')}
                  {result.missingFormula.minterms.length > 10 ? ', …' : ''})
                </span>
              </div>
            )}

            {result.extraFormula && (
              <div className={cStyles.diagBox}>
                <span className={cStyles.diagLabel}>{t('boolean.compare.diag.extraExpr')}</span>
                <div className={cStyles.diagValue}>
                  <KatexSpan text={result.extraFormula.latex} />
                </div>
                <span className={cStyles.diagSub}>
                  Σm({result.extraFormula.minterms.slice(0, 10).join(', ')}
                  {result.extraFormula.minterms.length > 10 ? ', …' : ''})
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Truth Table Diff + Diff K-Map (2-4 vars) */}
      <div className={result.diffKMap ? cStyles.analysisSplit : cStyles.analysisSingle}>
        {/* Diff Truth Table */}
        <section className={dStyles.sectionCard} aria-label={t('boolean.compare.table.title')}>
          <div className={dStyles.sectionToolbar}>
            <div className={styles.stepsTitleGroup}>
              <h3 className={styles.cardTitle}>{t('boolean.compare.table.title')}</h3>
              <span className={styles.metaInline}>
                {result.totalRows} rows
                {result.mismatchCount > 0 ? ` · ${result.mismatchCount} diff` : ''}
              </span>
            </div>

            <div className={styles.btnRow}>
              <div className={styles.segmented} role="group" aria-label={t('boolean.compare.table.title')}>
                <button
                  type="button"
                  aria-pressed={effectiveFilter === 'all'}
                  className={[
                    styles.segBtn,
                    effectiveFilter === 'all' ? styles.segBtnActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setFilterMode('all')}
                  data-testid="compare-filter-all"
                >
                  {t('boolean.compare.table.filterAll', { count: result.totalRows })}
                </button>
                <button
                  type="button"
                  aria-pressed={effectiveFilter === 'mismatches'}
                  disabled={result.mismatchCount === 0}
                  className={[
                    styles.segBtn,
                    effectiveFilter === 'mismatches' ? styles.segBtnActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setFilterMode('mismatches')}
                  data-testid="compare-filter-mismatches"
                >
                  {t('boolean.compare.table.filterMismatches', { count: result.mismatchCount })}
                </button>
              </div>

              <button
                type="button"
                className={[styles.btnGhost, styles.btnSmall].join(' ')}
                onClick={handleCopyCsv}
              >
                {copiedCsv ? t('boolean.compare.table.copied') : t('boolean.compare.table.copyCsv')}
              </button>
              <button
                type="button"
                className={[styles.btnGhost, styles.btnSmall].join(' ')}
                onClick={() => {
                  void selection.copyAll();
                }}
              >
                {selection.copiedState === 'all'
                  ? t('boolean.table.copiedExcel')
                  : t('boolean.table.copyExcel')}
              </button>
            </div>
          </div>

          <div className={dStyles.sectionBody}>
            {visibleRows.length === 0 ? (
              <p className={styles.metaInline}>{t('boolean.compare.table.noMismatches')}</p>
            ) : (
              <div
                ref={selection.containerRef}
                tabIndex={0}
                onKeyDown={selection.onKeyDown}
                className={dStyles.selectableBox}
              >
                <div className={dStyles.tableWrap}>
                  <table
                    className={[dStyles.truthTable, dStyles.selectableTable].join(' ')}
                    data-testid="compare-diff-table"
                  >
                    <thead>
                      <tr>
                        <th
                          {...selection.getCellProps(0, 0)}
                          className={selection.getCellClassName(0, 0, dStyles.rowIdx)}
                        >
                          #
                        </th>
                        {result.variables.map((v, vIdx) => (
                          <th
                            key={v}
                            {...selection.getCellProps(0, 1 + vIdx)}
                            className={selection.getCellClassName(0, 1 + vIdx, '')}
                          >
                            <KatexSpan text={varToLatex(v)} />
                          </th>
                        ))}
                        <th
                          {...selection.getCellProps(0, 1 + result.variables.length)}
                          className={selection.getCellClassName(
                            0,
                            1 + result.variables.length,
                            [dStyles.colSep, dStyles.thOutput].join(' '),
                          )}
                        >
                          {effectiveLabelA}
                        </th>
                        <th
                          {...selection.getCellProps(0, 2 + result.variables.length)}
                          className={selection.getCellClassName(
                            0,
                            2 + result.variables.length,
                            dStyles.thOutput,
                          )}
                        >
                          {effectiveLabelB}
                        </th>
                        <th
                          {...selection.getCellProps(0, 3 + result.variables.length)}
                          className={selection.getCellClassName(
                            0,
                            3 + result.variables.length,
                            dStyles.colSep,
                          )}
                        >
                          {t('boolean.compare.table.colStatus')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row, rIdx) => {
                        const gridRow = rIdx + 1;
                        const trCls =
                          row.status === 'missing'
                            ? cStyles.rowMissing
                            : row.status === 'extra'
                              ? cStyles.rowExtra
                              : row.status === 'dont-care'
                                ? cStyles.rowDC
                                : '';
                        const colA = 1 + result.variables.length;
                        const colB = 2 + result.variables.length;
                        const colStatus = 3 + result.variables.length;

                        return (
                          <tr key={row.index} className={trCls} data-status={row.status}>
                            <td
                              {...selection.getCellProps(gridRow, 0)}
                              className={selection.getCellClassName(gridRow, 0, dStyles.rowIdx)}
                            >
                              {row.index}
                            </td>
                            {result.variables.map((v, vIdx) => {
                              const bit = row.inputs[v] ?? 0;
                              return (
                                <td
                                  key={v}
                                  {...selection.getCellProps(gridRow, 1 + vIdx)}
                                  className={selection.getCellClassName(
                                    gridRow,
                                    1 + vIdx,
                                    bit === 1 ? dStyles.valOne : dStyles.valZero,
                                  )}
                                >
                                  {bit}
                                </td>
                              );
                            })}
                            <td
                              {...selection.getCellProps(gridRow, colA)}
                              className={selection.getCellClassName(
                                gridRow,
                                colA,
                                [
                                  dStyles.colSep,
                                  row.valA === 1 ? dStyles.valOne : dStyles.valZero,
                                ].join(' '),
                              )}
                            >
                              {row.valA}
                            </td>
                            <td
                              {...selection.getCellProps(gridRow, colB)}
                              className={selection.getCellClassName(
                                gridRow,
                                colB,
                                row.valB === 1 ? dStyles.valOne : dStyles.valZero,
                              )}
                            >
                              {row.valB}
                            </td>
                            <td
                              {...selection.getCellProps(gridRow, colStatus)}
                              className={selection.getCellClassName(
                                gridRow,
                                colStatus,
                                dStyles.colSep,
                              )}
                            >
                              <span
                                className={
                                  row.status === 'match'
                                    ? cStyles.statusTextOk
                                    : row.status === 'missing'
                                      ? cStyles.statusTextMissing
                                      : row.status === 'extra'
                                        ? cStyles.statusTextExtra
                                        : cStyles.statusTextDC
                                }
                              >
                                {statusText(row)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <TableSelectionBar selection={selection} />
              </div>
            )}

            {isTruncated && (
              <p className={styles.metaInline}>
                {t('boolean.compare.table.truncated', {
                  shown: MAX_TABLE_ROWS,
                  total: filteredRows.length,
                })}
              </p>
            )}
          </div>
        </section>

        {/* Visual Difference K-Map (2-4 variables) */}
        {result.diffKMap && (
          <section className={dStyles.sectionCard} aria-label={t('boolean.compare.kmap.title')}>
            <div className={dStyles.sectionToolbar}>
              <h3 className={styles.cardTitle}>{t('boolean.compare.kmap.title')}</h3>
            </div>
            <div className={dStyles.sectionBody}>
              <p className={styles.metaInline}>{t('boolean.compare.kmap.hint')}</p>
              <div style={{ overflowX: 'auto' }}>
                <table className={cStyles.kmapGrid} data-testid="compare-diff-kmap">
                  <thead>
                    <tr>
                      <th className={cStyles.kmapCorner}>
                        {result.diffKMap.rowVars.join('')} \ {result.diffKMap.colVars.join('')}
                      </th>
                      {result.diffKMap.colLabels.map((lbl) => (
                        <th key={lbl} className={cStyles.kmapHeader}>
                          {lbl}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.diffKMap.rowGray.map((rCode, rIdx) => {
                      const colBits = result.diffKMap!.colVars.length;
                      return (
                        <tr key={rCode}>
                          <th className={cStyles.kmapHeader}>
                            {result.diffKMap!.rowLabels[rIdx]}
                          </th>
                          {result.diffKMap!.colGray.map((cCode) => {
                            const minterm = (rCode << colBits) | cCode;
                            const cell = result.diffKMap!.cells[minterm];
                            if (!cell) return <td key={cCode} className={cStyles.kmapCell} />;
                            const cellCls =
                              cell.status === 'missing'
                                ? cStyles.kmapCellMissing
                                : cell.status === 'extra'
                                  ? cStyles.kmapCellExtra
                                  : cell.status === 'dont-care'
                                    ? cStyles.kmapCellDC
                                    : cell.valA === 1
                                      ? cStyles.kmapCellMatch1
                                      : cStyles.kmapCellMatch0;
                            const glyph =
                              cell.status === 'missing'
                                ? '− (1→0)'
                                : cell.status === 'extra'
                                  ? '+ (0→1)'
                                  : cell.status === 'dont-care'
                                    ? 'X'
                                    : String(cell.valA);
                            return (
                              <td
                                key={cCode}
                                className={[cStyles.kmapCell, cellCls].join(' ')}
                                title={`m${minterm}: ${formatCounterexampleText(cell, result.variables)} — A=${cell.valA}, B=${cell.valB}`}
                              >
                                <span className={cStyles.kmapCellVal}>{glyph}</span>
                                <span className={cStyles.kmapCellIdx}>m{minterm}</span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className={cStyles.kmapLegend}>
                <span className={cStyles.kmapLegendItem}>
                  <span className={[cStyles.kmapSwatch, cStyles.kmapCellMatch1].join(' ')} />
                  {t('boolean.compare.kmap.legendMatch')}
                </span>
                <span className={cStyles.kmapLegendItem}>
                  <span className={[cStyles.kmapSwatch, cStyles.kmapCellMissing].join(' ')} />
                  {t('boolean.compare.kmap.legendMissing')}
                </span>
                <span className={cStyles.kmapLegendItem}>
                  <span className={[cStyles.kmapSwatch, cStyles.kmapCellExtra].join(' ')} />
                  {t('boolean.compare.kmap.legendExtra')}
                </span>
                {result.dontCareRows > 0 && (
                  <span className={cStyles.kmapLegendItem}>
                    <span className={[cStyles.kmapSwatch, cStyles.kmapCellDC].join(' ')} />
                    {t('boolean.compare.kmap.legendDC')}
                  </span>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
