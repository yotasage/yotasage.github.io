import { useEffect, useMemo, useState } from 'react';

import { toLatex, toPlainText, toVerilog, toVhdl, varToLatex } from '../../lib/boolean/parse';
import { exportKMapLatex, formatKMapCornerVars } from '../../lib/boolean/qm';
import type { SimplifySuccess } from '../../lib/boolean/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Boolean.module.css';
import dStyles from '../../styles/BooleanDiagrams.module.css';
import KatexSpan from '../KatexSpan';
import { TableSelectionBar, useTableSelection } from './useTableSelection';

const GROUP_COLORS = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#db2777',
  '#7c3aed',
  '#0891b2',
];

export interface KMapAndExtrasProps {
  readonly results: readonly SimplifySuccess[];
  readonly explicitAnd: boolean;
  readonly selectedRowIndex: number | null;
  readonly onSelectRow: (minterm: number) => void;
  readonly onOpenKMapGuide?: () => void;
}

function SingleOutputKMapAndCanonical({
  result,
  selectedRowIndex,
  onSelectRow,
  showHdlInside,
  hdlBlock,
}: {
  result: SimplifySuccess;
  selectedRowIndex: number | null;
  onSelectRow: (minterm: number) => void;
  showHdlInside: boolean;
  hdlBlock: React.ReactNode;
}) {
  const { t } = useI18n();
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [copiedLatex, setCopiedLatex] = useState(false);
  const { outputName, canonical, kmap } = result;
  const activeGroup = kmap?.groups.find((g) => g.id === hoveredGroupId) ?? null;

  const kmapGrid = useMemo<readonly (readonly string[])[]>(() => {
    if (!kmap) return [];
    const corner = `${formatKMapCornerVars(kmap.rowVars)} \\ ${formatKMapCornerVars(kmap.colVars)}`;
    const header = [corner, ...kmap.colLabels];
    const rows = kmap.rowGray.map((rBits, rIdx) => [
      kmap.rowLabels[rIdx],
      ...kmap.colGray.map((cBits) => {
        const minterm = (rBits << kmap.colVars.length) | cBits;
        return String(kmap.values[minterm] ?? 0);
      }),
    ]);
    return [header, ...rows];
  }, [kmap]);

  const selection = useTableSelection(kmapGrid);

  const copyKmapLatex = async () => {
    if (!kmap) return;
    try {
      await navigator.clipboard.writeText(exportKMapLatex(kmap));
      setCopiedLatex(true);
      window.setTimeout(() => setCopiedLatex(false), 1500);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div
      className={kmap ? dStyles.dualGrid : dStyles.singleGrid}
      data-testid={`kmap-output-panel-${outputName}`}
    >
      {kmap && (
        <div className={dStyles.subPane}>
          <div className={dStyles.subPaneHead}>
            <div className={styles.stepsTitleGroup}>
              <h3 className={dStyles.subPaneTitle}>
                {t('boolean.extras.kmapTitle')} ({outputName})
              </h3>
              <span className={styles.metaInline}>
                Σm({canonical.minterms.slice(0, 10).join(', ')}
                {canonical.minterms.length > 10 ? ', …' : ''})
              </span>
            </div>
            <div className={styles.btnRow}>
              <button
                type="button"
                className={[styles.btn, styles.btnSmall].join(' ')}
                onClick={() => void selection.copyAll()}
                data-testid={`kmap-copy-excel-${outputName}`}
              >
                {selection.copiedState === 'all'
                  ? t('boolean.table.copiedExcel')
                  : t('boolean.table.copyExcel')}
              </button>
              <button
                type="button"
                className={[styles.btn, styles.btnSmall].join(' ')}
                onClick={() => void copyKmapLatex()}
                data-testid={`kmap-copy-latex-${outputName}`}
              >
                {copiedLatex ? t('boolean.result.copied') : t('boolean.kmap.copyLatex')}
              </button>
            </div>
          </div>
          <p className={dStyles.hintText}>{t('boolean.extras.kmapHint')}</p>
          <div className={dStyles.kmapGridWrap}>
            <div
              ref={selection.containerRef}
              tabIndex={0}
              onKeyDown={selection.onKeyDown}
              className={dStyles.kmapTableStack}
            >
              <table
                className={[dStyles.kmapTable, dStyles.selectableTable].join(' ')}
                aria-label={t('boolean.kmap.mapAria', { name: outputName })}
              >
                <thead>
                  <tr>
                    <th
                      {...selection.getCellProps(0, 0)}
                      className={selection.getCellClassName(0, 0, dStyles.kmapCorner)}
                    >
                      {formatKMapCornerVars(kmap.rowVars)} \ {formatKMapCornerVars(kmap.colVars)}
                    </th>
                    {kmap.colLabels.map((lbl, cIdx) => (
                      <th
                        key={lbl}
                        {...selection.getCellProps(0, cIdx + 1)}
                        className={selection.getCellClassName(0, cIdx + 1, dStyles.kmapHeader)}
                      >
                        {lbl}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {kmap.rowGray.map((rBits, rIdx) => (
                    <tr key={kmap.rowLabels[rIdx]}>
                      <th
                        {...selection.getCellProps(rIdx + 1, 0)}
                        className={selection.getCellClassName(rIdx + 1, 0, dStyles.kmapHeader)}
                      >
                        {kmap.rowLabels[rIdx]}
                      </th>
                      {kmap.colGray.map((cBits, cIdx) => {
                        const minterm = (rBits << kmap.colVars.length) | cBits;
                        const val = kmap.values[minterm] ?? 0;
                        const coveringGroups = kmap.groups.filter((g) =>
                          g.cells.includes(minterm),
                        );
                        const isHovered = activeGroup?.cells.includes(minterm) ?? false;
                        const isSelected = selectedRowIndex === minterm;
                        const firstColor =
                          coveringGroups.length > 0
                            ? GROUP_COLORS[coveringGroups[0].colorIndex]
                            : undefined;
                        const cellBg =
                          isHovered && activeGroup
                            ? `${GROUP_COLORS[activeGroup.colorIndex]}30`
                            : firstColor
                              ? `${firstColor}16`
                              : undefined;
                        const cellOutline = isSelected
                          ? '2px solid var(--ds-accent)'
                          : isHovered && activeGroup
                            ? `2px solid ${GROUP_COLORS[activeGroup.colorIndex]}`
                            : undefined;
                        return (
                          <td
                            key={`${rIdx}-${cIdx}`}
                            {...selection.getCellProps(rIdx + 1, cIdx + 1)}
                            className={selection.getCellClassName(
                              rIdx + 1,
                              cIdx + 1,
                              dStyles.kmapCell,
                            )}
                            style={{ backgroundColor: cellBg, outline: cellOutline, outlineOffset: -2 }}
                          >
                            <button
                              type="button"
                              data-sel-cell-btn="1"
                              className={dStyles.kmapCellBtn}
                              onClick={() => {
                                if (!selection.consumeDidDrag()) onSelectRow(minterm);
                              }}
                              aria-label={t('boolean.kmap.cellAria', { name: outputName, minterm, val })}
                            >
                              <span className={val === 1 ? dStyles.valOne : dStyles.valZero}>
                                {val}
                              </span>
                              <span className={dStyles.kmapMintermIdx}>m{minterm}</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <TableSelectionBar selection={selection} />
            </div>

            {kmap.groups.length > 0 && (
              <div className={dStyles.kmapLegend}>
                {kmap.groups.map((grp) => {
                  const color = GROUP_COLORS[grp.colorIndex];
                  const activeGrp = hoveredGroupId === grp.id;
                  return (
                    <button
                      key={grp.id}
                      type="button"
                      className={[
                        dStyles.kmapGroupBtn,
                        activeGrp ? dStyles.kmapGroupBtnActive : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onMouseEnter={() => setHoveredGroupId(grp.id)}
                      onMouseLeave={() => setHoveredGroupId(null)}
                      onClick={() =>
                        setHoveredGroupId((cur) => (cur === grp.id ? null : grp.id))
                      }
                    >
                      <span className={dStyles.kmapSwatch} style={{ backgroundColor: color }} />
                      <KatexSpan text={grp.termLatex} />
                      <span className={styles.metaInline}>({grp.cells.length})</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={dStyles.subPane}>
        <h3 className={dStyles.subPaneTitle}>
          {t('boolean.extras.canonical')} ({outputName})
        </h3>
        <div className={dStyles.canonicalBlock}>
          <div>
            <span className={styles.fieldLabel}>{t('boolean.extras.canonSop')}</span>
            <div className={styles.previewBar}>
              <div className={styles.previewMath}>
                <KatexSpan text={`${varToLatex(outputName)} = ${canonical.canonicalSopLatex}`} />
              </div>
            </div>
          </div>
          <div>
            <span className={styles.fieldLabel}>{t('boolean.extras.canonPos')}</span>
            <div className={styles.previewBar}>
              <div className={styles.previewMath}>
                <KatexSpan text={`${varToLatex(outputName)} = ${canonical.canonicalPosLatex}`} />
              </div>
            </div>
          </div>
        </div>

        {showHdlInside && hdlBlock}
      </div>
    </div>
  );
}

export default function KMapAndExtras({
  results,
  explicitAnd,
  selectedRowIndex,
  onSelectRow,
  onOpenKMapGuide,
}: KMapAndExtrasProps) {
  const { t } = useI18n();
  const [selectedOutIdx, setSelectedOutIdx] = useState(0);
  const [multiViewMode, setMultiViewMode] = useState<'single' | 'stacked'>('single');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedOutIdx >= results.length) setSelectedOutIdx(0);
  }, [results.length, selectedOutIdx]);

  const active = results[selectedOutIdx] ?? results[0];
  if (!active) return null;

  const isMulti = results.length > 1;
  const showStacked = isMulti && multiViewMode === 'stacked';

  // Combined multi-output HDL & LaTeX exports
  const verilogCode = results.map((r) => toVerilog(r.outputName, r.simplifiedAst)).join('\n');
  const vhdlCode = results.map((r) => toVhdl(r.outputName, r.simplifiedAst)).join('\n');
  const cCode = results
    .map((r) => `bool ${r.outputName} = ${toPlainText(r.simplifiedAst, 'programming', explicitAnd)};`)
    .join('\n');
  const latexCode = results
    .map((r) => `${varToLatex(r.outputName)} = ${toLatex(r.simplifiedAst, 'engineering', explicitAnd)}`)
    .join(' \\\\\n');

  const copySnippet = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const hdlBlock = (
    <>
      <h3 className={dStyles.subPaneTitle}>{t('boolean.extras.hdl')}</h3>
      <div className={dStyles.hdlGrid}>
        {[
          { id: 'verilog', label: 'Verilog', code: verilogCode },
          { id: 'vhdl', label: 'VHDL', code: vhdlCode },
          { id: 'c', label: 'C / JavaScript', code: cCode },
          { id: 'latex', label: 'LaTeX', code: latexCode },
        ].map((item) => (
          <div key={item.id} className={dStyles.hdlItem}>
            <div className={dStyles.hdlItemHead}>
              <span>{item.label}</span>
              <button
                type="button"
                className={[styles.btnGhost, styles.btnSmall].join(' ')}
                onClick={() => copySnippet(item.id, item.code)}
              >
                {copiedId === item.id ? t('boolean.result.copied') : t('common.copy')}
              </button>
            </div>
            <code className={dStyles.hdlCode} style={{ whiteSpace: 'pre-wrap' }}>
              {item.code}
            </code>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <section className={dStyles.sectionCard} aria-label={t('boolean.extras.title')}>
      <div className={dStyles.sectionToolbar}>
        <div className={styles.stepsTitleGroup}>
          <h2 className={styles.cardTitle}>{t('boolean.extras.title')}</h2>
          {!showStacked && (
            <span className={styles.metaInline}>
              {active.outputName}: Σm({active.canonical.minterms.slice(0, 12).join(', ')}
              {active.canonical.minterms.length > 12 ? ', …' : ''}) · ΠM(
              {active.canonical.maxterms.slice(0, 12).join(', ')}
              {active.canonical.maxterms.length > 12 ? ', …' : ''})
            </span>
          )}
        </div>

        <div className={styles.stepsControls}>
          {isMulti && (
            <div className={styles.segmented} role="group" aria-label={t('boolean.extras.viewModeAria')}>
              <button
                type="button"
                aria-pressed={multiViewMode === 'single'}
                data-testid="kmap-mode-single"
                className={[styles.segBtn, multiViewMode === 'single' ? styles.segBtnActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setMultiViewMode('single')}
              >
                {t('boolean.extras.viewSingle')}
              </button>
              <button
                type="button"
                aria-pressed={multiViewMode === 'stacked'}
                data-testid="kmap-mode-stacked"
                className={[styles.segBtn, multiViewMode === 'stacked' ? styles.segBtnActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setMultiViewMode('stacked')}
              >
                {t('boolean.extras.viewStacked')}
              </button>
            </div>
          )}

          {isMulti && !showStacked && (
            <div className={styles.layoutToggleWrap}>
              <span className={styles.layoutToggleLabel}>{t('boolean.extras.selectOutput')}:</span>
              <div className={styles.segmented} role="group" aria-label={t('boolean.extras.selectOutput')}>
                {results.map((r, idx) => (
                  <button
                    key={`${r.outputName}-${idx}`}
                    type="button"
                    aria-pressed={selectedOutIdx === idx}
                    className={[styles.segBtn, selectedOutIdx === idx ? styles.segBtnActive : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setSelectedOutIdx(idx)}
                  >
                    {r.outputName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {onOpenKMapGuide && (
            <button
              type="button"
              className={[styles.btnGhost, styles.btnSmall].join(' ')}
              onClick={onOpenKMapGuide}
            >
              {t('boolean.extras.learnKmap')} →
            </button>
          )}
        </div>
      </div>

      <div className={dStyles.sectionBody}>
        {showStacked ? (
          <div className={dStyles.kmapStackedList} data-testid="kmap-stacked-outputs">
            {results.map((res, idx) => (
              <SingleOutputKMapAndCanonical
                key={`${res.outputName}-${idx}`}
                result={res}
                selectedRowIndex={selectedRowIndex}
                onSelectRow={onSelectRow}
                showHdlInside={false}
                hdlBlock={null}
              />
            ))}
            <div className={dStyles.subPane}>{hdlBlock}</div>
          </div>
        ) : (
          <SingleOutputKMapAndCanonical
            result={active}
            selectedRowIndex={selectedRowIndex}
            onSelectRow={onSelectRow}
            showHdlInside
            hdlBlock={hdlBlock}
          />
        )}
      </div>
    </section>
  );
}
