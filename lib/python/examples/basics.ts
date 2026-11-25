// Built-in examples: basics (print, input() with ANSI colours, Soft Stop, multi-file modules) and asyncio.
import type { PythonExample } from './types';
import { pySource } from './types';

export const helloExample: PythonExample = {
  id: 'hello',
  tag: 'basics',
  titleKey: 'python.example.hello.title',
  descriptionKey: 'python.example.hello.desc',
  entry: 'hello/main.py',
  files: {
    'hello/main.py': pySource(String.raw`
# Hello, Python!
# Shows: print(), f-strings and a for loop. Press Run (Ctrl+Enter).
# Expect: a greeting and the first five square numbers in the Console.
import sys

print(f"Hello from Python {sys.version.split()[0]}, running in your browser.")
for n in range(1, 6):
    print(f"{n} squared is {n * n}")
`),
  },
};

export const inputColorsExample: PythonExample = {
  id: 'input_colors',
  tag: 'basics',
  titleKey: 'python.example.input_colors.title',
  descriptionKey: 'python.example.input_colors.desc',
  entry: 'input_colors/main.py',
  files: {
    'input_colors/main.py': pySource(String.raw`
# input() and ANSI colours
# Shows: input() reads a line typed in the Console; ANSI escape codes colour text.
# Expect: two questions ("The program asks:"), then a coloured answer.
RESET = "\x1b[0m"
BOLD = "\x1b[1m"
GREEN = "\x1b[32m"
YELLOW = "\x1b[33m"
CYAN = "\x1b[36m"

name = input("What is your name? ").strip() or "friend"
text = input("Pick a whole number: ").strip()
try:
    number = int(text)
except ValueError:
    print(f"{YELLOW}'{text}' is not a whole number, so I use 7.{RESET}")
    number = 7

print(f"{BOLD}{GREEN}Hello, {name}!{RESET}")
print(f"{CYAN}{number} x 2 = {number * 2}{RESET}")
print(" ".join(f"\x1b[{code}mcolour {code}{RESET}" for code in range(31, 37)))
`),
  },
};

export const softStopExample: PythonExample = {
  id: 'soft_stop',
  tag: 'basics',
  titleKey: 'python.example.soft_stop.title',
  descriptionKey: 'python.example.soft_stop.desc',
  entry: 'soft_stop/main.py',
  files: {
    'soft_stop/main.py': pySource(String.raw`
# Soft Stop
# Shows: a loop that never ends on its own. Press Stop (or Ctrl+C in the Console).
# Expect: a tick every half second until you press Stop. Python sees Stop as a
# KeyboardInterrupt, so the program can catch it and finish tidily.
import time

count = 0
try:
    while True:
        count += 1
        print(f"tick {count} - press Stop to end me")
        time.sleep(0.5)
except KeyboardInterrupt:
    print(f"Stopped after {count} ticks.")
`),
  },
};

export const modulesExample: PythonExample = {
  id: 'modules',
  tag: 'basics',
  titleKey: 'python.example.modules.title',
  descriptionKey: 'python.example.modules.desc',
  entry: 'modules/main.py',
  files: {
    'modules/main.py': pySource(String.raw`
# Multi-file modules
# Shows: main.py imports functions from helpers.py in the same folder.
# Expect: a list of samples and its moving average. Change helpers.py and run
# main.py again: the new version is imported.
from helpers import moving_average, summary

samples = [12.0, 14.5, 13.0, 16.5, 18.0, 17.5]
print(summary("Samples", samples))
print(summary("Smoothed signal", moving_average(samples, 3)))
`),
    'modules/helpers.py': pySource(String.raw`
"""Helpers imported by main.py."""


def moving_average(values, window):
    return [sum(values[i:i + window]) / window for i in range(len(values) - window + 1)]


def summary(label, values):
    return f"{label}: " + ", ".join(f"{v:.2f}" for v in values)
`),
  },
};

export const asyncioExample: PythonExample = {
  id: 'asyncio_gather',
  tag: 'async',
  titleKey: 'python.example.asyncio_gather.title',
  descriptionKey: 'python.example.asyncio_gather.desc',
  entry: 'asyncio_gather/main.py',
  files: {
    'asyncio_gather/main.py': pySource(String.raw`
# asyncio.gather
# Shows: three coroutines that wait at the same time.
# Expect: all three start at once and finish in order of their delay. The total
# time is about the longest delay (0.6 s), not the sum of all three (1.2 s).
import asyncio
import time


async def job(name, delay):
    print(f"start  {name}")
    await asyncio.sleep(delay)
    print(f"finish {name} after {delay} s")
    return name.upper()


async def main():
    t0 = time.perf_counter()
    results = await asyncio.gather(job("a", 0.4), job("b", 0.2), job("c", 0.6))
    print(f"results {results} in {time.perf_counter() - t0:.1f} s")


asyncio.run(main())
`),
  },
};
