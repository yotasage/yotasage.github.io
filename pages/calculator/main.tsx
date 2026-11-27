import { useCallback, useEffect, useMemo, useState } from 'react';

import GuideView from '../../components/Calculator/GuideView';
import HybridView from '../../components/Calculator/HybridView';
import LayoutsView from '../../components/Calculator/LayoutsView';
import NotebookView from '../../components/Calculator/NotebookView';
import QuickBarView from '../../components/Calculator/QuickBarView';
import type { EvaluatedVariableInfo } from '../../components/Calculator/VariablesPanel';
import PageHead from '../../components/PageHead';
import ExamplesGallery, { type ExampleCardItem } from '../../components/UI/ExamplesGallery';
import PillTabs, { type PillTabItem } from '../../components/UI/PillTabs';
import ToolHeader, { type WorkspaceTab } from '../../components/UI/ToolHeader';
import { type EvalEnv, type EvalResult, evaluateInput } from '../../lib/calc/eval';
import { CALC_EXAMPLES } from '../../lib/calc/examples';
import type { SmartCalcLayoutV1 } from '../../lib/calc/layouts';
import {
  type CalcWorkflowTab,
  clearHistoryStorage,
  clearNotebookStorage,
  clearVariablesStorage,
  DEFAULT_NOTEBOOK_TEXT,
  loadCustomLayouts,
  loadHistory,
  loadNotebookText,
  loadVariables,
  loadWorkflowTab,
  saveCustomLayouts,
  saveHistory,
  saveNotebookText,
  saveVariables,
  saveWorkflowTab,
  type StoredHistoryItem,
  type StoredVariable,
} from '../../lib/calc/storage';
import type { CalcValue } from '../../lib/calc/value';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/Calculator.module.css';

type WorkspaceId = 'calculator' | 'layouts' | 'examples' | 'guide';

function splitValueAndUnit(formatted: string): { numericPart: string; unitPart: string } {
  const trimmed = formatted.trim();
  const degOrPct = trimmed.match(/^(.+?)([°%])$/);
  if (degOrPct) {
    return { numericPart: degOrPct[1], unitPart: degOrPct[2] };
  }
  const spaceIdx = trimmed.lastIndexOf(' ');
  if (spaceIdx === -1) return { numericPart: trimmed, unitPart: '' };
  const tail = trimmed.slice(spaceIdx + 1);
  if (/^[+-]?\d/.test(tail)) return { numericPart: trimmed, unitPart: '' };
  return { numericPart: trimmed.slice(0, spaceIdx), unitPart: tail };
}

export default function SmartCalculatorPage() {
  useDesignSystemPage('#0284c7', '#38bdf8');
  const { t } = useI18n();

  const [workspace, setWorkspace] = useState<WorkspaceId>('calculator');
  const [workflow, setWorkflow] = useState<CalcWorkflowTab>('hybrid');
  const [expr, setExpr] = useState<string>('1 / (2 * pi * 10 kOhm * 100 pF)');
  const [history, setHistory] = useState<StoredHistoryItem[]>([]);
  const [variables, setVariables] = useState<StoredVariable[]>([]);
  const [notebookText, setNotebookText] = useState<string>(DEFAULT_NOTEBOOK_TEXT);
  const [customLayouts, setCustomLayouts] = useState<SmartCalcLayoutV1[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setWorkflow(loadWorkflowTab());
    setHistory(loadHistory());
    setVariables(loadVariables());
    setNotebookText(loadNotebookText());
    setCustomLayouts(loadCustomLayouts());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveWorkflowTab(workflow);
  }, [workflow, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveHistory(history);
  }, [history, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveVariables(variables);
  }, [variables, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveNotebookText(notebookText);
  }, [notebookText, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveCustomLayouts(customLayouts);
  }, [customLayouts, hydrated]);

  // Sequentially evaluate stored variables so dependent variables update live when edited
  const { sharedVars, evaluatedVars } = useMemo(() => {
    const scope: Record<string, CalcValue> = {};
    const infoMap: Record<string, EvaluatedVariableInfo> = {};

    for (const v of variables) {
      try {
        const res = evaluateInput(v.expr, { vars: scope });
        if (res.kind !== 'value') {
          infoMap[v.name] = {
            numericPart: res.text,
            unitPart: '',
            displayText: res.text,
            baseSI: '',
          };
        } else {
          scope[v.name] = res.value;
          const { numericPart, unitPart } = splitValueAndUnit(res.text);
          infoMap[v.name] = {
            value: res.value,
            numericPart,
            unitPart,
            displayText: res.text,
            baseSI: res.baseSI,
          };
        }
      } catch (err) {
        infoMap[v.name] = {
          numericPart: '',
          unitPart: '',
          displayText: '',
          baseSI: '',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return { sharedVars: scope, evaluatedVars: infoMap };
  }, [variables]);

  // Reconstruct numeric CalcValues for history tape so ans / ans1..ansN work after reloads
  const evalEnv = useMemo<EvalEnv>(() => {
    const historyValues: CalcValue[] = [];
    const runningVars: Record<string, CalcValue> = { ...sharedVars };
    let lastAns: CalcValue | undefined;

    for (const item of history) {
      try {
        const res = evaluateInput(item.expr, {
          vars: runningVars,
          ans: lastAns,
          historyValues,
        });
        if (res.kind === 'value') {
          historyValues.push(res.value);
          lastAns = res.value;
          if (res.assignedName && !(res.assignedName in runningVars)) {
            runningVars[res.assignedName] = res.value;
          }
        }
      } catch {
        // Keep history resilient if an earlier variable was deleted
      }
    }

    return {
      vars: sharedVars,
      ans: lastAns,
      historyValues,
    };
  }, [sharedVars, history]);

  const upsertVariable = useCallback((name: string, varExpr: string) => {
    setVariables((prev) => {
      const idx = prev.findIndex((v) => v.name === name);
      if (idx === -1) return [...prev, { name, expr: varExpr }];
      return prev.map((v, i) => (i === idx ? { ...v, expr: varExpr } : v));
    });
  }, []);

  const handleCommit = useCallback(
    (committedExpr: string, result: EvalResult) => {
      if (result.assignedName) {
        const eqIdx = committedExpr.indexOf('=');
        const rhsExpr = eqIdx !== -1 ? committedExpr.slice(eqIdx + 1).trim() : committedExpr;
        if (rhsExpr) upsertVariable(result.assignedName, rhsExpr);
      }

      const item: StoredHistoryItem = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        expr: committedExpr,
        resultText: result.text,
        resultLatex: result.latex,
        baseSI: result.kind === 'value' ? result.baseSI : undefined,
        isSymbolic: result.kind === 'symbolic',
        assignedName: result.assignedName,
        timestamp: Date.now(),
      };
      setHistory((prev) => [...prev, item]);
    },
    [upsertVariable],
  );

  const handleRemoveHistory = useCallback((id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleClearMemory = useCallback(() => {
    setHistory([]);
    clearHistoryStorage();
  }, []);

  const handleDeleteVar = useCallback((name: string) => {
    setVariables((prev) => prev.filter((v) => v.name !== name));
  }, []);

  const handleClearVars = useCallback(() => {
    setVariables([]);
    clearVariablesStorage();
  }, []);

  const handleClearNotebook = useCallback(() => {
    setNotebookText('');
    clearNotebookStorage();
  }, []);

  const handleSaveCustomLayout = useCallback((layout: SmartCalcLayoutV1) => {
    setCustomLayouts((prev) => {
      const idx = prev.findIndex((l) => l.id === layout.id);
      if (idx === -1) return [layout, ...prev];
      return prev.map((l, i) => (i === idx ? layout : l));
    });
  }, []);

  const handleImportCustomLayouts = useCallback((imported: readonly SmartCalcLayoutV1[]) => {
    setCustomLayouts((prev) => {
      const next = [...prev];
      for (const item of imported) {
        const idx = next.findIndex((l) => l.id === item.id);
        if (idx === -1) next.unshift(item);
        else next[idx] = item;
      }
      return next;
    });
  }, []);

  const handleDeleteCustomLayout = useCallback((id: string) => {
    setCustomLayouts((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const handleSendToCalculator = useCallback(
    (payload: string) => {
      setWorkspace('calculator');
      if (payload.includes('\n')) {
        setNotebookText((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n# From Equation Layout\n${payload}` : payload));
        setWorkflow('notebook');
      } else {
        setExpr(payload);
        if (workflow === 'notebook') setWorkflow('hybrid');
      }
    },
    [workflow],
  );

  const handleSelectExample = useCallback((id: string) => {
    const ex = CALC_EXAMPLES.find((p) => p.id === id);
    if (!ex) return;
    if (ex.variables.length > 0) {
      setVariables((prev) => {
        const next = [...prev];
        for (const v of ex.variables) {
          const idx = next.findIndex((item) => item.name === v.name);
          if (idx === -1) next.push({ ...v });
          else next[idx] = { ...v };
        }
        return next;
      });
    }
    setExpr(ex.expr);
    if (ex.notebookText) {
      setNotebookText(ex.notebookText);
    }
    setWorkflow(ex.workflow);
    setWorkspace('calculator');
  }, []);

  const exampleItems: readonly ExampleCardItem[] = useMemo(
    () =>
      CALC_EXAMPLES.map((p) => ({
        id: p.id,
        tag: t(p.tagKey as TranslationKey),
        code: p.code,
        title: t(p.titleKey as TranslationKey),
        description: t(p.descKey as TranslationKey),
      })),
    [t],
  );

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = useMemo(
    () => [
      { id: 'calculator', label: t('calc.workspace.calculator') },
      { id: 'layouts', label: t('calc.workspace.layouts') },
      { id: 'examples', label: t('ex.tab') },
      { id: 'guide', label: t('calc.workspace.guide') },
    ],
    [t],
  );

  const workflowTabs: readonly PillTabItem<CalcWorkflowTab>[] = useMemo(
    () => [
      { id: 'hybrid', label: t('calc.workflow.hybrid') },
      { id: 'notebook', label: t('calc.workflow.notebook') },
      { id: 'quick', label: t('calc.workflow.quick') },
    ],
    [t],
  );

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('calc.pageTitle')}
        description="Unit-aware engineering calculator with SI auto-prefixing, complex phasors, editable variables with Excel copy, symbolic and numerical calculus, and bidirectional equation layouts."
        path="/calculator/main"
        ogImage="/og/home.png"
        ogAlt="yotasage.github.io browser engineering and utility tools overview"
      />

      <ToolHeader<WorkspaceId>
        title={t('calc.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        allowWideView
      />

      <main className={styles.main}>
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'calculator'}
          aria-label={t('calc.workspace.calculator')}
        >
          <div className={styles.topStrip}>
            <p className={styles.lead}>{t('calc.lead')}</p>
            <PillTabs<CalcWorkflowTab>
              items={workflowTabs}
              value={workflow}
              onChange={setWorkflow}
              ariaLabel={t('calc.workflow.aria')}
              size="sm"
            />
          </div>

          {workflow === 'hybrid' && (
            <HybridView
              expr={expr}
              onExprChange={setExpr}
              env={evalEnv}
              history={history}
              variables={variables}
              evaluatedVars={evaluatedVars}
              onCommit={handleCommit}
              onRemoveHistory={handleRemoveHistory}
              onClearMemory={handleClearMemory}
              onAddVar={upsertVariable}
              onUpdateVarExpr={upsertVariable}
              onDeleteVar={handleDeleteVar}
              onClearVars={handleClearVars}
            />
          )}

          {workflow === 'notebook' && (
            <NotebookView
              text={notebookText}
              onChange={setNotebookText}
              sharedVars={sharedVars}
              onClear={handleClearNotebook}
            />
          )}

          {workflow === 'quick' && (
            <QuickBarView
              expr={expr}
              onExprChange={setExpr}
              env={evalEnv}
              history={history}
              onCommit={handleCommit}
              onClearMemory={handleClearMemory}
            />
          )}
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'layouts'}
          aria-label={t('calc.workspace.layouts')}
        >
          <LayoutsView
            customLayouts={customLayouts}
            onSaveCustomLayout={handleSaveCustomLayout}
            onImportCustomLayouts={handleImportCustomLayouts}
            onDeleteCustomLayout={handleDeleteCustomLayout}
            onSendToCalculator={handleSendToCalculator}
          />
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'examples'}
          aria-label={t('ex.tab')}
        >
          <ExamplesGallery
            title={t('ex.calc.title')}
            subtitle={t('ex.calc.lead')}
            items={exampleItems}
            defaultActionLabel={t('ex.calc.action')}
            onSelect={handleSelectExample}
          />
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'guide'}
          aria-label={t('calc.workspace.guide')}
        >
          <GuideView onTryExample={handleSendToCalculator} />
        </section>
      </main>
    </div>
  );
}
