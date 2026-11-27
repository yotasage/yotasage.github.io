import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import DerivativeSolverView from '../../components/Calculus/DerivativeSolverView';
import IdentitiesTab from '../../components/Calculus/IdentitiesTab';
import PageHead from '../../components/PageHead';
import ExamplesGallery, { type ExampleCardItem } from '../../components/UI/ExamplesGallery';
import ToolHeader, { type WorkspaceTab } from '../../components/UI/ToolHeader';
import { DERIVATIVE_EXAMPLES } from '../../lib/calculus/examples';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/Calculus.module.css';

type WorkspaceId = 'solver' | 'examples' | 'identities';

const DEFAULT_EXPR = 'x^2 * sin(3x)';

export default function DerivativeSolverPage() {
  useDesignSystemPage('#ea580c', '#fb923c');
  const { t } = useI18n();
  const router = useRouter();

  const [workspace, setWorkspace] = useState<WorkspaceId>('solver');
  const [highlightedRuleId, setHighlightedRuleId] = useState<string | null>(null);

  const [expr, setExpr] = useState<string>(DEFAULT_EXPR);
  const [variable, setVariable] = useState<string>('x');
  const [order, setOrder] = useState<number>(1);
  const [evaluateAt, setEvaluateAt] = useState<string>('');

  const [submitted, setSubmitted] = useState({
    expr: DEFAULT_EXPR,
    variable: 'x',
    order: 1,
    evaluateAt: '',
    seq: 0,
  });

  useEffect(() => {
    if (!router.isReady) return;
    const qExpr = typeof router.query.expr === 'string' ? router.query.expr.trim() : '';
    const qVar = typeof router.query.var === 'string' ? router.query.var.trim() : '';
    if (qExpr) {
      const nextVar = qVar || 'x';
      setExpr(qExpr);
      setVariable(nextVar);
      setSubmitted((prev) => ({
        expr: qExpr,
        variable: nextVar,
        order: 1,
        evaluateAt: '',
        seq: prev.seq,
      }));
    }
  }, [router.isReady, router.query.expr, router.query.var]);

  const handleSolve = useCallback(
    (next?: { expr: string; variable?: string; order?: number; evaluateAt?: string }) => {
      setSubmitted((prev) => ({
        expr: next?.expr ?? expr,
        variable: next?.variable ?? variable,
        order: next?.order ?? order,
        evaluateAt: next?.evaluateAt ?? evaluateAt,
        seq: prev.seq + 1,
      }));
    },
    [expr, variable, order, evaluateAt],
  );

  const handleInspectRule = useCallback((ruleId: string) => {
    setHighlightedRuleId(ruleId);
    setWorkspace('identities');
  }, []);

  const handleTryIdentityExample = useCallback((exampleExpr: string) => {
    setExpr(exampleExpr);
    setVariable('x');
    setOrder(1);
    setEvaluateAt('');
    setSubmitted((prev) => ({
      expr: exampleExpr,
      variable: 'x',
      order: 1,
      evaluateAt: '',
      seq: prev.seq + 1,
    }));
    setWorkspace('solver');
  }, []);

  const handleSelectExample = useCallback((id: string) => {
    const ex = DERIVATIVE_EXAMPLES.find((p) => p.id === id);
    if (!ex) return;
    setExpr(ex.expr);
    setVariable(ex.variable);
    setOrder(ex.order);
    setEvaluateAt(ex.evaluateAt);
    setSubmitted((prev) => ({
      expr: ex.expr,
      variable: ex.variable,
      order: ex.order,
      evaluateAt: ex.evaluateAt,
      seq: prev.seq + 1,
    }));
    setWorkspace('solver');
  }, []);

  const exampleItems: readonly ExampleCardItem[] = useMemo(
    () =>
      DERIVATIVE_EXAMPLES.map((p) => ({
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
      { id: 'solver', label: t('calculus.workspace.solver') },
      { id: 'examples', label: t('ex.tab') },
      { id: 'identities', label: t('calculus.workspace.identities') },
    ],
    [t],
  );

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('calculus.derivative.pageTitle')}
        description="Step-by-step symbolic derivative solver with chain, product, quotient, and logarithmic rules, higher orders, tangent lines, configurable step layouts, teaching mode theory, and common calculus identities."
        path="/derivative/main"
        ogImage="/og/home.png"
        ogAlt="yotasage.github.io Derivative solver with step-by-step derivations"
      />

      <ToolHeader<WorkspaceId>
        title={t('calculus.derivative.title')}
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
          aria-label={t('calculus.workspace.solver')}
        >
          <DerivativeSolverView
            expr={expr}
            onExprChange={setExpr}
            variable={variable}
            onVariableChange={setVariable}
            order={order}
            onOrderChange={setOrder}
            evaluateAt={evaluateAt}
            onEvaluateAtChange={setEvaluateAt}
            submitted={submitted}
            onSolve={handleSolve}
            onInspectRule={handleInspectRule}
          />
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'examples'}
          aria-label={t('ex.tab')}
        >
          <ExamplesGallery
            title={t('ex.deriv.title')}
            subtitle={t('ex.deriv.lead')}
            items={exampleItems}
            defaultActionLabel={t('ex.deriv.action')}
            onSelect={handleSelectExample}
          />
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'identities'}
          aria-label={t('calculus.workspace.identities')}
        >
          <IdentitiesTab
            activeSolver="derivative"
            highlightedRuleId={highlightedRuleId}
            onTryExample={handleTryIdentityExample}
          />
        </section>
      </main>
    </div>
  );
}
