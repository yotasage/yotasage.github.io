import { useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_GATE_DELAYS } from '../../lib/boolean/laws';
import { getGateDelayNs, simulateCircuitTiming } from '../../lib/boolean/timing';
import type {
  CircuitGraph,
  DffConfig,
  GateDelayMap,
  GateType,
  InstanceDelayMap,
  SignalTrace,
  TimingSimulationResult,
} from '../../lib/boolean/types';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import styles from '../../styles/Boolean.module.css';
import dStyles from '../../styles/BooleanDiagrams.module.css';

type TimingViewTarget = 'simp' | 'orig' | 'both';
type SignalPreset = 'io' | 'all' | 'custom';

const GATE_TYPES: readonly GateType[] = ['NOT', 'AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR'];

export interface TimingPanelProps {
  readonly originalGraph: CircuitGraph;
  readonly targetGraph: CircuitGraph;
  readonly targetLabel: string;
  readonly typeDelays: GateDelayMap;
  readonly onChangeTypeDelay: (gateType: GateType, delayNs: number) => void;
  readonly origOverrides: InstanceDelayMap;
  readonly targetOverrides: InstanceDelayMap;
  readonly onChangeInstanceDelay: (which: 'orig' | 'target', gateId: string, delayNs: number | null) => void;
  readonly onResetAllDelays: () => void;
  readonly onZeroAllDelays: () => void;
  readonly allowCollapse?: boolean;
}

function WaveDromCanvas({
  sim,
  visibleTraces,
  title,
}: {
  sim: TimingSimulationResult;
  visibleTraces: readonly SignalTrace[];
  title: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverNs, setHoverNs] = useState<number | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [showJsonCode, setShowJsonCode] = useState(false);
  const { t } = useI18n();

  const labelW = 112;
  const chartW = 720;
  const padRight = 24;
  const rowH = 38;
  const topH = 28;
  const botH = 24;
  const totalW = labelW + chartW + padRight;
  const totalH = topH + Math.max(1, visibleTraces.length) * rowH + botH;

  const toX = (ns: number) => labelW + (ns / Math.max(1, sim.totalDurationNs)) * chartW;

  const roleStroke = (role: SignalTrace['role']) => {
    switch (role) {
      case 'clock':
        return '#0284c7';
      case 'input':
        return '#2563eb';
      case 'reg-input':
        return '#7c3aed';
      case 'internal':
        return '#d97706';
      case 'output':
        return '#059669';
      case 'reg-output':
        return '#0d9488';
    }
  };

  const jsonString = useMemo(() => JSON.stringify(sim.waveDromJson, null, 2), [sim.waveDromJson]);

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopiedJson(true);
      window.setTimeout(() => setCopiedJson(false), 1600);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadJson = () => {
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-wavedrom.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSvg = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const serialized = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-timing.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const gridLines: number[] = [];
  for (let ns = 0; ns <= sim.totalDurationNs; ns += sim.stepDurationNs) {
    gridLines.push(ns);
  }

  return (
    <div className={dStyles.subPane}>
      <div className={dStyles.subPaneHead}>
        <div>
          <h3 className={dStyles.subPaneTitle}>{title}</h3>
          <span className={styles.metaInline}>
            <span>{t('boolean.circuit.criticalPath', { delay: sim.criticalPathNs })}</span>
            <span className={styles.metaDot} aria-hidden="true">
              ·
            </span>
            <span className={sim.totalGlitches > 0 ? styles.verifyBad : styles.verifyOk}>
              {sim.totalGlitches > 0
                ? t('boolean.timing.glitches', { count: sim.totalGlitches })
                : t('boolean.timing.noGlitches')}
            </span>
            {sim.dffAnalysis.enabled && (
              <>
                <span className={styles.metaDot} aria-hidden="true">
                  ·
                </span>
                <span className={sim.dffAnalysis.setupViolation ? dStyles.slackBad : dStyles.slackGood}>
                  {sim.dffAnalysis.setupViolation
                    ? t('boolean.timing.slackFail', {
                        slack: sim.dffAnalysis.slackNs,
                        minPeriod: sim.dffAnalysis.minClockPeriodNs,
                      })
                    : t('boolean.timing.slackOk', {
                        slack: sim.dffAnalysis.slackNs,
                        fmax: sim.dffAnalysis.fMaxMHz,
                      })}
                </span>
              </>
            )}
          </span>
        </div>

        <div className={styles.btnRow}>
          <button
            type="button"
            className={[styles.btn, styles.btnSmall].join(' ')}
            onClick={handleCopyJson}
          >
            {copiedJson ? t('boolean.result.copied') : t('boolean.timing.copyJson')}
          </button>
          <button
            type="button"
            className={[styles.btn, styles.btnSmall].join(' ')}
            onClick={handleDownloadJson}
          >
            {t('boolean.timing.downloadJson')}
          </button>
          <button
            type="button"
            className={[styles.btn, styles.btnSmall].join(' ')}
            onClick={handleDownloadSvg}
          >
            {t('boolean.timing.downloadSvg')}
          </button>
          <button
            type="button"
            aria-expanded={showJsonCode}
            className={[styles.btnGhost, styles.btnSmall].join(' ')}
            onClick={() => setShowJsonCode((v) => !v)}
          >
            {t('boolean.timing.toggleCode')}
          </button>
        </div>
      </div>

      <div className={dStyles.waveStage}>
        <svg
          ref={svgRef}
          className={dStyles.waveSvg}
          viewBox={`0 0 ${totalW} ${totalH}`}
          role="img"
          aria-label={t('boolean.timing.diagramAria', { title })}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const svgX = ((e.clientX - rect.left) / rect.width) * totalW;
            if (svgX >= labelW && svgX <= labelW + chartW) {
              const ns = Math.round(((svgX - labelW) / chartW) * sim.totalDurationNs);
              setHoverNs(ns);
            } else {
              setHoverNs(null);
            }
          }}
          onMouseLeave={() => setHoverNs(null)}
        >
          <defs>
            <pattern id="wave-hatch-x" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="#dc2626" strokeWidth="1.5" opacity="0.65" />
            </pattern>
          </defs>

          {/* Vertical step / clock edge gridlines */}
          {gridLines.map((ns) => {
            const gx = toX(ns);
            return (
              <g key={ns}>
                <line
                  x1={gx}
                  y1={topH - 6}
                  x2={gx}
                  y2={totalH - botH}
                  stroke="var(--ds-border-strong)"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
                <text
                  x={gx}
                  y={totalH - 6}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--ds-ink-3)"
                  fontFamily="var(--ds-font-mono)"
                >
                  {ns}ns
                </text>
              </g>
            );
          })}

          {/* Signal lanes */}
          {visibleTraces.map((tr, rowIdx) => {
            const yTop = topH + rowIdx * rowH + 6;
            const yBot = topH + rowIdx * rowH + rowH - 8;
            const yMid = (yTop + yBot) / 2;
            const color = roleStroke(tr.role);

            // Build WaveDrom-style crisp orthogonal polyline
            const pathParts: string[] = [];
            let prevY: number | null = null;

            for (const seg of tr.segments) {
              const x1 = toX(seg.startNs);
              const x2 = toX(seg.endNs);
              if (seg.value === 'x') {
                prevY = null;
                continue;
              }
              const y = seg.value === 1 ? yTop : yBot;
              if (prevY === null) {
                pathParts.push(`M ${x1} ${y} L ${x2} ${y}`);
              } else if (prevY !== y) {
                pathParts.push(`L ${x1} ${y} L ${x2} ${y}`);
              } else {
                pathParts.push(`L ${x2} ${y}`);
              }
              prevY = y;
            }

            return (
              <g key={tr.id}>
                {/* Subtle alternating lane band */}
                {rowIdx % 2 === 1 && (
                  <rect
                    x={0}
                    y={topH + rowIdx * rowH}
                    width={totalW}
                    height={rowH}
                    fill="var(--ds-well)"
                    opacity={0.45}
                  />
                )}
                <text
                  x={labelW - 10}
                  y={yMid + 4}
                  textAnchor="end"
                  fontSize="11.5"
                  fontWeight={tr.role === 'output' || tr.role === 'reg-output' ? 700 : 580}
                  fill="var(--ds-ink)"
                  fontFamily="var(--ds-font-mono)"
                >
                  {tr.label}
                </text>
                {/* Uncertain 'x' (setup violation) hatched boxes & glitch highlights */}
                {tr.segments.map((seg, sIdx) => {
                  const x1 = toX(seg.startNs);
                  const x2 = toX(seg.endNs);
                  if (seg.value === 'x') {
                    return (
                      <rect
                        key={sIdx}
                        x={x1}
                        y={yTop}
                        width={Math.max(2, x2 - x1)}
                        height={yBot - yTop}
                        fill="url(#wave-hatch-x)"
                        stroke="#dc2626"
                        strokeWidth={1.3}
                      />
                    );
                  }
                  if (seg.isGlitch) {
                    return (
                      <rect
                        key={sIdx}
                        x={x1}
                        y={yTop - 3}
                        width={Math.max(4, x2 - x1)}
                        height={yBot - yTop + 6}
                        fill="#dc2626"
                        opacity={0.22}
                        stroke="#dc2626"
                        strokeWidth={1}
                      />
                    );
                  }
                  return null;
                })}

                <path
                  d={pathParts.join(' ')}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinejoin="miter"
                />
              </g>
            );
          })}

          {/* Interactive hover cursor */}
          {hoverNs !== null && (
            <g pointerEvents="none">
              <line
                x1={toX(hoverNs)}
                y1={topH - 8}
                x2={toX(hoverNs)}
                y2={totalH - botH}
                stroke="var(--ds-accent)"
                strokeWidth={1.3}
              />
              <rect
                x={Math.min(toX(hoverNs) + 4, totalW - 58)}
                y={4}
                width={52}
                height={18}
                rx={3}
                fill="var(--ds-accent)"
              />
              <text
                x={Math.min(toX(hoverNs) + 30, totalW - 32)}
                y={16}
                textAnchor="middle"
                fontSize="10"
                fontWeight={700}
                fill="var(--ds-accent-ink)"
                fontFamily="var(--ds-font-mono)"
              >
                {hoverNs} ns
              </text>
            </g>
          )}
        </svg>
      </div>

      {showJsonCode && (
        <pre className={dStyles.codeBlock} data-testid="wavedrom-json-code">
          <code>{jsonString}</code>
        </pre>
      )}
    </div>
  );
}

export default function TimingPanel({
  originalGraph,
  targetGraph,
  targetLabel,
  typeDelays,
  onChangeTypeDelay,
  origOverrides,
  targetOverrides,
  onChangeInstanceDelay,
  onResetAllDelays,
  onZeroAllDelays,
  allowCollapse = false,
}: TimingPanelProps) {
  const { t } = useI18n();
  const { mode } = useExperienceMode();
  const isQuick = mode === 'quick';
  const [visible, setVisible] = useState(true);
  const [viewTarget, setViewTarget] = useState<TimingViewTarget>('both');
  const [signalPreset, setSignalPreset] = useState<SignalPreset>('io');

  const [dff, setDff] = useState<DffConfig>({
    enabled: false,
    clockPeriodNs: 50,
    tClkToQNs: 4,
    tSetupNs: 3,
  });

  // Track custom visible signal IDs per circuit (supports multiple outputs)
  const makeDefaultIds = (g: CircuitGraph, dffOn: boolean) => {
    const s = new Set<string>();
    if (dffOn) s.add('CLK');
    for (const v of g.variables) {
      s.add(v);
      if (dffOn) s.add(`${v}_q`);
    }
    for (const outName of g.outputNames) {
      s.add(outName);
      if (dffOn) s.add(`${outName}_reg`);
    }
    return s;
  };

  const [origSelected, setOrigSelected] = useState<Set<string>>(() =>
    makeDefaultIds(originalGraph, dff.enabled),
  );
  const [targetSelected, setTargetSelected] = useState<Set<string>>(() =>
    makeDefaultIds(targetGraph, dff.enabled),
  );

  const origKey = `${originalGraph.variables.join(',')}|${originalGraph.outputNames.join(',')}|${originalGraph.internals.map((i) => i.id).join(',')}|${dff.enabled}`;
  const targetKey = `${targetGraph.variables.join(',')}|${targetGraph.outputNames.join(',')}|${targetGraph.internals.map((i) => i.id).join(',')}|${dff.enabled}`;

  useEffect(() => {
    setOrigSelected(makeDefaultIds(originalGraph, dff.enabled));
  }, [origKey]);

  useEffect(() => {
    setTargetSelected(makeDefaultIds(targetGraph, dff.enabled));
  }, [targetKey]);

  const computeVisibleIds = (
    g: CircuitGraph,
    customSet: ReadonlySet<string>,
  ): string[] | undefined => {
    if (signalPreset === 'all') return undefined;
    if (signalPreset === 'io') return [...makeDefaultIds(g, dff.enabled)];
    return [...customSet];
  };

  const origSim = useMemo(
    () =>
      simulateCircuitTiming(
        originalGraph,
        typeDelays,
        origOverrides,
        dff,
        computeVisibleIds(originalGraph, origSelected),
      ),
    [originalGraph, typeDelays, origOverrides, dff, signalPreset, origSelected],
  );

  const targetSim = useMemo(
    () =>
      simulateCircuitTiming(
        targetGraph,
        typeDelays,
        targetOverrides,
        dff,
        computeVisibleIds(targetGraph, targetSelected),
      ),
    [targetGraph, typeDelays, targetOverrides, dff, signalPreset, targetSelected],
  );

  const filterTraces = (sim: TimingSimulationResult, g: CircuitGraph, customSet: ReadonlySet<string>) => {
    if (signalPreset === 'all') return sim.traces;
    const allowed = signalPreset === 'io' ? makeDefaultIds(g, dff.enabled) : customSet;
    return sim.traces.filter((tr) => allowed.has(tr.id));
  };

  const toggleId = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const origGates = originalGraph.nodes.filter((n) => n.kind === 'gate' && n.gateType);
  const targetGates = targetGraph.nodes.filter((n) => n.kind === 'gate' && n.gateType);
  const activeGatesForOverride = viewTarget === 'orig' ? origGates : targetGates;
  const activeWhich: 'orig' | 'target' = viewTarget === 'orig' ? 'orig' : 'target';
  const activeOverrides = activeWhich === 'orig' ? origOverrides : targetOverrides;

  const hasCustomDelays =
    Object.keys(origOverrides).length > 0 ||
    Object.keys(targetOverrides).length > 0 ||
    GATE_TYPES.some((gt) => typeDelays[gt] !== DEFAULT_GATE_DELAYS[gt]);

  const allDelaysZero =
    Object.keys(origOverrides).length === 0 &&
    Object.keys(targetOverrides).length === 0 &&
    GATE_TYPES.every((gt) => typeDelays[gt] === 0);

  return (
    <section className={dStyles.sectionCard} aria-label={t('boolean.timing.title')}>
      <div className={dStyles.sectionToolbar}>
        <div className={styles.stepsTitleGroup}>
          <h2 className={styles.cardTitle}>{t('boolean.timing.title')}</h2>
          <span className={styles.metaInline}>
            {t('boolean.timing.compareSummary', {
              origLabel: t('boolean.timing.target.orig'),
              origDelay: origSim.criticalPathNs,
              targetLabel,
              targetDelay: targetSim.criticalPathNs,
            })}
          </span>
        </div>

        <div className={styles.stepsControls}>
          {visible && (
            <>
              <div className={styles.segmented} role="group" aria-label={t('boolean.timing.circuitAria')}>
                {(['both', 'orig', 'simp'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={viewTarget === mode}
                    className={[styles.segBtn, viewTarget === mode ? styles.segBtnActive : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setViewTarget(mode)}
                  >
                    {t(`boolean.timing.target.${mode}`)}
                  </button>
                ))}
              </div>

              <div className={styles.segmented} role="group" aria-label={t('boolean.timing.signals')}>
                {(['io', 'all', 'custom'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={signalPreset === p}
                    className={[styles.segBtn, signalPreset === p ? styles.segBtnActive : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setSignalPreset(p)}
                  >
                    {t(`boolean.tt.preset.${p}`)}
                  </button>
                ))}
              </div>

              {signalPreset !== 'io' && (
                <button
                  type="button"
                  className={[styles.btnGhost, styles.btnSmall].join(' ')}
                  onClick={() => {
                    setSignalPreset('io');
                    setOrigSelected(makeDefaultIds(originalGraph, dff.enabled));
                    setTargetSelected(makeDefaultIds(targetGraph, dff.enabled));
                  }}
                >
                  {t('boolean.timing.resetSignals')}
                </button>
              )}
            </>
          )}

          {allowCollapse && (
            <button
              type="button"
              aria-expanded={visible}
              className={[styles.btn, styles.btnSmall].join(' ')}
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? t('boolean.timing.hide') : t('boolean.timing.show')}
            </button>
          )}
        </div>
      </div>

      {visible && (
        <div className={dStyles.sectionBody}>
          {/* Delay configuration: Circuit-wide gate delays + per-instance overrides */}
          <div className={dStyles.delayControlsGrid}>
            <div className={dStyles.delayBox}>
              <div className={dStyles.subPaneHead}>
                <h3 className={dStyles.delayBoxTitle}>{t('boolean.timing.gateDelays')}</h3>
                <div className={styles.btnRow}>
                  <button
                    type="button"
                    data-testid="timing-zero-delays-btn"
                    disabled={allDelaysZero}
                    className={[styles.btn, styles.btnSmall].join(' ')}
                    onClick={onZeroAllDelays}
                  >
                    {t('boolean.timing.zeroDelays')}
                  </button>
                  {hasCustomDelays && (
                    <button
                      type="button"
                      className={[styles.btnGhost, styles.btnSmall].join(' ')}
                      onClick={onResetAllDelays}
                    >
                      {t('boolean.timing.resetDelays')}
                    </button>
                  )}
                </div>
              </div>
              <div className={dStyles.delayInputsRow}>
                {GATE_TYPES.map((gt) => (
                  <label key={gt} className={dStyles.delayField}>
                    <span>{gt}</span>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      step={1}
                      aria-label={t('boolean.timing.gateDelayAria', { gate: gt })}
                      className={dStyles.delayNumInput}
                      value={typeDelays[gt]}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v >= 0) onChangeTypeDelay(gt, v);
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>

            {!isQuick && (
              <div className={dStyles.delayBox}>
                <h3 className={dStyles.delayBoxTitle}>
                  {t('boolean.timing.instanceDelays')} (
                  {activeWhich === 'orig' ? t('boolean.timing.target.orig') : targetLabel})
                </h3>
                {activeGatesForOverride.length === 0 ? (
                  <p className={dStyles.hintText}>{t('boolean.timing.noGates')}</p>
                ) : (
                  <div className={dStyles.delayInputsRow}>
                    {activeGatesForOverride.map((gate) => {
                      const gt = gate.gateType!;
                      const val = getGateDelayNs(gate.id, gt, typeDelays, activeOverrides);
                      const isOverridden = activeOverrides[gate.id] !== undefined;
                      return (
                        <label key={gate.id} className={dStyles.delayField} title={`${gate.id}: ${gate.exprText}`}>
                          <span>
                            {gate.id} ({gt}){isOverridden ? '*' : ''}
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={500}
                            step={1}
                            aria-label={t('boolean.timing.instanceDelayAria', { id: gate.id })}
                            className={dStyles.delayNumInput}
                            value={val}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              if (Number.isFinite(v) && v >= 0) {
                                onChangeInstanceDelay(activeWhich, gate.id, v);
                              }
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Synchronous DFF mode row */}
          <div className={dStyles.dffRow}>
            <label className={dStyles.dffCheckLabel}>
              <input
                type="checkbox"
                checked={dff.enabled}
                onChange={(e) => setDff((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
              <span>{t('boolean.timing.dffToggle')}</span>
            </label>

            {dff.enabled && (
              <div className={dStyles.delayInputsRow}>
                <label className={dStyles.delayField}>
                  <span>{t('boolean.timing.clkPeriod')}</span>
                  <input
                    type="number"
                    min={10}
                    max={500}
                    step={5}
                    className={dStyles.delayNumInput}
                    value={dff.clockPeriodNs}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 10) setDff((p) => ({ ...p, clockPeriodNs: v }));
                    }}
                  />
                </label>
                <label className={dStyles.delayField}>
                  <span>{t('boolean.timing.tcq')}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    className={dStyles.delayNumInput}
                    value={dff.tClkToQNs}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 0) setDff((p) => ({ ...p, tClkToQNs: v }));
                    }}
                  />
                </label>
                <label className={dStyles.delayField}>
                  <span>{t('boolean.timing.tsu')}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    className={dStyles.delayNumInput}
                    value={dff.tSetupNs}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 0) setDff((p) => ({ ...p, tSetupNs: v }));
                    }}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Custom signal picker when preset === 'custom' */}
          {signalPreset === 'custom' && (
            <div className={dStyles.signalBar}>
              <span className={dStyles.signalBarLabel}>{t('boolean.timing.signals')}:</span>
              {(viewTarget === 'orig' ? origSim : targetSim).traces.map((tr) => {
                const isOrig = viewTarget === 'orig';
                const checked = isOrig ? origSelected.has(tr.id) : targetSelected.has(tr.id);
                return (
                  <label key={tr.id} className={dStyles.signalCheck} title={tr.exprText ?? tr.label}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleId(isOrig ? setOrigSelected : setTargetSelected, tr.id)}
                    />
                    <span>{tr.label}</span>
                  </label>
                );
              })}
            </div>
          )}

          {/* Waveform canvases */}
          {(viewTarget === 'orig' || viewTarget === 'both') && (
            <WaveDromCanvas
              sim={origSim}
              visibleTraces={filterTraces(origSim, originalGraph, origSelected)}
              title={t('boolean.circuit.original')}
            />
          )}

          {(viewTarget === 'simp' || viewTarget === 'both') && (
            <WaveDromCanvas
              sim={targetSim}
              visibleTraces={filterTraces(targetSim, targetGraph, targetSelected)}
              title={targetLabel}
            />
          )}
        </div>
      )}
    </section>
  );
}
