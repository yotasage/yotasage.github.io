import React, { useEffect, useMemo, useState } from 'react';

import { formatAmount } from '../../lib/quantity';
import { M_ANGLE, M_MAG, M_RL, M_VSWR, M_ZI, M_ZR, METRIC_STRIDE, evaluateCircuit } from '../../lib/smith/network';
import type { Circuit } from '../../lib/smith/network';
import { toDegrees } from '../../lib/smith/convert';
import styles from '../../styles/Smith.module.css';
import { GOAL_MAG, GOAL_VSWR, nodeLabel, nodeName } from './pathLayer';
import { READOUT_DIGITS, complexText } from './readout';
import { Why } from './Why';

// The table of the path's nodes (step M3.2): for every node from the load to the input its z, Γ, VSWR and return
// loss at f0 (network.ts's figures in the readout's texts), and the input's distance to the goal. A row is a button:
// a click, Enter or Space selects the node (its marker on the chart is highlighted), hover and focus highlight it.
// On phones the table is a closed disclosure under the circuit panel.

export interface NodesProps {
  circuit: Circuit;
  /** The selected node (0 the load … n the input), −1 for none. */
  selected: number;
  onSelect: (k: number) => void;
  /** Hover or focus on a row (−1 when it ends): the chart highlights the node's marker. */
  onHover: (k: number) => void;
}

const num = (v: number, unit = ''): string => formatAmount(v, unit, READOUT_DIGITS, true);

export interface NodeTexts { z: string; gamma: string; vswr: string; rl: string }

/** The texts of every node of the circuit at f0, as the table shows them. */
export function nodeTexts(c: Circuit): NodeTexts[] {
  const { metrics } = evaluateCircuit(c);
  const out: NodeTexts[] = [];
  for (let k = 0, m = 0; k <= c.parts.length; k++, m += METRIC_STRIDE) {
    out.push({
      z: complexText(metrics[m + M_ZR], metrics[m + M_ZI], ''),
      gamma: `${num(metrics[m + M_MAG])} ∠ ${num(toDegrees(metrics[m + M_ANGLE]))}°`,
      vswr: num(metrics[m + M_VSWR]),
      rl: num(metrics[m + M_RL], 'dB'),
    });
  }
  return out;
}

export default function Nodes({ circuit, selected, onSelect, onHover }: NodesProps) {
  const n = circuit.parts.length;
  const rows = useMemo(() => nodeTexts(circuit), [circuit]);
  const { metrics } = useMemo(() => evaluateCircuit(circuit), [circuit]);
  const mag = metrics[n * METRIC_STRIDE + M_MAG];
  // Open beside the chart, closed on phones (read after mount, so the static page and the first render agree).
  const [open, setOpen] = useState(true);
  useEffect(() => { if (window.matchMedia('(max-width: 599px)').matches) setOpen(false); }, []);

  return (
    <section className={styles.panel} data-nodes="">
      <details className={styles.nodesBox} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className={`${styles.panelTitle} ${styles.nodesSummary}`}>
          <span>Nodes</span>
          <Why k="nodes" />
          <span className={styles.panelNote}>{n + 1} · load → input · at f0</span>
        </summary>
        <ol className={styles.nodeList} aria-label="Nodes from the load to the input">
          {rows.map((t, k) => (
            <li key={k}>
              <button type="button" className={styles.nodeRow} data-node-row={k} aria-pressed={k === selected}
                aria-label={`${nodeName(k, n)}: z ${t.z}, Γ ${t.gamma}, VSWR ${t.vswr}, return loss ${t.rl}`}
                onClick={() => onSelect(k)} onMouseEnter={() => onHover(k)} onMouseLeave={() => onHover(-1)}
                onFocus={() => onHover(k)} onBlur={() => onHover(-1)}>
                <span className={styles.nodeChip} data-end={k === n && n > 0 ? 'input' : k === 0 ? 'load' : undefined}>{nodeLabel(k, n)}</span>
                <span className={styles.nodeName}>{nodeName(k, n)}</span>
                <span className={styles.nodeVals}>
                  <span><i>z</i><b data-v="z">{t.z}</b></span>
                  <span><i>Γ</i><b data-v="gamma">{t.gamma}</b></span>
                  <span><i>VSWR</i><b data-v="vswr">{t.vswr}</b></span>
                  <span><i>RL</i><b data-v="rl">{t.rl}</b></span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className={styles.goalText} data-goal-text="" data-inside={mag <= GOAL_MAG ? '' : undefined}>
          <span className={styles.goalMark} aria-hidden="true" />
          Goal: the match (Γ = 0, the centre), close enough within VSWR {num(GOAL_VSWR)} (|Γ| ≤ {num(GOAL_MAG)}, dashed).
          {' '}The input is <b data-goal-distance="">{num(mag)}</b> from it in |Γ|: <strong>{mag <= GOAL_MAG ? 'inside' : 'outside'}</strong>.<Why k="goal" />
        </p>
      </details>
    </section>
  );
}
