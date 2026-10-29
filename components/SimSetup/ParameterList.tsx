import React from 'react';

import KatexSpan from '../KatexSpan';
import styles from '../../styles/SimSetup.module.css';

interface Parameter {
  symbol: string; // TeX
  description: React.ReactNode;
  alias?: React.ReactNode;
  formula?: string; // TeX for how the calculator works it out; none for values that are typed in
  unit: string;
}

// Grouped like the calculator boxes: the four parameters at the top, then the left and right columns below them.
const GROUPS: { title: string; parameters: Parameter[] }[] = [
  {
    title: 'The four related parameters',
    parameters: [
      {
        symbol: 'f_0',
        description: 'Fundamental frequency of your signal',
        alias: <>f<sub>in</sub></>,
        formula: '\\frac{N_{cyc}}{N_{pts}} \\cdot F_S',
        unit: 'Hz',
      },
      {
        symbol: 'F_S',
        description: 'Sampling frequency',
        alias: <>f<sub>sample</sub></>,
        formula: '\\frac{N_{pts}}{N_{cyc}} \\cdot f_0',
        unit: 'Hz',
      },
      {
        symbol: 'N_{cyc}',
        description: <>Number of cycles/periods of f<sub>0</sub></>,
        alias: <>N<sub>window</sub></>,
        formula: '\\frac{f_0}{F_S} \\cdot N_{pts}',
        unit: '—',
      },
      {
        symbol: 'N_{pts}',
        description: 'Number of data points or samples',
        alias: <>N<sub>record</sub> and N<sub>fft</sub>, the length of an FFT</>,
        formula: '\\frac{F_S}{f_0} \\cdot N_{cyc}',
        unit: '—',
      },
    ],
  },
  {
    title: 'Periods and resolution',
    parameters: [
      { symbol: 'T_0', description: <>Period of f<sub>0</sub></>, formula: '\\frac{1}{f_0}', unit: 's' },
      { symbol: 'T_S', description: <>Period of F<sub>S</sub></>, formula: '\\frac{1}{F_S}', unit: 's' },
      { symbol: 'f_{res}', description: 'Frequency resolution, of an FFT for instance', formula: '\\frac{F_S}{N_{pts}}', unit: 'Hz' },
      {
        symbol: 'N_{pts0}',
        description: <>Number of data points or samples during one T<sub>0</sub></>,
        formula: '\\frac{N_{pts}}{N_{cyc}}',
        unit: '—',
      },
    ],
  },
  {
    title: 'Time window and frequency range',
    parameters: [
      { symbol: 't_{start}', description: 'Point in time that sampling starts', unit: 's' },
      { symbol: 't_{stop}', description: 'Point in time until which samples are taken', formula: 't_{start} + N_{cyc} \\cdot T_0', unit: 's' },
      {
        symbol: 'f_{min}',
        description: 'Lowest frequency that can be considered, by an FFT for instance',
        formula: '\\frac{1}{t_{stop} - t_{start}}',
        unit: 'Hz',
      },
      { symbol: 'f_{max}', description: 'Highest frequency that can be considered, by an FFT for instance', formula: '\\frac{F_S}{2}', unit: 'Hz' },
    ],
  },
];

export default function ParameterList() {
  return (
    <>
      <p>
        f<sub>0</sub>, F<sub>S</sub>, N<sub>cyc</sub> and N<sub>pts</sub> are related by this equation, and the calculator
        solves it for whichever of them you choose:
      </p>
      <div className={styles.keyEquation}>
        <KatexSpan displayMode text={'\\rm F_S=\\frac{N_{pts}}{N_{cyc}}\\cdot f_0'} />
      </div>

      <div className={styles.parameterTable}>
        <div className={[styles.parameterRow, styles.parameterHeader].join(' ')} aria-hidden="true">
          <span>Symbol</span>
          <span>Description</span>
          <span>Calculated as</span>
          <span className={styles.parameterUnit}>Unit</span>
        </div>

        {GROUPS.map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h3 className={styles.parameterGroup}>{group.title}</h3>
            <dl className={styles.parameterList}>
              {group.parameters.map((p) => (
                <div key={p.symbol} className={styles.parameterRow}>
                  <dt className={styles.parameterSymbol}><KatexSpan text={`\\rm ${p.symbol}`} /></dt>
                  <dd className={styles.parameterDescription}>
                    {p.description}
                    {p.alias && <span className={styles.parameterAlias}>Also called {p.alias}</span>}
                  </dd>
                  <dd className={styles.parameterFormula}>
                    {p.formula ? (
                      <>
                        <span className={styles.visuallyHidden}>Calculated as </span>
                        {/* Shown on phones, where there is no column heading. */}
                        <span className={styles.parameterEquals} aria-hidden="true">= </span>
                        <KatexSpan text={`\\displaystyle\\rm ${p.formula}`} />
                      </>
                    ) : <span className={styles.parameterInput}>Typed in</span>}
                  </dd>
                  <dd className={styles.parameterUnit}>
                    <span className={styles.visuallyHidden}>Unit: </span>
                    {p.unit === '—' ? <span title="No unit">—</span> : p.unit}
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
