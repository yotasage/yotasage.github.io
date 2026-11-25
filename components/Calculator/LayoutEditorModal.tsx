import React, { useEffect, useMemo, useState } from 'react';

import { parseEquation } from '../../lib/calc/invert';
import {
  LAYOUT_CATEGORIES,
  type LayoutCategory,
  type LayoutVariable,
  type SmartCalcLayoutV1,
  validateLayoutJson,
} from '../../lib/calc/layouts';
import { useI18n } from '../../lib/ui/i18n';
import calcStyles from '../../styles/Calculator.module.css';
import styles from '../../styles/CalculatorLayouts.module.css';
import PillTabs, { type PillTabItem } from '../UI/PillTabs';

export interface LayoutEditorModalProps {
  open: boolean;
  initialTab: 'editor' | 'import';
  editingLayout: SmartCalcLayoutV1 | null;
  onClose: () => void;
  onSaveLayout: (layout: SmartCalcLayoutV1) => void;
  onImportLayouts: (layouts: readonly SmartCalcLayoutV1[]) => void;
}

type ModalTab = 'editor' | 'import';

interface VarDraft {
  symbol: string;
  label: string;
  defaultUnit: string;
  example: string;
}

const DEFAULT_VARS: VarDraft[] = [
  { symbol: 'y', label: 'Output (y)', defaultUnit: '', example: '10' },
  { symbol: 'x', label: 'Input (x)', defaultUnit: '', example: '2' },
];

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  return `custom-${base || 'layout'}-${Date.now().toString(36)}`;
}

export default function LayoutEditorModal({
  open,
  initialTab,
  editingLayout,
  onClose,
  onSaveLayout,
  onImportLayouts,
}: LayoutEditorModalProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<ModalTab>(initialTab);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<LayoutCategory>('custom');
  const [description, setDescription] = useState('');
  const [equation, setEquation] = useState('');
  const [vars, setVars] = useState<VarDraft[]>(DEFAULT_VARS);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importText, setImportText] = useState('');

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setSaveError(null);
    setImportText('');
    if (editingLayout) {
      setName(editingLayout.name);
      setCategory(editingLayout.category);
      setDescription(editingLayout.description);
      setEquation(editingLayout.equation);
      setVars(
        editingLayout.variables.map((v) => ({
          symbol: v.symbol,
          label: v.label,
          defaultUnit: v.defaultUnit ?? '',
          example: v.example ?? '',
        })),
      );
    } else {
      setName('');
      setCategory('custom');
      setDescription('');
      setEquation('y = 2 * pi * x');
      setVars([
        { symbol: 'y', label: t('calc.modal.defaultOut'), defaultUnit: '', example: '10' },
        { symbol: 'x', label: t('calc.modal.defaultIn'), defaultUnit: '', example: '2' },
      ]);
    }
  }, [open, initialTab, editingLayout, t]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const equationStatus = useMemo<{ ok: boolean; message?: string }>(() => {
    if (!equation.trim()) return { ok: false, message: t('calc.modal.errEmptyEq') };
    try {
      parseEquation(equation);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }, [equation, t]);

  const importValidation = useMemo(() => {
    if (!importText.trim()) return null;
    return validateLayoutJson(importText);
  }, [importText]);

  if (!open) return null;

  const modalTabs: readonly PillTabItem<ModalTab>[] = [
    { id: 'editor', label: t('calc.modal.tabEditor') },
    { id: 'import', label: t('calc.modal.tabImport') },
  ];

  const handleVarChange = (index: number, field: keyof VarDraft, value: string) => {
    setVars((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  const handleAddVar = () => {
    setVars((prev) => [...prev, { symbol: '', label: '', defaultUnit: '', example: '' }]);
  };

  const handleRemoveVar = (index: number) => {
    setVars((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedVars: LayoutVariable[] = vars
      .map((v) => ({
        symbol: v.symbol.trim(),
        label: v.label.trim() || v.symbol.trim(),
        defaultUnit: v.defaultUnit.trim() || undefined,
        example: v.example.trim() || undefined,
      }))
      .filter((v) => v.symbol.length > 0);

    const candidate: SmartCalcLayoutV1 = {
      schemaVersion: 1,
      id: editingLayout?.id ?? slugify(name),
      name: name.trim(),
      category,
      description: description.trim(),
      equation: equation.trim(),
      variables: cleanedVars,
    };

    const check = validateLayoutJson(JSON.stringify(candidate));
    if ('errors' in check) {
      setSaveError(check.errors.join(' · '));
      return;
    }
    if (check.layouts.length === 0) {
      setSaveError(t('calc.modal.errNoLayouts'));
      return;
    }

    setSaveError(null);
    onSaveLayout(check.layouts[0]);
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImportText(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = () => {
    if (!importValidation?.ok) return;
    onImportLayouts(importValidation.layouts);
    onClose();
  };

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calc-layout-modal-title"
      >
        <div className={styles.modalHeader}>
          <h2 id="calc-layout-modal-title" className={styles.modalTitle}>
            {t('calc.modal.title')}
          </h2>
          <button
            type="button"
            className={`${calcStyles.btnGhost} ${calcStyles.btnSmall}`}
            onClick={onClose}
            aria-label={t('calc.modal.cancel')}
          >
            ×
          </button>
        </div>

        <PillTabs<ModalTab>
          items={modalTabs}
          value={tab}
          onChange={setTab}
          ariaLabel={t('calc.modal.title')}
          size="sm"
        />

        {tab === 'editor' ? (
          <form className={styles.modalForm} onSubmit={handleSave}>
            <div className={styles.formRow2}>
              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>{t('calc.modal.name')}</span>
                <input
                  type="text"
                  className={styles.fieldInput}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('calc.modal.namePlaceholder')}
                  required
                />
              </label>

              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>{t('calc.modal.category')}</span>
                <select
                  className={styles.fieldInput}
                  value={category}
                  onChange={(e) => setCategory(e.target.value as LayoutCategory)}
                >
                  {LAYOUT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {t(`calc.layouts.cat.${cat}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>{t('calc.modal.description')}</span>
              <input
                type="text"
                className={styles.fieldInput}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('calc.modal.descPlaceholder')}
              />
            </label>

            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>{t('calc.modal.equation')}</span>
              <input
                type="text"
                className={styles.fieldInput}
                value={equation}
                onChange={(e) => setEquation(e.target.value)}
                placeholder="f_c = 1 / (2 * pi * R * C)"
                spellCheck={false}
                required
              />
              <span className={styles.fieldUnitHint}>{t('calc.modal.equationHint')}</span>
            </label>

            {!equationStatus.ok && equationStatus.message && (
              <div className={`${styles.validationBox} ${styles.validationErr}`}>
                {equationStatus.message}
              </div>
            )}

            <div className={styles.fieldGroup}>
              <div className={calcStyles.cardHeader}>
                <span className={styles.fieldLabel}>{t('calc.modal.variables')}</span>
                <button
                  type="button"
                  className={`${calcStyles.btnGhost} ${calcStyles.btnSmall}`}
                  onClick={handleAddVar}
                >
                  + {t('calc.modal.addVar')}
                </button>
              </div>

              {vars.map((v, idx) => (
                <div key={idx} className={styles.varEditorRow}>
                  <input
                    type="text"
                    className={styles.fieldInput}
                    value={v.symbol}
                    onChange={(e) => handleVarChange(idx, 'symbol', e.target.value)}
                    placeholder={t('calc.modal.symbol')}
                    aria-label={t('calc.modal.symbol')}
                    spellCheck={false}
                  />
                  <input
                    type="text"
                    className={styles.fieldInput}
                    value={v.label}
                    onChange={(e) => handleVarChange(idx, 'label', e.target.value)}
                    placeholder={t('calc.modal.label')}
                    aria-label={t('calc.modal.label')}
                  />
                  <input
                    type="text"
                    className={styles.fieldInput}
                    value={v.defaultUnit}
                    onChange={(e) => handleVarChange(idx, 'defaultUnit', e.target.value)}
                    placeholder={t('calc.modal.defaultUnit')}
                    aria-label={t('calc.modal.defaultUnit')}
                    spellCheck={false}
                  />
                  <input
                    type="text"
                    className={styles.fieldInput}
                    value={v.example}
                    onChange={(e) => handleVarChange(idx, 'example', e.target.value)}
                    placeholder={t('calc.modal.example')}
                    aria-label={t('calc.modal.example')}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className={`${calcStyles.btnGhost} ${calcStyles.btnSmall}`}
                    onClick={() => handleRemoveVar(idx)}
                    disabled={vars.length <= 2}
                    aria-label={t('calc.vars.delete')}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {saveError && (
              <div className={`${styles.validationBox} ${styles.validationErr}`}>
                {saveError}
              </div>
            )}

            <div className={styles.modalFooter}>
              <button type="button" className={calcStyles.btnGhost} onClick={onClose}>
                {t('calc.modal.cancel')}
              </button>
              <button type="submit" className={calcStyles.btnPrimary}>
                {t('calc.modal.save')}
              </button>
            </div>
          </form>
        ) : (
          <div className={styles.modalForm}>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>{t('calc.modal.pasteJson')}</span>
              <textarea
                className={styles.jsonTextarea}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={'{\n  "schemaVersion": 1,\n  "id": "my-formula",\n  "name": "My Formula",\n  "category": "custom",\n  "description": "...",\n  "equation": "y = 2 * x",\n  "variables": [...]\n}'}
                spellCheck={false}
              />
            </label>

            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>{t('calc.modal.uploadFile')}</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
              />
            </label>

            {importValidation && importValidation.ok && (
              <div className={`${styles.validationBox} ${styles.validationOk}`}>
                {t('calc.modal.validPreview', { count: importValidation.layouts.length })}
              </div>
            )}

            {importValidation && !importValidation.ok && 'errors' in importValidation && (
              <div className={`${styles.validationBox} ${styles.validationErr}`}>
                <strong>{t('calc.modal.validationErrors')}</strong>
                <ul>
                  {importValidation.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className={styles.modalFooter}>
              <button type="button" className={calcStyles.btnGhost} onClick={onClose}>
                {t('calc.modal.cancel')}
              </button>
              <button
                type="button"
                className={calcStyles.btnPrimary}
                disabled={!importValidation?.ok}
                onClick={handleImportSubmit}
              >
                {t('calc.modal.importBtn')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
