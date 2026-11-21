import React from 'react';

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
    <div className={styles.passwordBox} role="region" aria-label={`Unlock ${fileName}`}>
      <p>
        <strong>{fileName}</strong> is password protected. Enter the password to unlock it.
        {remaining > 0 ? ` (${remaining} more waiting)` : ''}
      </p>
      <form className={styles.passwordForm} onSubmit={handleSubmit}>
        <input
          type="password"
          className={fieldStyles.input}
          placeholder="PDF password"
          autoFocus
          value={password}
          disabled={busy}
          aria-label={`Password for ${fileName}`}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className={styles.button} disabled={busy || !password}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
        <button type="button" className={styles.buttonSmall} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </form>
      {error && <div className={styles.fileError}>{error}</div>}
    </div>
  );
}
