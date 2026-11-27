// Theory & References workspace rendered with KaTeX MathML and IEEE Bibliography.
import KatexSpan from '../KatexSpan';
import Bibliography from '../Bibliography';
import type { BibEntry } from '../../lib/bibtex';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Fft.module.css';

export interface TheoryWorkspaceProps {
  references: BibEntry[];
}

export default function TheoryWorkspace({ references }: TheoryWorkspaceProps) {
  const { t } = useI18n();
  const bib = new Bibliography(references);

  return (
    <div className={styles.mainColumn}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>{t('fft.theory.title')}</h2>
            <p className={styles.cardSub}>{t('fft.theory.subtitle')}</p>
          </div>
        </div>

        <div className={styles.theorySection}>
          <h2>{t('fft.theory.s1Title')}</h2>
          <p>{t('fft.theory.s1Body')}</p>
          <div className={styles.formulaBox}>
            <KatexSpan
              text={String.raw`S_2 = \sum_{n=0}^{N-1} w[n]^2,\qquad P[k] = \frac{c_k}{N S_2}\left|\sum_{n=0}^{N-1} w[n] x[n] e^{-j 2\pi k n / N}\right|^2`}
              displayMode
            />
          </div>
          <p>
            Here <KatexSpan text="c_k = 1" /> for DC (<KatexSpan text="k=0" />) and Nyquist (
            <KatexSpan text="k=N/2" /> when <KatexSpan text="N" /> is even), and{' '}
            <KatexSpan text="c_k = 2" /> for all interior bins. By Parseval&apos;s theorem,{' '}
            <KatexSpan text={String.raw`\sum_k P[k] = \frac{1}{S_2}\sum_n w[n]^2 x[n]^2`} />, so
            every tone, harmonic, and noise integral sums linearly in power without double-counting
            scaling factors {bib.cite('Harris1978')} {bib.cite('Welch1967')}.
          </p>
        </div>

        <div className={styles.theorySection}>
          <h2>{t('fft.theory.s2Title')}</h2>
          <p>
            {t('fft.theory.s2Body')} {bib.cite('IEEE1241')} {bib.cite('IEEE1057')}{' '}
            {bib.cite('KesterMT003')}
          </p>
          <div className={styles.formulaBox}>
            <KatexSpan
              text={String.raw`\text{SNDR} = 10\log_{10}\!\left(\frac{P_{\text{sig}}}{P_{\text{noise}} + P_{\text{harm}}}\right),\qquad \text{ENOB} = \frac{\text{SNDR} - 1.7609}{6.0206}`}
              displayMode
            />
          </div>
          <div className={styles.formulaBox}>
            <KatexSpan
              text={String.raw`\text{FoM}_W = \frac{P}{2^{\text{ENOB}}\cdot 2\,\text{BW}},\qquad \text{FoM}_S = \text{SNDR} + 10\log_{10}\!\left(\frac{\text{BW}}{P}\right)`}
              displayMode
            />
          </div>
          <p>
            Walden and Schreier figures of merit allow apples-to-apples efficiency comparisons across
            Nyquist and oversampled <KatexSpan text="\Delta\Sigma" /> converters{' '}
            {bib.cite('Walden1999')} {bib.cite('SchreierTemes2005')}.
          </p>
        </div>

        <div className={styles.theorySection}>
          <h2>{t('fft.theory.s3Title')}</h2>
          <p>
            {t('fft.theory.s3Body')} {bib.cite('Harris1978')} {bib.cite('AN9675')}
          </p>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Window</th>
                  <th style={{ textAlign: 'right' }}>Coherent gain</th>
                  <th style={{ textAlign: 'right' }}>ENBW (bins)</th>
                  <th style={{ textAlign: 'right' }}>Highest sidelobe</th>
                  <th style={{ textAlign: 'right' }}>Scalloping loss</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Rectangular</td>
                  <td className={styles.numCell}>1.000</td>
                  <td className={styles.numCell}>1.000</td>
                  <td className={styles.numCell}>−13.3 dB</td>
                  <td className={styles.numCell}>3.92 dB</td>
                </tr>
                <tr>
                  <td>Hann</td>
                  <td className={styles.numCell}>0.500</td>
                  <td className={styles.numCell}>1.500</td>
                  <td className={styles.numCell}>−31.5 dB</td>
                  <td className={styles.numCell}>1.42 dB</td>
                </tr>
                <tr>
                  <td>Blackman</td>
                  <td className={styles.numCell}>0.420</td>
                  <td className={styles.numCell}>1.727</td>
                  <td className={styles.numCell}>−58.1 dB</td>
                  <td className={styles.numCell}>1.10 dB</td>
                </tr>
                <tr>
                  <td>4-term Blackman-Harris</td>
                  <td className={styles.numCell}>0.359</td>
                  <td className={styles.numCell}>2.004</td>
                  <td className={styles.numCell}>−92.0 dB</td>
                  <td className={styles.numCell}>0.83 dB</td>
                </tr>
                <tr>
                  <td>4-term Nuttall</td>
                  <td className={styles.numCell}>0.356</td>
                  <td className={styles.numCell}>2.021</td>
                  <td className={styles.numCell}>−98.1 dB</td>
                  <td className={styles.numCell}>0.82 dB</td>
                </tr>
                <tr>
                  <td>Flat-Top (ISO 18431)</td>
                  <td className={styles.numCell}>0.216</td>
                  <td className={styles.numCell}>3.770</td>
                  <td className={styles.numCell}>−93.0 dB</td>
                  <td className={styles.numCell}>0.01 dB</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.theorySection}>
          <h2>{t('fft.theory.s4Title')}</h2>
          <p>{t('fft.theory.s4Body')}</p>
          <div className={styles.formulaBox}>
            <KatexSpan
              text={String.raw`|e_{\text{linear}}| \le \frac{h^2}{8}\max|x''(t)|,\qquad |e_{\text{cubic}}| \le \frac{5\,h^4}{384}\max|x^{(4)}(t)|`}
              displayMode
            />
          </div>
        </div>

        <div className={styles.theorySection}>
          <h2>{t('fft.theory.refsTitle')}</h2>
          {bib.list()}
        </div>
      </section>
    </div>
  );
}
