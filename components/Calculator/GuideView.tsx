import { CONSTANTS } from '../../lib/calc/constants';
import { useI18n } from '../../lib/ui/i18n';
import calcStyles from '../../styles/Calculator.module.css';
import styles from '../../styles/CalculatorLayouts.module.css';
import SafeKatex from './SafeKatex';

export interface GuideViewProps {
  onTryExample: (expr: string) => void;
}

interface ExampleItem {
  expr: string;
  note: string;
}

const UNIT_EXAMPLES: readonly ExampleItem[] = [
  { expr: '10 kOhm * 100 pF', note: 'SI dimensional analysis → 1 µs' },
  { expr: '1 / (2 * pi * 10 kOhm * 100 pF)', note: 'RC cutoff frequency → 159.155 kHz' },
  { expr: 'c / 2.4 GHz in mm', note: 'RF wavelength conversion' },
  { expr: '100 km/h in m/s', note: 'Compound velocity unit' },
  { expr: '25 degC in degF', note: 'Affine temperature conversion' },
  { expr: '4.7k || 4.7k', note: 'Parallel operator with bare prefix' },
];

const PHASOR_EXAMPLES: readonly ExampleItem[] = [
  { expr: '50 + j*30 Ohm', note: 'Complex impedance with polar & Y hints' },
  { expr: '10 angle 30 deg', note: 'Phasor magnitude ∠ angle' },
  { expr: '(50 + j*30 Ohm) || (100 - j*40 Ohm)', note: 'Complex parallel impedance' },
  { expr: '30 dBm in W', note: 'RF power level to linear Watts' },
  { expr: '50 mW in dBm', note: 'Linear power to dBm' },
  { expr: 'db20(10)', note: 'Voltage/field ratio in dB' },
];

const CALCULUS_EXAMPLES: readonly ExampleItem[] = [
  { expr: 'diff(x^3 + 2*sin(x), x)', note: 'Symbolic derivative' },
  { expr: 'd/dx(exp(-2*x) * cos(3*x))', note: 'Product + chain rule' },
  { expr: 'diff(x^4, x, 2)', note: 'Higher-order derivative' },
  { expr: 'int(3*x^2 + 1/x, x)', note: 'Symbolic indefinite integral (+ C)' },
  { expr: 'int(sin(x), x, 0, pi)', note: 'Exact FTC definite integral → 2' },
  { expr: 'int(exp(-x^2), x, 0, 1)', note: 'Adaptive Gauss-Kronrod quadrature' },
];

const SHORTCUT_EXAMPLES: readonly ExampleItem[] = [
  { expr: 'R = 10 kOhm', note: 'Store variable into editable Variables table' },
  { expr: 'C = 100 pF', note: 'Assign second variable for live expressions' },
  { expr: '1 / (2 * pi * R * C)', note: 'Evaluates using stored R and C' },
  { expr: 'ans * 2', note: 'Reference last committed history answer' },
];

export default function GuideView({ onTryExample }: GuideViewProps) {
  const { t } = useI18n();

  const renderExamples = (items: readonly ExampleItem[]) => (
    <div className={styles.tryList}>
      {items.map((item) => (
        <div key={item.expr} className={styles.tryRow}>
          <div>
            <div className={styles.tryCode}>{item.expr}</div>
            <div className={styles.tryNote}>{item.note}</div>
          </div>
          <button
            type="button"
            className={`${calcStyles.btn} ${calcStyles.btnSmall}`}
            onClick={() => onTryExample(item.expr)}
          >
            {t('calc.guide.tryIt')}
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className={styles.layoutsShell}>
      <div>
        <h2 className={styles.solverTitle}>{t('calc.guide.title')}</h2>
        <p className={styles.solverDesc}>{t('calc.guide.lead')}</p>
      </div>

      <div className={styles.guideGrid}>
        <section className={styles.guideCard}>
          <h2>{t('calc.guide.unitsTitle')}</h2>
          {renderExamples(UNIT_EXAMPLES)}
        </section>

        <section className={styles.guideCard}>
          <h2>{t('calc.guide.phasorTitle')}</h2>
          {renderExamples(PHASOR_EXAMPLES)}
        </section>

        <section className={styles.guideCard}>
          <h2>{t('calc.guide.calculusTitle')}</h2>
          {renderExamples(CALCULUS_EXAMPLES)}
        </section>

        <section className={styles.guideCard}>
          <h2>{t('calc.guide.shortcutsTitle')}</h2>
          {renderExamples(SHORTCUT_EXAMPLES)}
        </section>
      </div>

      <section className={styles.guideCard}>
        <h2>{t('calc.guide.constantsTitle')}</h2>
        <div className={calcStyles.varTableWrap}>
          <table className={styles.constTable}>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Identifier</th>
                <th>Value</th>
                <th>Description</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {CONSTANTS.map((c) => (
                <tr key={c.name}>
                  <td>
                    <SafeKatex text={c.latex} />
                  </td>
                  <td>
                    <code>{c.name}</code>
                  </td>
                  <td>
                    <code>
                      {c.value.toPrecision(7)} {c.unitDisplay}
                    </code>
                  </td>
                  <td>{c.description}</td>
                  <td>
                    <button
                      type="button"
                      className={`${calcStyles.btnGhost} ${calcStyles.btnSmall}`}
                      onClick={() => onTryExample(c.name)}
                    >
                      {t('calc.guide.tryIt')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
