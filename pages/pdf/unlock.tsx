import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field } from '../../components/QrGen/fields';
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
import styles from '../../styles/PdfTools.module.css';
import qrStyles from '../../styles/QrGen.module.css';

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
    setNotice(pdfs.length < files.length ? `${files.length - pdfs.length} file(s) were skipped because they are not PDFs.` : null);
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
          ? 'Incorrect password. Try a different password below.'
          : 'Password required to unlock this PDF.'
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

  return (
    <PdfPage
      title={UNLOCK.title}
      showHub
      lead="Decrypt password-protected PDFs and remove owner permission restrictions locally in your browser when you know the password."
    >
      <ToolWorkspace
        tool={UNLOCK}
        accept="application/pdf,.pdf"
        selectLabel="Select PDF files"
        dropLabel="or drop PDFs here"
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
            Remove all
          </button>
        }
        sidebar={
          <>
            <div className={styles.summaryBox}>
              <div className={styles.summaryRow}>
                <span>Files loaded</span>
                <span>{items.length}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Encrypted</span>
                <span>{encryptedCount}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Unlocked</span>
                <span>{succeeded.length}</span>
              </div>
            </div>

            <Field
              label="Shared password (optional)"
              help="Applied to all password-protected files below that do not have a per-file password entered on their card."
            >
              <div className={styles.passwordInputRow}>
                <input
                  type={showSharedPwd ? 'text' : 'password'}
                  className={qrStyles.input}
                  value={sharedPassword}
                  autoComplete="current-password"
                  placeholder={needsPwdCount > 0 ? 'Enter PDF password' : 'No open password required'}
                  onChange={(e) => setSharedPassword(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  aria-label={showSharedPwd ? 'Hide password' : 'Show password'}
                  onClick={() => setShowSharedPwd((v) => !v)}
                >
                  {showSharedPwd ? 'Hide' : 'Show'}
                </button>
              </div>
            </Field>

            <p className={styles.note}>
              PDFs with owner restrictions only (no open password) can be unlocked directly with an empty password.
            </p>
            {notice && <p className={qrStyles.warning}>{notice}</p>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || ready.length === 0}
              onClick={unlockAll}
            >
              {pendingItems.length > 0 && succeeded.length > 0
                ? `Unlock ${pendingItems.length} remaining`
                : `Unlock ${ready.length > 1 ? `${ready.length} PDFs` : 'PDF'}`}
            </button>

            {busy && <Progress fraction={progress.fraction} label={progress.label} />}

            {done && (
              <div className={styles.result}>
                <h3>
                  {outputs.length === 1 ? 'Your PDF is unlocked' : `${outputs.length} PDFs are unlocked`}
                </h3>
                <p>
                  {succeeded.filter((it) => results[it.id].wasEncrypted).length} encrypted file
                  {succeeded.filter((it) => results[it.id].wasEncrypted).length === 1 ? '' : 's'} decrypted.
                  {pendingItems.length > 0
                    ? ` ${pendingItems.length} file${pendingItems.length === 1 ? '' : 's'} still need a password.`
                    : ''}
                </p>
                {outputs.length === 1 ? (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => download(outputs[0].bytes, outputs[0].name)}
                  >
                    Download {outputs[0].name}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => download(zipFiles(outputs), 'unlocked-pdfs.zip', 'application/zip')}
                  >
                    Download all (ZIP)
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
                {r.wasEncrypted ? 'Unlocked' : 'Already unlocked'}
              </span>
            ) : !sec ? (
              <span className={styles.statusKept}>Inspecting…</span>
            ) : !sec.isEncrypted ? (
              <span className={styles.statusDone}>Already unlocked</span>
            ) : sec.needsPassword ? (
              <span className={styles.statusLeft}>
                Password required{sec.algorithm ? ` · ${sec.algorithm}` : ''}
              </span>
            ) : (
              <span className={styles.statusPending}>
                Owner locked{sec.algorithm ? ` · ${sec.algorithm}` : ''}
              </span>
            );

            return (
              <FileCard
                thumb={item.thumb}
                name={item.name}
                meta={`${
                  item.pageCount !== null
                    ? `${item.pageCount} page${item.pageCount === 1 ? '' : 's'}`
                    : sec?.needsPassword && !r
                      ? 'Encrypted'
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
                      Download
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
                      placeholder={sharedPassword ? 'Override shared password' : 'File password'}
                      aria-label={`Password for ${item.name}`}
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
                        {item.unlocking ? 'Unlocking…' : 'Unlock'}
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
