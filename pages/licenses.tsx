import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import HomeIcon from '../components/icons/home';
// Generated on `npm install` by scripts/collect-licenses.mjs.
import data from '../lib/generated/third-party-licenses.json';
import styles from '../styles/Licenses.module.css';

interface Entry {
  name: string;
  version?: string;
  license: string;
  url: string;
  text: string;
}

const anchor = (e: Entry) => `${e.name}${e.version ? `-${e.version}` : ''}`.replace(/[^\w.-]+/g, '-');

function Entries({ entries }: { entries: Entry[] }) {
  return (
    <>
      {entries.map((e) => (
        <details key={anchor(e)} id={anchor(e)} className={styles.entry}>
          <summary>{e.name}<span>{e.version && `${e.version} · `}{e.license}</span></summary>
          <div className={styles.entryBody}>
            <p><a href={e.url} target="_blank" rel="noopener noreferrer">{e.url}</a></p>
            <pre className={styles.text}>{e.text || 'No licence text was found for this package.'}</pre>
          </div>
        </details>
      ))}
    </>
  );
}

export default function Licenses() {
  const packages = data.packages as Entry[];
  const assets = data.assets as Entry[];

  // A link from the table opens the licence it points to.
  React.useEffect(() => {
    const open = () => {
      const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (el instanceof HTMLDetailsElement) el.open = true;
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);

  return (
    <div className={styles.page}>
      <Head>
        <title>Licenses</title>
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

      <header className={styles.header}>
        <Link href="/" className={styles.homeLink} aria-label="Home"><HomeIcon /></Link>
        <h1 className={styles.title}>Licenses</h1>
      </header>

      <div className={styles.content}>
        <p className={styles.lead}>
          This site is built with and includes open-source software. The copyright notices and licence texts of
          those projects are listed below, as their licences require. The list is generated from the installed
          packages each time the site is built.
        </p>
        <p className={styles.lead}>
          The source code of the site itself is on{' '}
          <a href="https://github.com/yotasage/yotasage.github.io" target="_blank" rel="noopener noreferrer">GitHub</a>.
        </p>

        <h2>Software packages</h2>
        <table className={styles.table}>
          <thead>
            <tr><th>Package</th><th>Version</th><th>License</th></tr>
          </thead>
          <tbody>
            {packages.map((p) => (
              <tr key={anchor(p)}>
                <td><a href={`#${anchor(p)}`}>{p.name}</a></td>
                <td>{p.version}</td>
                <td>{p.license}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Entries entries={packages} />

        <h2>Fonts and decoders used by the PDF tools</h2>
        <p className={styles.lead}>Data files from pdf.js that the PDF tools load to display and convert PDFs.</p>
        <Entries entries={assets} />
      </div>
    </div>
  );
}
