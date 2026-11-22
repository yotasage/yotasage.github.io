import React from 'react';

import PageHead from '../../components/PageHead';
import ResistorTool from '../../components/Resistor/ResistorTool';
import { BibEntry } from '../../lib/bibtex';
import { loadReferences } from '../../lib/references';
import { useI18n } from '../../lib/ui/i18n';

// The sources the page cites, read from references.bib when the site is built.
export async function getStaticProps() {
  return { props: { references: loadReferences() } };
}

// The tool sets the `html, body` background itself, since it follows the theme chosen on the page.
export default function Resistor({ references }: { references: BibEntry[] }) {
  const { t } = useI18n();
  return (
    <>
      <PageHead
        title={t('resistor.pageTitle')}
        description="Look up nearest E3–E192 resistor values, colour bands, and SMD markings, solve series/parallel combinations, and design dividers over temperature."
        path="/resistor/main"
      />
      <ResistorTool references={references} />
    </>
  );
}
