import React from 'react';

import { canReadText, copyText } from '../../lib/base64image/clipboard';
import { baseName, download, errorMessage, safeFileName } from '../../lib/pdf/files';
import { groupDigits } from '../../lib/simsetup/numbers';
import { CaseId, CaseInfo, CODE_CASES, convertCase, PROSE_CASES, TEXT_CASES } from '../../lib/textcase/cases';
import { TitleStyle } from '../../lib/textcase/prose';
import { textStats } from '../../lib/textcase/stats';
import type { TextCaseExamplePreset } from '../../lib/textcase/examples';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/TextCase.module.css';
import { DropTarget, FilePickerButton } from '../PdfTools/ToolPage';
import { Checkbox, Field, Select } from '../UI/Fields';

// The terms are kept in this browser, so they do not have to be typed again.
const TERMS_KEY = 'text-case-terms';

const TEXT_FILES = 'text/*,.txt,.md,.csv,.tsv,.log,.srt,.vtt,.json,.xml,.html,.yaml,.yml';

function CaseButtons({ label, cases, value, onChange, code, getLabel }: {
  label: string;
  cases: CaseInfo[];
  value: CaseId;
  onChange: (id: CaseId) => void;
  code?: boolean;
  getLabel: (c: CaseInfo) => string;
}) {
  return (
    <div className={styles.group} role="group" aria-label={label}>
      <span className={styles.groupLabel} aria-hidden="true">{label}</span>
      <div className={styles.buttons}>
        {cases.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={c.id === value}
            className={[styles.caseButton, code ? styles.code : '', c.id === value ? styles.selected : ''].filter(Boolean).join(' ')}
            onClick={() => onChange(c.id)}
          >
            {getLabel(c)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Option({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={styles.option}>
      <Checkbox label={label} checked={checked} onChange={onChange} />
      <small>{help}</small>
    </div>
  );
}

export default function CaseConverter({
  hideOptions = false,
  exampleRequest = null,
}: {
  hideOptions?: boolean;
  exampleRequest?: { preset: TextCaseExamplePreset; seq: number } | null;
}) {
  const { t } = useI18n();
  const [text, setText] = React.useState('');
  const [file, setFile] = React.useState({ name: 'text', ext: '.txt' });
  const [caseId, setCaseId] = React.useState<CaseId>('sentence');
  const [keepSpecial, setKeepSpecial] = React.useState(true);
  const [keepNames, setKeepNames] = React.useState(true);
  const [newLineSentence, setNewLineSentence] = React.useState(true);
  const [englishI, setEnglishI] = React.useState(true);
  const [titleStyle, setTitleStyle] = React.useState<TitleStyle>('chicago');
  const [termsText, setTermsText] = React.useState('');
  const [ascii, setAscii] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [copyError, setCopyError] = React.useState<string | null>(null);
  // Clipboard support and saved terms are only known in the browser, so they are read after the page has loaded.
  const [canPaste, setCanPaste] = React.useState(false);
  React.useEffect(() => {
    setCanPaste(canReadText());
    try {
      setTermsText(localStorage.getItem(TERMS_KEY) ?? '');
    } catch {
      // Storage is blocked, so the terms are not remembered.
    }
  }, []);

  const lastExampleSeqRef = React.useRef(0);
  React.useEffect(() => {
    if (!exampleRequest || exampleRequest.seq === lastExampleSeqRef.current) return;
    lastExampleSeqRef.current = exampleRequest.seq;
    const { preset } = exampleRequest;
    setText(preset.text);
    setCaseId(preset.caseId);
    if (preset.titleStyle) setTitleStyle(preset.titleStyle);
    setAscii(Boolean(preset.ascii));
    setNotice(null);
  }, [exampleRequest]);

  function changeTerms(value: string) {
    setTermsText(value);
    try {
      if (value.trim()) localStorage.setItem(TERMS_KEY, value);
      else localStorage.removeItem(TERMS_KEY);
    } catch {
      // As above.
    }
  }

  // Converting a long text takes a moment, so it does not hold up typing.
  const input = React.useDeferredValue(text);
  const terms = React.useMemo(() => termsText.split('\n'), [termsText]);
  const result = React.useMemo(
    () => convertCase(input, caseId, { keepSpecial, keepNames, newLineSentence, englishI, titleStyle, terms, ascii }),
    [input, caseId, keepSpecial, keepNames, newLineSentence, englishI, titleStyle, terms, ascii],
  );
  const stats = React.useMemo(() => textStats(input), [input]);
  const info = [...TEXT_CASES, ...CODE_CASES].find((c) => c.id === caseId);
  const isCode = CODE_CASES.includes(info);

  React.useEffect(() => {
    setCopied(false);
    setCopyError(null);
  }, [result]);

  async function openFile(files: File[]) {
    const f = files[0];
    setNotice(null);
    try {
      const content = await f.text();
      if (content.includes('\0')) {
        setNotice(t('textcase.err.notText', { name: f.name }));
        return;
      }
      setText(content);
      const name = baseName(f.name);
      setFile({ name, ext: f.name.slice(name.length) || '.txt' });
    } catch (e) {
      setNotice(t('textcase.err.cantRead', { name: f.name, msg: errorMessage(e) }));
    }
  }

  async function paste() {
    setNotice(null);
    try {
      setText(await navigator.clipboard.readText());
    } catch (e) {
      setNotice(t('textcase.err.cantPaste', { msg: errorMessage(e) }));
    }
  }

  function clear() {
    setText('');
    setFile({ name: 'text', ext: '.txt' });
    setNotice(null);
  }

  async function copy() {
    try {
      await copyText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      setCopyError(errorMessage(e));
    }
  }

  const getCaseLabel = (c: CaseInfo) => {
    const key = `textcase.case.${c.id}.label`;
    const tr = t(key);
    return tr === key ? c.label : tr;
  };
  const caseDescription = t(`textcase.case.${caseId}.desc`);
  const titleStyles: [TitleStyle, string][] = [
    ['chicago', t('textcase.style.chicago')],
    ['apa', t('textcase.style.apa')],
  ];
  const titleStyleHelp: Record<TitleStyle, string> = {
    chicago: t('textcase.style.chicagoHelp'),
    apa: t('textcase.style.apaHelp'),
  };
  const fmtCount = (n: number, one: string, many: string) =>
    `${groupDigits(String(n), 'space')} ${n === 1 ? one : many}`;
  const downloadName = `${safeFileName(`${file.name} (${getCaseLabel(info)})`, 'text')}${file.ext}`;

  return (
    <div className={styles.workspace}>
      <DropTarget onFiles={openFile} className={[styles.card, styles.panel, styles.inputCard].join(' ')} overClassName={styles.dropOver}>
        <h2>{t('textcase.input.title')}</h2>
        <textarea
          className={styles.textarea}
          value={text}
          aria-label={t('textcase.input.title')}
          placeholder={t('textcase.input.placeholder')}
          onChange={(e) => setText(e.target.value)}
        />
        <p className={styles.stats}>
          {fmtCount(stats.characters, t('textcase.stats.charOne'), t('textcase.stats.charMany'))} ·{' '}
          {fmtCount(stats.words, t('textcase.stats.wordOne'), t('textcase.stats.wordMany'))} ·{' '}
          {fmtCount(stats.lines, t('textcase.stats.lineOne'), t('textcase.stats.lineMany'))}
        </p>
        <div className={styles.buttonRow}>
          {canPaste && <button type="button" className={styles.buttonSmall} onClick={paste}>{t('textcase.input.paste')}</button>}
          <FilePickerButton accept={TEXT_FILES} multiple={false} onFiles={openFile} className={styles.buttonSmall}>
            {t('textcase.input.openFile')}
          </FilePickerButton>
          <button type="button" className={styles.buttonSmall} disabled={!text} onClick={clear}>
            {t('textcase.input.clear')}
          </button>
        </div>
        {notice && <p className={styles.warning}>{notice}</p>}
      </DropTarget>

      <section className={[styles.card, styles.panel, styles.caseCard].join(' ')} aria-label={t('textcase.case.aria')}>
        <div className={styles.groups}>
          <CaseButtons label={t('textcase.case.textGroup')} cases={TEXT_CASES} value={caseId} onChange={setCaseId} getLabel={getCaseLabel} />
          <CaseButtons label={t('textcase.case.codeGroup')} cases={CODE_CASES} value={caseId} onChange={setCaseId} code getLabel={getCaseLabel} />
        </div>
        <p className={styles.description}>{caseDescription}</p>
      </section>

      <section className={[styles.card, styles.panel, styles.resultCard].join(' ')}>
        <h2>{t('textcase.result.title')}</h2>
        <textarea
          className={[styles.textarea, isCode ? styles.codeText : ''].filter(Boolean).join(' ')}
          value={result}
          readOnly
          spellCheck={false}
          aria-label={t('textcase.result.title')}
          placeholder={t('textcase.result.placeholder')}
        />
        <div className={styles.buttonRow}>
          <button type="button" className={styles.primaryButton} disabled={!result} onClick={copy}>
            {copied ? t('textcase.result.copied') : t('textcase.result.copy')}
          </button>
          <button type="button" className={styles.button} disabled={!result} onClick={() => download(new Blob([result], { type: 'text/plain;charset=utf-8' }), downloadName)}>
            {t('textcase.result.download')} {file.ext}
          </button>
          <button type="button" className={styles.button} disabled={!result || result === text} onClick={() => setText(result)}>
            {t('textcase.result.useAsInput')}
          </button>
        </div>
        {copyError && <p className={styles.warning}>{copyError}</p>}

        {!hideOptions && PROSE_CASES.has(caseId) && (
          <>
            <h3>{t('textcase.result.options')}</h3>
            <div className={styles.options}>
              {caseId === 'title' && (
                <Field label={t('textcase.opt.smallWords')} help={titleStyleHelp[titleStyle]}>
                  <Select value={titleStyle} onChange={setTitleStyle} options={titleStyles} />
                </Field>
              )}
              {caseId === 'sentence' && (
                <Option
                  label={t('textcase.opt.keepNames')}
                  help={t('textcase.opt.keepNamesHelp')}
                  checked={keepNames}
                  onChange={setKeepNames}
                />
              )}
              <Option
                label={t('textcase.opt.keepSpecial')}
                help={t('textcase.opt.keepSpecialHelp')}
                checked={keepSpecial}
                onChange={setKeepSpecial}
              />
              {caseId === 'sentence' && (
                <>
                  <Option
                    label={t('textcase.opt.newLine')}
                    help={t('textcase.opt.newLineHelp')}
                    checked={newLineSentence}
                    onChange={setNewLineSentence}
                  />
                  <Option
                    label={t('textcase.opt.englishI')}
                    help={t('textcase.opt.englishIHelp')}
                    checked={englishI}
                    onChange={setEnglishI}
                  />
                </>
              )}
              <Field
                label={t('textcase.opt.fixedTerms')}
                help={t('textcase.opt.fixedTermsHelp')}
              >
                <textarea
                  className={[styles.textarea, styles.terms].join(' ')}
                  value={termsText}
                  spellCheck={false}
                  onChange={(e) => changeTerms(e.target.value)}
                />
              </Field>
            </div>
          </>
        )}
        {!hideOptions && isCode && (
          <>
            <h3>{t('textcase.result.options')}</h3>
            <div className={styles.options}>
              <Checkbox label={t('textcase.opt.ascii')} checked={ascii} onChange={setAscii} />
              <p className={styles.help}>{t('textcase.opt.codeHelp')}</p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
