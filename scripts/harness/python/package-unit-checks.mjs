// Part A (P5b): pure-Node checks for lib/python/{packages,requirements}.ts: requirements parse table,
// PEP 440 specifiers, lock round trip, strict manifest validation and caps, wheel tag rules and
// planRestore's skip rules per network mode.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkWheelTags,
  isPureWheel,
  MAX_MANIFEST_ENTRIES,
  orphanedDependencies,
  PACKAGES_STORAGE_KEY,
  parseBundledLock,
  planRestore,
  readManifest,
  sha256Hex,
  validateManifest,
  writeManifest,
} from '../../../lib/python/packages.ts';
import {
  compareVersions,
  exportLock,
  exportRequirements,
  hashProblems,
  parseLock,
  parseRequirements,
  planRequirements,
  satisfies,
} from '../../../lib/python/requirements.ts';

const here = dirname(fileURLToPath(import.meta.url));
const LOCK = JSON.parse(readFileSync(resolve(here, '../../../public/pyodide/pyodide-lock.json'), 'utf8'));
const RUNTIME = { pyodideVersion: '0.29.0', pythonVersion: LOCK.info.python, abiVersion: LOCK.info.abi_version, platform: LOCK.info.platform };
const H = (c) => c.repeat(64);

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

const entry = (over = {}) => ({
  name: 'tinypkg',
  version: '1.0.0',
  source: 'wheel',
  requested: true,
  keep: true,
  sha256: H('a'),
  fileName: 'tinypkg-1.0.0-py3-none-any.whl',
  depends: [],
  imports: ['tinypkg'],
  installedAt: '2026-11-25T12:00:00.000Z',
  pyodideVersion: RUNTIME.pyodideVersion,
  abiVersion: RUNTIME.abiVersion,
  ...over,
});

export async function runPackageUnitChecks(check) {
  await check('requirements.ts: parse table (names, specifiers, extras, markers, hashes, continuations, rejected options)', () => {
    const text = [
      '# comment',
      '',
      'Rich==14.2.0  # trailing comment',
      'numpy>=1.20,<3',
      'requests[socks, security] ~= 2.31 ; python_version >= "3.12"',
      'six',
      'attrs (>=22)',
      'pkg-a!=1.5 \\',
      '  --hash=sha256:' + H('b'),
      '-r other.txt',
      '--requirement=other.txt',
      '-c constraints.txt',
      '-e ./local',
      '--index-url https://example.com/simple',
      '--extra-index-url https://example.com/simple',
      '--find-links ./wheels',
      '--pre',
      'git+https://github.com/x/y.git',
      'name @ https://example.com/name-1.0-py3-none-any.whl',
      './local/pkg',
      'thing-1.0-py3-none-any.whl',
      'bad name ==',
      'x>=1.*',
      'six==1.0',
      'foo --global-option=x',
    ].join('\n');
    const p = parseRequirements(text);
    const reqs = Object.fromEntries(p.requirements.map((r) => [r.name, r]));
    assert.deepEqual(p.requirements.map((r) => r.name), ['rich', 'numpy', 'requests', 'six', 'attrs', 'pkg-a']);
    assert.equal(reqs.rich.requirement, 'rich==14.2.0');
    assert.equal(reqs.numpy.specifier, '>=1.20,<3');
    assert.deepEqual(reqs.requests.extras, ['socks', 'security']);
    assert.equal(reqs.requests.marker, 'python_version >= "3.12"');
    assert.equal(reqs.requests.requirement, 'requests[socks,security]~=2.31; python_version >= "3.12"');
    assert.equal(reqs.attrs.specifier, '>=22');
    assert.deepEqual(reqs['pkg-a'].hashes, [H('b')]);
    assert.equal(reqs['pkg-a'].line, 8);
    const why = Object.fromEntries(p.skipped.map((s) => [s.text, s.reason]));
    assert.equal(why['-r other.txt'], 'include');
    assert.equal(why['--requirement=other.txt'], 'include');
    assert.equal(why['-c constraints.txt'], 'include');
    assert.equal(why['-e ./local'], 'editable');
    assert.equal(why['--index-url https://example.com/simple'], 'index-option');
    assert.equal(why['--extra-index-url https://example.com/simple'], 'index-option');
    assert.equal(why['--find-links ./wheels'], 'index-option');
    assert.equal(why['--pre'], 'option');
    assert.equal(why['git+https://github.com/x/y.git'], 'url');
    assert.equal(why['name @ https://example.com/name-1.0-py3-none-any.whl'], 'url');
    assert.equal(why['./local/pkg'], 'url');
    assert.equal(why['thing-1.0-py3-none-any.whl'], 'url');
    assert.equal(why['bad name =='], 'invalid');
    assert.equal(why['x>=1.*'], 'invalid');
    assert.equal(why['six==1.0'], 'duplicate');
    assert.equal(why['foo --global-option=x'], 'option');
    assert.equal(p.requirements.length + p.skipped.length, 22);
    const big = parseRequirements('a\n'.repeat(40000));
    assert.equal(big.skipped[0].reason, 'too-many');
    const many = parseRequirements(Array.from({ length: 510 }, (_, i) => `p${i}`).join('\n'));
    assert.equal(many.requirements.length, 500);
    assert.equal(many.skipped.filter((s) => s.reason === 'too-many').length, 10);
  });

  await check('requirements.ts: PEP 440 order and specifiers', () => {
    const order = ['1.0.dev1', '1.0a1', '1.0a2', '1.0b1', '1.0rc1', '1.0', '1.0.post1', '1.0.1', '1.1', '2!0.1'];
    for (let i = 1; i < order.length; i++) assert.ok(compareVersions(order[i - 1], order[i]) < 0, `${order[i - 1]} < ${order[i]}`);
    assert.equal(compareVersions('1.0', '1.0.0'), 0);
    const cases = [
      ['2.3.5', '>=2,<3', true], ['3.0', '>=2,<3', false], ['1.4.2', '~=1.4', true], ['2.0', '~=1.4', false],
      ['1.4.5', '~=1.4.2', true], ['1.5.0', '~=1.4.2', false], ['1.2.9', '==1.2.*', true], ['1.3', '==1.2.*', false],
      ['1.2.9', '!=1.2.*', false], ['1.0', '===1.0', true], ['1.0.0', '===1.0', false], ['2.3.5', '', true],
      ['2.3.5', '!=2.3.5', false], ['0.9', '>0.9', false], ['0.9', '<=0.9', true],
    ];
    for (const [v, s, want] of cases) assert.equal(satisfies(v, s), want, `${v} ${s}`);
  });

  await check('requirements.ts: plan per mode (bundled everywhere, PyPI only in pkg) + hash check + export', () => {
    const bundled = parseBundledLock(LOCK);
    assert.equal(bundled.size, Object.keys(LOCK.packages).length);
    const np = bundled.get('numpy').version;
    const parsed = parseRequirements(`numpy>=1\nsix\nrich==14.2.0\nscipy>=999\n-e x`);
    const off = planRequirements(parsed, 'off', bundled);
    assert.deepEqual(off.items, [{ kind: 'bundled', name: 'numpy' }, { kind: 'bundled', name: 'six' }]);
    const offWhy = Object.fromEntries(off.skipped.map((s) => [s.name ?? s.text, s.reason]));
    assert.equal(offWhy.rich, 'network-off');
    assert.equal(offWhy.scipy, 'bundled-version');
    assert.equal(off.skipped.find((s) => s.name === 'scipy').info, bundled.get('scipy').version);
    assert.equal(offWhy['-e x'], 'editable');
    assert.equal(planRequirements(parsed, 'hosts', bundled).skipped.find((s) => s.name === 'rich').reason, 'needs-package-index');
    assert.equal(planRequirements(parsed, 'all', bundled).skipped.find((s) => s.name === 'rich').reason, 'needs-package-index');
    const pkg = planRequirements(parsed, 'pkg', bundled);
    assert.deepEqual(pkg.items.map((i) => i.kind), ['bundled', 'bundled', 'pypi']);
    assert.equal(pkg.items[2].requirement, 'rich==14.2.0');
    const hp = parseRequirements(`a --hash=sha256:${H('c')}\nb --hash=sha256:${H('d')}`);
    assert.deepEqual(hashProblems([{ name: 'a', sha256: H('c') }, { name: 'B', sha256: H('e') }], hp.requirements), ['b']);
    const txt = exportRequirements([
      { name: 'numpy', version: np, source: 'bundled' },
      entry(),
      entry({ name: 'dep', fileName: 'dep-1.0-py3-none-any.whl', requested: false }),
      entry({ name: 'rich', version: '14.2.0', source: 'pypi', fileName: 'rich-14.2.0-py3-none-any.whl', sha256: H('f') }),
    ]);
    assert.equal(
      txt,
      `# Python playground packages (requirements.txt)\nnumpy==${np}  # bundled\ntinypkg==1.0.0 --hash=sha256:${H('a')}  # wheel: tinypkg-1.0.0-py3-none-any.whl\nrich==14.2.0 --hash=sha256:${H('f')}  # PyPI\n`,
    );
    const back = parseRequirements(txt);
    assert.equal(back.skipped.length, 0);
    assert.deepEqual(back.requirements.map((r) => r.requirement), [`numpy==${np}`, 'tinypkg==1.0.0', 'rich==14.2.0']);
    assert.deepEqual(back.requirements[2].hashes, [H('f')]);
  });

  await check('requirements.ts: lock export/import round trip; strict import', () => {
    const entries = [
      entry({ name: 'numpy', version: '2.0', source: 'bundled', sha256: undefined, fileName: undefined, requested: false }),
      entry(),
      entry({ name: 'rich', version: '14.2.0', source: 'pypi', fileName: 'rich-14.2.0-py3-none-any.whl', sha256: H('f'), url: 'https://files.pythonhosted.org/packages/aa/bb/rich-14.2.0-py3-none-any.whl', depends: ['numpy'] }),
    ].map((e) => JSON.parse(JSON.stringify(e)));
    const text = exportLock(entries, RUNTIME);
    assert.ok(!text.includes('installedAt') && !text.includes('"keep"'));
    const { lock, dropped } = parseLock(text);
    assert.equal(dropped, 0);
    assert.equal(lock.format, 'yotasage-python-lock/1');
    assert.deepEqual(lock.entries.map((e) => ({ ...e, installedAt: 'x' })), entries.map((e) => ({ ...e, installedAt: 'x' })));
    const tampered = JSON.parse(text);
    tampered.entries.push({ name: 'evil', version: '1', source: 'pypi', requested: true, sha256: H('1'), fileName: 'evil-1-py3-none-any.whl', url: 'https://evil.example/evil-1-py3-none-any.whl', depends: [], imports: [] });
    tampered.entries.push({ name: 'Bad_Name', version: '1', source: 'bundled', requested: true, depends: [], imports: [] });
    tampered.entries.push({ ...tampered.entries[1] });
    const again = parseLock(JSON.stringify(tampered));
    assert.equal(again.dropped, 3);
    assert.equal(again.lock.entries.length, 3);
    assert.equal(parseLock('{"format":"other","entries":[]}').lock, null);
    assert.equal(parseLock('not json').lock, null);
  });

  await check('packages.ts: manifest strict validation, caps and storage key', async () => {
    const good = entry();
    const bad = [
      { ...good, name: 'TinyPkg' },
      { ...good, source: 'code' },
      { ...good, sha256: 'ABC' },
      { ...good, fileName: 'other-1.0.0-py3-none-any.whl' },
      { ...good, url: 'https://files.pythonhosted.org/x/tinypkg-1.0.0-py3-none-any.whl' },
      { ...good, name: 'rich', fileName: 'rich-1-py3-none-any.whl', source: 'pypi', url: 'https://example.com/rich-1-py3-none-any.whl' },
      { ...good, name: 'rich', fileName: 'rich-1-py3-none-any.whl', source: 'pypi', url: 'https://files.pythonhosted.org/p/other.whl' },
      { ...good, name: 'numpy', source: 'bundled' },
      { ...good, keep: 'yes' },
      { ...good, depends: ['ok', 'not ok'] },
      { ...good, installedAt: 'yesterday' },
      'string',
      { ...good },
    ];
    const r = validateManifest({ v: 1, updatedAt: '2026-11-25T12:00:00.000Z', entries: [good, ...bad, { ...good, name: 'extra', fileName: 'extra-1-py3-none-any.whl', evil: true }] });
    assert.equal(r.dropped, bad.length);
    assert.deepEqual(r.manifest.entries.map((e) => e.name), ['tinypkg', 'extra']);
    assert.ok(!('evil' in r.manifest.entries[1]));
    assert.equal(validateManifest({ v: 2, entries: [] }).invalid, true);
    const st = new MemoryStorage();
    assert.equal(readManifest(st).manifest.entries.length, 0);
    writeManifest([good], st);
    assert.ok(st.getItem(PACKAGES_STORAGE_KEY).includes('tinypkg'));
    assert.equal(readManifest(st).manifest.entries[0].sha256, H('a'));
    st.setItem(PACKAGES_STORAGE_KEY, '{oops');
    assert.equal(readManifest(st).invalid, true);
    st.setItem(PACKAGES_STORAGE_KEY, 'x'.repeat(70000));
    assert.equal(readManifest(st).invalid, true);
    assert.throws(() => writeManifest([{ ...good, sha256: 'nope' }], st));
    const many = Array.from({ length: MAX_MANIFEST_ENTRIES + 1 }, (_, i) => entry({ name: `p${i}`, fileName: `p${i}-1.0.0-py3-none-any.whl` }));
    assert.throws(() => writeManifest(many, st));
    writeManifest([], st);
    assert.equal(st.getItem(PACKAGES_STORAGE_KEY), null);
    assert.equal(await sha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const deps = [entry({ name: 'a', fileName: 'a-1-py3-none-any.whl', depends: ['b'] }), entry({ name: 'b', fileName: 'b-1-py3-none-any.whl', requested: false }), entry({ name: 'c', fileName: 'c-1-py3-none-any.whl', requested: false })];
    assert.deepEqual(orphanedDependencies(deps), ['c']);
  });

  await check('packages.ts: wheel tag rules (same outcomes as micropip check_compatible)', () => {
    const [maj, min] = RUNTIME.pythonVersion.split('.');
    const cp = `cp${maj}${min}`;
    const ok = [
      'a-1-py3-none-any.whl', 'a-1-py2.py3-none-any.whl', `a-1-${cp}-${cp}-pyemscripten_${RUNTIME.abiVersion}_wasm32.whl`,
      `a-1-${cp}-${cp}-${RUNTIME.platform}_wasm32.whl`, `a-1-cp39-abi3-pyemscripten_${RUNTIME.abiVersion}_wasm32.whl`, 'a-1-1build-py3-none-any.whl',
    ];
    for (const f of ok) assert.equal(checkWheelTags(f, RUNTIME), null, f);
    const bad = [
      ['a-1-cp311-cp311-manylinux_2_17_x86_64.whl', 'platform'], ['a-1-cp314-cp314-pyemscripten_2025_0_wasm32.whl', 'platform'],
      ['a-1-cp314-cp314-emscripten_3_1_58_wasm32.whl', 'platform'], [`a-1-cp311-cp311-pyemscripten_${RUNTIME.abiVersion}_wasm32.whl`, 'abi'],
      ['a-1-py2-none-any.whl', 'python'], ['not-a-wheel.zip', 'name'], ['a-py3-none-any.whl', 'name'],
    ];
    for (const [f, problem] of bad) assert.equal(checkWheelTags(f, RUNTIME)?.problem, problem, f);
    assert.equal(isPureWheel('a-1-py3-none-any.whl'), true);
    assert.equal(isPureWheel(`a-1-${cp}-${cp}-pyemscripten_${RUNTIME.abiVersion}_wasm32.whl`), false);
  });

  await check('packages.ts: planRestore skip rules per mode, staleness and confirmations', () => {
    const bundled = parseBundledLock(LOCK);
    const pypiUrl = 'https://files.pythonhosted.org/packages/aa/bb/rich-14.2.0-py3-none-any.whl';
    const es = [
      entry({ name: 'numpy', version: '1', source: 'bundled', sha256: undefined, fileName: undefined }),
      entry({ name: 'gone', version: '1', source: 'bundled', sha256: undefined, fileName: undefined }),
      entry(),
      entry({ name: 'nosaved', fileName: 'nosaved-1-py3-none-any.whl', sha256: H('9') }),
      entry({ name: 'rich', version: '14.2.0', source: 'pypi', fileName: 'rich-14.2.0-py3-none-any.whl', sha256: H('f'), url: pypiUrl }),
      entry({ name: 'richcopy', source: 'pypi', fileName: 'richcopy-1-py3-none-any.whl', sha256: H('e'), url: 'https://files.pythonhosted.org/p/richcopy-1-py3-none-any.whl' }),
      entry({ name: 'native', fileName: 'native-1-cp311-cp311-manylinux_2_17_x86_64.whl', sha256: H('8') }),
      entry({ name: 'old', fileName: 'old-1-py3-none-any.whl', sha256: H('7'), pyodideVersion: '0.28.0' }),
      entry({ name: 'oldnative', fileName: 'oldnative-1-cp314-cp314-pyemscripten_2025_0_wasm32.whl', sha256: H('6'), abiVersion: '2025_0' }),
      entry({ name: 'unkept', fileName: 'unkept-1-py3-none-any.whl', sha256: H('5'), keep: false }),
    ].map((e) => JSON.parse(JSON.stringify(e)));
    const saved = new Set([H('a'), H('e'), H('7'), H('6'), H('5')]);
    const sum = (plan) => ({
      items: plan.items.map((i) => `${i.entry.name}:${i.kind}${i.fallbackUrl ? '+url' : ''}`),
      skipped: Object.fromEntries(plan.skipped.map((s) => [s.name, s.reason])),
    });
    const off = sum(planRestore(es, 'off', RUNTIME, { saved, bundled }));
    assert.deepEqual(off.items, ['numpy:bundled', 'tinypkg:saved', 'richcopy:saved']);
    assert.deepEqual(off.skipped, { gone: 'not-bundled', nosaved: 'wheel-missing', rich: 'network-off', native: 'incompatible', old: 'stale', oldnative: 'incompatible' });
    const hosts = sum(planRestore(es, 'hosts', RUNTIME, { saved, bundled }));
    assert.equal(hosts.skipped.rich, 'needs-package-index');
    assert.deepEqual(hosts.items, off.items);
    const pkg = sum(planRestore(es, 'pkg', RUNTIME, { saved, bundled }));
    assert.deepEqual(pkg.items, ['numpy:bundled', 'tinypkg:saved', 'rich:saved+url', 'richcopy:saved+url']);
    assert.equal(pkg.skipped.old, 'stale');
    const confirmed = sum(planRestore(es, 'off', RUNTIME, { saved, bundled, confirmStale: new Set(['old', 'oldnative']) }));
    assert.ok(confirmed.items.includes('old:saved'));
    assert.equal(confirmed.skipped.oldnative, 'incompatible');
  });
}
