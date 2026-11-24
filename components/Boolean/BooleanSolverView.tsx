import { useEffect, useMemo, useState } from 'react';

import { buildMultiCircuitGraph } from '../../lib/boolean/circuit';
import { DEFAULT_GATE_DELAYS } from '../../lib/boolean/laws';
import { varToLatex } from '../../lib/boolean/parse';
import { simplifyBoolean } from '../../lib/boolean/simplify';
import { buildMultiTruthTable } from '../../lib/boolean/truthTable';
import type {
  AnalysisTabId,
  GateDelayMap,
  GateInputMode,
  GateType,
  InstanceDelayMap,
  NotationStyle,
  SimplifyEffort,
  SimplifyMethod,
  SimplifySuccess,
  TargetForm,
  WorkspaceLayoutMode,
} from '../../lib/boolean/types';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import styles from '../../styles/Boolean.module.css';
import KatexSpan from '../KatexSpan';
import BooleanInput, { type BooleanSubmitOverride } from './BooleanInput';
import BooleanStepViewer from './BooleanStepViewer';
import CircuitPanel from './CircuitPanel';
import KMapAndExtras from './KMapAndExtras';
import TimingPanel from './TimingPanel';
import TruthTablePanel from './TruthTablePanel';

export interface BooleanSolverViewProps {
  readonly equations: readonly string[];
  readonly onEquationsChange: (next: string[]) => void;
  readonly method: SimplifyMethod;
  readonly onMethodChange: (next: SimplifyMethod) => void;
  readonly effort: SimplifyEffort;
  readonly onEffortChange: (next: SimplifyEffort) => void;
  readonly targetForm: TargetForm;
  readonly onTargetFormChange: (next: TargetForm) => void;
  readonly notation: NotationStyle;
  readonly onNotationChange: (next: NotationStyle) => void;
  readonly explicitAnd: boolean;
  readonly onExplicitAndChange: (next: boolean) => void;
  readonly gateInputMode: GateInputMode;
  readonly onGateInputModeChange: (next: GateInputMode) => void;
  readonly layoutMode: WorkspaceLayoutMode;
  readonly onLayoutModeChange: (next: WorkspaceLayoutMode) => void;
  readonly activeTab: AnalysisTabId;
  readonly onActiveTabChange: (next: AnalysisTabId) => void;
  readonly submitted: {
    readonly equations: readonly string[];
    readonly method: SimplifyMethod;
    readonly effort: SimplifyEffort;
    readonly targetForm: TargetForm;
    readonly notation: NotationStyle;
    readonly explicitAnd: boolean;
    readonly seq: number;
  };
  readonly onSolve: (override?: BooleanSubmitOverride) => void;
  readonly onInspectLaw: (lawId: string) => void;
}

export default function BooleanSolverView({
  equations,
  onEquationsChange,
  method,
  onMethodChange,
  effort,
  onEffortChange,
  targetForm,
  onTargetFormChange,
  notation,
  onNotationChange,
  explicitAnd,
  onExplicitAndChange,
  gateInputMode,
  onGateInputModeChange,
  layoutMode,
  onLayoutModeChange,
  activeTab,
  onActiveTabChange,
  submitted,
  onSolve,
  onInspectLaw,
}: BooleanSolverViewProps) {
  const { t } = useI18n();
  const { mode } = useExperienceMode();
  const isQuick = mode === 'quick';

  const [copiedKey, setCopiedKey] = useState<'latex' | 'text' | null>(null);
  const [selectedEqIdx, setSelectedEqIdx] = useState(0);
  const [inspectedStepIndex, setInspectedStepIndex] = useState<number | null>(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(0);
  const [probeInputs, setProbeInputs] = useState<Record<string, 0 | 1>>({});
  const [workbenchTab, setWorkbenchTab] = useState<Exclude<AnalysisTabId, 'solver'>>('truth-table');

  // Shared gate delays (global + per-instance overrides) across Circuit & Timing panels
  const [typeDelays, setTypeDelays] = useState<GateDelayMap>(DEFAULT_GATE_DELAYS);
  const [origOverrides, setOrigOverrides] = useState<InstanceDelayMap>({});
  const [targetOverrides, setTargetOverrides] = useState<InstanceDelayMap>({});

  // Simplify all non-empty equations (in Quick mode, use clean default heuristic/medium/auto)
  const effectiveMethod: SimplifyMethod = isQuick ? 'heuristic' : submitted.method;
  const effectiveEffort: SimplifyEffort = isQuick ? 'medium' : submitted.effort;
  const effectiveForm: TargetForm = isQuick ? 'auto' : submitted.targetForm;

  const evalBundle = useMemo(() => {
    const nonEmpty = submitted.equations.map((e) => e.trim()).filter(Boolean);
    const list = nonEmpty.length > 0 ? nonEmpty : [''];
    const usedNames = new Set<string>();
    const results: SimplifySuccess[] = [];

    for (let i = 0; i < list.length; i++) {
      const raw = list[i];
      const res = simplifyBoolean(raw, {
        method: effectiveMethod,
        effort: effectiveEffort,
        targetForm: effectiveForm,
        notation: submitted.notation,
        explicitAnd: submitted.explicitAnd,
      });
      if ('error' in res) {
        return {
          ok: false as const,
          error: list.length > 1 ? `Equation ${i + 1}: ${res.error}` : res.error,
          hint: res.hint,
        };
      }
      let outName = res.outputName;
      if (list.length > 1 && !raw.includes('=')) outName = `Y${i + 1}`;
      while (usedNames.has(outName)) outName = `${outName}_${i + 1}`;
      usedNames.add(outName);
      results.push({ ...res, outputName: outName });
    }

    const varSet = new Set<string>();
    for (const r of results) {
      for (const v of r.variables) varSet.add(v);
    }
    const allVariables = [...varSet].sort((a, b) => a.localeCompare(b, 'en'));
    return { ok: true as const, results, allVariables };
  }, [submitted, effectiveMethod, effectiveEffort, effectiveForm]);

  const submittedKey = submitted.equations.join('\n');

  // Reset step inspection and instance overrides when submitted equations change
  useEffect(() => {
    setInspectedStepIndex(null);
    setOrigOverrides({});
    setTargetOverrides({});
    setSelectedEqIdx(0);
    if (evalBundle.ok) {
      const initial: Record<string, 0 | 1> = {};
      for (const v of evalBundle.allVariables) initial[v] = 0;
      setProbeInputs(initial);
      setSelectedRowIndex(0);
    }
  }, [submittedKey, effectiveMethod, effectiveForm]);

  const activeResult =
    evalBundle.ok ? (evalBundle.results[selectedEqIdx] ?? evalBundle.results[0]) : null;

  const activeTargetStep =
    activeResult && inspectedStepIndex !== null && activeResult.steps[inspectedStepIndex]
      ? activeResult.steps[inspectedStepIndex]
      : null;

  const targetLabel =
    activeTargetStep && inspectedStepIndex !== null
      ? t('boolean.tt.atStep', { step: inspectedStepIndex + 1 })
      : t('boolean.tt.after');
  const targetCircuitTitle =
    activeTargetStep && inspectedStepIndex !== null
      ? t('boolean.circuit.atStep', { step: inspectedStepIndex + 1 })
      : t('boolean.circuit.simplified');

  const originalOutputs = useMemo(
    () =>
      evalBundle.ok
        ? evalBundle.results.map((r) => ({ outputName: r.outputName, ast: r.originalAst }))
        : [],
    [evalBundle],
  );

  const targetOutputs = useMemo(
    () =>
      evalBundle.ok
        ? evalBundle.results.map((r, idx) => ({
            outputName: r.outputName,
            ast:
              idx === selectedEqIdx && activeTargetStep
                ? activeTargetStep.ast
                : r.simplifiedAst,
          }))
        : [],
    [evalBundle, selectedEqIdx, activeTargetStep],
  );

  const originalGraph = useMemo(
    () =>
      evalBundle.ok
        ? buildMultiCircuitGraph(
            originalOutputs,
            evalBundle.allVariables,
            submitted.notation,
            submitted.explicitAnd,
            gateInputMode,
          )
        : null,
    [evalBundle, originalOutputs, submitted.notation, submitted.explicitAnd, gateInputMode],
  );

  const targetGraph = useMemo(
    () =>
      evalBundle.ok
        ? buildMultiCircuitGraph(
            targetOutputs,
            evalBundle.allVariables,
            submitted.notation,
            submitted.explicitAnd,
            gateInputMode,
          )
        : null,
    [evalBundle, targetOutputs, submitted.notation, submitted.explicitAnd, gateInputMode],
  );

  const originalTable = useMemo(
    () =>
      evalBundle.ok && originalGraph
        ? buildMultiTruthTable(originalOutputs, evalBundle.allVariables, originalGraph.internals)
        : null,
    [evalBundle, originalOutputs, originalGraph],
  );

  const targetTable = useMemo(
    () =>
      evalBundle.ok && targetGraph
        ? buildMultiTruthTable(targetOutputs, evalBundle.allVariables, targetGraph.internals)
        : null,
    [evalBundle, targetOutputs, targetGraph],
  );

  const handleSelectRow = (rowIndex: number) => {
    setSelectedRowIndex(rowIndex);
    if (!evalBundle.ok) return;
    const vars = evalBundle.allVariables;
    const n = vars.length;
    const next: Record<string, 0 | 1> = {};
    for (let i = 0; i < n; i++) {
      next[vars[i]] = ((rowIndex >> (n - 1 - i)) & 1) === 1 ? 1 : 0;
    }
    setProbeInputs(next);
  };

  const handleToggleProbeInput = (varName: string) => {
    if (!evalBundle.ok) return;
    const next: Record<string, 0 | 1> = {
      ...probeInputs,
      [varName]: probeInputs[varName] === 1 ? 0 : 1,
    };
    setProbeInputs(next);
    let idx = 0;
    for (const v of evalBundle.allVariables) {
      idx = (idx << 1) | (next[v] ?? 0);
    }
    setSelectedRowIndex(idx);
  };

  const handleChangeTypeDelay = (gt: GateType, delayNs: number) => {
    setTypeDelays((prev) => ({ ...prev, [gt]: delayNs }));
  };

  const handleChangeInstanceDelay = (
    which: 'orig' | 'target',
    gateId: string,
    delayNs: number | null,
  ) => {
    const setter = which === 'orig' ? setOrigOverrides : setTargetOverrides;
    setter((prev) => {
      const next = { ...prev };
      if (delayNs === null) delete next[gateId];
      else next[gateId] = delayNs;
      return next;
    });
  };

  const handleResetAllDelays = () => {
    setTypeDelays(DEFAULT_GATE_DELAYS);
    setOrigOverrides({});
    setTargetOverrides({});
  };

  const copyValue = async (kind: 'latex' | 'text', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(kind);
      window.setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const formatDelta = (before: number, after: number): string | null => {
    if (before === after) return null;
    const diff = after - before;
    return diff < 0 ? `${diff}` : `+${diff}`;
  };

  const analysisTabs: readonly { id: AnalysisTabId; label: string }[] = [
    { id: 'solver', label: t('boolean.tab.solver') },
    { id: 'truth-table', label: t('boolean.tab.truthTable') },
    { id: 'circuit', label: t('boolean.tab.circuit') },
    { id: 'timing', label: t('boolean.tab.timing') },
    { id: 'kmap', label: t('boolean.tab.kmap') },
  ];

  const inspectorTabs = analysisTabs.filter(
    (tab): tab is { id: Exclude<AnalysisTabId, 'solver'>; label: string } => tab.id !== 'solver',
  );

  const layoutOptions: readonly { id: WorkspaceLayoutMode; label: string }[] = [
    { id: 'tabs', label: t('boolean.layout.tabs') },
    { id: 'workbench', label: t('boolean.layout.workbench') },
    { id: 'all', label: t('boolean.layout.all') },
  ];

  // Aggregated metrics across all simplified equations
  const totals = useMemo(() => {
    if (!evalBundle.ok) return null;
    return evalBundle.results.reduce(
      (acc, r) => ({
        origGates: acc.origGates + r.originalMetrics.gates,
        simpGates: acc.simpGates + r.simplifiedMetrics.gates,
        origLits: acc.origLits + r.originalMetrics.literals,
        simpLits: acc.simpLits + r.simplifiedMetrics.literals,
        origDepth: Math.max(acc.origDepth, r.originalMetrics.depth),
        simpDepth: Math.max(acc.simpDepth, r.simplifiedMetrics.depth),
        candidates: acc.candidates + r.candidatesEvaluated,
        allEquivalent: acc.allEquivalent && r.equivalent,
        rows: Math.max(acc.rows, r.rowsChecked),
      }),
      {
        origGates: 0,
        simpGates: 0,
        origLits: 0,
        simpLits: 0,
        origDepth: 0,
        simpDepth: 0,
        candidates: 0,
        allEquivalent: true,
        rows: 0,
      },
    );
  }, [evalBundle]);

  const inputCard = (
    <section className={styles.card}>
      <BooleanInput
        equations={equations}
        onEquationsChange={onEquationsChange}
        method={method}
        onMethodChange={onMethodChange}
        effort={effort}
        onEffortChange={onEffortChange}
        targetForm={targetForm}
        onTargetFormChange={onTargetFormChange}
        notation={notation}
        onNotationChange={onNotationChange}
        explicitAnd={explicitAnd}
        onExplicitAndChange={onExplicitAndChange}
        onSubmit={onSolve}
      />
    </section>
  );

  const resultAndSteps = evalBundle.ok && activeResult && totals ? (
    <>
      <section
        className={styles.resultCard}
        aria-label={t('boolean.result.title')}
        data-testid="boolean-result"
      >
        <div className={styles.resultTop}>
          <h2 className={styles.resultHeading}>
            {evalBundle.results.length > 1
              ? t('boolean.result.titlePlural')
              : t('boolean.result.title')}
          </h2>
          <div className={styles.btnRow}>
            <button
              type="button"
              className={[styles.btn, styles.btnSmall].join(' ')}
              onClick={() =>
                copyValue(
                  'latex',
                  evalBundle.results
                    .map((r) => `${varToLatex(r.outputName)} = ${r.simplifiedLatex}`)
                    .join(' \\\\\n'),
                )
              }
            >
              {copiedKey === 'latex' ? t('boolean.result.copied') : t('boolean.result.copyLatex')}
            </button>
            <button
              type="button"
              className={[styles.btn, styles.btnSmall].join(' ')}
              onClick={() =>
                copyValue(
                  'text',
                  evalBundle.results
                    .map((r) => `${r.outputName} = ${r.simplifiedText}`)
                    .join('\n'),
                )
              }
            >
              {copiedKey === 'text' ? t('boolean.result.copied') : t('boolean.result.copyText')}
            </button>
          </div>
        </div>

        <div className={styles.eqResultList}>
          {evalBundle.results.map((r, idx) => (
            <div key={`${r.outputName}-${idx}`} className={styles.eqResultItem}>
              <div className={styles.resultEquation}>
                <KatexSpan
                  text={`${varToLatex(r.outputName)} = ${r.simplifiedLatex}`}
                  displayMode={evalBundle.results.length === 1}
                />
              </div>
              {!isQuick && (
                <code className={styles.monoCode}>
                  {r.outputName} = {r.simplifiedText}
                </code>
              )}
            </div>
          ))}
        </div>

        <div className={styles.metricsStrip}>
          <span className={styles.metricItem}>
            <span className={styles.metricLabel}>{t('boolean.result.gates')}:</span>
            <span className={styles.metricVal}>
              {totals.origGates} → {totals.simpGates}
            </span>
            {formatDelta(totals.origGates, totals.simpGates) && (
              <span className={styles.metricDelta}>
                ({formatDelta(totals.origGates, totals.simpGates)})
              </span>
            )}
          </span>

          <span className={styles.metricItem}>
            <span className={styles.metricLabel}>{t('boolean.result.literals')}:</span>
            <span className={styles.metricVal}>
              {totals.origLits} → {totals.simpLits}
            </span>
            {formatDelta(totals.origLits, totals.simpLits) && (
              <span className={styles.metricDelta}>
                ({formatDelta(totals.origLits, totals.simpLits)})
              </span>
            )}
          </span>

          {!isQuick && (
            <>
              <span className={styles.metricItem}>
                <span className={styles.metricLabel}>{t('boolean.result.depth')}:</span>
                <span className={styles.metricVal}>
                  {totals.origDepth} → {totals.simpDepth}
                </span>
              </span>

              <span className={styles.metaInline}>
                {t('boolean.result.candidates', { count: totals.candidates })}
              </span>
            </>
          )}
        </div>

        {/* Hide verification footer in Quick mode for a truly cleaner view */}
        {!isQuick && (
          <div className={styles.resultSubRow} data-testid="boolean-verification-row">
            <span className={totals.allEquivalent ? styles.verifyOk : styles.verifyBad}>
              {totals.allEquivalent
                ? t('boolean.result.equivalent', { rows: totals.rows })
                : t('boolean.result.mismatch')}
            </span>
            <span className={styles.metaInline}>
              {evalBundle.allVariables.length} input
              {evalBundle.allVariables.length === 1 ? '' : 's'} · {evalBundle.results.length} output
              {evalBundle.results.length === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </section>

      {evalBundle.results.length > 1 && (
        <div className={styles.workspaceBar}>
          <span className={styles.layoutToggleLabel}>{t('boolean.result.selectEquation')}:</span>
          <div className={styles.segmented} role="group" aria-label={t('boolean.result.selectEquation')}>
            {evalBundle.results.map((r, idx) => (
              <button
                key={`${r.outputName}-${idx}`}
                type="button"
                aria-pressed={selectedEqIdx === idx}
                className={[styles.segBtn, selectedEqIdx === idx ? styles.segBtnActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setSelectedEqIdx(idx);
                  setInspectedStepIndex(null);
                }}
              >
                {r.outputName} ({r.steps.length} steps)
              </button>
            ))}
          </div>
        </div>
      )}

      <BooleanStepViewer
        steps={activeResult.steps}
        equationTitle={evalBundle.results.length > 1 ? activeResult.outputName : undefined}
        inspectedStepIndex={inspectedStepIndex}
        onInspectStep={setInspectedStepIndex}
        onInspectLaw={onInspectLaw}
      />
    </>
  ) : null;

  const inspectBanner =
    inspectedStepIndex !== null && activeTargetStep ? (
      <div className={styles.inspectBanner} role="status">
        <span>
          {t('boolean.result.inspectingStep', { step: inspectedStepIndex + 1 })} —{' '}
          <code className={styles.monoCode}>{activeTargetStep.workText}</code>
        </span>
        <button
          type="button"
          className={[styles.btn, styles.btnSmall].join(' ')}
          onClick={() => setInspectedStepIndex(null)}
        >
          {t('boolean.result.backToFinal')}
        </button>
      </div>
    ) : null;

  const truthTableSection =
    originalTable && targetTable ? (
      <TruthTablePanel
        originalTable={originalTable}
        targetTable={targetTable}
        targetLabel={targetLabel}
        selectedRowIndex={selectedRowIndex}
        onSelectRow={handleSelectRow}
        allowCollapse={layoutMode === 'all'}
      />
    ) : null;

  const circuitSection =
    originalGraph && targetGraph ? (
      <CircuitPanel
        originalGraph={originalGraph}
        targetGraph={targetGraph}
        targetTitle={targetCircuitTitle}
        gateInputMode={gateInputMode}
        onGateInputModeChange={onGateInputModeChange}
        probeInputs={probeInputs}
        onToggleProbeInput={handleToggleProbeInput}
        typeDelays={typeDelays}
        origOverrides={origOverrides}
        targetOverrides={targetOverrides}
        onEditGateDelay={handleChangeInstanceDelay}
      />
    ) : null;

  const timingSection =
    originalGraph && targetGraph ? (
      <TimingPanel
        originalGraph={originalGraph}
        targetGraph={targetGraph}
        targetLabel={targetLabel}
        typeDelays={typeDelays}
        onChangeTypeDelay={handleChangeTypeDelay}
        origOverrides={origOverrides}
        targetOverrides={targetOverrides}
        onChangeInstanceDelay={handleChangeInstanceDelay}
        onResetAllDelays={handleResetAllDelays}
        allowCollapse={layoutMode === 'all'}
      />
    ) : null;

  const kmapSection =
    evalBundle.ok ? (
      <KMapAndExtras
        results={evalBundle.results}
        explicitAnd={submitted.explicitAnd}
        selectedRowIndex={selectedRowIndex}
        onSelectRow={handleSelectRow}
      />
    ) : null;

  return (
    <div className={styles.workspacePanel}>
      {!isQuick && <p className={styles.lead}>{t('boolean.lead')}</p>}

      {/* Sub-navigation bar: Analysis Tabs + Alternative Layout Toggle */}
      <div className={styles.workspaceBar} data-testid="boolean-layout-bar">
        {layoutMode === 'tabs' ? (
          <div className={styles.analysisTabList} role="tablist" aria-label="Analysis views">
            {analysisTabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-testid={`analysis-tab-${tab.id}`}
                  className={[styles.analysisTab, active ? styles.analysisTabActive : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onActiveTabChange(tab.id)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        ) : (
          <span className={styles.metaInline}>
            {layoutMode === 'workbench'
              ? 'Persistent Solver on left · Live Inspector on right'
              : 'All sections stacked vertically'}
          </span>
        )}

        <div className={styles.layoutToggleWrap}>
          <span className={styles.layoutToggleLabel}>{t('boolean.layout.label')}:</span>
          <div className={styles.segmented} role="group" aria-label={t('boolean.layout.label')}>
            {layoutOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={layoutMode === opt.id}
                data-testid={`layout-mode-${opt.id}`}
                className={[styles.segBtn, layoutMode === opt.id ? styles.segBtnActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onLayoutModeChange(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mode 1: Split Tabs (User's suggested focused tabs) */}
      {layoutMode === 'tabs' && (
        <>
          {activeTab === 'solver' && inputCard}
          {!evalBundle.ok ? (
            <section className={[styles.resultCard, styles.resultCardError].join(' ')} role="alert">
              <p className={styles.errorMsg}>{evalBundle.error}</p>
              {evalBundle.hint && <p className={styles.errorHint}>{evalBundle.hint}</p>}
            </section>
          ) : (
            <>
              {inspectBanner}
              {activeTab === 'solver' && resultAndSteps}
              {activeTab === 'truth-table' && truthTableSection}
              {activeTab === 'circuit' && circuitSection}
              {activeTab === 'timing' && timingSection}
              {activeTab === 'kmap' && kmapSection}
            </>
          )}
        </>
      )}

      {/* Mode 2: Split Workbench (Alternative: Solver + Steps on left, sticky tabbed Inspector on right) */}
      {layoutMode === 'workbench' && (
        <>
          {inputCard}
          {!evalBundle.ok ? (
            <section className={[styles.resultCard, styles.resultCardError].join(' ')} role="alert">
              <p className={styles.errorMsg}>{evalBundle.error}</p>
              {evalBundle.hint && <p className={styles.errorHint}>{evalBundle.hint}</p>}
            </section>
          ) : (
            <div className={styles.workbenchGrid} data-testid="boolean-workbench-grid">
              <div className={styles.workbenchCol}>{resultAndSteps}</div>
              <div className={styles.workbenchInspector}>
                <div className={styles.workspaceBar}>
                  <div className={styles.analysisTabList} role="tablist" aria-label="Inspector views">
                    {inspectorTabs.map((tab) => {
                      const active = workbenchTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          className={[styles.analysisTab, active ? styles.analysisTabActive : '']
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => setWorkbenchTab(tab.id)}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {inspectBanner}
                {workbenchTab === 'truth-table' && truthTableSection}
                {workbenchTab === 'circuit' && circuitSection}
                {workbenchTab === 'timing' && timingSection}
                {workbenchTab === 'kmap' && kmapSection}
              </div>
            </div>
          )}
        </>
      )}

      {/* Mode 3: All sections on one page */}
      {layoutMode === 'all' && (
        <>
          {inputCard}
          {!evalBundle.ok ? (
            <section className={[styles.resultCard, styles.resultCardError].join(' ')} role="alert">
              <p className={styles.errorMsg}>{evalBundle.error}</p>
              {evalBundle.hint && <p className={styles.errorHint}>{evalBundle.hint}</p>}
            </section>
          ) : (
            <>
              {resultAndSteps}
              {inspectBanner}
              {truthTableSection}
              {circuitSection}
              {timingSection}
              {kmapSection}
            </>
          )}
        </>
      )}
    </div>
  );
}
