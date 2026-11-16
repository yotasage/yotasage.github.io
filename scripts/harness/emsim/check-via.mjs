// Via structures: the presets are valid on every preset stackup, stubs and backdrill lengths, and every kind of
// mistake is found.

import * as S0 from '../../../lib/emsim/stackup.ts';
import * as P0 from '../../../lib/emsim/presets.ts';
import * as V0 from '../../../lib/emsim/via.ts';

const S = S0.default ?? S0;
const P = P0.default ?? P0;
const V = V0.default ?? V0;

const clone = (x) => JSON.parse(JSON.stringify(x));
const codes = (s, v) => V.viaIssues(s, v).filter((i) => i.level === 'error').map((i) => i.code);

export function run(t) {
  for (const id of P.PRESET_IDS) {
    const s = P.presetStackup(id);
    for (const kind of V.VIA_PRESETS) {
      const v = V.presetVia(kind, s);
      const issues = V.viaIssues(s, v);
      t.ok(!issues.some((i) => i.level === 'error'), () => `${id} ${kind}: ${JSON.stringify(issues)}`);
      const st = V.viaStubs(s, v);
      t.ok(st.top === 0 && st.bottom === 0, `${id} ${kind}: a through via from top to bottom has no stub`);
      t.ok(V.sameVia(v, clone(v)), `${id} ${kind}: sameVia on a copy`);
    }
  }
  const s = P.presetStackup('JLC061611-3313A');
  const z = S.stackZ(s);
  const idx = (id) => s.layers.findIndex((l) => l.id === id);
  // The carrier's via: L1 to L6, antipad Ø1.8 on L2 and L5, return vias 0.8 away (C44).
  const single = V.presetVia('single', s);
  t.ok(single.planes.join() === 'L2,L5' && single.antipads.every((a) => a.d.v === 1.8), 'C44: antipads Ø1.8 on L2 and L5');
  const pair = V.presetVia('pair', s);
  t.ok(pair.pitch.v === 0.7 && pair.returns.length === 6 && pair.pads.filter((p) => p.d).length === 2, 'C45: pitch 0.7, six return vias, pads only on the signal layers');
  // Stub: L1 to L3 through the whole board leaves the barrel from L3 down to L6.
  const stub = clone(single);
  stub.exit = 'L3';
  stub.feeds[1].layer = 'L3';
  t.ok(codes(s, stub).length === 0, () => `L1–L3 via: ${JSON.stringify(V.viaIssues(s, stub))}`);
  const want = z[idx('L3') + 1] - z[idx('L6') + 1];
  t.near(V.viaStubs(s, stub).bottom, want, 'stub below L3');
  // Backdrill from the bottom, 0.3 mm deep from the bottom of the stack: the stub shrinks by 0.3 less the mask.
  stub.backdrill = { side: 'bottom', depth: S.val(0.3), d: S.val(0.5) };
  t.ok(codes(s, stub).length === 0, 'backdrill is valid');
  t.near(V.viaStubs(s, stub).bottom, want - (0.3 - z[idx('L6') + 1]), 'stub after backdrill');
  stub.backdrill.depth = S.val(1.4);
  t.ok(codes(s, stub).includes('backdrill'), 'a backdrill into the signal layer is refused');
  // Mistakes.
  const m = (f) => { const v = clone(single); f(v); return codes(s, v); };
  t.ok(m((v) => { v.plating = S.val(0.2); }).includes('range'), 'plating that closes the hole');
  t.ok(m((v) => { v.antipads[0].d = S.val(0.5); }).includes('antipad'), 'antipad smaller than the pad');
  t.ok(m((v) => { v.antipads = []; }).includes('antipad'), 'a plane passed without an antipad');
  t.ok(m((v) => { v.returns[0].y = S.val(0.4); }).includes('return'), 'a return via over the signal via');
  t.ok(m((v) => { v.feeds[0].layer = 'L3'; }).includes('feed'), 'a feed on a layer the via does not connect');
  t.ok(m((v) => { v.entry = 'L2'; }).includes('plane'), 'a plane as signal layer');
  t.ok(m((v) => { v.pads[0].d = null; }).includes('pad'), 'no pad on the entry layer');
  t.ok(m((v) => { v.entry = 'D1'; }).includes('layer'), 'a dielectric as entry');
  t.ok(m((v) => { v.antipads[0].shape = 'oblong'; }).includes('antipad'), 'an oblong antipad on a single via');
  const p2 = clone(pair);
  p2.pitch = S.val(0.45);
  t.ok(codes(s, p2).includes('pitch'), 'pair pads that overlap');
  const near = clone(single);
  near.returns[0].y = S.val(0.75);
  t.ok(V.viaIssues(s, near).some((i) => i.code === 'return' && i.level === 'warn'), 'an antipad that cuts into a return via is a warning');
}
