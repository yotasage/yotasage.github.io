import React, { useEffect, useState } from 'react';

import { CHIP_SIZES, SERIES, deratedPower, formatOhms, readAmount, series, seriesContaining } from '../../lib/resistor';
import { useI18n } from '../../lib/ui/i18n';
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

const TOPIC_IDS = [
  'ohm', 'networks', 'series', 'codes', 'technologies', 'tolerance', 'power',
  'pulse', 'noise', 'vcr', 'hf', 'ageing', 'links', 'sense',
];

const BOLTZMANN = 1.380649e-23;
const ROOM_KELVIN = 298.15;
const pct = (value: number, digits = 3) => `${Number(value.toPrecision(digits))} %`;

function Eq({ text }: { text: string }) {
  return <div className={css.eq}><KatexSpan text={text} /></div>;
}

export default function Theory({ bib, resolved, onChange }: Props) {
  const { t } = useI18n();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [voltsText, setVoltsText] = useState('5');

  const list = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${t('res.and')} ${items[items.length - 1]}`);

  useEffect(() => {
    const target = window.location.hash.replace('#theory-', '');
    if (window.matchMedia('(max-width: 720px)').matches) {
      setClosed(Object.fromEntries(TOPIC_IDS.map((id) => [id, id !== target])));
    }
  }, []);
  const setAll = (value: boolean) => setClosed(Object.fromEntries(TOPIC_IDS.map((id) => [id, value])));

  const c = (...keys: string[]) => (
    <span className={css.cites}>{' '}{keys.map((key, i) => <React.Fragment key={key}>{i > 0 && ', '}{bib.cite(key)}</React.Fragment>)}</span>
  );
  const m = (text: string) => <KatexSpan text={text} />;
  const n = (text: React.ReactNode) => <span className={css.n}>{text}</span>;

  const yours = !resolved.example && resolved.ohms > 0;
  const R = yours ? resolved.ohms : 4700;
  const Rtext = formatOhms(R).replace(' ', ' ');
  const chip = resolved.chip;
  const head = (what: string) => (
    <div className={css.liveHead}>{yours ? t('res.t.yourVal') : t('res.t.example')}<span>{what}{yours ? '' : t('res.t.typeTopHint')}</span></div>
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
    number += 1;
    return (
      <details key={id} id={`theory-${id}`} className={css.topic} open={!closed[id]}
        onToggle={(event) => { const open = event.currentTarget.open; setClosed((was) => (!was[id] === open ? was : { ...was, [id]: !open })); }}>
        <summary><span className={css.topicNo}>{number}</span><h3>{t(`res.t.topic.${id}`)}</h3><span className={css.chevron} aria-hidden="true" /></summary>
        <div className={css.body}>{children}</div>
      </details>
    );
  };

  return (
    <div className={css.theory} data-testid="theory">
      <p className={css.lead}>
        {t('res.t.lead1')}<i>{t('res.t.lead2')}</i>{t('res.t.lead3')}<a href="#references" className={css.jump}>{t('res.t.leadSources')}</a>.
      </p>
      <ol className={css.contents}>
        {TOPIC_IDS.map((id) => (
          <li key={id}><a href={`#theory-${id}`} onClick={() => setClosed((was) => ({ ...was, [id]: false }))}>{t(`res.t.topic.${id}`)}</a></li>
        ))}
      </ol>
      <div className={css.tools}>
        <button type="button" className={css.fold} onClick={() => setAll(false)}>{t('res.t.openAll')}</button>
        <button type="button" className={css.fold} onClick={() => setAll(true)}>{t('res.t.foldAll')}</button>
      </div>

      {topic('ohm', (
        <>
          <p>{t('res.t.ohm.p1')}</p>
          <Eq text={'\\displaystyle V = I\\,R \\qquad\\quad P = V I = I^2 R = \\frac{V^2}{R}'} />
          <p>{t('res.t.ohm.p2a')}<i>{t('res.t.ohm.p2b')}</i>{t('res.t.ohm.p2c')}</p>
          <div className={css.live}>
            {head(t('res.t.ohm.liveHead'))}
            <p>
              <label htmlFor="theory-volts">{t('res.t.ohm.with')}</label>
              <input id="theory-volts" className={css.entry} value={voltsText} onChange={(event) => setVoltsText(event.target.value)}
                inputMode="decimal" spellCheck={false} autoComplete="off" aria-label={t('res.t.ohm.voltsAria')} aria-invalid={!voltsOk} data-testid="theory-volts" />
              {t('res.t.ohm.vAcross')}{n(Rtext)}:{' '}
              {voltsOk ? (
                <>
                  <span className={css.big} data-testid="theory-current">I = {eng(amps, 'A')}</span>{' '}{t('res.and')}{' '}
                  <span className={css.big} data-testid="theory-power">P = {eng(watts, 'W')}</span>.
                </>
              ) : <span className={css.warn}>{t('res.t.ohm.typePos')}</span>}
            </p>
            {voltsOk && (
              <p className={css.small}>
                {watts > chip.power
                  ? <span className={css.warn}>{t('res.t.ohm.moreThan', { imp: chip.imperial, pwr: eng(chip.power, 'W') })}<a href="#theory-power">{t('res.t.ohm.powerLink')}</a>.</span>
                  : <>{t('res.t.ohm.pctOf', { pct: pct((watts / chip.power) * 100, 2), imp: chip.imperial, pwr: eng(chip.power, 'W') })}</>}
              </p>
            )}
          </div>
        </>
      ))}

      {topic('networks', (
        <>
          <div className={css.figs}>
            <figure><SeriesFigure /><figcaption><span>{m('R = R_1 + R_2')}</span><span>{t('res.t.net.capSer')}</span></figcaption></figure>
            <figure><ParallelFigure /><figcaption><span>{m('\\displaystyle R = \\frac{R_1 R_2}{R_1 + R_2}')}</span><span>{t('res.t.net.capPar')}</span></figcaption></figure>
            <figure><DividerFigure /><figcaption><span>{m('\\displaystyle V_\\text{out} = V_\\text{in}\\,\\frac{R_2}{R_1 + R_2}')}</span><span>{t('res.t.net.capDiv')}</span></figcaption></figure>
          </div>
          <ul>
            <li><b>{t('res.t.net.li1a')}</b>{t('res.t.net.li1b')}</li>
            <li><b>{t('res.t.net.li2a')}</b>{t('res.t.net.li2b')}{m('1/R')}{t('res.t.net.li2c')}</li>
            <li>{t('res.t.net.li3a')}{m('R \\parallel kR = R\\,k/(k+1)')}{t('res.t.net.li3b')}<a href="#combinations" className={css.jump}>{t('res.t.net.li3c')}</a>{t('res.t.net.li3d')}</li>
            <li><b>{t('res.t.net.li4a')}</b>{t('res.t.net.li4b')}{m('V_\\text{out}')}{t('res.t.net.li4c')}{m('R_1 \\parallel R_2')}{t('res.t.net.li4d')}<a href="#design" className={css.jump}>{t('res.t.net.li4e')}</a>{t('res.t.net.li4f')}</li>
          </ul>
        </>
      ))}

      {topic('series', (
        <>
          <p>
            {t('res.t.ser.p1a')}{m('R')}{t('res.t.ser.p1b')}{m('\\pm t')}{t('res.t.ser.p1c')}{m('R(1-t)')}{t('res.t.ser.p1d')}{m('R(1+t)')}{t('res.t.ser.p1e')}{m('m')}{t('res.t.ser.p1f')}{c('VishayBasics')}{t('res.t.ser.p1g')}{c('IEC60063')}:
          </p>
          <Eq text={'\\displaystyle R_n = 10^{\\,n/m}, \\qquad n = 0,\\,1,\\,\\ldots,\\,m-1'} />
          <div className={css.wide}><BandsFigure values={series('E12').mantissas} /></div>
          <p className={css.small}>{t('res.t.ser.figNote')}</p>
          <div className={css.wide}>
            <table className={css.table} data-testid="theory-series">
              <thead>
                <tr>
                  <th scope="col">{t('res.t.ser.colSeries')}</th>
                  <th scope="col" className={css.r}>{t('res.t.ser.colPerDec')}</th>
                  <th scope="col" className={css.r}>{t('res.t.ser.colStep')}</th>
                  <th scope="col" className={css.r}>{t('res.t.ser.colMeet')}</th>
                  <th scope="col">{t('res.t.ser.colSold')}{c('WikiE', 'VishayBasics')}</th>
                </tr>
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
                      <td>{t(`res.serTol.${s.id}`)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={css.small} data-testid="theory-series-note">
            {t('res.t.ser.note1')}{m('10^{1/m}')}{t('res.t.ser.note2')}{m('(r-1)/(r+1)')}{t('res.t.ser.note3')}
            {inSeries.length > 0
              ? <>{yours ? t('res.t.yourVal') : t('res.t.theExample')}, {n(Rtext)}{t('res.t.ser.isIn', { list: list(inSeries) })}</>
              : <>{yours ? t('res.t.yourVal') : t('res.t.theExample')}, {n(Rtext)}{t('res.t.ser.isNone1')}<a href="#lookup" className={css.jump}>{t('res.t.ser.lookupLink')}</a>{t('res.t.ser.isNone2')}</>}
          </p>
          <p>{t('res.t.ser.quirks')}</p>
          <ul>
            <li>{t('res.t.ser.q1')}{c('WikiE')}.</li>
            <li>{t('res.t.ser.q2')}{c('WikiE')}.</li>
            <li>{t('res.t.ser.q3a')}<i>{t('res.t.ser.q3b')}</i>{t('res.t.ser.q3c')}</li>
          </ul>
        </>
      ))}

      {topic('codes', (
        <>
          <p>
            <b>{t('res.t.cod.p1a')}</b>{t('res.t.cod.p1b')}{c('IEC60062')}{t('res.t.cod.p1c')}{c('IEC60062')}{t('res.t.cod.p1d')}{c('WikiColor')}.
          </p>
          <p>
            <b>{t('res.t.cod.p2a')}</b>{t('res.t.cod.p2b')}{c('TTTN004')}{t('res.t.cod.p2c')}{c('YageoRC')}.
          </p>
          <p>
            {t('res.t.cod.p3a')}<a href="#reference" className={css.jump}>{t('res.t.cod.p3b')}</a>.
          </p>
        </>
      ))}

      {topic('technologies', (
        <>
          <p>{t('res.t.tech.p1')}</p>
          <div className={css.wide}>
            <table className={[css.table, css.tech].join(' ')} data-testid="theory-tech">
              <thead>
                <tr>
                  <th scope="col">{t('res.t.tech.colType')}</th>
                  <th scope="col">{t('res.t.tech.colTol')}</th>
                  <th scope="col">{t('res.t.tech.colTcr')}</th>
                  <th scope="col">{t('res.t.tech.colNoise')}</th>
                  <th scope="col">{t('res.t.tech.colStab')}</th>
                  <th scope="col">{t('res.t.tech.colUse')}</th>
                </tr>
              </thead>
              <tbody>
                <tr><th scope="row">{t('res.t.tech.r1t')}</th><td>{t('res.t.tech.r1tol')}{c('VishayBasics')}</td><td>{t('res.t.tech.r1tcr1')}{c('VishayBasics')}{t('res.t.tech.r1tcr2')}{c('VishayCRCW')}</td><td>{t('res.t.tech.r1n')}</td><td>{t('res.t.tech.r1s')}{c('VishayCRCW')}</td><td>{t('res.t.tech.r1u')}</td></tr>
                <tr><th scope="row">{t('res.t.tech.r2t')}</th><td>{t('res.t.tech.r2tol')}{c('VishayTNPW')}</td><td>{t('res.t.tech.r2tcr')}{c('VishayTNPW')}</td><td>{t('res.t.tech.r2n')}{c('Beev2021')}</td><td>{t('res.t.tech.r2s')}{c('VishayTNPW')}</td><td>{t('res.t.tech.r2u')}</td></tr>
                <tr><th scope="row">{t('res.t.tech.r3t')}</th><td>{t('res.t.tech.r3tol')}{c('VishayBasics')}</td><td>{t('res.t.tech.r3tcr')}{c('VishayBasics')}</td><td>{t('res.t.tech.r2n')}</td><td>{t('res.t.tech.r3s')}</td><td>{t('res.t.tech.r3u')}</td></tr>
                <tr><th scope="row">{t('res.t.tech.r4t')}</th><td>{t('res.t.tech.r4tol')}{c('VishayBasics')}</td><td>{t('res.t.tech.r4tcr')}{c('VishayBasics')}</td><td>{t('res.t.tech.r4n')}</td><td>{t('res.t.tech.r4s')}</td><td>{t('res.t.tech.r4u')}{c('YageoCFR')}</td></tr>
                <tr><th scope="row">{t('res.t.tech.r5t')}</th><td>{t('res.t.tech.r5tol')}</td><td>{t('res.t.tech.r5tcr')}</td><td>{t('res.t.tech.r4n')}</td><td>{t('res.t.tech.r5s')}</td><td>{t('res.t.tech.r5u')}</td></tr>
                <tr><th scope="row">{t('res.t.tech.r6t')}</th><td>{t('res.t.tech.r6tol')}{c('VishayBasics')}</td><td>{t('res.t.tech.r6tcr')}{c('VishayBasics')}</td><td>{t('res.t.tech.r6n')}</td><td>{t('res.t.tech.r6s')}</td><td>{t('res.t.tech.r6u')}{c('VishayBasics')}</td></tr>
                <tr><th scope="row">{t('res.t.tech.r7t')}</th><td>{t('res.t.tech.r7tol')}</td><td>{t('res.t.tech.r7tcr')}</td><td>{t('res.t.tech.r7n')}{c('Beev2021')}</td><td>{t('res.t.tech.r7s')}</td><td>{t('res.t.tech.r7u')}</td></tr>
              </tbody>
            </table>
          </div>
          <p className={css.small}>{t('res.t.tech.foot')}</p>
        </>
      ))}

      {topic('tolerance', (
        <>
          <p>
            {t('res.t.tol.p1a')}<b>{t('res.t.tol.p1b')}</b>{t('res.t.tol.p1c')}<b>{t('res.t.tol.p1d')}</b>{t('res.t.tol.p1e')}{c('VishayBasics')}{t('res.t.tol.p1f')}
          </p>
          <Eq text={'\\displaystyle R(T) = R_\\text{nom}\\,(1 + d)\\,\\bigl(1 + \\alpha\\,(T - 25\\,^\\circ\\text{C})\\bigr), \\qquad |d| \\le t,\\quad |\\alpha| \\le \\text{TCR}'} />
          <p>
            {t('res.t.tol.p2a')}<a href="#theory-ageing" className={css.jump}>{t('res.t.tol.ageingLink')}</a>{t('res.t.tol.p2b')}{m('t_i')}{t('res.t.tol.p2c')}{m('S_i')}{t('res.t.tol.p2d')}{c('TISNVA112')}.
          </p>
          <Eq text={'\\displaystyle \\Delta_\\text{worst} = \\sum_i |S_i|\\,t_i \\qquad\\quad \\Delta_\\text{RSS} = \\sqrt{\\sum_i \\bigl(S_i\\,t_i\\bigr)^2}'} />
          <ul>
            <li><b>{t('res.t.tol.li1a')}</b>{t('res.t.tol.li1b')}</li>
            <li><b>RSS</b>{t('res.t.tol.li2b')}{c('TISNVA112')}{t('res.t.tol.li2c')}</li>
            <li>
              <b>{t('res.t.tol.li3a')}</b>{t('res.t.tol.li3b')}{m('V_\\text{out} = V_\\text{ref}(1 + R_1/R_2)')}{t('res.t.tol.li3c')}{m('t')}{t('res.t.tol.li3d')}{m('2t\\,(1 - V_\\text{ref}/V_\\text{out})')}{t('res.t.tol.li3e')}{m('2t')}{t('res.t.tol.li3f')}{c('TISLVA423')}{t('res.t.tol.li3g')}{m('k = R_2/(R_1+R_2)')}{t('res.t.tol.li3h')}{m('2t\\,(1-k)')}{t('res.t.tol.li3i')}
            </li>
            <li>
              <b>{t('res.t.tol.li4a')}</b>{t('res.t.tol.li4b')}<i>{t('res.t.tol.li4c')}</i>{t('res.t.tol.li4d')}<a href="#design" className={css.jump}>{t('res.t.net.li4e')}</a>{t('res.t.tol.li4e')}
            </li>
          </ul>
        </>
      ))}

      {topic('power', (
        <>
          <p>
            {t('res.t.pwr.p1a')}{c('YageoRC')}{t('res.t.pwr.p1b')}{c('VishayCRCW0201')}{t('res.t.pwr.p1c')}{c('VishayBasics')}.
          </p>
          <Eq text={'\\displaystyle P(T) = P_{70}\\,\\frac{T_\\text{max} - T}{T_\\text{max} - 70\\,^\\circ\\text{C}} \\qquad \\text{for } T > 70\\,^\\circ\\text{C}'} />
          <div className={css.live}>
            <div className={css.liveHead}>{t('res.t.pwr.chipSize')}
              <span>
                <select className={css.pick} value={chip.imperial} onChange={(event) => onChange({ view: { size: event.target.value } })} aria-label={t('res.t.pwr.sizeAria')} data-testid="theory-size">
                  {CHIP_SIZES.map((size) => <option key={size.imperial} value={size.imperial}>{size.imperial}</option>)}
                </select>
                {t('res.t.pwr.sizeMeta')}{c('VishayCRCW', 'YageoRC')}
              </span>
            </div>
            <div className={css.chartRow}>
              <DeratingChart size={chip} />
              <div>
                <p data-testid="theory-derating">
                  {t('res.t.pwr.der1', { imp: chip.imperial })}{n(eng(chip.power, 'W'))}{t('res.t.pwr.derUpTo')}
                  {[85, 100, 125].filter((temp) => temp < chip.maxTemperature).map((temp) => (
                    <React.Fragment key={temp}>, {n(eng(deratedPower(chip.power, temp, chip.maxTemperature), 'W'))}{t('res.t.pwr.derAt', { t: temp })}</React.Fragment>
                  ))}
                  {t('res.t.pwr.derEnd', { max: chip.maxTemperature })}
                </p>
                <p className={css.small} data-testid="theory-voltage">
                  {t('res.t.pwr.vPre')}{n(Rtext)}{t('res.t.pwr.vAllows')}{n(eng(byPower, 'V'))}
                  {chip.voltage
                    ? byPower <= chip.voltage
                      ? <>{t('res.t.pwr.vLess1')}{n(`${chip.voltage} V`)}{t('res.t.pwr.vLess2')}</>
                      : <>{t('res.t.pwr.vMore1')}{n(`${chip.voltage} V`)}{t('res.t.pwr.vMore2')}{n(eng((chip.voltage * chip.voltage) / R, 'W'))}.</>
                    : t('res.t.pwr.vNone')}
                  {critical !== null && <>{t('res.t.pwr.vMeet')}{n(formatOhms(Number(critical.toPrecision(3))).replace(' ', ' '))}.</>}
                </p>
              </div>
            </div>
          </div>
          <p>
            <b>{t('res.t.pwr.p2a')}</b>{t('res.t.pwr.p2b')}{m('\\sqrt{P R}')}{t('res.t.pwr.p2c')}{c('YageoRC')}{t('res.t.pwr.p2d')}{m('R_\\text{crit} = V_\\text{limit}^2 / P_{70}')}{t('res.t.pwr.p2e')}{c('VishayCRCW')}; <a href="#reference" className={css.jump}>{t('res.t.cod.p3b')}</a> {t('res.t.pwr.p2f')}
          </p>
          <p>
            <b>{t('res.t.pwr.p3a')}</b>{t('res.t.pwr.p3b')}{m('\\Delta T = P\\,R_\\text{th}')}{c('VishayBasics')}{t('res.t.pwr.p3c')}{c('VishayThermal')}{t('res.t.pwr.p3d')}{c('VishayTNPV')}{t('res.t.pwr.p3e')}
          </p>
        </>
      ))}

      {topic('pulse', (
        <>
          <p>{t('res.t.pls.p1')}</p>
          <p>{t('res.t.pls.p2a')}{c('VishayBasics')}{t('res.t.pls.p2b')}</p>
          <p>{t('res.t.pls.p3a')}{m('E = \\tfrac12 C V^2')}{t('res.t.pls.p3b')}</p>
        </>
      ))}

      {topic('noise', (
        <>
          <p>
            <b>{t('res.t.noi.p1a')}</b>{t('res.t.noi.p1b')}{c('Johnson1928')}{t('res.t.noi.p1c')}{c('Nyquist1928')}{t('res.t.noi.p1d')}
          </p>
          <Eq text={'\\displaystyle e_n = \\sqrt{4\\,k\\,T\\,R} \\quad \\text{per } \\sqrt{\\text{Hz}}, \\qquad v_n = e_n \\sqrt{B}'} />
          <div className={css.live}>
            {head(t('res.t.noi.liveHead'))}
            <p>
              {n(Rtext)}{t('res.t.noi.has')}<span className={css.big} data-testid="theory-noise">{eng(density, 'V')}/√Hz</span>
              : {n(eng(density * Math.sqrt(20e3), 'V'))}{t('res.t.noi.rms20k')}{n(eng(density * Math.sqrt(1e6), 'V'))}{t('res.t.noi.rms1m')}
            </p>
            <p className={css.small}>{t('res.t.noi.small')}</p>
          </div>
          <p>
            <b>{t('res.t.noi.p2a')}</b>{t('res.t.noi.p2b')}{c('VishayBasics')}{t('res.t.noi.p2c')}{c('Beev2021')}{t('res.t.noi.p2d')}
          </p>
        </>
      ))}

      {topic('vcr', (
        <>
          <p>{t('res.t.vcr.p1a')}{m('R(V) \\approx R_0\\,(1 + c\\,V)')}{t('res.t.vcr.p1b')}{m('c')}{t('res.t.vcr.p1c')}</p>
          <p>{t('res.t.vcr.p2a')}{c('VishayTNPV')}{t('res.t.vcr.p2b')}</p>
        </>
      ))}

      {topic('hf', (
        <>
          <div className={css.figs}>
            <figure><ParasiticsFigure /></figure>
          </div>
          <p>{t('res.t.hf.p1a')}{c('VishayBasics')}{t('res.t.hf.p1b')}</p>
          <ul>
            <li><b>{t('res.t.hf.li1a')}</b>{t('res.t.hf.li1b')}{m('f_L = R / (2\\pi L)')}.</li>
            <li><b>{t('res.t.hf.li2a')}</b>{t('res.t.hf.li2b')}{m('f_C = 1 / (2\\pi R C)')}.</li>
          </ul>
          <p>{t('res.t.hf.p2a')}{c('VishayBasics')}{t('res.t.hf.p2b')}</p>
        </>
      ))}

      {topic('ageing', (
        <>
          <p>{t('res.t.age.p1a')}{c('VishayCRCW')}{t('res.t.age.p1b')}{c('VishayTNPW')}{t('res.t.age.p1c')}</p>
          <p><b>{t('res.t.age.p2a')}</b>{t('res.t.age.p2b')}{c('VishayTNPW')}{t('res.t.age.p2c')}</p>
        </>
      ))}

      {topic('links', (
        <>
          <p>{t('res.t.lnk.p1')}</p>
          <p>{t('res.t.lnk.p2a')}{c('VishayCRCW')}{t('res.t.lnk.p2b')}{c('VishayCRCW0201')}{t('res.t.lnk.p2c')}</p>
        </>
      ))}

      {topic('sense', (
        <>
          <p>
            {t('res.t.sns.p1a')}{c('VishayCurrent')}: {m('V = I R')}{t('res.t.sns.p1b')}{m('P = I^2 R')}; <a href="#design" className={css.jump}>{t('res.t.net.li4e')}</a>{t('res.t.sns.p1c')}
          </p>
          <div className={css.figs}>
            <figure><KelvinFigure /></figure>
          </div>
          <p>
            {t('res.t.sns.p2a')}<b>{t('res.t.sns.p2b')}</b>{t('res.t.sns.p2c')}{c('VishayCurrent')}.
          </p>
        </>
      ))}
    </div>
  );
}
