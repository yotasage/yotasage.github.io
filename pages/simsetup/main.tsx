import Head from 'next/head'
import Link from 'next/link';
import React from "react";

import CalcBox from './components/calcBox';

import styles from '/styles/Home.module.css';
import PrimeBox from './components/primeBox';
import PowerBox from './components/powerBox';

import HomeIcon from '../../components/icons/home';

import KatexSpan from './components/katex/span';
import Bibliography from '../../components/BibJs/referenceList';
import { BibWebsite } from '../../components/BibJs/bibItem';

// import bib from './bib';

export default function Home() {
  const [precision, setprecision] = React.useState(11);

  const referenceList = [
      new BibWebsite(
          {
              key: 'AD',
              institution: 'Analog Devices',
              title: 'Coherent Sampling vs. Window Sampling',
              website: 'analog.com',
              url: 'https://www.analog.com/en/resources/technical-articles/coherent-sampling-vs-window-sampling.html',
              read: '2024-12-01'
          }
      )
  ]

  let bib = new Bibliography(referenceList);

  function updateValue_precision(e) {
    let new_value = e.target.value;

    if (new_value > 0) {
      setprecision(new_value);
    }
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>Simulator setup tool</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <header>
        <Link href="/" className={[styles.card, styles.p_0_75rem].join(" ")}>
            <HomeIcon></HomeIcon>
        </Link>
      </header>

      <main>
        <h1 className={styles.title}>
          Simulator setup tool
        </h1>

        

        <div className={styles.grid}>
          
          <div className={styles.card}>
            <h3>Precision</h3>
            <input type="number" readOnly={false} name="precision" value={precision} onChange={updateValue_precision}/><br/>
          </div>

          <PrimeBox></PrimeBox>
          <PowerBox></PowerBox>

          <CalcBox f0_readOnly={true} fs_readOnly={false} ncyc_readOnly={false} npts_readOnly={false} precision={precision}></CalcBox>
          <CalcBox f0_readOnly={false} fs_readOnly={true} ncyc_readOnly={false} npts_readOnly={false} precision={precision}></CalcBox>
          <CalcBox f0_readOnly={false} fs_readOnly={false} ncyc_readOnly={true} npts_readOnly={false} precision={precision}></CalcBox>
          <CalcBox f0_readOnly={false} fs_readOnly={false} ncyc_readOnly={false} npts_readOnly={true} precision={precision}></CalcBox>
        </div>
        
        <div className={styles.grid}>
          
          <div className={[styles.w100, styles.card].join(" ")}>
            <div className={[styles.w100, styles.card].join(" ")}>
              <h1>Description</h1>
              <h3>Calculation boxes</h3>

              
              <p>The following 4 parameteres are related by this equation:</p>
              <KatexSpan style={{fontSize: '1.5rem'}} text={'\\rm F_S=\\frac{N_{pts}}{N_{cyc}}\\cdot f_0'}/><br/>

              <p>f<sub>0</sub> — The fundamental frequency of your signal. Also refered to as f<sub>in</sub>.</p>
              <p>F<sub>S</sub> — The sampling frequency. Also referred to as f<sub>sample</sub>.</p>
              <p>N<sub>cyc</sub> — The number of cycles/periods of f<sub>0</sub>. Also called N<sub>window</sub>.</p>
              <p>N<sub>pts</sub> — The number of data points or samples. Also referred to as N<sub>record</sub> and N<sub>fft</sub>, which is the length of an FFT.</p><br/>
              

              <p>T<sub>0</sub> — The period of f<sub>0</sub>.</p>
              <p>T<sub>S</sub> — The period of F<sub>S</sub>.</p><br/>

              
              <p>f<sub>res</sub> — The frequency resolution of for instance an FFT.</p>
              <KatexSpan style={{fontSize: '1.5rem'}} text={'\\rm f_{res}=\\frac{F_S}{N_{pts}}'}/><br/>

              <p>N<sub>pts0</sub> — The number of data points or samples during one T<sub>0</sub>.</p>
              <KatexSpan style={{fontSize: '1.5rem'}} text={'\\rm N_{pts0}=\\frac{N_{pts}}{N_{cyc}}'}/><br/>

              <p>t<sub>start</sub> — The point in time that sampling starts.</p>
              <p>t<sub>stop</sub> — The point in time until which samples are taken.</p>
              <p>f<sub>min</sub> — The lowest frequency that can be considered by an FFT for instance.</p>
              <p>f<sub>max</sub> — The highest frequency that can be considered by an FFT for instance.</p>

            </div>

            <div className={[styles.w100, styles.card].join(" ")}>
              <h3>Prime box</h3>
              <p>Can quickly calculate the next or previous prime with respect to the current number. It can also quickly find primes that are approximately 2, 10, and 1000 times larger or smaller than the current number. Note that the current number does not have to be a prime.</p>

              <p>If the current number is not a prime, the function of the box will behave as if it were, and simply find the prime that comes before or after this number, or a prime that is about 2, 10, and 1000 times larger or smaller than the current number.</p>

              <p>The prime box comes with an indicator that indicates whether a number is prime or not.</p>
            </div>

            <div className={[styles.w100, styles.card].join(" ")}>
              <h3>Power of 2 box</h3>
              <p>Performs bit-wise left or right shifts. Can shift by 1 or 4 bits at a time.</p>

              <p>The power of 2 box comes with an indicator that indicates whether a number is an exact power of 2 or not.</p>
            </div>

            <div className={[styles.w100, styles.card].join(" ")}>
              <h3>Coherent sampling</h3>

              <p>Source: {bib.cite('AD')}</p>

              <p><b>RULE 1:</b> N<sub>cyc</sub> is recommended to be a prime number or at least an odd number. N<sub>cyc</sub> should be an integer (No window effect). By making N<sub>cyc</sub> odd, we eliminate many common factors with N<sub>pts</sub>. Common factors between N<sub>cyc</sub> and N<sub>pts</sub> lead to different harmonics of f<sub>0</sub> having the same frequency bin in the FFT after aliasing. </p>

              <p><b>RULE 2:</b> N<sub>pts</sub> should be a power of 2. An FFT requires the number of samples to be a power of 2 because of its inherent periodicity.</p>

              <p><b>RULE 3:</b> f<sub>0</sub> and F<sub>S</sub> should be relatively prime.</p>

              <p><b>NOTE 1:</b> Unless window sampling ("windowing") is used to compensate for waveform discontinuance<sup>2</sup>, spectral leakage is inevitable. Window sampling is when a sampled waveform is multiplied by the mathematical expression describing the window.</p>

              <p><b>NOTE 2:</b> ADCs are usually characterized for and tested with sinusoidal input signals. Non-coherent sampling for sinusoidal input signals means that the first and the last sample of the input sinusoid are discontinuous with one another.</p>

              <p><b>NOTE 3:</b> Waveform discontinuance describes an input signal, for which an integer number of its cycles do not fit into a predefined window.</p>
            </div>
          </div>

          <div className={[styles.w100, styles.card].join(" ")}>
           {bib.render()}
          </div>
        </div>

      </main>

      <footer>
        <a
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{' '}
          <img src="/vercel.svg" alt="Vercel" className={styles.logo} />
        </a>
      </footer>

      <style jsx>{`
        main {
          padding: 5rem 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        header {
          width: 100%;
          height: 100px;
          border-bottom: 1px solid #eaeaea;
          display: flex;
          justify-content: left;
          align-items: center;
        }
        footer {
          width: 100%;
          height: 100px;
          border-top: 1px solid #eaeaea;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        footer img {
          margin-left: 0.5rem;
        }
        footer a {
          display: flex;
          justify-content: center;
          align-items: center;
          text-decoration: none;
          color: inherit;
        }
        code {
          background: #fafafa;
          border-radius: 5px;
          padding: 0.75rem;
          font-size: 1.1rem;
          font-family: Menlo, Monaco, Lucida Console, Liberation Mono,
            DejaVu Sans Mono, Bitstream Vera Sans Mono, Courier New, monospace;
        }
      `}</style>

      <style jsx global>{`
        html,
        body {
          padding: 0;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto,
            Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue,
            sans-serif;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  )
}