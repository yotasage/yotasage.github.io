import React from 'react';

import { canReadText, copyText } from '../../lib/base64image/clipboard';
import { baseName, download, errorMessage, safeFileName } from '../../lib/pdf/files';
import { groupDigits } from '../../lib/simsetup/numbers';
import { CaseId, CaseInfo, CODE_CASES, convertCase, PROSE_CASES, TEXT_CASES } from '../../lib/textcase/cases';
import { TitleStyle } from '../../lib/textcase/prose';
import { textStats } from '../../lib/textcase/stats';
import qrStyles from '../../styles/QrGen.module.css';
import styles from '../../styles/TextCase.module.css';
import { DropTarget, FilePickerButton } from '../PdfTools/ToolPage';
import { Checkbox, Field, Select } from '../QrGen/fields';

// The terms are kept in this browser, so they do not have to be typed again.
const TERMS_KEY = 'text-case-terms';

const TEXT_FILES = 'text/*,.txt,.md,.csv,.tsv,.log,.srt,.vtt,.json,.xml,.html,.yaml,.yml';

const TITLE_STYLES: [TitleStyle, string][] = [['chicago', 'Chicago Manual of Style'], ['apa', 'APA style']];

const TITLE_STYLE_HELP: Record<TitleStyle, string> = {
  chicago: 'Lower case for a, an, the, and, but, for, or, nor, to, as and prepositions of any length (of, in, with, between …).',
  apa: 'Lower case for a, an, the, and conjunctions and prepositions of up to three letters (and, or, of, in, on, by …). Longer ones such as with and from get a capital.',
};

const plural = (n: number, word: string) => `${groupDigits(String(n), 'space')} ${word}${n === 1 ? '' : 's'}`;

function CaseButtons({ label, cases, value, onChange, code }: {
  label: string;
  cases: CaseInfo[];
  value: CaseId;
  onChange: (id: CaseId) => void;
  code?: boolean;
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
            className={[qrStyles.button, styles.caseButton, code ? styles.code : '', c.id === value ? styles.selected : ''].join(' ')}
            onClick={() => onChange(c.id)}
          >
            {c.label}
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
      <small className={qrStyles.help}>{help}</small>
    </div>
  );
}

export default function CaseConverter() {
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
        setNotice(`${f.name} does not look like a text file.`);
        return;
      }
      setText(content);
      const name = baseName(f.name);
      setFile({ name, ext: f.name.slice(name.length) || '.txt' });
    } catch (e) {
      setNotice(`Could not read ${f.name}: ${errorMessage(e)}`);
    }
  }

  async function paste() {
    setNotice(null);
    try {
      setText(await navigator.clipboard.readText());
    } catch (e) {
      setNotice(`Could not read the clipboard: ${errorMessage(e)}`);
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

  const downloadName = `${safeFileName(`${file.name} (${info.label})`, 'text')}${file.ext}`;

  return (
    <div className={styles.workspace}>
      <DropTarget onFiles={openFile} className={[qrStyles.card, styles.panel, styles.inputCard].join(' ')} overClassName={styles.dropOver}>
        <h2>Input</h2>
        <textarea
          className={[qrStyles.textarea, styles.text].join(' ')}
          value={text}
          aria-label="Input"
          placeholder="Type or paste text here, or drop a text file."
          onChange={(e) => setText(e.target.value)}
        />
        <p className={qrStyles.help}>
          {plural(stats.characters, 'character')} · {plural(stats.words, 'word')} · {plural(stats.lines, 'line')}
        </p>
        <div className={qrStyles.buttonRow}>
          {canPaste && <button type="button" className={qrStyles.buttonSmall} onClick={paste}>Paste</button>}
          <FilePickerButton accept={TEXT_FILES} multiple={false} onFiles={openFile} className={qrStyles.buttonSmall}>Open text file</FilePickerButton>
          <button type="button" className={qrStyles.buttonSmall} disabled={!text} onClick={clear}>Clear</button>
        </div>
        {notice && <p className={qrStyles.warning}>{notice}</p>}
      </DropTarget>

      <section className={[qrStyles.card, styles.panel, styles.caseCard].join(' ')} aria-label="Case">
        <div className={styles.groups}>
          <CaseButtons label="Text" cases={TEXT_CASES} value={caseId} onChange={setCaseId} />
          <CaseButtons label="Names in code" cases={CODE_CASES} value={caseId} onChange={setCaseId} code />
        </div>
        <p className={styles.description}>{info.description}</p>
      </section>

      <section className={[qrStyles.card, styles.panel, styles.resultCard].join(' ')}>
        <h2>Result</h2>
        <textarea
          className={[qrStyles.textarea, styles.text, isCode ? styles.codeText : ''].join(' ')}
          value={result}
          readOnly
          spellCheck={false}
          aria-label="Result"
          placeholder="The result appears here."
        />
        <div className={qrStyles.buttonRow}>
          <button type="button" className={qrStyles.button} disabled={!result} onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
          <button type="button" className={qrStyles.button} disabled={!result} onClick={() => download(new Blob([result], { type: 'text/plain;charset=utf-8' }), downloadName)}>
            Download {file.ext}
          </button>
          <button type="button" className={qrStyles.button} disabled={!result || result === text} onClick={() => setText(result)}>Use as input</button>
        </div>
        {copyError && <p className={qrStyles.warning}>{copyError}</p>}

        {PROSE_CASES.has(caseId) && (
          <>
            <h3>Options</h3>
            <div className={styles.options}>
              {caseId === 'title' && (
                <Field label="Small words in lower case" help={TITLE_STYLE_HELP[titleStyle]}>
                  <Select value={titleStyle} onChange={setTitleStyle} options={TITLE_STYLES} />
                </Field>
              )}
              {caseId === 'sentence' && (
                <Option
                  label="Keep names: words with a capital in the middle of a sentence (John, Oslo)"
                  help="Except in lines where most words have a capital, such as titles."
                  checked={keepNames}
                  onChange={setKeepNames}
                />
              )}
              <Option
                label="Keep acronyms, words with capitals inside and web addresses (NASA, iPhone, MHz, example.com)"
                help="Except in lines where most words are in capitals."
                checked={keepSpecial}
                onChange={setKeepSpecial}
              />
              {caseId === 'sentence' && (
                <>
                  <Option
                    label="A new line starts a new sentence"
                    help="Turn off for text with line breaks inside sentences, such as text copied from a PDF."
                    checked={newLineSentence}
                    onChange={setNewLineSentence}
                  />
                  <Option
                    label="Write the English word i as I"
                    help="Turn off for languages where i is a word, such as Norwegian and Swedish."
                    checked={englishI}
                    onChange={setEnglishI}
                  />
                </>
              )}
              <Field
                label="Words with fixed capitals"
                help="One per line, such as iPhone, GitHub or New York. They are always written like this, also at the start of a sentence. Saved in this browser."
              >
                <textarea
                  className={[qrStyles.textarea, styles.terms].join(' ')}
                  value={termsText}
                  spellCheck={false}
                  onChange={(e) => changeTerms(e.target.value)}
                />
              </Field>
            </div>
          </>
        )}
        {isCode && (
          <>
            <h3>Options</h3>
            <div className={styles.options}>
              <Checkbox label="Only ASCII letters and digits (é → e, æ → ae, ø → o)" checked={ascii} onChange={setAscii} />
              <p className={qrStyles.help}>
                Each line becomes one name. Words are split at spaces, punctuation and changes of case, so XMLHttpRequest is
                XML, Http and Request.
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
