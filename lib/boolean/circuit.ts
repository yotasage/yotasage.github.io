import { astKey, evaluateBool, makeGate, makeNot, toPlainText } from './parse';
import { convertToUniversalGates } from './simplify';
import type {
  BoolNode,
  CircuitEdge,
  CircuitGraph,
  CircuitNode,
  CircuitSymbolStyle,
  GateInputMode,
  GateType,
  InternalSignalDef,
  NotationStyle,
  WirePoint,
} from './types';

const BASE_COL_GAP = 184;
const BASE_ROW_GAP = 88;
const PAD_X = 76;
const BASE_PAD_Y = 56;
const TRACK_PITCH = 14;
const BYPASS_PITCH = 16;
const GATE_HALF_W_LEFT = 34;
const GATE_HALF_W_RIGHT = 38;
const PORT_HALF_W = 18;

export function formatGateMarking(gateType: GateType, arity: number): string {
  if (gateType === 'NOT') return 'NOT1';
  return `${gateType}${Math.max(2, arity)}`;
}

/**
 * Splits an n-ary list of operands into a balanced binary tree using `op`.
 */
function buildBalancedBinary(op: 'AND' | 'OR' | 'XOR', items: readonly BoolNode[]): BoolNode {
  if (items.length === 1) return items[0];
  if (items.length === 2) return makeGate(op, [items[0], items[1]]);
  const mid = Math.ceil(items.length / 2);
  const left = buildBalancedBinary(op, items.slice(0, mid));
  const right = buildBalancedBinary(op, items.slice(mid));
  return makeGate(op, [left, right]);
}

function buildBalancedUniversalAndOr(
  items: readonly BoolNode[],
  univ: 'NAND' | 'NOR',
): BoolNode {
  // For univ='NAND', builds AND(items) using 2-input NANDs: AND(a,b) = NAND(NAND(a,b), NAND(a,b))
  // For univ='NOR',  builds OR(items)  using 2-input NORs:  OR(a,b)  = NOR(NOR(a,b), NOR(a,b))
  if (items.length === 1) return items[0];
  if (items.length === 2) {
    const t = makeGate(univ, [items[0], items[1]]);
    return makeGate(univ, [t, t]);
  }
  const mid = Math.ceil(items.length / 2);
  const left = buildBalancedUniversalAndOr(items.slice(0, mid), univ);
  const right = buildBalancedUniversalAndOr(items.slice(mid), univ);
  const t = makeGate(univ, [left, right]);
  return makeGate(univ, [t, t]);
}

function limitToTwoInputGates(node: BoolNode, univOnly?: 'NAND' | 'NOR'): BoolNode {
  if (node.kind === 'const' || node.kind === 'var') return node;
  if (node.kind === 'not') {
    const inner = limitToTwoInputGates(node.operand, univOnly);
    if (univOnly) return makeGate(univOnly, [inner, inner]);
    return makeNot(inner);
  }

  const args = node.args.map((a) => limitToTwoInputGates(a, univOnly));
  if (args.length <= 2) {
    return makeGate(node.op, args);
  }

  if (univOnly === 'NAND' && node.op === 'NAND') {
    const mid = Math.ceil(args.length / 2);
    const left = buildBalancedUniversalAndOr(args.slice(0, mid), 'NAND');
    const right = buildBalancedUniversalAndOr(args.slice(mid), 'NAND');
    return makeGate('NAND', [left, right]);
  }

  if (univOnly === 'NOR' && node.op === 'NOR') {
    const mid = Math.ceil(args.length / 2);
    const left = buildBalancedUniversalAndOr(args.slice(0, mid), 'NOR');
    const right = buildBalancedUniversalAndOr(args.slice(mid), 'NOR');
    return makeGate('NOR', [left, right]);
  }

  switch (node.op) {
    case 'AND':
    case 'OR':
    case 'XOR':
      return buildBalancedBinary(node.op, args);
    case 'XNOR': {
      // XNOR(a1..ak) = NOT(XOR(a1..ak)) = XNOR(XOR(a1..a_{k-1}), ak)
      const prefix = buildBalancedBinary('XOR', args.slice(0, args.length - 1));
      return makeGate('XNOR', [prefix, args[args.length - 1]]);
    }
    case 'NAND': {
      const mid = Math.ceil(args.length / 2);
      const left = buildBalancedBinary('AND', args.slice(0, mid));
      const right = buildBalancedBinary('AND', args.slice(mid));
      return makeGate('NAND', [left, right]);
    }
    case 'NOR': {
      const mid = Math.ceil(args.length / 2);
      const left = buildBalancedBinary('OR', args.slice(0, mid));
      const right = buildBalancedBinary('OR', args.slice(mid));
      return makeGate('NOR', [left, right]);
    }
  }
}

/**
 * Transforms an AST to obey the chosen gate input-arity / universal-gate mode
 * while preserving 100% truth-table equivalence.
 */
export function decomposeAstForGateMode(ast: BoolNode, mode: GateInputMode): BoolNode {
  if (mode === 'multi') return ast;
  if (mode === '2-input') return limitToTwoInputGates(ast);
  if (mode === '2-input-nand') {
    const nandAst = convertToUniversalGates(ast, 'nand');
    return limitToTwoInputGates(nandAst, 'NAND');
  }
  const norAst = convertToUniversalGates(ast, 'nor');
  return limitToTwoInputGates(norAst, 'NOR');
}

export function getGatePinY(nodeY: number, pinIndex: number, pinCount: number): number {
  if (pinCount <= 1) return nodeY;
  const maxSpan = Math.min(44, Math.max(24, (pinCount - 1) * 14));
  const start = nodeY - maxSpan / 2;
  return start + (pinIndex / (pinCount - 1)) * maxSpan;
}

export interface CircuitOutputSpec {
  readonly outputName: string;
  readonly ast: BoolNode;
}

/**
 * Builds a single-output or multi-output leveled DAG circuit with:
 * - Shared input rails and common-subexpression gate sharing across outputs
 * - Commutative input-pin sorting to minimize crossings
 * - Dedicated per-net vertical routing channels with dynamic column widths
 * - Dedicated horizontal top/bottom bypass lanes so multi-level wires never overlap gate bodies
 */
export function buildMultiCircuitGraph(
  outputs: readonly CircuitOutputSpec[],
  variables: readonly string[],
  notation: NotationStyle = 'engineering',
  explicitAnd = true,
  gateInputMode: GateInputMode = 'multi',
): CircuitGraph {
  const safeOutputs: readonly CircuitOutputSpec[] =
    outputs.length > 0
      ? outputs
      : [{ outputName: 'Y', ast: { kind: 'const', value: 0 } }];

  const decomposedOutputs = safeOutputs.map((o) => ({
    outputName: o.outputName,
    ast: decomposeAstForGateMode(o.ast, gateInputMode),
  }));

  const nodesMap = new Map<string, Omit<CircuitNode, 'x' | 'y'>>();
  const astToNodeId = new Map<string, string>();
  const internals: InternalSignalDef[] = [];
  const rootAstKeys = new Set(decomposedOutputs.map((o) => astKey(o.ast)));
  const rootOutputNameByKey = new Map<string, string>();
  for (const o of decomposedOutputs) {
    const k = astKey(o.ast);
    if (!rootOutputNameByKey.has(k)) rootOutputNameByKey.set(k, o.outputName);
  }

  let gateCounter = 0;
  let constCounter = 0;

  // Create input port nodes first in sorted variable order
  for (const v of variables) {
    const id = `IN_${v}`;
    nodesMap.set(id, {
      id,
      kind: 'input',
      label: v,
      netName: v,
      exprText: v,
      inputs: [],
      level: 0,
    });
    astToNodeId.set(`v:${v}`, id);
  }

  const visit = (node: BoolNode): string => {
    const key = astKey(node);
    const existing = astToNodeId.get(key);
    if (existing) return existing;

    if (node.kind === 'var') {
      const id = `IN_${node.name}`;
      if (!nodesMap.has(id)) {
        nodesMap.set(id, {
          id,
          kind: 'input',
          label: node.name,
          netName: node.name,
          exprText: node.name,
          inputs: [],
          level: 0,
        });
      }
      astToNodeId.set(key, id);
      return id;
    }

    if (node.kind === 'const') {
      constCounter += 1;
      const id = `CONST_${constCounter}`;
      const text = String(node.value);
      nodesMap.set(id, {
        id,
        kind: 'const',
        label: text,
        netName: text,
        exprText: text,
        inputs: [],
        level: 0,
      });
      astToNodeId.set(key, id);
      return id;
    }

    let gateType: GateType;
    let inputIds: string[];

    if (node.kind === 'not') {
      gateType = 'NOT';
      inputIds = [visit(node.operand)];
    } else {
      gateType = node.op;
      inputIds = node.args.map((arg) => visit(arg));
    }

    gateCounter += 1;
    const id = `U${gateCounter}`;
    const level = 1 + Math.max(0, ...inputIds.map((srcId) => nodesMap.get(srcId)?.level ?? 0));
    const exprText = toPlainText(node, notation, explicitAnd);
    const isDirectOutput = rootAstKeys.has(key);
    const netName = isDirectOutput ? (rootOutputNameByKey.get(key) ?? `n${gateCounter}`) : `n${gateCounter}`;

    nodesMap.set(id, {
      id,
      kind: 'gate',
      label: id,
      gateType,
      netName,
      exprText,
      inputs: inputIds,
      level,
    });
    astToNodeId.set(key, id);

    if (!isDirectOutput) {
      internals.push({
        id: netName,
        gateId: id,
        gateType,
        label: exprText,
        ast: node,
      });
    }

    return id;
  };

  const outputDrivers = decomposedOutputs.map((o) => ({
    outputName: o.outputName,
    driverId: visit(o.ast),
  }));

  const maxGateLevel = Math.max(0, ...[...nodesMap.values()].map((n) => n.level));
  const outLevel = maxGateLevel + 1;

  const singleOutput = outputDrivers.length === 1;
  outputDrivers.forEach((od, idx) => {
    const driver = nodesMap.get(od.driverId);
    const outId = singleOutput ? 'OUT' : `OUT_${idx}_${od.outputName.replace(/[^A-Za-z0-9_]/g, '')}`;
    nodesMap.set(outId, {
      id: outId,
      kind: 'output',
      label: od.outputName,
      netName: od.outputName,
      exprText: driver?.exprText ?? od.outputName,
      inputs: [od.driverId],
      level: outLevel,
    });
  });

  // Group nodes by level
  const byLevel = new Map<number, Omit<CircuitNode, 'x' | 'y'>[]>();
  for (const n of nodesMap.values()) {
    const arr = byLevel.get(n.level);
    if (arr) arr.push(n);
    else byLevel.set(n.level, [n]);
  }

  // Order level 0 (inputs + constants) deterministically
  const lvl0 = byLevel.get(0) ?? [];
  lvl0.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'input' ? -1 : 1;
    return a.label.localeCompare(b.label, 'en');
  });

  // Compute row spacing dynamically if any gate has wide fan-in
  const maxArity = Math.max(
    2,
    ...[...nodesMap.values()].map((n) => (n.kind === 'gate' ? n.inputs.length : 1)),
  );
  const rowGap = Math.max(BASE_ROW_GAP, 58 + maxArity * 10);
  const maxRows = Math.max(1, ...[...byLevel.values()].map((arr) => arr.length));
  const coreHeight = Math.max(160, (maxRows - 1) * rowGap);

  // Preliminary barycenter ordering of each level
  const relYMap = new Map<string, number>();
  const assignLevelRelY = (items: Omit<CircuitNode, 'x' | 'y'>[]) => {
    if (items.length === 1) {
      relYMap.set(items[0].id, coreHeight / 2);
      return;
    }
    const span = (items.length - 1) * rowGap;
    const startY = (coreHeight - span) / 2;
    items.forEach((item, idx) => {
      relYMap.set(item.id, startY + idx * rowGap);
    });
  };

  assignLevelRelY(lvl0);
  for (let lvl = 1; lvl <= outLevel; lvl++) {
    const items = byLevel.get(lvl) ?? [];
    if (lvl < outLevel) {
      items.sort((a, b) => {
        const avgA =
          a.inputs.length > 0
            ? a.inputs.reduce((s, id) => s + (relYMap.get(id) ?? coreHeight / 2), 0) / a.inputs.length
            : coreHeight / 2;
        const avgB =
          b.inputs.length > 0
            ? b.inputs.reduce((s, id) => s + (relYMap.get(id) ?? coreHeight / 2), 0) / b.inputs.length
            : coreHeight / 2;
        return avgA - avgB || a.id.localeCompare(b.id, 'en');
      });
    }
    assignLevelRelY(items);
  }

  // Sort commutative gate inputs by source Y so pins never cross right in front of a gate
  for (const node of nodesMap.values()) {
    if (node.kind === 'gate' && node.inputs.length > 1) {
      const sortedInputs = [...node.inputs].sort((aId, bId) => {
        const ya = relYMap.get(aId) ?? 0;
        const yb = relYMap.get(bId) ?? 0;
        if (Math.abs(ya - yb) > 0.5) return ya - yb;
        const la = nodesMap.get(aId)?.level ?? 0;
        const lb = nodesMap.get(bId)?.level ?? 0;
        return lb - la;
      });
      nodesMap.set(node.id, { ...node, inputs: sortedInputs });
    }
  }

  // Rebuild byLevel with sorted inputs
  byLevel.clear();
  for (const n of nodesMap.values()) {
    const arr = byLevel.get(n.level);
    if (arr) arr.push(n);
    else byLevel.set(n.level, [n]);
  }
  for (let lvl = 0; lvl <= outLevel; lvl++) {
    const items = byLevel.get(lvl) ?? [];
    items.sort((a, b) => (relYMap.get(a.id) ?? 0) - (relYMap.get(b.id) ?? 0));
  }

  // Identify raw edge specs and classify multi-level skip edges (which need top/bottom bypass lanes)
  interface RawEdge {
    readonly fromId: string;
    readonly toId: string;
    readonly toPinIndex: number;
    readonly toPinCount: number;
    readonly netName: string;
    readonly fromLevel: number;
    readonly toLevel: number;
    readonly isSkip: boolean;
  }

  const rawEdges: RawEdge[] = [];
  for (let lvl = 1; lvl <= outLevel; lvl++) {
    const items = byLevel.get(lvl) ?? [];
    for (const node of items) {
      node.inputs.forEach((srcId, pinIdx) => {
        const src = nodesMap.get(srcId);
        if (!src) return;
        rawEdges.push({
          fromId: srcId,
          toId: node.id,
          toPinIndex: pinIdx,
          toPinCount: node.inputs.length,
          netName: src.netName,
          fromLevel: src.level,
          toLevel: node.level,
          isSkip: node.level - src.level > 1,
        });
      });
    }
  }

  // Assign top vs bottom horizontal bypass lanes for skip edges so no wire crosses an intermediate gate body
  const topSkipNets = new Map<string, number>();
  const bottomSkipNets = new Map<string, number>();
  const skipEdgeSide = new Map<string, 'top' | 'bottom'>();
  const midY = coreHeight / 2;

  for (const e of rawEdges) {
    if (!e.isSkip) continue;
    const fy = relYMap.get(e.fromId) ?? midY;
    const ty = relYMap.get(e.toId) ?? midY;
    const avg = (fy + ty) / 2;
    const side: 'top' | 'bottom' = avg <= midY ? 'top' : 'bottom';
    const key = `${e.fromId}->${e.toId}:${e.toPinIndex}`;
    skipEdgeSide.set(key, side);
    if (side === 'top') {
      if (!topSkipNets.has(e.fromId)) topSkipNets.set(e.fromId, topSkipNets.size);
    } else {
      if (!bottomSkipNets.has(e.fromId)) bottomSkipNets.set(e.fromId, bottomSkipNets.size);
    }
  }

  const topPadding = BASE_PAD_Y + topSkipNets.size * BYPASS_PITCH + (topSkipNets.size > 0 ? 22 : 0);
  const bottomPadding =
    BASE_PAD_Y + bottomSkipNets.size * BYPASS_PITCH + (bottomSkipNets.size > 0 ? 22 : 0);
  const totalHeight = Math.max(196, topPadding + coreHeight + bottomPadding);

  // Count how many distinct vertical tracks each inter-column gap [lvl -> lvl+1] needs
  // A gap `g` holds:
  //  - exit vertical trunks for nets leaving level `g` (adjacent edges or skip-edge launch trunks)
  //  - entry vertical trunks for skip edges arriving at level `g + 1`
  const gapExitNets = new Map<number, string[]>();
  const gapEntrySkipEdges = new Map<number, string[]>();

  const addUnique = (map: Map<number, string[]>, key: number, val: string) => {
    const arr = map.get(key);
    if (!arr) map.set(key, [val]);
    else if (!arr.includes(val)) arr.push(val);
  };

  for (const e of rawEdges) {
    if (!e.isSkip) {
      addUnique(gapExitNets, e.fromLevel, e.fromId);
    } else {
      addUnique(gapExitNets, e.fromLevel, `${e.fromId}#skip`);
      addUnique(gapEntrySkipEdges, e.toLevel - 1, `${e.fromId}->${e.toId}:${e.toPinIndex}`);
    }
  }

  // Sort exit nets in each gap by source Y so vertical trunks nest cleanly without tangling
  for (const [gap, list] of gapExitNets.entries()) {
    list.sort((a, b) => {
      const aBase = a.replace('#skip', '');
      const bBase = b.replace('#skip', '');
      const ya = relYMap.get(aBase) ?? 0;
      const yb = relYMap.get(bBase) ?? 0;
      if (Math.abs(ya - yb) > 0.5) return ya - yb;
      return a.localeCompare(b, 'en');
    });
    gapExitNets.set(gap, list);
  }

  // Compute dynamic X coordinate for every level based on track count in each gap
  const levelX: number[] = [PAD_X];
  for (let lvl = 0; lvl < outLevel; lvl++) {
    const exitCount = gapExitNets.get(lvl)?.length ?? 0;
    const entryCount = gapEntrySkipEdges.get(lvl)?.length ?? 0;
    const totalTracks = exitCount + entryCount;
    const neededGap =
      GATE_HALF_W_RIGHT + GATE_HALF_W_LEFT + 52 + Math.max(1, totalTracks) * TRACK_PITCH;
    const gapWidth = Math.max(BASE_COL_GAP, neededGap);
    levelX.push(levelX[lvl] + gapWidth);
  }

  // Finalize nodes with absolute (x, y)
  const nodes: CircuitNode[] = [];
  const nodeMap = new Map<string, CircuitNode>();
  for (let lvl = 0; lvl <= outLevel; lvl++) {
    const items = byLevel.get(lvl) ?? [];
    for (const item of items) {
      const absNode: CircuitNode = {
        ...item,
        x: levelX[lvl],
        y: topPadding + (relYMap.get(item.id) ?? coreHeight / 2),
      };
      nodes.push(absNode);
      nodeMap.set(absNode.id, absNode);
    }
  }

  // Helper to get exact output/input port coordinates for a node
  const getSourceAnchor = (n: CircuitNode): WirePoint => {
    if (n.kind === 'input' || n.kind === 'const') return { x: n.x + PORT_HALF_W, y: n.y };
    return { x: n.x + GATE_HALF_W_RIGHT, y: n.y };
  };

  const getDestAnchor = (n: CircuitNode, pinIdx: number, pinCount: number): WirePoint => {
    if (n.kind === 'output') return { x: n.x - PORT_HALF_W, y: n.y };
    const py = getGatePinY(n.y, pinIdx, pinCount);
    return { x: n.x - GATE_HALF_W_LEFT, y: py };
  };

  // Track fan-out counts per source node so we can mark true junction dots cleanly
  const fanOutBySource = new Map<string, number>();
  for (const e of rawEdges) {
    fanOutBySource.set(e.fromId, (fanOutBySource.get(e.fromId) ?? 0) + 1);
  }

  // Compute routed orthogonal polylines for every edge
  const edges: CircuitEdge[] = rawEdges.map((e) => {
    const from = nodeMap.get(e.fromId)!;
    const to = nodeMap.get(e.toId)!;
    const src = getSourceAnchor(from);
    const dst = getDestAnchor(to, e.toPinIndex, e.toPinCount);

    const exitGap = e.fromLevel;
    const exitZoneStart = levelX[exitGap] + GATE_HALF_W_RIGHT + 24;
    const exitList = gapExitNets.get(exitGap) ?? [];

    if (!e.isSkip) {
      const trackIdx = Math.max(0, exitList.indexOf(e.fromId));
      const trunkX = Math.min(
        dst.x - 20,
        exitZoneStart + trackIdx * TRACK_PITCH,
      );
      const points: WirePoint[] =
        Math.abs(src.y - dst.y) < 1
          ? [src, dst]
          : [src, { x: trunkX, y: src.y }, { x: trunkX, y: dst.y }, dst];
      const hasFanout = (fanOutBySource.get(e.fromId) ?? 0) > 1;
      return {
        fromId: e.fromId,
        toId: e.toId,
        toPinIndex: e.toPinIndex,
        toPinCount: e.toPinCount,
        netName: e.netName,
        points,
        branchPoint: hasFanout ? { x: trunkX, y: src.y } : undefined,
      };
    }

    // Multi-level skip edge: go out to launch trunk -> up/down to dedicated bypass lane -> across -> drop into destination gap -> pin
    const edgeKey = `${e.fromId}->${e.toId}:${e.toPinIndex}`;
    const side = skipEdgeSide.get(edgeKey) ?? 'top';
    const launchIdx = Math.max(0, exitList.indexOf(`${e.fromId}#skip`));
    const launchX = exitZoneStart + launchIdx * TRACK_PITCH;

    const entryGap = e.toLevel - 1;
    const entryList = gapEntrySkipEdges.get(entryGap) ?? [];
    const entryIdx = Math.max(0, entryList.indexOf(edgeKey));
    const entryZoneRight = levelX[e.toLevel] - GATE_HALF_W_LEFT - 20;
    const dropX = Math.max(
      levelX[entryGap] + GATE_HALF_W_RIGHT + 20,
      entryZoneRight - entryIdx * TRACK_PITCH,
    );

    const laneY =
      side === 'top'
        ? Math.max(20, topPadding - 34 - (topSkipNets.get(e.fromId) ?? 0) * BYPASS_PITCH)
        : Math.min(
            totalHeight - 20,
            topPadding + coreHeight + 34 + (bottomSkipNets.get(e.fromId) ?? 0) * BYPASS_PITCH,
          );

    const points: WirePoint[] = [
      src,
      { x: launchX, y: src.y },
      { x: launchX, y: laneY },
      { x: dropX, y: laneY },
      { x: dropX, y: dst.y },
      dst,
    ];
    const hasFanout = (fanOutBySource.get(e.fromId) ?? 0) > 1;
    return {
      fromId: e.fromId,
      toId: e.toId,
      toPinIndex: e.toPinIndex,
      toPinCount: e.toPinCount,
      netName: e.netName,
      points,
      branchPoint: hasFanout ? { x: launchX, y: src.y } : undefined,
    };
  });

  const width = Math.max(380, (levelX[outLevel] ?? PAD_X) + PAD_X + 36);
  const outputNames = decomposedOutputs.map((o) => o.outputName);

  return {
    outputName: outputNames[0] ?? 'Y',
    outputNames,
    variables,
    nodes,
    edges,
    internals,
    width,
    height: totalHeight,
    maxLevel: outLevel,
  };
}

/**
 * Single-output convenience wrapper for `buildMultiCircuitGraph`.
 */
export function buildCircuitGraph(
  ast: BoolNode,
  variables: readonly string[],
  outputName: string,
  notation: NotationStyle = 'engineering',
  explicitAnd = true,
  gateInputMode: GateInputMode = 'multi',
): CircuitGraph {
  return buildMultiCircuitGraph(
    [{ outputName, ast }],
    variables,
    notation,
    explicitAnd,
    gateInputMode,
  );
}

export function evaluateCircuitNodes(
  graph: CircuitGraph,
  inputEnv: Readonly<Record<string, 0 | 1>>,
): Record<string, 0 | 1> {
  const values: Record<string, 0 | 1> = {};
  const byLevel = [...graph.nodes].sort((a, b) => a.level - b.level);

  for (const node of byLevel) {
    if (node.kind === 'input') {
      values[node.id] = inputEnv[node.label] ?? 0;
    } else if (node.kind === 'const') {
      values[node.id] = node.label === '1' ? 1 : 0;
    } else if (node.kind === 'output') {
      values[node.id] = node.inputs[0] ? (values[node.inputs[0]] ?? 0) : 0;
    } else if (node.kind === 'gate' && node.gateType) {
      const inVals = node.inputs.map((id) => values[id] ?? 0);
      values[node.id] = evalGateValue(node.gateType, inVals);
    }
  }

  return values;
}

export function evalGateValue(gateType: GateType, inVals: readonly (0 | 1)[]): 0 | 1 {
  switch (gateType) {
    case 'NOT':
      return inVals[0] === 1 ? 0 : 1;
    case 'AND':
      return inVals.every((v) => v === 1) ? 1 : 0;
    case 'OR':
      return inVals.some((v) => v === 1) ? 1 : 0;
    case 'NAND':
      return inVals.every((v) => v === 1) ? 0 : 1;
    case 'NOR':
      return inVals.some((v) => v === 1) ? 0 : 1;
    case 'XOR': {
      let p = 0;
      for (const v of inVals) p ^= v;
      return p === 1 ? 1 : 0;
    }
    case 'XNOR': {
      let p = 0;
      for (const v of inVals) p ^= v;
      return p === 0 ? 1 : 0;
    }
  }
}

function tikzGatePort(gateType: GateType, arity: number): string {
  const n = Math.max(2, arity);
  switch (gateType) {
    case 'NOT':
      return 'not port';
    case 'AND':
      return `and port, number inputs=${n}`;
    case 'OR':
      return `or port, number inputs=${n}`;
    case 'NAND':
      return `nand port, number inputs=${n}`;
    case 'NOR':
      return `nor port, number inputs=${n}`;
    case 'XOR':
      return `xor port, number inputs=${n}`;
    case 'XNOR':
      return `xnor port, number inputs=${n}`;
  }
}

/**
 * Exports a publication-ready LaTeX `circuitikz` snippet using IEEE/ANSI or IEC logic ports.
 */
export function exportCircuitTikz(
  graph: CircuitGraph,
  symbolStyle: CircuitSymbolStyle,
  titleComment?: string,
  showGateMarkings = true,
): string {
  const scaleX = 3.0;
  const scaleY = 1.65;
  const maxY = Math.max(...graph.nodes.map((n) => n.y), 120);
  const toCoord = (x: number, y: number) => {
    const cx = ((x - PAD_X) / BASE_COL_GAP) * scaleX;
    const cy = ((maxY - y) / BASE_ROW_GAP) * scaleY;
    return `${cx.toFixed(2)}, ${cy.toFixed(2)}`;
  };
  const safeId = (id: string) => id.replace(/[^A-Za-z0-9]/g, '');

  const lines: string[] = [
    '% Requires: \\usepackage{circuitikz}',
    ...(titleComment ? [`% ${titleComment}`] : []),
    '\\begin{circuitikz}[',
    `  logic ports=${symbolStyle === 'ieee' ? 'ieee' : 'european'},`,
    '  every node/.style={font=\\sffamily\\small}',
    ']',
  ];

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  for (const node of graph.nodes) {
    const pos = toCoord(node.x, node.y);
    const tid = safeId(node.id);
    if (node.kind === 'input' || node.kind === 'const') {
      lines.push(`  \\node[left] (${tid}) at (${pos}) {$${node.label}$};`);
    } else if (node.kind === 'gate' && node.gateType) {
      const port = tikzGatePort(node.gateType, node.inputs.length);
      const marking = formatGateMarking(node.gateType, node.inputs.length);
      const labelText = showGateMarkings ? `${node.id} (${marking})` : node.id;
      lines.push(`  \\node[${port}] (${tid}) at (${pos}) {};`);
      lines.push(`  \\node[above=2pt, font=\\scriptsize] at (${tid}.north) {${labelText}};`);
    } else if (node.kind === 'output') {
      lines.push(`  \\node[right] (${tid}) at (${pos}) {$${node.label}$};`);
    }
  }

  lines.push('');
  for (const edge of graph.edges) {
    const from = nodeMap.get(edge.fromId);
    const to = nodeMap.get(edge.toId);
    if (!from || !to) continue;
    const srcAnchor = from.kind === 'gate' ? `${safeId(from.id)}.out` : `${safeId(from.id)}.east`;
    const dstAnchor =
      to.kind === 'gate'
        ? to.gateType === 'NOT'
          ? `${safeId(to.id)}.in`
          : `${safeId(to.id)}.in ${edge.toPinIndex + 1}`
        : `${safeId(to.id)}.west`;
    lines.push(`  \\draw (${srcAnchor}) -| ++(0.55,0) |- (${dstAnchor});`);
  }

  lines.push('\\end{circuitikz}');
  return lines.join('\n');
}

export function evalInternalSignals(
  internals: readonly InternalSignalDef[],
  env: Readonly<Record<string, 0 | 1>>,
): Record<string, 0 | 1> {
  const res: Record<string, 0 | 1> = {};
  for (const sig of internals) {
    res[sig.id] = evaluateBool(sig.ast, env);
  }
  return res;
}
