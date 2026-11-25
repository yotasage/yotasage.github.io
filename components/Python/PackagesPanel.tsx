// Packages tab of the Python Playground (P6). Trusted UI: it starts installs, so it lives in its own
// header tab, never inside the framed "Program output" panels (D18, security.md §4). Everything it
// shows comes from the page's own state (usePackages.ts); names and versions reported by the worker
// are rendered as plain text. The W6 dialog appears before every install from PyPI.
import { useCallback, useId, useRef, useState } from 'react';

import type { NetworkMode } from '../../lib/python/network';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PythonPackages.module.css';
import BundledPackages from './BundledPackages';
import { playgroundPanelId, playgroundTabId } from './ExamplesGallery';
import { W6InstallDialog } from './SecurityDialogs';
import type { Msg, PackageRow, PackagesController, PanelNotice } from './usePackages';

type Translate = ReturnType<typeof useI18n>['t'];

function translateMsg(t: Translate, m: Msg): string {
  const vars: Record<string, string | number> = { ...(m.vars ?? {}) };
  if (typeof vars.reasonKey === 'string') vars.reason = t(vars.reasonKey);
  return t(m.key, vars);
}

function Notice({ notice, testId, onDismiss }: { notice: PanelNotice; testId: string; onDismiss: () => void }) {
  const { t } = useI18n();
  return (
    <div className={styles.notice} data-tone={notice.tone} role="status" data-testid={testId}>
      <ul className={styles.noticeLines}>
        {notice.lines.map((line, i) => (
          <li key={`${line.key}-${i}`}>{translateMsg(t, line)}</li>
        ))}
      </ul>
      {notice.details && (
        <details className={styles.noticeDetails}>
          <summary>{t('python.pkgDetails')}</summary>
          <pre>{notice.details}</pre>
        </details>
      )}
      <button type="button" className={styles.dismissBtn} onClick={onDismiss} aria-label={t('python.pkgDismiss')}>
        ×
      </button>
    </div>
  );
}

/** "`{name}` is not installed. [Open Packages]", shown under the Run toolbar (outside program output). */
export function MissingPackagesNotice({
  names,
  onOpen,
  onDismiss,
}: {
  names: readonly string[];
  onOpen: (name: string) => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  if (names.length === 0) return null;
  return (
    <div className={styles.missing} role="status" data-testid="python-missing-notice">
      <span className={styles.missingText}>
        {names.map((n) => (
          <span key={n} data-testid={`python-missing-${n}`}>
            {t('python.pkgMissing', { name: n })}{' '}
          </span>
        ))}
      </span>
      <button type="button" className={styles.primaryBtn} onClick={() => onOpen(names[0])} data-testid="python-missing-open">
        {t('python.pkgMissingOpen')}
      </button>
      <button type="button" className={styles.dismissBtn} onClick={onDismiss} aria-label={t('python.pkgDismiss')}>
        ×
      </button>
    </div>
  );
}

export interface PackagesPanelProps {
  hidden: boolean;
  pkg: PackagesController;
  mode: NetworkMode;
  storageBlocked: boolean;
  /** Opens the Network dialog on Package index mode (the W4 reload flow). */
  onSwitchToPackageIndex: () => void;
}

export default function PackagesPanel({ hidden, pkg, mode, storageBlocked, onSwitchToPackageIndex }: PackagesPanelProps) {
  const { t } = useI18n();
  const ids = useId();
  const wheelInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [keepWheels, setKeepWheels] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const disabledText = pkg.disabledReason ? translateMsg(t, pkg.disabledReason) : null;
  const blocked = disabledText !== null || pkg.busy !== null;
  const bundledNames = pkg.bundled ? [...pkg.bundled.keys()].sort() : [];

  const onWheelFiles = useCallback(
    (list: FileList | null) => {
      const files = list ? Array.from(list) : [];
      if (files.length) void pkg.uploadWheels(files, keepWheels);
    },
    [keepWheels, pkg],
  );

  const modeText =
    mode === 'off' ? t('python.pkgModeOff') : mode === 'pkg' ? t('python.pkgModePkg') : t('python.pkgModeOther');

  const renderActions = (row: PackageRow) => (
    <>
      {row.skip === 'stale' && (
        <button
          type="button"
          className={styles.smallBtn}
          disabled={blocked}
          onClick={() => void pkg.reinstallStale(row.name)}
          aria-label={t('python.pkgReinstallAria', { name: row.name })}
          data-testid={`python-pkg-reinstall-${row.name}`}
        >
          {t('python.pkgReinstall')}
        </button>
      )}
      {(row.kept || row.source !== 'bundled') && (
        <button
          type="button"
          className={styles.smallDangerBtn}
          disabled={blocked}
          onClick={() => pkg.setConfirmRemove(row.name)}
          aria-label={t('python.pkgRemoveAria', { name: row.name })}
          data-testid={`python-pkg-remove-${row.name}`}
        >
          {t('python.pkgRemove')}
        </button>
      )}
    </>
  );

  const keepWhy = (row: PackageRow): string | undefined =>
    row.source === 'code' ? t('python.pkgKeepCodeWhy') : row.keptAsDependency ? t('python.pkgKeepDepWhy') : undefined;

  return (
    <section
      role="tabpanel"
      id={playgroundPanelId('packages')}
      aria-labelledby={playgroundTabId('packages')}
      hidden={hidden}
      className={styles.panel}
      data-testid="python-packages-panel"
    >
      <div className={styles.intro}>
        <h2 className={styles.title}>{t('python.pkgTitle')}</h2>
        <p className={styles.lead}>{t('python.pkgIntro')}</p>
        <div className={styles.modeLine} data-mode={mode} data-testid="python-pkg-mode">
          <span>{modeText}</span>
          {mode !== 'pkg' && (
            <button type="button" className={styles.linkBtn} onClick={onSwitchToPackageIndex} data-testid="python-pkg-switch">
              {t('python.pkgSwitchPkg')}
            </button>
          )}
        </div>
        <p className={styles.note}>{t('python.pkgLicence')}</p>
        {storageBlocked && (
          <p className={styles.warnLine} role="status" data-testid="python-pkg-storage-blocked">
            {t('python.pkgStorageBlocked')}
          </p>
        )}
        {disabledText && (
          <p className={styles.warnLine} role="status" data-testid="python-pkg-disabled-reason">
            {disabledText}
          </p>
        )}
      </div>

      {pkg.busy && (
        <div className={styles.busy} role="status" aria-live="polite" data-testid="python-pkg-busy">
          <span className={styles.spinner} aria-hidden="true" />
          {translateMsg(t, pkg.busy)}
        </div>
      )}
      {pkg.restoreNotice && (
        <Notice notice={pkg.restoreNotice} testId="python-pkg-restore-notice" onDismiss={pkg.dismissRestoreNotice} />
      )}
      {pkg.notice && <Notice notice={pkg.notice} testId="python-pkg-notice" onDismiss={pkg.dismissNotice} />}

      {pkg.preview && (
        <section className={styles.preview} aria-labelledby={`${ids}-preview`} data-testid="python-pkg-preview">
          <h3 id={`${ids}-preview`} className={styles.cardTitle}>
            {t('python.pkgPreviewTitle', { file: pkg.preview.fileName })}
          </h3>
          {pkg.preview.lines.map((l, i) => (
            <p key={i} className={styles.note}>
              {translateMsg(t, l)}
            </p>
          ))}
          <h4 className={styles.subTitle}>{t('python.pkgPreviewInstall', { count: pkg.preview.install.length })}</h4>
          {pkg.preview.install.length === 0 ? (
            <p className={styles.note}>{t('python.pkgPreviewNothing')}</p>
          ) : (
            <ul className={styles.previewList} data-testid="python-pkg-preview-install">
              {pkg.preview.install.map((i) => (
                <li key={i.name}>
                  <code>{i.detail === i.name ? i.name : `${i.name} ${i.detail}`}</code>{' '}
                  <span className={styles.via}>{t(`python.pkgPreviewVia.${i.via}`)}</span>
                </li>
              ))}
            </ul>
          )}
          {pkg.preview.skipped.length > 0 && (
            <>
              <h4 className={styles.subTitle}>{t('python.pkgPreviewSkip', { count: pkg.preview.skipped.length })}</h4>
              <ul className={styles.previewList} data-testid="python-pkg-preview-skipped">
                {pkg.preview.skipped.map((s, i) => (
                  <li key={`${s.text}-${i}`}>
                    <code>{s.text}</code>
                    {s.line !== undefined && <span className={styles.via}> {t('python.pkgPreviewLine', { line: s.line })}</span>}
                    <span className={styles.skipReason}>{translateMsg(t, s.reason)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className={styles.actionsRow}>
            <button type="button" className={styles.secondaryBtn} onClick={pkg.cancelImport} data-testid="python-pkg-preview-cancel">
              {t('python.cancel')}
            </button>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={blocked || pkg.preview.install.length === 0}
              onClick={pkg.confirmImport}
              data-testid="python-pkg-preview-install-btn"
            >
              {t('python.pkgPreviewConfirm')}
            </button>
          </div>
        </section>
      )}

      <div className={styles.layout}>
        <div className={styles.side}>
          <section className={styles.card} aria-labelledby={`${ids}-list`}>
            <h3 id={`${ids}-list`} className={styles.cardTitle}>
              {t('python.pkgListTitle')}
            </h3>
            {pkg.confirmRemove && (
              <div className={styles.confirm} role="alert" data-testid="python-pkg-remove-confirm">
                <p>{t('python.pkgRemoveConfirm', { name: pkg.confirmRemove })}</p>
                <div className={styles.actionsRow}>
                  <button type="button" className={styles.secondaryBtn} onClick={() => pkg.setConfirmRemove(null)} data-testid="python-pkg-remove-cancel">
                    {t('python.cancel')}
                  </button>
                  <button
                    type="button"
                    className={styles.dangerBtn}
                    disabled={blocked}
                    onClick={() => void pkg.removeRow(pkg.confirmRemove as string)}
                    data-testid="python-pkg-remove-yes"
                  >
                    {t('python.pkgRemoveYes')}
                  </button>
                </div>
              </div>
            )}
            {pkg.rows.length === 0 ? (
              <p className={styles.note} data-testid="python-pkg-empty">
                {t('python.pkgListEmpty')}
              </p>
            ) : (
              <table className={styles.table} aria-label={t('python.pkgListAria')} data-testid="python-pkg-table">
                <thead>
                  <tr>
                    <th scope="col">{t('python.pkgColName')}</th>
                    <th scope="col">{t('python.pkgColVersion')}</th>
                    <th scope="col">{t('python.pkgColSource')}</th>
                    <th scope="col">{t('python.pkgColKeep')}</th>
                    <th scope="col">
                      <span className={styles.srOnly}>{t('python.pkgColActions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pkg.rows.map((row) => (
                    <tr key={row.name} data-testid={`python-pkg-row-${row.name}`} data-source={row.source} data-installed={row.installed}>
                      <td className={styles.nameCell}>
                        <code>{row.name}</code>
                      </td>
                      <td className={styles.versionCell}>{row.version}</td>
                      <td className={styles.sourceCell}>
                        <span className={styles.chip} data-source={row.source} data-testid={`python-pkg-source-${row.name}`}>
                          {t(`python.pkgSrc.${row.source}`)}
                        </span>
                        {!row.installed && <span className={styles.dim}>{t('python.pkgNotLoaded')}</span>}
                        {row.skip && (
                          <span className={styles.skipReason} data-testid={`python-pkg-skip-${row.name}`}>
                            {t(`python.pkgSkip.${row.skip}`)}
                          </span>
                        )}
                      </td>
                      <td className={styles.keepCell}>
                        <label className={styles.switch} title={keepWhy(row)}>
                          <input
                            type="checkbox"
                            role="switch"
                            checked={row.kept}
                            disabled={blocked || row.source === 'code' || row.keptAsDependency || (!row.kept && !row.installed)}
                            onChange={(e) => void pkg.setKeep(row, e.target.checked)}
                            aria-label={t('python.pkgKeepAria', { name: row.name })}
                            data-testid={`python-pkg-keep-${row.name}`}
                          />
                          <span className={styles.switchTrack} aria-hidden="true" />
                          <span className={styles.switchText}>{t('python.pkgColKeep')}</span>
                        </label>
                        {row.source === 'code' && <span className={styles.dim}>{t('python.pkgKeepCodeWhy')}</span>}
                      </td>
                      <td className={styles.actionsCell}>{renderActions(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className={styles.note}>{t('python.pkgKeepHint')}</p>
          </section>
          <BundledPackages
            total={pkg.bundled ? pkg.bundled.size : null}
            rows={pkg.bundledRows}
            disabledText={disabledText}
            busy={pkg.busy !== null}
            onLoad={(n) => void pkg.loadBundled(n)}
          />
        </div>

        <div className={styles.side}>
          <section className={styles.card} aria-labelledby={`${ids}-install`}>
            <h3 id={`${ids}-install`} className={styles.cardTitle}>
              {t('python.pkgInstallTitle')}
            </h3>
            <form
              className={styles.installRow}
              onSubmit={(e) => {
                e.preventDefault();
                void pkg.installDraft();
              }}
            >
              <label htmlFor={`${ids}-draft`} className={styles.srOnly}>
                {t('python.pkgInstallLabel')}
              </label>
              <input
                id={`${ids}-draft`}
                className={styles.input}
                value={pkg.draft}
                onChange={(e) => pkg.setDraft(e.target.value)}
                list={`${ids}-bundled`}
                placeholder={mode === 'pkg' ? t('python.pkgInstallPlaceholderPkg') : t('python.pkgInstallPlaceholderOff')}
                autoComplete="off"
                spellCheck={false}
                maxLength={512}
                data-testid="python-pkg-input"
              />
              <datalist id={`${ids}-bundled`} data-testid="python-pkg-datalist">
                {bundledNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={blocked || pkg.draft.trim() === ''}
                title={disabledText ?? undefined}
                data-testid="python-pkg-install-btn"
              >
                {t('python.pkgInstallBtn')}
              </button>
            </form>
            <p className={styles.note} data-testid="python-pkg-install-hint">
              {mode === 'pkg' ? t('python.pkgInstallPkgHint') : t('python.pkgInstallOffHint', { names: bundledNames.join(', ') })}
            </p>
          </section>

          <section className={styles.card} aria-labelledby={`${ids}-wheel`}>
            <h3 id={`${ids}-wheel`} className={styles.cardTitle}>
              {t('python.pkgWheelTitle')}
            </h3>
            <div
              className={styles.dropZone}
              data-over={dragOver}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (!blocked) onWheelFiles(e.dataTransfer.files);
              }}
            >
              <input
                ref={wheelInputRef}
                type="file"
                accept=".whl"
                multiple
                hidden
                onChange={(e) => {
                  onWheelFiles(e.target.files);
                  e.target.value = '';
                }}
                data-testid="python-pkg-wheel-input"
              />
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={blocked}
                onClick={() => wheelInputRef.current?.click()}
                data-testid="python-pkg-wheel-btn"
              >
                {t('python.pkgWheelChoose')}
              </button>
              <span className={styles.dim}>{t('python.pkgWheelDrop')}</span>
            </div>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={keepWheels}
                onChange={(e) => setKeepWheels(e.target.checked)}
                data-testid="python-pkg-wheel-keep"
              />
              <span>{t('python.pkgWheelKeep')}</span>
            </label>
            <p className={styles.note}>{t('python.pkgWheelHint')}</p>
          </section>

          <section className={styles.card} aria-labelledby={`${ids}-req`}>
            <h3 id={`${ids}-req`} className={styles.cardTitle}>
              {t('python.pkgReqTitle')}
            </h3>
            <input
              ref={importInputRef}
              type="file"
              accept=".txt,.json,.lock,text/plain,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pkg.previewImport(f);
                e.target.value = '';
              }}
              data-testid="python-pkg-import-input"
            />
            <div className={styles.actionsRow}>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={blocked}
                onClick={() => importInputRef.current?.click()}
                data-testid="python-pkg-import-btn"
              >
                {t('python.pkgReqImport')}
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={!pkg.canExport}
                title={pkg.canExport ? undefined : t('python.pkgReqExportEmpty')}
                onClick={() => pkg.downloadExport('requirements')}
                data-testid="python-pkg-export-txt"
              >
                {t('python.pkgReqExportTxt')}
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={!pkg.canExport}
                title={pkg.canExport ? undefined : t('python.pkgReqExportEmpty')}
                onClick={() => pkg.downloadExport('lock')}
                data-testid="python-pkg-export-lock"
              >
                {t('python.pkgReqExportLock')}
              </button>
            </div>
            <p className={styles.note}>{t('python.pkgReqHint')}</p>
          </section>
        </div>
      </div>

      <W6InstallDialog items={pkg.w6 ? pkg.w6.items : null} onConfirm={pkg.confirmW6} onCancel={pkg.cancelW6} />
    </section>
  );
}
