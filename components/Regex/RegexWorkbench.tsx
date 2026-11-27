import React from 'react';

import { applyExtractionTemplate, executeRegex } from '../../lib/regex/engine';
import { REGEX_EXAMPLES } from '../../lib/regex/examples';
import { filterFlagsForFlavor, FLAVORS } from '../../lib/regex/flavors';
import {
  DelimiterOption,
  ExtractJoinMode,
  ExtractionMode,
  RegexFlavorId,
  RegexFlagId,
} from '../../lib/regex/types';
import styles from '../../styles/Regex.module.css';
import ExplanationPanel, { InspectorTab } from './ExplanationPanel';
import ExtractionPanel from './ExtractionPanel';
import PatternBar from './PatternBar';
import TestStringPanel from './TestStringPanel';

export interface RegexWorkbenchState {
  pattern: string;
  testText: string;
  flavor: RegexFlavorId;
  delimiter: DelimiterOption;
  flags: RegexFlagId[];
  template: string;
  extractionMode: ExtractionMode;
  joinMode: ExtractJoinMode;
  activeExampleId: string | null;
}

interface RegexWorkbenchProps {
  state: RegexWorkbenchState;
  onStateChange: React.Dispatch<React.SetStateAction<RegexWorkbenchState>>;
  quickMode: boolean;
  resetVersion?: number;
}

export function createInitialWorkbenchState(): RegexWorkbenchState {
  const starter = REGEX_EXAMPLES[0];
  return {
    pattern: starter.pattern,
    testText: starter.testText,
    flavor: starter.flavor,
    delimiter: starter.delimiter,
    flags: [...starter.flags],
    template: starter.template,
    extractionMode: starter.extractionMode,
    joinMode: starter.joinMode,
    activeExampleId: starter.id,
  };
}

export default function RegexWorkbench({
  state,
  onStateChange,
  quickMode,
  resetVersion = 0,
}: RegexWorkbenchProps) {
  const [inspectorTab, setInspectorTab] = React.useState<InspectorTab>('explain');
  const [hoveredTokenId, setHoveredTokenId] = React.useState<string | null>(null);
  const [pinnedTokenId, setPinnedTokenId] = React.useState<string | null>(null);
  const [selectedMatchRange, setSelectedMatchRange] = React.useState<{
    start: number;
    end: number;
  } | null>(null);

  React.useEffect(() => {
    setPinnedTokenId(null);
    setHoveredTokenId(null);
    setSelectedMatchRange(null);
  }, [resetVersion]);

  // Press Escape to clear a pinned token highlight
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pinnedTokenId) {
        setPinnedTokenId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pinnedTokenId]);

  const result = React.useMemo(
    () =>
      executeRegex(
        state.pattern,
        state.testText,
        state.flavor,
        state.flags,
        state.delimiter,
      ),
    [state.pattern, state.testText, state.flavor, state.flags, state.delimiter],
  );

  const extraction = React.useMemo(
    () =>
      applyExtractionTemplate(
        state.testText,
        result.matches,
        state.template,
        state.extractionMode,
        state.joinMode,
      ),
    [state.testText, result.matches, state.template, state.extractionMode, state.joinMode],
  );

  const activeTokenId = pinnedTokenId ?? hoveredTokenId;
  const activeTokenSpans = React.useMemo(() => {
    if (!activeTokenId) return [];
    return result.tokenSpansByTokenId[activeTokenId] ?? [];
  }, [activeTokenId, result.tokenSpansByTokenId]);

  const handleFlavorChange = (nextFlavor: RegexFlavorId) => {
    const spec = FLAVORS[nextFlavor];
    onStateChange((prev) => ({
      ...prev,
      flavor: nextFlavor,
      delimiter: spec.defaultDelimiter,
      flags: filterFlagsForFlavor(
        prev.flags.length > 0 ? prev.flags : spec.defaultFlags,
        nextFlavor,
      ),
      activeExampleId: null,
    }));
    setPinnedTokenId(null);
  };

  const handleToggleFlag = (flag: RegexFlagId) => {
    onStateChange((prev) => {
      const exists = prev.flags.includes(flag);
      const nextFlags = exists
        ? prev.flags.filter((f) => f !== flag)
        : [...prev.flags, flag];
      return { ...prev, flags: nextFlags, activeExampleId: null };
    });
  };

  const handleResetDefaultFlags = () => {
    onStateChange((prev) => ({
      ...prev,
      flags: [...FLAVORS[prev.flavor].defaultFlags],
    }));
  };

  const handleClearAll = () => {
    onStateChange((prev) => ({
      ...prev,
      pattern: '',
      testText: '',
      template: '$0',
      activeExampleId: null,
    }));
    setPinnedTokenId(null);
    setHoveredTokenId(null);
    setSelectedMatchRange(null);
  };

  const handleInsertPatternToken = (tok: string) => {
    onStateChange((prev) => ({
      ...prev,
      pattern: prev.pattern + tok,
      activeExampleId: null,
    }));
  };

  const handleSelectMatchFromLens = (matchIndex: number) => {
    const match = result.matches[matchIndex];
    if (!match) return;
    setSelectedMatchRange({ start: match.start, end: match.end });
    setInspectorTab('matches');
  };

  return (
    <div className={styles.workbenchStack}>
      <PatternBar
        pattern={state.pattern}
        onPatternChange={(value) => {
          onStateChange((prev) => ({ ...prev, pattern: value, activeExampleId: null }));
          setPinnedTokenId(null);
        }}
        flavor={state.flavor}
        onFlavorChange={handleFlavorChange}
        delimiter={state.delimiter}
        onDelimiterChange={(delimiter) =>
          onStateChange((prev) => ({ ...prev, delimiter, activeExampleId: null }))
        }
        flags={state.flags}
        onToggleFlag={handleToggleFlag}
        onResetDefaultFlags={handleResetDefaultFlags}
        result={result}
        activeTokenId={activeTokenId}
        pinnedTokenId={pinnedTokenId}
        onClearPin={() => setPinnedTokenId(null)}
        onClearAll={handleClearAll}
      />

      <div className={quickMode ? styles.workbenchStack : styles.splitGrid}>
        <div className={styles.leftCol}>
          <TestStringPanel
            testText={state.testText}
            onTestTextChange={(value) =>
              onStateChange((prev) => ({ ...prev, testText: value, activeExampleId: null }))
            }
            matches={result.matches}
            activeTokenSpans={activeTokenSpans}
            selectedMatchRange={selectedMatchRange}
            onSelectMatchIndex={handleSelectMatchFromLens}
            hasActiveToken={activeTokenId !== null}
          />

          <ExtractionPanel
            mode={state.extractionMode}
            onModeChange={(extractionMode) =>
              onStateChange((prev) => ({ ...prev, extractionMode }))
            }
            template={state.template}
            onTemplateChange={(template) =>
              onStateChange((prev) => ({ ...prev, template }))
            }
            joinMode={state.joinMode}
            onJoinModeChange={(joinMode) =>
              onStateChange((prev) => ({ ...prev, joinMode }))
            }
            output={extraction.output}
            itemCount={extraction.items.length}
            groupNames={result.groupNames}
            flavor={state.flavor}
            pattern={state.pattern}
            flags={state.flags}
            delimiter={state.delimiter}
            showCodeSnippet={!quickMode}
          />
        </div>

        {!quickMode && (
          <div className={styles.rightCol}>
            <ExplanationPanel
              activeTab={inspectorTab}
              onTabChange={setInspectorTab}
              tokens={result.tokens}
              matches={result.matches}
              tokenSpansByTokenId={result.tokenSpansByTokenId}
              activeTokenId={activeTokenId}
              pinnedTokenId={pinnedTokenId}
              onHoverToken={setHoveredTokenId}
              onTogglePinToken={(tokenId) =>
                setPinnedTokenId((prev) => (prev === tokenId ? null : tokenId))
              }
              onHighlightRange={setSelectedMatchRange}
              onInsertPatternToken={handleInsertPatternToken}
            />
          </div>
        )}
      </div>
    </div>
  );
}
