import assert from 'node:assert/strict';
import test from 'node:test';

import katex from 'katex';

import {
  clampMathScale,
  DEFAULT_MATH_SCALE,
  MAX_MATH_SCALE,
  MIN_MATH_SCALE,
  parseMathScaleInput,
  promoteFractionsToDisplay,
} from './mathFormat';

test('promoteFractionsToDisplay promotes standalone and nested \\frac to \\dfrac', () => {
  assert.equal(promoteFractionsToDisplay('\\frac{a}{b}'), '\\dfrac{a}{b}');
  assert.equal(
    promoteFractionsToDisplay('f\'(x) = \\frac{d}{dx}\\left(\\frac{x^2 + 1}{2x}\\right)'),
    'f\'(x) = \\dfrac{d}{dx}\\left(\\dfrac{x^2 + 1}{2x}\\right)',
  );
  assert.equal(
    promoteFractionsToDisplay('\\frac{\\frac{1}{2}}{x + 1}'),
    '\\dfrac{\\dfrac{1}{2}}{x + 1}',
  );
});

test('promoteFractionsToDisplay preserves escaped \\\\frac, \\tfrac, \\dfrac, and script fractions', () => {
  assert.equal(promoteFractionsToDisplay('a \\\\frac{1}{2}'), 'a \\\\frac{1}{2}');
  assert.equal(promoteFractionsToDisplay('\\tfrac{1}{2} + \\dfrac{3}{4} + \\cfrac{1}{x}'), '\\tfrac{1}{2} + \\dfrac{3}{4} + \\cfrac{1}{x}');
  assert.equal(promoteFractionsToDisplay('e^{\\frac{x^2}{2}} + \\frac{1}{2}'), 'e^{\\frac{x^2}{2}} + \\dfrac{1}{2}');
  assert.equal(
    promoteFractionsToDisplay('\\int_{0}^{\\frac{\\pi}{2}} \\frac{\\sin(x)}{2}\\,dx'),
    '\\int_{0}^{\\frac{\\pi}{2}} \\dfrac{\\sin(x)}{2}\\,dx',
  );
});

test('promoted fractions render with MathML displaystyle="true" in inline KaTeX', () => {
  const tex = promoteFractionsToDisplay('\\frac{e^{x^2}}{2} + C');
  const html = katex.renderToString(tex, { output: 'mathml', displayMode: false });
  assert.ok(html.includes('displaystyle="true"'), 'Expected MathML mstyle displaystyle="true"');
  assert.ok(html.includes('<mfrac>'), 'Expected MathML <mfrac> element');
});

test('clampMathScale and parseMathScaleInput handle bounds and user strings', () => {
  assert.equal(clampMathScale(Number.NaN), DEFAULT_MATH_SCALE);
  assert.equal(clampMathScale(20), MIN_MATH_SCALE);
  assert.equal(clampMathScale(500), MAX_MATH_SCALE);
  assert.equal(clampMathScale(124.6), 125);

  assert.equal(parseMathScaleInput('140'), 140);
  assert.equal(parseMathScaleInput('140%'), 140);
  assert.equal(parseMathScaleInput(' 85.2 % '), 85);
  assert.equal(parseMathScaleInput('10'), MIN_MATH_SCALE);
  assert.equal(parseMathScaleInput('999'), MAX_MATH_SCALE);
  assert.equal(parseMathScaleInput(''), null);
  assert.equal(parseMathScaleInput('abc'), null);
  assert.equal(parseMathScaleInput('-50'), null);
});
