import React from 'react';

import { buildConversionSteps } from '../../lib/base/steps';
import type { BaseSpec, ParsedNumber } from '../../lib/base/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/BaseConverter.module.css';

interface StepsPanelProps {
  parsed: ParsedNumber;
  fromSpec: BaseSpec;
  toSpec: BaseSpec;
  defaultOpen: boolean;
}

export default function StepsPanel({
  parsed,
  fromSpec,
  toSpec,
  defaultOpen,
}: StepsPanelProps) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(defaultOpen);

  React.useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  const steps = React.useMemo(
    () =>
      buildConversionSteps(
        parsed,
        fromSpec.radix,
        toSpec.radix,
        fromSpec.alphabetId,
        toSpec.alphabetId,
      ),
    [parsed, fromSpec.radix, fromSpec.alphabetId, toSpec.radix, toSpec.alphabetId],
  );

  const routeSummary =
    fromSpec.radix === toSpec.radix && fromSpec.alphabetId === toSpec.alphabetId
      ? `Base ${fromSpec.radix}`
      : fromSpec.radix === 10 || toSpec.radix === 10 || steps.powerOfTwoGroup !== null
        ? `Base ${fromSpec.radix} → Base ${toSpec.radix}`
        : `Base ${fromSpec.radix} → Base 10 → Base ${toSpec.radix}`;

  return (
    <section className={styles.card} aria-labelledby="base-steps-title">
      <div className={styles.cardHeader}>
        <div>
          <h2 id="base-steps-title" className={styles.cardTitle}>
            {t('base.steps.title')}
          </h2>
          <p className={styles.cardSub}>{routeSummary}</p>
        </div>

        <button
          type="button"
          className={styles.buttonSmall}
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          {open ? t('base.steps.hide') : t('base.steps.show')}
        </button>
      </div>

      {open && (
        <div className={styles.stepsBody}>
          {steps.powerOfTwoGroup !== null && (
            <div className={styles.shortcutNote}>
              {t('base.steps.powerOfTwoNote', {
                src: fromSpec.radix,
                dst: toSpec.radix,
                group: steps.powerOfTwoGroup,
              })}
            </div>
          )}

          {fromSpec.radix !== 10 && (
            <div>
              <h3 className={styles.stepSectionTitle}>
                {t('base.steps.toDecHeading', { src: fromSpec.radix })}
              </h3>
              <div className={styles.polyEquation}>
                {steps.negative ? '−(' : ''}
                {steps.polyTerms.map((term, idx) => (
                  <React.Fragment key={`${term.power}-${idx}`}>
                    {idx > 0 ? ' + ' : ''}
                    <span className={styles.polyTermHighlight}>{term.digitValue}</span>
                    {'×'}
                    {fromSpec.radix}
                    <sup>{term.power}</sup>
                  </React.Fragment>
                ))}
                {steps.polyTruncated ? ' + …' : ''}
                {steps.negative ? ')' : ''}
                {' = '}
                <span className={styles.polyTermHighlight}>
                  {steps.negative ? '−' : ''}
                  {steps.decimalInteger}
                </span>
                <sub>10</sub>
              </div>
              {steps.polyTruncated && (
                <p className={styles.stepFootnote}>{t('base.steps.truncatedNote')}</p>
              )}
            </div>
          )}

          {toSpec.radix !== 10 && (
            <div>
              <h3 className={styles.stepSectionTitle}>
                {t('base.steps.fromDecHeading', { dst: toSpec.radix })}
              </h3>
              <div className={styles.tableWrap}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>{t('base.steps.colDividend')}</th>
                      <th>{t('base.steps.colQuotient')}</th>
                      <th>{t('base.steps.colRemainder')}</th>
                      <th>{t('base.steps.colDigit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {steps.divisionSteps.map((row, idx) => (
                      <tr key={idx}>
                        <td className={styles.monoCell}>{row.dividend}</td>
                        <td className={styles.monoCell}>{row.quotient}</td>
                        <td className={styles.monoCell}>{row.remainder}</td>
                        <td className={styles.monoCellAccent}>{row.digit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {steps.divisionTruncated && (
                <p className={styles.stepFootnote}>{t('base.steps.truncatedNote')}</p>
              )}
            </div>
          )}

          {steps.fractionSteps.length > 0 && (
            <div>
              <h3 className={styles.stepSectionTitle}>
                {t('base.steps.fracHeading', { dst: toSpec.radix })}
              </h3>
              <div className={styles.tableWrap}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>{t('base.steps.colFraction')}</th>
                      <th>{t('base.steps.colProduct', { dst: toSpec.radix })}</th>
                      <th>{t('base.steps.colIntPart')}</th>
                      <th>{t('base.steps.colDigit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {steps.fractionSteps.map((row, idx) => (
                      <tr key={idx}>
                        <td className={styles.monoCell}>{row.input}</td>
                        <td className={styles.monoCell}>{row.product}</td>
                        <td className={styles.monoCell}>{row.integerPart}</td>
                        <td className={styles.monoCellAccent}>{row.digit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.stepFootnote}>
                {steps.fractionExact
                  ? t('base.steps.exactEnd')
                  : t('base.steps.repeatingEnd', { dst: toSpec.radix })}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
