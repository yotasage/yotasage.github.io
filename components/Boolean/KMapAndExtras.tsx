import { useEffect, useState } from 'react';

import { toLatex, toPlainText, toVerilog, toVhdl, varToLatex } from '../../lib/boolean/parse';
import type { SimplifySuccess } from '../../lib/boolean/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Boolean.module.css';
import dStyles from '../../styles/BooleanDiagrams.module.css';
import KatexSpan from '../KatexSpan';

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
}

export default function KMapAndExtras({
  results,
  explicitAnd,
  selectedRowIndex,
  onSelectRow,
}: KMapAndExtrasProps) {
  const { t } = useI18n();
  const [selectedOutIdx, setSelectedOutIdx] = useState(0);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedOutIdx >= results.length) setSelectedOutIdx(0);
  }, [results.length, selectedOutIdx]);

  const active = results[selectedOutIdx] ?? results[0];
  if (!active) return null;

  const { outputName, canonical, kmap } = active;

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

  const activeGroup = kmap?.groups.find((g) => g.id === hoveredGroupId) ?? null;

  return (
    <section className={dStyles.sectionCard} aria-label={t('boolean.extras.title')}>
      <div className={dStyles.sectionToolbar}>
        <div className={styles.stepsTitleGroup}>
          <h2 className={styles.cardTitle}>{t('boolean.extras.title')}</h2>
          <span className={styles.metaInline}>
            {outputName}: Σm({canonical.minterms.slice(0, 12).join(', ')}
            {canonical.minterms.length > 12 ? ', …' : ''}) · ΠM(
            {canonical.maxterms.slice(0, 12).join(', ')}
            {canonical.maxterms.length > 12 ? ', …' : ''})
          </span>
        </div>

        {results.length > 1 && (
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
                  onClick={() => {
                    setSelectedOutIdx(idx);
                    setHoveredGroupId(null);
                  }}
                >
                  {r.outputName}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={dStyles.sectionBody}>
        <div className={kmap ? dStyles.dualGrid : dStyles.singleGrid}>
          {kmap && (
            <div className={dStyles.subPane}>
              <h3 className={dStyles.subPaneTitle}>
                {t('boolean.extras.kmapTitle')} ({outputName})
              </h3>
              <p className={dStyles.hintText}>{t('boolean.extras.kmapHint')}</p>
              <div className={dStyles.kmapGridWrap}>
                <table className={dStyles.kmapTable} aria-label="Karnaugh map">
                  <thead>
                    <tr>
                      <th className={dStyles.kmapCorner}>
                        {kmap.rowVars.join('')} \ {kmap.colVars.join('')}
                      </th>
                      {kmap.colLabels.map((lbl) => (
                        <th key={lbl} className={dStyles.kmapHeader}>
                          {lbl}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {kmap.rowGray.map((rBits, rIdx) => (
                      <tr key={kmap.rowLabels[rIdx]}>
                        <th className={dStyles.kmapHeader}>{kmap.rowLabels[rIdx]}</th>
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
                              className={dStyles.kmapCell}
                              style={{ backgroundColor: cellBg, outline: cellOutline, outlineOffset: -2 }}
                            >
                              <button
                                type="button"
                                className={dStyles.kmapCellBtn}
                                onClick={() => onSelectRow(minterm)}
                                aria-label={`Minterm ${minterm}, value ${val}`}
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
                <span className={styles.fieldLabel}>Canonical SOP (minterms)</span>
                <div className={styles.previewBar}>
                  <div className={styles.previewMath}>
                    <KatexSpan text={`${varToLatex(outputName)} = ${canonical.canonicalSopLatex}`} />
                  </div>
                </div>
              </div>
              <div>
                <span className={styles.fieldLabel}>Canonical POS (maxterms)</span>
                <div className={styles.previewBar}>
                  <div className={styles.previewMath}>
                    <KatexSpan text={`${varToLatex(outputName)} = ${canonical.canonicalPosLatex}`} />
                  </div>
                </div>
              </div>
            </div>

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
                      {copiedId === item.id ? t('boolean.result.copied') : 'Copy'}
                    </button>
                  </div>
                  <code className={dStyles.hdlCode} style={{ whiteSpace: 'pre-wrap' }}>
                    {item.code}
                  </code>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
