import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field } from '../../components/UI/Fields';
import {
  baseName,
  download,
  errorMessage,
  formatBytes,
  isPasswordError,
  isPdf,
  nextFrame,
  OutputFile,
  readBytes,
  uid,
  zipFiles,
} from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { pdfPreview } from '../../lib/pdf/pdfjs';
import { SecurityInfo } from '../../lib/pdf/security';
import { UNLOCK } from '../../lib/pdf/tools';
import { runInspectSecurity, runUnlockPdf } from '../../lib/pdf/workerClient';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

interface Item {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number | null;
  thumb: string | null;
  error: string | null;
  security: SecurityInfo | null;
  perFilePassword: string;
  unlockError: string | null;
  unlocking: boolean;
}

interface ItemResult {
  bytes: Uint8Array;
  wasEncrypted: boolean;
}

export default function UnlockPdfPage() {
  const { t } = useI18n();
  const [items, setItems] = React.useState<Item[]>([]);
  const [sharedPassword, setSharedPassword] = React.useState('');
  const [showSharedPwd, setShowSharedPwd] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [notice, setNotice] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, ItemResult>>({});

  const update = (id: string, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function addFiles(files: File[]) {
    const pdfs = files.filter(isPdf);
    setNotice(pdfs.length < files.length ? t('pdf.p.skippedNonPdf', { n: files.length - pdfs.length }) : null);
    const added = await Promise.all(
      pdfs.map(async (file): Promise<Item> => ({
        id: uid(),
        name: file.name,
        bytes: await readBytes(file),
        pageCount: null,
        thumb: null,
        error: null,
        security: null,
        perFilePassword: '',
        unlockError: null,
        unlocking: false,
      })),
    );
    setItems((list) => [...list, ...added]);
    for (const item of added) {
      runInspectSecurity(item.bytes)
        .then((security) => {
          update(item.id, { security, error: null });
          if (!security.needsPassword) {
            void pdfPreview(item.bytes)
              .then((p) => update(item.id, { pageCount: p.pageCount, thumb: p.thumbnail }))
              .catch(() => undefined);
          }
        })
        .catch((e) => {
          update(item.id, { error: errorMessage(e) });
        });
    }
  }

  React.useEffect(() => {
    const handoff = consumeHandoff();
    if (handoff?.length) void addFiles(handoffToFiles(handoff));
  }, []);

  async function unlockOne(item: Item, passwordOverride?: string): Promise<boolean> {
    const pwd = passwordOverride ?? (item.perFilePassword || sharedPassword);
    update(item.id, { unlocking: true, unlockError: null });
    try {
      const res = await runUnlockPdf(item.bytes, item.security?.needsPassword ? pwd : '');
      setResults((prev) => ({ ...prev, [item.id]: { bytes: res.bytes, wasEncrypted: res.wasEncrypted } }));
      update(item.id, { unlocking: false, unlockError: null });
      if (!item.thumb) {
        void pdfPreview(res.bytes)
          .then((p) => update(item.id, { pageCount: p.pageCount, thumb: p.thumbnail }))
          .catch(() => undefined);
      }
      return true;
    } catch (e) {
      const msg = isPasswordError(e)
        ? pwd
          ? t('pdf.ulk.wrongPw')
          : t('pdf.ulk.needPw')
        : errorMessage(e);
      update(item.id, { unlocking: false, unlockError: msg });
      return false;
    }
  }

  const ready = items.filter((it) => !it.error && it.security !== null);
  const pendingItems = ready.filter((it) => !results[it.id]);
  const encryptedCount = ready.filter((it) => it.security?.isEncrypted).length;
  const needsPwdCount = ready.filter((it) => it.security?.needsPassword && !results[it.id]).length;

  async function unlockAll() {
    const targets = pendingItems.length > 0 ? pendingItems : ready;
    if (targets.length === 0) return;
    setBusy(true);
    for (let i = 0; i < targets.length; i++) {
      const item = targets[i];
      setProgress({ fraction: i / targets.length, label: item.name });
      await nextFrame();
      await unlockOne(item);
    }
    setBusy(false);
  }

  const succeeded = items.filter((it) => Boolean(results[it.id]));
  const outputs: OutputFile[] = succeeded.map((it) => ({
    name: `${baseName(it.name)}-unlocked.pdf`,
    bytes: results[it.id].bytes,
  }));
  const done = !busy && outputs.length > 0;

  const decCount = succeeded.filter((it) => results[it.id].wasEncrypted).length;

  return (
    <PdfPage
      title={UNLOCK.title}
      showHub
      lead={t('pdf.ulk.lead')}
    >
      <ToolWorkspace
        tool={UNLOCK}
        accept="application/pdf,.pdf"
        selectLabel={t('pdf.p.selectPdfs')}
        dropLabel={t('pdf.p.dropPdfs')}
        hasFiles={items.length > 0}
        onFiles={addFiles}
        toolbar={
          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => {
              setItems([]);
              setResults({});
            }}
          >
            {t('pdf.p.removeAll')}
          </button>
        }
        sidebar={
          <>
            <div className={styles.summaryBox}>
              <div className={styles.summaryRow}>
                <span>{t('pdf.ulk.filesLoaded')}</span>
                <span>{items.length}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>{t('pdf.ulk.encrypted')}</span>
                <span>{encryptedCount}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>{t('pdf.ulk.unlocked')}</span>
                <span>{succeeded.length}</span>
              </div>
            </div>

            <Field
              label={t('pdf.ulk.sharedPwLabel')}
              help={t('pdf.ulk.sharedPwHelp')}
            >
              <div className={styles.passwordInputRow}>
                <input
                  type={showSharedPwd ? 'text' : 'password'}
                  className={fieldStyles.input}
                  value={sharedPassword}
                  autoComplete="current-password"
                  placeholder={t(needsPwdCount > 0 ? 'pdf.ulk.sharedPwPh' : 'pdf.ulk.noOpenPwPh')}
                  onChange={(e) => setSharedPassword(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  aria-label={t(showSharedPwd ? 'pdf.ulk.hidePw' : 'pdf.ulk.showPw')}
                  onClick={() => setShowSharedPwd((v) => !v)}
                >
                  {t(showSharedPwd ? 'pdf.prt.hide' : 'pdf.prt.show')}
                </button>
              </div>
            </Field>

            <p className={styles.note}>{t('pdf.ulk.ownerNote')}</p>
            {notice && <p className={fieldStyles.warning}>{notice}</p>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || ready.length === 0}
              onClick={unlockAll}
            >
              {pendingItems.length > 0 && succeeded.length > 0
                ? t('pdf.ulk.btnRem', { n: pendingItems.length })
                : ready.length > 1
                  ? t('pdf.ulk.btnMany', { n: ready.length })
                  : t('pdf.ulk.btnOne')}
            </button>

            {busy && <Progress fraction={progress.fraction} label={progress.label} />}

            {done && (
              <div className={styles.result}>
                <h3>
                  {outputs.length === 1 ? t('pdf.ulk.doneOne') : t('pdf.ulk.doneMany', { n: outputs.length })}
                </h3>
                <p>
                  {t(decCount === 1 ? 'pdf.ulk.decOne' : 'pdf.ulk.decMany', { n: decCount })}
                  {pendingItems.length > 0
                    ? t(pendingItems.length === 1 ? 'pdf.ulk.remOne' : 'pdf.ulk.remMany', { n: pendingItems.length })
                    : ''}
                </p>
                {outputs.length === 1 ? (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => download(outputs[0].bytes, outputs[0].name)}
                  >
                    {t('pdf.ff.downloadNamed', { name: outputs[0].name })}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => download(zipFiles(outputs), 'unlocked-pdfs.zip', 'application/zip')}
                  >
                    {t('pdf.p.downloadAllZip')}
                  </button>
                )}
                <ContinueWith currentToolId={UNLOCK.id} files={outputs} />
              </div>
            )}
          </>
        }
      >
        <FileGrid
          items={items}
          onChange={(next) => {
            setItems(next);
            const keep = new Set(next.map((it) => it.id));
            setResults((prev) => {
              const cleaned: Record<string, ItemResult> = {};
              for (const [k, v] of Object.entries(prev)) {
                if (keep.has(k)) cleaned[k] = v;
              }
              return cleaned;
            });
          }}
          sortable={false}
          renderCard={(item, _index, controls) => {
            const r = results[item.id];
            const output = outputs[succeeded.indexOf(item)];
            const sec = item.security;
            const statusNode = r ? (
              <span className={styles.statusDone}>
                {t(r.wasEncrypted ? 'pdf.ulk.unlocked' : 'pdf.ulk.already')}
              </span>
            ) : !sec ? (
              <span className={styles.statusKept}>{t('pdf.p.inspecting')}</span>
            ) : !sec.isEncrypted ? (
              <span className={styles.statusDone}>{t('pdf.ulk.already')}</span>
            ) : sec.needsPassword ? (
              <span className={styles.statusLeft}>
                {t('pdf.p.pwReqShort')}{sec.algorithm ? ` · ${sec.algorithm}` : ''}
              </span>
            ) : (
              <span className={styles.statusPending}>
                {t('pdf.ulk.ownerLocked')}{sec.algorithm ? ` · ${sec.algorithm}` : ''}
              </span>
            );

            return (
              <FileCard
                thumb={item.thumb}
                name={item.name}
                meta={`${
                  item.pageCount !== null
                    ? t(item.pageCount === 1 ? 'pdf.ff.pagesOne' : 'pdf.ff.pagesMany', { n: item.pageCount })
                    : sec?.needsPassword && !r
                      ? t('pdf.ulk.encrypted')
                      : '…'
                } · ${formatBytes(r ? r.bytes.length : item.bytes.length)}`}
                error={item.error ?? item.unlockError}
                controls={controls}
                actions={
                  output && (
                    <button
                      type="button"
                      className={styles.buttonSmall}
                      onClick={() => download(output.bytes, output.name)}
                    >
                      {t('pdf.p.download')}
                    </button>
                  )
                }
              >
                <div className={styles.badgeRow}>{statusNode}</div>
                {sec?.needsPassword && !r && !item.error && (
                  <form
                    className={styles.cardPasswordBox}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!item.unlocking) void unlockOne(item);
                    }}
                  >
                    <input
                      type={showSharedPwd ? 'text' : 'password'}
                      className={styles.rangeInput}
                      placeholder={t(sharedPassword ? 'pdf.ulk.overridePh' : 'pdf.ulk.filePwPh')}
                      aria-label={t('pdf.ulk.pwForAria', { name: item.name })}
                      value={item.perFilePassword}
                      disabled={item.unlocking || busy}
                      onChange={(e) =>
                        update(item.id, { perFilePassword: e.target.value, unlockError: null })
                      }
                    />
                    <div className={styles.cardPasswordActions}>
                      <button
                        type="submit"
                        className={styles.buttonSmall}
                        disabled={item.unlocking || busy || (!item.perFilePassword && !sharedPassword)}
                      >
                        {t(item.unlocking ? 'pdf.ulk.unlocking' : 'pdf.ulk.unlock')}
                      </button>
                    </div>
                  </form>
                )}
              </FileCard>
            );
          }}
        />
      </ToolWorkspace>
    </PdfPage>
  );
}
