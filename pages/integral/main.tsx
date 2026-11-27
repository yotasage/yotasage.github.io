import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import IdentitiesTab from '../../components/Calculus/IdentitiesTab';
import IntegralSolverView from '../../components/Calculus/IntegralSolverView';
import PageHead from '../../components/PageHead';
import ExamplesGallery, { type ExampleCardItem } from '../../components/UI/ExamplesGallery';
import ToolHeader, { type WorkspaceTab } from '../../components/UI/ToolHeader';
import { INTEGRAL_EXAMPLES } from '../../lib/calculus/examples';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/Calculus.module.css';

type WorkspaceId = 'solver' | 'examples' | 'identities';

const DEFAULT_EXPR = 'x * exp(x^2)';

export default function IntegralSolverPage() {
  useDesignSystemPage('#4f46e5', '#818cf8');
  const { t } = useI18n();
  const router = useRouter();

  const [workspace, setWorkspace] = useState<WorkspaceId>('solver');
  const [highlightedRuleId, setHighlightedRuleId] = useState<string | null>(null);

  const [expr, setExpr] = useState<string>(DEFAULT_EXPR);
  const [variable, setVariable] = useState<string>('x');
  const [isDefinite, setIsDefinite] = useState<boolean>(false);
  const [lower, setLower] = useState<string>('0');
  const [upper, setUpper] = useState<string>('pi');

  const [submitted, setSubmitted] = useState({
    expr: DEFAULT_EXPR,
    variable: 'x',
    definite: false,
    lower: '0',
    upper: 'pi',
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
      setIsDefinite(false);
      setSubmitted((prev) => ({
        expr: qExpr,
        variable: nextVar,
        definite: false,
        lower: '0',
        upper: 'pi',
        seq: prev.seq,
      }));
    }
  }, [router.isReady, router.query.expr, router.query.var]);

  const handleSolve = useCallback(
    (next?: {
      expr: string;
      variable?: string;
      definite?: boolean;
      lower?: string;
      upper?: string;
    }) => {
      setSubmitted((prev) => ({
        expr: next?.expr ?? expr,
        variable: next?.variable ?? variable,
        definite: next?.definite ?? isDefinite,
        lower: next?.lower ?? lower,
        upper: next?.upper ?? upper,
        seq: prev.seq + 1,
      }));
    },
    [expr, variable, isDefinite, lower, upper],
  );

  const handleInspectRule = useCallback((ruleId: string) => {
    setHighlightedRuleId(ruleId);
    setWorkspace('identities');
  }, []);

  const handleTryIdentityExample = useCallback((exampleExpr: string) => {
    setExpr(exampleExpr);
    setVariable('x');
    setIsDefinite(false);
    setSubmitted((prev) => ({
      expr: exampleExpr,
      variable: 'x',
      definite: false,
      lower: '0',
      upper: 'pi',
      seq: prev.seq + 1,
    }));
    setWorkspace('solver');
  }, []);

  const handleSelectExample = useCallback((id: string) => {
    const ex = INTEGRAL_EXAMPLES.find((p) => p.id === id);
    if (!ex) return;
    setExpr(ex.expr);
    setVariable(ex.variable);
    setIsDefinite(ex.definite);
    if (ex.lower !== undefined) setLower(ex.lower);
    if (ex.upper !== undefined) setUpper(ex.upper);
    setSubmitted((prev) => ({
      expr: ex.expr,
      variable: ex.variable,
      definite: ex.definite,
      lower: ex.lower ?? '0',
      upper: ex.upper ?? 'pi',
      seq: prev.seq + 1,
    }));
    setWorkspace('solver');
  }, []);

  const exampleItems: readonly ExampleCardItem[] = useMemo(
    () =>
      INTEGRAL_EXAMPLES.map((p) => ({
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
        title={t('calculus.integral.pageTitle')}
        description="Step-by-step symbolic and numerical integral solver with u-substitution, integration by parts, trig identities, partial fractions, definite FTC evaluation, configurable step layouts, teaching mode theory, and common calculus identities."
        path="/integral/main"
        ogImage="/og/home.png"
        ogAlt="yotasage.github.io Integral solver with step-by-step derivations"
      />

      <ToolHeader<WorkspaceId>
        title={t('calculus.integral.title')}
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
          <IntegralSolverView
            expr={expr}
            onExprChange={setExpr}
            variable={variable}
            onVariableChange={setVariable}
            isDefinite={isDefinite}
            onDefiniteChange={setIsDefinite}
            lower={lower}
            onLowerChange={setLower}
            upper={upper}
            onUpperChange={setUpper}
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
            title={t('ex.int.title')}
            subtitle={t('ex.int.lead')}
            items={exampleItems}
            defaultActionLabel={t('ex.int.action')}
            onSelect={handleSelectExample}
          />
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'identities'}
          aria-label={t('calculus.workspace.identities')}
        >
          <IdentitiesTab
            activeSolver="integral"
            highlightedRuleId={highlightedRuleId}
            onTryExample={handleTryIdentityExample}
          />
        </section>
      </main>
    </div>
  );
}
