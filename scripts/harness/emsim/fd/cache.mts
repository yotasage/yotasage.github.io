// The FD side of the fuzz, solved once and saved (M1.4a-fix): tsx fd/cache.mts <out.json> (500 structures of the
// default seed on 16 threads, about 15 min). fd/bench.mts then compares the BEM with it in about 20 s, so a change to
// the BEM can be tried on the whole fuzz without solving the FD again. Every worker is ended before it returns.
import { Worker } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { SEED } from './fuzz.mts';
const out: any[] = [];
const queue = Array.from({ length: 500 }, (_, k) => k);
const threads = 16;
let busy = 0;
const workers: Worker[] = [];
await new Promise<void>((resolve) => {
  const next = (w: Worker) => { const i = queue.shift(); if (i === undefined) { if (busy === 0) resolve(); return; } busy++; w.postMessage({ i, seed: SEED }); };
  for (let k = 0; k < threads; k++) { const w = new Worker(new URL('./cacheworker.mts', import.meta.url)); workers.push(w); w.on('message', (r) => { busy--; out.push(r); if (out.length % 50 === 0) console.log(out.length); next(w); }); next(w); }
});
await Promise.all(workers.map((w) => w.terminate()));
out.sort((a, b) => a.i - b.i);
writeFileSync(process.argv[2], JSON.stringify(out));
console.log('done', out.length);
