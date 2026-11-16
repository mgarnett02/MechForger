import fs from 'node:fs';
import type { CanonEntry } from '../../src/data/canonFormat';
import { decodeProtoMech, decodeStationary, decodeSupport, decodeVehicle, decodeVessel } from '../../src/data/canonFormat';
import { protoMechBV, protoMechCost } from '../../src/rules/protomech';
import { decodeMech, decodeFighter } from '../../src/data/canonFormat';
import { mechBV, mechCost, fighterBV, fighterCost } from '../../src/rules/battleValue';
import { stationaryBV, stationaryCost } from '../../src/rules/stationary';
import { supportBV, supportCost, vehicleBV, vehicleCost, vesselBV, vesselCost } from '../../src/rules/battleValue';

const dir = process.argv[2];
const mm = new Map<string, { bv: number; cost: number; file: string }>();
for (const f of ['mm.tsv', 'mmveh.tsv', 'mmmech.tsv']) {
  for (const line of fs.readFileSync(`${dir}/${f}`, 'utf8').split('\n')) {
    const [file, chassis, model, bv, cost, , tb] = line.split('\t');
    if (!file || chassis === 'ERROR') continue;
    mm.set(`${chassis} ${model ?? ''}`.trim() + '|' + tb, { bv: Number(bv), cost: Number(cost), file });
  }
}
const kinds: [string, (d: unknown) => unknown, (d: never) => { total: number }, (d: never) => { total: number }][] = [
  ['protomechs', decodeProtoMech, protoMechBV as never, protoMechCost as never],
  ['stationary', decodeStationary, stationaryBV as never, stationaryCost as never],
  ['support', decodeSupport, supportBV as never, supportCost as never],
  ['vessels', decodeVessel, vesselBV as never, vesselCost as never],
  ['vehicles', decodeVehicle, vehicleBV as never, vehicleCost as never],
  ['mechs', decodeMech, mechBV as never, mechCost as never],
  ['fighters', decodeFighter, fighterBV as never, fighterCost as never],
];
const only = process.argv[3];
for (const [k, dec, bvf, cf] of kinds) {
  if (only && only !== k) continue;
  const list = JSON.parse(fs.readFileSync(`src/data/canon/${k}.json`, 'utf8')) as CanonEntry[];
  let n = 0, bvExact = 0, bvNear = 0, costExact = 0, costNear = 0;
  const bad: string[] = [];
  for (const e of list) {
    const m = mm.get(`${e.n}|${e.tb}`);
    if (!m) continue;
    n++;
    const d = dec(e.d) as never;
    const bv = bvf(d).total;
    const cost = cf(d).total;
    if (bv === m.bv) bvExact++;
    if (Math.abs(bv - m.bv) <= Math.max(1, m.bv * 0.02)) bvNear++;
    if (Math.abs(cost - m.cost) <= 1) costExact++;
    if (Math.abs(cost - m.cost) <= m.cost * 0.02) costNear++;
    if (bv !== m.bv || Math.abs(cost - m.cost) > 1) bad.push(`${e.n}\tBV ${bv} vs ${m.bv}\tcost ${cost} vs ${m.cost}`);
  }
  console.log(`${k}: ${n} matched; BV exact ${bvExact}, within 2% ${bvNear}; cost exact ${costExact}, within 2% ${costNear}`);
  if (process.env.SHOW) for (const b of bad.slice(0, Number(process.env.SHOW))) console.log('   ' + b);
}
