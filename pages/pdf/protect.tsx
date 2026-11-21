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
        setPwError('Incorrect password. Try again.');
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
    update(activeLocked.id, { locked: false, error: 'Current password required before re-encrypting this PDF.' });
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
      lead="Encrypt one or more PDFs locally in your browser with AES-256 or AES-128 passwords and fine-grained permission controls."
    >
      <ToolWorkspace
        tool={PROTECT}
        accept="application/pdf,.pdf"
        selectLabel="Select PDF files"
        dropLabel="or drop PDFs here"
        hasFiles={items.length > 0}
        onFiles={addFiles}
        toolbar={
          <button type="button" className={styles.buttonSmall} onClick={() => setItems([])}>
            Remove all
          </button>
        }
        sidebar={
          <>
            <Field
              label="User password (to open PDF)"
              help="Required when opening the file. Leave empty if you only want an owner password or permission restrictions."
            >
              <div className={styles.passwordInputRow}>
                <input
                  type={showUserPwd ? 'text' : 'password'}
                  className={fieldStyles.input}
                  value={userPassword}
                  autoComplete="new-password"
                  placeholder="Enter open password"
                  onChange={(e) => setUserPassword(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  aria-label={showUserPwd ? 'Hide user password' : 'Show user password'}
                  onClick={() => setShowUserPwd((v) => !v)}
                >
                  {showUserPwd ? 'Hide' : 'Show'}
                </button>
              </div>
            </Field>

            <Field
              label="Owner password (optional)"
              help="Grants full access to change permissions later. If left blank while permissions are restricted, a strong random owner password is generated automatically."
            >
              <div className={styles.passwordInputRow}>
                <input
                  type={showOwnerPwd ? 'text' : 'password'}
                  className={fieldStyles.input}
                  value={ownerPassword}
                  autoComplete="new-password"
                  placeholder="Optional owner password"
                  onChange={(e) => setOwnerPassword(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  aria-label={showOwnerPwd ? 'Hide owner password' : 'Show owner password'}
                  onClick={() => setShowOwnerPwd((v) => !v)}
                >
                  {showOwnerPwd ? 'Hide' : 'Show'}
                </button>
              </div>
            </Field>

            <Field label="Encryption algorithm">
              <Select<ProtectAlgorithm>
                value={algorithm}
                onChange={setAlgorithm}
                options={[
                  ['aes256', 'AES-256 (recommended)'],
                  ['aes128', 'AES-128 (legacy compatibility)'],
                ]}
              />
            </Field>

            <h3>Permissions</h3>
            <Field label="Printing">
              <Select<PrintingMode>
                value={printing}
                onChange={setPrinting}
                options={[
                  ['highResolution', 'High resolution (allowed)'],
                  ['lowResolution', 'Low resolution only'],
                  ['none', 'Disallowed'],
                ]}
              />
            </Field>

            <div className={styles.checkList}>
              <Checkbox label="Allow modifying document" checked={modifying} onChange={setModifying} />
              <Checkbox label="Allow copying text & images" checked={copying} onChange={setCopying} />
              <Checkbox label="Allow annotating & commenting" checked={annotating} onChange={setAnnotating} />
              <Checkbox label="Allow filling form fields" checked={fillingForms} onChange={setFillingForms} />
              <Checkbox
                label="Allow screen-reader accessibility"
                checked={contentAccessibility}
                onChange={setContentAccessibility}
              />
              <Checkbox
                label="Allow document assembly (pages)"
                checked={documentAssembly}
                onChange={setDocumentAssembly}
              />
            </div>

            {!canProtect && (
              <p className={styles.note}>
                Enter a user password, an owner password, or restrict at least one permission to protect your PDF.
              </p>
            )}
            {notice && <p className={fieldStyles.warning}>{notice}</p>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || ready.length === 0 || !canProtect}
              onClick={runProtect}
            >
              Protect {ready.length > 1 ? `${ready.length} PDFs` : 'PDF'}
            </button>

            {busy && <Progress fraction={progress.fraction} label={progress.label} />}

            {done && (
              <div className={styles.result}>
                <h3>{outputs.length === 1 ? 'Your PDF is protected' : `${outputs.length} PDFs are protected`}</h3>
                <p>
                  Encrypted with {algorithm === 'aes256' ? 'AES-256' : 'AES-128'}.
                  {!userPassword && hasRestriction ? ' Opens without a password with permission restrictions enforced.' : ''}
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
                    onClick={() => download(zipFiles(outputs), 'protected-pdfs.zip', 'application/zip')}
                  >
                    Download all (ZIP)
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
                    ? 'Locked (password needed)'
                    : item.pageCount === null
                      ? '…'
                      : `${item.pageCount} page${item.pageCount === 1 ? '' : 's'}`
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
                      Download
                    </button>
                  )
                }
              >
                {!item.error && !item.locked && (
                  <div className={styles.fileMeta}>
                    {r && !r.error ? (
                      <span className={styles.saved}>
                        Protected ({algorithm === 'aes256' ? 'AES-256' : 'AES-128'}) · {formatBytes(r.bytes.length)}
                      </span>
                    ) : item.security === null ? (
                      'Inspecting…'
                    ) : item.security.isEncrypted ? (
                      `Currently encrypted (${item.security.algorithm ?? 'Standard'})`
                    ) : (
                      'Unencrypted'
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
