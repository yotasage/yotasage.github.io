// Citations and a reference list in IEEE style, from the entries in references.bib.
//
// https://kildekompasset.no/referansestiler/ieee/
//
// Usage on a page (see lib/references.ts for loading the entries):
//
//   const bib = new Bibliography(references);
//   <p>Source: {bib.cite('AD')}</p>
//   …
//   {bib.list()}
//
// The numbers follow the order in which the references are first cited, and only cited references are
// listed. Both are worked out while the page renders, so bib.list() must come after the last citation.
// bib can be passed to child components that cite as well.

import React from 'react';

import { BibEntry, formatNames, latexToText } from '../lib/bibtex';
import styles from '../styles/Bibliography.module.css';

export default class Bibliography {
  private readonly entries: Map<string, BibEntry>;
  private readonly cited: string[] = [];

  constructor(references: BibEntry[]) {
    this.entries = new Map(references.map((entry) => [entry.key, entry]));
  }

  /** "[1]", linking to the reference in the list. */
  cite(key: string): React.ReactNode {
    return <Citation bibliography={this} citeKey={key} />;
  }

  /** The cited references, in the order they were first cited. */
  list(): React.ReactNode {
    return <ReferenceList bibliography={this} />;
  }

  // Called while rendering, so the numbers follow the order of the citations on the page.
  number(key: string): number {
    if (!this.entries.has(key)) throw new Error(`Unknown reference "${key}". Add it to references.bib.`);
    let index = this.cited.indexOf(key);
    if (index < 0) index = this.cited.push(key) - 1;
    return index + 1;
  }

  citedEntries(): BibEntry[] {
    return this.cited.map((key) => this.entries.get(key));
  }
}

function anchor(key: string) {
  return `ref-${key}`;
}

function Citation({ bibliography, citeKey }: { bibliography: Bibliography; citeKey: string }) {
  return <a className={styles.cite} href={`#${anchor(citeKey)}`}>[{bibliography.number(citeKey)}]</a>;
}

function ReferenceList({ bibliography }: { bibliography: Bibliography }) {
  return (
    <ol className={styles.list}>
      {bibliography.citedEntries().map((entry, i) => (
        <li key={entry.key} id={anchor(entry.key)} className={styles.item}>
          <span className={styles.number}>[{i + 1}]</span>
          <span className={styles.text}><Reference entry={entry} /></span>
        </li>
      ))}
    </ol>
  );
}

// The parts that are present, with a separator between them, or null when there are none.
function join(parts: React.ReactNode[], separator: string): React.ReactNode {
  const present = parts.filter((part) => part !== undefined && part !== null && part !== false && part !== '');
  if (present.length === 0) return null;
  return present.map((part, i) => <React.Fragment key={i}>{i > 0 && separator}{part}</React.Fragment>);
}

function link(href: string, text: string) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{text}</a>;
}

function Reference({ entry }: { entry: BibEntry }) {
  const f = entry.fields;
  const text = (name: string) => (f[name] ? latexToText(f[name]) : undefined);

  const authors = f.author ? formatNames(f.author) : f.editor ? `${formatNames(f.editor)}, Ed.` : undefined;
  const who = authors ?? text('organization') ?? text('institution');
  const title = text('title');
  const month = f.month && /^\d+$/.test(f.month.trim()) ? MONTH_NAMES[Number(f.month) - 1] : text('month');
  const date = text('date') ?? join([month, text('year')], ' ');
  const pages = f.pages && `pp. ${text('pages')}`;
  const online = f.doi
    ? link(`https://doi.org/${f.doi.trim()}`, `doi: ${f.doi.trim()}`)
    : f.url && link(f.url.trim(), f.url.trim());
  const accessed = f.urldate && `(accessed ${text('urldate')})`;
  const ending = join([online, accessed], ' ');

  // IEEE puts the comma after the title inside the quotes: A. Author, “Title,” Journal, …
  const start = <>{who && `${who}, `}{title && <>“{title},” </>}</>;

  switch (entry.type) {
    case 'article':
      return <>{start}{join([f.journal && <i>{text('journal')}</i>, f.volume && `vol. ${text('volume')}`, f.number && `no. ${text('number')}`, pages, date], ', ')}. {ending}</>;
    case 'book':
      return (
        <>
          {who && `${who}, `}<i>{title}</i>{f.edition && `, ${text('edition')} ed`}.{' '}
          {join([join([text('address'), text('publisher')], ': '), date], ', ')}. {ending}
        </>
      );
    case 'inproceedings':
    case 'conference':
      return <>{start}{join([f.booktitle && <>in <i>{text('booktitle')}</i></>, text('address'), date, pages], ', ')}. {ending}</>;
    case 'phdthesis':
    case 'mastersthesis':
    case 'thesis': {
      const kind = text('type') ?? (entry.type === 'phdthesis' ? 'Ph.D. dissertation' : 'M.S. thesis');
      return <>{start}{join([kind, text('school') ?? text('institution'), text('address'), date], ', ')}. {ending}</>;
    }
    case 'techreport':
      return <>{start}{join([text('institution'), text('address'), f.number && `Tech. Rep. ${text('number')}`, date], ', ')}. {ending}</>;
    default: {
      // @online, @misc, @manual, …: Organization. “Title.” Where it is published. URL (accessed date)
      const where = join([text('howpublished') ?? (authors ? text('organization') : undefined) ?? text('publisher'), date], ', ');
      return (
        <>
          {who && `${who.endsWith('.') ? who : `${who}.`} `}
          {title && <>“{title}.” </>}
          {where && <>{where}. </>}
          {ending}
        </>
      );
    }
  }
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
];
