import Head from 'next/head';
import React, { useState } from 'react';

import EmSimTool from '../../components/EmSim/EmSimTool';
import type { Theme } from '../../components/EmSim/EmSimTool';
import type { BibEntry } from '../../lib/bibtex';
import { loadReferences } from '../../lib/references';

// The EM simulation tool (docs/em-sim/plan.md). The references are read at build time only, for the page's citations.
export async function getStaticProps() {
  return { props: { references: loadReferences() } };
}

// The page frame's colours (EmSim.module.css's --bg, --rule, --ink-3, --ink-2, --ink) for html, body and the footer.
const LIGHT = { bg: '#f6f4ee', rule: '#e3dfd5', quiet: '#6c6861', link: '#55524b', ink: '#1d1c19' };
const DARK = { bg: '#2b2b2b', rule: '#3d3d3a', quiet: '#a6a49c', link: '#bdbab1', ink: '#edebe5' };

export default function EmSimPage({ references }: { references: BibEntry[] }) {
  const [theme, setTheme] = useState<Theme | null>(null);
  const day = theme === 'dark' ? DARK : LIGHT;
  const night = theme === 'light' ? LIGHT : DARK;
  return (
    <>
      <Head>
        <title>EM simulation</title>
        <meta name="description" content="PCB stackups and transmission lines: JLCPCB stackup presets or your KiCad board's stackup and net classes, every value with its source and tolerance, drawn to scale; the setup is kept in the link." />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <style jsx global>{`
        html,
        body {
          margin: 0;
          padding: 0;
          background: ${day.bg};
        }
        #__next > footer {
          background: ${day.bg};
          border-top-color: ${day.rule};
          color: ${day.quiet};
        }
        #__next > footer a {
          color: ${day.link};
        }
        #__next > footer a:hover,
        #__next > footer a:focus {
          color: ${day.ink};
        }
        @media (prefers-color-scheme: dark) {
          html,
          body {
            background: ${night.bg};
          }
          #__next > footer {
            background: ${night.bg};
            border-top-color: ${night.rule};
            color: ${night.quiet};
          }
          #__next > footer a {
            color: ${night.link};
          }
          #__next > footer a:hover,
          #__next > footer a:focus {
            color: ${night.ink};
          }
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
      <EmSimTool references={references} onTheme={setTheme} />
    </>
  );
}
