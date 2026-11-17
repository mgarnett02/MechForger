// Compare MechForger's construction weight and legality with MegaMek's (output of Weight.java) over the canon units.
// Usage: npx vite-node tools/megamek-check/weights.ts <weights.tsv> [kind]   (SHOW=n lists the differences)
import fs from 'node:fs';
import type { CanonEntry } from '../../src/data/canonFormat';
import {
  decodeBattleArmor, decodeFighter, decodeMech, decodeProtoMech, decodeStationary, decodeSupport, decodeVehicle, decodeVessel,
} from '../../src/data/canonFormat';
import { computeMech, validate } from '../../src/rules/index';
import { computeVehicle, validateVehicle } from '../../src/rules/vehicle';
import { computeFighter, validateFighter } from '../../src/rules/fighter';
import { computeSupport, validateSupport } from '../../src/rules/support';
import { computeVessel, validateVessel } from '../../src/rules/vessel';
import { baItemWeight, computeBattleArmor, validateBattleArmor } from '../../src/rules/battlearmor';
import type { BattleArmorDesign } from '../../src/rules/battlearmor';
import { computeProtoMech, validateProtoMech } from '../../src/rules/protomech';
import { computeStationary, validateStationary } from '../../src/rules/stationary';

type Row = { weight: number; rounded: number; tonnage: number; legal: boolean; problems: string; file: string };
const mm = new Map<string, Row | 'ambiguous'>();
for (const line of fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/)) {
  // MegaMek reports the total rounded up to the half ton (kilogram for small units); either it or the exact sum may match.
  const [file, chassis, model, tb, tonnage, rounded, weight, legal, problems] = line.split('\t');
  if (!file || chassis === 'ERROR' || chassis === 'NOVERIFIER') continue;
  const key = `${`${chassis} ${model ?? ''}`.trim()}|${tb}`;
  const row = { weight: Number(weight), rounded: Number(rounded), tonnage: Number(tonnage), legal: legal === 'LEGAL', problems: problems ?? '', file };
  const prev = mm.get(key);
  mm.set(key, prev && (prev === 'ambiguous' || prev.weight !== row.weight || prev.legal !== row.legal) ? 'ambiguous' : row);
}

type Summary = { weights: { total?: number; free?: number } };
type Kind = [string, (d: unknown) => unknown, (d: never) => Summary, (d: never) => { severity: string; message: string }[]];
const kinds: Kind[] = [
  ['mechs', decodeMech, computeMech as never, validate as never],
  ['vehicles', decodeVehicle, computeVehicle as never, validateVehicle as never],
  ['fighters', decodeFighter, computeFighter as never, validateFighter as never],
  ['support', decodeSupport, computeSupport as never, validateSupport as never],
  ['vessels', decodeVessel, computeVessel as never, validateVessel as never],
  ['battlearmor', decodeBattleArmor, computeBattleArmor as never, validateBattleArmor as never],
  ['protomechs', decodeProtoMech, computeProtoMech as never, validateProtoMech as never],
  ['stationary', decodeStationary, computeStationary as never, validateStationary as never],
];
const only = process.argv[3];
for (const [k, dec, compute, check] of kinds) {
  if (only && only !== k) continue;
  const list = JSON.parse(fs.readFileSync(`src/data/canon/${k}.json`, 'utf8')) as CanonEntry[];
  let n = 0, ambiguous = 0, same = 0, legalSame = 0, mmTrooperBug = 0;
  const bad: string[] = [];
  for (const e of list) {
    const m = mm.get(`${e.n}|${e.tb}`);
    if (!m) continue;
    if (m === 'ambiguous') { ambiguous++; continue; }
    n++;
    const d = dec(e.d) as never;
    const s = compute(d);
    const tonnage = (d as { tonnage?: number }).tonnage ?? m.tonnage;
    // Battle armor: MechForger weighs one trooper, MegaMek the squad.
    const w = (s.weights.total ?? tonnage - (s.weights.free ?? 0)) * (k === 'battlearmor' ? (d as { squadSize: number }).squadSize : 1);
    const errors = check(d).filter((i) => i.severity === 'error').map((i) => i.message);
    let weightOk = Math.abs(w - m.weight) < 1e-6 || Math.abs(w - m.rounded) < 1e-6;
    if (!weightOk && k === 'battlearmor') {
      // MegaMek sums troopers 0..n-1, where 0 is the squad slot without per-trooper items: the last trooper is left out.
      const ba = d as BattleArmorDesign;
      const sb = s as unknown as { weights: { total: number; equipment: number } };
      const base = sb.weights.total - sb.weights.equipment;
      const trooper = (t: number) => base + ba.equipment.filter((i) => i.trooper === undefined || i.trooper === t).reduce((a, i) => a + baItemWeight(ba, i), 0);
      let mmStyle = 0;
      for (let t = 0; t < ba.squadSize; t++) mmStyle += Math.round(trooper(t) * 1000) / 1000;
      if (Math.abs(mmStyle - m.weight) < 1e-6) { mmTrooperBug++; weightOk = true; same--; }
    }
    if (weightOk) same++;
    if ((errors.length === 0) === m.legal) legalSame++;
    if (!weightOk || (errors.length === 0) !== m.legal) {
      bad.push(`${(w - m.weight).toFixed(3)}\t${e.n}\tMF ${w} vs MM ${m.weight} of ${m.tonnage}\tMF ${errors.length ? 'illegal: ' + errors.join(' | ') : 'legal'}\tMM ${m.legal ? 'legal' : 'illegal: ' + m.problems}`);
    }
  }
  console.log(`${k}: ${n} compared (${ambiguous} name clashes skipped); weight equal ${same}${mmTrooperBug ? ` (+${mmTrooperBug} where MegaMek leaves out the last trooper)` : ''}; legality agrees ${legalSame}`);
  if (process.env.SHOW) for (const b of bad.slice(0, Number(process.env.SHOW))) console.log('   ' + b);
}
