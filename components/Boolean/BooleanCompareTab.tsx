import { useEffect, useMemo, useRef, useState } from 'react';

import {
  compareBooleanSources,
  type ComparePreset,
  type CompareSource,
  type CompareTruthTableSource,
} from '../../lib/boolean/compare';
import { parseBoolean, toLatex } from '../../lib/boolean/parse';
import type { NotationStyle } from '../../lib/boolean/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Boolean.module.css';
import cStyles from '../../styles/BooleanCompare.module.css';
import KatexSpan from '../KatexSpan';
import CompareResultsPanel from './CompareResultsPanel';
import CompareTruthTableEditor from './CompareTruthTableEditor';
import DerivationCheckerView from './DerivationCheckerView';

export type CompareMode = 'pair' | 'chain';
export type CompareSourceKind = 'expression' | 'truth-table';

const QUICK_OPS: readonly { label: string; snippet: string; cursorOffset?: number }[] = [
  { label: 'AND (·)', snippet: ' * ' },
  { label: 'OR (+)', snippet: ' + ' },
  { label: "NOT (')", snippet: "'" },
  { label: '¬()', snippet: '!()', cursorOffset: -1 },
  { label: 'XOR (⊕)', snippet: ' ^ ' },
  { label: 'XNOR', snippet: ' XNOR ' },
  { label: 'NAND', snippet: ' NAND ' },
  { label: 'NOR', snippet: ' NOR ' },
  { label: '( )', snippet: '()', cursorOffset: -1 },
];

const DEFAULT_TT_A: CompareTruthTableSource = {
  kind: 'truth-table',
  variables: ['A', 'B', 'C'],
  values: [0, 0, 0, 1, 0, 1, 1, 1],
  outputName: 'Y',
};

const DEFAULT_TT_B: CompareTruthTableSource = {
  kind: 'truth-table',
  variables: ['A', 'B', 'C'],
  values: [0, 0, 0, 1, 0, 1, 1, 1],
  outputName: 'Y',
};

export interface CompareSeedPayload {
  readonly exprA?: string;
  readonly exprB?: string;
  readonly preset?: ComparePreset;
  readonly seq: number;
}

export interface BooleanCompareTabProps {
  readonly notation: NotationStyle;
  readonly onNotationChange: (next: NotationStyle) => void;
  readonly explicitAnd: boolean;
  readonly solverEquations: readonly string[];
  readonly seedPayload?: CompareSeedPayload | null;
  readonly onOpenInSimplifier: (expr: string) => void;
}

export default function BooleanCompareTab({
  notation,
  onNotationChange,
  explicitAnd,
  solverEquations,
  seedPayload,
  onOpenInSimplifier,
}: BooleanCompareTabProps) {
  const { t } = useI18n();

  const [mode, setMode] = useState<CompareMode>('pair');

  // Pair mode state
  const [kindA, setKindA] = useState<CompareSourceKind>('expression');
  const [kindB, setKindB] = useState<CompareSourceKind>('expression');
  const [exprA, setExprA] = useState<string>("Y = A*B + A'*C + B*C");
  const [exprB, setExprB] = useState<string>("Y = A*B + A'*C");
  const [tableA, setTableA] = useState<CompareTruthTableSource>(DEFAULT_TT_A);
  const [tableB, setTableB] = useState<CompareTruthTableSource>(DEFAULT_TT_B);
  const [focusedSide, setFocusedSide] = useState<'A' | 'B'>('B');
  const [loadedFlash, setLoadedFlash] = useState(false);

  // Chain mode state
  const [chainStartMode, setChainStartMode] = useState<CompareSourceKind>('expression');
  const [chainStartExpr, setChainStartExpr] = useState<string>("Y = !(A + B*C) + A'*C");
  const [chainStartTable, setChainStartTable] = useState<CompareTruthTableSource>(DEFAULT_TT_A);
  const [chainSteps, setChainSteps] = useState<string[]>([
    "A'*(B*C)' + A'*C",
    "A'*(B' * C') + A'*C",
    "A'*B'*C' + A'*C",
  ]);

  const inputARef = useRef<HTMLInputElement | null>(null);
  const inputBRef = useRef<HTMLInputElement | null>(null);

  const seedSeq = seedPayload?.seq ?? 0;
  useEffect(() => {
    if (!seedPayload || seedSeq === 0) return;
    if (seedPayload.preset) {
      const preset = seedPayload.preset;
      setMode(preset.mode);
      if (preset.mode === 'pair') {
        if (preset.sourceA.kind === 'expression') {
          setKindA('expression');
          setExprA(preset.sourceA.expr);
        } else {
          setKindA('truth-table');
          setTableA(preset.sourceA);
        }
        if (preset.sourceB) {
          if (preset.sourceB.kind === 'expression') {
            setKindB('expression');
            setExprB(preset.sourceB.expr);
          } else {
            setKindB('truth-table');
            setTableB(preset.sourceB);
          }
        }
      } else {
        if (preset.sourceA.kind === 'expression') {
          setChainStartMode('expression');
          setChainStartExpr(preset.sourceA.expr);
        } else {
          setChainStartMode('truth-table');
          setChainStartTable(preset.sourceA);
        }
        if (preset.chainSteps) {
          setChainSteps([...preset.chainSteps]);
        }
      }
      return;
    }

    if (seedPayload.exprA !== undefined) {
      setMode('pair');
      setKindA('expression');
      setExprA(seedPayload.exprA);
      if (seedPayload.exprB !== undefined) {
        setKindB('expression');
        setExprB(seedPayload.exprB);
      }
      setChainStartMode('expression');
      setChainStartExpr(seedPayload.exprA);
    }
  }, [seedSeq, seedPayload]);

  const previewA = useMemo(() => {
    if (kindA !== 'expression') return null;
    const trimmed = exprA.trim();
    if (!trimmed) return { ok: true as const, latex: '' };
    try {
      const p = parseBoolean(trimmed);
      return { ok: true as const, latex: toLatex(p.ast, notation, explicitAnd) };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : t('boolean.input.invalidSyntax'),
      };
    }
  }, [kindA, exprA, notation, explicitAnd, t]);

  const previewB = useMemo(() => {
    if (kindB !== 'expression') return null;
    const trimmed = exprB.trim();
    if (!trimmed) return { ok: true as const, latex: '' };
    try {
      const p = parseBoolean(trimmed);
      return { ok: true as const, latex: toLatex(p.ast, notation, explicitAnd) };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : t('boolean.input.invalidSyntax'),
      };
    }
  }, [kindB, exprB, notation, explicitAnd, t]);

  const sourceA: CompareSource = useMemo(
    () =>
      kindA === 'expression'
        ? { kind: 'expression', expr: exprA, label: 'A' }
        : { ...tableA, label: 'A' },
    [kindA, exprA, tableA],
  );

  const sourceB: CompareSource = useMemo(
    () =>
      kindB === 'expression'
        ? { kind: 'expression', expr: exprB, label: 'B' }
        : { ...tableB, label: 'B' },
    [kindB, exprB, tableB],
  );

  const compareResult = useMemo(
    () => compareBooleanSources(sourceA, sourceB, { notation, explicitAnd }),
    [sourceA, sourceB, notation, explicitAnd],
  );

  const handleSwapSides = () => {
    const prevKindA = kindA;
    const prevExprA = exprA;
    const prevTableA = tableA;
    setKindA(kindB);
    setExprA(exprB);
    setTableA(tableB);
    setKindB(prevKindA);
    setExprB(prevExprA);
    setTableB(prevTableA);
  };

  const handleLoadFromSimplifier = () => {
    const firstEq = solverEquations.find((eq) => eq.trim().length > 0)?.trim();
    if (!firstEq) return;
    if (mode === 'pair') {
      setKindA('expression');
      setExprA(firstEq);
    } else {
      setChainStartMode('expression');
      setChainStartExpr(firstEq);
    }
    setLoadedFlash(true);
    window.setTimeout(() => setLoadedFlash(false), 1500);
  };

  const insertPairSnippet = (snippet: string, cursorOffset = 0) => {
    const targetSide =
      focusedSide === 'A' && kindA === 'expression'
        ? 'A'
        : focusedSide === 'B' && kindB === 'expression'
          ? 'B'
          : kindA === 'expression'
            ? 'A'
            : kindB === 'expression'
              ? 'B'
              : null;
    if (!targetSide) return;

    const el = targetSide === 'A' ? inputARef.current : inputBRef.current;
    const cur = targetSide === 'A' ? exprA : exprB;
    const setter = targetSide === 'A' ? setExprA : setExprB;
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    const next = `${cur.slice(0, start)}${snippet}${cur.slice(end)}`;
    setter(next);
    const caret = start + snippet.length + cursorOffset;
    window.requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  const canLoadFromSimplifier = solverEquations.some((eq) => eq.trim().length > 0);

  return (
    <div className={cStyles.compareRoot} data-testid="boolean-compare-workspace">
      <p className={styles.lead}>{t('boolean.compare.lead')}</p>

      {/* Mode Switch + Actions Toolbar */}
      <div className={cStyles.topToolbar}>
        <div className={cStyles.toolbarGroup}>
          <span className={styles.layoutToggleLabel}>{t('boolean.compare.modeLabel')}:</span>
          <div
            className={styles.segmented}
            role="tablist"
            aria-label={t('boolean.compare.modeLabel')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'pair'}
              className={[styles.segBtn, mode === 'pair' ? styles.segBtnActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => setMode('pair')}
              data-testid="compare-mode-pair"
            >
              {t('boolean.compare.mode.pair')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'chain'}
              className={[styles.segBtn, mode === 'chain' ? styles.segBtnActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => setMode('chain')}
              data-testid="compare-mode-chain"
            >
              {t('boolean.compare.mode.chain')}
            </button>
          </div>
        </div>

        <div className={cStyles.toolbarGroup}>
          {mode === 'pair' && (
            <button
              type="button"
              className={[styles.btnGhost, styles.btnSmall].join(' ')}
              onClick={handleSwapSides}
              data-testid="compare-swap-btn"
            >
              {t('boolean.compare.swap')}
            </button>
          )}

          {canLoadFromSimplifier && (
            <button
              type="button"
              className={[styles.btn, styles.btnSmall].join(' ')}
              onClick={handleLoadFromSimplifier}
              data-testid="compare-load-simplifier-btn"
            >
              {loadedFlash
                ? t('boolean.compare.loadedFromSimplifier')
                : t('boolean.compare.loadFromSimplifier')}
            </button>
          )}

          <select
            aria-label={t('boolean.opt.notation')}
            value={notation}
            onChange={(e) => onNotationChange(e.target.value as NotationStyle)}
            className={styles.selectInput}
          >
            <option value="engineering">{t('boolean.opt.notation.engineering')}</option>
            <option value="logic">{t('boolean.opt.notation.logic')}</option>
            <option value="programming">{t('boolean.opt.notation.programming')}</option>
            <option value="verilog">{t('boolean.opt.notation.verilog')}</option>
          </select>
        </div>
      </div>

      {mode === 'pair' ? (
        <>
          {/* Shared Operator Insert Bar (when at least one side is Expression) */}
          {(kindA === 'expression' || kindB === 'expression') && (
            <div
              className={styles.insertToolbar}
              role="group"
              aria-label={t('boolean.input.insertAria')}
            >
              {QUICK_OPS.map((sym) => (
                <button
                  key={sym.label}
                  type="button"
                  className={styles.insertBtn}
                  onClick={() => insertPairSnippet(sym.snippet, sym.cursorOffset ?? 0)}
                >
                  {sym.label}
                </button>
              ))}
            </div>
          )}

          {/* Dual Side A & Side B Input Panels */}
          <div className={cStyles.dualInputGrid}>
            {/* Side A */}
            <section className={cStyles.sideCard} aria-label={t('boolean.compare.sideA')}>
              <div className={cStyles.sideHeader}>
                <div className={cStyles.sideTitleRow}>
                  <span className={[cStyles.sideTag, cStyles.sideTagA].join(' ')}>A</span>
                  <h2 className={cStyles.sideTitle}>{t('boolean.compare.sideA')}</h2>
                </div>
                <div className={styles.segmented} role="group" aria-label={t('boolean.compare.sideA')}>
                  <button
                    type="button"
                    aria-pressed={kindA === 'expression'}
                    className={[styles.segBtn, kindA === 'expression' ? styles.segBtnActive : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setKindA('expression')}
                    data-testid="compare-sideA-expr-mode"
                  >
                    {t('boolean.compare.sourceType.expression')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={kindA === 'truth-table'}
                    className={[styles.segBtn, kindA === 'truth-table' ? styles.segBtnActive : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setKindA('truth-table')}
                    data-testid="compare-sideA-tt-mode"
                  >
                    {t('boolean.compare.sourceType.truthTable')}
                  </button>
                </div>
              </div>

              {kindA === 'expression' ? (
                <>
                  <input
                    ref={inputARef}
                    type="text"
                    value={exprA}
                    onFocus={() => setFocusedSide('A')}
                    onChange={(e) => setExprA(e.target.value)}
                    placeholder={t('boolean.compare.placeholderA')}
                    aria-label={t('boolean.compare.exprAriaA')}
                    className={[styles.exprInput, cStyles.compareExprInput].join(' ')}
                    autoComplete="off"
                    spellCheck={false}
                    data-testid="compare-input-A"
                  />
                  <div className={styles.previewBar} aria-live="polite">
                    {previewA && !previewA.ok ? (
                      <span className={styles.previewErr}>{previewA.error}</span>
                    ) : previewA && previewA.latex ? (
                      <div className={styles.previewMath}>
                        <KatexSpan text={previewA.latex} />
                      </div>
                    ) : (
                      <span className={styles.previewCaption}>
                        {t('boolean.compare.placeholderA')}
                      </span>
                    )}
                    <span className={styles.previewCaption}>{t('boolean.input.preview')}</span>
                  </div>
                  <div className={cStyles.sideFooter}>
                    <button
                      type="button"
                      className={[styles.btnGhost, styles.btnSmall].join(' ')}
                      onClick={() => {
                        setKindB('expression');
                        setExprB(exprA);
                      }}
                    >
                      {t('boolean.compare.copyToB')}
                    </button>
                    <button
                      type="button"
                      className={[styles.btnGhost, styles.btnSmall].join(' ')}
                      onClick={() => setExprA('')}
                      disabled={!exprA}
                    >
                      {t('boolean.compare.clear')}
                    </button>
                  </div>
                </>
              ) : (
                <CompareTruthTableEditor
                  sideId="A"
                  value={tableA}
                  onChange={setTableA}
                  otherExpression={kindB === 'expression' ? exprB : undefined}
                />
              )}
            </section>

            {/* Side B */}
            <section className={cStyles.sideCard} aria-label={t('boolean.compare.sideB')}>
              <div className={cStyles.sideHeader}>
                <div className={cStyles.sideTitleRow}>
                  <span className={[cStyles.sideTag, cStyles.sideTagB].join(' ')}>B</span>
                  <h2 className={cStyles.sideTitle}>{t('boolean.compare.sideB')}</h2>
                </div>
                <div className={styles.segmented} role="group" aria-label={t('boolean.compare.sideB')}>
                  <button
                    type="button"
                    aria-pressed={kindB === 'expression'}
                    className={[styles.segBtn, kindB === 'expression' ? styles.segBtnActive : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setKindB('expression')}
                    data-testid="compare-sideB-expr-mode"
                  >
                    {t('boolean.compare.sourceType.expression')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={kindB === 'truth-table'}
                    className={[styles.segBtn, kindB === 'truth-table' ? styles.segBtnActive : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setKindB('truth-table')}
                    data-testid="compare-sideB-tt-mode"
                  >
                    {t('boolean.compare.sourceType.truthTable')}
                  </button>
                </div>
              </div>

              {kindB === 'expression' ? (
                <>
                  <input
                    ref={inputBRef}
                    type="text"
                    value={exprB}
                    onFocus={() => setFocusedSide('B')}
                    onChange={(e) => setExprB(e.target.value)}
                    placeholder={t('boolean.compare.placeholderB')}
                    aria-label={t('boolean.compare.exprAriaB')}
                    className={[styles.exprInput, cStyles.compareExprInput].join(' ')}
                    autoComplete="off"
                    spellCheck={false}
                    data-testid="compare-input-B"
                  />
                  <div className={styles.previewBar} aria-live="polite">
                    {previewB && !previewB.ok ? (
                      <span className={styles.previewErr}>{previewB.error}</span>
                    ) : previewB && previewB.latex ? (
                      <div className={styles.previewMath}>
                        <KatexSpan text={previewB.latex} />
                      </div>
                    ) : (
                      <span className={styles.previewCaption}>
                        {t('boolean.compare.placeholderB')}
                      </span>
                    )}
                    <span className={styles.previewCaption}>{t('boolean.input.preview')}</span>
                  </div>
                  <div className={cStyles.sideFooter}>
                    {exprB.trim() && (
                      <button
                        type="button"
                        className={[styles.btnGhost, styles.btnSmall].join(' ')}
                        onClick={() => onOpenInSimplifier(exprB)}
                      >
                        {t('boolean.compare.openInSimplifier')}
                      </button>
                    )}
                    <button
                      type="button"
                      className={[styles.btnGhost, styles.btnSmall].join(' ')}
                      onClick={() => setExprB('')}
                      disabled={!exprB}
                    >
                      {t('boolean.compare.clear')}
                    </button>
                  </div>
                </>
              ) : (
                <CompareTruthTableEditor
                  sideId="B"
                  value={tableB}
                  onChange={setTableB}
                  otherExpression={kindA === 'expression' ? exprA : undefined}
                />
              )}
            </section>
          </div>

          {/* Comparison Results */}
          {'error' in compareResult ? (
            <section
              className={[styles.resultCard, styles.resultCardError].join(' ')}
              role="alert"
              data-testid="compare-error"
            >
              <p className={styles.errorMsg}>{compareResult.error}</p>
            </section>
          ) : (
            <CompareResultsPanel
              result={compareResult}
              labelA={t('boolean.compare.sideA')}
              labelB={t('boolean.compare.sideB')}
              onOpenInSimplifier={onOpenInSimplifier}
            />
          )}
        </>
      ) : (
        <DerivationCheckerView
          startMode={chainStartMode}
          onStartModeChange={setChainStartMode}
          startExpr={chainStartExpr}
          onStartExprChange={setChainStartExpr}
          startTable={chainStartTable}
          onStartTableChange={setChainStartTable}
          steps={chainSteps}
          onStepsChange={setChainSteps}
          notation={notation}
          explicitAnd={explicitAnd}
          onOpenInSimplifier={onOpenInSimplifier}
        />
      )}
    </div>
  );
}
