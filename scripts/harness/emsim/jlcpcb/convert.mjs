// Converts the cached answers of fetch.mjs (scripts/harness/emsim/.cache/jlcpcb/) into lib/emsim/jlcpcbStackups.json:
// every JLCPCB stackup template once, its layers top to bottom with thickness and JLCPCB's εr, the fetch dates and the
// source URL once at the top. Format in docs/em-sim/notes-M1.8a.md. Prints a summary and every oddity it skipped.
//
//   node jlcpcb/convert.mjs [cache folder] [output file]      (from scripts/harness/emsim; `npm run jlcpcb:convert`)

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.resolve(process.argv[2] || path.join(HERE, '..', '.cache', 'jlcpcb'));
const OUT = path.resolve(process.argv[3] || path.join(HERE, '..', '..', '..', '..', 'lib', 'emsim', 'jlcpcbStackups.json'));
const PAGE = 'https://jlcpcb.com/pcb-impedance-calculator';
const API = 'https://jlcpcb.com/api/jlcTools/impedance/selectPageImpedanceDefaultTemplate';
const BOARD = { 1: 'rigid', 2: 'hdi' };
const SUPPLIER = { 南亚: 'nanya', 生益: 'shengyi', 建滔: 'kingboard' };
const CJK =/[　-〿一-鿿＀-￯]/;

const warnings = new Map();
const warn = (what, example) => {
  const w = warnings.get(what) || { n: 0, example };
  w.n += 1;
  warnings.set(what, w);
};

// JLCPCB's Chinese words in material names, longest first.
const WORDS = [
  ['不含铜蚀刻成光板', 'without copper, etched bare'],
  ['含铜蚀刻成光板', 'with copper, etched bare'],
  ['不含铜', 'without copper'],
  ['含铜', 'with copper'],
];
function english(text) {
  let s = text.replace(/\s+/g, ' ').trim();
  for (const [zh, en] of WORDS) s = s.split(zh).join(` ${en}`);
  s = s.replace(/\s+/g, ' ').trim();
  if (CJK.test(s)) warn('material name left in Chinese', text);
  return s;
}

// "JLC061611-3313A(特殊/成品板厚1.64mm±10%)": offer, Tg, finished thickness and its tolerance.
function display(text) {
  const out = { offer: null, tg: null, finished: null, tol: null, note: null };
  const m = /[(（](.*)[)）]\s*$/.exec(text);
  if (!m) return out;
  const s = m[1];
  if (/不要选用|取消/.test(s)) out.note = 'withdrawn';
  else if (/内层铜厚不一致/.test(s)) out.note = 'inner copper weights differ';
  else if (/特殊叠构|特殊结构/.test(s)) out.note = 'special structure';
  if (/免费/.test(s)) out.offer = 'free';
  else if (/通用|普通/.test(s)) out.offer = 'standard';
  else if (/特殊/.test(s)) out.offer = 'special';
  const tg = /tg-?(\d+)/i.exec(s);
  if (tg) out.tg = Number(tg[1]);
  const f = /(\d+(?:\.\d+)?)\s*(mm)?\s*(?:±|\+\/-)\s*(\d+(?:\.\d+)?)\s*(%|mm)?/.exec(s);
  if (f) {
    out.finished = Number(f[1]);
    out.tol = f[4] === '%' ? { rel: Number(f[3]) / 100 } : { abs: Number(f[3]) };
  } else {
    const g = /(\d+(?:\.\d+)?)\s*mm/.exec(s);
    if (g) out.finished = Number(g[1]);
  }
  if (out.finished === null && !out.note) warn('display name without a finished thickness', text);
  return out;
}

const r4 = (x) => Math.round(x * 1e6) / 1e6;
const day = (iso) => (iso ? String(iso).slice(0, 10) : null);

function readCache() {
  if (!fs.existsSync(CACHE)) throw new Error(`no cache at ${CACHE}; run fetch.mjs first`);
  const files = fs.readdirSync(CACHE).filter((f) => /^(templates|combo)-.*\.json\.gz$/.test(f)).sort();
  const dates = [];
  const all = new Map();
  for (const f of files) {
    const key = f.replace(/\.json\.gz$/, '');
    const meta = JSON.parse(fs.readFileSync(path.join(CACHE, `${key}.meta.json`), 'utf8'));
    dates.push(meta.fetchedAt);
    const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CACHE, f))).toString('utf8'));
    for (const t of j.body.list) if (!all.has(t.impedanceDefaultTemplateAccessId)) all.set(t.impedanceDefaultTemplateAccessId, t);
  }
  dates.sort();
  return { files, templates: [...all.values()], from: day(dates[0]), to: day(dates[dates.length - 1]) };
}

const materials = {};
function material(r, kind) {
  const key = String(r.impedanceBasicDataKeyId);
  if (!materials[key]) {
    const m = { kind, name: english(r.materialName || '') };
    if (r.specificationsModel) m.glass = r.specificationsModel;
    if (r.glueContent) m.resin = r.glueContent;
    if (r.brandType) m.brand = r.brandType;
    if (r.supplierType) m.supplier = SUPPLIER[r.supplierType] || r.supplierType;
    for (const v of Object.values(m)) if (CJK.test(String(v))) warn('material field left in Chinese', String(v));
    if (r.copperThickness) m.cu = r.copperThickness;
    materials[key] = m;
  }
  return key;
}

// basicDataList rows → physical layers top to bottom: ["cu", t] or [kind, t, εr, material key, prepreg t before the
// fill is counted (beforeCountPpDataList, only when it differs)].
function layers(t) {
  const out = [];
  const before = Array.isArray(t.beforeCountPpDataList) && t.beforeCountPpDataList.length === t.basicDataList.length ? t.beforeCountPpDataList : null;
  for (const [i, r] of t.basicDataList.entries()) {
    if (r.materialType === 1) {
      out.push(['cu', r4(r.topConductorThick)]);
    } else if (r.materialType === 0 || r.materialType === 2 || r.materialType === 3) {
      const kind = r.materialType === 0 ? 'pp' : r.materialType === 2 ? 'core' : 'bare';
      if (kind === 'core' && r.topConductorThick > 0) out.push(['cu', r4(r.topConductorThick)]);
      const row = [kind, r4(r.dielectricThick), r.dielectricConstant ?? null, material(r, kind)];
      const b = before && kind === 'pp' ? before[i].dielectricThick : null;
      if (b && Math.abs(b - r.dielectricThick) > 1e-9) row.push(r4(b)); // prepreg before the copper fill is counted
      out.push(row);
      if (kind === 'core' && r.botConductorThick > 0) out.push(['cu', r4(r.botConductorThick)]);
    } else {
      warn(`unknown material type ${r.materialType} (${r.material})`, t.appointName);
      return null;
    }
  }
  return out;
}

function main() {
  const { files, templates, from, to } = readCache();
  const stackups = [];
  let custom = 0;
  const noReq = [];
  for (const t of templates) {
    const label = t.receptionDisplayName || '';
    if (/自定义/.test(t.appointName || '') || /自定义/.test(label)) { custom += 1; continue; }
    if (label === '无要求') { noReq.push(t); continue; }
    const stack = layers(t);
    if (!stack) continue;
    if (stack.some((l) => !(l[1] > 0))) { warn('layer of zero or negative thickness (template skipped)', t.appointName); continue; }
    const d = display(label);
    const s = {
      id: t.appointName,
      board: BOARD[t.boardType] || `type ${t.boardType}`,
      layers: t.plateLayerNumber,
      thickness: t.plateThickness,
      outer: t.cuprumThickness,
      inner: t.plateLayerNumber > 2 ? t.innerCopperThickness : null,
      finished: d.finished,
      tol: d.tol,
      offer: d.offer,
      tg: d.tg,
      note: d.note,
      noReq: false,
      code: t.laminatedConstructionCode || null,
      created: day(t.createTime),
      updated: day(t.dbUpdateTime),
      stack,
    };
    for (const k of ['tg', 'note', 'offer', 'tol', 'finished', 'code', 'created', 'updated']) if (s[k] === null) delete s[k];
    const cuCount = stack.filter((l) => l[0] === 'cu').length;
    if (cuCount !== s.layers) warn('copper layer count differs from the layer count', `${s.id}: ${cuCount}`);
    stackups.push(s);
  }
  // JLCPCB's "No requirement" choice: the template it stands for gets noReq.
  for (const t of noReq) {
    const stack = JSON.stringify(layers(t));
    const same = stackups.find((s) => s.layers === t.plateLayerNumber && s.thickness === t.plateThickness && s.outer === t.cuprumThickness
      && (s.inner === null || s.inner === t.innerCopperThickness) && JSON.stringify(s.stack) === stack);
    if (same) same.noReq = true; else warn('"No requirement" template without a twin (dropped)', t.appointName);
  }
  // An id names one structure per thickness and copper weights; JLCPCB reuses some ids across copper weights.
  const twins = new Map();
  for (const s of stackups) {
    const k = `${s.board} ${s.id} ${s.thickness} ${s.outer} ${s.inner}`;
    twins.set(k, (twins.get(k) || 0) + 1);
  }
  for (const [k, n] of twins) if (n > 1) warn('same id, thickness and copper more than once (kept)', `${k} × ${n}`);
  const shared = stackups.length - new Set(stackups.map((s) => s.id)).size;
  if (shared) console.log(`  ${shared} stackups share their id with one of other copper weights or thickness (unique key: board, id, thickness, outer, inner)`);
  stackups.sort((a, b) => a.board.localeCompare(b.board) || a.layers - b.layers || a.thickness - b.thickness || a.outer - b.outer
    || (a.inner ?? 0) - (b.inner ?? 0) || a.id.localeCompare(b.id));

  const head = {
    source: PAGE,
    api: API,
    fetched: { from, to },
    converted: new Date().toISOString().slice(0, 10),
    note: 'JLCPCB’s impedance stackup templates as its calculator’s API gives them: thickness in mm (copper as pressed; dielectric as pressed, prepreg after JLCPCB counts the fill of the copper next to it), εr as JLCPCB states it (no frequency, no loss tangent). Layers top to bottom: ["cu", t] or [kind, t, εr, material key, prepreg thickness before the fill is counted (only when it differs)], kind pp (prepreg), core, bare (core with its copper etched off). outer/inner in oz; board rigid or hdi (boardType 2, assumed HDI from the page menu).',
    files: files.length,
  };
  const mats = Object.entries(materials).map(([k, m]) => `  ${JSON.stringify(k)}: ${JSON.stringify(m)}`).join(',\n');
  const body = stackups.map((s) => JSON.stringify(s)).join(',\n');
  const json = `${JSON.stringify(head, null, 1).replace(/\n}$/, '')},\n "materials": {\n${mats}\n },\n "stackups": [\n${body}\n]}\n`;
  JSON.parse(json);
  fs.writeFileSync(OUT, json);

  const byLayers = {};
  for (const s of stackups) byLayers[`${s.board} ${s.layers}L`] = (byLayers[`${s.board} ${s.layers}L`] || 0) + 1;
  let off = 0;
  for (const s of stackups) {
    const sum = s.stack.reduce((a, l) => a + l[1], 0);
    if (s.finished && Math.abs(sum - s.finished) / s.finished > 0.15) off += 1;
  }
  console.log(`${files.length} cached answers, ${templates.length} templates: ${stackups.length} stackups, ${noReq.length} "No requirement" twins, ${custom} custom placeholders skipped, ${Object.keys(materials).length} materials`);
  console.log(`per board and layer count: ${Object.entries(byLayers).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  console.log(`${off} stackups whose pressed sum differs from the stated finished thickness by more than 15 %`);
  for (const [what, w] of warnings) console.log(`  ${what}: ${w.n} (e.g. ${w.example})`);
  console.log(`wrote ${OUT} (${(json.length / 1024).toFixed(0)} kB), fetched ${from}…${to}`);
}

main();
