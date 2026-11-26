import React from 'react';

import { DEFAULT_OPTIONS, generateLorem, randomNextSeed } from '../../lib/lorem/generate';
import type { LoremOptions, LoremPreset } from '../../lib/lorem/types';
import styles from '../../styles/Lorem.module.css';
import ControlsPanel from './ControlsPanel';
import OutputPanel from './OutputPanel';

interface LoremWorkbenchProps {
  quickMode: boolean;
}

export default function LoremWorkbench({ quickMode }: LoremWorkbenchProps) {
  const [options, setOptions] = React.useState<LoremOptions>(DEFAULT_OPTIONS);

  const result = React.useMemo(() => generateLorem(options), [options]);

  const handleUpdate = React.useCallback((patch: Partial<LoremOptions>) => {
    setOptions((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleApplyPreset = React.useCallback((preset: LoremPreset) => {
    setOptions((prev) => ({
      ...prev,
      ...preset.options,
    }));
  }, []);

  const handleRegenerate = React.useCallback(() => {
    setOptions((prev) => ({
      ...prev,
      seed: randomNextSeed(prev.seed),
    }));
  }, []);

  const handleReset = React.useCallback(() => {
    setOptions(DEFAULT_OPTIONS);
  }, []);

  return (
    <div className={styles.workbench}>
      <ControlsPanel
        options={options}
        quickMode={quickMode}
        onUpdate={handleUpdate}
        onApplyPreset={handleApplyPreset}
        onReset={handleReset}
      />
      <OutputPanel
        result={result}
        mode={options.mode}
        format={options.format}
        onRegenerate={handleRegenerate}
      />
    </div>
  );
}
