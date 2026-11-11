import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import ToolIcon, { HomeIconName } from '../components/Home/ToolIcon';
import PdfToolIcon from '../components/PdfTools/ToolIcon';
import { PdfTool, TOOL_CATEGORIES } from '../lib/pdf/tools';
import styles from '../styles/Home.module.css';

interface SiteTool {
  href: string;
  title: string;
  category: string;
  description: React.ReactNode;
  icon: HomeIconName;
  color: string;
  // Keywords shown as chips under the description.
  tags?: string[];
  // Links straight to the tools of a hub, shown instead of tags.
  subTools?: PdfTool[];
}

// Every tool on the site has a card here.
const TOOLS: SiteTool[] = [
  {
    href: '/simsetup/main',
    title: 'Simulation setup',
    category: 'Signal processing',
    description: <>Find f<sub>0</sub>, F<sub>S</sub>, N<sub>cyc</sub> and N<sub>pts</sub> for FFTs and simulations, and check them against the rules for coherent sampling.</>,
    icon: 'simsetup',
    color: '#3cc4dc',
    tags: ['Coherent sampling', 'Powers of 2', 'Prime numbers'],
  },
  {
    href: '/qrcode/main',
    title: 'QR code generator',
    category: 'Codes',
    description: 'Make QR codes with full control over version, error correction, mask and encoding.',
    icon: 'qrcode',
    color: '#e8b23a',
    tags: ['Model 1 and 2', 'Micro QR', 'rMQR', 'PNG · SVG · PDF'],
  },
  {
    href: '/pdf/main',
    title: 'PDF tools',
    category: 'Documents',
    description: 'Merge, compress and clean up PDFs, and turn images into PDFs, without uploading them anywhere.',
    icon: 'pdf',
    color: '#ef6a50',
    subTools: TOOL_CATEGORIES.flatMap((category) => category.tools),
  },
  {
    href: '/base64-image/main',
    title: 'Base64 image converter',
    category: 'Images',
    description: 'Turn an image into Base64 or a data URL, and Base64 back into an image you can view, download or copy.',
    icon: 'base64',
    color: '#3dbb78',
    tags: ['Data URL', 'HTML · CSS · Markdown', 'PNG · JPEG · WebP'],
  },
  {
    href: '/text-case/main',
    title: 'Text case converter',
    category: 'Text',
    description: 'Change the case of text as you type, or turn it into names for code, with character, word and line counts.',
    icon: 'textcase',
    color: '#a585ff',
    tags: ['Sentence case', 'Title Case', 'UPPER CASE', 'camelCase', 'snake_case', 'kebab-case'],
  },
  {
    href: '/3d-viewer/main',
    title: '3D viewer',
    category: '3D models',
    description: 'View CAD and mesh files, cut through them, measure them and save them as STL, OBJ, PLY or GLB.',
    icon: 'viewer3d',
    color: '#f08c3c',
    tags: ['STEP · IGES', 'STL · 3MF · OBJ', 'glTF · FBX · USDZ', 'Section view', 'Measure'],
  },
  {
    href: '/pcb-viewer/main',
    title: 'PCB viewer',
    category: 'Electronics',
    description: 'View the Gerber and drill files or the KiCad, Altium, PADS or EAGLE board of a circuit board layer by layer or as it looks, mark the parts of a pick-and-place file on it, find its nets and components, measure it, save it as PNG, SVG, PDF at 1:1 or DXF, or as a BOM and pick-and-place file, and turn an Altium, PADS or EAGLE board into a KiCad board.',
    icon: 'pcb',
    color: '#9ccc3c',
    tags: ['Gerber RS-274X · X2', 'Excellon drill', 'KiCad 4 to 10', 'Altium PcbDoc', 'PADS ASCII', 'EAGLE · Fusion 360', 'Pick-and-place', 'Realistic view', 'Nets and components', 'Measure', 'PNG · SVG · PDF · DXF · CSV', 'To KiCad'],
  },
  {
    href: '/resistor/main',
    title: 'Resistor lookup',
    category: 'Electronics',
    description: 'Type a resistance, an SMD marking or band colours and get the nearest standard values in every E-series with their errors, the colour bands and the SMD markings. Click the bands of the drawing or type a chip marking to decode a part, and save the drawing as SVG, PNG, JPG or WebP, or as TikZ for LaTeX. Find the series and parallel combinations of 1 to 4 standard values, or of the values you have, that come closest to a value.',
    icon: 'resistor',
    color: '#5aa2f0',
    tags: ['E3 to E192', '4k7 · 4,7 kΩ · 472', 'Colour code', 'SMD codes · EIA-96', 'Clickable drawings', 'SVG · PNG · JPG · WebP', 'Series · parallel combinations', 'Own value lists', 'Reference tables', 'Every result is a link'],
  },
];

const PROMISES = ['Runs in your browser', 'Files never leave your device', 'No ads or tracking', 'No sign-up'];

function Check() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="#3dbb78" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

function ToolCard({ tool }: { tool: SiteTool }) {
  return (
    <li className={styles.card} style={{ '--accent': tool.color } as React.CSSProperties}>
      <span className={styles.iconChip}><ToolIcon name={tool.icon} color={tool.color} size={40} /></span>
      <span className={styles.category}>{tool.category}</span>
      <h2>
        {/* Its ::after covers the card, so the whole card is a link. The links in .tags sit above it. */}
        <Link href={tool.href} className={styles.cardLink}>
          {tool.title}
          <span className={styles.arrow} aria-hidden>&rarr;</span>
        </Link>
      </h2>
      <p>{tool.description}</p>
      {tool.subTools ? (
        <ul className={styles.tags} aria-label={tool.title}>
          {tool.subTools.map((sub) => (
            <li key={sub.id}>
              <Link
                href={sub.href}
                className={[styles.tag, styles.subLink].join(' ')}
                style={{ '--sub-accent': sub.color } as React.CSSProperties}
              >
                <PdfToolIcon name={sub.icon} color={sub.color} size={16} />
                {sub.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className={styles.tags}>
          {tool.tags.map((tag) => <li key={tag} className={styles.tag}>{tag}</li>)}
        </ul>
      )}
    </li>
  );
}

export default function Home() {
  return (
    <div className={styles.page}>
      <Head>
        <title>Tools · yotasage</title>
        <meta name="description" content="Small tools that run entirely in your browser: no ads, no uploads, no sign-up." />
        <meta name="theme-color" content="#2b2b2b" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <style jsx global>{`
        html,
        body {
          margin: 0;
          padding: 0;
          background: #2b2b2b;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>

      <header className={styles.intro}>
        <p className={styles.eyebrow}>yotasage.github.io</p>
        <h1 className={styles.title}>Tools that run in your browser</h1>
        <p className={styles.lead}>
          My own collection of tools, so I don't have to search other people's websites for one that is good enough,
          without ads and bad design. There is no server: everything runs on your device, and the files you give a tool
          never leave it.
        </p>
        <ul className={styles.promises}>
          {PROMISES.map((promise) => <li key={promise}><Check />{promise}</li>)}
        </ul>
      </header>

      <nav aria-label="Tools">
        <ul className={styles.grid}>
          {TOOLS.map((tool) => <ToolCard key={tool.href} tool={tool} />)}
        </ul>
      </nav>
    </div>
  );
}
