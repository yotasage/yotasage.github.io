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

      <main>
        <h1 className={styles.title}>
          Simulator setup tool
        </h1>

        <div className={styles.grid}>
          
          <div className={styles.card}>
            <p>Precision</p><br/>
            <input type="number" readOnly={false} name="precision" value={precision} onChange={updateValue_precision}/><br/>
          </div>

          <PrimeBox></PrimeBox>
          <PowerBox></PowerBox></div>
        
        <CalcBox f0_readOnly={true} fs_readOnly={false} ncyc_readOnly={false} npts_readOnly={false} precision={precision}></CalcBox>
        <CalcBox f0_readOnly={false} fs_readOnly={true} ncyc_readOnly={false} npts_readOnly={false} precision={precision}></CalcBox>
        <CalcBox f0_readOnly={false} fs_readOnly={false} ncyc_readOnly={true} npts_readOnly={false} precision={precision}></CalcBox>
        <CalcBox f0_readOnly={false} fs_readOnly={false} ncyc_readOnly={false} npts_readOnly={true} precision={precision}></CalcBox>
        
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