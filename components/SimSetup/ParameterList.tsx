import React from 'react';

import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/SimSetup.module.css';
import KatexSpan from '../KatexSpan';

interface Parameter {
  symbol: string; // TeX
  description: React.ReactNode;
  alias?: React.ReactNode;
  formula?: string; // TeX for how the calculator works it out; none for values that are typed in
  unit: string;
}

export default function ParameterList() {
  const { t } = useI18n();

  const groups: { title: string; parameters: Parameter[] }[] = [
    {
      title: t('simsetup.params.group1'),
      parameters: [
        {
          symbol: 'f_0',
          description: t('simsetup.params.f0'),
          alias: <>f<sub>in</sub></>,
          formula: '\\frac{N_{cyc}}{N_{pts}} \\cdot F_S',
          unit: 'Hz',
        },
        {
          symbol: 'F_S',
          description: t('simsetup.params.fs'),
          alias: <>f<sub>sample</sub></>,
          formula: '\\frac{N_{pts}}{N_{cyc}} \\cdot f_0',
          unit: 'Hz',
        },
        {
          symbol: 'N_{cyc}',
          description: <>{t('simsetup.params.ncyc')} f<sub>0</sub></>,
          alias: <>N<sub>window</sub></>,
          formula: '\\frac{f_0}{F_S} \\cdot N_{pts}',
          unit: '—',
        },
        {
          symbol: 'N_{pts}',
          description: t('simsetup.params.npts'),
          alias: <>N<sub>record</sub> {t('simsetup.theory.andLengthOfFft')} N<sub>fft</sub>{t('simsetup.theory.fftLengthSuffix')}</>,
          formula: '\\frac{F_S}{f_0} \\cdot N_{cyc}',
          unit: '—',
        },
      ],
    },
    {
      title: t('simsetup.params.group2'),
      parameters: [
        { symbol: 'T_0', description: <>{t('simsetup.params.t0')} f<sub>0</sub></>, formula: '\\frac{1}{f_0}', unit: 's' },
        { symbol: 'T_S', description: <>{t('simsetup.params.ts')} F<sub>S</sub></>, formula: '\\frac{1}{F_S}', unit: 's' },
        { symbol: 'f_{res}', description: t('simsetup.params.fres'), formula: '\\frac{F_S}{N_{pts}}', unit: 'Hz' },
        {
          symbol: 'N_{pts0}',
          description: <>{t('simsetup.params.npts0')} T<sub>0</sub></>,
          formula: '\\frac{N_{pts}}{N_{cyc}}',
          unit: '—',
        },
      ],
    },
    {
      title: t('simsetup.params.group3'),
      parameters: [
        { symbol: 't_{start}', description: t('simsetup.params.tstart'), unit: 's' },
        { symbol: 't_{stop}', description: t('simsetup.params.tstop'), formula: 't_{start} + N_{cyc} \\cdot T_0', unit: 's' },
        {
          symbol: 'f_{min}',
          description: t('simsetup.params.fmin'),
          formula: '\\frac{1}{t_{stop} - t_{start}}',
          unit: 'Hz',
        },
        { symbol: 'f_{max}', description: t('simsetup.params.fmax'), formula: '\\frac{F_S}{2}', unit: 'Hz' },
      ],
    },
  ];

  return (
    <>
      <p className={styles.proseLead}>
        f<sub>0</sub>, F<sub>S</sub>, N<sub>cyc</sub> {t('simsetup.params.leadPre')} N<sub>pts</sub>{' '}
        {t('simsetup.params.leadPost')}
      </p>
      <div className={styles.keyEquation}>
        <KatexSpan displayMode text={'\\rm F_S=\\frac{N_{pts}}{N_{cyc}}\\cdot f_0'} />
      </div>

      <div className={styles.parameterTable}>
        <div className={[styles.parameterRow, styles.parameterHeader].join(' ')} aria-hidden="true">
          <span>{t('simsetup.theory.symbol')}</span>
          <span>{t('simsetup.theory.description')}</span>
          <span>{t('simsetup.theory.calculatedAs')}</span>
          <span className={styles.parameterUnit}>{t('simsetup.theory.unit')}</span>
        </div>

        {groups.map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h3 className={styles.groupHeading}>{group.title}</h3>
            <dl className={styles.parameterList}>
              {group.parameters.map((p) => (
                <div key={p.symbol} className={styles.parameterRow}>
                  <dt className={styles.parameterSymbol}>
                    <KatexSpan text={`\\rm ${p.symbol}`} />
                  </dt>
                  <dd className={styles.parameterDescription}>
                    {p.description}
                    {p.alias && <span className={styles.parameterAlias}>{t('simsetup.theory.alsoCalled')} {p.alias}</span>}
                  </dd>
                  <dd className={styles.parameterFormula}>
                    {p.formula ? (
                      <>
                        <span className={styles.visuallyHidden}>{t('simsetup.theory.calculatedAs')} </span>
                        {/* Shown on phones, where there is no column heading. */}
                        <span className={styles.parameterEquals} aria-hidden="true">= </span>
                        <KatexSpan text={`\\displaystyle\\rm ${p.formula}`} />
                      </>
                    ) : (
                      <span className={styles.parameterInput}>{t('simsetup.theory.typedIn')}</span>
                    )}
                  </dd>
                  <dd className={styles.parameterUnit}>
                    <span className={styles.visuallyHidden}>{t('simsetup.theory.unit')}: </span>
                    {p.unit === '—' ? <span title={t('simsetup.theory.noUnit')}>—</span> : p.unit}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </>
  );
}
