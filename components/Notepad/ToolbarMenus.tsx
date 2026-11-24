import { useEffect, useMemo, useRef, useState } from 'react';

import { HashAlgorithm } from '../../lib/notepad/cryptoHash';
import { AlignOptions, DelimiterOption } from '../../lib/notepad/csvTools';
import { getEncodingShortLabel, SUPPORTED_ENCODINGS } from '../../lib/notepad/encoding';
import { getLanguageLabel, groupLanguagesByLetter } from '../../lib/notepad/languages';
import { MimeToolAction } from '../../lib/notepad/mimeTools';
import { FileEncoding, MAX_GRID_DIM, SymbolSettings } from '../../lib/notepad/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Notepad.module.css';

export type OpenMenuId = 'grid' | 'symbols' | 'language' | 'encoding' | 'mime' | 'data' | 'tools' | null;

export interface ToolbarMenusProps {
  openMenu: OpenMenuId;
  setOpenMenu: (id: OpenMenuId) => void;
  gridRows: number;
  gridCols: number;
  isGridActive: boolean;
  symbols: SymbolSettings;
  activeLanguage: string;
  activeEncoding: FileEncoding;
  onSelectGrid: (rows: number, cols: number) => void;
  onResetGridSizes: () => void;
  onToggleSymbol: (key: keyof SymbolSettings) => void;
  onToggleAllSymbols: () => void;
  onChangeLanguage: (langId: string) => void;
  onReinterpretEncoding: (encoding: FileEncoding) => void;
  onConvertEncoding: (encoding: FileEncoding) => void;
  onRunMimeTool: (action: MimeToolAction) => void;
  onOpenHashDialog: (algo: HashAlgorithm | 'ALL') => void;
}

export function useMenuDismiss(
  containerRef: React.RefObject<HTMLElement | null>,
  openMenu: OpenMenuId,
  setOpenMenu: (id: OpenMenuId) => void,
): void {
  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [containerRef, openMenu, setOpenMenu]);
}

export function GridMenuControl({
  openMenu,
  setOpenMenu,
  gridRows,
  gridCols,
  isGridActive,
  onSelectGrid,
  onResetGridSizes,
}: Pick<
  ToolbarMenusProps,
  'openMenu' | 'setOpenMenu' | 'gridRows' | 'gridCols' | 'isGridActive' | 'onSelectGrid' | 'onResetGridSizes'
>) {
  const { t } = useI18n();
  const [hoverDims, setHoverDims] = useState<[number, number] | null>(null);
  const [customRows, setCustomRows] = useState(gridRows);
  const [customCols, setCustomCols] = useState(gridCols);

  useEffect(() => {
    setCustomRows(gridRows);
    setCustomCols(gridCols);
  }, [gridRows, gridCols]);

  const isOpen = openMenu === 'grid';

  return (
    <div className={styles.menuWrap}>
      <button
        type="button"
        aria-pressed={isGridActive}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={[styles.segBtn, isGridActive ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
        onClick={() => setOpenMenu(isOpen ? null : 'grid')}
      >
        {t('notepad.layout.gridWithDims', { rows: gridRows, cols: gridCols })} ▾
      </button>
      {isOpen && (
        <div className={styles.menuPopover} role="dialog" aria-label={t('notepad.grid.title')}>
          <div className={styles.menuSectionLabel}>{t('notepad.grid.presets')}</div>
          <div className={styles.gridPresetRow}>
            <button
              type="button"
              className={[
                styles.menuChipBtn,
                isGridActive && gridRows === 2 && gridCols === 2 ? styles.menuChipActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                onSelectGrid(2, 2);
                setOpenMenu(null);
              }}
            >
              2 × 2
            </button>
            <button
              type="button"
              className={[
                styles.menuChipBtn,
                isGridActive && gridRows === 2 && gridCols === 3 ? styles.menuChipActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                onSelectGrid(2, 3);
                setOpenMenu(null);
              }}
            >
              {t('notepad.grid.preset2x3')}
            </button>
            <button
              type="button"
              className={[
                styles.menuChipBtn,
                isGridActive && gridRows === 1 && gridCols === 3 ? styles.menuChipActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                onSelectGrid(1, 3);
                setOpenMenu(null);
              }}
            >
              1 × 3
            </button>
          </div>

          <div className={styles.menuDivider} />
          <div className={styles.menuSectionLabel}>
            {t('notepad.grid.pickCustom')}{' '}
            <span className={styles.menuMonoHint}>
              {hoverDims ? `${hoverDims[0]} × ${hoverDims[1]}` : `${gridRows} × ${gridCols}`}
            </span>
          </div>
          <div
            className={styles.gridMatrix}
            onMouseLeave={() => setHoverDims(null)}
            role="group"
            aria-label={t('notepad.grid.pickCustom')}
          >
            {Array.from({ length: MAX_GRID_DIM }, (_, r) =>
              Array.from({ length: MAX_GRID_DIM }, (_, c) => {
                const rowNum = r + 1;
                const colNum = c + 1;
                const active = hoverDims
                  ? rowNum <= hoverDims[0] && colNum <= hoverDims[1]
                  : rowNum <= gridRows && colNum <= gridCols;
                return (
                  <button
                    key={`${rowNum}-${colNum}`}
                    type="button"
                    className={[styles.gridMatrixCell, active ? styles.gridMatrixCellActive : '']
                      .filter(Boolean)
                      .join(' ')}
                    aria-label={`${rowNum} by ${colNum} grid`}
                    onMouseEnter={() => setHoverDims([rowNum, colNum])}
                    onClick={() => {
                      onSelectGrid(rowNum, colNum);
                      setOpenMenu(null);
                    }}
                  />
                );
              }),
            )}
          </div>

          <div className={styles.gridInputsRow}>
            <label className={styles.gridDimLabel}>
              <span>{t('notepad.grid.rows')}</span>
              <input
                type="number"
                min={1}
                max={MAX_GRID_DIM}
                value={customRows}
                onChange={(e) => setCustomRows(Math.max(1, Math.min(MAX_GRID_DIM, Number(e.target.value) || 1)))}
                className={styles.gridDimInput}
              />
            </label>
            <span aria-hidden="true">×</span>
            <label className={styles.gridDimLabel}>
              <span>{t('notepad.grid.cols')}</span>
              <input
                type="number"
                min={1}
                max={MAX_GRID_DIM}
                value={customCols}
                onChange={(e) => setCustomCols(Math.max(1, Math.min(MAX_GRID_DIM, Number(e.target.value) || 1)))}
                className={styles.gridDimInput}
              />
            </label>
            <button
              type="button"
              className={styles.cmdBtnPrimary}
              onClick={() => {
                onSelectGrid(customRows, customCols);
                setOpenMenu(null);
              }}
            >
              {t('notepad.grid.apply')}
            </button>
          </div>

          {isGridActive && (
            <>
              <div className={styles.menuDivider} />
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  onResetGridSizes();
                  setOpenMenu(null);
                }}
              >
                <span>{t('notepad.grid.resetSizes')}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SymbolsMenuControl({
  openMenu,
  setOpenMenu,
  symbols,
  onToggleSymbol,
  onToggleAllSymbols,
}: Pick<ToolbarMenusProps, 'openMenu' | 'setOpenMenu' | 'symbols' | 'onToggleSymbol' | 'onToggleAllSymbols'>) {
  const { t } = useI18n();
  const isOpen = openMenu === 'symbols';
  const allShown = symbols.showWhitespaceAndTab && symbols.showEol && symbols.showNonPrinting;
  const anyVisible =
    symbols.showWhitespaceAndTab || symbols.showEol || symbols.showNonPrinting || symbols.showWrapSymbol;

  return (
    <div className={styles.menuWrap}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={[styles.toggleBtn, anyVisible ? styles.toggleBtnActive : ''].filter(Boolean).join(' ')}
        onClick={() => setOpenMenu(isOpen ? null : 'symbols')}
      >
        {t('notepad.symbols.menu')} ▾
      </button>
      {isOpen && (
        <div className={styles.menuDropdown} role="menu" aria-label={t('notepad.symbols.menu')}>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={symbols.showWhitespaceAndTab}
            className={styles.menuItem}
            onClick={() => onToggleSymbol('showWhitespaceAndTab')}
          >
            <span className={styles.menuCheck}>{symbols.showWhitespaceAndTab ? '✓' : ''}</span>
            <span>{t('notepad.symbols.whitespaceTab')}</span>
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={symbols.showEol}
            className={styles.menuItem}
            onClick={() => onToggleSymbol('showEol')}
          >
            <span className={styles.menuCheck}>{symbols.showEol ? '✓' : ''}</span>
            <span>{t('notepad.symbols.eol')}</span>
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={symbols.showNonPrinting}
            className={styles.menuItem}
            onClick={() => onToggleSymbol('showNonPrinting')}
          >
            <span className={styles.menuCheck}>{symbols.showNonPrinting ? '✓' : ''}</span>
            <span>{t('notepad.symbols.nonPrinting')}</span>
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={allShown}
            className={styles.menuItem}
            onClick={onToggleAllSymbols}
          >
            <span className={styles.menuCheck}>{allShown ? '✓' : ''}</span>
            <span>{t('notepad.symbols.allChars')}</span>
          </button>
          <div className={styles.menuDivider} />
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={symbols.showIndentGuide}
            className={styles.menuItem}
            onClick={() => onToggleSymbol('showIndentGuide')}
          >
            <span className={styles.menuCheck}>{symbols.showIndentGuide ? '✓' : ''}</span>
            <span>{t('notepad.symbols.indentGuide')}</span>
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={symbols.showWrapSymbol}
            className={styles.menuItem}
            onClick={() => onToggleSymbol('showWrapSymbol')}
          >
            <span className={styles.menuCheck}>{symbols.showWrapSymbol ? '✓' : ''}</span>
            <span>{t('notepad.symbols.wrapSymbol')}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function LanguageMenuControl({
  openMenu,
  setOpenMenu,
  activeLanguage,
  onChangeLanguage,
}: Pick<ToolbarMenusProps, 'openMenu' | 'setOpenMenu' | 'activeLanguage' | 'onChangeLanguage'>) {
  const { t } = useI18n();
  const isOpen = openMenu === 'language';
  const [openLetter, setOpenLetter] = useState<string | null>(null);
  const { plainText, groups } = useMemo(() => groupLanguagesByLetter(), []);
  const submenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) setOpenLetter(null);
  }, [isOpen]);

  return (
    <div className={styles.menuWrap}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={styles.cmdBtn}
        onClick={() => setOpenMenu(isOpen ? null : 'language')}
        title={getLanguageLabel(activeLanguage)}
      >
        {t('notepad.language.menu')} ▾
      </button>
      {isOpen && (
        <div className={styles.menuDropdown} role="menu" aria-label={t('notepad.language.menu')}>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={activeLanguage === plainText.id}
            className={styles.menuItem}
            onMouseEnter={() => setOpenLetter(null)}
            onClick={() => {
              onChangeLanguage(plainText.id);
              setOpenMenu(null);
            }}
          >
            <span className={styles.menuCheck}>{activeLanguage === plainText.id ? '✓' : ''}</span>
            <span>{plainText.label}</span>
          </button>
          <div className={styles.menuDivider} />
          <div className={styles.langListScroll}>
            {groups.map((group) => {
              const hasActive = group.languages.some((l) => l.id === activeLanguage);
              if (group.languages.length === 1) {
                const only = group.languages[0];
                return (
                  <button
                    key={group.letter}
                    type="button"
                    role="menuitemradio"
                    aria-checked={activeLanguage === only.id}
                    className={styles.menuItem}
                    onMouseEnter={() => setOpenLetter(null)}
                    onClick={() => {
                      onChangeLanguage(only.id);
                      setOpenMenu(null);
                    }}
                  >
                    <span className={styles.menuCheck}>{activeLanguage === only.id ? '✓' : ''}</span>
                    <span>{only.label}</span>
                  </button>
                );
              }
              const expanded = openLetter === group.letter;
              return (
                <div
                  key={group.letter}
                  className={styles.submenuRow}
                  onMouseEnter={() => setOpenLetter(group.letter)}
                >
                  <button
                    type="button"
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={expanded}
                    className={[styles.menuItem, expanded ? styles.menuItemHover : ''].filter(Boolean).join(' ')}
                    onClick={() => setOpenLetter(expanded ? null : group.letter)}
                  >
                    <span className={styles.menuCheck}>{hasActive ? '•' : ''}</span>
                    <span className={styles.langLetterLabel}>{group.letter}</span>
                    <span className={styles.submenuCaret} aria-hidden="true">
                      ▸
                    </span>
                  </button>
                  {expanded && (
                    <div
                      ref={submenuRef}
                      className={styles.cascadingSubmenu}
                      role="menu"
                      aria-label={`${group.letter} languages`}
                    >
                      {group.languages.map((lang) => (
                        <button
                          key={lang.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={activeLanguage === lang.id}
                          className={styles.menuItem}
                          onClick={() => {
                            onChangeLanguage(lang.id);
                            setOpenMenu(null);
                          }}
                        >
                          <span className={styles.menuCheck}>{activeLanguage === lang.id ? '✓' : ''}</span>
                          <span>{lang.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function EncodingMenuControl({
  openMenu,
  setOpenMenu,
  activeEncoding,
  onReinterpretEncoding,
  onConvertEncoding,
}: Pick<
  ToolbarMenusProps,
  'openMenu' | 'setOpenMenu' | 'activeEncoding' | 'onReinterpretEncoding' | 'onConvertEncoding'
>) {
  const { t } = useI18n();
  const isOpen = openMenu === 'encoding';

  return (
    <div className={styles.menuWrap}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={styles.cmdBtn}
        onClick={() => setOpenMenu(isOpen ? null : 'encoding')}
        title={getEncodingShortLabel(activeEncoding)}
      >
        {t('notepad.encoding.menu')} ▾
      </button>
      {isOpen && (
        <div className={styles.menuDropdown} role="menu" aria-label={t('notepad.encoding.menu')}>
          <div className={styles.menuSectionLabel}>{t('notepad.encoding.viewAsHeading')}</div>
          {SUPPORTED_ENCODINGS.map((enc) => (
            <button
              key={`view-${enc.id}`}
              type="button"
              role="menuitemradio"
              aria-checked={activeEncoding === enc.id}
              className={styles.menuItem}
              onClick={() => {
                onReinterpretEncoding(enc.id);
                setOpenMenu(null);
              }}
            >
              <span className={styles.menuCheck}>{activeEncoding === enc.id ? '✓' : ''}</span>
              <span>{enc.label}</span>
            </button>
          ))}
          <div className={styles.menuDivider} />
          <div className={styles.menuSectionLabel}>{t('notepad.encoding.convertHeading')}</div>
          {SUPPORTED_ENCODINGS.map((enc) => (
            <button
              key={`conv-${enc.id}`}
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => {
                onConvertEncoding(enc.id);
                setOpenMenu(null);
              }}
            >
              <span className={styles.menuCheck} />
              <span>{t('notepad.encoding.convertTo', { name: enc.label })}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MimeToolsMenuControl({
  openMenu,
  setOpenMenu,
  onRunMimeTool,
}: Pick<ToolbarMenusProps, 'openMenu' | 'setOpenMenu' | 'onRunMimeTool'>) {
  const { t } = useI18n();
  const isOpen = openMenu === 'mime';

  const run = (action: MimeToolAction) => {
    onRunMimeTool(action);
    setOpenMenu(null);
  };

  return (
    <div className={styles.menuWrap}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={styles.cmdBtn}
        onClick={() => setOpenMenu(isOpen ? null : 'mime')}
      >
        {t('notepad.mime.menu')} ▾
      </button>
      {isOpen && (
        <div className={styles.menuDropdown} role="menu" aria-label={t('notepad.mime.menu')}>
          <div className={styles.menuSectionLabel}>{t('notepad.mime.scopeHint')}</div>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => run('base64-encode')}>
            {t('notepad.mime.b64Encode')}
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => run('base64-encode-unix')}>
            {t('notepad.mime.b64EncodeUnix')}
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => run('base64-encode-nopad')}>
            {t('notepad.mime.b64EncodeNoPad')}
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => run('base64-encode-byline')}>
            {t('notepad.mime.b64EncodeByLine')}
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => run('base64-decode')}>
            {t('notepad.mime.b64Decode')}
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => run('base64-decode-strict')}>
            {t('notepad.mime.b64DecodeStrict')}
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => run('base64-decode-byline')}>
            {t('notepad.mime.b64DecodeByLine')}
          </button>
          <div className={styles.menuDivider} />
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => run('qp-encode')}>
            {t('notepad.mime.qpEncode')}
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => run('qp-decode')}>
            {t('notepad.mime.qpDecode')}
          </button>
          <div className={styles.menuDivider} />
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => run('url-encode')}>
            {t('notepad.mime.urlEncode')}
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => run('url-encode-full')}>
            {t('notepad.mime.urlEncodeFull')}
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => run('url-decode')}>
            {t('notepad.mime.urlDecode')}
          </button>
          <div className={styles.menuDivider} />
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => run('saml-decode')}>
            {t('notepad.mime.samlDecode')}
          </button>
        </div>
      )}
    </div>
  );
}

export function ToolsHashMenuControl({
  openMenu,
  setOpenMenu,
  onOpenHashDialog,
}: Pick<ToolbarMenusProps, 'openMenu' | 'setOpenMenu' | 'onOpenHashDialog'>) {
  const { t } = useI18n();
  const isOpen = openMenu === 'tools';

  const pick = (algo: HashAlgorithm | 'ALL') => {
    onOpenHashDialog(algo);
    setOpenMenu(null);
  };

  return (
    <div className={styles.menuWrap}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={styles.cmdBtn}
        onClick={() => setOpenMenu(isOpen ? null : 'tools')}
      >
        {t('notepad.tools.menu')} ▾
      </button>
      {isOpen && (
        <div className={styles.menuDropdownRight} role="menu" aria-label={t('notepad.tools.menu')}>
          <div className={styles.menuSectionLabel}>{t('notepad.tools.digestsHeading')}</div>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => pick('MD5')}>
            MD5
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => pick('SHA-1')}>
            SHA-1
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => pick('SHA-256')}>
            SHA-256
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => pick('SHA-512')}>
            SHA-512
          </button>
          <div className={styles.menuDivider} />
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => pick('ALL')}>
            {t('notepad.tools.allDigests')}
          </button>
        </div>
      )}
    </div>
  );
}

export interface DataAlignMenuProps {
  openMenu: OpenMenuId;
  setOpenMenu: (id: OpenMenuId) => void;
  onAlignCsv: (opts: AlignOptions) => void;
  onShrinkCsv: (delimiter?: DelimiterOption) => void;
  onOpenCsvPreview: () => void;
}

export function DataAlignMenuControl({
  openMenu,
  setOpenMenu,
  onAlignCsv,
  onShrinkCsv,
  onOpenCsvPreview,
}: DataAlignMenuProps) {
  const { t } = useI18n();
  const isOpen = openMenu === 'data';

  const runAlign = (opts: AlignOptions) => {
    onAlignCsv(opts);
    setOpenMenu(null);
  };

  return (
    <div className={styles.menuWrap}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={styles.cmdBtn}
        onClick={() => setOpenMenu(isOpen ? null : 'data')}
      >
        {t('notepad.data.menu')} ▾
      </button>
      {isOpen && (
        <div className={styles.menuDropdown} role="menu" aria-label={t('notepad.data.menu')}>
          <div className={styles.menuSectionLabel}>{t('notepad.mime.scopeHint')}</div>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => runAlign({ delimiter: 'auto', alignment: 'auto' })}
          >
            {t('notepad.data.alignAuto')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => runAlign({ delimiter: 'auto', alignment: 'left' })}
          >
            {t('notepad.data.alignLeft')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => runAlign({ delimiter: 'auto', alignment: 'right' })}
          >
            {t('notepad.data.alignRight')}
          </button>
          <div className={styles.menuDivider} />
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => runAlign({ delimiter: ',', alignment: 'auto' })}
          >
            {t('notepad.data.alignComma')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => runAlign({ delimiter: ';', alignment: 'auto' })}
          >
            {t('notepad.data.alignSemicolon')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => runAlign({ delimiter: '\t', alignment: 'auto' })}
          >
            {t('notepad.data.alignTab')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => runAlign({ delimiter: '|', alignment: 'auto' })}
          >
            {t('notepad.data.alignPipe')}
          </button>
          <div className={styles.menuDivider} />
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              onShrinkCsv('auto');
              setOpenMenu(null);
            }}
          >
            {t('notepad.data.shrink')}
          </button>
          <div className={styles.menuDivider} />
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              onOpenCsvPreview();
              setOpenMenu(null);
            }}
          >
            {t('notepad.data.openTablePreview')}
          </button>
        </div>
      )}
    </div>
  );
}
