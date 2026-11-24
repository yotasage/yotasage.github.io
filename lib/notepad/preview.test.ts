import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSandboxedHtmlSrcDoc,
  detectPreviewKind,
  resolvePreviewKind,
} from './htmlPreview';
import { renderMarkdownToHtml } from './markdownPreview';

test('renderMarkdownToHtml renders ATX & Setext headings with slugified IDs and inline emphasis', () => {
  const md = [
    '# Hello World',
    '',
    '## Sub Section',
    '',
    'Setext Title',
    '============',
    '',
    'This has ***both***, **bold**, *italic*, ~~strike~~, and snake_case_var.',
  ].join('\n');

  const html = renderMarkdownToHtml(md);
  assert.ok(html.includes('<h1 id="hello-world">Hello World</h1>'));
  assert.ok(html.includes('<h2 id="sub-section">Sub Section</h2>'));
  assert.ok(html.includes('<h1 id="setext-title">Setext Title</h1>'));
  assert.ok(html.includes('<strong><em>both</em></strong>'));
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(html.includes('<em>italic</em>'));
  assert.ok(html.includes('<del>strike</del>'));
  assert.ok(html.includes('snake_case_var'));
  assert.ok(!html.includes('<em>case</em>'));
});

test('renderMarkdownToHtml protects inline code spans and escapes fenced code blocks', () => {
  const md = [
    'Use `$x + y$` and `*not italic*` and `<script>` inline.',
    '',
    '```ts',
    'const html = "<script>alert(1)</script>";',
    '```',
    '',
    '~~~',
    'plain block',
    '~~~',
  ].join('\n');

  const html = renderMarkdownToHtml(md);
  assert.ok(html.includes('<code>$x + y$</code>'));
  assert.ok(html.includes('<code>*not italic*</code>'));
  assert.ok(html.includes('<code>&lt;script&gt;</code>'));
  assert.ok(!html.includes('katex'));
  assert.ok(html.includes('<div class="md-code-block"><div class="md-code-lang">ts</div>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('<div class="md-code-block"><pre><code>plain block</code></pre></div>'));
});

test('renderMarkdownToHtml renders GFM pipe tables with column alignment', () => {
  const md = [
    '| Name | Qty | Note |',
    '|:---|:---:|---:|',
    '| R1 | 10 | **10k** |',
    '| C1 | 2 | 100nF |',
  ].join('\n');

  const html = renderMarkdownToHtml(md);
  assert.ok(html.includes('<div class="md-table-wrap"><table>'));
  assert.ok(html.includes('<th style="text-align:left">Name</th>'));
  assert.ok(html.includes('<th style="text-align:center">Qty</th>'));
  assert.ok(html.includes('<th style="text-align:right">Note</th>'));
  assert.ok(html.includes('<td style="text-align:right"><strong>10k</strong></td>'));
});

test('renderMarkdownToHtml renders nested lists, task lists, blockquotes, and GitHub callouts', () => {
  const md = [
    '- [x] Done task',
    '- [ ] Open task',
    '  - Nested bullet',
    '',
    '1. First',
    '2. Second',
    '',
    '> [!WARNING]',
    '> Check voltage rating before powering on.',
    '',
    '> Regular quote',
  ].join('\n');

  const html = renderMarkdownToHtml(md);
  assert.ok(html.includes('<ul class="md-task-list">'));
  assert.ok(html.includes('<input type="checkbox" disabled checked /> Done task'));
  assert.ok(html.includes('<input type="checkbox" disabled /> Open task'));
  assert.ok(html.includes('<ul>\n<li>Nested bullet</li>\n</ul>'));
  assert.ok(html.includes('<ol>\n<li>First</li>\n<li>Second</li>\n</ol>'));
  assert.ok(html.includes('<div class="md-callout md-callout-warning">'));
  assert.ok(html.includes('<div class="md-callout-title">Warning</div>'));
  assert.ok(html.includes('Check voltage rating before powering on.'));
  assert.ok(html.includes('<blockquote><p>Regular quote</p></blockquote>'));
});

test('renderMarkdownToHtml renders KaTeX inline & block math while ignoring currency amounts', () => {
  const md = [
    'Ohm law: $V = I \\cdot R$ and total cost is $10 and $20 (or $10-$20).',
    '',
    '$$',
    'f_c = \\frac{1}{2\\pi R C}',
    '$$',
    '',
    '$$E = mc^2$$',
  ].join('\n');

  const html = renderMarkdownToHtml(md);
  assert.ok(html.includes('class="katex"'));
  assert.ok(html.includes('<div class="md-math-block">'));
  assert.ok(html.includes('class="katex-display"'));
  // Currency must remain literal text, NOT passed to KaTeX
  assert.ok(html.includes('total cost is $10 and $20 (or $10-$20).'));
});

test('renderMarkdownToHtml neutralizes XSS vectors in raw HTML, links, and images while allowing safe links/images', () => {
  const md = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '[click](javascript:alert(1))',
    '[bad2](JaVaScRiPt:void(0))',
    '[bad3](data:text/html,<script>alert(1)</script>)',
    '![badimg](data:text/html,<b>hi</b>)',
    '[Safe](https://example.com/docs_(v1))',
    '<https://example.org/test>',
    '![ok](data:image/png;base64,AAAA)',
  ].join('\n\n');

  const html = renderMarkdownToHtml(md);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!/javascript:/i.test(html));
  assert.ok(!/onerror=/i.test(html.replace(/&lt;img src=x onerror=alert\(1\)&gt;/g, '')));
  assert.ok(!html.includes('data:text/html'));
  assert.ok(html.includes('<p>click</p>'));
  assert.ok(
    html.includes(
      '<a href="https://example.com/docs_(v1)" target="_blank" rel="noopener noreferrer">Safe</a>',
    ),
  );
  assert.ok(
    html.includes(
      '<a href="https://example.org/test" target="_blank" rel="noopener noreferrer">https://example.org/test</a>',
    ),
  );
  assert.ok(html.includes('<img src="data:image/png;base64,AAAA" alt="ok" loading="lazy" />'));
});

test('detectPreviewKind and resolvePreviewKind classify markdown, html, svg, csv, and fallbacks', () => {
  assert.equal(detectPreviewKind('markdown', 'notes.txt'), 'markdown');
  assert.equal(detectPreviewKind('plaintext', 'README.md'), 'markdown');
  assert.equal(detectPreviewKind('plaintext', 'guide.markdown'), 'markdown');

  assert.equal(detectPreviewKind('html', 'page.txt'), 'html');
  assert.equal(detectPreviewKind('plaintext', 'index.html'), 'html');
  assert.equal(detectPreviewKind('plaintext', 'page.htm'), 'html');
  assert.equal(detectPreviewKind('plaintext', 'icon.svg'), 'html');
  assert.equal(detectPreviewKind('xml', 'icon.svg'), 'html');
  assert.equal(detectPreviewKind('xml', 'drawing.xml', '  <svg viewBox="0 0 10 10"></svg>'), 'html');
  assert.equal(detectPreviewKind('xml', 'config.xml', '<config></config>'), null);

  assert.equal(detectPreviewKind('csv', 'data.txt'), 'csv');
  assert.equal(detectPreviewKind('plaintext', 'table.csv'), 'csv');
  assert.equal(detectPreviewKind('plaintext', 'table.tsv'), 'csv');
  assert.equal(detectPreviewKind('plaintext', 'table.psv'), 'csv');
  assert.equal(detectPreviewKind('plaintext', 'table.dsv'), 'csv');
  assert.equal(detectPreviewKind('plaintext', 'table.ssv'), 'csv');

  assert.equal(detectPreviewKind('typescript', 'app.ts'), null);

  assert.equal(resolvePreviewKind('auto', 'plaintext', 'table.csv'), 'csv');
  assert.equal(resolvePreviewKind('auto', 'typescript', 'app.ts'), 'markdown');
  assert.equal(resolvePreviewKind('html', 'markdown', 'notes.md'), 'html');
});

test('buildSandboxedHtmlSrcDoc wraps fragments & SVGs and enforces CSP with scripts OFF vs ON', () => {
  // Fragment wrapping with scripts OFF
  const fragNoScript = buildSandboxedHtmlSrcDoc('<h1>Hello</h1><style>h1{color:red}</style>', {
    fileName: 'snippet.html',
    allowScripts: false,
    theme: 'dark',
  });
  assert.ok(fragNoScript.startsWith('<!DOCTYPE html>'));
  assert.ok(fragNoScript.includes("default-src 'none'"));
  assert.ok(fragNoScript.includes("style-src 'unsafe-inline' data: blob:"));
  assert.ok(!fragNoScript.includes("script-src 'unsafe-inline'"));
  assert.ok(fragNoScript.includes('<h1>Hello</h1><style>h1{color:red}</style>'));

  // Full HTML document with <head> and scripts ON
  const fullDoc = '<!DOCTYPE html><html><head><title>Demo</title></head><body><script>console.log(1)</script></body></html>';
  const docWithScript = buildSandboxedHtmlSrcDoc(fullDoc, {
    fileName: 'demo.html',
    allowScripts: true,
    theme: 'light',
  });
  assert.ok(docWithScript.includes('<head>\n<meta http-equiv="Content-Security-Policy"'));
  assert.ok(docWithScript.includes("default-src 'none'"));
  assert.ok(docWithScript.includes("script-src 'unsafe-inline';"));
  assert.ok(docWithScript.includes('<title>Demo</title>'));

  // SVG wrapping by content and by filename
  const svgSrc = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';
  const svgDoc = buildSandboxedHtmlSrcDoc(svgSrc, {
    fileName: 'diagram.svg',
    allowScripts: false,
    theme: 'hc',
  });
  assert.ok(svgDoc.startsWith('<!DOCTYPE html>'));
  assert.ok(svgDoc.includes('align-items: center; justify-content: center'));
  assert.ok(svgDoc.includes("default-src 'none'"));
  assert.ok(!svgDoc.includes('script-src'));
  assert.ok(svgDoc.includes(svgSrc));
});
