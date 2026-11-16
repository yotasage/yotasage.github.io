// Re-makes the openEMS fixtures of fullwave.md section 14 (step M0.4b): `npm run openems [microstrip|via ...]`.
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
const all = { microstrip: 'microstrip.py', via: 'via.py' };
const args = process.argv.slice(2);
const names = args.filter((a) => !a.startsWith('--'));
const flags = args.filter((a) => a.startsWith('--'));
const chosen = names.length ? names : Object.keys(all);
const limitMs = 30 * 60 * 1000; // per script

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
  const log = join(logDir, `${name}.log`);
  const out = createWriteStream(log);
  const t0 = Date.now();
  const code = await new Promise((resolve) => {
    const child = spawn(python, [join(here, script), ...flags], {
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
