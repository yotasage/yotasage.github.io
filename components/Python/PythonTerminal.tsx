// Self-hosted xterm.js 6.0.0 terminal supporting Console (stdout/stderr + blocking input())
// and interactive REPL (>>> / ... prompts, history, Tab completion) with S6 v6 fixes.

import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';
import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import type { ReplCompletionsResult, ReplPushResult } from '../../lib/python/workerClient';
import { splitTokensIntoLines, tokenizeTerminalData } from '../../lib/python/terminalInput';
import { loadXterm, XTERM_THEMES } from '../../lib/python/xtermLoader';
import { useI18n } from '../../lib/ui/i18n';
import type { ResolvedTheme } from '../../lib/ui/theme';
import styles from '../../styles/Python.module.css';

export type TerminalMode = 'console' | 'repl';

export interface PythonTerminalHandle {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeSystem: (text: string) => void;
  clear: () => void;
  fit: () => void;
  focus: () => void;
  getPlainText: () => string;
  showReplPrompt: (continuation?: boolean) => void;
}

export interface PythonTerminalProps {
  mode: TerminalMode;
  visible: boolean;
  theme: ResolvedTheme;
  awaitingStdin?: boolean;
  replDisabled?: boolean;
  replBanner?: string;
  onStop?: () => void;
  onSendStdin?: (line: string) => void;
  onSendStdinEof?: () => void;
  onReplPush?: (line: string) => Promise<ReplPushResult>;
  onReplComplete?: (source: string) => Promise<ReplCompletionsResult>;
  /** Ctrl+C at the REPL prompt in a continuation line: drop the unfinished statement. */
  onReplCancelInput?: () => void;
  onExternalLink: (url: string) => void;
}

function normalizeTerminalNewlines(text: string): string {
  return text.replace(/\r?\n/g, '\r\n');
}

function stripAnsiForCopy(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r\n/g, '\n');
}

const PythonTerminal = React.forwardRef<PythonTerminalHandle, PythonTerminalProps>(
  function PythonTerminal(
    {
      mode,
      visible,
      theme,
      awaitingStdin = false,
      replDisabled = false,
      replBanner,
      onStop,
      onSendStdin,
      onSendStdinEof,
      onReplPush,
      onReplComplete,
      onReplCancelInput,
      onExternalLink,
    },
    ref,
  ) {
    const { t } = useI18n();
    const hostRef = useRef<HTMLDivElement | null>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const pendingWritesRef = useRef<string[]>([]);
    const plainLogRef = useRef<string[]>([]);

    // Interactive input/REPL line buffers inside xterm
    const lineBufRef = useRef<string>('');
    const replHistoryRef = useRef<string[]>([]);
    const replHistIdxRef = useRef<number>(-1);
    const replContinuationRef = useRef<boolean>(false);
    const replBusyRef = useRef<boolean>(false);
    const replPasteCancelRef = useRef<boolean>(false);
    const replBannerShownRef = useRef<boolean>(false);

    // Latest prop refs for stable event handlers
    const themeRef = useRef(theme);
    const awaitingStdinRef = useRef(awaitingStdin);
    const replDisabledRef = useRef(replDisabled);
    const onStopRef = useRef(onStop);
    const onSendStdinRef = useRef(onSendStdin);
    const onSendStdinEofRef = useRef(onSendStdinEof);
    const onReplPushRef = useRef(onReplPush);
    const onReplCompleteRef = useRef(onReplComplete);
    const onReplCancelInputRef = useRef(onReplCancelInput);
    const onExternalLinkRef = useRef(onExternalLink);

    themeRef.current = theme;
    awaitingStdinRef.current = awaitingStdin;
    replDisabledRef.current = replDisabled;
    onStopRef.current = onStop;
    onSendStdinRef.current = onSendStdin;
    onSendStdinEofRef.current = onSendStdinEof;
    onReplPushRef.current = onReplPush;
    onReplCompleteRef.current = onReplComplete;
    onReplCancelInputRef.current = onReplCancelInput;
    // Read at call time, so a language switch does not rebuild the terminal through submitReplLine.
    const tRef = useRef(t);
    tRef.current = t;
    onExternalLinkRef.current = onExternalLink;

    const [ready, setReady] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [stdinInput, setStdinInput] = useState('');
    const [replInput, setReplInput] = useState('');
    const [replContinuation, setReplContinuation] = useState(false);

    const writeRaw = useCallback((chunk: string) => {
      plainLogRef.current.push(stripAnsiForCopy(chunk));
      if (plainLogRef.current.length > 4000) {
        plainLogRef.current = plainLogRef.current.slice(-2000);
      }
      if (termRef.current) {
        termRef.current.write(chunk);
      } else {
        pendingWritesRef.current.push(chunk);
      }
    }, []);

    const printReplPrompt = useCallback(
      (continuation = false) => {
        replContinuationRef.current = continuation;
        setReplContinuation(continuation);
        const prompt = continuation ? '... ' : '>>> ';
        writeRaw(`\x1b[36m${prompt}\x1b[0m`);
      },
      [writeRaw],
    );

    const replaceCurrentInputLine = useCallback((nextText: string) => {
      const term = termRef.current;
      const prevLen = lineBufRef.current.length;
      lineBufRef.current = nextText;
      if (!term) return;
      if (prevLen > 0) {
        term.write('\b \b'.repeat(prevLen));
      }
      if (nextText) {
        term.write(nextText);
      }
    }, []);

    const submitReplLine = useCallback(
      async (line: string, echoInTerm: boolean): Promise<ReplPushResult | null> => {
        if (replDisabledRef.current || replBusyRef.current || !onReplPushRef.current) return null;
        replBusyRef.current = true;
        if (echoInTerm) {
          writeRaw(`${line}\r\n`);
        } else {
          writeRaw('\r\n');
        }
        if (line.trim().length > 0) {
          const hist = replHistoryRef.current;
          if (hist[hist.length - 1] !== line) {
            hist.push(line);
            if (hist.length > 200) hist.shift();
          }
        }
        replHistIdxRef.current = -1;
        lineBufRef.current = '';

        try {
          const res = await onReplPushRef.current(line);
          if (res.forceStopped) {
            // Force Stop restarted Python: say so, since the REPL's variables are gone.
            writeRaw(`KeyboardInterrupt\r\n\x1b[33m${tRef.current('python.replForceStopped')}\r\n\x1b[0m`);
          }
          if (res.status === 'incomplete') {
            printReplPrompt(true);
          } else {
            printReplPrompt(false);
          }
          return res;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          writeRaw(`\x1b[31m${normalizeTerminalNewlines(msg)}\r\n\x1b[0m`);
          printReplPrompt(false);
          return null;
        } finally {
          replBusyRef.current = false;
        }
      },
      [printReplPrompt, writeRaw],
    );

    const submitReplLines = useCallback(
      async (lines: readonly string[], trailing: string) => {
        if (lines.length === 0) return;
        replPasteCancelRef.current = false;
        const first = lines[0];
        if (first !== lineBufRef.current) {
          replaceCurrentInputLine(first);
        }
        for (let i = 0; i < lines.length; i += 1) {
          if (replPasteCancelRef.current || replDisabledRef.current) return;
          const res = await submitReplLine(lines[i], i > 0);
          if (!res || res.interrupted || res.forceStopped || res.status === 'syntax-error' || res.status === 'error') {
            return;
          }
        }
        if (!replPasteCancelRef.current && trailing.length > 0 && termRef.current) {
          lineBufRef.current = trailing;
          termRef.current.write(trailing);
        }
      },
      [replaceCurrentInputLine, submitReplLine],
    );

    useEffect(() => {
      let disposed = false;
      let resizeObserver: ResizeObserver | null = null;
      let rafId = 0;

      const host = hostRef.current;
      if (!host) return;

      // S6 fix #3: lightweight touch-swipe scrolling handler for xterm 6.0.0
      let lastY: number | null = null;
      let remainderPx = 0;
      const LINE_PX = 20;

      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 1) {
          lastY = e.touches[0].clientY;
          remainderPx = 0;
        }
      };
      const onTouchMove = (e: TouchEvent) => {
        const term = termRef.current;
        if (!term || lastY === null || e.touches.length !== 1) return;
        const dy = lastY - e.touches[0].clientY;
        lastY = e.touches[0].clientY;
        remainderPx += dy;
        const lines = Math.trunc(remainderPx / LINE_PX);
        if (lines !== 0) {
          remainderPx -= lines * LINE_PX;
          term.scrollLines(lines);
        }
      };
      const onTouchEnd = () => {
        lastY = null;
      };

      host.addEventListener('touchstart', onTouchStart, { passive: true });
      host.addEventListener('touchmove', onTouchMove, { passive: true });
      host.addEventListener('touchend', onTouchEnd, { passive: true });

      loadXterm()
        .then(({ Terminal, FitAddon, WebLinksAddon }) => {
          if (disposed || !hostRef.current) return;

          const term = new Terminal({
            cursorBlink: true,
            convertEol: false,
            scrollback: 5000,
            fontSize: 14,
            lineHeight: 1.35,
            fontFamily:
              "'JetBrains Mono Variable', ui-monospace, 'Cascadia Mono', 'SF Mono', Consolas, monospace",
            theme: XTERM_THEMES[themeRef.current],
          });

          const fitAddon = new FitAddon();
          const webLinksAddon = new WebLinksAddon((event, uri) => {
            event.preventDefault();
            onExternalLinkRef.current(uri);
          });

          term.loadAddon(fitAddon);
          term.loadAddon(webLinksAddon);
          term.open(hostRef.current);

          term.attachCustomKeyEventHandler((event) => {
            if (
              event.type === 'keydown' &&
              event.ctrlKey &&
              !event.metaKey &&
              !event.altKey &&
              (event.key === 'c' || event.key === 'C')
            ) {
              if (term.hasSelection()) {
                return true; // Allow copy when selection exists (S6)
              }
              event.preventDefault();
              if (mode === 'console') {
                lineBufRef.current = '';
                onStopRef.current?.();
              } else if (replBusyRef.current) {
                // A line is running: stop it, as Ctrl+C does in the Console (KeyboardInterrupt follows).
                replPasteCancelRef.current = true;
                onStopRef.current?.();
              } else if (!replDisabledRef.current) {
                // At the prompt, as in Python: drop the input (and an unfinished statement) with KeyboardInterrupt.
                replPasteCancelRef.current = true;
                if (replContinuationRef.current) onReplCancelInputRef.current?.();
                lineBufRef.current = '';
                replHistIdxRef.current = -1;
                writeRaw('^C\r\nKeyboardInterrupt\r\n');
                printReplPrompt(false);
              }
              return false;
            }
            return true;
          });

          term.onData((data) => {
            const tokens = tokenizeTerminalData(data);
            if (tokens.length === 0) return;

            if (mode === 'console') {
              if (!awaitingStdinRef.current) return;
              for (const tok of tokens) {
                if (tok.kind === 'newline') {
                  const line = lineBufRef.current;
                  lineBufRef.current = '';
                  writeRaw('\r\n');
                  onSendStdinRef.current?.(line);
                } else if (tok.kind === 'backspace') {
                  if (lineBufRef.current.length > 0) {
                    lineBufRef.current = lineBufRef.current.slice(0, -1);
                    term.write('\b \b');
                  }
                } else if (tok.kind === 'eof') {
                  lineBufRef.current = '';
                  writeRaw('^D\r\n');
                  onSendStdinEofRef.current?.();
                } else if (tok.kind === 'text') {
                  lineBufRef.current += tok.text;
                  term.write(tok.text);
                }
              }
              return;
            }

            // REPL mode interactive editing
            if (replDisabledRef.current || replBusyRef.current) return;

            // Single navigation / completion keystrokes
            if (tokens.length === 1) {
              const only = tokens[0];
              if (only.kind === 'up') {
                const hist = replHistoryRef.current;
                if (hist.length === 0) return;
                const nextIdx =
                  replHistIdxRef.current === -1
                    ? hist.length - 1
                    : Math.max(0, replHistIdxRef.current - 1);
                replHistIdxRef.current = nextIdx;
                replaceCurrentInputLine(hist[nextIdx] ?? '');
                return;
              }
              if (only.kind === 'down') {
                const hist = replHistoryRef.current;
                if (replHistIdxRef.current === -1) return;
                const nextIdx = replHistIdxRef.current + 1;
                if (nextIdx >= hist.length) {
                  replHistIdxRef.current = -1;
                  replaceCurrentInputLine('');
                } else {
                  replHistIdxRef.current = nextIdx;
                  replaceCurrentInputLine(hist[nextIdx] ?? '');
                }
                return;
              }
              if (only.kind === 'tab') {
                const current = lineBufRef.current;
                if (!onReplCompleteRef.current) return;
                void onReplCompleteRef.current(current).then((res) => {
                  if (!res.completions.length) return;
                  if (res.completions.length === 1) {
                    const completion = res.completions[0];
                    const next = current.slice(0, res.start) + completion;
                    replaceCurrentInputLine(next);
                  } else {
                    const preview = res.completions.slice(0, 12).join('  ');
                    writeRaw(`\r\n\x1b[90m${preview}\x1b[0m\r\n`);
                    printReplPrompt(replContinuationRef.current);
                    term.write(lineBufRef.current);
                  }
                });
                return;
              }
            }

            if (tokens.some((tok) => tok.kind === 'newline')) {
              const { lines, trailing } = splitTokensIntoLines(lineBufRef.current, tokens, {
                tabAsSpaces: true,
              });
              void submitReplLines(lines, trailing);
              return;
            }

            for (const tok of tokens) {
              if (tok.kind === 'backspace') {
                if (lineBufRef.current.length > 0) {
                  lineBufRef.current = lineBufRef.current.slice(0, -1);
                  term.write('\b \b');
                }
              } else if (tok.kind === 'text') {
                lineBufRef.current += tok.text;
                term.write(tok.text);
              } else if (tok.kind === 'tab') {
                lineBufRef.current += '    ';
                term.write('    ');
              }
            }
          });

          termRef.current = term;
          fitRef.current = fitAddon;

          if (pendingWritesRef.current.length > 0) {
            for (const chunk of pendingWritesRef.current) {
              term.write(chunk);
            }
            pendingWritesRef.current = [];
          }

          const safeFit = () => {
            if (disposed || !hostRef.current) return;
            if (hostRef.current.clientWidth > 0 && hostRef.current.clientHeight > 0) {
              try {
                fitAddon.fit();
              } catch {
                // Ignore transient fit errors during layout transitions.
              }
            }
          };

          safeFit();
          if (typeof document !== 'undefined' && document.fonts?.ready) {
            void document.fonts.ready.then(() => {
              if (!disposed) safeFit();
            });
          }

          if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => {
              cancelAnimationFrame(rafId);
              rafId = requestAnimationFrame(safeFit);
            });
            resizeObserver.observe(hostRef.current);
          }

          setReady(true);
        })
        .catch((err) => {
          if (!disposed) {
            setLoadError(err instanceof Error ? err.message : String(err));
          }
        });

      return () => {
        disposed = true;
        cancelAnimationFrame(rafId);
        resizeObserver?.disconnect();
        host.removeEventListener('touchstart', onTouchStart);
        host.removeEventListener('touchmove', onTouchMove);
        host.removeEventListener('touchend', onTouchEnd);
        termRef.current?.dispose();
        termRef.current = null;
        fitRef.current = null;
      };
    }, [mode, printReplPrompt, replaceCurrentInputLine, submitReplLines, writeRaw]);

    // Sync xterm theme when site theme changes
    useEffect(() => {
      if (termRef.current) {
        termRef.current.options.theme = XTERM_THEMES[theme];
      }
    }, [theme]);

    // Refit whenever panel becomes visible
    useEffect(() => {
      if (!visible) return;
      const id = requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
        } catch {
          // Ignore if not yet sized.
        }
      });
      return () => cancelAnimationFrame(id);
    }, [visible]);

    // Show REPL welcome banner + initial prompt once runtime is ready
    useEffect(() => {
      if (mode !== 'repl' || !ready || !replBanner || replBannerShownRef.current) return;
      replBannerShownRef.current = true;
      writeRaw(`\x1b[90m${normalizeTerminalNewlines(replBanner)}\r\n\x1b[0m`);
      printReplPrompt(false);
    }, [mode, ready, replBanner, printReplPrompt, writeRaw]);

    // Focus terminal when awaiting stdin on desktop
    useEffect(() => {
      if (awaitingStdin && visible && mode === 'console') {
        lineBufRef.current = '';
      }
    }, [awaitingStdin, visible, mode]);

    useImperativeHandle(
      ref,
      () => ({
        writeStdout: (text: string) => {
          writeRaw(normalizeTerminalNewlines(text));
        },
        writeStderr: (text: string) => {
          writeRaw(`\x1b[31m${normalizeTerminalNewlines(text)}\x1b[0m`);
        },
        writeSystem: (text: string) => {
          writeRaw(`\x1b[90m${normalizeTerminalNewlines(text)}\r\n\x1b[0m`);
        },
        clear: () => {
          plainLogRef.current = [];
          pendingWritesRef.current = [];
          lineBufRef.current = '';
          termRef.current?.clear();
          termRef.current?.reset();
          if (mode === 'repl') {
            printReplPrompt(false);
          }
        },
        fit: () => {
          try {
            fitRef.current?.fit();
          } catch {
            // Ignore transient fit failure.
          }
        },
        focus: () => {
          termRef.current?.focus();
        },
        getPlainText: () => plainLogRef.current.join(''),
        showReplPrompt: (continuation = false) => {
          if (mode === 'repl') {
            printReplPrompt(continuation);
          }
        },
      }),
      [mode, printReplPrompt, writeRaw],
    );

    const handleCopy = async () => {
      const text = plainLogRef.current.join('');
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } catch {
        // Ignore clipboard errors if denied.
      }
    };

    const handleClear = () => {
      plainLogRef.current = [];
      pendingWritesRef.current = [];
      lineBufRef.current = '';
      termRef.current?.clear();
      termRef.current?.reset();
      if (mode === 'repl') {
        printReplPrompt(false);
      }
    };

    const handleScrollBottom = () => {
      termRef.current?.scrollToBottom();
    };

    const handleStdinFormSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!awaitingStdin) return;
      const val = stdinInput;
      setStdinInput('');
      lineBufRef.current = '';
      writeRaw(`${val}\r\n`);
      onSendStdin?.(val);
    };

    const handleReplFormSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (replDisabled || replBusyRef.current) return;
      const val = replInput;
      setReplInput('');
      void submitReplLine(val, true);
    };

    return (
      <div
        className={styles.terminalPane}
        style={{ display: visible ? 'flex' : 'none' }}
        data-testid={mode === 'console' ? 'python-console-pane' : 'python-repl-pane'}
      >
        <div className={styles.terminalTools}>
          <span className={styles.terminalHint}>
            {mode === 'repl' && replDisabled
              ? t('python.replDisabledRunning')
              : t('python.programOutputHint')}
          </span>
          <div className={styles.terminalToolBtns}>
            <button
              type="button"
              className={styles.miniBtn}
              onClick={handleScrollBottom}
              title={t('python.scrollBottom')}
            >
              {t('python.scrollBottom')}
            </button>
            <button
              type="button"
              className={styles.miniBtn}
              onClick={() => {
                void handleCopy();
              }}
              data-testid={mode === 'console' ? 'python-console-copy' : 'python-repl-copy'}
            >
              {copied ? t('python.copiedConsole') : t('python.copyConsole')}
            </button>
            <button
              type="button"
              className={styles.miniBtn}
              onClick={handleClear}
              data-testid={mode === 'console' ? 'python-console-clear' : 'python-repl-clear'}
            >
              {t('python.clearConsole')}
            </button>
          </div>
        </div>

        <div
          className={styles.terminalHostWrap}
          style={{ backgroundColor: XTERM_THEMES[theme].background }}
        >
          {!ready && !loadError && (
            <div className={styles.panePlaceholder}>{t('python.loadingTerminal')}</div>
          )}
          {loadError && (
            <div className={styles.paneError} role="alert">
              {t('python.terminalLoadFailed', { reason: loadError })}
            </div>
          )}
          <div
            ref={hostRef}
            className={styles.terminalHost}
            data-testid={mode === 'console' ? 'python-console-xterm' : 'python-repl-xterm'}
          />
        </div>

        {mode === 'console' && awaitingStdin && (
          <form
            className={styles.stdinBar}
            onSubmit={handleStdinFormSubmit}
            data-testid="python-stdin-bar"
          >
            <span className={styles.stdinLabel} data-testid="python-program-asks">
              {t('python.programAsks')}
            </span>
            <input
              type="text"
              className={styles.stdinInput}
              value={stdinInput}
              onChange={(e) => setStdinInput(e.target.value)}
              placeholder={t('python.stdinPlaceholder')}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              data-testid="python-stdin-input"
            />
            <button
              type="submit"
              className={styles.stdinSubmitBtn}
              data-testid="python-stdin-send"
            >
              {t('python.stdinSend')}
            </button>
            <button
              type="button"
              className={styles.miniBtn}
              onClick={() => {
                setStdinInput('');
                lineBufRef.current = '';
                writeRaw('^D\r\n');
                onSendStdinEof?.();
              }}
              data-testid="python-stdin-eof"
            >
              {t('python.stdinEof')}
            </button>
          </form>
        )}

        {mode === 'repl' && (
          <form
            className={styles.stdinBar}
            onSubmit={handleReplFormSubmit}
            data-testid="python-repl-bar"
          >
            <span className={styles.replPromptLabel} aria-hidden="true">
              {replContinuation ? '...' : '>>>'}
            </span>
            <input
              type="text"
              className={styles.stdinInput}
              value={replInput}
              onChange={(e) => setReplInput(e.target.value)}
              placeholder={t('python.replPlaceholder')}
              disabled={replDisabled}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              data-testid="python-repl-input"
            />
            <button
              type="submit"
              className={styles.stdinSubmitBtn}
              disabled={replDisabled}
              data-testid="python-repl-submit"
            >
              {t('python.replSubmit')}
            </button>
          </form>
        )}
      </div>
    );
  },
);

export default PythonTerminal;
