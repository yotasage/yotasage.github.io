import {
  GATE_REFERENCE_LIST,
  type GateReferenceEntry,
  type ReferenceGateKind,
} from '../../lib/boolean/gateReference';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Boolean.module.css';
import dStyles from '../../styles/BooleanDiagrams.module.css';
import KatexSpan from '../KatexSpan';

export interface GateReferenceTabProps {
  readonly onTryGate: (expr: string) => void;
}

function GateMiniSvg({ kind, variant }: { kind: ReferenceGateKind; variant: 'ieee' | 'iec' }) {
  const stroke = 'var(--ds-ink)';
  const fill = 'var(--ds-surface-solid)';
  const hasBubble = kind === 'NOT' || kind === 'NAND' || kind === 'NOR' || kind === 'XNOR';
  const isUnary = kind === 'BUFFER' || kind === 'NOT';

  const left = 24;
  const top = 12;
  const h = 36;
  const y = top + h / 2;
  const bodyRight = hasBubble ? 70 : 78;

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

  return (
    <svg width="108" height="60" viewBox="0 0 108 60" role="img" aria-label={`${kind} ${variant.toUpperCase()} symbol`}>
      {/* Input leads */}
      {isUnary ? (
        <line x1={6} y1={y} x2={left + (variant === 'ieee' ? 4 : 0)} y2={y} stroke="var(--ds-ink-2)" strokeWidth={1.6} />
      ) : (
        <>
          <line x1={6} y1={y - 10} x2={left + (variant === 'ieee' && (kind === 'OR' || kind === 'NOR' || kind === 'XOR' || kind === 'XNOR') ? 6 : 0)} y2={y - 10} stroke="var(--ds-ink-2)" strokeWidth={1.6} />
          <line x1={6} y1={y + 10} x2={left + (variant === 'ieee' && (kind === 'OR' || kind === 'NOR' || kind === 'XOR' || kind === 'XNOR') ? 6 : 0)} y2={y + 10} stroke="var(--ds-ink-2)" strokeWidth={1.6} />
        </>
      )}
      {/* Output lead */}
      <line x1={hasBubble ? bodyRight + 8 : bodyRight} y1={y} x2={102} y2={y} stroke="var(--ds-ink-2)" strokeWidth={1.6} />

      {variant === 'iec' ? (
        <>
          <rect x={left} y={top} width={bodyRight - left} height={h} rx={2} fill={fill} stroke={stroke} strokeWidth={1.8} />
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
          d={`M ${left} ${top} L ${left + 26} ${top} A ${bodyRight - (left + 26)} ${h / 2} 0 0 1 ${left + 26} ${top + h} L ${left} ${top + h} Z`}
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
  return (
    <article className={dStyles.gateRefCard} data-testid={`gate-ref-${gate.id.toLowerCase()}`}>
      <div className={styles.identityHead}>
        <h3 className={styles.identityTitle}>{gate.name}</h3>
        <span className={styles.workTag}>{gate.marking2}</span>
      </div>

      <div className={dStyles.gateSymbolsRow}>
        <div className={dStyles.gateSymbolBox}>
          <GateMiniSvg kind={gate.id} variant="ieee" />
          <span className={dStyles.gateSymbolCaption}>{t('boolean.gates.ieee')}</span>
        </div>
        <div className={dStyles.gateSymbolBox}>
          <GateMiniSvg kind={gate.id} variant="iec" />
          <span className={dStyles.gateSymbolCaption}>{t('boolean.gates.iec')}</span>
        </div>
      </div>

      <div className={styles.identityFormula}>
        <KatexSpan text={gate.equationLatex} />
      </div>

      <div className={dStyles.gateRefBody}>
        <div className={styles.workContent}>
          <p className={styles.identitySummary}>{gate.summary}</p>
          <span className={styles.metaInline}>
            <strong>{t('boolean.gates.nandEq')}:</strong>{' '}
            <code className={styles.monoCode}>{gate.nandEquivalent}</code>
          </span>
          <span className={styles.metaInline}>
            <strong>{t('boolean.gates.norEq')}:</strong>{' '}
            <code className={styles.monoCode}>{gate.norEquivalent}</code>
          </span>
        </div>

        <div className={dStyles.tableWrap}>
          <table className={dStyles.truthTable} aria-label={`${gate.name} truth table`}>
            <thead>
              <tr>
                <th>A</th>
                {gate.arity === 2 && <th>B</th>}
                <th className={[dStyles.colSep, dStyles.thOutput].join(' ')}>Y</th>
              </tr>
            </thead>
            <tbody>
              {gate.rows.map((row, idx) => (
                <tr key={idx}>
                  <td className={row[0] === 1 ? dStyles.valOne : dStyles.valZero}>{row[0]}</td>
                  {gate.arity === 2 && (
                    <td className={row[1] === 1 ? dStyles.valOne : dStyles.valZero}>{row[1]}</td>
                  )}
                  <td
                    className={[
                      dStyles.colSep,
                      row[row.length - 1] === 1 ? dStyles.valOne : dStyles.valZero,
                    ].join(' ')}
                  >
                    {row[row.length - 1]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

  return (
    <div className={styles.workspacePanel}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>{t('boolean.gates.title')}</h2>
            <p className={styles.lead}>{t('boolean.gates.lead')}</p>
          </div>
        </div>
        <div className={styles.theoryBox}>
          <span>{t('boolean.gates.markingNote')}</span>
        </div>
      </div>

      <div className={dStyles.gateRefGrid}>
        {GATE_REFERENCE_LIST.map((gate) => (
          <GateCard key={gate.id} gate={gate} onTryGate={onTryGate} />
        ))}
      </div>
    </div>
  );
}
