import Head from 'next/head'
import Link from 'next/link';

import styles from '../styles/Home.module.css';

export default function Home() {
  return (
    <div className={styles.container}>
      <Head>
        <title>Create Next App</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1 className={styles.title}>
          Welcome to Jonathan's <a href="https://nextjs.org">Next.js!</a> project.
        </h1>

        <p className={styles.description}>
          Get started by checking out the different pages below.
        </p>

        <div className={styles.grid}>
          <Link href="/" className={[styles.card, styles.w45].join(" ")}>
            <h3>Nothing here yet &rarr;</h3>
            <p>There is nothing here yet, but maybe something will pop up over the next few months.</p>
          </Link>

          <Link href="/" className={[styles.card, styles.w45].join(" ")}>
            <h3>jschem &rarr;</h3>
            <p>Future Project. Online schematic drawing program.</p>
          </Link>

          <Link href="/simsetup/main" className={[styles.card, styles.w45].join(" ")}>
            <h3>Simulation setup &rarr;</h3>
            <p>A calculator tool for calculating parameters that are useful when doing FFTs and similar.</p>
          </Link>

          <Link href="/" className={[styles.card, styles.w45].join(" ")}>
            <h3>Nothing here yet &rarr;</h3>
            <p>There is nothing here yet, but maybe something will pop up over the next few months.</p>
          </Link>

          <Link href="/qrcode/main" className={[styles.card, styles.w45].join(" ")}>
            <h3>QR code generator &rarr;</h3>
            <p>QR Code Model 1 and 2, Micro QR and rMQR with full control over every parameter. Runs in the browser.</p>
          </Link>

          <Link href="/pdf/main" className={[styles.card, styles.w45].join(" ")}>
            <h3>PDF tools &rarr;</h3>
            <p>Merge, compress and anonymize PDFs and turn images into PDFs. Runs in the browser; files are never uploaded.</p>
          </Link>

          <Link href="https://github.com/yotasage/yotasage.github.io" className={[styles.card, styles.w45].join(" ")}>
            <h3>The GitHub repo of this site &rarr;</h3>
            <p>Check out the GitHub repo.</p>
          </Link>
        </div>
      </main>

      <style jsx>{`
        main {
          padding: 5rem 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
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