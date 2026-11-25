// Manifest of yotasage_rt Python runtime modules synced into public/python/rt/ on install.

import { getPythonRuntimeBaseUrl } from '../origin';

export const YOTASAGE_RT_MODULES = [
  '__init__.py',
  'stdio.py',
  'shims.py',
  'runner.py',
  'repl.py',
  'mpl_backend.py',
  'packages.py',
  'vdisplay.py',
] as const;

export type YotasageRtModuleName = (typeof YOTASAGE_RT_MODULES)[number];

export function getYotasageRtModuleUrls(): Record<YotasageRtModuleName, string> {
  const base = getPythonRuntimeBaseUrl();
  return {
    '__init__.py': `${base}__init__.py`,
    'stdio.py': `${base}stdio.py`,
    'shims.py': `${base}shims.py`,
    'runner.py': `${base}runner.py`,
    'repl.py': `${base}repl.py`,
    'mpl_backend.py': `${base}mpl_backend.py`,
    'packages.py': `${base}packages.py`,
    'vdisplay.py': `${base}vdisplay.py`,
  };
}
