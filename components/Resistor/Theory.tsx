import React, { useEffect, useState } from 'react';

import { CHIP_SIZES, SERIES, deratedPower, formatOhms, readAmount, series, seriesContaining } from '../../lib/resistor';
import css from '../../styles/ResistorTheory.module.css';
import Bibliography from '../Bibliography';
import KatexSpan from '../KatexSpan';
import { BandsFigure, DeratingChart, DividerFigure, KelvinFigure, ParallelFigure, ParasiticsFigure, SeriesFigure, eng } from './TheoryFigures';
import { Change, Resolved } from './view';

interface Props {
  bib: Bibliography;
  resolved: Resolved;
  onChange: (change: Change) => void;
}

// The topics, in the order of the page; the ids are the anchors (#theory-noise).
const TOPICS: { id: string; title: string }[] = [
  { id: 'ohm', title: 'What a resistor does' },
  { id: 'networks', title: 'Series, parallel and dividers' },
  { id: 'series', title: 'Preferred values: the E-series' },
  { id: 'codes', title: 'Reading bands and markings' },
  { id: 'technologies', title: 'Technologies compared' },
  { id: 'tolerance', title: 'Tolerance, temperature and how errors add up' },
  { id: 'power', title: 'Power, derating and limiting voltage' },
  { id: 'pulse', title: 'Pulses and overload' },
  { id: 'noise', title: 'Noise' },
  { id: 'vcr', title: 'Voltage coefficient' },
  { id: 'hf', title: 'High frequency' },
  { id: 'ageing', title: 'Ageing, moisture and sulfur' },
  { id: 'links', title: 'Zero-ohm links' },
  { id: 'sense', title: 'Current sensing and the Kelvin connection' },
];

const BOLTZMANN = 1.380649e-23;
const ROOM_KELVIN = 298.15;

const pct = (value: number, digits = 3) => `${Number(value.toPrecision(digits))} %`;
const list = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

function Eq({ text }: { text: string }) {
  return <div className={css.eq}><KatexSpan text={text} /></div>;
}

// The Theory section: what stands behind the tool's numbers, cited, and tied to the visitor's value where that
// turns an explanation into an answer.
export default function Theory({ bib, resolved, onChange }: Props) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [voltsText, setVoltsText] = useState('5');

  // On a phone the topics start folded, except the one a link points at.
  useEffect(() => {
    const target = window.location.hash.replace('#theory-', '');
    if (window.matchMedia('(max-width: 720px)').matches) {
      setClosed(Object.fromEntries(TOPICS.map(({ id }) => [id, id !== target])));
    }
  }, []);
  const setAll = (value: boolean) => setClosed(Object.fromEntries(TOPICS.map(({ id }) => [id, value])));

  const c = (...keys: string[]) => (
    <span className={css.cites}>{' '}{keys.map((key, i) => <React.Fragment key={key}>{i > 0 && ', '}{bib.cite(key)}</React.Fragment>)}</span>
  );
  const m = (text: string) => <KatexSpan text={text} />;
  const n = (text: React.ReactNode) => <span className={css.n}>{text}</span>;

  // The live items use the visitor's value, or 4.7 kΩ until one is typed.
  const yours = !resolved.example && resolved.ohms > 0;
  const R = yours ? resolved.ohms : 4700;
  const Rtext = formatOhms(R).replace(' ', ' ');
  const chip = resolved.chip;
  const head = (what: string) => (
    <div className={css.liveHead}>{yours ? 'Your value' : 'Example'}<span>{what}{yours ? '' : ' · type a value at the top to use yours'}</span></div>
  );

  const volts = readAmount(voltsText);
  const voltsOk = volts !== null && volts > 0;
  const amps = voltsOk ? volts / R : NaN;
  const watts = voltsOk ? (volts * volts) / R : NaN;

  const inSeries: string[] = seriesContaining(R).filter((id) => id !== 'E24+E96');
  const density = Math.sqrt(4 * BOLTZMANN * ROOM_KELVIN * R);
  const byPower = Math.sqrt(chip.power * R);
  const critical = chip.voltage ? (chip.voltage * chip.voltage) / chip.power : null;

  let number = 0;
  const topic = (id: string, children: React.ReactNode) => {
    const entry = TOPICS.find((t) => t.id === id);
    number += 1;
    return (
      <details key={id} id={`theory-${id}`} className={css.topic} open={!closed[id]}
        onToggle={(event) => { const open = event.currentTarget.open; setClosed((was) => (!was[id] === open ? was : { ...was, [id]: !open })); }}>
        <summary><span className={css.topicNo}>{number}</span><h3>{entry.title}</h3><span className={css.chevron} aria-hidden="true" /></summary>
        <div className={css.body}>{children}</div>
      </details>
    );
  };

  return (
    <div className={css.theory} data-testid="theory">
      <p className={css.lead}>
        What stands behind the numbers of this tool, short enough to read between two tasks. The boxes marked <i>your value</i> follow
        what you typed at the top. Numbers in brackets lead to the <a href="#references" className={css.jump}>sources</a>.
      </p>
      <ol className={css.contents}>
        {TOPICS.map(({ id, title }) => (
          <li key={id}><a href={`#theory-${id}`} onClick={() => setClosed((was) => ({ ...was, [id]: false }))}>{title}</a></li>
        ))}
      </ol>
      <div className={css.tools}>
        <button type="button" className={css.fold} onClick={() => setAll(false)}>Open all</button>
        <button type="button" className={css.fold} onClick={() => setAll(true)}>Fold all</button>
      </div>

      {topic('ohm', (
        <>
          <p>
            A resistor fixes the ratio between the voltage across it and the current through it (Ohm’s law), and turns the
            product of the two into heat:
          </p>
          <Eq text={'\\displaystyle V = I\\,R \\qquad\\quad P = V I = I^2 R = \\frac{V^2}{R}'} />
          <p>
            Two consequences are worth keeping in mind. At a fixed voltage the <i>smaller</i> resistor runs hotter, and power
            goes with the square: twice the voltage is four times the heat.
          </p>
          <div className={css.live}>
            {head('Ohm’s law and power')}
            <p>
              <label htmlFor="theory-volts">With </label>
              <input id="theory-volts" className={css.entry} value={voltsText} onChange={(event) => setVoltsText(event.target.value)}
                inputMode="decimal" spellCheck={false} autoComplete="off" aria-label="Voltage across the resistor, in volts" aria-invalid={!voltsOk} data-testid="theory-volts" />
              {' '}V across {n(Rtext)}:{' '}
              {voltsOk ? (
                <>
                  <span className={css.big} data-testid="theory-current">I = {eng(amps, 'A')}</span>{' '}and{' '}
                  <span className={css.big} data-testid="theory-power">P = {eng(watts, 'W')}</span>.
                </>
              ) : <span className={css.warn}>type a voltage above zero, such as 3.3 or 12.</span>}
            </p>
            {voltsOk && (
              <p className={css.small}>
                {watts > chip.power
                  ? <span className={css.warn}>That is more than a typical {chip.imperial} chip carries ({eng(chip.power, 'W')} up to 70 °C): see <a href="#theory-power">Power</a>.</span>
                  : <>That is {pct((watts / chip.power) * 100, 2)} of what a typical {chip.imperial} chip carries ({eng(chip.power, 'W')} up to 70 °C).</>}
              </p>
            )}
          </div>
        </>
      ))}

      {topic('networks', (
        <>
          <div className={css.figs}>
            <figure><SeriesFigure /><figcaption><span>{m('R = R_1 + R_2')}</span><span>same current in both</span></figcaption></figure>
            <figure><ParallelFigure /><figcaption><span>{m('\\displaystyle R = \\frac{R_1 R_2}{R_1 + R_2}')}</span><span>same voltage across both</span></figcaption></figure>
            <figure><DividerFigure /><figcaption><span>{m('\\displaystyle V_\\text{out} = V_\\text{in}\\,\\frac{R_2}{R_1 + R_2}')}</span><span>the output is a fraction of the input</span></figcaption></figure>
          </div>
          <ul>
            <li><b>In series</b> the resistances add, so the larger one dominates. The voltage divides in proportion to the resistances, and so does the power.</li>
            <li><b>In parallel</b> the conductances {m('1/R')} add, so the smaller one dominates. The current divides in inverse proportion: the smaller resistor carries more and gets hotter.</li>
            <li>A much larger resistor in parallel trims a value down a little: {m('R \\parallel kR = R\\,k/(k+1)')}, so 100 times larger takes off 1 %. That is how <a href="#combinations" className={css.jump}>Combinations</a> reaches values that no series has.</li>
            <li><b>A divider</b> seen from its output is a source of {m('V_\\text{out}')} behind the resistance {m('R_1 \\parallel R_2')}. A load pulls the output down unless it is much larger than that; <a href="#design" className={css.jump}>Design</a> takes the load into the calculation.</li>
          </ul>
        </>
      ))}

      {topic('series', (
        <>
          <p>
            A part marked {m('R')} with a tolerance of {m('\\pm t')} may be anywhere from {m('R(1-t)')} to {m('R(1+t)')}. Values closer
            together than that would overlap, so standard values are spaced by a constant ratio, with {m('m')} values in each
            decade{c('VishayBasics')}. These are the E-series, defined by IEC 60063{c('IEC60063')}:
          </p>
          <Eq text={'\\displaystyle R_n = 10^{\\,n/m}, \\qquad n = 0,\\,1,\\,\\ldots,\\,m-1'} />
          <div className={css.wide}><BandsFigure values={series('E12').mantissas} /></div>
          <p className={css.small}>E12 with the range of each value at ±10 %: the ranges of neighbours just meet, so every resistance has a home.</p>
          <div className={css.wide}>
            <table className={css.table} data-testid="theory-series">
              <thead>
                <tr><th scope="col">Series</th><th scope="col" className={css.r}>Values per decade</th><th scope="col" className={css.r}>Step ratio</th><th scope="col" className={css.r}>Ranges meet at</th><th scope="col">Sold at{c('WikiE', 'VishayBasics')}</th></tr>
              </thead>
              <tbody>
                {SERIES.filter((s) => s.id !== 'E24+E96').map((s) => {
                  const ratio = 10 ** (1 / s.mantissas.length);
                  return (
                    <tr key={s.id} data-on={inSeries.includes(s.id) || undefined}>
                      <th scope="row">{s.label}</th>
                      <td className={css.r}>{n(s.mantissas.length)}</td>
                      <td className={css.r}>{n(ratio.toFixed(4))}</td>
                      <td className={css.r}>{n(`±${pct(((ratio - 1) / (ratio + 1)) * 100)}`)}</td>
                      <td>{s.tolerance}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={css.small} data-testid="theory-series-note">
            Step ratio is {m('10^{1/m}')}; “ranges meet at” is the tolerance {m('(r-1)/(r+1)')} at which the ranges of two neighbours touch.{' '}
            {inSeries.length > 0
              ? <>{yours ? 'Your value' : 'The example'}, {n(Rtext)}, is a value of {list(inSeries)} (marked).</>
              : <>{yours ? 'Your value' : 'The example'}, {n(Rtext)}, is in none of these series: <a href="#lookup" className={css.jump}>Lookup</a> has its neighbours.</>}
          </p>
          <p>The series have quirks that a formula alone gets wrong:</p>
          <ul>
            <li>E3 to E24 have two significant figures, E48 to E192 three. E24 is an older table: eight of its values (2.7 to 4.7, and 8.2) are not what the formula rounds to{c('WikiE')}.</li>
            <li>E12, E6 and E3 are every 2nd, 4th and 8th value of E24; E96 and E48 are every 2nd and 4th value of E192, where 9.20 stands in place of the calculated 9.19{c('WikiE')}.</li>
            <li>E24 is <i>not</i> part of E96: 1.2, 1.6 and 1.8 are missing there (E96 has 1.21, 1.62 and 1.82). In practice 1 % resistors are sold in both sets, which is why the tool also offers E24 ∪ E96.</li>
          </ul>
        </>
      ))}

      {topic('codes', (
        <>
          <p>
            <b>Colour bands</b> follow IEC 60062{c('IEC60062')}: two or three digits, a multiplier, then the tolerance, set apart by a
            wider gap, and on some parts the temperature coefficient. The 2016 edition added pink for × 0.001{c('IEC60062')}, and its
            orange and yellow tolerances are missing from many older tables{c('WikiColor')}.
          </p>
          <p>
            <b>Chip markings</b> have three or four characters, the last being the number of zeros: 472 is 4.7 kΩ and 1331 is 1.33 kΩ.
            An R stands for the decimal point. 1 % parts in size 0603 carry the EIA-96 code instead: two digits that number the E96
            value, and a letter for the multiplier{c('TTTN004')}. The smallest sizes carry nothing at all{c('YageoRC')}.
          </p>
          <p>
            A code is not always unique: 601 upside down is 109, and makers disagree on two EIA-96 letters. The tool shows every
            reading; when it matters, measure the part. The full tables are in <a href="#reference" className={css.jump}>Reference</a>.
          </p>
        </>
      ))}

      {topic('technologies', (
        <>
          <p>
            Most resistors are a resistive layer on a ceramic body, trimmed to value. What the layer is made of decides nearly
            everything else: how tight the tolerance can be, how much the value moves with temperature, and how much noise it adds.
          </p>
          <div className={css.wide}>
            <table className={[css.table, css.tech].join(' ')} data-testid="theory-tech">
              <thead>
                <tr><th scope="col">Type</th><th scope="col">Tolerance</th><th scope="col">TCR, ppm/K</th><th scope="col">Excess noise</th><th scope="col">Stability</th><th scope="col">Typical use</th></tr>
              </thead>
              <tbody>
                <tr><th scope="row">Thick film</th><td>±1 to ±5 %{c('VishayBasics')}</td><td>±50 to ±200{c('VishayBasics')}; general-purpose chips ±100 or ±200{c('VishayCRCW')}</td><td>highest of the films</td><td>±1 % after 1000 h specified{c('VishayCRCW')}</td><td>The default chip resistor</td></tr>
                <tr><th scope="row">Thin film</th><td>±0.1 to ±1 %{c('VishayTNPW')}</td><td>±10 to ±50{c('VishayTNPW')}</td><td>low{c('Beev2021')}</td><td>below 0.1 % in damp heat{c('VishayTNPW')}</td><td>Precision dividers, gain, references</td></tr>
                <tr><th scope="row">Metal film</th><td>±0.1 to ±2 %{c('VishayBasics')}</td><td>±5 to ±50{c('VishayBasics')}</td><td>low</td><td>good</td><td>Precise leaded parts and MELF</td></tr>
                <tr><th scope="row">Carbon film</th><td>±2 to ±10 %{c('VishayBasics')}</td><td>−200 to −1500{c('VishayBasics')}</td><td>higher</td><td>fair</td><td>Cheap general-purpose leaded parts{c('YageoCFR')}</td></tr>
                <tr><th scope="row">Metal oxide †</th><td>±1 to ±5 %</td><td>±75 to ±300</td><td>higher</td><td>good at high temperature</td><td>Leaded power resistors</td></tr>
                <tr><th scope="row">Wirewound</th><td>±0.1 to ±10 %{c('VishayBasics')}</td><td>±1 to ±200{c('VishayBasics')}</td><td>very low</td><td>very good</td><td>Power and precision; inductive{c('VishayBasics')}</td></tr>
                <tr><th scope="row">Metal foil †</th><td>±0.005 to ±0.1 %</td><td>about ±0.2 to ±5</td><td>lowest{c('Beev2021')}</td><td>best</td><td>References and measurement</td></tr>
              </tbody>
            </table>
          </div>
          <p className={css.small}>
            The ranges are what each kind is usually made in, not limits. † Typical figures for which no datasheet was checked.
            The noise and stability columns without a source rank the kinds as they are generally known; for a design, the datasheet decides.
            The carbon film coefficient is negative: the resistance falls as the part warms up.
          </p>
        </>
      ))}

      {topic('tolerance', (
        <>
          <p>
            The <b>tolerance</b> is the largest deviation from the marked value when the part is delivered. The <b>temperature
            coefficient</b> (TCR) is the relative change of resistance per kelvin, in ppm/K{c('VishayBasics')}: 100 ppm/K over 100 K is 1 %.
            The tool combines the two as
          </p>
          <Eq text={'\\displaystyle R(T) = R_\\text{nom}\\,(1 + d)\\,\\bigl(1 + \\alpha\\,(T - 25\\,^\\circ\\text{C})\\bigr), \\qquad |d| \\le t,\\quad |\\alpha| \\le \\text{TCR}'} />
          <p>
            Soldering and ageing come on top (see <a href="#theory-ageing" className={css.jump}>Ageing</a>). When several parts set one
            quantity, each contributes its tolerance {m('t_i')} times a sensitivity {m('S_i')}: how many percent the result moves for one
            percent of that part{c('TISNVA112')}.
          </p>
          <Eq text={'\\displaystyle \\Delta_\\text{worst} = \\sum_i |S_i|\\,t_i \\qquad\\quad \\Delta_\\text{RSS} = \\sqrt{\\sum_i \\bigl(S_i\\,t_i\\bigr)^2}'} />
          <ul>
            <li><b>Worst case</b> puts every part at the limit that pushes the result furthest. Nothing lies beyond it, so it is the figure to design to when every unit must work.</li>
            <li><b>RSS</b>, the root of the sum of the squares, is the spread to expect across many units. It holds only for independent, normally distributed deviations{c('TISNVA112')}, so it is an estimate and not a guarantee.</li>
            <li>
              <b>Sensitivities are below one in a ratio.</b> For a regulator with {m('V_\\text{out} = V_\\text{ref}(1 + R_1/R_2)')} and two
              parts of tolerance {m('t')}, the worst case from the resistors is about {m('2t\\,(1 - V_\\text{ref}/V_\\text{out})')}: less than {m('2t')}, and
              smaller the closer the output is to the reference{c('TISLVA423')}. A divider with {m('k = R_2/(R_1+R_2)')} gives {m('2t\\,(1-k)')} the same way.
            </li>
            <li>
              <b>Tracking.</b> In a ratio only the <i>difference</i> between the drifts counts. Parts of the same kind and lot, at the same
              temperature, tend to drift alike, but how closely is specified only for matched networks. “Parts track” in <a href="#design" className={css.jump}>Design</a> is
              therefore an assumption that you set, with a spread of your choice. No source was checked for it.
            </li>
          </ul>
        </>
      ))}

      {topic('power', (
        <>
          <p>
            The rated power holds up to an ambient temperature of 70 °C. Above it the rating falls in a straight line to zero at the
            maximum temperature of the film: 155 °C for chips of size 0402 to 2512 and 125 °C for the smallest sizes in Yageo’s general-purpose
            series{c('YageoRC')}; Vishay rates its 0201 film to 155 °C{c('VishayCRCW0201')}. Other makers draw the same shape{c('VishayBasics')}.
          </p>
          <Eq text={'\\displaystyle P(T) = P_{70}\\,\\frac{T_\\text{max} - T}{T_\\text{max} - 70\\,^\\circ\\text{C}} \\qquad \\text{for } T > 70\\,^\\circ\\text{C}'} />
          <div className={css.live}>
            <div className={css.liveHead}>Chip size
              <span>
                <select className={css.pick} value={chip.imperial} onChange={(event) => onChange({ view: { size: event.target.value } })} aria-label="Size of the chip for the derating curve" data-testid="theory-size">
                  {CHIP_SIZES.map((size) => <option key={size.imperial} value={size.imperial}>{size.imperial}</option>)}
                </select>
                {' '}· the size of the drawing; ratings are typical{c('VishayCRCW', 'YageoRC')}
              </span>
            </div>
            <div className={css.chartRow}>
              <DeratingChart size={chip} />
              <div>
                <p data-testid="theory-derating">
                  A typical {chip.imperial} carries {n(eng(chip.power, 'W'))} up to 70 °C
                  {[85, 100, 125].filter((t) => t < chip.maxTemperature).map((t) => <React.Fragment key={t}>, {n(eng(deratedPower(chip.power, t, chip.maxTemperature), 'W'))} at {t} °C</React.Fragment>)}
                  {' '}and nothing at {chip.maxTemperature} °C.
                </p>
                <p className={css.small} data-testid="theory-voltage">
                  Across {n(Rtext)} the power allows {n(eng(byPower, 'V'))}
                  {chip.voltage
                    ? byPower <= chip.voltage
                      ? <>, less than the limiting voltage of {n(`${chip.voltage} V`)}: the power sets the limit.</>
                      : <>, but the limiting voltage is {n(`${chip.voltage} V`)}: the voltage sets the limit, at {n(eng((chip.voltage * chip.voltage) / R, 'W'))}.</>
                    : '; no limiting voltage was found for this size.'}
                  {critical !== null && <> The two meet at {n(formatOhms(Number(critical.toPrecision(3))).replace(' ', ' '))}.</>}
                </p>
              </div>
            </div>
          </div>
          <p>
            <b>Limiting voltage.</b> The voltage a resistor may see is {m('\\sqrt{P R}')} or the maximum working voltage of its size,
            whichever is less{c('YageoRC')}. For high values the voltage limit comes first, at the critical resistance {m('R_\\text{crit} = V_\\text{limit}^2 / P_{70}')}:
            a 1 MΩ chip never reaches its rated power. The limits differ by maker{c('VishayCRCW')}; <a href="#reference" className={css.jump}>Reference</a> lists them.
          </p>
          <p>
            <b>Self-heating.</b> The film is hotter than its surroundings by {m('\\Delta T = P\\,R_\\text{th}')}{c('VishayBasics')}. The heat
            leaves through the terminations into the copper, a chain of thermal resistances in series: the part, the solder joint, the
            board{c('VishayThermal')}. The part itself is the small link, 38 K/W for an 0805 and 32 K/W for a 1206 thin film chip{c('VishayTNPV')};
            the board usually decides. So a rating is only as good as the copper around the part, and a warm resistor has also moved
            by its temperature coefficient.
          </p>
        </>
      ))}

      {topic('pulse', (
        <>
          <p>
            For a short time a resistor withstands far more than its rated power, because the heat first goes into the mass of the
            element and its body before it has to leave. How much depends on the length and shape of the pulse, on how often it
            repeats, and on the technology.
          </p>
          <p>
            The rated power says nothing about this. Datasheets give it as pulse-load diagrams: the permitted peak power or voltage
            against the pulse length, measured with the pulse tests of IEC 60115-1{c('VishayBasics')}. Check the single pulse against
            the diagram, and the average power of a repeating pulse against the derated rating.
          </p>
          <p>
            A useful fixed point: a capacitor that is charged or discharged through a resistor leaves the energy {m('E = \\tfrac12 C V^2')} in
            it, whatever the resistance. A larger resistor only spreads that energy over a longer time. As a rule, parts with more
            resistive material (wirewound, larger sizes) take more energy than thin, finely trimmed films; this rule comes without a source here.
          </p>
        </>
      ))}

      {topic('noise', (
        <>
          <p>
            <b>Thermal noise</b> is present in every resistor, whatever it is made of. It was measured by Johnson{c('Johnson1928')} and
            explained by Nyquist{c('Nyquist1928')}: its voltage density depends only on the resistance and the absolute temperature,
            and it is the same at every frequency.
          </p>
          <Eq text={'\\displaystyle e_n = \\sqrt{4\\,k\\,T\\,R} \\quad \\text{per } \\sqrt{\\text{Hz}}, \\qquad v_n = e_n \\sqrt{B}'} />
          <div className={css.live}>
            {head('Thermal noise at 25 °C')}
            <p>
              {n(Rtext)} has <span className={css.big} data-testid="theory-noise">{eng(density, 'V')}/√Hz</span>
              : {n(eng(density * Math.sqrt(20e3), 'V'))} rms over 20 kHz, {n(eng(density * Math.sqrt(1e6), 'V'))} rms over 1 MHz.
            </p>
            <p className={css.small}>A hundred times the resistance is ten times the noise voltage. 1 kΩ has about 4 nV/√Hz.</p>
          </div>
          <p>
            <b>Excess noise</b> (current noise) comes on top when a direct voltage lies across the part. It grows with that voltage
            and falls with frequency, and it depends on the material. It is given as a noise index, in microvolts of noise per volt
            applied within one decade of frequency, measured as IEC 60195 describes{c('VishayBasics')}. Metal foil has the least, thin
            film little more{c('Beev2021')}; thick film and carbon are generally the noisiest. Where it matters (a high-value
            resistor with a direct voltage across it at the input of an amplifier), use thin film or metal film.
          </p>
        </>
      ))}

      {topic('vcr', (
        <>
          <p>
            The resistance also depends slightly on the voltage across the part: {m('R(V) \\approx R_0\\,(1 + c\\,V)')}, with the voltage
            coefficient {m('c')} in ppm/V, usually negative. It matters where the voltage is large or changes: high-voltage dividers,
            and signal paths where a resistance that moves with the signal adds distortion.
          </p>
          <p>
            Thin film chips made for high voltage are specified below 1 ppm/V{c('VishayTNPV')}. Thick film and carbon parts typically
            have a much larger coefficient, and most datasheets do not state it at all; no figure for them was checked here. A divider
            for several hundred volts is better made of several resistors in series, which also shares out the limiting voltage.
          </p>
        </>
      ))}

      {topic('hf', (
        <>
          <div className={css.figs}>
            <figure><ParasiticsFigure /></figure>
          </div>
          <p>
            A real resistor has a small inductance in series, from its length and its leads, and a small capacitance across it,
            between its ends{c('VishayBasics')}. Which of the two is seen first depends on the value:
          </p>
          <ul>
            <li><b>Low values</b> turn inductive: the impedance rises above {m('f_L = R / (2\\pi L)')}.</li>
            <li><b>High values</b> turn capacitive: the impedance falls above {m('f_C = 1 / (2\\pi R C)')}.</li>
          </ul>
          <p>
            Wirewound resistors are the worst at high frequency{c('VishayBasics')}; a chip is better than a leaded part because it is
            shorter, and a smaller chip better than a larger one. Typical figures for the parasitics are not given here: none were
            checked against a source, and the pads and traces around the part add as much.
          </p>
        </>
      ))}

      {topic('ageing', (
        <>
          <p>
            A resistor drifts over its life, faster when it runs hot and under load. A general-purpose thick film chip is specified to
            stay within ±1 % over 1000 hours{c('VishayCRCW')}; a thin film chip changes by less than 0.1 % in 1000 hours at 85 °C and
            85 % relative humidity{c('VishayTNPW')}. In a precise design this drift belongs in the error budget beside tolerance and TCR.
          </p>
          <p>
            <b>Sulfur.</b> The inner terminations of ordinary thick film chips contain silver, which sulfur in the air (from rubber,
            oils, some industrial and polluted atmospheres) slowly turns into a poor conductor: the resistance climbs and the part
            finally goes open. Sulfur-resistant parts are tested for it, by ASTM B 809 and ANSI/EIA-977{c('VishayTNPW')}. The mechanism
            is described here from general knowledge, without a source.
          </p>
        </>
      ))}

      {topic('links', (
        <>
          <p>
            A zero-ohm link is a resistor body with a conductor in place of the film: a bridge over a trace, an option to fit or
            leave out, or a place where a real value may go later. A chip is marked 0 or 000, a leaded link has a single black band.
          </p>
          <p>
            It is not zero, and it is rated by current, not by power. Vishay’s general-purpose chips have at most 20 mΩ and carry
            1.5 A (0402), 2 A (0603), 2.5 A (0805), 3.5 A (1206) and 5 A (1210) at 70 °C{c('VishayCRCW')}; an 0201 link has at most 50 mΩ and
            carries 1 A{c('VishayCRCW0201')}. In a power path, add those milliohms to the voltage drop.
          </p>
        </>
      ))}

      {topic('sense', (
        <>
          <p>
            A shunt turns a current into a voltage, directly and linearly{c('VishayCurrent')}: {m('V = I R')}. Its value is a compromise.
            A larger shunt gives more signal against the offset and noise of the amplifier, but drops more voltage and
            dissipates {m('P = I^2 R')}; <a href="#design" className={css.jump}>Design</a> has a circuit for it.
          </p>
          <div className={css.figs}>
            <figure><KelvinFigure /></figure>
          </div>
          <p>
            At low values the solder joints and the copper are no longer small against the shunt, and copper changes by about
            3900 ppm/K. Below roughly 25 mΩ a <b>Kelvin connection</b> is used: four-terminal parts, or two thin sense traces taken
            from the inner edges of the pads, keep the current path apart from the points where the voltage is measured, so that
            contact resistance and copper stay out of the result{c('VishayCurrent')}.
          </p>
        </>
      ))}
    </div>
  );
}
