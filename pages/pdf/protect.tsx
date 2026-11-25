import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Checkbox, Field, Select } from '../../components/UI/Fields';
import {
  baseName,
  download,
  errorMessage,
  formatBytes,
  isPdf,
  nextFrame,
  OutputFile,
  readBytes,
  uid,
  zipFiles,
} from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { pdfPreview } from '../../lib/pdf/pdfjs';
import { ProtectAlgorithm, ProtectOptions, ProtectPermissions, SecurityInfo } from '../../lib/pdf/security';
import { PROTECT, READER, UNLOCK } from '../../lib/pdf/tools';
import { runInspectSecurity, runProtectPdf } from '../../lib/pdf/workerClient';
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
  password?: string;
  locked?: boolean;
}

interface ItemResult {
  bytes: Uint8Array;
  error?: string;
}

type PrintingMode = 'highResolution' | 'lowResolution' | 'none';

export default function ProtectPdfPage() {
  const { t } = useI18n();
  const [items, setItems] = React.useState<Item[]>([]);
  const [userPassword, setUserPassword] = React.useState('');
  const [showUserPwd, setShowUserPwd] = React.useState(false);
  const [ownerPassword, setOwnerPassword] = React.useState('');
  const [showOwnerPwd, setShowOwnerPwd] = React.useState(false);
  const [algorithm, setAlgorithm] = React.useState<ProtectAlgorithm>('aes256');
  const [printing, setPrinting] = React.useState<PrintingMode>('highResolution');
  const [modifying, setModifying] = React.useState(true);
  const [copying, setCopying] = React.useState(true);
  const [annotating, setAnnotating] = React.useState(true);
  const [fillingForms, setFillingForms] = React.useState(true);
  const [contentAccessibility, setContentAccessibility] = React.useState(true);
  const [documentAssembly, setDocumentAssembly] = React.useState(true);

  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [notice, setNotice] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, ItemResult>>({});
  const [passwordQueue, setPasswordQueue] = React.useState<string[]>([]);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwBusy, setPwBusy] = React.useState(false);

  const ids = items.map((it) => it.id).join();
  React.useEffect(() => {
    setResults({});
  }, [
    ids,
    userPassword,
    ownerPassword,
    algorithm,
    printing,
    modifying,
    copying,
    annotating,
    fillingForms,
    contentAccessibility,
    documentAssembly,
  ]);

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
      })),
    );
    setItems((list) => [...list, ...added]);
    for (const item of added) {
      runInspectSecurity(item.bytes)
        .then((security) => {
          if (security.needsPassword) {
            update(item.id, { security, locked: true, error: null });
            setPasswordQueue((q) => (q.includes(item.id) ? q : [...q, item.id]));
          } else {
            update(item.id, { security, locked: false, error: null });
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

  const activeLocked = React.useMemo(
    () => passwordQueue.map((id) => items.find((it) => it.id === id && it.locked)).find(Boolean) ?? null,
    [passwordQueue, items],
  );
  const remainingLocked = React.useMemo(
    () => passwordQueue.filter((id) => id !== activeLocked?.id && items.some((it) => it.id === id && it.locked)).length,
    [passwordQueue, items, activeLocked],
  );

  async function unlockActive(password: string) {
    if (!activeLocked) return;
    setPwBusy(true);
    setPwError(null);
    try {
      const info = await runInspectSecurity(activeLocked.bytes, password);
      if (!info.passwordAccepted) {
        setPwError(t('pdf.ff.wrongPw'));
        return;
      }
      update(activeLocked.id, { security: info, password, locked: false, error: null });
      setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
      void pdfPreview(activeLocked.bytes, 240, password)
        .then((p) => update(activeLocked.id, { pageCount: p.pageCount, thumb: p.thumbnail }))
        .catch(() => undefined);
    } catch (e) {
      update(activeLocked.id, { locked: false, error: errorMessage(e) });
      setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
    } finally {
      setPwBusy(false);
    }
  }

  function cancelUnlock() {
    if (!activeLocked) return;
    update(activeLocked.id, { locked: false, error: t('pdf.prt.curPwNeeded') });
    setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
    setPwError(null);
  }

  const hasRestriction =
    printing !== 'highResolution' ||
    !modifying ||
    !copying ||
    !annotating ||
    !fillingForms ||
    !contentAccessibility ||
    !documentAssembly;

  const canProtect = Boolean(userPassword || ownerPassword || hasRestriction);
  const ready = items.filter((it) => !it.error && !it.locked && it.security !== null);

  async function runProtect() {
    if (!canProtect || ready.length === 0) return;
    setBusy(true);
    setResults({});

    const permissions: ProtectPermissions = {
      printing: printing === 'none' ? false : printing,
      modifying,
      copying,
      annotating,
      fillingForms,
      contentAccessibility,
      documentAssembly,
    };
    const opts: ProtectOptions = {
      userPassword: userPassword || undefined,
      ownerPassword: ownerPassword || undefined,
      algorithm,
      permissions,
    };

    const out: Record<string, ItemResult> = {};
    for (let i = 0; i < ready.length; i++) {
      const item = ready[i];
      setProgress({ fraction: i / ready.length, label: item.name });
      await nextFrame();
      try {
        const bytes = await runProtectPdf(item.bytes, opts, item.password);
        out[item.id] = { bytes };
      } catch (e) {
        out[item.id] = { bytes: item.bytes, error: errorMessage(e) };
      }
      setResults({ ...out });
    }
    setBusy(false);
  }

  const succeeded = ready.filter((it) => results[it.id] && !results[it.id].error);
  const outputs: OutputFile[] = succeeded.map((it) => ({
    name: `${baseName(it.name)}-protected.pdf`,
    bytes: results[it.id].bytes,
  }));
  const done = !busy && outputs.length > 0;

  return (
    <PdfPage
      title={PROTECT.title}
      showHub
      lead={t('pdf.prt.lead')}
    >
      <ToolWorkspace
        tool={PROTECT}
        accept="application/pdf,.pdf"
        selectLabel={t('pdf.p.selectPdfs')}
        dropLabel={t('pdf.p.dropPdfs')}
        hasFiles={items.length > 0}
        onFiles={addFiles}
        toolbar={
          <button type="button" className={styles.buttonSmall} onClick={() => setItems([])}>
            {t('pdf.p.removeAll')}
          </button>
        }
        sidebar={
          <>
            <Field
              label={t('pdf.prt.userPwLabel')}
              help={t('pdf.prt.userPwHelp')}
            >
              <div className={styles.passwordInputRow}>
                <input
                  type={showUserPwd ? 'text' : 'password'}
                  className={fieldStyles.input}
                  value={userPassword}
                  autoComplete="new-password"
                  placeholder={t('pdf.prt.userPwPh')}
                  onChange={(e) => setUserPassword(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  aria-label={t(showUserPwd ? 'pdf.prt.hideUserPw' : 'pdf.prt.showUserPw')}
                  onClick={() => setShowUserPwd((v) => !v)}
                >
                  {t(showUserPwd ? 'pdf.prt.hide' : 'pdf.prt.show')}
                </button>
              </div>
            </Field>

            <Field
              label={t('pdf.prt.ownerPwLabel')}
              help={t('pdf.prt.ownerPwHelp')}
            >
              <div className={styles.passwordInputRow}>
                <input
                  type={showOwnerPwd ? 'text' : 'password'}
                  className={fieldStyles.input}
                  value={ownerPassword}
                  autoComplete="new-password"
                  placeholder={t('pdf.prt.ownerPwPh')}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  aria-label={t(showOwnerPwd ? 'pdf.prt.hideOwnerPw' : 'pdf.prt.showOwnerPw')}
                  onClick={() => setShowOwnerPwd((v) => !v)}
                >
                  {t(showOwnerPwd ? 'pdf.prt.hide' : 'pdf.prt.show')}
                </button>
              </div>
            </Field>

            <Field label={t('pdf.prt.algoLabel')}>
              <Select<ProtectAlgorithm>
                value={algorithm}
                onChange={setAlgorithm}
                options={[
                  ['aes256', t('pdf.prt.aes256')],
                  ['aes128', t('pdf.prt.aes128')],
                ]}
              />
            </Field>

            <h3>{t('pdf.prt.permsHeading')}</h3>
            <Field label={t('pdf.prt.printing')}>
              <Select<PrintingMode>
                value={printing}
                onChange={setPrinting}
                options={[
                  ['highResolution', t('pdf.prt.printHigh')],
                  ['lowResolution', t('pdf.prt.printLow')],
                  ['none', t('pdf.prt.printNone')],
                ]}
              />
            </Field>

            <div className={styles.checkList}>
              <Checkbox label={t('pdf.prt.allowMod')} checked={modifying} onChange={setModifying} />
              <Checkbox label={t('pdf.prt.allowCopy')} checked={copying} onChange={setCopying} />
              <Checkbox label={t('pdf.prt.allowAnnot')} checked={annotating} onChange={setAnnotating} />
              <Checkbox label={t('pdf.prt.allowForm')} checked={fillingForms} onChange={setFillingForms} />
              <Checkbox
                label={t('pdf.prt.allowA11y')}
                checked={contentAccessibility}
                onChange={setContentAccessibility}
              />
              <Checkbox
                label={t('pdf.prt.allowAsm')}
                checked={documentAssembly}
                onChange={setDocumentAssembly}
              />
            </div>

            {!canProtect && (
              <p className={styles.note}>{t('pdf.prt.needOne')}</p>
            )}
            {notice && <p className={fieldStyles.warning}>{notice}</p>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || ready.length === 0 || !canProtect}
              onClick={runProtect}
            >
              {ready.length > 1 ? t('pdf.prt.btnMany', { n: ready.length }) : t('pdf.prt.btnOne')}
            </button>

            {busy && <Progress fraction={progress.fraction} label={progress.label} />}

            {done && (
              <div className={styles.result}>
                <h3>{outputs.length === 1 ? t('pdf.prt.doneOne') : t('pdf.prt.doneMany', { n: outputs.length })}</h3>
                <p>
                  {t('pdf.prt.doneDesc', { alg: algorithm === 'aes256' ? 'AES-256' : 'AES-128' })}
                  {!userPassword && hasRestriction ? t('pdf.prt.doneNoUserPw') : ''}
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
                    onClick={() => download(zipFiles(outputs), 'protected-pdfs.zip', 'application/zip')}
                  >
                    {t('pdf.p.downloadAllZip')}
                  </button>
                )}
                <ContinueWith currentToolId={PROTECT.id} files={outputs} targets={[UNLOCK, READER]} />
              </div>
            )}
          </>
        }
      >
        {activeLocked && (
          <PasswordPrompt
            fileName={activeLocked.name}
            error={pwError}
            busy={pwBusy}
            remaining={remainingLocked}
            onSubmit={unlockActive}
            onCancel={cancelUnlock}
          />
        )}
        <FileGrid
          items={items}
          onChange={setItems}
          sortable={false}
          renderCard={(item, _index, controls) => {
            const r = results[item.id];
            const output = outputs[succeeded.indexOf(item)];
            return (
              <FileCard
                thumb={item.thumb}
                name={item.name}
                meta={`${
                  item.locked
                    ? t('pdf.prt.lockedMeta')
                    : item.pageCount === null
                      ? '…'
                      : t(item.pageCount === 1 ? 'pdf.ff.pagesOne' : 'pdf.ff.pagesMany', { n: item.pageCount })
                } · ${formatBytes(item.bytes.length)}`}
                error={item.error ?? r?.error}
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
                {!item.error && !item.locked && (
                  <div className={styles.fileMeta}>
                    {r && !r.error ? (
                      <span className={styles.saved}>
                        {t('pdf.prt.cardDone', { alg: algorithm === 'aes256' ? 'AES-256' : 'AES-128', size: formatBytes(r.bytes.length) })}
                      </span>
                    ) : item.security === null ? (
                      t('pdf.p.inspecting')
                    ) : item.security.isEncrypted ? (
                      t('pdf.prt.curEnc', { alg: item.security.algorithm ?? t('pdf.prt.stdAlg') })
                    ) : (
                      t('pdf.prt.unenc')
                    )}
                  </div>
                )}
              </FileCard>
            );
          }}
        />
      </ToolWorkspace>
    </PdfPage>
  );
}
