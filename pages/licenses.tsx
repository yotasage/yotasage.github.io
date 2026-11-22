import React from 'react';

import PageHead from '../components/PageHead';
import ToolHeader from '../components/UI/ToolHeader';
// Generated on `npm install` by scripts/collect-licenses.mjs.
import data from '../lib/generated/third-party-licenses.json';
import { useI18n } from '../lib/ui/i18n';
import { useDesignSystemPage } from '../lib/ui/theme';
import styles from '../styles/Licenses.module.css';

interface Entry {
  name: string;
  version?: string;
  license: string;
  url: string;
  text: string;
}

const anchor = (e: Entry) => `${e.name}${e.version ? `-${e.version}` : ''}`.replace(/[^\w.-]+/g, '-');

function Entries({ entries, noText }: { entries: Entry[]; noText: string }) {
  return (
    <>
      {entries.map((e) => (
        <details key={anchor(e)} id={anchor(e)} className={styles.entry}>
          <summary>{e.name}<span>{e.version && `${e.version} · `}{e.license}</span></summary>
          <div className={styles.entryBody}>
            <p><a href={e.url} target="_blank" rel="noopener noreferrer">{e.url}</a></p>
            <pre className={styles.text}>{e.text || noText}</pre>
          </div>
        </details>
      ))}
    </>
  );
}

export default function Licenses() {
  useDesignSystemPage('#2563eb', '#60a5fa');
  const { t } = useI18n();

  const packages = data.packages as Entry[];
  const assets = data.assets as Entry[];
  const pdfWasm = (data as { pdfWasm?: Entry[] }).pdfWasm ?? [];
  const viewer = data.viewer as Entry[];
  const pcb = (data as { pcb?: Entry[] }).pcb ?? [];
  const qr = (data as { qr?: Entry[] }).qr ?? [];
  const fonts = (data as { fonts?: Entry[] }).fonts ?? [];

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

  const noText = t('licenses.noText');

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('licenses.pageTitle')}
        description="Open-source licenses and third-party notices for the libraries, WebAssembly engines, and self-hosted fonts used on yotasage.github.io."
        path="/licenses"
      />

      <ToolHeader title={t('licenses.title')} showExperienceMode={false} />

      <main className={styles.main}>
        <div className={styles.content}>
          <section className={styles.introCard}>
            <p className={styles.lead}>{t('licenses.lead1')}</p>
            <p className={styles.lead}>
              {t('licenses.lead2Prefix')}
              <a href="https://github.com/yotasage/yotasage.github.io/blob/main/LICENSE.md" target="_blank" rel="noopener noreferrer">LICENSE.md</a>
              {t('licenses.lead2Mid')}
              <a href="https://github.com/yotasage/yotasage.github.io" target="_blank" rel="noopener noreferrer">GitHub</a>
              {t('licenses.lead2Suffix')}
            </p>
          </section>

          <section className={styles.sectionCard}>
            <h2>{t('licenses.section.packages')}</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('licenses.table.package')}</th>
                    <th>{t('licenses.table.version')}</th>
                    <th>{t('licenses.table.license')}</th>
                  </tr>
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
            </div>
            <Entries entries={packages} noText={noText} />
          </section>

          <section className={styles.sectionCard}>
            <h2>{t('licenses.section.pdfAssets')}</h2>
            <p className={styles.lead}>{t('licenses.section.pdfAssetsLead')}</p>
            <Entries entries={assets} noText={noText} />
          </section>

          {pdfWasm.length > 0 && (
            <section className={styles.sectionCard}>
              <h2>{t('licenses.section.pdfWasm')}</h2>
              <p className={styles.lead}>
                {t('licenses.section.pdfWasmLeadPre')}
                <code>/pdf-wasm/gs/</code>
                {t('licenses.section.pdfWasmLeadPost')}
              </p>
              <Entries entries={pdfWasm} noText={noText} />
            </section>
          )}

          <section className={styles.sectionCard}>
            <h2>{t('licenses.section.viewer')}</h2>
            <p className={styles.lead}>{t('licenses.section.viewerLead')}</p>
            <Entries entries={viewer} noText={noText} />
          </section>

          <section className={styles.sectionCard}>
            <h2>{t('licenses.section.pcb')}</h2>
            <p className={styles.lead}>{t('licenses.section.pcbLead')}</p>
            <Entries entries={pcb} noText={noText} />
          </section>

          <section className={styles.sectionCard}>
            <h2>{t('licenses.section.qr')}</h2>
            <p className={styles.lead}>{t('licenses.section.qrLead')}</p>
            <Entries entries={qr} noText={noText} />
          </section>

          {fonts.length > 0 && (
            <section className={styles.sectionCard}>
              <h2>{t('licenses.section.fonts')}</h2>
              <p className={styles.lead}>
                {t('licenses.section.fontsLeadPre')}
                <code>/fonts/</code>
                {t('licenses.section.fontsLeadPost')}
              </p>
              <Entries entries={fonts} noText={noText} />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
