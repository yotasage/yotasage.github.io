// Re-makes the openEMS fixtures of fullwave.md section 14 (steps M0.4b, M6.4a): `npm run openems [name ...] [--coarse]`.
// openEMS (GPL) is installed on the owner's PC only, outside the repo; the paths can be overridden with
// OPENEMS_DIR (the folder holding CSXCAD.dll and openEMS.exe) and OPENEMS_PYTHON (the venv's python.exe).
// openEMS's own output goes to a log per script in the temp folder; only the summary line is printed.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const openemsDir = process.env.OPENEMS_DIR ?? 'C:\\Users\\Jonat\\opt\\openEMS';
const python = process.env.OPENEMS_PYTHON ?? 'C:\\Users\\Jonat\\opt\\openEMS-venv\\Scripts\\python.exe';
// name: script and its arguments (M0.4b: microstrip, via; M6.4a: the via cases and the LVDS pair, notes-M6.4a.md)
const all = {
  microstrip: ['microstrip.py'], via: ['via.py'],
  'via-c44': ['viacases.py', '--case=c44'], 'via-c44-noret': ['viacases.py', '--case=c44-noret'],
  'via-c44-stub': ['viacases.py', '--case=c44-stub'], 'via-c44-bd': ['viacases.py', '--case=c44-bd'],
  'via-c45': ['viacases.py', '--case=c45'], 'msl-c41': ['lvds.py'],
};
const args = process.argv.slice(2);
const names = args.filter((a) => !a.startsWith('--'));
const flags = args.filter((a) => a.startsWith('--'));
const chosen = names.length ? names : Object.keys(all);
const limitMs = 60 * 60 * 1000; // per script (the pair: two runs of about 2.5 M cells)

for (const p of [openemsDir, python]) {
  if (!existsSync(p)) {
    console.error(`missing ${p}: install openEMS as docs/em-sim/notes-M0.4b.md says`);
    process.exit(1);
  }
}
const logDir = join(tmpdir(), 'emsim-openems');
mkdirSync(logDir, { recursive: true });

let failed = 0;
for (const name of chosen) {
  const script = all[name];
  if (!script) {
    console.error(`unknown fixture ${name}; known: ${Object.keys(all).join(', ')}`);
    process.exit(1);
  }
  const log = join(logDir, `${name}${flags.includes('--coarse') ? '-coarse' : ''}.log`);
  const out = createWriteStream(log);
  const t0 = Date.now();
  const code = await new Promise((resolve) => {
    const child = spawn(python, ['-I', join(here, script[0]), ...script.slice(1), ...flags], {
      cwd: here,
      env: { ...process.env, CSXCAD_INSTALL_PATH: openemsDir, PYTHONUNBUFFERED: '1' },
    });
    child.stdout.pipe(out, { end: false });
    child.stderr.pipe(out, { end: false });
    const timer = setTimeout(() => {
      console.error(`${name}: over ${limitMs / 60000} min, stopped`);
      // the venv's python.exe is a launcher that starts the real interpreter: stop the whole tree
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      else child.kill();
    }, limitMs);
    child.on('close', (c) => {
      clearTimeout(timer);
      resolve(c);
    });
  });
  await new Promise((r) => out.end(r));
  const lines = readFileSync(log, 'utf8').split(/\r?\n/);
  const summary = lines.filter((l) => l.startsWith('RESULT') || l.startsWith('fixture'));
  console.log(`${name}: exit ${code}, ${((Date.now() - t0) / 1000).toFixed(0)} s, log ${log}`);
  for (const l of summary) console.log('  ' + l);
  if (code !== 0) {
    failed++;
    console.log(lines.slice(-15).join('\n'));
  }
}
process.exit(failed ? 1 : 0);
