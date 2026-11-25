// Hardened CSV/TSV table & JSON formatted viewer for /python/main.
// Security (security.md §4): pure React text nodes only (zero innerHTML / dangerouslySetInnerHTML).

import { useMemo } from 'react';

import { useI18n } from '../../lib/ui/i18n';
import plotStyles from '../../styles/PythonPlots.module.css';

export const MAX_TABLE_ROWS = 500;

export interface DataTableViewerProps {
  kind: 'csv' | 'tsv' | 'json';
  text: string;
  path: string;
}

/** RFC-4180 compliant CSV/TSV parser supporting quoted delimiters, escaped quotes, and multiline fields. */
export function parseDelimited(input: string, delimiter: ',' | '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = input.length;

  // Strip optional UTF-8 BOM
  if (len > 0 && input.charCodeAt(0) === 0xfeff) {
    i = 1;
  }

  while (i < len) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && input[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
      continue;
    }

    if (ch === '"' && field.length === 0) {
      inQuotes = true;
      i += 1;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
      i += 1;
    } else if (ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += i + 1 < len && input[i + 1] === '\n' ? 2 : 1;
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop single trailing empty row caused by final newline
  if (rows.length > 1) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === '') {
      rows.pop();
    }
  }

  return rows;
}

export default function DataTableViewer({ kind, text, path }: DataTableViewerProps) {
  const { t } = useI18n();

  const tableData = useMemo(() => {
    if (kind !== 'csv' && kind !== 'tsv') return null;
    const allRows = parseDelimited(text, kind === 'tsv' ? '\t' : ',');
    if (allRows.length === 0) {
      return { headers: [] as string[], body: [] as string[][], totalDataRows: 0, colCount: 0 };
    }
    const headers = allRows[0];
    const dataRows = allRows.slice(1);
    let colCount = headers.length;
    for (const r of dataRows) {
      if (r.length > colCount) colCount = r.length;
    }
    return {
      headers,
      body: dataRows.slice(0, MAX_TABLE_ROWS),
      totalDataRows: dataRows.length,
      colCount,
    };
  }, [kind, text]);

  const jsonData = useMemo(() => {
    if (kind !== 'json') return null;
    try {
      const parsed: unknown = JSON.parse(text);
      return {
        ok: true as const,
        formatted: JSON.stringify(parsed, null, 2),
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [kind, text]);

  if (kind === 'json' && jsonData) {
    return (
      <>
        {!jsonData.ok && (
          <div className={plotStyles.errorBanner} role="alert" data-testid="python-json-error">
            {t('python.jsonInvalid', { reason: jsonData.error })}
          </div>
        )}
        <div className={plotStyles.dataStage} data-testid="python-json-viewer">
          <pre className={plotStyles.jsonPre} data-testid="python-json-pre">
            {jsonData.ok ? jsonData.formatted : text}
          </pre>
        </div>
      </>
    );
  }

  if (!tableData || tableData.colCount === 0) {
    return (
      <div className={plotStyles.emptyState} data-testid="python-csv-empty">
        <div className={plotStyles.emptyDesc}>{t('python.tableEmpty')}</div>
      </div>
    );
  }

  const truncated = tableData.totalDataRows > MAX_TABLE_ROWS;

  return (
    <>
      <div className={plotStyles.stageToolbar}>
        <span className={plotStyles.viewerMeta} data-testid="python-csv-summary">
          {t('python.tableStats', {
            rows: tableData.totalDataRows,
            cols: tableData.colCount,
          })}
        </span>
        {truncated && (
          <span className={plotStyles.viewerMeta} data-testid="python-csv-truncated">
            {t('python.tableTruncated', {
              shown: MAX_TABLE_ROWS,
              total: tableData.totalDataRows,
            })}
          </span>
        )}
      </div>

      <div className={plotStyles.dataStage} data-testid="python-csv-viewer">
        <table className={plotStyles.csvTable} aria-label={path} data-testid="python-csv-table">
          <thead>
            <tr>
              {Array.from({ length: tableData.colCount }, (_, c) => (
                <th key={c} scope="col">
                  {tableData.headers[c] ?? `Col ${c + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableData.body.map((row, rIdx) => (
              <tr key={rIdx}>
                {Array.from({ length: tableData.colCount }, (_, c) => (
                  <td key={c}>{row[c] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
