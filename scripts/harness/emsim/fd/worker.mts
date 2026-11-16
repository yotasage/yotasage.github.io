// Worker thread of the fuzz (fuzz.mts runPool): solves one random structure by both solvers per message.
import { parentPort } from 'node:worker_threads';
import { compareOne } from './fuzz.mts';

parentPort.on('message', ({ i, seed, opts }) => {
  let res;
  try { res = compareOne(i, seed, opts); } catch (e) { res = { i, skip: `threw: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}` }; }
  parentPort.postMessage(res);
});
