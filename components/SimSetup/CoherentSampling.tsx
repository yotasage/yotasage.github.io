import React from 'react';

import Bibliography from '../Bibliography';
import { CheckText } from './CalcBox';
import styles from '../../styles/SimSetup.module.css';

interface Rule {
  statement: React.ReactNode;
  explanation?: React.ReactNode;
  // What the calculator boxes show for this rule, or null when they do not check it.
  checks: React.ReactNode | null;
}

const RULES: Rule[] = [
  {
    statement: <>N<sub>cyc</sub> is recommended to be a prime number or at least an odd number.</>,
    explanation: (
      <>
        N<sub>cyc</sub> should be an integer (No window effect). By making N<sub>cyc</sub> odd, we eliminate many common
        factors with N<sub>pts</sub>. Common factors between N<sub>cyc</sub> and N<sub>pts</sub> lead to different
        harmonics of f<sub>0</sub> having the same frequency bin in the FFT after aliasing.
      </>
    ),
    checks: (
      <>
        <CheckText tone="good">Prime</CheckText>
        <CheckText tone="ok">Odd, not prime</CheckText>
        <CheckText tone="bad">Even</CheckText>
        <CheckText tone="bad">Not an integer</CheckText>
        <CheckText tone="good">No common factor with N<sub>pts</sub></CheckText>
        <CheckText tone="bad">Common factor with N<sub>pts</sub></CheckText>
      </>
    ),
  },
  {
    statement: <>N<sub>pts</sub> should be a power of 2.</>,
    explanation: <>An FFT requires the number of samples to be a power of 2 because of its inherent periodicity.</>,
    checks: (
      <>
        <CheckText tone="good">Power of 2</CheckText>
        <CheckText tone="bad">Not a power of 2</CheckText>
        <CheckText tone="bad">Not an integer</CheckText>
      </>
    ),
  },
  {
    statement: <>f<sub>0</sub> and F<sub>S</sub> should be relatively prime.</>,
    checks: null,
  },
];

const NOTES: React.ReactNode[] = [
  <>
    Unless window sampling (“windowing”) is used to compensate for waveform discontinuance
    <sup><a href="#note-3" aria-label="See note 3">3</a></sup>, spectral leakage is inevitable. Window sampling is when a
    sampled waveform is multiplied by the mathematical expression describing the window.
  </>,
  <>
    ADCs are usually characterized for and tested with sinusoidal input signals. Non-coherent sampling for sinusoidal
    input signals means that the first and the last sample of the input sinusoid are discontinuous with one another.
  </>,
  <>
    Waveform discontinuance describes an input signal, for which an integer number of its cycles do not fit into a
    predefined window.
  </>,
];

export default function CoherentSampling({ bib }: { bib: Bibliography }) {
  return (
    <>
      <div className={styles.cardHeader}>
        <h2 id="coherent-title">Coherent sampling</h2>
        <p className={styles.source}>Source: {bib.cite('AD')}</p>
      </div>

      <ol className={styles.rules}>
        {RULES.map((rule, i) => (
          <li key={i} id={`rule-${i + 1}`} className={styles.rule}>
            <div className={styles.ruleNumber} aria-hidden="true">
              <small>Rule</small>
              <span>{i + 1}</span>
            </div>
            <div>
              <p className={styles.ruleStatement}>
                <span className={styles.visuallyHidden}>Rule {i + 1}: </span>
                {rule.statement}
              </p>
              {rule.explanation && <p className={styles.ruleExplanation}>{rule.explanation}</p>}
              <div className={styles.ruleChecks}>
                {rule.checks
                  ? <><span className={styles.ruleChecksLabel}>In the calculator:</span>{rule.checks}</>
                  : <span className={styles.ruleChecksLabel}>Not checked by the calculator.</span>}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <h3 className={styles.groupHeading}>Notes</h3>
      <ol className={styles.notes}>
        {NOTES.map((note, i) => (
          <li key={i} id={`note-${i + 1}`} className={styles.note}>
            <span className={styles.noteLabel} aria-hidden="true">Note {i + 1}</span>
            <p className={styles.noteText}>{note}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
