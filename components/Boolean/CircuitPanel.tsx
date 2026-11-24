import { useEffect, useMemo, useRef, useState } from 'react';

import {
  evaluateCircuitNodes,
  exportCircuitTikz,
  formatGateMarking,
  getGatePinY,
} from '../../lib/boolean/circuit';
import { computeCriticalPath, getGateDelayNs } from '../../lib/boolean/timing';
import type {
  CircuitGraph,
  CircuitNode,
  CircuitSymbolStyle,
  GateDelayMap,
  GateInputMode,
  GateType,
  InstanceDelayMap,
} from '../../lib/boolean/types';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import styles from '../../styles/Boolean.module.css';
import dStyles from '../../styles/BooleanDiagrams.module.css';

const WIDE_THRESHOLD = 920;
const GATE_W = 56;
const BASE_GATE_H = 40;

export interface CircuitPanelProps {
  readonly originalGraph: CircuitGraph;
  readonly targetGraph: CircuitGraph;
  readonly targetTitle: string;
  readonly gateInputMode: GateInputMode;
  readonly onGateInputModeChange: (mode: GateInputMode) => void;
  readonly probeInputs: Readonly<Record<string, 0 | 1>>;
  readonly onToggleProbeInput: (varName: string) => void;
  readonly typeDelays: GateDelayMap;
  readonly origOverrides: InstanceDelayMap;
  readonly targetOverrides: InstanceDelayMap;
  readonly onEditGateDelay: (which: 'orig' | 'target', gateId: string, delayNs: number | null) => void;
}

function renderGateSymbol(
  node: CircuitNode,
  style: CircuitSymbolStyle,
  showGateMarkings: boolean,
  isSelected: boolean,
  isOnCriticalPath: boolean,
  delayNs: number,
  hasOverride: boolean,
) {
  const gateType = node.gateType as GateType;
  const arity = node.inputs.length;
  const gateH = Math.max(BASE_GATE_H, arity > 3 ? arity * 13 + 8 : BASE_GATE_H);
  const x = node.x;
  const y = node.y;
  const left = x - GATE_W / 2;
  const top = y - gateH / 2;
  const stroke = isSelected
    ? 'var(--ds-accent)'
    : isOnCriticalPath
      ? 'var(--ds-accent)'
      : 'var(--ds-ink)';
  const strokeWidth = isSelected || isOnCriticalPath ? 2.2 : 1.75;
  const fill = 'var(--ds-surface-solid)';

  const hasBubble =
    gateType === 'NOT' || gateType === 'NAND' || gateType === 'NOR' || gateType === 'XNOR';
  const bodyRight = hasBubble ? left + GATE_W - 8 : left + GATE_W;
  const marking = formatGateMarking(gateType, arity);

  // Short horizontal lead-in stubs from x - 34 (router anchor) to gate body edge
  const leadStubs = node.inputs.map((_, pinIdx) => {
    const py = getGatePinY(y, pinIdx, arity);
    const bodyEntryX =
      style === 'ieee' && gateType === 'NOT'
        ? left + 6
        : style === 'ieee' && (gateType === 'OR' || gateType === 'NOR')
          ? left + 4
          : style === 'ieee' && (gateType === 'XOR' || gateType === 'XNOR')
            ? left + 3
            : left;
    return (
      <line
        key={`stub-in-${pinIdx}`}
        x1={x - 34}
        y1={py}
        x2={bodyEntryX}
        y2={py}
        stroke="var(--ds-ink-3)"
        strokeWidth={1.5}
      />
    );
  });

  // Short horizontal lead-out stub from body/bubble to x + 38 (router anchor)
  const outStart = hasBubble ? bodyRight + 8 : bodyRight;
  const outStub = (
    <line
      x1={outStart}
      y1={y}
      x2={x + 38}
      y2={y}
      stroke="var(--ds-ink-3)"
      strokeWidth={1.5}
    />
  );

  let shape: React.ReactNode;
  if (style === 'iec') {
    const iecLabel: Record<GateType, string> = {
      NOT: '1',
      AND: '&',
      NAND: '&',
      OR: '≥1',
      NOR: '≥1',
      XOR: '=1',
      XNOR: '=1',
    };
    shape = (
      <>
        <rect
          x={left}
          y={top}
          width={bodyRight - left}
          height={gateH}
          rx={2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <text
          x={(left + bodyRight) / 2}
          y={y + 4}
          textAnchor="middle"
          fontSize="12"
          fontWeight={700}
          fill="var(--ds-ink)"
          fontFamily="var(--ds-font-mono)"
        >
          {iecLabel[gateType]}
        </text>
        {hasBubble && (
          <circle
            cx={bodyRight + 4}
            cy={y}
            r={4}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )}
      </>
    );
  } else {
    if (gateType === 'NOT') {
      shape = (
        <>
          <polygon
            points={`${left + 6},${top + 4} ${left + 6},${top + gateH - 4} ${bodyRight},${y}`}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          <circle
            cx={bodyRight + 4}
            cy={y}
            r={4}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </>
      );
    } else if (gateType === 'AND' || gateType === 'NAND') {
      const midX = left + (bodyRight - left) * 0.52;
      const r = gateH / 2;
      shape = (
        <>
          <path
            d={`M ${left} ${top} L ${midX} ${top} A ${bodyRight - midX} ${r} 0 0 1 ${midX} ${top + gateH} L ${left} ${top + gateH} Z`}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          {hasBubble && (
            <circle
              cx={bodyRight + 4}
              cy={y}
              r={4}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          )}
        </>
      );
    } else {
      const isXor = gateType === 'XOR' || gateType === 'XNOR';
      const bodyLeft = isXor ? left + 6 : left;
      shape = (
        <>
          {isXor && (
            <path
              d={`M ${left} ${top} Q ${left + 10} ${y} ${left} ${top + gateH}`}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          )}
          <path
            d={`M ${bodyLeft} ${top} Q ${bodyLeft + 10} ${y} ${bodyLeft} ${top + gateH} Q ${bodyLeft + 24} ${top + gateH} ${bodyRight} ${y} Q ${bodyLeft + 24} ${top} ${bodyLeft} ${top} Z`}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          {hasBubble && (
            <circle
              cx={bodyRight + 4}
              cy={y}
              r={4}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          )}
        </>
      );
    }
  }

  return (
    <>
      {leadStubs}
      {outStub}
      {shape}
      <text
        x={x}
        y={top - 6}
        textAnchor="middle"
        fontSize="10"
        fontWeight={650}
        fill={hasOverride ? 'var(--ds-accent)' : 'var(--ds-ink-2)'}
        fontFamily="var(--ds-font-mono)"
      >
        {node.id} · {delayNs}ns
      </text>
      {showGateMarkings && (
        <text
          x={x}
          y={top + gateH + 12}
          textAnchor="middle"
          fontSize="9.5"
          fontWeight={700}
          fill="var(--ds-accent)"
          fontFamily="var(--ds-font-mono)"
        >
          {marking}
        </text>
      )}
    </>
  );
}

function SingleCircuitView({
  graph,
  title,
  symbolStyle,
  showGateMarkings,
  probeInputs,
  typeDelays,
  overrides,
  which,
  onEditGateDelay,
  isQuick,
}: {
  graph: CircuitGraph;
  title: string;
  symbolStyle: CircuitSymbolStyle;
  showGateMarkings: boolean;
  probeInputs: Readonly<Record<string, 0 | 1>>;
  typeDelays: GateDelayMap;
  overrides: InstanceDelayMap;
  which: 'orig' | 'target';
  onEditGateDelay: (which: 'orig' | 'target', gateId: string, delayNs: number | null) => void;
  isQuick: boolean;
}) {
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const [copiedTikz, setCopiedTikz] = useState(false);
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);
  const [customHeight, setCustomHeight] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const curH =
      customHeight ??
      Math.round(svgRef.current?.getBoundingClientRect().height || graph.height);
    dragRef.current = { startY: e.clientY, startH: curH };
    setIsResizing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const nextH = Math.max(140, Math.min(1200, Math.round(drag.startH + (e.clientY - drag.startY))));
    setCustomHeight(nextH);
  };

  const handleResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsResizing(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleResizeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const baseH =
      customHeight ??
      Math.round(svgRef.current?.getBoundingClientRect().height || graph.height);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCustomHeight(Math.min(1200, baseH + 28));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCustomHeight(Math.max(140, baseH - 28));
    } else if (e.key === 'Home' || e.key === 'Escape') {
      e.preventDefault();
      setCustomHeight(null);
    }
  };

  const nodeValues = useMemo(() => evaluateCircuitNodes(graph, probeInputs), [graph, probeInputs]);
  const crit = useMemo(
    () => computeCriticalPath(graph, typeDelays, overrides),
    [graph, typeDelays, overrides],
  );
  const critSet = useMemo(() => new Set(crit.pathNodes), [crit.pathNodes]);
  const nodeMap = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  const selectedGate = selectedGateId ? nodeMap.get(selectedGateId) : undefined;

  const handleCopyTikz = async () => {
    const code = exportCircuitTikz(graph, symbolStyle, title, showGateMarkings);
    try {
      await navigator.clipboard.writeText(code);
      setCopiedTikz(true);
      window.setTimeout(() => setCopiedTikz(false), 1600);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadSvg = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const serialized = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Deduplicate junction branch points & net labels per source node
  const renderedNetLabels = new Set<string>();
  const renderedJunctions = new Set<string>();
  const outputNameSet = new Set(graph.outputNames);

  return (
    <div className={dStyles.subPane} data-testid={`circuit-pane-${which}`}>
      <div className={dStyles.subPaneHead}>
        <div>
          <h3 className={dStyles.subPaneTitle}>{title}</h3>
          <span className={styles.metaInline}>
            {graph.nodes.filter((n) => n.kind === 'gate').length} gates
            {!isQuick && ` · ${t('boolean.circuit.criticalPath', { delay: crit.delayNs })}`}
          </span>
        </div>
        <div className={styles.btnRow}>
          {customHeight !== null && (
            <button
              type="button"
              className={[styles.btnGhost, styles.btnSmall].join(' ')}
              onClick={() => setCustomHeight(null)}
            >
              {t('boolean.circuit.resetSize')} ({customHeight}px)
            </button>
          )}
          {!isQuick && (
            <>
              <button
                type="button"
                className={[styles.btn, styles.btnSmall].join(' ')}
                onClick={handleCopyTikz}
              >
                {copiedTikz ? t('boolean.result.copied') : t('boolean.circuit.copyTikz')}
              </button>
              <button
                type="button"
                className={[styles.btn, styles.btnSmall].join(' ')}
                onClick={handleDownloadSvg}
              >
                {t('boolean.circuit.downloadSvg')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className={dStyles.circuitStageWrap}>
        <div className={dStyles.circuitStageInner}>
          <svg
            ref={svgRef}
            className={dStyles.circuitSvg}
            viewBox={`0 0 ${graph.width} ${graph.height}`}
            width={graph.width}
            height={graph.height}
            preserveAspectRatio="xMidYMid meet"
            style={
              customHeight !== null
                ? { height: `${customHeight}px`, width: 'auto', maxWidth: 'none' }
                : undefined
            }
            role="img"
            aria-label={`${title} schematic`}
          >
          {/* Overlap-free orthogonal wires with channel tracks and bypass lanes */}
          {graph.edges.map((edge) => {
            const from = nodeMap.get(edge.fromId);
            if (!from || edge.points.length < 2) return null;

            const d = edge.points
              .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
              .join(' ');
            const val = nodeValues[from.id] ?? 0;
            const wireStroke = val === 1 ? 'var(--bool-high)' : 'var(--ds-ink-3)';

            const showNetLabel =
              from.kind === 'gate' &&
              !outputNameSet.has(from.netName) &&
              !renderedNetLabels.has(from.id);
            if (showNetLabel) renderedNetLabels.add(from.id);

            let showJunction = false;
            if (edge.branchPoint) {
              const jKey = `${Math.round(edge.branchPoint.x)}:${Math.round(edge.branchPoint.y)}`;
              if (!renderedJunctions.has(jKey)) {
                renderedJunctions.add(jKey);
                showJunction = true;
              }
            }

            return (
              <g key={`${edge.fromId}-${edge.toId}-${edge.toPinIndex}`}>
                <path
                  d={d}
                  fill="none"
                  stroke={wireStroke}
                  strokeWidth={val === 1 ? 2.15 : 1.55}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {showJunction && edge.branchPoint && (
                  <circle
                    cx={edge.branchPoint.x}
                    cy={edge.branchPoint.y}
                    r={3.2}
                    fill={wireStroke}
                  />
                )}
                {showNetLabel && (
                  <text
                    x={edge.points[0].x + 5}
                    y={edge.points[0].y - 6}
                    fontSize="9.5"
                    fill="var(--ds-ink-3)"
                    fontFamily="var(--ds-font-mono)"
                  >
                    {from.netName}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes: inputs, constants, gates, outputs */}
          {graph.nodes.map((node) => {
            const val = nodeValues[node.id] ?? 0;
            const valColor = val === 1 ? 'var(--bool-high)' : 'var(--bool-low)';

            if (node.kind === 'input' || node.kind === 'const') {
              const labelStr = `${node.label}=${val}`;
              const boxW = Math.max(44, labelStr.length * 8 + 14);
              return (
                <g key={node.id}>
                  <rect
                    x={node.x + 18 - boxW}
                    y={node.y - 13}
                    width={boxW}
                    height={26}
                    rx={5}
                    fill="var(--ds-surface-solid)"
                    stroke={valColor}
                    strokeWidth={1.6}
                  />
                  <text
                    x={node.x + 18 - boxW / 2}
                    y={node.y + 4}
                    textAnchor="middle"
                    fontSize="11.5"
                    fontWeight={700}
                    fill="var(--ds-ink)"
                    fontFamily="var(--ds-font-mono)"
                  >
                    {labelStr}
                  </text>
                </g>
              );
            }

            if (node.kind === 'output') {
              const labelStr = `${node.label}=${val}`;
              const boxW = Math.max(50, labelStr.length * 8 + 16);
              return (
                <g key={node.id}>
                  <rect
                    x={node.x - 18}
                    y={node.y - 14}
                    width={boxW}
                    height={28}
                    rx={6}
                    fill={
                      val === 1
                        ? 'color-mix(in srgb, var(--bool-high) 14%, var(--ds-surface-solid))'
                        : 'var(--ds-surface-solid)'
                    }
                    stroke={valColor}
                    strokeWidth={2}
                  />
                  <text
                    x={node.x - 18 + boxW / 2}
                    y={node.y + 4}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight={700}
                    fill="var(--ds-ink)"
                    fontFamily="var(--ds-font-mono)"
                  >
                    {labelStr}
                  </text>
                </g>
              );
            }

            if (node.kind === 'gate' && node.gateType) {
              const delayNs = getGateDelayNs(node.id, node.gateType, typeDelays, overrides);
              const hasOverride = overrides[node.id] !== undefined;
              const marking = formatGateMarking(node.gateType, node.inputs.length);
              return (
                <g
                  key={node.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() =>
                    setSelectedGateId((cur) => (cur === node.id ? null : node.id))
                  }
                >
                  <title>
                    {`${node.id} (${marking}): ${node.exprText} — delay ${delayNs} ns (click to edit)`}
                  </title>
                  {renderGateSymbol(
                    node,
                    symbolStyle,
                    showGateMarkings,
                    selectedGateId === node.id,
                    critSet.has(node.id),
                    delayNs,
                    hasOverride,
                  )}
                </g>
              );
            }
            return null;
          })}
        </svg>
        </div>
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="horizontal"
          aria-label={t('boolean.circuit.resizeHint')}
          title={`${t('boolean.circuit.resizeHint')} (double-click to reset)`}
          data-testid={`circuit-resize-handle-${which}`}
          className={[
            dStyles.circuitResizeHandle,
            isResizing ? dStyles.circuitResizeHandleActive : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
          onDoubleClick={() => setCustomHeight(null)}
          onKeyDown={handleResizeKeyDown}
        >
          <span className={dStyles.circuitResizeGrip} aria-hidden="true" />
        </div>
      </div>

      {selectedGate && selectedGate.gateType && (
        <div className={dStyles.signalBar}>
          <span className={dStyles.signalBarLabel}>
            {selectedGate.id} ({formatGateMarking(selectedGate.gateType, selectedGate.inputs.length)} →{' '}
            {selectedGate.netName} = {selectedGate.exprText}):
          </span>
          <label className={dStyles.delayField}>
            <span>Instance delay (ns)</span>
            <input
              type="number"
              min={0}
              max={500}
              step={1}
              className={dStyles.delayNumInput}
              value={getGateDelayNs(selectedGate.id, selectedGate.gateType, typeDelays, overrides)}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 0) onEditGateDelay(which, selectedGate.id, v);
              }}
            />
          </label>
          {overrides[selectedGate.id] !== undefined && (
            <button
              type="button"
              className={[styles.btnGhost, styles.btnSmall].join(' ')}
              onClick={() => onEditGateDelay(which, selectedGate.id, null)}
            >
              Use global ({typeDelays[selectedGate.gateType]} ns)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function CircuitPanel({
  originalGraph,
  targetGraph,
  targetTitle,
  gateInputMode,
  onGateInputModeChange,
  probeInputs,
  onToggleProbeInput,
  typeDelays,
  origOverrides,
  targetOverrides,
  onEditGateDelay,
}: CircuitPanelProps) {
  const { t } = useI18n();
  const { mode } = useExperienceMode();
  const isQuick = mode === 'quick';
  const containerRef = useRef<HTMLDivElement>(null);
  const [isWide, setIsWide] = useState(true);
  const [paneLayout, setPaneLayout] = useState<'side-by-side' | 'stacked'>('side-by-side');
  const [showOrig, setShowOrig] = useState(true);
  const [showSimp, setShowSimp] = useState(true);
  const [symbolStyle, setSymbolStyle] = useState<CircuitSymbolStyle>('ieee');
  const [showGateMarkings, setShowGateMarkings] = useState(true);

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

  const bothVisible = showOrig && showSimp;
  const useSideBySide = bothVisible && isWide && paneLayout === 'side-by-side';

  const gateModeOptions: readonly { id: GateInputMode; label: string }[] = [
    { id: 'multi', label: t('boolean.circuit.gateMode.multi') },
    { id: '2-input', label: t('boolean.circuit.gateMode.two') },
    { id: '2-input-nand', label: t('boolean.circuit.gateMode.nand2') },
    { id: '2-input-nor', label: t('boolean.circuit.gateMode.nor2') },
  ];

  return (
    <section ref={containerRef} className={dStyles.sectionCard} aria-label={t('boolean.circuit.title')}>
      <div className={dStyles.sectionToolbar}>
        <div className={styles.stepsTitleGroup}>
          <h2 className={styles.cardTitle}>{t('boolean.circuit.title')}</h2>
          <span className={styles.metaInline}>
            {bothVisible ? (useSideBySide ? 'side-by-side' : 'stacked') : 'single view'}
          </span>
        </div>

        <div className={styles.stepsControls}>
          {bothVisible && (
            <div className={styles.segmented} role="group" aria-label="Circuit layout">
              <button
                type="button"
                aria-pressed={paneLayout === 'side-by-side'}
                data-testid="circuit-layout-side"
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
                data-testid="circuit-layout-stacked"
                className={[styles.segBtn, paneLayout === 'stacked' ? styles.segBtnActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setPaneLayout('stacked')}
              >
                {t('boolean.view.stacked')}
              </button>
            </div>
          )}
          <div className={styles.segmented} role="group" aria-label={t('boolean.circuit.gateMode')}>
            {gateModeOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={gateInputMode === opt.id}
                className={[styles.segBtn, gateInputMode === opt.id ? styles.segBtnActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onGateInputModeChange(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            aria-pressed={showGateMarkings}
            className={[styles.btn, styles.btnSmall, showGateMarkings ? styles.btnActiveSoft : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setShowGateMarkings((v) => !v)}
            data-testid="toggle-gate-markings"
          >
            {showGateMarkings ? t('boolean.circuit.markingsOn') : t('boolean.circuit.markingsOff')}
          </button>

          <div className={styles.segmented} role="group" aria-label="Circuit symbol style">
            <button
              type="button"
              aria-pressed={symbolStyle === 'ieee'}
              className={[styles.segBtn, symbolStyle === 'ieee' ? styles.segBtnActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSymbolStyle('ieee')}
            >
              {t('boolean.circuit.style.ieee')}
            </button>
            <button
              type="button"
              aria-pressed={symbolStyle === 'iec'}
              className={[styles.segBtn, symbolStyle === 'iec' ? styles.segBtnActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSymbolStyle('iec')}
            >
              {t('boolean.circuit.style.iec')}
            </button>
          </div>

          <button
            type="button"
            aria-pressed={showOrig}
            className={[styles.btn, styles.btnSmall, showOrig ? styles.btnActiveSoft : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setShowOrig((v) => !v)}
          >
            {showOrig ? t('boolean.circuit.hideOrig') : t('boolean.circuit.showOrig')}
          </button>

          <button
            type="button"
            aria-pressed={showSimp}
            className={[styles.btn, styles.btnSmall, showSimp ? styles.btnActiveSoft : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setShowSimp((v) => !v)}
          >
            {showSimp ? t('boolean.circuit.hideSimp') : t('boolean.circuit.showSimp')}
          </button>
        </div>
      </div>

      <div className={dStyles.sectionBody}>
        {originalGraph.variables.length > 0 && (showOrig || showSimp) && (
          <div className={dStyles.probeBar}>
            <span className={dStyles.signalBarLabel}>{t('boolean.circuit.liveProbe')}:</span>
            {originalGraph.variables.map((v) => {
              const val = probeInputs[v] ?? 0;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={val === 1}
                  className={[dStyles.probeToggle, val === 1 ? dStyles.probeToggleOn : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onToggleProbeInput(v)}
                >
                  {v} = {val}
                </button>
              );
            })}
            {!isQuick && <span className={dStyles.hintText}>{t('boolean.circuit.gateHint')}</span>}
          </div>
        )}

        {!showOrig && !showSimp ? (
          <p className={dStyles.hintText}>{t('boolean.circuit.allHidden')}</p>
        ) : (
          <div className={useSideBySide ? dStyles.dualGrid : dStyles.singleGrid} data-testid="circuit-grid">
            {showOrig && (
              <SingleCircuitView
                graph={originalGraph}
                title={t('boolean.circuit.original')}
                symbolStyle={symbolStyle}
                showGateMarkings={showGateMarkings}
                probeInputs={probeInputs}
                typeDelays={typeDelays}
                overrides={origOverrides}
                which="orig"
                onEditGateDelay={onEditGateDelay}
                isQuick={isQuick}
              />
            )}
            {showSimp && (
              <SingleCircuitView
                graph={targetGraph}
                title={targetTitle}
                symbolStyle={symbolStyle}
                showGateMarkings={showGateMarkings}
                probeInputs={probeInputs}
                typeDelays={typeDelays}
                overrides={targetOverrides}
                which="target"
                onEditGateDelay={onEditGateDelay}
                isQuick={isQuick}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
