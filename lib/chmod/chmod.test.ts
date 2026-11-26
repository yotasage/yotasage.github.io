import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzePermissions,
  buildChmodCommand,
  CHMOD_PRESETS,
  DEFAULT_PERMISSIONS,
  OCTAL_GUIDE_ROWS,
  parsePermissionInput,
  permissionsEqual,
  permissionsToBinary,
  permissionsToLsString,
  permissionsToOctal,
  permissionsToSymbolic,
  permissionsToSymbolicClause,
  quoteShellTarget,
  setRoleAllRights,
  togglePermissionRight,
  toggleSpecialBit,
} from './permissions';

test('default permissions equal 755 / rwxr-xr-x', () => {
  assert.equal(permissionsToOctal(DEFAULT_PERMISSIONS), '755');
  assert.equal(permissionsToOctal(DEFAULT_PERMISSIONS, true), '0755');
  assert.equal(permissionsToSymbolic(DEFAULT_PERMISSIONS), 'rwxr-xr-x');
  assert.equal(permissionsToLsString(DEFAULT_PERMISSIONS, 'file'), '-rwxr-xr-x');
  assert.equal(permissionsToLsString(DEFAULT_PERMISSIONS, 'directory'), 'drwxr-xr-x');
  assert.equal(permissionsToSymbolicClause(DEFAULT_PERMISSIONS), 'u=rwx,g=rx,o=rx');
  assert.equal(permissionsToBinary(DEFAULT_PERMISSIONS), '111 101 101');
});

test('toggling checkboxes updates octal and symbolic accurately', () => {
  let perms = DEFAULT_PERMISSIONS;
  perms = togglePermissionRight(perms, 'group', 'write'); // 775
  assert.equal(permissionsToOctal(perms), '775');
  assert.equal(permissionsToSymbolic(perms), 'rwxrwxr-x');

  perms = togglePermissionRight(perms, 'others', 'read');
  perms = togglePermissionRight(perms, 'others', 'execute'); // 770
  assert.equal(permissionsToOctal(perms), '770');
  assert.equal(permissionsToSymbolic(perms), 'rwxrwx---');

  perms = setRoleAllRights(perms, 'owner', false); // 070
  assert.equal(permissionsToOctal(perms), '070');
  assert.equal(permissionsToSymbolic(perms), '---rwx---');
});

test('special bits (SUID, SGID, Sticky) produce lowercase s/t with x and uppercase S/T without x', () => {
  const suidExec = toggleSpecialBit(DEFAULT_PERMISSIONS, 'setuid');
  assert.equal(permissionsToOctal(suidExec), '4755');
  assert.equal(permissionsToSymbolic(suidExec), 'rwsr-xr-x');
  assert.equal(permissionsToBinary(suidExec), '100 111 101 101');

  const suidNoExec = togglePermissionRight(suidExec, 'owner', 'execute');
  assert.equal(permissionsToOctal(suidNoExec), '4655');
  assert.equal(permissionsToSymbolic(suidNoExec), 'rwSr-xr-x');

  const sgidNoExec = toggleSpecialBit(
    togglePermissionRight(DEFAULT_PERMISSIONS, 'group', 'execute'),
    'setgid',
  );
  assert.equal(permissionsToOctal(sgidNoExec), '2745');
  assert.equal(permissionsToSymbolic(sgidNoExec), 'rwxr-Sr-x');

  const stickyNoExec = toggleSpecialBit(
    togglePermissionRight(DEFAULT_PERMISSIONS, 'others', 'execute'),
    'sticky',
  );
  assert.equal(permissionsToOctal(stickyNoExec), '1754');
  assert.equal(permissionsToSymbolic(stickyNoExec), 'rwxr-xr-T');

  const stickyExec = parsePermissionInput('1777');
  assert.equal(stickyExec.ok, true);
  if (stickyExec.ok) {
    assert.equal(permissionsToSymbolic(stickyExec.permissions), 'rwxrwxrwt');
  }
});

test('parsePermissionInput parses 3-digit octal, 4-digit octal, symbolic, ls -l, and full chmod commands', () => {
  const p600 = parsePermissionInput('600');
  assert.equal(p600.ok, true);
  if (p600.ok) {
    assert.equal(p600.format, 'octal3');
    assert.equal(p600.normalizedOctal, '600');
    assert.equal(permissionsToSymbolic(p600.permissions), 'rw-------');
  }

  const p0644 = parsePermissionInput('0644');
  assert.equal(p0644.ok, true);
  if (p0644.ok) {
    assert.equal(p0644.format, 'octal4');
    assert.equal(p0644.normalizedOctal, '644');
    assert.equal(permissionsToSymbolic(p0644.permissions), 'rw-r--r--');
  }

  const p4755 = parsePermissionInput('4755');
  assert.equal(p4755.ok, true);
  if (p4755.ok) {
    assert.equal(p4755.permissions.special.setuid, true);
    assert.equal(permissionsToSymbolic(p4755.permissions), 'rwsr-xr-x');
  }

  const pSym = parsePermissionInput('drwxr-xr-x');
  assert.equal(pSym.ok, true);
  if (pSym.ok) {
    assert.equal(pSym.format, 'symbolic');
    assert.equal(pSym.inferredTargetKind, 'directory');
    assert.equal(permissionsEqual(pSym.permissions, DEFAULT_PERMISSIONS), true);
  }

  const pSymSpecial = parsePermissionInput('rwsr-Sr-T');
  assert.equal(pSymSpecial.ok, true);
  if (pSymSpecial.ok) {
    assert.equal(permissionsToOctal(pSymSpecial.permissions), '7744');
    assert.equal(permissionsToSymbolic(pSymSpecial.permissions), 'rwsr-Sr-T');
  }

  const pCmd = parsePermissionInput('sudo chmod -Rv 640 /etc/app/secrets.env');
  assert.equal(pCmd.ok, true);
  if (pCmd.ok) {
    assert.equal(pCmd.format, 'command');
    assert.equal(pCmd.normalizedOctal, '640');
    assert.equal(pCmd.extractedRecursive, true);
    assert.equal(pCmd.extractedVerbose, true);
    assert.equal(pCmd.extractedTarget, '/etc/app/secrets.env');
  }
});

test('parsePermissionInput rejects invalid octal digits, bad lengths, and malformed strings', () => {
  const empty = parsePermissionInput('   ');
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.errorCode, 'empty');

  const badOctal = parsePermissionInput('789');
  assert.equal(badOctal.ok, false);
  if (!badOctal.ok) {
    assert.equal(badOctal.errorCode, 'invalid_octal_digit');
    assert.equal(badOctal.detail, '8');
  }

  const tooShort = parsePermissionInput('75');
  assert.equal(tooShort.ok, false);
  if (!tooShort.ok) assert.equal(tooShort.errorCode, 'invalid_length');

  const tooLong = parsePermissionInput('07551');
  assert.equal(tooLong.ok, false);
  if (!tooLong.ok) assert.equal(tooLong.errorCode, 'invalid_length');

  const badSymbolic = parsePermissionInput('rwxr-xr-z');
  assert.equal(badSymbolic.ok, false);

  const badSymbolicOrder = parsePermissionInput('wrxr-xr-x');
  assert.equal(badSymbolicOrder.ok, false);
  if (!badSymbolicOrder.ok) assert.equal(badSymbolicOrder.errorCode, 'invalid_symbolic');
});

test('buildChmodCommand formats flags, notations, and shell quoting safely', () => {
  assert.equal(
    buildChmodCommand(DEFAULT_PERMISSIONS, {
      target: 'filename',
      recursive: false,
      verbose: false,
      notation: 'octal',
    }),
    'chmod 755 filename',
  );

  assert.equal(
    buildChmodCommand(DEFAULT_PERMISSIONS, {
      target: '/var/www/my site',
      recursive: true,
      verbose: true,
      notation: 'octal',
    }),
    "chmod -Rv 755 '/var/www/my site'",
  );

  assert.equal(
    buildChmodCommand(DEFAULT_PERMISSIONS, {
      target: 'deploy.sh',
      recursive: false,
      verbose: false,
      notation: 'symbolic',
    }),
    'chmod u=rwx,g=rx,o=rx deploy.sh',
  );

  assert.equal(quoteShellTarget('  '), 'filename');
  assert.equal(quoteShellTarget("it's.sh"), "'it'\\''s.sh'");
});

test('analyzePermissions flags security cautions and matches presets cleanly', () => {
  const a755 = analyzePermissions(DEFAULT_PERMISSIONS);
  assert.equal(a755.matchedPresetId, '755');
  assert.deepEqual(a755.warnings, []);

  const p777 = parsePermissionInput('777');
  assert.equal(p777.ok, true);
  if (p777.ok) {
    const a777 = analyzePermissions(p777.permissions);
    assert.equal(a777.matchedPresetId, '777');
    assert.equal(a777.warnings.includes('world_writable_all'), true);
  }

  const p1777 = parsePermissionInput('1777');
  assert.equal(p1777.ok, true);
  if (p1777.ok) {
    const a1777 = analyzePermissions(p1777.permissions);
    // Sticky bit makes 1777 intentional for shared dirs like /tmp
    assert.equal(a1777.warnings.includes('world_writable_all'), false);
    assert.equal(a1777.warnings.includes('world_writable'), false);
    assert.equal(a1777.matchedPresetId, '1777');
  }

  const p000 = parsePermissionInput('000');
  assert.equal(p000.ok, true);
  if (p000.ok) {
    const a000 = analyzePermissions(p000.permissions);
    assert.equal(a000.warnings.includes('no_permissions'), true);
  }
});

test('all presets are internally consistent and unique', () => {
  const ids = new Set<string>();
  for (const preset of CHMOD_PRESETS) {
    assert.equal(ids.has(preset.id), false, `duplicate preset id ${preset.id}`);
    ids.add(preset.id);
    const parsed = parsePermissionInput(preset.octal);
    assert.equal(parsed.ok, true, `preset ${preset.id} failed to parse`);
    if (parsed.ok) {
      assert.equal(permissionsToOctal(parsed.permissions), preset.octal);
      assert.equal(permissionsToSymbolic(parsed.permissions), preset.symbolic);
    }
  }
  assert.equal(OCTAL_GUIDE_ROWS.length, 8);
  assert.equal(OCTAL_GUIDE_ROWS[7].symbolic, 'rwx');
  assert.equal(OCTAL_GUIDE_ROWS[0].symbolic, '---');
});
