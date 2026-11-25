import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import ToolIcon, { HomeIconName } from '../components/Home/ToolIcon';
import HomeIcon from '../components/icons/home';
import PageHead from '../components/PageHead';
import PdfToolIcon from '../components/PdfTools/ToolIcon';
import PillTabs, { PillTabItem } from '../components/UI/PillTabs';
import ToolHeader from '../components/UI/ToolHeader';
import { PdfTool, TOOL_CATEGORIES } from '../lib/pdf/tools';
import { TranslationKey, useI18n } from '../lib/ui/i18n';
import { useDesignSystemPage } from '../lib/ui/theme';
import styles from '../styles/Home.module.css';

type CategoryGroupId = 'electronics' | 'documents' | 'utilities';
type CategoryFilterId = 'all' | CategoryGroupId;

interface SiteTool {
  id: string;
  href: string;
  group: CategoryGroupId;
  titleKey: TranslationKey;
  categoryKey: TranslationKey;
  descKey: TranslationKey;
  icon: HomeIconName;
  accentLight: string;
  accentDark: string;
  tags?: readonly string[];
  searchKeywords?: readonly string[];
  subTools?: readonly PdfTool[];
  wide?: boolean;
  hardNavigation?: boolean;
}

const ALL_PDF_TOOLS: readonly PdfTool[] = TOOL_CATEGORIES.flatMap((category) => category.tools);

// Every tool on the site has a card here.
const TOOLS: readonly SiteTool[] = [
  {
    id: 'calculator',
    href: '/calculator/main',
    group: 'electronics',
    titleKey: 'home.tool.calculator.title',
    categoryKey: 'home.tool.calculator.category',
    descKey: 'home.tool.calculator.desc',
    icon: 'calculator',
    accentLight: '#0284c7',
    accentDark: '#38bdf8',
    tags: ['SI & RF units', 'Phasors', 'Variables → Excel', 'diff · int', 'Equation layouts'],
    searchKeywords: ['calc', 'math', 'units', 'dbm', 'complex', 'integral', 'derivative', 'formula', 'equation', 'kalkulator'],
  },
  {
    id: 'integral',
    href: '/integral/main',
    group: 'electronics',
    titleKey: 'home.tool.integral.title',
    categoryKey: 'home.tool.integral.category',
    descKey: 'home.tool.integral.desc',
    icon: 'integral',
    accentLight: '#4f46e5',
    accentDark: '#818cf8',
    tags: ['Indefinite & definite', 'u-sub · By parts', 'Partial fractions', 'Step-by-side & theory', 'Identities'],
    searchKeywords: ['integral', 'antiderivative', 'calculus', 'integration', 'ftc', 'u-sub', 'by parts', 'partial fractions', 'quadrature', 'kalkulus', 'integrasjon'],
  },
  {
    id: 'derivative',
    href: '/derivative/main',
    group: 'electronics',
    titleKey: 'home.tool.derivative.title',
    categoryKey: 'home.tool.derivative.category',
    descKey: 'home.tool.derivative.desc',
    icon: 'derivative',
    accentLight: '#ea580c',
    accentDark: '#fb923c',
    tags: ['Orders 1–4', 'Chain · Product · Quotient', 'Tangent line', 'Step-by-side & theory', 'Identities'],
    searchKeywords: ['derivative', 'differentiate', 'differentiation', 'calculus', 'chain rule', 'product rule', 'quotient rule', 'tangent', 'slope', 'derivasjon', 'derivert', 'kalkulus'],
  },
  {
    id: 'boolean',
    href: '/boolean/main',
    group: 'electronics',
    titleKey: 'home.tool.boolean.title',
    categoryKey: 'home.tool.boolean.category',
    descKey: 'home.tool.boolean.desc',
    icon: 'boolean',
    accentLight: '#0d9488',
    accentDark: '#2dd4bf',
    tags: ['Truth tables', 'TikZ · IEEE circuits', 'WaveDrom timing', 'DFF · Delays', 'K-Map · QM'],
    searchKeywords: ['boolean', 'logic', 'gate', 'truth table', 'kmap', 'karnaugh', 'quine', 'mccluskey', 'wavedrom', 'timing', 'dff', 'nand', 'nor', 'xor', 'de morgan', 'tikz', 'circuit', 'boolsk', 'logikk'],
  },
  {
    id: 'simsetup',
    href: '/simsetup/main',
    group: 'electronics',
    titleKey: 'home.tool.simsetup.title',
    categoryKey: 'home.tool.simsetup.category',
    descKey: 'home.tool.simsetup.desc',
    icon: 'simsetup',
    accentLight: '#0891b2',
    accentDark: '#3cc4dc',
    tags: ['Coherent sampling', 'FFT', 'Powers of 2', 'Prime ratios'],
    searchKeywords: ['f0', 'fs', 'ncyc', 'npts', 'sampling', 'nyquist', 'signal', 'dsp'],
  },
  {
    id: 'resistor',
    href: '/resistor/main',
    group: 'electronics',
    titleKey: 'home.tool.resistor.title',
    categoryKey: 'home.tool.resistor.category',
    descKey: 'home.tool.resistor.desc',
    icon: 'resistor',
    accentLight: '#2563eb',
    accentDark: '#5aa2f0',
    tags: ['E3–E192', 'Colour bands', 'SMD · EIA-96', 'Combinations', 'Temp design'],
    searchKeywords: ['ohm', 'divider', 'shunt', 'tolerance', 'rss', 'tikz', 'e24', 'e96', 'motstand'],
  },
  {
    id: 'smith',
    href: '/smith-chart/main',
    group: 'electronics',
    titleKey: 'home.tool.smith.title',
    categoryKey: 'home.tool.smith.category',
    descKey: 'home.tool.smith.desc',
    icon: 'smith',
    accentLight: '#db2777',
    accentDark: '#e0679a',
    tags: ['Z · Y · ZY grids', 'Drag & snap', 'Auto-solver', 'Freq sweep', 'SVG · TikZ · S1P'],
    searchKeywords: ['vswr', 'impedance', 'admittance', 'stub', 'matching', 'touchstone', 's1p', 'rf'],
  },
  {
    id: 'pcb',
    href: '/pcb-viewer/main',
    group: 'electronics',
    titleKey: 'home.tool.pcb.title',
    categoryKey: 'home.tool.pcb.category',
    descKey: 'home.tool.pcb.desc',
    icon: 'pcb',
    accentLight: '#65a30d',
    accentDark: '#9ccc3c',
    tags: ['Gerber · Excellon', 'KiCad · Altium', 'PADS · EAGLE', 'Realistic view', 'To KiCad'],
    searchKeywords: ['rs-274x', 'x2', 'drill', 'pcbdoc', 'fusion 360', 'bom', 'pick and place', 'dxf', 'nets'],
  },
  {
    id: 'emsim',
    href: '/em-sim/main',
    group: 'electronics',
    titleKey: 'home.tool.emsim.title',
    categoryKey: 'home.tool.emsim.category',
    descKey: 'home.tool.emsim.desc',
    icon: 'emsim',
    accentLight: '#0d9488',
    accentDark: '#2fb3a0',
    tags: ['2D / 3D solver', 'Z0 · Zdiff · Zcm', 'JLCPCB · KiCad', 'Vias', 'Field plots'],
    searchKeywords: ['microstrip', 'stripline', 'coplanar', 'differential', 'stackup', 'trace', 'fdtd', 'impedance'],
  },
  {
    id: 'pdf',
    href: '/pdf/main',
    group: 'documents',
    titleKey: 'home.tool.pdf.title',
    categoryKey: 'home.tool.pdf.category',
    descKey: 'home.tool.pdf.desc',
    icon: 'pdf',
    accentLight: '#dc2626',
    accentDark: '#ef6a50',
    subTools: ALL_PDF_TOOLS,
    wide: true,
    searchKeywords: ['merge', 'split', 'compress', 'ocr', 'sign', 'redact', 'watermark', 'pdfa', 'metadata', 'forms'],
  },
  {
    id: 'viewer3d',
    href: '/3d-viewer/main',
    group: 'documents',
    titleKey: 'home.tool.viewer3d.title',
    categoryKey: 'home.tool.viewer3d.category',
    descKey: 'home.tool.viewer3d.desc',
    icon: 'viewer3d',
    accentLight: '#ea580c',
    accentDark: '#f08c3c',
    tags: ['STEP · IGES', 'STL · 3MF · OBJ', 'glTF · FBX · USDZ', 'Section cut', 'Measure'],
    searchKeywords: ['cad', 'mesh', 'ply', 'glb', 'model', '3d'],
  },
  {
    id: 'qrcode',
    href: '/qrcode/main',
    group: 'utilities',
    titleKey: 'home.tool.qrcode.title',
    categoryKey: 'home.tool.qrcode.category',
    descKey: 'home.tool.qrcode.desc',
    icon: 'qrcode',
    accentLight: '#ca8a04',
    accentDark: '#e8b23a',
    tags: ['Model 1 & 2', 'Micro QR · rMQR', 'Custom mask', 'PNG · SVG · PDF'],
    searchKeywords: ['qr', 'barcode', 'error correction', 'encoding'],
  },
  {
    id: 'qrreader',
    href: '/qr-reader/main',
    group: 'utilities',
    titleKey: 'home.tool.qrreader.title',
    categoryKey: 'home.tool.qrreader.category',
    descKey: 'home.tool.qrreader.desc',
    icon: 'qrreader',
    accentLight: '#0d9488',
    accentDark: '#2ec5a6',
    tags: ['Camera · PDF · paste', 'Micro QR · rMQR', 'Wi-Fi · eSIM', '2FA · Payments', 'Raw hex'],
    searchKeywords: ['scan', 'scanner', 'totp', 'otp', 'vcard', 'calendar', 'decode'],
  },
  {
    id: 'base64',
    href: '/base64-image/main',
    group: 'utilities',
    titleKey: 'home.tool.base64.title',
    categoryKey: 'home.tool.base64.category',
    descKey: 'home.tool.base64.desc',
    icon: 'base64',
    accentLight: '#16a34a',
    accentDark: '#3dbb78',
    tags: ['Data URL', 'HTML · CSS · MD', 'PNG · JPEG · WebP', 'Live preview'],
    searchKeywords: ['encode', 'decode', 'image', 'inline', 'markdown'],
  },
  {
    id: 'paint',
    href: '/paint/main',
    group: 'utilities',
    titleKey: 'home.tool.paint.title',
    categoryKey: 'home.tool.paint.category',
    descKey: 'home.tool.paint.desc',
    icon: 'paint',
    accentLight: '#2563eb',
    accentDark: '#60a5fa',
    tags: ['Layers', 'Crop · Resize · Scale down', 'Rotate', 'B&W styles', 'Paint.NET Ctrl+C/V'],
    searchKeywords: ['paint', 'paint.net', 'draw', 'brush', 'layers', 'crop', 'resize', 'rotate', 'black white', 'grayscale', 'colorpicker', 'editor', 'image', 'tegne', 'bilde'],
  },
  {
    id: 'scratchpad',
    href: '/scratchpad/main',
    group: 'utilities',
    titleKey: 'home.tool.notepad.title',
    categoryKey: 'home.tool.notepad.category',
    descKey: 'home.tool.notepad.desc',
    icon: 'notepad',
    accentLight: '#059669',
    accentDark: '#34d399',
    tags: ['Monaco Editor', 'Code · CSV · TeX', 'Side-by-side · Grid', 'Diff · Regex', 'Auto-saved'],
    searchKeywords: ['scratchpad', 'editor', 'monaco', 'diff', 'compare', 'regex', 'notes', 'csv', 'tex', 'latex', 'code', 'count', 'replace', 'teksteditor', 'notatblokk'],
  },
  {
    id: 'python',
    href: '/python/main',
    group: 'utilities',
    titleKey: 'python.cardTitle',
    categoryKey: 'python.cardCategory',
    descKey: 'python.cardDesc',
    icon: 'python',
    accentLight: '#2563eb',
    accentDark: '#60a5fa',
    hardNavigation: true,
    tags: ['Python 3.14 (Pyodide)', 'NumPy · SciPy · pandas', 'Console + REPL', 'Network off by default'],
    searchKeywords: [
      'python',
      'pyodide',
      'wasm',
      'repl',
      'monaco',
      'numpy',
      'scipy',
      'pandas',
      'sympy',
      'matplotlib',
      'pillow',
      'code',
      'script',
      'playground',
      'lekeplass',
    ],
  },
  {
    id: 'textcase',
    href: '/text-case/main',
    group: 'utilities',
    titleKey: 'home.tool.textcase.title',
    categoryKey: 'home.tool.textcase.category',
    descKey: 'home.tool.textcase.desc',
    icon: 'textcase',
    accentLight: '#7c3aed',
    accentDark: '#a585ff',
    tags: ['Sentence · Title', 'UPPER · lower', 'camelCase', 'snake_case', 'kebab-case'],
    searchKeywords: ['pascal', 'slug', 'word count', 'character count', 'string'],
  },
];

const CATEGORY_GROUPS: readonly { id: CategoryGroupId; labelKey: TranslationKey }[] = [
  { id: 'electronics', labelKey: 'home.cat.electronics' },
  { id: 'documents', labelKey: 'home.cat.documents' },
  { id: 'utilities', labelKey: 'home.cat.utilities' },
];

const PROMISE_KEYS: readonly TranslationKey[] = [
  'home.promise.browser',
  'home.promise.local',
  'home.promise.noAds',
  'home.promise.noSignup',
];

function CheckIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function matchesSubTool(sub: PdfTool, q: string): boolean {
  return (
    sub.title.toLowerCase().includes(q) ||
    sub.description.toLowerCase().includes(q) ||
    sub.id.toLowerCase().includes(q)
  );
}

interface ToolCardProps {
  tool: SiteTool;
  query: string;
}

function ToolCard({ tool, query }: ToolCardProps) {
  const { t } = useI18n();
  const title = t(tool.titleKey);
  const category = t(tool.categoryKey);
  const description = t(tool.descKey);

  const orderedSubTools = useMemo(() => {
    if (!tool.subTools) return null;
    if (!query) return tool.subTools;
    const matched: PdfTool[] = [];
    const rest: PdfTool[] = [];
    for (const sub of tool.subTools) {
      if (matchesSubTool(sub, query)) {
        matched.push(sub);
      } else {
        rest.push(sub);
      }
    }
    return matched.length > 0 ? [...matched, ...rest] : tool.subTools;
  }, [tool.subTools, query]);

  const cardClass = [styles.card, tool.wide ? styles.cardWide : ''].filter(Boolean).join(' ');

  return (
    <li
      className={cardClass}
      style={
        {
          '--accent-light': tool.accentLight,
          '--accent-dark': tool.accentDark,
        } as React.CSSProperties
      }
    >
      <div className={styles.cardTop}>
        <span className={styles.iconChip}>
          <ToolIcon name={tool.icon} color="currentColor" size={28} />
        </span>
        <span className={styles.category}>{category}</span>
      </div>

      <h3 className={styles.cardTitle}>
        {/* Its ::after covers the card, so the whole card is a link. Sub-tool links sit above it. */}
        {tool.hardNavigation ? (
          <a href={tool.href} className={styles.cardLink}>
            <span>{title}</span>
            <span className={styles.arrow} aria-hidden="true">
              &rarr;
            </span>
          </a>
        ) : (
          <Link href={tool.href} className={styles.cardLink}>
            <span>{title}</span>
            <span className={styles.arrow} aria-hidden="true">
              &rarr;
            </span>
          </Link>
        )}
      </h3>

      <p className={styles.cardDesc}>{description}</p>

      {orderedSubTools ? (
        <div className={styles.subToolsWrap}>
          <div className={styles.subToolsHeader}>
            <span>{t('home.pdfSubToolsCount', { count: orderedSubTools.length })}</span>
          </div>
          <ul className={styles.subTools} aria-label={title}>
            {orderedSubTools.map((sub) => {
              const isMatch = query.length > 0 && matchesSubTool(sub, query);
              return (
                <li key={sub.id}>
                  <Link
                    href={sub.href}
                    className={[styles.tag, styles.subLink, isMatch ? styles.subLinkMatch : ''].filter(Boolean).join(' ')}
                    style={{ '--sub-accent': sub.color } as React.CSSProperties}
                  >
                    <PdfToolIcon name={sub.icon} color={sub.color} size={14} />
                    <span>{sub.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        tool.tags && (
          <ul className={styles.tags}>
            {tool.tags.map((tag) => (
              <li key={tag} className={styles.tag}>
                {tag}
              </li>
            ))}
          </ul>
        )
      )}
    </li>
  );
}

export default function Home() {
  useDesignSystemPage('#2563eb', '#60a5fa');
  const { t } = useI18n();

  const [activeCategory, setActiveCategory] = useState<CategoryFilterId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilterId, number> = {
      all: TOOLS.length,
      electronics: 0,
      documents: 0,
      utilities: 0,
    };
    for (const tool of TOOLS) {
      counts[tool.group] += 1;
    }
    return counts;
  }, []);

  const categoryTabs = useMemo<readonly PillTabItem<CategoryFilterId>[]>(
    () => [
      { id: 'all', label: t('home.cat.all'), badge: categoryCounts.all },
      { id: 'electronics', label: t('home.cat.electronics'), badge: categoryCounts.electronics },
      { id: 'documents', label: t('home.cat.documents'), badge: categoryCounts.documents },
      { id: 'utilities', label: t('home.cat.utilities'), badge: categoryCounts.utilities },
    ],
    [t, categoryCounts],
  );

  const filteredTools = useMemo(() => {
    return TOOLS.filter((tool) => {
      if (activeCategory !== 'all' && tool.group !== activeCategory) return false;
      if (!normalizedQuery) return true;

      const haystack = [
        t(tool.titleKey),
        t(tool.categoryKey),
        t(tool.descKey),
        ...(tool.tags ?? []),
        ...(tool.searchKeywords ?? []),
      ]
        .join(' ')
        .toLowerCase();

      if (haystack.includes(normalizedQuery)) return true;
      if (tool.subTools?.some((sub) => matchesSubTool(sub, normalizedQuery))) return true;
      return false;
    });
  }, [activeCategory, normalizedQuery, t]);

  const showGroupedSections = activeCategory === 'all' && normalizedQuery === '';

  const resetFilters = () => {
    setActiveCategory('all');
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('home.pageTitle')}
        description={t('home.metaDescription')}
        path="/"
        ogImage="/og/home.png"
        ogAlt="yotasage.github.io browser engineering and document tools overview"
      />

      <ToolHeader
        isHome
        title="yotasage"
        brandIcon={<HomeIcon width={16} height={18} color="currentColor" />}
        showExperienceMode={false}
      />

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="home-hero-title">
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            <span>{t('home.eyebrow')}</span>
          </div>

          <h2 id="home-hero-title" className={styles.heroTitle}>
            {t('home.title')}
          </h2>

          <p className={styles.lead}>{t('home.heroLead')}</p>

          <ul className={styles.promises}>
            {PROMISE_KEYS.map((key) => (
              <li key={key} className={styles.promiseChip}>
                <span className={styles.promiseIcon}>
                  <CheckIcon />
                </span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.catalog} aria-label={t('home.toolsNavAria')}>
          <div className={styles.discovery}>
            <div className={styles.filterWrap}>
              <PillTabs<CategoryFilterId>
                items={categoryTabs}
                value={activeCategory}
                onChange={(id) => setActiveCategory(id)}
                ariaLabel={t('home.filterAria')}
              />
            </div>

            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}>
                <SearchIcon />
              </span>
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    if (searchQuery) {
                      setSearchQuery('');
                    } else {
                      searchInputRef.current?.blur();
                    }
                  }
                }}
                placeholder={t('home.searchPlaceholder')}
                aria-label={t('home.searchAria')}
                className={styles.searchInput}
                autoComplete="off"
                spellCheck={false}
              />
              {searchQuery ? (
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  aria-label={t('home.searchClear')}
                  title={t('home.searchClear')}
                >
                  <ClearIcon />
                </button>
              ) : (
                !searchFocused && (
                  <kbd className={styles.kbdHint} aria-hidden="true">
                    /
                  </kbd>
                )
              )}
            </div>
          </div>

          {normalizedQuery && filteredTools.length > 0 && (
            <p className={styles.resultsStatus} role="status" aria-live="polite">
              {t('home.resultsCount', { count: filteredTools.length, total: TOOLS.length })}
            </p>
          )}

          {showGroupedSections ? (
            <div className={styles.sections}>
              {CATEGORY_GROUPS.map((group) => {
                const groupTools = TOOLS.filter((tool) => tool.group === group.id);
                return (
                  <section
                    key={group.id}
                    className={styles.groupSection}
                    aria-labelledby={`group-${group.id}`}
                  >
                    <div className={styles.groupHeader}>
                      <h2 id={`group-${group.id}`} className={styles.groupTitle}>
                        {t(group.labelKey)}
                      </h2>
                      <span className={styles.groupCount}>{groupTools.length}</span>
                      <span className={styles.groupRule} aria-hidden="true" />
                    </div>
                    <ul className={styles.grid}>
                      {groupTools.map((tool) => (
                        <ToolCard key={tool.id} tool={tool} query="" />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : filteredTools.length > 0 ? (
            <ul className={styles.grid}>
              {filteredTools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} query={normalizedQuery} />
              ))}
            </ul>
          ) : (
            <div className={styles.emptyState} role="status" aria-live="polite">
              <p className={styles.emptyTitle}>
                {t('home.noResults', { query: searchQuery.trim() })}
              </p>
              <p className={styles.emptyHint}>{t('home.noResultsHint')}</p>
              <button type="button" className={styles.resetBtn} onClick={resetFilters}>
                {t('home.resetFilters')}
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
