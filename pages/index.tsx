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
