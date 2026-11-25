// Built-in Python Playground examples, in the order the Examples tab and the Files picker list them.
// Each example lives in its own workspace folder (`<id>/`), so loading one never overwrites
// another example or the visitor's own main.py. Loading copies the files only; it never runs them.
import { asyncioExample, helloExample, inputColorsExample, modulesExample, softStopExample } from './basics';
import { csvJsonExample, htmlExample, pdfExample, pillowExample } from './files';
import { networkProbeExample } from './network';
import { installPackageExample } from './packages';
import { matplotlibExample, scienceExample } from './science';
import type { PythonExample } from './types';

export type { PythonExample, PythonExampleTag } from './types';
export { getPythonExampleTagKey, PYTHON_EXAMPLE_TAGS } from './types';
export { NETWORK_PROBE_HOSTS } from './network';

export const PYTHON_EXAMPLES: readonly PythonExample[] = [
  helloExample,
  inputColorsExample,
  softStopExample,
  modulesExample,
  scienceExample,
  matplotlibExample,
  pillowExample,
  pdfExample,
  csvJsonExample,
  htmlExample,
  asyncioExample,
  networkProbeExample,
  installPackageExample,
];

export function getPythonExample(id: string): PythonExample | undefined {
  return PYTHON_EXAMPLES.find((ex) => ex.id === id);
}
