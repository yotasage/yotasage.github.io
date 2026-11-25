import React, { useEffect, useMemo, useState } from 'react';

import { formatAmount, formatResidual, formatReturnLoss } from '../../lib/quantity';
import { goalMag, goalNode, goalPole, goalValue, isWithin } from '../../lib/smith/goal';
import { GOAL_MAG, GOAL_VSWR, goalGamma, goalPoint, goalStanding } from '../../lib/smith/goalView';
import { M_ANGLE, M_MAG, M_RL, M_VSWR, M_ZI, M_ZR, METRIC_STRIDE, evaluateCircuit } from '../../lib/smith/network';
import { askOf } from '../../lib/smith/state';
import type { Circuit } from '../../lib/smith/state';
import { toDegrees } from '../../lib/smith/convert';
import { translate, useI18n } from '../../lib/ui/i18n';
import type { Locale } from '../../lib/ui/translations';
import styles from '../../styles/Smith.module.css';
import { nodeLabel, nodeName } from './pathLayer';
import { complexText, gammaPolarText, shownDigits } from './readout';
import { subjectName } from './mathRows';
import { ShowEq } from './ShowEq';
import { getSmithLocale } from './smithText';
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
export function goalLine(c: Circuit, locale: Locale = getSmithLocale()): { distance: string; word: string; met: boolean } {
  const goal = askOf(c).goal;
  goalGamma(gg, 0, c, goal);
  const s = goalStanding(goal, gg[0], gg[1], c.z0);
  const word = s.mode === 'circle'
    ? translate(locale, s.met ? 'sm.nodes.wordOn' : 'sm.nodes.wordOff')
    : translate(locale, s.met ? 'sm.nodes.wordInside' : 'sm.nodes.wordOutside');
  return { distance: formatResidual(s.distance, '', shownDigits()), met: s.met, word };
}

const FIG: Record<string, string> = { r: 'r', g: 'g', x: 'x', b: 'b' };

/** The goal in words: what it is (with its node and how the chart draws it), whose distance follows and in what. */
function goalWords(c: Circuit, locale: Locale): { what: string; who: string; how: string } {
  const tr = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(locale, k, v);
  const goal = askOf(c).goal, n = c.parts.length, k = Math.min(goalNode(goal, n), n);
  const at = k === n ? '' : k === 0 ? tr('sm.nodes.atLoad') : tr('sm.nodes.atNode', { k });
  const who = k === n ? tr('sm.nodes.whoInput') : k === 0 ? tr('sm.nodes.whoLoad') : tr('sm.nodes.whoNode', { k });
  const p = goalPoint(goal);
  if (p) {
    const R = p.targetR ?? c.z0, X = p.targetX ?? 0;
    const centre = R === c.z0 && X === 0;
    const what = centre ? tr('sm.nodes.targetMatch') : R === Infinity ? tr('sm.nodes.targetOpen') : `Z = ${complexText(R, X, 'Ω')}`;
    return {
      what: centre
        ? tr('sm.nodes.pointWhatCentre', { what, at, vswr: num(GOAL_VSWR), mag: num(GOAL_MAG) })
        : tr('sm.nodes.pointWhatOther', { what, at, vswr: num(GOAL_VSWR) }),
      who,
      how: tr(centre ? 'sm.nodes.howCentre' : 'sm.nodes.howTarget'),
    };
  }
  const v = goalValue(goal), m = goalMag(goal), within = isWithin(goal);
  const rel = within ? (goal.kind === 'rl' ? '≥' : '≤') : '=';
  const mt = `|Γ| ${within ? '≤' : '='} ${fig(m)}`;
  const figure = goal.kind === 'mag' ? `|Γ| ${rel} ${fig(v)}` : goal.kind === 'vswr' ? `VSWR ${rel} ${fig(v)} (${mt})`
    : goal.kind === 'rl' ? tr('sm.nodes.rlFig', { rel, val: fig(v, 'dB'), mt }) : `${FIG[goal.kind]} = ${fig(v)}`;
  if (within) return { what: tr('sm.nodes.withinWhat', { figure, at }), who, how: tr('sm.nodes.howWithin') };
  const pole = goalPole(goal);
  const poleText = pole ? tr('sm.nodes.poleText', { fig: FIG[goal.kind], pole: tr(pole > 0 ? 'sm.nodes.poleOpen' : 'sm.nodes.poleShort') }) : '';
  return { what: tr('sm.nodes.circleWhat', { figure, at, pole: poleText }), who, how: tr('sm.nodes.howCircle') };
}

export default function Nodes({ circuit, selected, onSelect, onHover, digits }: NodesProps) {
  const { t, locale } = useI18n();
  const n = circuit.parts.length;
  const rows = useMemo(() => nodeTexts(circuit), [circuit, digits]);
  const line = useMemo(() => goalLine(circuit, locale), [circuit, digits, locale]);
  const words = useMemo(() => goalWords(circuit, locale), [circuit, digits, locale]);
  // Open beside the chart, closed on phones (read after mount, so the static page and the first render agree).
  const [open, setOpen] = useState(true);
  useEffect(() => { if (window.matchMedia('(max-width: 599px)').matches) setOpen(false); }, []);

  return (
    <section className={styles.panel} data-nodes="">
      <details className={styles.nodesBox} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className={`${styles.panelTitle} ${styles.nodesSummary}`}>
          <span>{t('sm.nodes.title')}</span>
          <Why k="nodes" />
          <span className={styles.panelNote}>{t('sm.nodes.note', { n: n + 1 })}</span>
        </summary>
        <ol className={styles.nodeList} aria-label={t('sm.nodes.listAria')}>
          {rows.map((r, k) => (
            <li key={k} className={styles.nodeItem}>
              <button type="button" className={styles.nodeRow} data-node-row={k} aria-pressed={k === selected}
                aria-label={t('sm.nodes.rowAria', { name: nodeName(k, n, locale), z: r.z, gamma: r.gamma, vswr: r.vswr, rl: r.rl })}
                onClick={() => onSelect(k)} onMouseEnter={() => onHover(k)} onMouseLeave={() => onHover(-1)}
                onFocus={() => onHover(k)} onBlur={() => onHover(-1)}>
                <span className={styles.nodeChip} data-end={k === n && n > 0 ? 'input' : k === 0 ? 'load' : undefined}>{nodeLabel(k, n)}</span>
                <span className={styles.nodeName}>{nodeName(k, n, locale)}</span>
                <span className={styles.nodeVals}>
                  <span><i>z</i><b data-v="z">{r.z}</b></span>
                  <span><i>Γ</i><b data-v="gamma">{r.gamma}</b></span>
                  <span><i>VSWR</i><b data-v="vswr">{r.vswr}</b></span>
                  <span><i>RL</i><b data-v="rl">{r.rl}</b></span>
                </span>
              </button>
              <ShowEq subject={{ t: 'node', k }} k={`node:${k}`} what={subjectName(circuit, { t: 'node', k })} back={t('sm.nodes.backTable')} />
            </li>
          ))}
        </ol>
        <p className={styles.goalText} data-goal-text="" data-inside={line.met ? '' : undefined}>
          <span className={styles.goalMark} aria-hidden="true" />
          {t('sm.nodes.goalPrefix')} {words.what}{words.what.endsWith('.') ? '' : '.'}
          {' '}{t('sm.nodes.goalBody', { who: words.who })} <b data-goal-distance="">{line.distance}</b> {words.how}: <strong>{line.word}</strong>.<Why k="goal" />
        </p>
      </details>
    </section>
  );
}
