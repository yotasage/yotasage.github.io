import { useState } from 'react';

import {
  KMAP_GUIDE_CHAPTERS,
  KMAP_WORKED_EXAMPLES,
  type KMapWorkedExample,
} from '../../lib/boolean/kmapGuide';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Boolean.module.css';
import dStyles from '../../styles/BooleanDiagrams.module.css';
import KatexSpan from '../KatexSpan';

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

  const mintermSet = new Set(example.minterms);
  const activeGroup = example.groups.find((g) => g.id === activeGroupId) ?? example.groups[0] ?? null;

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
        <button
          type="button"
          className={[styles.btnPrimary, styles.btnSmall].join(' ')}
          onClick={() => onOpenExampleInKMap(example.inputExpr)}
        >
          {t('boolean.kmapGuide.openInKmap')}
        </button>
      </div>

      <div className={styles.identityFormula}>
        <KatexSpan text={`${example.inputLatex} \\quad\\Longrightarrow\\quad ${example.resultLatex}`} />
      </div>

      <p className={dStyles.hintText}>{t('boolean.kmapGuide.highlightHint')}</p>

      <div className={dStyles.kmapGridWrap}>
        <table className={dStyles.kmapTable} aria-label={`${example.title} Karnaugh map`}>
          <thead>
            <tr>
              <th className={dStyles.kmapCorner}>
                {example.rowVars.join('')} \ {example.colVars.join('')}
              </th>
              {example.colLabels.map((lbl) => (
                <th key={lbl} className={dStyles.kmapHeader}>
                  {lbl}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {example.rowGray.map((rBits, rIdx) => (
              <tr key={example.rowLabels[rIdx]}>
                <th className={dStyles.kmapHeader}>{example.rowLabels[rIdx]}</th>
                {example.colGray.map((cBits, cIdx) => {
                  const minterm = (rBits << example.colVars.length) | cBits;
                  const val = mintermSet.has(minterm) ? 1 : 0;
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
                      className={dStyles.kmapCell}
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
