import React from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import EmSimTool from '../../components/EmSim/EmSimTool';
import PageHead from '../../components/PageHead';
import type { BibEntry } from '../../lib/bibtex';
import { EM_EQUATIONS } from '../../lib/emsim/equations';
import { loadReferences } from '../../lib/references';
import { useI18n } from '../../lib/ui/i18n';

// The EM simulation tool (docs/em-sim/plan.md). The references are read at build time only, for the page's citations.
// The Theory is loaded after the page (components/EmSim/Theory.tsx by import()), so its citations are not rendered
// while the page is built: the keys it cites (`cite('Key'` in components/EmSim/*.tsx) and the equations' sources are
// found here instead, an unknown one stops the build, and only the cited entries go into the page.
export async function getStaticProps() {
  const all = loadReferences();
  const dir = path.join(process.cwd(), 'components', 'EmSim');
  const keys = new Set<string>(EM_EQUATIONS.flatMap((e) => e.sources.map((x) => x.key)));
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.tsx')) continue;
    for (const m of readFileSync(path.join(dir, f), 'utf8').matchAll(/\bcite\('([^']+)'/g)) keys.add(m[1]);
  }
  const known = new Set(all.map((e) => e.key));
  const unknown = [...keys].filter((k) => !known.has(k));
  if (unknown.length) throw new Error(`The EM theory cites ${unknown.join(', ')}, not in references.bib.`);
  return { props: { references: all.filter((e) => keys.has(e.key)) } };
}

export default function EmSimPage({ references }: { references: BibEntry[] }) {
  const { t } = useI18n();
  return (
    <>
      <PageHead
        title={t('emsim.pageTitle')}
        description={t('em.meta.desc')}
        path="/em-sim/main"
        ogImage="/og/em-sim.png"
        ogAlt={t('em.meta.ogAlt')}
      />
      <EmSimTool references={references} />
    </>
  );
}
