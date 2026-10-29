import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import Bibliography from '../../components/Bibliography';
import HomeIcon from '../../components/icons/home';
import CalcBox from '../../components/SimSetup/CalcBox';
import CoherentSampling from '../../components/SimSetup/CoherentSampling';
import ParameterList from '../../components/SimSetup/ParameterList';
import PowerBox from '../../components/SimSetup/PowerBox';
import PrimeBox, { MAX_PRIME_DIGITS } from '../../components/SimSetup/PrimeBox';
import { BibEntry } from '../../lib/bibtex';
import { loadReferences } from '../../lib/references';
import { BoxState, defaultBox } from '../../lib/simsetup/calc';
import { DigitGrouping, NumberFormat } from '../../lib/simsetup/numbers';
import useReplayHighlight from '../../lib/useReplayHighlight';
import styles from '../../styles/SimSetup.module.css';

const DEFAULT_PRECISION = 11;
// A double holds 15 to 17 significant digits; more would only show rounding noise.
const MAX_PRECISION = 17;

function parsePrecision(text: string): number | null {
  const n = Number(text);
  return text.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= MAX_PRECISION ? n : null;
}

// Reads references.bib when the site is built.
export async function getStaticProps() {
  return { props: { references: loadReferences() } };
}

export default function SimSetup({ references }: { references: BibEntry[] }) {
  const nextId = React.useRef(3);
  const [boxes, setBoxes] = React.useState<BoxState[]>(() => [defaultBox(1), defaultBox(2)]);
  const [precisionText, setPrecisionText] = React.useState(String(DEFAULT_PRECISION));
  const [precision, setPrecision] = React.useState(DEFAULT_PRECISION);
  const [format, setFormat] = React.useState<NumberFormat>('plain');
  const [grouping, setGrouping] = React.useState<DigitGrouping>('none');

  const bib = new Bibliography(references);
  useReplayHighlight();

  const precisionValid = parsePrecision(precisionText) !== null;

  function changePrecision(text: string) {
    setPrecisionText(text);
    const n = parsePrecision(text);
    if (n !== null) setPrecision(n);
  }

  function updateBox(box: BoxState) {
    setBoxes((all) => all.map((b) => (b.id === box.id ? box : b)));
  }

  function duplicateBox(id: number) {
    const newId = nextId.current++;
    setBoxes((all) => {
      const i = all.findIndex((b) => b.id === id);
      return [...all.slice(0, i + 1), { ...all[i], id: newId }, ...all.slice(i + 1)];
    });
  }

  function addBox() {
    const newId = nextId.current++;
    setBoxes((all) => [...all, defaultBox(newId)]);
  }

  function removeBox(id: number) {
    setBoxes((all) => all.filter((b) => b.id !== id));
  }

  return (
    <div className={styles.page}>
      <Head>
        <title>Simulator setup tool</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <style jsx global>{`
        html,
        body {
          margin: 0;
          padding: 0;
          background: #2b2b2b;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>

      <div className={styles.column}>
        <header className={styles.header}>
          <Link href="/" className={styles.homeLink} aria-label="Home"><HomeIcon /></Link>
          <h1 className={styles.title}>Simulator setup tool</h1>
        </header>
        <p className={styles.lead}>
          Calculates f<sub>0</sub>, F<sub>S</sub>, N<sub>cyc</sub> and N<sub>pts</sub> for FFTs and simulations, and checks them
          against the rules for coherent sampling. Everything runs in your browser.
        </p>

        <main className={styles.content}>
          <section className={styles.card} aria-labelledby="calculator-title">
            <div className={styles.cardHeader}>
              <h2 id="calculator-title">Calculator</h2>
              <div className={styles.toolbar}>
                <label className={styles.inlineField} title="Significant digits shown for calculated values">
                  <span>Precision</span>
                  <input
                    className={[styles.input, styles.precisionInput].join(' ')}
                    type="number"
                    min={1}
                    max={MAX_PRECISION}
                    step={1}
                    value={precisionText}
                    onChange={(e) => changePrecision(e.target.value)}
                    onBlur={() => setPrecisionText(String(precision))}
                    aria-invalid={precisionValid ? undefined : true}
                  />
                  <span>digits</span>
                </label>
                <label className={styles.inlineField}>
                  <span>Format</span>
                  <select className={styles.select} value={format} onChange={(e) => setFormat(e.target.value as NumberFormat)}>
                    <option value="plain">Plain (2340571.4286 Hz)</option>
                    <option value="si">SI prefixes (2.3405714286 MHz)</option>
                  </select>
                </label>
                <label className={styles.inlineField} title="How long numbers are split into groups of three digits">
                  <span>Grouping</span>
                  <select className={styles.select} value={grouping} onChange={(e) => setGrouping(e.target.value as DigitGrouping)}>
                    <option value="none">None (1000000)</option>
                    <option value="space">Space (1 000 000)</option>
                    <option value="underscore">Underscore, Python (1_000_000)</option>
                  </select>
                </label>
                <button type="button" className={styles.buttonSmall} onClick={addBox}>Add box</button>
              </div>
            </div>
            {!precisionValid && (
              <p className={styles.fieldError}>Precision must be a whole number from 1 to {MAX_PRECISION}. Using {precision}.</p>
            )}

            <div className={styles.boxGrid}>
              {boxes.map((box, i) => (
                <CalcBox
                  key={box.id}
                  box={box}
                  title={`Box ${i + 1}`}
                  precision={precision}
                  format={format}
                  grouping={grouping}
                  canRemove={boxes.length > 1}
                  onChange={updateBox}
                  onDuplicate={() => duplicateBox(box.id)}
                  onRemove={() => removeBox(box.id)}
                />
              ))}
            </div>
          </section>

          <div className={styles.helperGrid}>
            <PrimeBox grouping={grouping} />
            <PowerBox grouping={grouping} />
          </div>

          <section className={[styles.card, styles.text].join(' ')} aria-labelledby="usage-title">
            <h2 id="usage-title">How to use</h2>
            <dl className={styles.usage}>
              <dt>Calculator</dt>
              <dd>
                Each box works with the four parameters in the equation under Parameters below. Choose the one to calculate
                under <b>Calculate</b> and type the other three. The calculated value has a blue frame. When you choose
                another parameter to calculate, the value that was calculated moves into its input field with all its digits,
                so the results stay the same until you change something.
              </dd>

              <dt>Comparing</dt>
              <dd>
                The boxes are independent of each other. <b>Duplicate</b> copies a box, so you can change one value and
                compare the two. <b>Add box</b> adds a box with the starting values, and <b>Remove</b> deletes a box.
              </dd>

              <dt>Typing numbers</dt>
              <dd>
                Type plain numbers (<code>16384</code>, <code>0.001</code>), exponents (<code>1e3</code>, <code>2.5E-6</code>) or
                SI prefixes (<code>1k</code>, <code>2.5M</code>, <code>10m</code>, <code>100u</code> or <code>100µ</code>).
                A space before the prefix is fine, and the unit may follow it (<code>1 kHz</code>, <code>10 ms</code>).
                Prefixes are case sensitive: <code>m</code> is milli and <code>M</code> is mega. <code>meg</code> also means
                mega, as in SPICE. Digit groups are fine too (<code>1 000 000</code> or <code>1_000_000</code>), here and in
                the prime and power of 2 boxes.
              </dd>

              <dt>Results</dt>
              <dd>
                <b>Precision</b> is the number of significant digits shown for calculated values, from 1 to {MAX_PRECISION}.
                It only changes how the results are shown, not how they are calculated. <b>Format</b> shows the results
                as plain numbers or with SI prefixes. SPICE reads <code>M</code> as milli, so copy plain numbers, or
                use <code>meg</code>, when you set up a SPICE simulation. <b>Grouping</b> splits the whole-number part into
                groups of three digits: none (<code>2340571.4286</code>, which works everywhere), spaces
                (<code>2 340 571.4286</code>) or underscores (<code>2_340_571.4286</code>, which Python reads as a number).
                It is also used for the numbers that the prime and power of 2 buttons write.
              </dd>

              <dt>t<sub>start</sub> and t<sub>stop</sub></dt>
              <dd>
                Type the time at which sampling starts in t<sub>start</sub>. t<sub>stop</sub> is t<sub>start</sub> plus
                N<sub>cyc</sub> periods of f<sub>0</sub>.
              </dd>

              <dt>Checks</dt>
              <dd>
                Next to N<sub>cyc</sub> and N<sub>pts</sub> (below them on phones), each box shows how they match{' '}
                <a href="#rule-1">RULE 1</a> and <a href="#rule-2">RULE 2</a> under Coherent sampling: whether N<sub>cyc</sub> is an integer, a prime or an odd number, and has no common factor with
                N<sub>pts</sub>, and whether N<sub>pts</sub> is a power of 2. <span className={styles.good}>✓ Green</span> follows
                the rule, <span className={styles.ok}>• yellow</span> is acceptable (odd, but not prime)
                and <span className={styles.bad}>✗ red</span> breaks it. A calculated value such as 7.000000000000001 counts
                as an integer, since the difference comes from rounding in the computer.
              </dd>

              <dt>Prime numbers</dt>
              <dd>
                Shows whether the number is prime. <b>Prev</b> and <b>Next</b> go to the closest prime below or above the
                number. <b>÷2</b>, <b>÷10</b> and <b>÷1000</b> go to the first prime after the number divided by 2, 10 or 1000,
                and <b>×2</b>, <b>×10</b> and <b>×1000</b> to the first prime after the number multiplied by 2, 10 or 1000.
                The number itself does not have to be prime. Numbers can have up to {MAX_PRIME_DIGITS} digits. Below
                3.3·10<sup>24</sup> the answer is exact. Above that, the test (Miller–Rabin) lets a few rare numbers through
                that are not prime, so the answer is &ldquo;Probably prime&rdquo;.
              </dd>

              <dt>Powers of 2</dt>
              <dd>
                Shows whether the number is an exact power of 2, and its exponent: 2<sup>n</sup> = for an exact power of 2,
                and 2<sup>x</sup> ≈ otherwise. <b>&lt;&lt;1</b> and <b>&lt;&lt;4</b> shift the number left by 1 or 4 bits
                (multiply by 2 or 16), and <b>&gt;&gt;1</b> and <b>&gt;&gt;4</b> shift it right (divide by 2 or 16, rounded
                down). <b>Prev</b> and <b>Next</b> go to the closest power of 2 below or above the number. You can also type
                hexadecimal (<code>0x4000</code>) or binary (<code>0b100</code>) numbers.
              </dd>
            </dl>
          </section>

          <section className={[styles.card, styles.text].join(' ')} aria-labelledby="parameters-title">
            <h2 id="parameters-title">Parameters</h2>
            <ParameterList />
          </section>

          <section className={[styles.card, styles.text].join(' ')} aria-labelledby="coherent-title">
            <CoherentSampling bib={bib} />
          </section>

          <section className={[styles.card, styles.text].join(' ')} aria-labelledby="references-title">
            <h2 id="references-title">References</h2>
            {bib.list()}
          </section>
        </main>
      </div>
    </div>
  );
}
