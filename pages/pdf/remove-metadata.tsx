import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { baseName, download, errorMessage, formatBytes, isPasswordError, isPdf, nextFrame, OutputFile, readBytes, uid, zipFiles } from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { pdfPreview } from '../../lib/pdf/pdfjs';
import { CLEAN_OPTIONS, CleanOption, CleanOptions, Finding, FindingId, PRESETS } from '../../lib/pdf/sanitize';
import { REMOVE_METADATA } from '../../lib/pdf/tools';
import { runCleanPdf, runInspectPdf } from '../../lib/pdf/workerClient';
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

const FINDING_KEYS: Record<FindingId, TranslationKey> = {
  info: 'pdf.rmm.o.info',
  xmp: 'pdf.rmm.o.xmp',
  id: 'pdf.rmm.o.id',
  imageMeta: 'pdf.rmm.o.imageMeta',
  annotationAuthors: 'pdf.rmm.o.annotationAuthors',
  signatures: 'pdf.rmm.o.signatures',
  thumbnails: 'pdf.rmm.o.thumbnails',
  privateData: 'pdf.rmm.o.privateData',
  javascript: 'pdf.rmm.o.javascript',
  attachments: 'pdf.rmm.o.attachments',
  comments: 'pdf.rmm.o.comments',
  formData: 'pdf.rmm.o.formData',
  history: 'pdf.rmm.o.history',
};

const OPTION_HELP_KEYS: Record<CleanOption, TranslationKey> = {
  info: 'pdf.rmm.o.infoHelp',
  xmp: 'pdf.rmm.o.xmpHelp',
  id: 'pdf.rmm.o.idHelp',
  imageMeta: 'pdf.rmm.o.imageMetaHelp',
  annotationAuthors: 'pdf.rmm.o.annotationAuthorsHelp',
  signatures: 'pdf.rmm.o.signaturesHelp',
  thumbnails: 'pdf.rmm.o.thumbnailsHelp',
  privateData: 'pdf.rmm.o.privateDataHelp',
  javascript: 'pdf.rmm.o.javascriptHelp',
  attachments: 'pdf.rmm.o.attachmentsHelp',
  comments: 'pdf.rmm.o.commentsHelp',
  formData: 'pdf.rmm.o.formDataHelp',
};

const PRESET_KEYS: Record<string, [TranslationKey, TranslationKey]> = {
  metadata: ['pdf.rmm.p.metadata', 'pdf.rmm.p.metadataDesc'],
  anonymize: ['pdf.rmm.p.anonymize', 'pdf.rmm.p.anonymizeDesc'],
  maximum: ['pdf.rmm.p.maximum', 'pdf.rmm.p.maximumDesc'],
};

interface Item {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number | null;
  thumb: string | null;
  error: string | null;
  findings: Finding[] | null;
  password?: string;
  locked?: boolean;
}

interface ItemResult {
  bytes: Uint8Array;
  // What an inspection of the cleaned file still finds.
  after: Finding[];
  error?: string;
}

function Status({ id, opts, result }: { id: FindingId; opts: CleanOptions; result?: ItemResult }) {
  const { t } = useI18n();
  const willGo = id === 'history' || opts[id];
  if (!result || result.error) return willGo ? <span className={styles.statusPending}>{t('pdf.rmm.willRemove')}</span> : <span className={styles.statusKept}>{t('pdf.rmm.kept')}</span>;
  if (id === 'id' && opts.id) return <span className={styles.statusDone}>{t('pdf.rmm.replaced')}</span>;
  if (!result.after.some((f) => f.id === id)) return <span className={styles.statusDone}>{t('pdf.rmm.removed')}</span>;
  return willGo ? <span className={styles.statusLeft}>{t('pdf.rmm.partlyLeft')}</span> : <span className={styles.statusKept}>{t('pdf.rmm.kept')}</span>;
}

function Report({ item, opts, result }: { item: Item; opts: CleanOptions; result?: ItemResult }) {
  const { t } = useI18n();
  return (
    <section className={styles.report}>
      <h3>{item.name}</h3>
      {item.error && <div className={styles.error}>{item.error}</div>}
      {!item.error && item.locked && <p className={styles.note}>{t('pdf.rmm.lockedNote')}</p>}
      {!item.error && !item.locked && !item.findings && <p className={styles.note}>{t('pdf.p.inspecting')}</p>}
      {item.findings?.length === 0 && <p className={styles.note}>{t('pdf.rmm.noneFound')}</p>}
      {!!item.findings?.length && (
        <table className={styles.reportTable}>
          <tbody>
            {item.findings.map((f) => (
              <tr key={f.id}>
                <th>{t(FINDING_KEYS[f.id])}</th>
                <td><ul>{f.details.map((d, i) => <li key={i}>{d}</li>)}</ul></td>
                <td><Status id={f.id} opts={opts} result={result} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {result?.error && <div className={styles.error}>{result.error}</div>}
    </section>
  );
}

export default function RemoveMetadata() {
  const { t } = useI18n();
  const [items, setItems] = React.useState<Item[]>([]);
  const [opts, setOpts] = React.useState<CleanOptions>(PRESETS.find((p) => p.id === 'anonymize').options);
  const [neutralNames, setNeutralNames] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [notice, setNotice] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, ItemResult>>({});
  const [passwordQueue, setPasswordQueue] = React.useState<string[]>([]);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwBusy, setPwBusy] = React.useState(false);

  const preset = PRESETS.find((p) => CLEAN_OPTIONS.every((o) => p.options[o.id] === opts[o.id]))?.id ?? 'custom';
  const ids = items.map((it) => it.id).join();
  React.useEffect(() => setResults({}), [ids, opts]);

  const update = (id: string, patch: Partial<Item>) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function addFiles(files: File[]) {
    const pdfs = files.filter(isPdf);
    setNotice(pdfs.length < files.length ? t('pdf.p.skippedNonPdf', { n: files.length - pdfs.length }) : null);
    const added = await Promise.all(pdfs.map(async (file): Promise<Item> => ({
      id: uid(), name: file.name, bytes: await readBytes(file), pageCount: null, thumb: null, error: null, findings: null,
    })));
    setItems((list) => [...list, ...added]);
    for (const item of added) {
      runInspectPdf(item.bytes)
        .then((findings) => {
          update(item.id, { findings });
          return pdfPreview(item.bytes)
            .then((p) => update(item.id, { pageCount: p.pageCount, thumb: p.thumbnail }))
            .catch(() => undefined);
        })
        .catch((e) => {
          if (isPasswordError(e)) {
            update(item.id, { locked: true, error: null });
            setPasswordQueue((q) => (q.includes(item.id) ? q : [...q, item.id]));
          } else {
            update(item.id, { error: errorMessage(e) });
          }
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
      const findings = await runInspectPdf(activeLocked.bytes, password);
      update(activeLocked.id, { findings, password, locked: false, error: null });
      setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
      void pdfPreview(activeLocked.bytes, 240, password)
        .then((p) => update(activeLocked.id, { pageCount: p.pageCount, thumb: p.thumbnail }))
        .catch(() => undefined);
    } catch (e) {
      if (isPasswordError(e)) {
        setPwError(t('pdf.ff.wrongPw'));
      } else {
        update(activeLocked.id, { locked: false, error: errorMessage(e) });
        setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
      }
    } finally {
      setPwBusy(false);
    }
  }

  function cancelUnlock() {
    if (!activeLocked) return;
    update(activeLocked.id, { locked: false, error: t('pdf.p.pwRequired') });
    setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
    setPwError(null);
  }

  const ready = items.filter((it) => !it.error && !it.locked);

  async function clean() {
    setBusy(true);
    setResults({});
    const out: Record<string, ItemResult> = {};
    for (let i = 0; i < ready.length; i++) {
      const item = ready[i];
      setProgress({ fraction: i / ready.length, label: item.name });
      await nextFrame();
      try {
        const bytes = await runCleanPdf(item.bytes, opts, item.password);
        out[item.id] = { bytes, after: await runInspectPdf(bytes) };
      } catch (e) {
        out[item.id] = { bytes: item.bytes, after: [], error: errorMessage(e) };
      }
      setResults({ ...out });
    }
    setBusy(false);
  }

  const succeeded = ready.filter((it) => results[it.id] && !results[it.id].error);
  const outputs: OutputFile[] = succeeded.map((it, i) => ({
    name: neutralNames ? `document${succeeded.length > 1 ? `-${i + 1}` : ''}.pdf` : `${baseName(it.name)}-clean.pdf`,
    bytes: results[it.id].bytes,
  }));
  const done = !busy && outputs.length > 0;
  const toggle = (id: CleanOption, on: boolean) => setOpts((o) => ({ ...o, [id]: on }));

  const optionList = (changesContent: boolean) => (
    <div className={styles.checkList}>
      {CLEAN_OPTIONS.filter((o) => !!o.changesContent === changesContent).map((o) => (
        <label key={o.id} className={styles.check}>
          <input type="checkbox" checked={opts[o.id]} onChange={(e) => toggle(o.id, e.target.checked)} />
          <span><strong>{t(FINDING_KEYS[o.id])}</strong><small>{t(OPTION_HELP_KEYS[o.id])}</small></span>
        </label>
      ))}
    </div>
  );

  return (
    <PdfPage
      title={REMOVE_METADATA.title}
      showHub
      lead={t('pdf.rmm.lead')}
    >
      <ToolWorkspace
        tool={REMOVE_METADATA}
        accept="application/pdf,.pdf"
        selectLabel={t('pdf.p.selectPdfs')}
        dropLabel={t('pdf.p.dropPdfs')}
        hasFiles={items.length > 0}
        onFiles={addFiles}
        toolbar={<button type="button" className={styles.buttonSmall} onClick={() => setItems([])}>{t('pdf.p.removeAll')}</button>}
        sidebar={
          <>
            <div className={styles.levelList} role="radiogroup" aria-label={t('pdf.rmm.presetAria')}>
              {PRESETS.map((p) => {
                const pair = PRESET_KEYS[p.id];
                return (
                  <label key={p.id} className={[styles.level, preset === p.id ? styles.levelSelected : ''].join(' ')}>
                    <input type="radio" name="preset" checked={preset === p.id} onChange={() => setOpts(p.options)} />
                    <span><strong>{pair ? t(pair[0]) : p.title}</strong><small>{pair ? t(pair[1]) : p.text}</small></span>
                  </label>
                );
              })}
              <label className={[styles.level, preset === 'custom' ? styles.levelSelected : ''].join(' ')}>
                <input type="radio" name="preset" checked={preset === 'custom'} readOnly />
                <span><strong>{t('pdf.rmm.p.custom')}</strong><small>{t('pdf.rmm.p.customDesc')}</small></span>
              </label>
            </div>
            <h3>{t('pdf.rmm.hiddenData')}</h3>
            {optionList(false)}
            <h3>{t('pdf.rmm.content')}</h3>
            {optionList(true)}
            <p className={styles.note}>{t('pdf.rmm.revisionsNote')}</p>
            <label className={styles.check}>
              <input type="checkbox" checked={neutralNames} onChange={(e) => setNeutralNames(e.target.checked)} />
              <span><strong>{t('pdf.rmm.neutralNames')}</strong><small>{t('pdf.rmm.neutralNamesHelp')}</small></span>
            </label>
            {notice && <p className={fieldStyles.warning}>{notice}</p>}
            <button type="button" className={styles.primary} disabled={busy || ready.length === 0} onClick={clean}>
              {ready.length > 1 ? t('pdf.rmm.btnMany', { n: ready.length }) : t('pdf.rmm.btnOne')}
            </button>
            {busy && <Progress fraction={progress.fraction} label={progress.label} />}
            {done && (
              <div className={styles.result}>
                <h3>{outputs.length === 1 ? t('pdf.rmm.doneOne') : t('pdf.rmm.doneMany', { n: outputs.length })}</h3>
                <p>{t('pdf.rmm.doneDesc')}</p>
                {outputs.length === 1
                  ? <button type="button" className={styles.primary} onClick={() => download(outputs[0].bytes, outputs[0].name)}>{t('pdf.ff.downloadNamed', { name: outputs[0].name })}</button>
                  : <button type="button" className={styles.primary} onClick={() => download(zipFiles(outputs), 'cleaned-pdfs.zip', 'application/zip')}>{t('pdf.p.downloadAllZip')}</button>}
                <ContinueWith currentToolId={REMOVE_METADATA.id} files={outputs} />
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
            const count = item.findings?.length;
            return (
              <FileCard
                thumb={item.thumb}
                name={item.name}
                meta={`${item.locked ? t('pdf.p.pwProtected') : item.pageCount === null ? '…' : t(item.pageCount === 1 ? 'pdf.ff.pagesOne' : 'pdf.ff.pagesMany', { n: item.pageCount })} · ${formatBytes(item.bytes.length)}`}
                error={item.error ?? r?.error}
                controls={controls}
                actions={output && <button type="button" className={styles.buttonSmall} onClick={() => download(output.bytes, output.name)}>{t('pdf.p.download')}</button>}
              >
                {!item.error && !item.locked && (
                  <div className={styles.fileMeta}>
                    {r && !r.error
                      ? <span className={styles.saved}>{t('pdf.rmm.cleanedMeta', { size: formatBytes(r.bytes.length) })}</span>
                      : count === undefined ? t('pdf.p.inspecting') : count === 0 ? t('pdf.rmm.nothingFound') : t(count === 1 ? 'pdf.rmm.kindsOne' : 'pdf.rmm.kindsMany', { n: count })}
                  </div>
                )}
              </FileCard>
            );
          }}
        />
        {items.map((item) => <Report key={item.id} item={item} opts={opts} result={results[item.id]} />)}
      </ToolWorkspace>
    </PdfPage>
  );
}
