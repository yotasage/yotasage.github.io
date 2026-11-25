import { useEffect, useMemo, useState } from 'react';

import type { EvalNumericResult } from '../../lib/calc/eval';
import {
  BUILTIN_LAYOUTS,
  getLayoutEquationLatex,
  LAYOUT_CATEGORIES,
  type LayoutCategory,
  type LayoutSolveResult,
  serializeLayout,
  serializeLayoutBundle,
  type SmartCalcLayoutV1,
  solveLayout,
} from '../../lib/calc/layouts';
import { useI18n } from '../../lib/ui/i18n';
import calcStyles from '../../styles/Calculator.module.css';
import styles from '../../styles/CalculatorLayouts.module.css';
import PillTabs, { type PillTabItem } from '../UI/PillTabs';
import LayoutEditorModal from './LayoutEditorModal';
import ResultDisplay from './ResultDisplay';
import SafeKatex from './SafeKatex';

export interface LayoutsViewProps {
  customLayouts: readonly SmartCalcLayoutV1[];
  onSaveCustomLayout: (layout: SmartCalcLayoutV1) => void;
  onImportCustomLayouts: (layouts: readonly SmartCalcLayoutV1[]) => void;
  onDeleteCustomLayout: (id: string) => void;
  onSendToCalculator: (expr: string) => void;
}

type FilterCategory = 'all' | LayoutCategory;

function buildDefaultInputs(layout: SmartCalcLayoutV1): Record<string, string> {
  const map: Record<string, string> = {};
  for (const v of layout.variables) {
    map[v.symbol] = v.example ?? '';
  }
  return map;
}

function downloadJsonFile(filename: string, content: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function LayoutsView({
  customLayouts,
  onSaveCustomLayout,
  onImportCustomLayouts,
  onDeleteCustomLayout,
  onSendToCalculator,
}: LayoutsViewProps) {
  const { t } = useI18n();
  const [category, setCategory] = useState<FilterCategory>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>(BUILTIN_LAYOUTS[0].id);
  const [solveFor, setSolveFor] = useState<string>(BUILTIN_LAYOUTS[0].variables[0].symbol);
  const [inputsByLayout, setInputsByLayout] = useState<Record<string, Record<string, string>>>({});
  const [copiedJson, setCopiedJson] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'editor' | 'import'>('editor');
  const [editingLayout, setEditingLayout] = useState<SmartCalcLayoutV1 | null>(null);

  const allLayouts = useMemo(
    () => [...customLayouts, ...BUILTIN_LAYOUTS],
    [customLayouts],
  );

  const localizeLayoutName = (layout: SmartCalcLayoutV1): string => {
    if (!layout.builtIn) return layout.name;
    const key = `calc.preset.${layout.id}.name`;
    const val = t(key);
    return val === key ? layout.name : val;
  };

  const localizeLayoutDesc = (layout: SmartCalcLayoutV1): string => {
    if (!layout.builtIn) return layout.description;
    const key = `calc.preset.${layout.id}.desc`;
    const val = t(key);
    return val === key ? layout.description : val;
  };

  const localizeVarLabel = (layout: SmartCalcLayoutV1, symbol: string, fallback: string): string => {
    if (!layout.builtIn) return fallback;
    let varKey = `calc.varLabel.${symbol}`;
    if (layout.id === 'box-volume' && symbol === 'V') varKey = 'calc.varLabel.V_vol';
    else if (layout.id === 'voltage-divider' && symbol === 'R_1') varKey = 'calc.varLabel.R_1_top';
    else if (layout.id === 'voltage-divider' && symbol === 'R_2') varKey = 'calc.varLabel.R_2_bot';
    const val = t(varKey);
    return val === varKey ? fallback : val;
  };

  const filteredLayouts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allLayouts.filter((layout) => {
      if (category === 'custom' && layout.builtIn) return false;
      if (category !== 'all' && category !== 'custom' && layout.category !== category) return false;
      if (!q) return true;
      const locName = localizeLayoutName(layout);
      const locDesc = localizeLayoutDesc(layout);
      const haystack = `${layout.name} ${locName} ${layout.description} ${locDesc} ${layout.equation} ${layout.variables.map((v) => `${v.symbol} ${v.label} ${localizeVarLabel(layout, v.symbol, v.label)}`).join(' ')}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [allLayouts, category, search, t]);

  const activeLayout = useMemo(
    () =>
      allLayouts.find((l) => l.id === selectedId) ??
      filteredLayouts[0] ??
      BUILTIN_LAYOUTS[0],
    [allLayouts, filteredLayouts, selectedId],
  );

  useEffect(() => {
    if (!activeLayout) return;
    if (!activeLayout.variables.some((v) => v.symbol === solveFor)) {
      setSolveFor(activeLayout.variables[0]?.symbol ?? '');
    }
  }, [activeLayout, solveFor]);

  const currentInputs = useMemo(
    () => inputsByLayout[activeLayout.id] ?? buildDefaultInputs(activeLayout),
    [inputsByLayout, activeLayout],
  );

  const updateInput = (symbol: string, value: string) => {
    setInputsByLayout((prev) => ({
      ...prev,
      [activeLayout.id]: {
        ...(prev[activeLayout.id] ?? buildDefaultInputs(activeLayout)),
        [symbol]: value,
      },
    }));
  };

  const resetToExamples = () => {
    setInputsByLayout((prev) => ({
      ...prev,
      [activeLayout.id]: buildDefaultInputs(activeLayout),
    }));
  };

  const solveState = useMemo<{ solved: LayoutSolveResult | null; error: string | null }>(() => {
    if (!activeLayout || !solveFor) return { solved: null, error: null };
    try {
      const solved = solveLayout(activeLayout, solveFor, currentInputs);
      return { solved, error: null };
    } catch (err) {
      return {
        solved: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [activeLayout, solveFor, currentInputs]);

  const displayEvalResult = useMemo<EvalNumericResult | null>(() => {
    if (!solveState.solved) return null;
    const s = solveState.solved;
    return {
      kind: 'value',
      value: s.value,
      text: s.text,
      latex: s.latex,
      baseSI: s.baseSI,
      inputLatex: s.formulaLatex,
      hints: s.hints,
      conversions: s.conversions,
    };
  }, [solveState.solved]);

  const methodBadge = useMemo(() => {
    if (!solveState.solved) return null;
    if (solveState.solved.method === 'preset') return t('calc.layouts.methodPreset');
    if (solveState.solved.method === 'symbolic') return t('calc.layouts.methodSymbolic');
    return t('calc.layouts.methodNumeric');
  }, [solveState.solved, t]);

  const categoryTabs: readonly PillTabItem<FilterCategory>[] = useMemo(
    () => [
      { id: 'all', label: t('calc.layouts.cat.all'), badge: allLayouts.length },
      ...LAYOUT_CATEGORIES.map((cat) => ({
        id: cat,
        label: t(`calc.layouts.cat.${cat}`),
        badge:
          cat === 'custom'
            ? customLayouts.length || undefined
            : allLayouts.filter((l) => l.category === cat).length,
      })),
    ],
    [allLayouts, customLayouts.length, t],
  );

  const handleCopyJson = async () => {
    const json = serializeLayout(activeLayout);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(json);
        setCopiedJson(true);
        window.setTimeout(() => setCopiedJson(false), 1600);
      } catch {
        // ignore
      }
    }
  };

  return (
    <div className={styles.layoutsShell}>
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('calc.layouts.searchPlaceholder')}
          aria-label={t('calc.layouts.searchAria')}
        />

        <div className={calcStyles.btnRow}>
          <button
            type="button"
            className={calcStyles.btnPrimary}
            onClick={() => {
              setEditingLayout(null);
              setModalTab('editor');
              setModalOpen(true);
            }}
          >
            + {t('calc.layouts.newCustom')}
          </button>
          <button
            type="button"
            className={calcStyles.btn}
            onClick={() => {
              setEditingLayout(null);
              setModalTab('import');
              setModalOpen(true);
            }}
          >
            {t('calc.layouts.importJson')}
          </button>
          {customLayouts.length > 0 && (
            <button
              type="button"
              className={calcStyles.btnGhost}
              onClick={() =>
                downloadJsonFile('smart-calculator-layouts.json', serializeLayoutBundle(customLayouts))
              }
            >
              {t('calc.layouts.exportAll')}
            </button>
          )}
        </div>
      </div>

      <PillTabs<FilterCategory>
        items={categoryTabs}
        value={category}
        onChange={setCategory}
        ariaLabel={t('calc.workspace.layouts')}
        size="sm"
      />

      <div className={styles.splitGrid}>
        <div className={styles.presetList} role="list">
          {filteredLayouts.length === 0 ? (
            <div className={calcStyles.card}>
              <p className={calcStyles.emptyPrompt}>{t('calc.layouts.empty')}</p>
            </div>
          ) : (
            filteredLayouts.map((layout) => {
              const active = layout.id === activeLayout.id;
              return (
                <button
                  key={layout.id}
                  type="button"
                  role="listitem"
                  className={`${styles.presetCard} ${active ? styles.presetCardActive : ''}`}
                  onClick={() => {
                    setSelectedId(layout.id);
                    setSolveFor(layout.variables[0]?.symbol ?? '');
                  }}
                >
                  <div className={styles.presetCardTop}>
                    <span className={styles.presetName}>{localizeLayoutName(layout)}</span>
                    {!layout.builtIn && (
                      <span className={calcStyles.badge}>{t('calc.layouts.customBadge')}</span>
                    )}
                  </div>
                  <div className={styles.presetFormula}>
                    <SafeKatex text={getLayoutEquationLatex(layout)} />
                  </div>
                  {layout.description && (
                    <span className={styles.presetDesc}>{localizeLayoutDesc(layout)}</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <section className={styles.solverPanel} aria-label={localizeLayoutName(activeLayout)}>
          <div className={styles.solverHead}>
            <div>
              <h2 className={styles.solverTitle}>{localizeLayoutName(activeLayout)}</h2>
              {activeLayout.description && (
                <p className={styles.solverDesc}>{localizeLayoutDesc(activeLayout)}</p>
              )}
            </div>

            <div className={calcStyles.btnRow}>
              <button
                type="button"
                className={`${calcStyles.btnGhost} ${calcStyles.btnSmall}`}
                onClick={resetToExamples}
              >
                {t('calc.layouts.loadExamples')}
              </button>
              <button
                type="button"
                className={`${calcStyles.btnGhost} ${calcStyles.btnSmall}`}
                onClick={() => { void handleCopyJson(); }}
              >
                {copiedJson ? t('calc.result.copied') : t('calc.layouts.copyJson')}
              </button>
              <button
                type="button"
                className={`${calcStyles.btnGhost} ${calcStyles.btnSmall}`}
                onClick={() =>
                  downloadJsonFile(`${activeLayout.id}.json`, serializeLayout(activeLayout))
                }
              >
                {t('calc.layouts.downloadJson')}
              </button>
              {!activeLayout.builtIn && (
                <>
                  <button
                    type="button"
                    className={`${calcStyles.btn} ${calcStyles.btnSmall}`}
                    onClick={() => {
                      setEditingLayout(activeLayout);
                      setModalTab('editor');
                      setModalOpen(true);
                    }}
                  >
                    {t('calc.layouts.edit')}
                  </button>
                  <button
                    type="button"
                    className={`${calcStyles.btnDanger} ${calcStyles.btnSmall}`}
                    onClick={() => {
                      onDeleteCustomLayout(activeLayout.id);
                      setSelectedId(BUILTIN_LAYOUTS[0].id);
                    }}
                  >
                    {t('calc.layouts.delete')}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className={styles.formulaPlate}>
            <div className={styles.formulaMath}>
              <SafeKatex
                text={solveState.solved?.formulaLatex ?? getLayoutEquationLatex(activeLayout)}
                displayMode
              />
            </div>
            {solveState.solved && (
              <button
                type="button"
                className={`${calcStyles.btnPrimary} ${calcStyles.btnSmall}`}
                onClick={() => onSendToCalculator(solveState.solved!.calculatorExpr)}
              >
                {t('calc.layouts.sendToCalc')}
              </button>
            )}
          </div>

          <div className={styles.solveForRow} role="group" aria-label={t('calc.layouts.solveFor')}>
            <span className={styles.solveForLabel}>{t('calc.layouts.solveFor')}:</span>
            {activeLayout.variables.map((v) => {
              const isTarget = v.symbol === solveFor;
              return (
                <button
                  key={v.symbol}
                  type="button"
                  className={`${styles.varChoiceBtn} ${isTarget ? styles.varChoiceBtnActive : ''}`}
                  aria-pressed={isTarget}
                  onClick={() => setSolveFor(v.symbol)}
                >
                  {v.symbol}
                </button>
              );
            })}
          </div>

          <div className={styles.inputsGrid}>
            {activeLayout.variables.map((v) => {
              const isTarget = v.symbol === solveFor;
              return (
                <label key={v.symbol} className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>
                    <span>{localizeVarLabel(activeLayout, v.symbol, v.label)}</span>
                    {v.defaultUnit && (
                      <span className={styles.fieldUnitHint}>{v.defaultUnit}</span>
                    )}
                  </span>
                  <input
                    type="text"
                    className={`${styles.fieldInput} ${isTarget ? styles.fieldInputTarget : ''}`}
                    value={isTarget ? (solveState.solved?.text ?? '') : (currentInputs[v.symbol] ?? '')}
                    readOnly={isTarget}
                    placeholder={v.example ?? v.defaultUnit ?? ''}
                    onChange={(e) => {
                      if (!isTarget) updateInput(v.symbol, e.target.value);
                    }}
                    spellCheck={false}
                  />
                </label>
              );
            })}
          </div>

          <ResultDisplay
            result={displayEvalResult}
            error={solveState.error}
            showInputLatex={false}
            extraBadge={methodBadge}
            extraBadgeTone={solveState.solved?.method === 'numeric' ? 'accent' : 'good'}
          />
        </section>
      </div>

      <LayoutEditorModal
        open={modalOpen}
        initialTab={modalTab}
        editingLayout={editingLayout}
        onClose={() => setModalOpen(false)}
        onSaveLayout={(saved) => {
          onSaveCustomLayout(saved);
          setSelectedId(saved.id);
          setSolveFor(saved.variables[0]?.symbol ?? '');
        }}
        onImportLayouts={(imported) => {
          onImportCustomLayouts(imported);
          if (imported[0]) {
            setSelectedId(imported[0].id);
            setSolveFor(imported[0].variables[0]?.symbol ?? '');
          }
        }}
      />
    </div>
  );
}
