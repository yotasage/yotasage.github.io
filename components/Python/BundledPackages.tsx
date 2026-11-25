// "Bundled, not loaded yet" card of the Packages tab (U1): every package of our own
// /pyodide/pyodide-lock.json that this worker session has not loaded, top-level ones first, with a
// Load button. Bundled packages come from this site, so loading one needs no W6 and works in every
// network mode; a program's `import` loads them by itself too, after which they move to the
// installed list (usePackages refreshes it between runs).
import { useId, useMemo, useState } from 'react';

import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PythonPackages.module.css';
import type { BundledRow } from './usePackages';

/** Lists longer than this (counting every bundled package, so the box does not come and go) get a filter. */
const FILTER_FROM = 12;

export interface BundledPackagesProps {
  /** null until the bundled index is read (after Python is ready). */
  total: number | null;
  rows: readonly BundledRow[];
  /** Why Load cannot be used now (translated), or null. */
  disabledText: string | null;
  busy: boolean;
  onLoad: (name: string) => void;
}

export default function BundledPackages({ total, rows, disabledText, busy, onLoad }: BundledPackagesProps) {
  const { t } = useI18n();
  const ids = useId();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const shown = useMemo(
    () =>
      q === ''
        ? rows
        : rows.filter((r) => r.name.includes(q) || r.imports.some((i) => i.toLowerCase().includes(q))),
    [q, rows],
  );
  const blocked = disabledText !== null || busy;

  return (
    <section className={styles.card} aria-labelledby={`${ids}-title`} data-testid="python-pkg-bundled">
      <h3 id={`${ids}-title`} className={styles.cardTitle}>
        {t('python.pkgBundledTitle', { count: rows.length })}
      </h3>
      <p className={styles.note}>{t('python.pkgBundledHint')}</p>
      {disabledText && rows.length > 0 && (
        <p id={`${ids}-why`} className={styles.dim} data-testid="python-pkg-bundled-why">
          {disabledText}
        </p>
      )}
      {total === null ? (
        <p className={styles.note} data-testid="python-pkg-bundled-waiting">
          {t('python.pkgBundledWaiting')}
        </p>
      ) : total === 0 ? (
        <p className={styles.note} data-testid="python-pkg-bundled-missing">
          {t('python.pkgBundledMissing')}
        </p>
      ) : rows.length === 0 ? (
        <p className={styles.note} data-testid="python-pkg-bundled-none">
          {t('python.pkgBundledNone')}
        </p>
      ) : (
        <>
          {total > FILTER_FROM && (
            <div className={styles.filterRow}>
              <label htmlFor={`${ids}-filter`} className={styles.srOnly}>
                {t('python.pkgBundledFilter')}
              </label>
              <input
                id={`${ids}-filter`}
                type="search"
                className={styles.input}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('python.pkgBundledFilterPlaceholder')}
                autoComplete="off"
                spellCheck={false}
                maxLength={100}
                data-testid="python-pkg-bundled-filter"
              />
            </div>
          )}
          {shown.length === 0 ? (
            <p className={styles.note} data-testid="python-pkg-bundled-nomatch">
              {t('python.pkgBundledNoMatch', { query: query.trim() })}
            </p>
          ) : (
            <table className={`${styles.table} ${styles.bundledTable}`} aria-label={t('python.pkgBundledAria')} data-testid="python-pkg-bundled-table">
              <thead>
                <tr>
                  <th scope="col">{t('python.pkgColName')}</th>
                  <th scope="col">{t('python.pkgColVersion')}</th>
                  <th scope="col">
                    <span className={styles.srOnly}>{t('python.pkgColActions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.name} data-testid={`python-pkg-bundled-row-${row.name}`} data-dependency={row.neededBy.length > 0}>
                    <td className={styles.nameCell}>
                      <code>{row.name}</code>
                      {row.imports.length > 0 && <span className={styles.dim}>{t('python.pkgBundledImport', { names: row.imports.join(', ') })}</span>}
                      {row.neededBy.length > 0 && (
                        <span className={styles.dim}>{t('python.pkgBundledNeededBy', { names: row.neededBy.join(', ') })}</span>
                      )}
                    </td>
                    <td className={styles.versionCell}>{row.version}</td>
                    <td className={styles.actionsCell}>
                      <button
                        type="button"
                        className={styles.smallBtn}
                        disabled={blocked}
                        title={disabledText ?? undefined}
                        aria-describedby={disabledText ? `${ids}-why` : undefined}
                        onClick={() => onLoad(row.name)}
                        aria-label={t('python.pkgBundledLoadAria', { name: row.name })}
                        data-testid={`python-pkg-bundled-load-${row.name}`}
                      >
                        {t('python.pkgBundledLoad')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
