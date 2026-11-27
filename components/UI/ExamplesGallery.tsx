import styles from '../../styles/DesignSystem.module.css';

export interface ExampleCardItem<Id extends string = string> {
  id: Id;
  tag: string;
  code: string;
  title: string;
  description: string;
  actionLabel?: string;
}

export interface ExamplesGalleryProps<Id extends string = string> {
  title: string;
  subtitle: string;
  items: readonly ExampleCardItem<Id>[];
  defaultActionLabel: string;
  loadingLabel?: string;
  loadingId?: Id | null;
  error?: string | null;
  padded?: boolean;
  onSelect: (id: Id) => void;
}

export default function ExamplesGallery<Id extends string = string>({
  title,
  subtitle,
  items,
  defaultActionLabel,
  loadingLabel,
  loadingId = null,
  error = null,
  padded = false,
  onSelect,
}: ExamplesGalleryProps<Id>) {
  const isAnyLoading = loadingId !== null;

  return (
    <div
      className={[styles.examplesContainer, padded ? styles.examplesPadded : '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.examplesHeader}>
        <h2 className={styles.examplesTitle}>{title}</h2>
        <p className={styles.examplesLead}>{subtitle}</p>
        {error && (
          <p className={styles.examplesError} role="alert">
            {error}
          </p>
        )}
      </div>

      <div className={styles.examplesGrid}>
        {items.map((item) => {
          const isLoading = loadingId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={styles.exampleCard}
              disabled={isAnyLoading}
              aria-busy={isLoading || undefined}
              onClick={() => onSelect(item.id)}
            >
              <div className={styles.exampleCardTop}>
                <span className={styles.exampleTag}>{item.tag}</span>
                <span className={styles.exampleCode}>{item.code}</span>
              </div>
              <h3 className={styles.exampleTitle}>{item.title}</h3>
              <p className={styles.exampleDesc}>{item.description}</p>
              <span className={styles.exampleAction}>
                {isLoading && loadingLabel ? loadingLabel : (item.actionLabel ?? defaultActionLabel)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
