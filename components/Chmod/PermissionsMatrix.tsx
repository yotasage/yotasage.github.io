import {
  PERMISSION_RIGHTS,
  PERMISSION_ROLES,
  RIGHT_WEIGHTS,
  roleToOctalDigit,
  roleToSymbolicTriplet,
  SPECIAL_BIT_KEYS,
  specialBitsToDigit,
} from '../../lib/chmod/permissions';
import type {
  ChmodPermissions,
  PermissionAnalysis,
  PermissionRight,
  PermissionRole,
  SpecialBitKey,
  TargetKind,
} from '../../lib/chmod/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Chmod.module.css';

interface PermissionsMatrixProps {
  permissions: ChmodPermissions;
  analysis: PermissionAnalysis;
  targetKind: TargetKind;
  quickMode: boolean;
  specialOpen: boolean;
  onToggleSpecialOpen: () => void;
  onToggleRight: (role: PermissionRole, right: PermissionRight) => void;
  onToggleRowAll: (role: PermissionRole) => void;
  onToggleSpecial: (bit: SpecialBitKey) => void;
  onClearAll: () => void;
}

export default function PermissionsMatrix({
  permissions,
  analysis,
  targetKind,
  quickMode,
  specialOpen,
  onToggleSpecialOpen,
  onToggleRight,
  onToggleRowAll,
  onToggleSpecial,
  onClearAll,
}: PermissionsMatrixProps) {
  const { t } = useI18n();
  const specialDigit = specialBitsToDigit(permissions.special);
  const showSpecialPanel = specialOpen || specialDigit > 0;

  const formatRoleRights = (role: (typeof PERMISSION_ROLES)[number]): string => {
    const p = permissions[role];
    const items: string[] = [];
    if (p.read) items.push(t('chmod.summary.right.read'));
    if (p.write) items.push(t('chmod.summary.right.write'));
    if (p.execute) {
      items.push(
        targetKind === 'directory'
          ? t('chmod.summary.right.executeDir')
          : t('chmod.summary.right.executeFile'),
      );
    }
    if (items.length === 0) return t('chmod.summary.none');
    return items.join(', ');
  };

  return (
    <section className={styles.card} aria-label={t('chmod.matrix.ariaLabel')}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{t('chmod.matrix.title')}</h2>
        <button type="button" className={styles.buttonSmall} onClick={onClearAll}>
          {t('chmod.matrix.clearAll')}
        </button>
      </div>

      <div className={styles.matrixTableWrap}>
        <table className={styles.matrixTable}>
          <thead>
            <tr>
              <th scope="col">{t('chmod.matrix.entity')}</th>
              {PERMISSION_RIGHTS.map((right) => (
                <th key={right} scope="col" className={styles.colRight}>
                  <span>{t(`chmod.matrix.${right}` as const)}</span>
                  <span className={styles.weightHint}>({RIGHT_WEIGHTS[right]})</span>
                </th>
              ))}
              <th scope="col" className={styles.colOctal}>
                {t('chmod.matrix.value')}
              </th>
            </tr>
          </thead>
          <tbody>
            {PERMISSION_ROLES.map((role) => {
              const rolePerms = permissions[role];
              const digit = roleToOctalDigit(rolePerms);
              const specialFlag =
                role === 'owner'
                  ? permissions.special.setuid
                  : role === 'group'
                    ? permissions.special.setgid
                    : permissions.special.sticky;
              const specialChar = role === 'others' ? 't' : 's';
              const triplet = roleToSymbolicTriplet(rolePerms, specialFlag, specialChar);
              const roleLabel = t(`chmod.matrix.role.${role}` as const);

              return (
                <tr key={role}>
                  <th scope="row" className={styles.roleCell}>
                    <button
                      type="button"
                      className={styles.roleBtn}
                      onClick={() => onToggleRowAll(role)}
                      title={t('chmod.matrix.toggleRowAll', { role: roleLabel })}
                      aria-label={t('chmod.matrix.toggleRowAll', { role: roleLabel })}
                    >
                      <span className={styles.roleName}>{roleLabel}</span>
                      <span className={styles.roleSub}>
                        {t(`chmod.matrix.role.${role}Sub` as const)}
                      </span>
                    </button>
                  </th>

                  {PERMISSION_RIGHTS.map((right) => {
                    const checked = rolePerms[right];
                    const rightLabel = t(`chmod.matrix.${right}` as const);
                    const accessibleLabel = `${roleLabel} ${rightLabel}`;
                    return (
                      <td key={right} className={styles.colRight}>
                        <label
                          className={[
                            styles.checkCellLabel,
                            checked ? styles.checkCellChecked : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <input
                            type="checkbox"
                            className={styles.checkInput}
                            checked={checked}
                            onChange={() => onToggleRight(role, right)}
                            aria-label={accessibleLabel}
                          />
                          <span className={styles.checkCellText} aria-hidden="true">
                            {rightLabel}
                          </span>
                        </label>
                      </td>
                    );
                  })}

                  <td className={styles.colOctal}>
                    <div className={styles.rowSummary}>
                      <span className={styles.rowDigit}>{digit}</span>
                      <span className={styles.rowTriplet}>{triplet}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(!quickMode || specialDigit > 0) && (
        <div className={styles.specialSection}>
          <button
            type="button"
            className={styles.specialToggleBtn}
            aria-expanded={showSpecialPanel}
            onClick={onToggleSpecialOpen}
          >
            <span aria-hidden="true">{showSpecialPanel ? '▾' : '▸'}</span>
            <span>{t('chmod.matrix.specialToggle')}</span>
            {specialDigit > 0 && (
              <span className={styles.specialActiveMeta}>
                {t('chmod.matrix.specialActive', { digit: specialDigit })}
              </span>
            )}
          </button>

          {showSpecialPanel && (
            <div className={styles.specialGrid}>
              {SPECIAL_BIT_KEYS.map((bit) => {
                const checked = permissions.special[bit];
                const title = t(`chmod.matrix.special.${bit}` as const);
                const desc = t(`chmod.matrix.special.${bit}Desc` as const);
                return (
                  <label
                    key={bit}
                    className={[
                      styles.specialCardLabel,
                      checked ? styles.specialCardChecked : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <input
                      type="checkbox"
                      className={styles.checkInput}
                      checked={checked}
                      onChange={() => onToggleSpecial(bit)}
                      aria-label={title}
                    />
                    <span className={styles.specialCardText}>
                      <span className={styles.specialCardTitle}>{title}</span>
                      <span className={styles.specialCardDesc}>{desc}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className={styles.breakdownBox}>
        <span className={styles.fieldLabel}>{t('chmod.summary.breakdownTitle')}</span>
        <ul className={styles.breakdownList}>
          {PERMISSION_ROLES.map((role) => (
            <li key={role}>
              <span className={styles.breakdownRole}>
                {t(`chmod.matrix.role.${role}` as const)}:
              </span>
              <span>{formatRoleRights(role)}</span>
            </li>
          ))}
        </ul>
        {analysis.matchedPresetId && (
          <p className={styles.matchedLine}>
            {t('chmod.summary.matchedPreset', {
              octal: analysis.matchedPresetId,
              title: t(`chmod.preset.${analysis.matchedPresetId}.title` as 'chmod.preset.755.title'),
            })}
          </p>
        )}
      </div>
    </section>
  );
}
