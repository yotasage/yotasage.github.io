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
  noteKey: string;
}

const UNIT_EXAMPLES: readonly ExampleItem[] = [
  { expr: '10 kOhm * 100 pF', noteKey: 'calc.guide.ex.siDim' },
  { expr: '1 / (2 * pi * 10 kOhm * 100 pF)', noteKey: 'calc.guide.ex.rcCutoff' },
  { expr: 'c / 2.4 GHz in mm', noteKey: 'calc.guide.ex.rfWave' },
  { expr: '100 km/h in m/s', noteKey: 'calc.guide.ex.velUnit' },
  { expr: '25 degC in degF', noteKey: 'calc.guide.ex.tempConv' },
  { expr: '4.7k || 4.7k', noteKey: 'calc.guide.ex.parallelOp' },
];

const PHASOR_EXAMPLES: readonly ExampleItem[] = [
  { expr: '50 + j*30 Ohm', noteKey: 'calc.guide.ex.complexZ' },
  { expr: '10 angle 30 deg', noteKey: 'calc.guide.ex.phasorMag' },
  { expr: '(50 + j*30 Ohm) || (100 - j*40 Ohm)', noteKey: 'calc.guide.ex.complexPar' },
  { expr: '30 dBm in W', noteKey: 'calc.guide.ex.dbmToW' },
  { expr: '50 mW in dBm', noteKey: 'calc.guide.ex.wToDbm' },
  { expr: 'db20(10)', noteKey: 'calc.guide.ex.db20' },
];

const CALCULUS_EXAMPLES: readonly ExampleItem[] = [
  { expr: 'diff(x^3 + 2*sin(x), x)', noteKey: 'calc.guide.ex.symDiff' },
  { expr: 'd/dx(exp(-2*x) * cos(3*x))', noteKey: 'calc.guide.ex.prodChain' },
  { expr: 'diff(x^4, x, 2)', noteKey: 'calc.guide.ex.highDiff' },
  { expr: 'int(3*x^2 + 1/x, x)', noteKey: 'calc.guide.ex.symInt' },
  { expr: 'int(sin(x), x, 0, pi)', noteKey: 'calc.guide.ex.defInt' },
  { expr: 'int(exp(-x^2), x, 0, 1)', noteKey: 'calc.guide.ex.quadInt' },
];

const SHORTCUT_EXAMPLES: readonly ExampleItem[] = [
  { expr: 'R = 10 kOhm', noteKey: 'calc.guide.ex.storeVar' },
  { expr: 'C = 100 pF', noteKey: 'calc.guide.ex.assignVar' },
  { expr: '1 / (2 * pi * R * C)', noteKey: 'calc.guide.ex.evalStored' },
  { expr: 'ans * 2', noteKey: 'calc.guide.ex.ansRef' },
];

export default function GuideView({ onTryExample }: GuideViewProps) {
  const { t } = useI18n();

  const renderExamples = (items: readonly ExampleItem[]) => (
    <div className={styles.tryList}>
      {items.map((item) => (
        <div key={item.expr} className={styles.tryRow}>
          <div>
            <div className={styles.tryCode}>{item.expr}</div>
            <div className={styles.tryNote}>{t(item.noteKey)}</div>
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
                <th>{t('calc.guide.thSymbol')}</th>
                <th>{t('calc.guide.thIdentifier')}</th>
                <th>{t('calc.guide.thValue')}</th>
                <th>{t('calc.guide.thDescription')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {CONSTANTS.map((c) => {
                const descKey = `calc.const.${c.name}`;
                const desc = t(descKey);
                return (
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
                    <td>{desc === descKey ? c.description : desc}</td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
