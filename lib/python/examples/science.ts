// Built-in examples: NumPy/SciPy/SymPy quick calculations and a matplotlib figure for the Plots tab.
import type { PythonExample } from './types';
import { pySource } from './types';

export const scienceExample: PythonExample = {
  id: 'science',
  tag: 'science',
  packages: ['numpy', 'scipy', 'sympy'],
  titleKey: 'python.example.science.title',
  descriptionKey: 'python.example.science.desc',
  entry: 'science/main.py',
  files: {
    'science/main.py': pySource(String.raw`
# NumPy, SciPy and SymPy in a few lines
# Shows: one quick calculation with each library (all bundled, no network needed).
# Expect: the solution of two equations, an integral, a derivative and its roots.
import numpy as np
import sympy as sp
from scipy.integrate import quad

# NumPy: solve 3x + y = 9 and x + 2y = 8
A = np.array([[3.0, 1.0], [1.0, 2.0]])
b = np.array([9.0, 8.0])
x, y = np.linalg.solve(A, b)
print(f"NumPy  solve: x = {x:.3f}, y = {y:.3f}")

# SciPy: integral of exp(-t^2) from 0 to infinity (exactly sqrt(pi)/2)
value, _err = quad(lambda t: np.exp(-t * t), 0, np.inf)
print(f"SciPy  quad : {value:.6f}  (sqrt(pi)/2 = {np.sqrt(np.pi) / 2:.6f})")

# SymPy: differentiate symbolically, then find where the derivative is zero
t = sp.symbols("t")
f = t**3 - 6 * t**2 + 9 * t
df = sp.diff(f, t)
print(f"SymPy  d/dt : {df}")
print(f"SymPy  roots: {sp.solve(df, t)}")
`),
  },
};

export const matplotlibExample: PythonExample = {
  id: 'matplotlib_plot',
  tag: 'plots',
  packages: ['matplotlib', 'numpy'],
  titleKey: 'python.example.matplotlib_plot.title',
  descriptionKey: 'python.example.matplotlib_plot.desc',
  entry: 'matplotlib_plot/main.py',
  files: {
    'matplotlib_plot/main.py': pySource(String.raw`
# Matplotlib figure
# Shows: a line plot and a scatter plot side by side, shown with plt.show().
# Expect: the figure in the Plots tab. From there you can copy it or save it
# as PNG, and export it as SVG or PDF.
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 4 * np.pi, 200)
rng = np.random.default_rng(1)
xs = rng.uniform(0, 10, 40)
ys = 2 * xs + rng.normal(0, 2, xs.size)

fig, (left, right) = plt.subplots(1, 2, figsize=(8, 3.2))
left.plot(x, np.exp(-0.15 * x) * np.sin(x), label="damped sine")
left.set_title("Line")
left.set_xlabel("x (rad)")
left.legend()
left.grid(alpha=0.3)
right.scatter(xs, ys, s=16, color="tab:orange")
right.set_title("Scatter")
right.set_xlabel("x")
right.set_ylabel("y")
fig.tight_layout()
plt.show()
print("Figure sent to the Plots tab.")
`),
  },
};
