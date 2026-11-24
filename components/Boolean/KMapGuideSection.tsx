import { useMemo, useState } from 'react';

import {
  KMAP_GUIDE_CHAPTERS,
  KMAP_WORKED_EXAMPLES,
  type KMapWorkedExample,
} from '../../lib/boolean/kmapGuide';
import { exportKMapLatex, formatKMapCornerVars } from '../../lib/boolean/qm';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Boolean.module.css';
import dStyles from '../../styles/BooleanDiagrams.module.css';
import KatexSpan from '../KatexSpan';
import { TableSelectionBar, useTableSelection } from './useTableSelection';

const GROUP_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed'];

export interface KMapGuideSectionProps {
  readonly onOpenExampleInKMap: (expr: string) => void;
}

function WorkedKMapCard({
  example,
  onOpenExampleInKMap,
}: {
  example: KMapWorkedExample;
  onOpenExampleInKMap: (expr: string) => void;
}) {
  const { t } = useI18n();
  const [activeGroupId, setActiveGroupId] = useState<string>(example.groups[0]?.id ?? '');
  const [copiedLatex, setCopiedLatex] = useState(false);

  const values = useMemo<(0 | 1)[]>(() => {
    const total = 1 << example.variables.length;
    const set = new Set(example.minterms);
    return Array.from({ length: total }, (_, idx) => (set.has(idx) ? 1 : 0));
  }, [example.variables.length, example.minterms]);

  const kmapGrid = useMemo<readonly (readonly string[])[]>(() => {
    const corner = `${formatKMapCornerVars(example.rowVars)} \\ ${formatKMapCornerVars(example.colVars)}`;
    const header = [corner, ...example.colLabels];
    const rows = example.rowGray.map((rBits, rIdx) => [
      example.rowLabels[rIdx],
      ...example.colGray.map((cBits) => {
        const minterm = (rBits << example.colVars.length) | cBits;
        return String(values[minterm] ?? 0);
      }),
    ]);
    return [header, ...rows];
  }, [
    example.rowVars,
    example.colVars,
    example.colLabels,
    example.rowGray,
    example.rowLabels,
    example.colGray,
    values,
  ]);

  const selection = useTableSelection(kmapGrid);
  const activeGroup = example.groups.find((g) => g.id === activeGroupId) ?? example.groups[0] ?? null;

  const copyLatex = async () => {
    try {
      const latex = exportKMapLatex({
        rowVars: example.rowVars,
        colVars: example.colVars,
        rowGray: example.rowGray,
        colGray: example.colGray,
        rowLabels: example.rowLabels,
        colLabels: example.colLabels,
        values,
      });
      await navigator.clipboard.writeText(latex);
      setCopiedLatex(true);
      window.setTimeout(() => setCopiedLatex(false), 1500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const diffClass =
    example.difficulty === 'easy'
      ? dStyles.kmapDiffEasy
      : example.difficulty === 'moderate'
        ? dStyles.kmapDiffModerate
        : dStyles.kmapDiffDifficult;

  return (
    <article className={dStyles.kmapWorkedCard} data-testid={`kmap-worked-${example.difficulty}`}>
      <div className={styles.cardHeader}>
        <div className={styles.workContent}>
          <div className={styles.btnRow}>
            <span className={[dStyles.kmapDiffBadge, diffClass].join(' ')}>
              {t(`boolean.kmapGuide.diff.${example.difficulty}`)}
            </span>
            <h3 className={styles.identityTitle}>{example.title}</h3>
          </div>
          <p className={styles.identitySummary}>{example.subtitle}</p>
        </div>
        <div className={styles.btnRow}>
          <button
            type="button"
            className={[styles.btn, styles.btnSmall].join(' ')}
            onClick={() => void selection.copyAll()}
            data-testid={`kmap-guide-copy-excel-${example.difficulty}`}
          >
            {selection.copiedState === 'all'
              ? t('boolean.table.copiedExcel')
              : t('boolean.table.copyExcel')}
          </button>
          <button
            type="button"
            className={[styles.btn, styles.btnSmall].join(' ')}
            onClick={() => void copyLatex()}
            data-testid={`kmap-guide-copy-latex-${example.difficulty}`}
          >
            {copiedLatex ? t('boolean.result.copied') : t('boolean.kmap.copyLatex')}
          </button>
          <button
            type="button"
            className={[styles.btnPrimary, styles.btnSmall].join(' ')}
            onClick={() => onOpenExampleInKMap(example.inputExpr)}
          >
            {t('boolean.kmapGuide.openInKmap')}
          </button>
        </div>
      </div>

      <div className={styles.identityFormula}>
        <KatexSpan text={`${example.inputLatex} \\quad\\Longrightarrow\\quad ${example.resultLatex}`} />
      </div>

      <p className={dStyles.hintText}>{t('boolean.kmapGuide.highlightHint')}</p>

      <div className={dStyles.kmapGridWrap}>
        <div
          ref={selection.containerRef}
          tabIndex={0}
          onKeyDown={selection.onKeyDown}
          className={dStyles.kmapTableStack}
        >
          <table
            className={[dStyles.kmapTable, dStyles.selectableTable].join(' ')}
            aria-label={`${example.title} Karnaugh map`}
          >
            <thead>
              <tr>
                <th
                  {...selection.getCellProps(0, 0)}
                  className={selection.getCellClassName(0, 0, dStyles.kmapCorner)}
                >
                  {formatKMapCornerVars(example.rowVars)} \ {formatKMapCornerVars(example.colVars)}
                </th>
                {example.colLabels.map((lbl, cIdx) => (
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
              {example.rowGray.map((rBits, rIdx) => (
                <tr key={example.rowLabels[rIdx]}>
                  <th
                    {...selection.getCellProps(rIdx + 1, 0)}
                    className={selection.getCellClassName(rIdx + 1, 0, dStyles.kmapHeader)}
                  >
                    {example.rowLabels[rIdx]}
                  </th>
                  {example.colGray.map((cBits, cIdx) => {
                    const minterm = (rBits << example.colVars.length) | cBits;
                    const val = values[minterm] ?? 0;
                    const inActive = activeGroup?.cells.includes(minterm) ?? false;
                    const coveringReal = example.groups.filter(
                      (g) => !g.isRedundantTrap && g.cells.includes(minterm),
                    );
                    const activeColor = activeGroup
                      ? GROUP_COLORS[activeGroup.colorIndex % GROUP_COLORS.length]
                      : undefined;
                    const baseColor =
                      coveringReal.length > 0
                        ? GROUP_COLORS[coveringReal[0].colorIndex % GROUP_COLORS.length]
                        : undefined;
                    const bg = inActive && activeColor
                      ? `${activeColor}2e`
                      : baseColor
                        ? `${baseColor}14`
                        : undefined;
                    const outline = inActive && activeColor
                      ? `2.5px ${activeGroup?.isRedundantTrap ? 'dashed' : 'solid'} ${activeColor}`
                      : undefined;

                    return (
                      <td
                        key={`${rIdx}-${cIdx}`}
                        {...selection.getCellProps(rIdx + 1, cIdx + 1)}
                        className={selection.getCellClassName(rIdx + 1, cIdx + 1, dStyles.kmapCell)}
                        style={{ backgroundColor: bg, outline, outlineOffset: -2 }}
                      >
                        <div className={dStyles.kmapCellBtn}>
                          <span className={val === 1 ? dStyles.valOne : dStyles.valZero}>{val}</span>
                          <span className={dStyles.kmapMintermIdx}>m{minterm}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <TableSelectionBar selection={selection} />
        </div>

        <div className={dStyles.kmapLegend} style={{ flex: 1, minWidth: 240 }}>
          {example.groups.map((grp) => {
            const color = GROUP_COLORS[grp.colorIndex % GROUP_COLORS.length];
            const isActive = activeGroup?.id === grp.id;
            return (
              <button
                key={grp.id}
                type="button"
                aria-pressed={isActive}
                className={[
                  dStyles.kmapGroupBtn,
                  isActive ? dStyles.kmapGroupBtnActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setActiveGroupId(grp.id)}
              >
                <span className={dStyles.kmapSwatch} style={{ backgroundColor: color }} />
                <span>{grp.label}:</span>
                <KatexSpan text={grp.termLatex} />
              </button>
            );
          })}

          {activeGroup && (
            <div
              className={[
                dStyles.kmapGroupExplainBox,
                activeGroup.isRedundantTrap ? dStyles.kmapTrapExplainBox : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div>
                <strong>Cells:</strong> {activeGroup.cells.map((m) => `m${m}`).join(', ')}
              </div>
              <div>
                <strong>Dropped:</strong> {activeGroup.eliminatedVars}
              </div>
              <div>
                <strong>Kept:</strong> {activeGroup.keptVars}
              </div>
              <div>{activeGroup.explanation}</div>
            </div>
          )}
        </div>
      </div>

      <ol className={dStyles.kmapStepList}>
        {example.walkthrough.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>

      <div className={styles.theoryBox}>
        <span className={styles.theoryPrefix}>Key takeaway:</span>
        <span>{example.keyTakeaway}</span>
      </div>
    </article>
  );
}

export default function KMapGuideSection({ onOpenExampleInKMap }: KMapGuideSectionProps) {
  const { t } = useI18n();

  return (
    <div className={styles.workspacePanel} data-testid="kmap-guide-section">
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>{t('boolean.kmapGuide.title')}</h2>
            <p className={styles.lead}>{t('boolean.kmapGuide.lead')}</p>
          </div>
        </div>

        <div className={dStyles.theoryTopicsGrid}>
          {KMAP_GUIDE_CHAPTERS.map((ch) => (
            <article key={ch.id} className={dStyles.theoryTopicCard}>
              <div className={dStyles.kmapChapterHead}>
                <span className={dStyles.kmapChapterNum}>{ch.stepNumber}</span>
                <h3 className={styles.identityTitle}>{ch.title}</h3>
              </div>
              {ch.formulaLatex && (
                <div className={styles.identityFormula}>
                  <KatexSpan text={ch.formulaLatex} />
                </div>
              )}
              <p className={styles.identitySummary}>{ch.summary}</p>
              <ul className={dStyles.theoryBulletList}>
                {ch.bullets.map((b, idx) => (
                  <li key={idx}>{b}</li>
                ))}
              </ul>
              <div className={styles.theoryBox}>
                <span className={styles.theoryPrefix}>Tip:</span>
                <span>{ch.tip}</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>{t('boolean.kmapGuide.examplesTitle')}</h2>
            <p className={styles.lead}>
              Follow the three progressive examples below, clicking each group to inspect how adjacent cells merge and why certain loops are essential or redundant.
            </p>
          </div>
        </div>
      </div>

      <div className={dStyles.kmapWorkedList}>
        {KMAP_WORKED_EXAMPLES.map((ex) => (
          <WorkedKMapCard
            key={ex.id}
            example={ex}
            onOpenExampleInKMap={onOpenExampleInKMap}
          />
        ))}
      </div>
    </div>
  );
}
