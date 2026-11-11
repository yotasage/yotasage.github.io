import Head from 'next/head';
import React from 'react';

import ResistorTool from '../../components/Resistor/ResistorTool';
import { BibEntry } from '../../lib/bibtex';
import { loadReferences } from '../../lib/references';

// The sources the page cites, read from references.bib when the site is built.
export async function getStaticProps() {
  return { props: { references: loadReferences() } };
}

// The tool sets the `html, body` background itself, since it follows the theme chosen on the page.
export default function Resistor({ references }: { references: BibEntry[] }) {
  return (
    <>
      <Head>
        <title>Resistor lookup</title>
        <meta name="description" content="Type a resistance, an SMD marking or band colours: the nearest standard values in every E-series, the colour bands and markings, a drawing to save, combinations of resistors, values for a divider or a gain over tolerance and temperature, and the theory with its sources." />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <ResistorTool references={references} />
    </>
  );
}
