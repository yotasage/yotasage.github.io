// Worker thread of fd/cache.mts: the FD solve and quantities of one fuzz structure per message.
import { parentPort } from 'node:worker_threads';
import { randomCase } from './fuzz.mts';
import { setupSection } from '../../../../lib/emsim/lines';
import { fdSolve, inputFromSection } from './solve.mts';
import { fdQuantities } from './lines.mts';
parentPort.on('message', ({ i, seed }) => {
  let res: any;
  try {
    const c = randomCase(i, seed);
    if (!c) res = { i, skip: 'none' };
    else {
      const sec: any = setupSection(c.setup);
      const r = fdSolve(inputFromSection(sec), { levels: 4 });
      const { v, e } = fdQuantities(r);
      res = { i, kind: c.kind, desc: c.desc, v, e, C: r.C, C0: r.C0, eC: r.err.C, eC0: r.err.C0 };
    }
  } catch (err) { res = { i, skip: String(err) }; }
  parentPort.postMessage(res);
});
