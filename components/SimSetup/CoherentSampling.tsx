import React from 'react';

import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/SimSetup.module.css';
import Bibliography from '../Bibliography';
import { CheckText } from './CalcBox';

interface Rule {
  statement: React.ReactNode;
  explanation?: React.ReactNode;
  // What the calculator boxes show for this rule, or null when they do not check it.
  checks: React.ReactNode | null;
  source: string; // key in references.bib
}

// The notes all come from this source.
const NOTES_SOURCE = 'AD';

export default function CoherentSampling({ bib }: { bib: Bibliography }) {
  const { t } = useI18n();

  const rules: Rule[] = [
    {
      statement: <>N<sub>cyc</sub> {t('simsetup.coherent.r1Stmt')}</>,
      explanation: (
        <>
          N<sub>cyc</sub> {t('simsetup.coherent.r1Exp1')} N<sub>cyc</sub> {t('simsetup.coherent.r1Exp2')} N<sub>pts</sub>
          {t('simsetup.coherent.r1Exp3')} N<sub>cyc</sub> {t('simsetup.coherent.r1Exp4')} N<sub>pts</sub>{' '}
          {t('simsetup.coherent.r1Exp5')} f<sub>0</sub> {t('simsetup.coherent.r1Exp6')}
        </>
      ),
      checks: (
        <>
          <CheckText tone="good">{t('simsetup.check.prime')}</CheckText>
          <CheckText tone="ok">{t('simsetup.check.odd')}</CheckText>
          <CheckText tone="bad">{t('simsetup.check.even')}</CheckText>
          <CheckText tone="bad">{t('simsetup.check.notInteger')}</CheckText>
          <CheckText tone="good">{t('simsetup.coherent.noCommonFactor')} N<sub>pts</sub></CheckText>
          <CheckText tone="bad">{t('simsetup.coherent.commonFactor')} N<sub>pts</sub></CheckText>
        </>
      ),
      source: 'AN9675',
    },
    {
      statement: <>N<sub>pts</sub> {t('simsetup.coherent.r2Stmt')}</>,
      explanation: <>{t('simsetup.coherent.r2Exp')}</>,
      checks: (
        <>
          <CheckText tone="good">{t('simsetup.check.powerOfTwo')}</CheckText>
          <CheckText tone="bad">{t('simsetup.check.notPowerOfTwo')}</CheckText>
          <CheckText tone="bad">{t('simsetup.check.notInteger')}</CheckText>
        </>
      ),
      source: 'AN9675',
    },
    {
      statement: <>f<sub>0</sub> {t('simsetup.coherent.r3And')} F<sub>S</sub> {t('simsetup.coherent.r3Stmt')}</>,
      checks: null,
      source: 'US5708432',
    },
  ];

  const notes: React.ReactNode[] = [
    <>
      {t('simsetup.coherent.note1Pre')}
      <sup><a href="#note-3" aria-label={t('simsetup.theory.seeNote', { n: 3 })}>3</a></sup>
      {t('simsetup.coherent.note1Post')}
    </>,
    <>{t('simsetup.coherent.note2')}</>,
    <>{t('simsetup.coherent.note3')}</>,
  ];

  return (
    <>
      <h2 id="coherent-title" className={styles.sectionTitle}>
        {t('simsetup.theory.coherentTitle')}
      </h2>

      <ol className={styles.rules}>
        {rules.map((rule, i) => (
          <li key={i} id={`rule-${i + 1}`} className={styles.rule}>
            <div className={styles.ruleNumber} aria-hidden="true">
              <small>{t('simsetup.theory.rule')}</small>
              <span>{i + 1}</span>
            </div>
            <div className={styles.ruleBody}>
              <p className={styles.ruleStatement}>
                <span className={styles.visuallyHidden}>
                  {t('simsetup.theory.rule')} {i + 1}:{' '}
                </span>
                {rule.statement}
              </p>
              {rule.explanation && <p className={styles.ruleExplanation}>{rule.explanation}</p>}
              <div className={styles.ruleChecks}>
                {rule.checks ? (
                  <>
                    <span className={styles.ruleChecksLabel}>{t('simsetup.theory.inCalculator')}</span>
                    <span className={styles.ruleChecksList}>{rule.checks}</span>
                  </>
                ) : (
                  <span className={styles.ruleChecksLabel}>{t('simsetup.theory.notCheckedByCalc')}</span>
                )}
                <span className={styles.source}>
                  {t('simsetup.theory.source')} {bib.cite(rule.source)}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className={styles.notesHeader}>
        <h3 className={styles.groupHeading}>{t('simsetup.theory.notes')}</h3>
        <span className={styles.source}>
          {t('simsetup.theory.source')} {bib.cite(NOTES_SOURCE)}
        </span>
      </div>
      <ol className={styles.notes}>
        {notes.map((note, i) => (
          <li key={i} id={`note-${i + 1}`} className={styles.note}>
            <span className={styles.noteLabel} aria-hidden="true">
              {t('simsetup.theory.note')} {i + 1}
            </span>
            <p className={styles.noteText}>{note}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
