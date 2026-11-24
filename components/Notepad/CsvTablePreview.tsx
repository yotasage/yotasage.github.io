import { useMemo, useState } from 'react';

import {
  AlignOptions,
  buildDelimitedTable,
  DelimiterOption,
  filterTableRows,
  ResolvedDelimiter,
  sortTableRows,
} from '../../lib/notepad/csvTools';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/NotepadPreview.module.css';

export interface CsvTablePreviewProps {
  content: string;
  fileName: string;
  onAlignText: (opts: AlignOptions) => void;
  onShrinkText: (delimiter?: DelimiterOption) => void;
}

function formatDelimiterDisplay(delim: ResolvedDelimiter): string {
  return delim === '\t' ? 'Tab' : delim;
}

export default function CsvTablePreview({
  content,
  fileName,
  onAlignText,
  onShrinkText,
}: CsvTablePreviewProps) {
  const { t } = useI18n();
  const [delimiter, setDelimiter] = useState<DelimiterOption>('auto');
  const [hasHeader, setHasHeader] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const table = useMemo(
    () => buildDelimitedTable(content, { delimiter, hasHeader, fileName }),
    [content, delimiter, hasHeader, fileName],
  );

  const activeSortCol = sortCol !== null && sortCol < table.colCount ? sortCol : null;

  const displayedRows = useMemo(() => {
    const filtered = filterQuery.trim() ? filterTableRows(table.rows, filterQuery) : table.rows;
    if (activeSortCol === null) return filtered;
    const colType = table.colTypes[activeSortCol] ?? 'text';
    return sortTableRows(filtered, activeSortCol, sortDir, colType);
  }, [table.rows, table.colTypes, filterQuery, activeSortCol, sortDir]);

  const handleToggleSort = (colIdx: number) => {
    if (activeSortCol !== colIdx) {
      setSortCol(colIdx);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortCol(null);
      setSortDir('asc');
    }
  };

  const isFiltered = filterQuery.trim().length > 0;
  const resolvedDelimLabel = formatDelimiterDisplay(table.delimiter);

  return (
    <div className={styles.csvShell}>
      <div className={styles.csvBar}>
        <div className={styles.csvBarGroup}>
          <select
            className={styles.csvSelect}
            value={delimiter}
            aria-label={t('notepad.csv.delimiterAria')}
            onChange={(e) => {
              setDelimiter(e.target.value as DelimiterOption);
              setSortCol(null);
            }}
          >
            <option value="auto">{t('notepad.csv.delimAuto', { delim: resolvedDelimLabel })}</option>
            <option value=",">{t('notepad.csv.delimComma')}</option>
            <option value=";">{t('notepad.csv.delimSemicolon')}</option>
            <option value={'\t'}>{t('notepad.csv.delimTab')}</option>
            <option value="|">{t('notepad.csv.delimPipe')}</option>
            <option value=":">{t('notepad.csv.delimColon')}</option>
          </select>

          <label className={styles.csvCheckLabel}>
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(e) => setHasHeader(e.target.checked)}
            />
            <span>{t('notepad.csv.headerRow')}</span>
          </label>

          <input
            type="search"
            className={styles.csvFilterInput}
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder={t('notepad.csv.filterPlaceholder')}
            aria-label={t('notepad.csv.filterAria')}
          />

          <span className={styles.csvBadge}>
            {isFiltered
              ? t('notepad.csv.countFilteredBadge', {
                  shown: displayedRows.length,
                  total: table.totalRows,
                  cols: table.colCount,
                })
              : t('notepad.csv.countBadge', {
                  rows: table.totalRows,
                  cols: table.colCount,
                })}
          </span>
        </div>

        <div className={styles.csvBarGroup}>
          <button
            type="button"
            className={styles.csvActionBtn}
            onClick={() =>
              onAlignText({
                delimiter,
                hasHeader,
                alignment: 'auto',
                fileName,
              })
            }
          >
            {t('notepad.csv.alignText')}
          </button>
          <button
            type="button"
            className={styles.csvActionBtn}
            onClick={() => onShrinkText(delimiter)}
          >
            {t('notepad.csv.compactText')}
          </button>
        </div>
      </div>

      <div className={styles.csvTableWrap}>
        {table.colCount === 0 ? (
          <div className={styles.csvEmpty}>{t('notepad.csv.empty')}</div>
        ) : (
          <table className={styles.csvTable}>
            <thead>
              <tr>
                {table.headers.map((header, colIdx) => {
                  const isNumeric = table.colTypes[colIdx] === 'number';
                  const isSorted = activeSortCol === colIdx;
                  const ariaSort = isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
                  return (
                    <th key={`h-${colIdx}`} scope="col" aria-sort={ariaSort}>
                      <button
                        type="button"
                        className={[
                          styles.csvSortBtn,
                          isNumeric ? styles.csvSortBtnNum : '',
                          isSorted ? styles.csvSortBtnActive : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => handleToggleSort(colIdx)}
                        aria-label={t('notepad.csv.sortColumn', { col: header })}
                      >
                        <span>{header}</span>
                        <span className={styles.csvSortArrow} aria-hidden="true">
                          {isSorted ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={table.colCount} className={styles.csvEmpty}>
                    {isFiltered ? t('notepad.csv.noMatches') : t('notepad.csv.empty')}
                  </td>
                </tr>
              ) : (
                displayedRows.map((row, rowIdx) => (
                  <tr key={`r-${rowIdx}`}>
                    {row.map((cell, colIdx) => (
                      <td
                        key={`c-${rowIdx}-${colIdx}`}
                        className={table.colTypes[colIdx] === 'number' ? styles.csvNum : undefined}
                        title={cell.length > 36 ? cell : undefined}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
