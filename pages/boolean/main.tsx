import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import BooleanCompareTab, { type CompareSeedPayload } from '../../components/Boolean/BooleanCompareTab';
import type { BooleanSubmitOverride } from '../../components/Boolean/BooleanInput';
import BooleanLawsTab, { type TheorySubTab } from '../../components/Boolean/BooleanLawsTab';
import BooleanSolverView, { type BooleanInputMode } from '../../components/Boolean/BooleanSolverView';
import ExamplesTab, { type LoadExamplePayload } from '../../components/Boolean/ExamplesTab';
import PageHead from '../../components/PageHead';
import ToolHeader, { type WorkspaceTab } from '../../components/UI/ToolHeader';
import type { ComparePreset } from '../../lib/boolean/compare';
import type {
  AnalysisTabId,
  GateInputMode,
  NotationStyle,
  SimplifyEffort,
  SimplifyMethod,
  TargetForm,
  WorkspaceLayoutMode,
} from '../../lib/boolean/types';
import { useI18n } from '../../lib/ui/i18n';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/Boolean.module.css';

type WorkspaceId = 'solver' | 'compare' | 'examples' | 'laws';

const DEFAULT_EQUATIONS: readonly string[] = ["Y = A*B + A'*C + B*C"];

export default function BooleanSimplifierPage() {
  useDesignSystemPage('#0d9488', '#2dd4bf');
  const { t } = useI18n();
  const router = useRouter();

  const [workspace, setWorkspace] = useState<WorkspaceId>('solver');
  const [theorySubTab, setTheorySubTab] = useState<TheorySubTab>('overview');
  const [highlightedLawId, setHighlightedLawId] = useState<string | null>(null);
  const [compareSeed, setCompareSeed] = useState<CompareSeedPayload | null>(null);

  const [inputMode, setInputMode] = useState<BooleanInputMode>('expression');
  const [equations, setEquations] = useState<string[]>([...DEFAULT_EQUATIONS]);
  const [method, setMethod] = useState<SimplifyMethod>('heuristic');
  const [effort, setEffort] = useState<SimplifyEffort>('medium');
  const [targetForm, setTargetForm] = useState<TargetForm>('auto');
  const [notation, setNotation] = useState<NotationStyle>('engineering');
  const [explicitAnd, setExplicitAnd] = useState<boolean>(true);
  const [gateInputMode, setGateInputMode] = useState<GateInputMode>('multi');
  const [layoutMode, setLayoutMode] = useState<WorkspaceLayoutMode>('tabs');
  const [activeTab, setActiveTab] = useState<AnalysisTabId>('solver');

  const [submitted, setSubmitted] = useState({
    equations: DEFAULT_EQUATIONS,
    method: 'heuristic' as SimplifyMethod,
    effort: 'medium' as SimplifyEffort,
    targetForm: 'auto' as TargetForm,
    notation: 'engineering' as NotationStyle,
    explicitAnd: true,
    seq: 0,
  });

  useEffect(() => {
    if (!router.isReady) return;
    const qExpr = typeof router.query.expr === 'string' ? router.query.expr.trim() : '';
    if (qExpr) {
      const nextEqs = qExpr
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      if (nextEqs.length > 0) {
        setEquations(nextEqs);
        setSubmitted((prev) => ({ ...prev, equations: nextEqs }));
      }
    }
    const qTab = typeof router.query.tab === 'string' ? router.query.tab.trim().toLowerCase() : '';
    if (qTab === 'compare' || qTab === 'examples' || qTab === 'laws' || qTab === 'solver') {
      setWorkspace(qTab);
    } else if (qTab === 'theory') {
      setWorkspace('laws');
    } else if (qTab === 'gates') {
      setWorkspace('laws');
      setTheorySubTab('gates');
    }
  }, [router.isReady, router.query.expr, router.query.tab]);

  const handleSolve = useCallback(
    (override?: BooleanSubmitOverride) => {
      setSubmitted((prev) => ({
        equations: override?.equations ?? equations,
        method: override?.method ?? method,
        effort: override?.effort ?? effort,
        targetForm: override?.targetForm ?? targetForm,
        notation: override?.notation ?? notation,
        explicitAnd: override?.explicitAnd ?? explicitAnd,
        seq: prev.seq + 1,
      }));
    },
    [equations, method, effort, targetForm, notation, explicitAnd],
  );

  const handleInspectLaw = useCallback((lawId: string) => {
    setHighlightedLawId(lawId);
    setTheorySubTab('overview');
    setWorkspace('laws');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenKMapGuide = useCallback(() => {
    setTheorySubTab('kmap-guide');
    setWorkspace('laws');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleTrySingleExample = useCallback((exampleExpr: string) => {
    const nextEqs = [exampleExpr];
    setEquations(nextEqs);
    setSubmitted((prev) => ({
      ...prev,
      equations: nextEqs,
      seq: prev.seq + 1,
    }));
    setInputMode('expression');
    setActiveTab('solver');
    setWorkspace('solver');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenKMapExample = useCallback((exampleExpr: string) => {
    const nextEqs = [exampleExpr];
    setEquations(nextEqs);
    setSubmitted((prev) => ({
      ...prev,
      equations: nextEqs,
      seq: prev.seq + 1,
    }));
    setInputMode('expression');
    setActiveTab('kmap');
    setWorkspace('solver');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleLoadCuratedExample = useCallback((payload: LoadExamplePayload) => {
    const nextEqs = [...payload.equations];
    const nextMethod = payload.method ?? method;
    const nextEffort = payload.effort ?? effort;
    const nextForm = payload.targetForm ?? targetForm;
    setEquations(nextEqs);
    setMethod(nextMethod);
    setEffort(nextEffort);
    setTargetForm(nextForm);
    if (payload.gateInputMode) setGateInputMode(payload.gateInputMode);
    setSubmitted((prev) => ({
      ...prev,
      equations: nextEqs,
      method: nextMethod,
      effort: nextEffort,
      targetForm: nextForm,
      seq: prev.seq + 1,
    }));
    setInputMode('expression');
    setActiveTab(payload.openTab ?? 'solver');
    setWorkspace('solver');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [method, effort, targetForm]);

  const handleCompareFromSolver = useCallback((origExpr: string, simplifiedExpr: string) => {
    setCompareSeed((prev) => ({
      exprA: origExpr,
      exprB: simplifiedExpr,
      seq: (prev?.seq ?? 0) + 1,
    }));
    setWorkspace('compare');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleLoadComparePreset = useCallback((preset: ComparePreset) => {
    setCompareSeed((prev) => ({
      preset,
      seq: (prev?.seq ?? 0) + 1,
    }));
    setWorkspace('compare');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = useMemo(
    () => [
      { id: 'solver', label: t('boolean.workspace.solver') },
      { id: 'compare', label: t('boolean.workspace.compare') },
      { id: 'examples', label: t('boolean.workspace.examples') },
      { id: 'laws', label: t('boolean.workspace.laws') },
    ],
    [t],
  );

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('boolean.pageTitle')}
        description="Step-by-step Boolean expression simplifier with algebraic laws, Quine-McCluskey minimization, heuristic search, multi-equation truth tables, TikZ/IEEE logic circuits, Karnaugh maps, WaveDrom timing diagrams, logic gate reference, and curated examples."
        path="/boolean/main"
        ogImage="/og/home.png"
        ogAlt="yotasage.github.io Boolean expression simplifier with circuits, truth tables, and timing diagrams"
      />

      <ToolHeader<WorkspaceId>
        title={t('boolean.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode
        allowWideView
      />

      <main className={styles.main}>
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'solver'}
          aria-label={t('boolean.workspace.solver')}
        >
          <BooleanSolverView
            inputMode={inputMode}
            onInputModeChange={setInputMode}
            equations={equations}
            onEquationsChange={setEquations}
            method={method}
            onMethodChange={setMethod}
            effort={effort}
            onEffortChange={setEffort}
            targetForm={targetForm}
            onTargetFormChange={setTargetForm}
            notation={notation}
            onNotationChange={setNotation}
            explicitAnd={explicitAnd}
            onExplicitAndChange={setExplicitAnd}
            gateInputMode={gateInputMode}
            onGateInputModeChange={setGateInputMode}
            layoutMode={layoutMode}
            onLayoutModeChange={setLayoutMode}
            activeTab={activeTab}
            onActiveTabChange={setActiveTab}
            submitted={submitted}
            onSolve={handleSolve}
            onInspectLaw={handleInspectLaw}
            onOpenKMapGuide={handleOpenKMapGuide}
            onCompareWork={handleCompareFromSolver}
          />
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'compare'}
          aria-label={t('boolean.workspace.compare')}
        >
          <BooleanCompareTab
            notation={notation}
            onNotationChange={setNotation}
            explicitAnd={explicitAnd}
            solverEquations={equations}
            seedPayload={compareSeed}
            onOpenInSimplifier={handleTrySingleExample}
          />
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'examples'}
          aria-label={t('boolean.workspace.examples')}
        >
          <ExamplesTab
            onLoadExample={handleLoadCuratedExample}
            onLoadComparePreset={handleLoadComparePreset}
          />
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'laws'}
          aria-label={t('boolean.workspace.laws')}
        >
          <BooleanLawsTab
            highlightedLawId={highlightedLawId}
            activeSubTab={theorySubTab}
            onSubTabChange={setTheorySubTab}
            onTryExample={handleTrySingleExample}
            onOpenKMapExample={handleOpenKMapExample}
          />
        </section>
      </main>
    </div>
  );
}
