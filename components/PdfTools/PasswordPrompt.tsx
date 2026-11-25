import React from 'react';

import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

export interface PasswordPromptProps {
  fileName: string;
  error?: string | null;
  busy?: boolean;
  remaining?: number;
  onSubmit: (password: string) => void | Promise<void>;
  onCancel: () => void;
}

export function PasswordPrompt({ fileName, error, busy = false, remaining = 0, onSubmit, onCancel }: PasswordPromptProps) {
  const { t } = useI18n();
  const [password, setPassword] = React.useState('');

  React.useEffect(() => {
    setPassword('');
  }, [fileName]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    void onSubmit(password);
  }

  return (
    <div className={styles.passwordBox} role="region" aria-label={t('pdf.ui.unlockAria', { fileName })}>
      <p>
        <strong>{fileName}</strong>
        {t('pdf.ui.passwordPrompt')}
        {remaining > 0 ? t('pdf.ui.moreWaiting', { n: remaining }) : ''}
      </p>
      <form className={styles.passwordForm} onSubmit={handleSubmit}>
        <input
          type="password"
          className={fieldStyles.input}
          placeholder={t('pdf.ui.passwordPh')}
          autoFocus
          value={password}
          disabled={busy}
          aria-label={t('pdf.ui.passwordAria', { fileName })}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className={styles.button} disabled={busy || !password}>
          {busy ? t('pdf.ui.unlocking') : t('pdf.ui.unlock')}
        </button>
        <button type="button" className={styles.buttonSmall} disabled={busy} onClick={onCancel}>
          {t('pdf.ui.cancel')}
        </button>
      </form>
      {error && <div className={styles.fileError}>{error}</div>}
    </div>
  );
}
