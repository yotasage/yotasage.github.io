// Built-in examples that write files for the inline viewers: Pillow image, PDF, CSV/JSON tables, HTML.
// Each writes into out/ under the workspace (the working directory of every run).
import type { PythonExample } from './types';
import { pySource } from './types';

export const pillowExample: PythonExample = {
  id: 'pillow_image',
  tag: 'files',
  packages: ['pillow'],
  titleKey: 'python.example.pillow_image.title',
  descriptionKey: 'python.example.pillow_image.desc',
  entry: 'pillow_image/main.py',
  files: {
    'pillow_image/main.py': pySource(String.raw`
# Pillow image
# Shows: drawing an image with Pillow, showing it and saving it.
# Expect: the image in the Plots tab (from Image.show()) and the file out/image.png.
# Open out/image.png in the Files tree to see it in the image viewer.
import os

from PIL import Image, ImageDraw

img = Image.new("RGB", (240, 160), "white")
draw = ImageDraw.Draw(img)
for i in range(0, 241, 12):
    draw.line([(i, 0), (240 - i, 160)], fill=(37, 99, 235), width=2)
draw.ellipse([80, 40, 160, 120], fill=(234, 88, 12), outline="black", width=3)
draw.text((8, 144), "Made with Pillow", fill="black")

img.show()
os.makedirs("out", exist_ok=True)
img.save("out/image.png")
print(f"Saved out/image.png ({img.width} x {img.height} pixels)")
`),
  },
};

export const pdfExample: PythonExample = {
  id: 'pdf_report',
  tag: 'files',
  packages: ['matplotlib', 'numpy'],
  titleKey: 'python.example.pdf_report.title',
  descriptionKey: 'python.example.pdf_report.desc',
  entry: 'pdf_report/main.py',
  files: {
    'pdf_report/main.py': pySource(String.raw`
# PDF export
# Shows: saving a matplotlib figure as a vector PDF file with savefig().
# Expect: the file out/report.pdf. Open it in the Files tree to see the PDF viewer.
import os

import matplotlib.pyplot as plt
import numpy as np

f = np.logspace(0, 4, 400)
gain_db = -10 * np.log10(1 + (f / 100) ** 2)  # first-order low-pass, corner at 100 Hz

fig, ax = plt.subplots(figsize=(6, 3.5))
ax.semilogx(f, gain_db)
ax.axvline(100, linestyle="--", color="grey")
ax.set_title("Low-pass filter, corner at 100 Hz")
ax.set_xlabel("Frequency (Hz)")
ax.set_ylabel("Gain (dB)")
ax.grid(True, which="both", alpha=0.3)

os.makedirs("out", exist_ok=True)
fig.savefig("out/report.pdf")
plt.close(fig)
print("Saved out/report.pdf")
`),
  },
};

export const csvJsonExample: PythonExample = {
  id: 'csv_json',
  tag: 'files',
  packages: [],
  titleKey: 'python.example.csv_json.title',
  descriptionKey: 'python.example.csv_json.desc',
  entry: 'csv_json/main.py',
  files: {
    'csv_json/main.py': pySource(String.raw`
# CSV and JSON files
# Shows: writing a small table as CSV and as JSON with the standard library.
# Expect: out/weather.csv and out/weather.json. Open them in the Files tree to see
# the table viewer (switch to Code to see the plain text).
import csv
import json
import os

rows = [
    {"city": "Oslo", "temp_c": 6.2, "rain_mm": 12.4},
    {"city": "Bergen", "temp_c": 7.8, "rain_mm": 38.1},
    {"city": "Trondheim", "temp_c": 4.9, "rain_mm": 15.0},
]

os.makedirs("out", exist_ok=True)
with open("out/weather.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
with open("out/weather.json", "w", encoding="utf-8") as f:
    json.dump(rows, f, indent=2)

print(f"Wrote {len(rows)} rows to out/weather.csv and out/weather.json")
`),
  },
};

export const htmlExample: PythonExample = {
  id: 'html_preview',
  tag: 'files',
  packages: [],
  titleKey: 'python.example.html_preview.title',
  descriptionKey: 'python.example.html_preview.desc',
  entry: 'html_preview/main.py',
  files: {
    'html_preview/main.py': pySource(String.raw`
# Sandboxed HTML preview
# Shows: writing an HTML page from Python.
# Expect: the file out/page.html. Open it in the Files tree: it is shown in a
# sandbox where scripts are off and the page cannot load anything from elsewhere.
import html
import os

planets = [("Mercury", 0.39, 88), ("Venus", 0.72, 225), ("Earth", 1.00, 365), ("Mars", 1.52, 687)]
rows = "\n".join(
    f"<tr><td>{html.escape(name)}</td><td>{au:.2f}</td><td>{days}</td></tr>"
    for name, au, days in planets
)
page = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Inner planets</title>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 24px; }}
  table {{ border-collapse: collapse; }}
  th, td {{ border: 1px solid #94a3b8; padding: 4px 12px; text-align: right; }}
  th {{ background: #2563eb; color: white; }}
  td:first-child {{ text-align: left; }}
</style></head>
<body><h1>Inner planets</h1>
<table><tr><th>Planet</th><th>Distance (AU)</th><th>Year (days)</th></tr>
{rows}
</table></body></html>
"""

os.makedirs("out", exist_ok=True)
with open("out/page.html", "w", encoding="utf-8") as f:
    f.write(page)
print(f"Wrote out/page.html ({len(page)} characters)")
`),
  },
};
