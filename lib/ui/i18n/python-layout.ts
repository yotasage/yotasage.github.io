// EN/NB strings of the Python Playground's desktop dock layout added in L2a (components/Python/layout/):
// the Layout menu with its presets, the group tab strips and the splitters. Split from python.ts to keep
// both under 40 kB.
export const en = {
  'python.layoutButton': 'Layout',
  'python.layoutButtonTitle': 'Choose how the panels are arranged',
  'python.layoutMenuAria': 'Panel layout',
  'python.layoutPreset.classic': 'Classic',
  'python.layoutPreset.consoleBelow': 'Console below',
  'python.layoutPreset.wideOutput': 'Wide output below',
  'python.layoutPreset.sideBySide': 'Side by side',
  'python.layoutPreset.editorFocus': 'Editor focus',
  'python.layoutPreset.displayFocus': 'Display focus',
  'python.layoutPreset.custom': 'Custom',
  'python.layoutReset': 'Reset layout',
  'python.layoutGroupTabsAria': 'Switch between {names}',
  'python.layoutResize': 'Resize {a} and {b}',
  'python.layoutAnd': '{a} and {b}',
};

export const nb: Record<keyof typeof en, string> = {
  'python.layoutButton': 'Oppsett',
  'python.layoutButtonTitle': 'Velg hvordan panelene er ordnet',
  'python.layoutMenuAria': 'Paneloppsett',
  'python.layoutPreset.classic': 'Klassisk',
  'python.layoutPreset.consoleBelow': 'Konsoll under',
  'python.layoutPreset.wideOutput': 'Bred utdata under',
  'python.layoutPreset.sideBySide': 'Side om side',
  'python.layoutPreset.editorFocus': 'Fokus på editoren',
  'python.layoutPreset.displayFocus': 'Fokus på skjermen',
  'python.layoutPreset.custom': 'Egendefinert',
  'python.layoutReset': 'Tilbakestill oppsettet',
  'python.layoutGroupTabsAria': 'Bytt mellom {names}',
  'python.layoutResize': 'Endre størrelsen på {a} og {b}',
  'python.layoutAnd': '{a} og {b}',
};
