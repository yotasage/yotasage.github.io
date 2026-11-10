import Head from 'next/head';
import React from 'react';

import ResistorTool from '../../components/Resistor/ResistorTool';

// The tool sets the `html, body` background itself, since it follows the theme chosen on the page.
export default function Resistor() {
  return (
    <>
      <Head>
        <title>Resistor lookup</title>
        <meta name="description" content="Type a resistance, an SMD marking or band colours: the nearest standard values in every E-series with their errors, the colour bands and the SMD markings." />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <ResistorTool />
    </>
  );
}
