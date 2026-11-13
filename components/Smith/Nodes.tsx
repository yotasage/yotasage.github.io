import React, { useEffect, useMemo, useState } from 'react';

import { formatAmount, formatResidual, formatReturnLoss } from '../../lib/quantity';
import { goalMag, goalNode, goalPole, goalValue, isWithin } from '../../lib/smith/goal';
import { GOAL_MAG, GOAL_VSWR, goalGamma, goalPoint, goalStanding } from '../../lib/smith/goalView';
import { M_ANGLE, M_MAG, M_RL, M_VSWR, M_ZI, M_ZR, METRIC_STRIDE, evaluateCircuit } from '../../lib/smith/network';
import { askOf } from '../../lib/smith/state';
import type { Circuit } from '../../lib/smith/state';
import { toDegrees } from '../../lib/smith/convert';
import styles from '../../styles/Smith.module.css';
import { nodeLabel, nodeName } from './pathLayer';
import { complexText, gammaPolarText, shownDigits } from './readout';
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
  /** The digits setting (readout.ts shownDigits; a prop so that a change re-renders the table). */
  digits: number;
}

// The digits setting's digits (readout.ts), with their zeros; a goal's figure as typed (no trailing zeros).
const num = (v: number, unit = ''): string => formatAmount(v, unit, shownDigits(), true);
const fig = (v: number, unit = ''): string => formatAmount(v, unit, shownDigits());

export interface NodeTexts { z: string; gamma: string; vswr: string; rl: string }

/** The texts of every node of the circuit at f0, as the table shows them. */
export function nodeTexts(c: Circuit): NodeTexts[] {
  const { metrics } = evaluateCircuit(c);
  const out: NodeTexts[] = [];
  for (let k = 0, m = 0; k <= c.parts.length; k++, m += METRIC_STRIDE) {
    out.push({
      z: complexText(metrics[m + M_ZR], metrics[m + M_ZI], ''),
      gamma: gammaPolarText(metrics[m + M_MAG], toDegrees(metrics[m + M_ANGLE])),
      vswr: num(metrics[m + M_VSWR]),
      rl: formatReturnLoss(metrics[m + M_RL], shownDigits()),
    });
  }
  return out;
}

const gg = new Float64Array(2);

/** How the goal's node stands to the goal (M4.3b: the circuit's goal): the distance's text, the word and whether it holds. */
export function goalLine(c: Circuit): { distance: string; word: string; met: boolean } {
  const goal = askOf(c).goal;
  goalGamma(gg, 0, c, goal);
  const s = goalStanding(goal, gg[0], gg[1], c.z0);
  return { distance: formatResidual(s.distance, '', shownDigits()), met: s.met, word: s.mode === 'circle' ? (s.met ? 'on it' : 'off it') : s.met ? 'inside' : 'outside' };
}

const FIG: Record<string, string> = { r: 'r', g: 'g', x: 'x', b: 'b' };

/** The goal in words: what it is (with its node and how the chart draws it), whose distance follows and in what. */
function goalWords(c: Circuit): { what: string; who: string; how: string } {
  const goal = askOf(c).goal, n = c.parts.length, k = Math.min(goalNode(goal, n), n);
  const at = k === n ? '' : ` at ${k === 0 ? 'the load' : `node ${k}`}`;
  const who = k === n ? 'The input' : k === 0 ? 'The load' : `Node ${k}`;
  const p = goalPoint(goal);
  if (p) {
    const R = p.targetR ?? c.z0, X = p.targetX ?? 0;
    const centre = R === c.z0 && X === 0;
    const what = centre ? 'the match (Γ = 0, the centre)' : R === Infinity ? 'the open (Γ = 1)' : `Z = ${complexText(R, X, 'Ω')}`;
    return {
      what: `${what}${at}, close enough within VSWR ${num(GOAL_VSWR)} ${centre ? `(|Γ| ≤ ${num(GOAL_MAG)}, dashed)` : 'of it (dashed)'}`,
      who, how: centre ? 'from it in |Γ|' : 'from it in |Γ| as seen from the target',
    };
  }
  const v = goalValue(goal), m = goalMag(goal), within = isWithin(goal);
  const rel = within ? (goal.kind === 'rl' ? '≥' : '≤') : '=';
  const mt = `|Γ| ${within ? '≤' : '='} ${fig(m)}`;
  const figure = goal.kind === 'mag' ? `|Γ| ${rel} ${fig(v)}` : goal.kind === 'vswr' ? `VSWR ${rel} ${fig(v)} (${mt})`
    : goal.kind === 'rl' ? `return loss ${rel} ${fig(v, 'dB')} (${mt})` : `${FIG[goal.kind]} = ${fig(v)}`;
  if (within) return { what: `${figure}${at} (dashed)`, who, how: 'from the centre in |Γ|' };
  const pole = goalPole(goal);
  const poleText = pole ? ` Every ${FIG[goal.kind]} circle runs through the ${pole > 0 ? 'open (Γ = 1)' : 'short (Γ = −1)'}, crossed out: a value that makes it is no answer.` : '';
  return { what: `the circle ${figure}${at} (dashed).${poleText}`, who, how: 'from it in Γ' };
}

export default function Nodes({ circuit, selected, onSelect, onHover, digits }: NodesProps) {
  const n = circuit.parts.length;
  const rows = useMemo(() => nodeTexts(circuit), [circuit, digits]);
  const line = useMemo(() => goalLine(circuit), [circuit, digits]);
  const words = useMemo(() => goalWords(circuit), [circuit, digits]);
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
        <p className={styles.goalText} data-goal-text="" data-inside={line.met ? '' : undefined}>
          <span className={styles.goalMark} aria-hidden="true" />
          Goal: {words.what}{words.what.endsWith('.') ? '' : '.'}
          {' '}{words.who} is <b data-goal-distance="">{line.distance}</b> {words.how}: <strong>{line.word}</strong>.<Why k="goal" />
        </p>
      </details>
    </section>
  );
}
