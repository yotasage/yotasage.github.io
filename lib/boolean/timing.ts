import { evalGateValue } from './circuit';
import type {
  CircuitGraph,
  DffConfig,
  GateDelayMap,
  InstanceDelayMap,
  SignalTrace,
  TimingSimulationResult,
  WaveDromDocument,
  WaveDromSignal,
  WaveformSegment,
} from './types';

interface TimedEvent {
  readonly timeNs: number;
  readonly value: 0 | 1;
}

/**
 * Generate a clean test vector sequence (Gray-code ordered for 1-4 vars so adjacent
 * transitions flip 1 bit at a time and cleanly reveal static/dynamic hazards).
 */
export function generateStimulusVectors(
  variables: readonly string[],
  maxVectors = 8,
): readonly Readonly<Record<string, 0 | 1>>[] {
  const n = variables.length;
  if (n === 0) return [{}];
  const total = Math.min(1 << n, maxVectors);
  const vectors: Record<string, 0 | 1>[] = [];
  for (let i = 0; i < total; i++) {
    const gray = i ^ (i >> 1);
    const vec: Record<string, 0 | 1> = {};
    for (let b = 0; b < n; b++) {
      vec[variables[b]] = ((gray >> (n - 1 - b)) & 1) === 1 ? 1 : 0;
    }
    vectors.push(vec);
  }
  return vectors;
}

export function getGateDelayNs(
  gateId: string,
  gateType: keyof GateDelayMap,
  typeDelays: GateDelayMap,
  instanceOverrides: InstanceDelayMap,
): number {
  const override = instanceOverrides[gateId];
  if (typeof override === 'number' && Number.isFinite(override) && override >= 0) {
    return override;
  }
  const base = typeDelays[gateType];
  return Number.isFinite(base) && base >= 0 ? base : 0;
}

/**
 * Compute exact critical path delay (longest combinational delay from any input to output).
 */
export function computeCriticalPath(
  graph: CircuitGraph,
  typeDelays: GateDelayMap,
  instanceOverrides: InstanceDelayMap,
): { delayNs: number; pathNodes: string[] } {
  const arrival = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const ordered = [...graph.nodes].sort((a, b) => a.level - b.level);

  for (const node of ordered) {
    if (node.kind === 'input' || node.kind === 'const') {
      arrival.set(node.id, 0);
      parent.set(node.id, null);
      continue;
    }
    let bestIn = -1;
    let bestSrc: string | null = null;
    for (const srcId of node.inputs) {
      const t = arrival.get(srcId) ?? 0;
      if (t > bestIn) {
        bestIn = t;
        bestSrc = srcId;
      }
    }
    const gateDelay =
      node.kind === 'gate' && node.gateType
        ? getGateDelayNs(node.id, node.gateType, typeDelays, instanceOverrides)
        : 0;
    arrival.set(node.id, Math.max(0, bestIn) + gateDelay);
    parent.set(node.id, bestSrc);
  }

  const outputNodes = graph.nodes.filter((n) => n.kind === 'output');
  let worstOutId: string | null = outputNodes[0]?.id ?? 'OUT';
  let worstDelay = -1;
  for (const outNode of outputNodes) {
    const d = arrival.get(outNode.id) ?? 0;
    if (d > worstDelay) {
      worstDelay = d;
      worstOutId = outNode.id;
    }
  }
  const outDelay = worstDelay >= 0 ? worstDelay : (arrival.get('OUT') ?? 0);
  const path: string[] = [];
  let cur: string | null = worstOutId;
  while (cur) {
    path.push(cur);
    cur = parent.get(cur) ?? null;
  }
  path.reverse();
  return { delayNs: outDelay, pathNodes: path };
}

function valueAtTime(events: readonly TimedEvent[], t: number): 0 | 1 {
  let val: 0 | 1 = events[0]?.value ?? 0;
  for (let i = 1; i < events.length; i++) {
    if (events[i].timeNs <= t) val = events[i].value;
    else break;
  }
  return val;
}

function eventsToSegments(
  events: readonly TimedEvent[],
  totalDurationNs: number,
  stepDurationNs: number,
  isCombSignal: boolean,
): { segments: WaveformSegment[]; glitchCount: number } {
  const cleaned: TimedEvent[] = [];
  for (const ev of events) {
    if (ev.timeNs > totalDurationNs) break;
    const prev = cleaned[cleaned.length - 1];
    if (prev && Math.abs(prev.timeNs - ev.timeNs) < 1e-6) {
      cleaned[cleaned.length - 1] = ev;
    } else if (!prev || prev.value !== ev.value) {
      cleaned.push(ev);
    }
  }

  if (cleaned.length === 0) {
    return {
      segments: [{ startNs: 0, endNs: totalDurationNs, value: 0 }],
      glitchCount: 0,
    };
  }

  const segments: WaveformSegment[] = [];
  let glitchCount = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const startNs = cleaned[i].timeNs;
    const endNs = i + 1 < cleaned.length ? cleaned[i + 1].timeNs : totalDurationNs;
    if (endNs <= startNs) continue;

    // A glitch is a short transient pulse inside a single stimulus window that transitions
    // and then immediately returns before the next input step begins.
    const sameWindow =
      isCombSignal &&
      i > 0 &&
      i + 1 < cleaned.length &&
      Math.floor(startNs / stepDurationNs) === Math.floor(endNs / stepDurationNs) &&
      endNs - startNs < stepDurationNs * 0.85;

    if (sameWindow) glitchCount++;
    segments.push({
      startNs,
      endNs,
      value: cleaned[i].value,
      isGlitch: sameWindow,
    });
  }

  return { segments, glitchCount };
}

/**
 * Simulates event-driven gate propagation through a circuit DAG, optionally wrapped in
 * synchronous rising-edge D Flip-Flops (input registers + output register).
 */
export function simulateCircuitTiming(
  graph: CircuitGraph,
  typeDelays: GateDelayMap,
  instanceOverrides: InstanceDelayMap,
  dff: DffConfig,
  visibleSignalIds?: readonly string[],
): TimingSimulationResult {
  const vectors = generateStimulusVectors(graph.variables, 8);
  const { delayNs: criticalPathNs, pathNodes: criticalPathNodes } = computeCriticalPath(
    graph,
    typeDelays,
    instanceOverrides,
  );

  // Choose clean step duration so combinational outputs always settle cleanly in combinational mode
  const minSafeStep = Math.max(40, Math.ceil((criticalPathNs + 20) / 10) * 10);
  const stepDurationNs = dff.enabled ? Math.max(10, dff.clockPeriodNs) : minSafeStep;
  const totalDurationNs = vectors.length * stepDurationNs;

  // Compute event streams for primary inputs (and registered inputs if DFF enabled)
  const rawInputEvents = new Map<string, TimedEvent[]>();
  const regInputEvents = new Map<string, TimedEvent[]>();
  const nodeEvents = new Map<string, TimedEvent[]>();

  const tCq = Math.max(0, dff.tClkToQNs);
  const tSu = Math.max(0, dff.tSetupNs);

  for (const v of graph.variables) {
    const rawEv: TimedEvent[] = [];
    const regEv: TimedEvent[] = [];
    for (let k = 0; k < vectors.length; k++) {
      const val = vectors[k][v] ?? 0;
      if (dff.enabled) {
        // External input changes slightly before clock edge (mid-previous cycle) so setup is visible
        const extChangeTime = k === 0 ? 0 : k * stepDurationNs - Math.min(stepDurationNs * 0.35, tSu + 5);
        rawEv.push({ timeNs: Math.max(0, extChangeTime), value: val });
        // Input DFF latches on rising clock edge at k * T_clk and outputs after t_cq
        const regTime = k === 0 ? 0 : k * stepDurationNs + tCq;
        regEv.push({ timeNs: regTime, value: val });
      } else {
        rawEv.push({ timeNs: k * stepDurationNs, value: val });
      }
    }
    rawInputEvents.set(v, rawEv);
    if (dff.enabled) regInputEvents.set(v, regEv);
  }

  // Propagate events in topological (level) order through the circuit DAG
  const ordered = [...graph.nodes].sort((a, b) => a.level - b.level);

  for (const node of ordered) {
    if (node.kind === 'input') {
      const driver = dff.enabled
        ? (regInputEvents.get(node.label) ?? [{ timeNs: 0, value: 0 }])
        : (rawInputEvents.get(node.label) ?? [{ timeNs: 0, value: 0 }]);
      nodeEvents.set(node.id, driver);
      continue;
    }

    if (node.kind === 'const') {
      nodeEvents.set(node.id, [{ timeNs: 0, value: node.label === '1' ? 1 : 0 }]);
      continue;
    }

    if (node.kind === 'output') {
      const src = node.inputs[0];
      nodeEvents.set(node.id, src ? (nodeEvents.get(src) ?? [{ timeNs: 0, value: 0 }]) : [{ timeNs: 0, value: 0 }]);
      continue;
    }

    if (node.kind === 'gate' && node.gateType) {
      const delay = getGateDelayNs(node.id, node.gateType, typeDelays, instanceOverrides);
      const zeroStream: readonly TimedEvent[] = [{ timeNs: 0, value: 0 }];
      const srcStreams: readonly (readonly TimedEvent[])[] = node.inputs.map(
        (srcId) => nodeEvents.get(srcId) ?? zeroStream,
      );

      // Collect all distinct input transition timestamps
      const timeSet = new Set<number>([0]);
      for (const stream of srcStreams) {
        for (const ev of stream) timeSet.add(ev.timeNs);
      }
      const sortedTimes = [...timeSet].sort((a, b) => a - b);

      const outEvents: TimedEvent[] = [];
      // Initial settled value at t = 0
      const initVals = srcStreams.map((s) => valueAtTime(s, 0));
      outEvents.push({ timeNs: 0, value: evalGateValue(node.gateType, initVals) });

      for (const t of sortedTimes) {
        if (t === 0) continue;
        const vals = srcStreams.map((s) => valueAtTime(s, t));
        const outVal = evalGateValue(node.gateType, vals);
        outEvents.push({ timeNs: t + delay, value: outVal });
      }
      nodeEvents.set(node.id, outEvents);
    }
  }

  // Build SignalTraces
  const traces: SignalTrace[] = [];

  // 1. Clock trace when DFF mode is enabled
  if (dff.enabled) {
    const clkSegments: WaveformSegment[] = [];
    const half = stepDurationNs / 2;
    for (let k = 0; k < vectors.length; k++) {
      const start = k * stepDurationNs;
      clkSegments.push({ startNs: start, endNs: start + half, value: 1 });
      clkSegments.push({ startNs: start + half, endNs: start + stepDurationNs, value: 0 });
    }
    traces.push({
      id: 'CLK',
      label: 'CLK',
      role: 'clock',
      segments: clkSegments,
      glitchCount: 0,
    });
  }

  // 2. Input signals (plus registered Q inputs if DFF mode)
  for (const v of graph.variables) {
    const rawRes = eventsToSegments(rawInputEvents.get(v) ?? [], totalDurationNs, stepDurationNs, false);
    traces.push({
      id: v,
      label: dff.enabled ? `${v}_in` : v,
      role: 'input',
      segments: rawRes.segments,
      glitchCount: 0,
    });

    if (dff.enabled) {
      const regRes = eventsToSegments(regInputEvents.get(v) ?? [], totalDurationNs, stepDurationNs, false);
      traces.push({
        id: `${v}_q`,
        label: `${v}_q`,
        role: 'reg-input',
        exprText: `DFF(${v})`,
        segments: regRes.segments,
        glitchCount: 0,
      });
    }
  }

  const ZERO_EVENTS: readonly TimedEvent[] = [{ timeNs: 0, value: 0 }];

  // 3. Internal gate nets
  let totalGlitches = 0;
  for (const sig of graph.internals) {
    const evs = nodeEvents.get(sig.gateId) ?? ZERO_EVENTS;
    const { segments, glitchCount } = eventsToSegments(evs, totalDurationNs, stepDurationNs, true);
    totalGlitches += glitchCount;
    traces.push({
      id: sig.id,
      label: sig.id,
      role: 'internal',
      exprText: sig.label,
      segments,
      glitchCount,
    });
  }

  // 4 & 5. Combinational outputs and optional DFF-registered outputs
  const minClockPeriodNs = tCq + criticalPathNs + tSu;
  const slackNs = stepDurationNs - minClockPeriodNs;
  const setupViolation = dff.enabled && slackNs < 0;
  const fMaxMHz = minClockPeriodNs > 0 ? Math.round((1000 / minClockPeriodNs) * 10) / 10 : 1000;

  const outputNodes = graph.nodes.filter((n) => n.kind === 'output');
  const outputsToTrace =
    outputNodes.length > 0
      ? outputNodes
      : [{ id: 'OUT', label: graph.outputName, netName: graph.outputName }];

  for (const outNode of outputsToTrace) {
    const outName = outNode.label;
    const outEvents = nodeEvents.get(outNode.id) ?? ZERO_EVENTS;
    const outSegs = eventsToSegments(outEvents, totalDurationNs, stepDurationNs, true);
    totalGlitches += outSegs.glitchCount;
    traces.push({
      id: outName,
      label: dff.enabled ? `${outName}_comb` : outName,
      role: 'output',
      segments: outSegs.segments,
      glitchCount: outSegs.glitchCount,
    });

    if (dff.enabled) {
      const regOutSegments: WaveformSegment[] = [];
      let heldVal: 0 | 1 | 'x' = valueAtTime(outEvents, 0);
      regOutSegments.push({
        startNs: 0,
        endNs: Math.min(totalDurationNs, stepDurationNs + tCq),
        value: heldVal,
      });

      for (let k = 1; k < vectors.length; k++) {
        const edgeTime = k * stepDurationNs;
        const violatedEdge = outEvents.some(
          (ev) => ev.timeNs > edgeTime - tSu && ev.timeNs <= edgeTime + 1e-6,
        );
        const sampled: 0 | 1 | 'x' = violatedEdge ? 'x' : valueAtTime(outEvents, edgeTime - tSu);
        const segStart = edgeTime + tCq;
        const segEnd = Math.min(totalDurationNs, (k + 1) * stepDurationNs + tCq);
        if (segEnd > segStart) {
          regOutSegments.push({ startNs: segStart, endNs: segEnd, value: sampled });
        }
        heldVal = sampled;
      }

      traces.push({
        id: `${outName}_reg`,
        label: `${outName}_reg`,
        role: 'reg-output',
        exprText: `DFF(${outName})`,
        segments: regOutSegments,
        glitchCount: 0,
      });
    }
  }

  // Build authentic WaveDrom JSON for the visible signals
  const sampleGridNs = pickWaveDromGridNs(stepDurationNs, totalDurationNs);
  const filteredTraces =
    visibleSignalIds && visibleSignalIds.length > 0
      ? traces.filter((tr) => visibleSignalIds.includes(tr.id))
      : traces;
  const outTitle = graph.outputNames.join(', ');
  const waveDromJson = buildWaveDromJson(
    filteredTraces,
    totalDurationNs,
    sampleGridNs,
    dff.enabled
      ? `${outTitle} (Synchronous DFF, Tclk=${stepDurationNs}ns)`
      : `${outTitle} (Combinational, tpd=${criticalPathNs}ns)`,
  );

  return {
    totalDurationNs,
    stepDurationNs,
    sampleGridNs,
    vectorCount: vectors.length,
    criticalPathNs,
    criticalPathNodes,
    traces,
    totalGlitches,
    dffAnalysis: {
      enabled: dff.enabled,
      clockPeriodNs: stepDurationNs,
      minClockPeriodNs,
      slackNs,
      fMaxMHz,
      setupViolation,
    },
    waveDromJson,
  };
}

function pickWaveDromGridNs(stepDurationNs: number, totalDurationNs: number): number {
  const candidates = [2, 5, 10, 20, 25, 50];
  for (const g of candidates) {
    if (totalDurationNs / g <= 64 && stepDurationNs % g === 0) return g;
  }
  return Math.max(5, Math.ceil(totalDurationNs / 48));
}

function sampleSegmentValue(segments: readonly WaveformSegment[], t: number): 0 | 1 | 'x' {
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (t >= s.startNs && t < s.endNs) return s.value;
  }
  return segments[segments.length - 1]?.value ?? 0;
}

export function buildWaveDromJson(
  traces: readonly SignalTrace[],
  totalDurationNs: number,
  gridNs: number,
  title: string,
): WaveDromDocument {
  const ticks = Math.max(1, Math.min(80, Math.floor(totalDurationNs / gridNs)));
  const signals: WaveDromSignal[] = [];

  for (const tr of traces) {
    let wave = '';
    let prevChar = '';
    for (let i = 0; i < ticks; i++) {
      const t = i * gridNs + gridNs * 0.25;
      const val = sampleSegmentValue(tr.segments, t);
      const ch = val === 'x' ? 'x' : String(val);
      if (i === 0 || ch !== prevChar) {
        wave += ch;
        prevChar = ch;
      } else {
        wave += '.';
      }
    }
    signals.push({ name: tr.label, wave });
  }

  return {
    signal: signals,
    head: { text: title, tick: 0 },
    foot: { text: `1 grid unit = ${gridNs} ns` },
    config: { hscale: 1 },
  };
}
