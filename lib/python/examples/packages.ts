// Built-in example: using a package from PyPI that is not bundled (P6). The script never installs
// anything itself: installs are always the visitor's own click in the Packages tab (D18, D24).
import type { PythonExample } from './types';
import { pySource } from './types';

export const installPackageExample: PythonExample = {
  id: 'install_package',
  tag: 'packages',
  titleKey: 'python.example.install_package.title',
  descriptionKey: 'python.example.install_package.desc',
  entry: 'install_package/main.py',
  files: {
    'install_package/main.py': pySource(String.raw`
# Install a package
# Shows: using a package from PyPI that is not bundled with the playground.
#
# rich, a package on PyPI, draws tables and colours in the console.
# It is not bundled, so the first run explains how to add it. This script never
# installs anything itself: an install is always your own click in the Packages tab.

try:
    from rich import box
    from rich.console import Console
    from rich.table import Table
except ImportError:
    print("rich is not installed yet. To add it:")
    print("  1. Press 'Network: Off' at the top of the page, choose")
    print("     'Package index (PyPI)' and reload. Only pypi.org and")
    print("     files.pythonhosted.org become reachable.")
    print("  2. Open the Packages tab at the top of the page.")
    print("  3. Type rich into 'Add a package', press Install and confirm.")
    print("     Turn on Keep to have it back next time, even with the")
    print("     network off.")
    print("  4. Go back to the Workbench and press Run again.")
else:
    table = Table(title="Planets", box=box.ROUNDED)
    table.add_column("Planet", style="bold cyan")
    table.add_column("Distance (AU)", justify="right")
    table.add_column("Year (days)", justify="right", style="green")
    for name, au, days in [
        ("Mercury", 0.39, 88),
        ("Venus", 0.72, 225),
        ("Earth", 1.00, 365),
        ("Mars", 1.52, 687),
    ]:
        table.add_row(name, f"{au:.2f}", str(days))
    Console(force_terminal=True, width=48).print(table)
    print("Made with rich, installed from the Packages tab.")
`),
  },
};
