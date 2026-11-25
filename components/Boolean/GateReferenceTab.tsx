import { useMemo, useState } from 'react';

import {
  buildGateReferenceList,
  type GateBaseInputs,
  type GateReferenceEntry,
  type ReferenceGateKind,
} from '../../lib/boolean/gateReference';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Boolean.module.css';
import dStyles from '../../styles/BooleanDiagrams.module.css';
import KatexSpan from '../KatexSpan';
import { TableSelectionBar, useTableSelection } from './useTableSelection';

export interface GateReferenceTabProps {
  readonly onTryGate: (expr: string) => void;
}

const BASE_INPUT_OPTIONS: readonly GateBaseInputs[] = [2, 3, 4];

function computePinYs(top: number, h: number, count: number): number[] {
  if (count === 1) return [top + h / 2];
  const pad = count === 2 ? 10 : count === 3 ? 7 : 6;
  const usable = h - pad * 2;
  const step = usable / (count - 1);
  return Array.from({ length: count }, (_, idx) => top + pad + idx * step);
}

function GateMiniSvg({
  kind,
  variant,
  inputNames,
}: {
  kind: ReferenceGateKind;
  variant: 'ieee' | 'iec';
  inputNames: readonly string[];
}) {
  const stroke = 'var(--ds-ink)';
  const fill = 'var(--ds-surface-solid)';
  const hasBubble = kind === 'NOT' || kind === 'NAND' || kind === 'NOR' || kind === 'XNOR';
  const count = inputNames.length;

  const h = count >= 4 ? 50 : count === 3 ? 42 : 36;
  const svgH = h + 24;
  const top = 12;
  const y = top + h / 2;
  const left = 34;
  const bodyRight = hasBubble ? 80 : 88;
  const pinYs = computePinYs(top, h, count);

  const iecText: Record<ReferenceGateKind, string> = {
    BUFFER: '1',
    NOT: '1',
    AND: '&',
    NAND: '&',
    OR: '≥1',
    NOR: '≥1',
    XOR: '=1',
    XNOR: '=1',
  };

  const { t } = useI18n();
  const isCurvedLeft =
    variant === 'ieee' && (kind === 'OR' || kind === 'NOR' || kind === 'XOR' || kind === 'XNOR');

  return (
    <svg
      width="126"
      height={svgH}
      viewBox={`0 0 126 ${svgH}`}
      role="img"
      aria-label={t('boolean.gates.symbolAria', { name: `${kind}${count}`, style: variant.toUpperCase() })}
    >
      {/* Input leads & pin labels */}
      {pinYs.map((py, idx) => {
        const bodyEntryX =
          variant === 'ieee' && (kind === 'BUFFER' || kind === 'NOT')
            ? left + 4
            : isCurvedLeft
              ? left + (kind === 'XOR' || kind === 'XNOR' ? 4 : 6)
              : left;
        return (
          <g key={inputNames[idx]}>
            <text
              x={11}
              y={py + 3}
              textAnchor="end"
              fontSize="9"
              fontWeight={650}
              fill="var(--ds-ink-3)"
              fontFamily="var(--ds-font-mono)"
            >
              {inputNames[idx]}
            </text>
            <line
              x1={15}
              y1={py}
              x2={bodyEntryX}
              y2={py}
              stroke="var(--ds-ink-2)"
              strokeWidth={1.6}
            />
          </g>
        );
      })}

      {/* Output lead & label */}
      <line
        x1={hasBubble ? bodyRight + 8 : bodyRight}
        y1={y}
        x2={110}
        y2={y}
        stroke="var(--ds-ink-2)"
        strokeWidth={1.6}
      />
      <text
        x={114}
        y={y + 3.5}
        textAnchor="start"
        fontSize="9.5"
        fontWeight={700}
        fill="var(--ds-ink-2)"
        fontFamily="var(--ds-font-mono)"
      >
        Y
      </text>

      {variant === 'iec' ? (
        <>
          <rect
            x={left}
            y={top}
            width={bodyRight - left}
            height={h}
            rx={2}
            fill={fill}
            stroke={stroke}
            strokeWidth={1.8}
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
            {iecText[kind]}
          </text>
        </>
      ) : kind === 'BUFFER' || kind === 'NOT' ? (
        <polygon
          points={`${left + 4},${top + 3} ${left + 4},${top + h - 3} ${bodyRight},${y}`}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      ) : kind === 'AND' || kind === 'NAND' ? (
        <path
          d={`M ${left} ${top} L ${left + 24} ${top} A ${bodyRight - (left + 24)} ${h / 2} 0 0 1 ${left + 24} ${top + h} L ${left} ${top + h} Z`}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      ) : (
        <>
          {(kind === 'XOR' || kind === 'XNOR') && (
            <path
              d={`M ${left} ${top} Q ${left + 10} ${y} ${left} ${top + h}`}
              fill="none"
              stroke={stroke}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          )}
          <path
            d={`M ${kind === 'XOR' || kind === 'XNOR' ? left + 6 : left} ${top} Q ${(kind === 'XOR' || kind === 'XNOR' ? left + 6 : left) + 10} ${y} ${kind === 'XOR' || kind === 'XNOR' ? left + 6 : left} ${top + h} Q ${(kind === 'XOR' || kind === 'XNOR' ? left + 6 : left) + 24} ${top + h} ${bodyRight} ${y} Q ${(kind === 'XOR' || kind === 'XNOR' ? left + 6 : left) + 24} ${top} ${kind === 'XOR' || kind === 'XNOR' ? left + 6 : left} ${top} Z`}
            fill={fill}
            stroke={stroke}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        </>
      )}

      {hasBubble && (
        <circle cx={bodyRight + 4} cy={y} r={4} fill={fill} stroke={stroke} strokeWidth={1.8} />
      )}
    </svg>
  );
}

function GateCard({
  gate,
  onTryGate,
}: {
  gate: GateReferenceEntry;
  onTryGate: (expr: string) => void;
}) {
  const { t } = useI18n();
  const gateGrid = useMemo<readonly (readonly string[])[]>(() => {
    const header = [...gate.inputNames, 'Y'];
    const rows = gate.rows.map((row) => [
      ...row.slice(0, gate.arity).map(String),
      String(row[row.length - 1]),
    ]);
    return [header, ...rows];
  }, [gate.inputNames, gate.rows, gate.arity]);

  const selection = useTableSelection(gateGrid);

  const vars = gate.inputNames.join(', ');
  const n = gate.arity;
  const gateName = t(`boolean.gate.${gate.id}.name` as TranslationKey);

  const gateSummary = (() => {
    switch (gate.id) {
      case 'BUFFER':
        return t('boolean.gate.BUFFER.summary');
      case 'NOT':
        return t('boolean.gate.NOT.summary');
      case 'AND':
        return t('boolean.gate.AND.summary', { n, vars });
      case 'OR':
        return t('boolean.gate.OR.summary', { n, vars });
      case 'NAND':
        return t('boolean.gate.NAND.summary', { n });
      case 'NOR':
        return t('boolean.gate.NOR.summary', { n });
      case 'XOR':
        return n === 2 ? t('boolean.gate.XOR.summary2') : t('boolean.gate.XOR.summaryN', { n, vars });
      case 'XNOR':
        return n === 2
          ? t('boolean.gate.XNOR.summary2')
          : t('boolean.gate.XNOR.summaryN', { n, evens: n === 4 ? '0, 2, 4' : '0, 2' });
    }
  })();

  const nandEq = (() => {
    switch (gate.id) {
      case 'AND':
        return n === 2 ? gate.nandEquivalent : t('boolean.gate.AND.nandN', { n, vars });
      case 'NAND':
        return t('boolean.gate.NAND.nandEq', { n, vars });
      case 'NOR':
        return t('boolean.gate.NOR.nandEq', { n });
      case 'XOR':
        return n === 2
          ? t('boolean.gate.XOR.nand2')
          : t('boolean.gate.XOR.nandN', { blocks: n - 1, total: (n - 1) * 4 });
      case 'XNOR':
        return n === 2 ? t('boolean.gate.XNOR.nand2') : t('boolean.gate.XNOR.nandN', { n });
      default:
        return gate.nandEquivalent;
    }
  })();

  const norEq = (() => {
    switch (gate.id) {
      case 'OR':
        return n === 2 ? gate.norEquivalent : t('boolean.gate.OR.norN', { n, vars });
      case 'NAND':
        return t('boolean.gate.NAND.norEq', { n });
      case 'NOR':
        return t('boolean.gate.NOR.norEq', { n, vars });
      case 'XOR':
        return n === 2
          ? t('boolean.gate.XOR.nor2')
          : t('boolean.gate.XOR.norN', { blocks: n - 1, total: (n - 1) * 5 });
      case 'XNOR':
        return n === 2 ? t('boolean.gate.XNOR.nor2') : t('boolean.gate.XNOR.norN', { n });
      default:
        return gate.norEquivalent;
    }
  })();

  return (
    <article className={dStyles.gateRefCard} data-testid={`gate-ref-${gate.id.toLowerCase()}`}>
      <div className={styles.identityHead}>
        <h3 className={styles.identityTitle}>{gateName}</h3>
        <span className={styles.workTag} data-testid={`gate-marking-${gate.id.toLowerCase()}`}>
          {gate.marking}
        </span>
      </div>

      <div className={dStyles.gateSymbolsRow}>
        <div className={dStyles.gateSymbolBox}>
          <GateMiniSvg kind={gate.id} variant="ieee" inputNames={gate.inputNames} />
          <span className={dStyles.gateSymbolCaption}>{t('boolean.gates.ieee')}</span>
        </div>
        <div className={dStyles.gateSymbolBox}>
          <GateMiniSvg kind={gate.id} variant="iec" inputNames={gate.inputNames} />
          <span className={dStyles.gateSymbolCaption}>{t('boolean.gates.iec')}</span>
        </div>
      </div>

      <div className={styles.identityFormula}>
        <KatexSpan text={gate.equationLatex} />
      </div>

      <div className={dStyles.gateRefBody}>
        <div className={styles.workContent}>
          <p className={styles.identitySummary}>{gateSummary}</p>
          <span className={styles.metaInline}>
            <strong>{t('boolean.gates.nandEq')}:</strong>{' '}
            <code className={styles.monoCode}>{nandEq}</code>
          </span>
          <span className={styles.metaInline}>
            <strong>{t('boolean.gates.norEq')}:</strong>{' '}
            <code className={styles.monoCode}>{norEq}</code>
          </span>
        </div>

        <div
          ref={selection.containerRef}
          tabIndex={0}
          onKeyDown={selection.onKeyDown}
          className={dStyles.selectableBox}
        >
          <div className={dStyles.tableWrap} style={{ maxHeight: 280, overflowY: 'auto' }}>
            <table
              className={[dStyles.truthTable, dStyles.selectableTable].join(' ')}
              aria-label={t('boolean.gates.tableAria', { name: `${gateName} (${gate.marking})` })}
            >
              <thead>
                <tr>
                  {gate.inputNames.map((v, cIdx) => (
                    <th
                      key={v}
                      {...selection.getCellProps(0, cIdx)}
                      className={selection.getCellClassName(0, cIdx)}
                    >
                      {v}
                    </th>
                  ))}
                  <th
                    {...selection.getCellProps(0, gate.arity)}
                    className={selection.getCellClassName(
                      0,
                      gate.arity,
                      [dStyles.colSep, dStyles.thOutput].join(' '),
                    )}
                  >
                    Y
                  </th>
                </tr>
              </thead>
              <tbody>
                {gate.rows.map((row, idx) => {
                  const gridRow = idx + 1;
                  return (
                    <tr key={idx}>
                      {row.slice(0, gate.arity).map((bit, bIdx) => (
                        <td
                          key={bIdx}
                          {...selection.getCellProps(gridRow, bIdx)}
                          className={selection.getCellClassName(
                            gridRow,
                            bIdx,
                            bit === 1 ? dStyles.valOne : dStyles.valZero,
                          )}
                        >
                          {bit}
                        </td>
                      ))}
                      <td
                        {...selection.getCellProps(gridRow, gate.arity)}
                        className={selection.getCellClassName(
                          gridRow,
                          gate.arity,
                          [
                            dStyles.colSep,
                            row[row.length - 1] === 1 ? dStyles.valOne : dStyles.valZero,
                          ].join(' '),
                        )}
                      >
                        {row[row.length - 1]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TableSelectionBar selection={selection} compact compactHint showIdleCopy />
        </div>
      </div>

      <div className={styles.identityFooter}>
        <code className={styles.monoCode}>Y = {gate.plainExpr}</code>
        <button
          type="button"
          className={[styles.btn, styles.btnSmall].join(' ')}
          onClick={() => onTryGate(`Y = ${gate.plainExpr}`)}
        >
          {t('boolean.gates.tryGate')}
        </button>
      </div>
    </article>
  );
}

export default function GateReferenceTab({ onTryGate }: GateReferenceTabProps) {
  const { t } = useI18n();
  const [baseInputs, setBaseInputs] = useState<GateBaseInputs>(2);

  const gates = useMemo(() => buildGateReferenceList(baseInputs), [baseInputs]);

  return (
    <div className={styles.workspacePanel}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>{t('boolean.gates.title')}</h2>
            <p className={styles.lead}>{t('boolean.gates.lead')}</p>
          </div>

          <div className={styles.layoutToggleWrap}>
            <span className={styles.layoutToggleLabel}>{t('boolean.gates.baseInputs')}:</span>
            <div
              className={styles.segmented}
              role="group"
              aria-label={t('boolean.gates.baseInputs')}
              data-testid="gate-base-inputs-selector"
            >
              {BASE_INPUT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={baseInputs === n}
                  data-testid={`gate-inputs-${n}`}
                  className={[styles.segBtn, baseInputs === n ? styles.segBtnActive : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setBaseInputs(n)}
                >
                  {t('boolean.gates.inputsCount', { count: n })}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.theoryBox}>
          <span>
            {t('boolean.gates.markingNote')} {t('boolean.gates.baseInputsHint')}
          </span>
        </div>
      </div>

      <div className={dStyles.gateRefGrid}>
        {gates.map((gate) => (
          <GateCard key={gate.id} gate={gate} onTryGate={onTryGate} />
        ))}
      </div>
    </div>
  );
}
