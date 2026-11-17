import Head from 'next/head';
import React, { useState } from 'react';

import EmSimTool from '../../components/EmSim/EmSimTool';
import type { Theme } from '../../components/EmSim/EmSimTool';
import type { BibEntry } from '../../lib/bibtex';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { EM_EQUATIONS } from '../../lib/emsim/equations';
import { loadReferences } from '../../lib/references';

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
        /* M9.1a: what the browser scrolls to (a focused control, a #link) stays clear of the sticky bar, which has
           two rows below 860 px (EmSim.module.css --bar-h); the sections' own scroll-margin adds the gap. */
        html {
          scroll-padding-top: 52px;
        }
        @media (max-width: 860px) {
          html {
            scroll-padding-top: 88px;
          }
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
