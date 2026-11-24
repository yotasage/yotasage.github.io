import { useEffect, useMemo, useRef, useState } from 'react';

import { exportTruthTableCsv, exportTruthTableLatex } from '../../lib/boolean/truthTable';
import type { TruthTableData } from '../../lib/boolean/types';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import styles from '../../styles/Boolean.module.css';
import dStyles from '../../styles/BooleanDiagrams.module.css';

type ColumnPreset = 'io' | 'all' | 'custom';

interface ColDef {
  readonly id: string;
  readonly label: string;
  readonly kind: 'input' | 'internal' | 'output';
  readonly title?: string;
}

export interface TruthTablePanelProps {
  readonly originalTable: TruthTableData;
  readonly targetTable: TruthTableData;
  readonly targetLabel: string;
  readonly selectedRowIndex: number | null;
  readonly onSelectRow: (rowIndex: number) => void;
  readonly allowCollapse?: boolean;
}

const WIDE_THRESHOLD = 860;

function SingleTruthTable({
  table,
  title,
  preset,
  selectedIds,
  onToggleId,
  selectedRowIndex,
  onSelectRow,
  paneKey,
  isQuick,
}: {
  table: TruthTableData;
  title: string;
  preset: ColumnPreset;
  selectedIds: ReadonlySet<string>;
  onToggleId: (id: string) => void;
  selectedRowIndex: number | null;
  onSelectRow: (rowIndex: number) => void;
  paneKey: 'orig' | 'target';
  isQuick: boolean;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<'csv' | 'latex' | null>(null);

  const allCols = useMemo<ColDef[]>(() => {
    const cols: ColDef[] = [];
    for (const v of table.variables) {
      cols.push({ id: `in:${v}`, label: v, kind: 'input', title: `Input ${v}` });
    }
    for (const sig of table.internals) {
      cols.push({
        id: `int:${sig.id}`,
        label: sig.id,
        kind: 'internal',
        title: `${sig.id} (${sig.gateId}: ${sig.label})`,
      });
    }
    for (const outName of table.outputNames) {
      cols.push({
        id: `out:${outName}`,
        label: outName,
        kind: 'output',
        title: `Output ${outName}`,
      });
    }
    return cols;
  }, [table]);

  const visibleCols = useMemo(() => {
    if (preset === 'io') return allCols.filter((c) => c.kind !== 'internal');
    if (preset === 'all') return allCols;
    return allCols.filter((c) => selectedIds.has(c.id));
  }, [allCols, preset, selectedIds]);

  const exportCols = useMemo(
    () =>
      visibleCols.map((c) => ({
        id: c.id.replace(/^(?:in|int|out):/, ''),
        label: c.label,
        kind: c.kind,
      })),
    [visibleCols],
  );

  const copyTable = async (kind: 'csv' | 'latex') => {
    const text =
      kind === 'csv'
        ? exportTruthTableCsv(table, exportCols)
        : exportTruthTableLatex(table, exportCols);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className={dStyles.subPane} data-testid={`truth-table-${paneKey}`}>
      <div className={dStyles.subPaneHead}>
        <h3 className={dStyles.subPaneTitle}>{title}</h3>
        {!isQuick && (
          <div className={styles.btnRow}>
            <button
              type="button"
              className={[styles.btn, styles.btnSmall].join(' ')}
              onClick={() => copyTable('csv')}
              disabled={visibleCols.length === 0}
            >
              {copied === 'csv' ? t('boolean.result.copied') : t('boolean.tt.copyCsv')}
            </button>
            <button
              type="button"
              className={[styles.btn, styles.btnSmall].join(' ')}
              onClick={() => copyTable('latex')}
              disabled={visibleCols.length === 0}
            >
              {copied === 'latex' ? t('boolean.result.copied') : t('boolean.tt.copyLatex')}
            </button>
          </div>
        )}
      </div>

      {preset === 'custom' && (
        <div className={dStyles.signalBar} role="group" aria-label={`${title} ${t('boolean.tt.signalPicker')}`}>
          <span className={dStyles.signalBarLabel}>{t('boolean.tt.signalPicker')}:</span>
          {allCols.map((col) => (
            <label key={col.id} className={dStyles.signalCheck} title={col.title}>
              <input
                type="checkbox"
                checked={selectedIds.has(col.id)}
                onChange={() => onToggleId(col.id)}
              />
              <span>{col.label}</span>
              {col.kind === 'internal' && <span className={dStyles.signalCheckRole}>int</span>}
              {col.kind === 'output' && <span className={dStyles.signalCheckRole}>out</span>}
            </label>
          ))}
        </div>
      )}

      {visibleCols.length === 0 ? (
        <p className={dStyles.hintText}>{t('boolean.tt.noCols')}</p>
      ) : (
        <div className={dStyles.tableWrap}>
          <table className={dStyles.truthTable}>
            <thead>
              <tr>
                <th className={dStyles.rowIdx}>#</th>
                {visibleCols.map((col, idx) => {
                  const prev = idx > 0 ? visibleCols[idx - 1] : null;
                  const sep = prev && prev.kind !== col.kind ? dStyles.colSep : '';
                  const cls = [
                    sep,
                    col.kind === 'internal' ? dStyles.thInternal : '',
                    col.kind === 'output' ? dStyles.thOutput : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <th key={col.id} className={cls} title={col.title}>
                      {col.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => {
                const active = selectedRowIndex === row.index;
                return (
                  <tr
                    key={row.index}
                    className={active ? dStyles.rowActive : undefined}
                    onClick={() => onSelectRow(row.index)}
                  >
                    <td className={dStyles.rowIdx}>{row.index}</td>
                    {visibleCols.map((col, idx) => {
                      const prev = idx > 0 ? visibleCols[idx - 1] : null;
                      const sep = prev && prev.kind !== col.kind ? dStyles.colSep : '';
                      const rawId = col.id.replace(/^(?:in|int|out):/, '');
                      const val =
                        col.kind === 'input'
                          ? (row.inputs[rawId] ?? 0)
                          : col.kind === 'internal'
                            ? (row.internals[rawId] ?? 0)
                            : (row.outputs[rawId] ?? row.output);
                      return (
                        <td
                          key={col.id}
                          className={[sep, val === 1 ? dStyles.valOne : dStyles.valZero]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {visibleCols.some((c) => c.kind === 'internal') && table.internals.length > 0 && (
        <div className={dStyles.netLegend}>
          {table.internals.map((sig) => (
            <span key={sig.id}>
              <strong>{sig.id}</strong> = {sig.label} ({sig.gateId})
            </span>
          ))}
        </div>
      )}

      {table.truncated && (
        <p className={dStyles.hintText}>
          {t('boolean.tt.truncated', { shown: table.rows.length, total: table.totalRows })}
        </p>
      )}
    </div>
  );
}

export default function TruthTablePanel({
  originalTable,
  targetTable,
  targetLabel,
  selectedRowIndex,
  onSelectRow,
  allowCollapse = false,
}: TruthTablePanelProps) {
  const { t } = useI18n();
  const { mode } = useExperienceMode();
  const isQuick = mode === 'quick';
  const containerRef = useRef<HTMLDivElement>(null);
  const [isWide, setIsWide] = useState(true);
  const [paneLayout, setPaneLayout] = useState<'side-by-side' | 'stacked'>('side-by-side');
  const [collapsed, setCollapsed] = useState(false);
  const [preset, setPreset] = useState<ColumnPreset>('io');

  const buildDefaultIds = (tbl: TruthTableData) => {
    const s = new Set<string>();
    for (const v of tbl.variables) s.add(`in:${v}`);
    for (const o of tbl.outputNames) s.add(`out:${o}`);
    return s;
  };

  const [origSelected, setOrigSelected] = useState<Set<string>>(() => buildDefaultIds(originalTable));
  const [targetSelected, setTargetSelected] = useState<Set<string>>(() => buildDefaultIds(targetTable));

  const origSigKey = `${originalTable.variables.join(',')}|${originalTable.internals.map((i) => i.id).join(',')}|${originalTable.outputNames.join(',')}`;
  const targetSigKey = `${targetTable.variables.join(',')}|${targetTable.internals.map((i) => i.id).join(',')}|${targetTable.outputNames.join(',')}`;

  useEffect(() => {
    setOrigSelected(buildDefaultIds(originalTable));
  }, [origSigKey]);

  useEffect(() => {
    setTargetSelected(buildDefaultIds(targetTable));
  }, [targetSigKey]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const check = () => setIsWide(el.getBoundingClientRect().width >= WIDE_THRESHOLD);
    check();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          if (e.contentRect.width > 0) setIsWide(e.contentRect.width >= WIDE_THRESHOLD);
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleSelectPreset = (next: ColumnPreset) => {
    if (next === 'custom' && preset === 'all') {
      const allOrig = new Set<string>([
        ...originalTable.variables.map((v) => `in:${v}`),
        ...originalTable.internals.map((s) => `int:${s.id}`),
        ...originalTable.outputNames.map((o) => `out:${o}`),
      ]);
      const allTgt = new Set<string>([
        ...targetTable.variables.map((v) => `in:${v}`),
        ...targetTable.internals.map((s) => `int:${s.id}`),
        ...targetTable.outputNames.map((o) => `out:${o}`),
      ]);
      setOrigSelected(allOrig);
      setTargetSelected(allTgt);
    }
    setPreset(next);
  };

  const handleReset = () => {
    setPreset('io');
    setOrigSelected(buildDefaultIds(originalTable));
    setTargetSelected(buildDefaultIds(targetTable));
  };

  const toggleInSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isCustomized = preset !== 'io';
  const useSideBySide = isWide && paneLayout === 'side-by-side';

  return (
    <section ref={containerRef} className={dStyles.sectionCard} aria-label={t('boolean.tt.title')}>
      <div className={dStyles.sectionToolbar}>
        <div className={styles.stepsTitleGroup}>
          <h2 className={styles.cardTitle}>{t('boolean.tt.title')}</h2>
          <span className={styles.metaInline}>
            {originalTable.rows.length} rows · {useSideBySide ? 'side-by-side' : 'stacked'}
          </span>
        </div>

        <div className={styles.stepsControls}>
          {!collapsed && (
            <>
              <div className={styles.segmented} role="group" aria-label="Truth table layout">
                <button
                  type="button"
                  aria-pressed={paneLayout === 'side-by-side'}
                  data-testid="tt-layout-side"
                  className={[
                    styles.segBtn,
                    paneLayout === 'side-by-side' ? styles.segBtnActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setPaneLayout('side-by-side')}
                >
                  {t('boolean.view.sideBySide')}
                </button>
                <button
                  type="button"
                  aria-pressed={paneLayout === 'stacked'}
                  data-testid="tt-layout-stacked"
                  className={[styles.segBtn, paneLayout === 'stacked' ? styles.segBtnActive : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setPaneLayout('stacked')}
                >
                  {t('boolean.view.stacked')}
                </button>
              </div>

              <div className={styles.segmented} role="group" aria-label={t('boolean.tt.signalPicker')}>
                {(['io', 'all', 'custom'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={preset === m}
                    className={[styles.segBtn, preset === m ? styles.segBtnActive : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => handleSelectPreset(m)}
                  >
                    {t(`boolean.tt.preset.${m}`)}
                  </button>
                ))}
              </div>
              {isCustomized && (
                <button
                  type="button"
                  className={[styles.btnGhost, styles.btnSmall].join(' ')}
                  onClick={handleReset}
                >
                  {t('boolean.tt.resetCols')}
                </button>
              )}
            </>
          )}
          {allowCollapse && (
            <button
              type="button"
              className={[styles.btn, styles.btnSmall].join(' ')}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? t('boolean.tt.showSection') : t('boolean.tt.hideSection')}
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className={dStyles.sectionBody}>
          {!isQuick && <p className={dStyles.hintText}>{t('boolean.tt.probeHint')}</p>}
          <div className={useSideBySide ? dStyles.dualGrid : dStyles.singleGrid} data-testid="tt-grid">
            <SingleTruthTable
              table={originalTable}
              title={t('boolean.tt.before')}
              preset={preset}
              selectedIds={origSelected}
              onToggleId={(id) => toggleInSet(setOrigSelected, id)}
              selectedRowIndex={selectedRowIndex}
              onSelectRow={onSelectRow}
              paneKey="orig"
              isQuick={isQuick}
            />
            <SingleTruthTable
              table={targetTable}
              title={targetLabel}
              preset={preset}
              selectedIds={targetSelected}
              onToggleId={(id) => toggleInSet(setTargetSelected, id)}
              selectedRowIndex={selectedRowIndex}
              onSelectRow={onSelectRow}
              paneKey="target"
              isQuick={isQuick}
            />
          </div>
        </div>
      )}
    </section>
  );
}
