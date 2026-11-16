// Fetches JLCPCB's impedance stackup templates from the data behind its public impedance calculator
// (https://jlcpcb.com/pcb-impedance-calculator), slowly and resumably, into scripts/harness/emsim/.cache/jlcpcb/.
// Our own script (M1.8a, docs/em-sim/notes-M1.8a.md). Plain fetch from Node: the endpoints need no session, no login
// and no cookies. Nothing but the calculator's own query parameters is sent.
//
//   node jlcpcb/fetch.mjs            (from scripts/harness/emsim; `npm run jlcpcb:fetch`)
//
// Environment (all optional):
//   JLC_MODE      layers (default): one request per layer count (rigid) and one for all boardType 2 templates (flexible boards, not HDI);
//                 combos: one request per menu combination (layers × thickness × outer × inner copper), as the page does.
//   JLC_INTERVAL  base wait between requests in s (default 24; at least 10), JLC_JITTER ± s (default 6)
//   JLC_LIMIT     at most this many network requests in this run (tests)
//   JLC_HOURS     hard time limit (default 8)
//   JLC_DRY=1     print the plan (requests, cached, expected duration) and send nothing
//   JLC_CACHE     cache folder (default ../.cache/jlcpcb next to this folder)

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.resolve(process.env.JLC_CACHE || path.join(HERE, '..', '.cache', 'jlcpcb'));
const API = 'https://jlcpcb.com/api/jlcTools/impedance';
const PAGE = 'https://jlcpcb.com/pcb-impedance-calculator';
const MODE = process.env.JLC_MODE || 'layers';
const INTERVAL = Math.max(10, Number(process.env.JLC_INTERVAL || 24));
const JITTER = Math.min(Math.max(0, Number(process.env.JLC_JITTER ?? 6)), INTERVAL - 10 > 0 ? INTERVAL - 10 : 0, 30);
const LIMIT = process.env.JLC_LIMIT ? Number(process.env.JLC_LIMIT) : Infinity;
const HOURS = Number(process.env.JLC_HOURS || 8);
const DRY = process.env.JLC_DRY === '1';
const TRIES = 5;
const PER_MIN = 2.5; // the rate the duration estimate assumes
const OUTER = [1, 2]; // oz, the page's menu
const INNER = [0.5, 1, 2];
const HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json',
  'user-agent': 'Mozilla/5.0 (compatible; stackup-reader)',
  origin: 'https://jlcpcb.com',
  referer: PAGE,
};

const t0 = Date.now();
const deadline = t0 + HOURS * 3600e3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtDur = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`);
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const file = (key) => path.join(CACHE, `${key}.json.gz`);
const metaFile = (key) => path.join(CACHE, `${key}.meta.json`);
const cached = (key) => fs.existsSync(file(key));

function readCached(key) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(file(key))).toString('utf8'));
}

function save(key, url, body, status, text, count) {
  const tmp = `${file(key)}.tmp`;
  fs.writeFileSync(tmp, zlib.gzipSync(Buffer.from(text, 'utf8'), { level: 9 }));
  fs.renameSync(tmp, file(key));
  const meta = { url, body, status, fetchedAt: new Date().toISOString(), bytes: Buffer.byteLength(text), count };
  fs.writeFileSync(metaFile(key), `${JSON.stringify(meta, null, 1)}\n`);
}

function logFailure(job, reason) {
  fs.appendFileSync(path.join(CACHE, 'failures.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), key: job.key, reason })}\n`);
}

// Checks a response; returns { ok, count, reason }.
function check(job, text) {
  let j;
  try { j = JSON.parse(text); } catch { return { ok: false, reason: `not JSON (${text.slice(0, 80)})` }; }
  if (j.result !== 'success' || !j.body) return { ok: false, reason: `result ${j.result}: ${String(j.message).slice(0, 120)}` };
  if (job.kind === 'options') {
    const n = Object.keys(j.body).length;
    return n > 0 ? { ok: true, count: n } : { ok: false, reason: 'no layer counts' };
  }
  if (!Array.isArray(j.body.list)) return { ok: false, reason: 'no list' };
  if (j.body.total !== j.body.list.length) console.log(`  warning: ${job.key}: total ${j.body.total}, list ${j.body.list.length}`);
  return { ok: true, count: j.body.list.length };
}

let netCount = 0;
let lastAt = 0;
let stopReason = '';

// One request with backoff on 429, 5xx, network errors and unusable answers; the wait before it keeps the rate.
async function run(job) {
  let wait = INTERVAL;
  for (let attempt = 1; attempt <= TRIES; attempt += 1) {
    const gap = (wait + (Math.random() * 2 - 1) * JITTER) * 1000;
    const due = lastAt ? lastAt + gap : Date.now();
    if (due > deadline) { stopReason = `the ${HOURS} h limit`; return 'stop'; }
    if (netCount >= LIMIT) { stopReason = `JLC_LIMIT=${LIMIT}`; return 'stop'; }
    if (due > Date.now()) await sleep(due - Date.now());
    netCount += 1;
    lastAt = Date.now();
    let reason;
    try {
      const r = await fetch(job.url, { method: 'POST', headers: HEADERS, body: job.body, signal: AbortSignal.timeout(300e3) });
      const text = await r.text();
      if (r.ok) {
        const c = check(job, text);
        if (c.ok) { save(job.key, job.url, job.body, r.status, text, c.count); return 'ok'; }
        reason = c.reason;
      } else reason = `HTTP ${r.status}`;
      if (r.status >= 400 && r.status < 500 && r.status !== 429) { logFailure(job, reason); return 'fail'; }
    } catch (e) {
      reason = `${e.name}: ${e.message}`;
    }
    console.log(`  ${stamp()} ${job.key}: ${reason} (try ${attempt}/${TRIES})`);
    if (attempt === TRIES) { logFailure(job, reason); return 'fail'; }
    wait *= 2;
  }
  return 'fail';
}

function templateJob(key, query) {
  return { kind: 'templates', key, url: `${API}/selectPageImpedanceDefaultTemplate`, body: JSON.stringify({ pageNum: 1, pageSize: 99999, ...query, usePurpose: 1 }) };
}

// The template requests, from the menu's layer counts and thicknesses (getLayerThickness).
function templateJobs(options) {
  const counts = Object.keys(options).map(Number).sort((a, b) => a - b);
  const jobs = [];
  if (MODE === 'combos') {
    for (const n of counts) {
      for (const t of options[n]) {
        for (const o of OUTER) {
          for (const i of n > 2 ? INNER : [null]) {
            const q = { plateLayerNumber: n, plateThickness: t, cuprumThickness: o, boardType: 1 };
            if (i !== null) q.innerCopperThickness = i;
            jobs.push(templateJob(`combo-b1-L${n}-T${t}-O${o}${i !== null ? `-I${i}` : ''}`, q));
          }
        }
      }
    }
  } else {
    for (const n of counts) jobs.push(templateJob(`templates-b1-L${n}`, { plateLayerNumber: n, boardType: 1 }));
    jobs.push(templateJob('templates-b2-all', { boardType: 2 }));
  }
  return jobs;
}

let done = 0;
let failed = 0;
let total = 0;
function progress(final) {
  const left = total - done - failed;
  const eta = left / PER_MIN * 60;
  console.log(`${stamp()} ${final ? 'end' : 'progress'}: ${done}/${total} done, ${failed} failed, ${netCount} requests this run, ${fmtDur((Date.now() - t0) / 1000)} so far${left > 0 ? `, about ${fmtDur(eta)} left` : ''}`);
}

async function main() {
  if (!['layers', 'combos'].includes(MODE)) throw new Error(`JLC_MODE must be layers or combos, not ${MODE}`);
  fs.mkdirSync(CACHE, { recursive: true });
  console.log(`JLCPCB stackup fetch, mode ${MODE}, cache ${CACHE}`);
  console.log(`rate: ${INTERVAL} ± ${JITTER} s between requests, backoff ×2 on 429/5xx/errors, ${TRIES} tries, limit ${HOURS} h`);
  const optJob = { kind: 'options', key: 'options', url: `${API}/getLayerThickness`, body: '{}' };
  let jobs = [];
  if (cached('options')) {
    jobs = templateJobs(readCached('options').body);
  } else if (MODE === 'combos') {
    console.log('options not cached yet: the combination count is estimated from 184 layer/thickness pairs (2026-11-16)');
  }
  const estimate = jobs.length ? jobs.length + (cached('options') ? 0 : 1) : (MODE === 'combos' ? 1 + 9 * 2 + 175 * 6 : 1 + 32 + 1);
  const toFetch = jobs.length ? jobs.filter((j) => !cached(j.key)).length + (cached('options') ? 0 : 1) : estimate;
  total = estimate;
  console.log(`requests: ${estimate} in all, ${toFetch} still to fetch; expected about ${fmtDur(toFetch / PER_MIN * 60)} at ${PER_MIN} a minute`);
  if (DRY) return;

  if (!cached('options')) {
    const r = await run(optJob);
    if (r !== 'ok') { failed += r === 'fail' ? 1 : 0; return; }
    jobs = templateJobs(readCached('options').body);
    total = jobs.length + 1;
    console.log(`menu read: ${jobs.length} template requests`);
  }
  done += 1;
  for (const job of jobs) {
    if (cached(job.key)) { done += 1; continue; }
    const r = await run(job);
    if (r === 'stop') break;
    if (r === 'ok') done += 1; else failed += 1;
    if ((done + failed) % 10 === 0) progress(false);
  }
}

try {
  await main();
} catch (e) {
  console.error(`error: ${e.stack || e}`);
  process.exitCode = 1;
} finally {
  if (!DRY) {
    progress(true);
    if (stopReason) console.log(`stopped by ${stopReason}; run again to resume (cached answers are skipped)`);
    if (failed) { console.log(`${failed} failed (see failures.jsonl in the cache); run again to retry them`); process.exitCode = 1; }
  }
}
