import assert from 'node:assert/strict';
import test from 'node:test';

import type { PageCitationMeta, ProjectCitationMeta } from './citation';
import {
  buildShareChannels,
  buildShareFilename,
  buildShareQr,
  formatShareSnippet,
  resolveShareTarget,
} from './share';

const PROJECT: ProjectCitationMeta = {
  name: 'yotasage',
  title: 'yotasage — Browser Tools',
  author: 'yotasage',
  origin: 'https://yotasage.github.io',
  repository: 'https://github.com/yotasage/yotasage.github.io',
  license: 'AGPL-3.0-or-later',
  commit: 'abcdef1234567890',
  commitShort: 'abcdef1',
  lastChanged: '2026-11-25',
  lastChangedIso: '2026-11-25T12:00:00Z',
  contentHash: '1234567890ab',
  contentHashFull: '1234567890abcdef',
  routeCount: 50,
};

const HOME_PAGE: PageCitationMeta = {
  route: '/',
  url: 'https://yotasage.github.io/',
  title: 'yotasage — Browser Tools',
  description: 'Free client-side engineering tools.',
  kind: 'project',
  citeKey: 'yotasage_site',
  sourcePath: 'pages/index.tsx',
  commit: 'abcdef1234567890',
  commitShort: 'abcdef1',
  lastChanged: '2026-11-25',
  lastChangedIso: '2026-11-25T12:00:00Z',
  contentHash: '1234567890ab',
  contentHashFull: '1234567890abcdef',
  fileCount: 3,
};

const TOOL_PAGE: PageCitationMeta = {
  route: '/smith-chart/main',
  url: 'https://yotasage.github.io/smith-chart/main',
  title: 'Smith Chart',
  description: 'Interactive RF impedance matching and sweeps.',
  kind: 'tool',
  citeKey: 'yotasage_smith_chart',
  sourcePath: 'pages/smith-chart/main.tsx',
  commit: 'abcdef1234567890',
  commitShort: 'abcdef1',
  lastChanged: '2026-11-25',
  lastChangedIso: '2026-11-25T12:00:00Z',
  contentHash: '1234567890ab',
  contentHashFull: '1234567890abcdef',
  fileCount: 12,
};

test('resolveShareTarget resolves canonical home URL on production', () => {
  const target = resolveShareTarget({
    page: HOME_PAGE,
    project: PROJECT,
    scope: 'page',
    hostMode: 'public',
    includePageState: false,
    currentUrl: 'https://yotasage.github.io/',
  });

  assert.equal(target.url, 'https://yotasage.github.io/');
  assert.equal(target.displayUrl, 'yotasage.github.io');
  assert.equal(target.isHome, true);
  assert.equal(target.hasDifferentHost, false);
  assert.equal(target.hasPageState, false);
  assert.equal(target.slug, 'home');
});

test('resolveShareTarget supports tool vs home scope and URL state preservation', () => {
  const withState = resolveShareTarget({
    page: TOOL_PAGE,
    project: PROJECT,
    scope: 'page',
    hostMode: 'public',
    includePageState: true,
    currentUrl: 'https://yotasage.github.io/smith-chart/main?z0=50#load',
  });

  assert.equal(withState.url, 'https://yotasage.github.io/smith-chart/main?z0=50#load');
  assert.equal(withState.hasPageState, true);
  assert.equal(withState.isHome, false);
  assert.equal(withState.title, 'Smith Chart — yotasage');
  assert.equal(withState.slug, 'smith-chart');

  const withoutState = resolveShareTarget({
    page: TOOL_PAGE,
    project: PROJECT,
    scope: 'page',
    hostMode: 'public',
    includePageState: false,
    currentUrl: 'https://yotasage.github.io/smith-chart/main?z0=50#load',
  });
  assert.equal(withoutState.url, 'https://yotasage.github.io/smith-chart/main');

  const homeScope = resolveShareTarget({
    page: TOOL_PAGE,
    project: PROJECT,
    scope: 'home',
    hostMode: 'public',
    includePageState: true,
    currentUrl: 'https://yotasage.github.io/smith-chart/main?z0=50#load',
  });
  assert.equal(homeScope.url, 'https://yotasage.github.io/');
  assert.equal(homeScope.isHome, true);
});

test('resolveShareTarget detects localhost/preview host and switches cleanly', () => {
  const currentHost = resolveShareTarget({
    page: TOOL_PAGE,
    project: PROJECT,
    scope: 'page',
    hostMode: 'current',
    includePageState: true,
    currentUrl: 'http://192.168.1.42:3020/smith-chart/main?f=2.4G',
  });

  assert.equal(currentHost.hasDifferentHost, true);
  assert.equal(currentHost.currentHostLabel, '192.168.1.42:3020');
  assert.equal(currentHost.publicHostLabel, 'yotasage.github.io');
  assert.equal(currentHost.url, 'http://192.168.1.42:3020/smith-chart/main?f=2.4G');

  const publicHost = resolveShareTarget({
    page: TOOL_PAGE,
    project: PROJECT,
    scope: 'page',
    hostMode: 'public',
    includePageState: true,
    currentUrl: 'http://192.168.1.42:3020/smith-chart/main?f=2.4G',
  });
  assert.equal(publicHost.url, 'https://yotasage.github.io/smith-chart/main?f=2.4G');
});

test('formatShareSnippet formats and escapes URL, Markdown, HTML, LaTeX, and message', () => {
  const target = resolveShareTarget({
    page: {
      ...TOOL_PAGE,
      title: 'A & B [Test]_100%',
    },
    project: PROJECT,
    scope: 'page',
    hostMode: 'public',
    includePageState: true,
    currentUrl: 'https://yotasage.github.io/smith-chart/main?a=1&b=(2)#s%201',
  });

  assert.equal(formatShareSnippet(target, 'url'), target.url);
  assert.equal(
    formatShareSnippet(target, 'markdown'),
    '[A & B \\[Test\\]_100% — yotasage](https://yotasage.github.io/smith-chart/main?a=1&b=%282%29#s%201)',
  );
  assert.equal(
    formatShareSnippet(target, 'html'),
    '<a href="https://yotasage.github.io/smith-chart/main?a=1&amp;b=(2)#s%201">A &amp; B [Test]_100% — yotasage</a>',
  );
  assert.equal(
    formatShareSnippet(target, 'latex'),
    '\\href{https://yotasage.github.io/smith-chart/main?a=1&b=(2)\\#s\\%201}{A \\& B [Test]\\_100\\% — yotasage}',
  );
  assert.match(formatShareSnippet(target, 'message', 'en'), /100% client-side/);
  assert.match(formatShareSnippet(target, 'message', 'nb'), /100 % lokalt/);
});

test('buildShareChannels generates encoded links for all channels', () => {
  const target = resolveShareTarget({
    page: TOOL_PAGE,
    project: PROJECT,
    scope: 'page',
    hostMode: 'public',
    includePageState: false,
    currentUrl: 'https://yotasage.github.io/smith-chart/main',
  });

  const channels = buildShareChannels(target, 'en');
  assert.equal(channels.length, 6);
  const email = channels.find((c) => c.id === 'email');
  assert.ok(email);
  assert.equal(email.external, false);
  assert.ok(email.href.startsWith('mailto:?subject='));
  assert.ok(email.href.includes(encodeURIComponent(target.url)));

  for (const ch of channels.filter((c) => c.id !== 'email')) {
    assert.equal(ch.external, true);
    assert.ok(ch.href.startsWith('https://'));
    assert.ok(ch.href.includes(encodeURIComponent(target.url)));
  }
});

test('buildShareQr encodes valid QR symbols and SVG strings across styles and EC levels', () => {
  const styles = ['square', 'rounded', 'dots'] as const;
  const ecs = ['M', 'Q', 'H'] as const;

  for (const style of styles) {
    for (const ec of ecs) {
      const res = buildShareQr('https://yotasage.github.io/smith-chart/main', ec, style);
      assert.equal(res.error, null);
      assert.ok(res.symbol);
      assert.equal(res.symbol.ecLevel, ec);
      assert.ok(res.symbol.width >= 21);
      assert.ok(res.svg?.includes('<svg'));
      assert.ok(res.svg?.includes('</svg>'));
    }
  }

  const emptyRes = buildShareQr('   ', 'M', 'square');
  assert.equal(emptyRes.symbol, null);
  assert.ok(emptyRes.error);
});

test('buildShareFilename builds safe descriptive filenames', () => {
  const target = resolveShareTarget({
    page: TOOL_PAGE,
    project: PROJECT,
    scope: 'page',
    hostMode: 'public',
    includePageState: false,
  });

  assert.equal(buildShareFilename(target, 'qr-svg'), 'yotasage-smith-chart-qr.svg');
  assert.equal(buildShareFilename(target, 'qr-png'), 'yotasage-smith-chart-qr.png');
  assert.equal(buildShareFilename(target, 'share-card'), 'yotasage-smith-chart-share-card.png');
});
