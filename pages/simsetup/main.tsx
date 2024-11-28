import Head from 'next/head'
import Link from 'next/link';
import React from "react";

import CalcBox from './components/calcBox';

import styles from '/styles/Home.module.css';
import PrimeBox from './components/primeBox';
import PowerBox from './components/powerBox';

export default function Home() {
  const [precision, setprecision] = React.useState(11);

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
        <Link href="/" className={[styles.card, styles.w10, styles.p_0_75rem].join(" ")}>
            <p>&larr; Return to main page</p>
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
        </div>
        
        <CalcBox f0_readOnly={true} fs_readOnly={false} ncyc_readOnly={false} npts_readOnly={false} precision={precision}></CalcBox>
        <CalcBox f0_readOnly={false} fs_readOnly={true} ncyc_readOnly={false} npts_readOnly={false} precision={precision}></CalcBox>
        <CalcBox f0_readOnly={false} fs_readOnly={false} ncyc_readOnly={true} npts_readOnly={false} precision={precision}></CalcBox>
        <CalcBox f0_readOnly={false} fs_readOnly={false} ncyc_readOnly={false} npts_readOnly={true} precision={precision}></CalcBox>
        
        <div className={styles.grid}>
          
          <div className={[styles.w100, styles.card].join(" ")}>
            <div className={[styles.w100, styles.card].join(" ")}>
              <h1>Description</h1>
              <h3>Calculation boxes</h3>
              <p>f0 — The fundamental frequency of your signal.</p>
              <p>Fs — The sampling frequency.</p>
              <p>Ncyc — The number of cycles/periods of your signal that you want in your simulation.</p>
              <p>Npts — The number of data points or samples. Often referred to as Nfft, which is the length of an FFT.</p>
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