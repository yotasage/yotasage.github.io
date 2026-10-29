// Loads references.bib, the reference list shared by all pages.
//
// Only call this from getStaticProps: it reads the file with Node, so it runs when the site is built
// (and on every page load with `next dev`) and never in the browser. A page that cites sources needs:
//
//   export async function getStaticProps() {
//     return { props: { references: loadReferences() } };
//   }

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { BibEntry, parseBibtex } from './bibtex';

const FILE = 'references.bib';

export function loadReferences(): BibEntry[] {
  return parseBibtex(readFileSync(path.join(process.cwd(), FILE), 'utf8'), FILE);
}
