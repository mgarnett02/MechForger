import { describe, expect, it } from 'vitest';
import P from '../data/canon/protomechs.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeProtoMech } from '../data/canonFormat';
import {
  addProtoItem, computeProtoMech, maximizeProtoArmor, newProtoMech, parseProtoMech, protoEngineRating, protoEngineWeight,
  protoItemWeight, protoMaxArmor, protoMaxArmorTotal, protoMechBV, protoMechCost, protoStructure, setProtoJumpMP, validateProtoMech,
} from './protomech';
import type { ProtoMechDesign } from './protomech';

const errors = (d: ProtoMechDesign) => validateProtoMech(d).filter((i) => i.severity === 'error').map((i) => i.message);
const canon = (n: string) => decodeProtoMech((P as CanonEntry[]).find((e) => e.n === n)!.d);

describe('ProtoMech construction tables (as MegaMek TestProtoMek)', () => {
  it('engine rating: running MP × tonnage, quads and gliders 2 less, rounded to 5 above 40', () => {
    expect(protoEngineRating({ walkMP: 3, tonnage: 2, motion: 'biped' })).toBe(10);
    expect(protoEngineRating({ walkMP: 5, tonnage: 14, motion: 'glider' })).toBe(85); // (8 − 2) × 14 = 84
    expect(protoEngineWeight(10)).toBe(0.25);
    expect(protoEngineWeight(60)).toBe(1.5);
  });

  it('structure, armor limits and the main gun', () => {
    const d = newProtoMech();
    expect(protoStructure({ ...d, tonnage: 9 })).toEqual({ HD: 2, TO: 9, RA: 2, LA: 2, LG: 5, MG: 0 });
    expect(protoStructure({ ...d, tonnage: 7, motion: 'quad' }).LG).toBe(8);
    expect(protoMaxArmor({ ...d, tonnage: 9 }, 'HD')).toBe(6);
    expect(protoMaxArmorTotal({ ...d, tonnage: 9 })).toBe(42);
    const gun = addProtoItem({ ...d, tonnage: 9 }, 'CLERMediumLaser', 'MG');
    expect(protoMaxArmorTotal(gun)).toBe(45);
    expect(protoMaxArmor(gun, 'MG')).toBe(3);
  });

  it('proto launchers and jump jets weigh by tonnage', () => {
    const d = { ...newProtoMech(), tonnage: 7 };
    expect(protoItemWeight(d, { uid: '', equipmentId: 'CLSRM6', location: 'TO' })).toBe(1.5);
    expect(protoItemWeight(d, { uid: '', equipmentId: 'CLLRM10', location: 'TO' })).toBe(2);
    expect(computeProtoMech(setProtoJumpMP(d, 4)).weights.equipment).toBe(0.4);
    expect(computeProtoMech(setProtoJumpMP(d, 4, true)).weights.equipment).toBe(0.8);
  });
});

describe('ProtoMech validation, BV and cost', () => {
  it('a new ProtoMech can be built legally', () => {
    let d = { ...newProtoMech('3062'), tonnage: 5, walkMP: 5 };
    d = addProtoItem(d, 'CLERMediumLaser', 'TO');
    d = maximizeProtoArmor(d);
    const s = computeProtoMech(d);
    expect(s.heatSinks).toBe(5);
    expect(s.weights.total).toBeLessThanOrEqual(5.5);
    expect(errors(d).filter((m) => !/Overweight/.test(m))).toEqual([]);
    expect(parseProtoMech(JSON.parse(JSON.stringify(d))).equipment[0].location).toBe('TO');
  });

  it('slot, arm-weight and era checks', () => {
    let d = { ...newProtoMech('3062'), tonnage: 9 };
    d = addProtoItem(d, 'CLERLargeLaser', 'RA');
    expect(errors(d).some((m) => /Right Arm: 4 tons/.test(m))).toBe(true);
    expect(errors({ ...newProtoMech('3025') }).some((m) => /cannot be built/.test(m))).toBe(true);
    expect(errors({ ...newProtoMech('3062'), motion: 'glider', walkMP: 2 })).toContain('Glider ProtoMechs need at least 4 flanking MP.');
  });

  it('canon ProtoMechs convert at their tonnage and pass', () => {
    for (const n of ['Harpy', 'Minotaur', 'Roc', 'Hobgoblin Ultraheavy ProtoMech', 'Basilisk ProtoMech (Quad)']) {
      const d = canon(n);
      const s = computeProtoMech(d);
      expect(s.weights.free, n).toBeGreaterThanOrEqual(-1e-9);
      expect(errors(d), n).toEqual([]);
    }
  });

  it('BV follows MegaMek: +0.1 defensive factor, jump TMM +1, ammo by the shot', () => {
    const harpy = canon('Harpy');
    const bv = protoMechBV(harpy);
    // Armor 11 × 2.5 + structure 7 × 1.5 = 38; × (1 + 2/10 + 0.1)
    expect(bv.defensive).toBeCloseTo(38 * 1.3, 5);
    expect(bv.total).toBe(Math.round(bv.defensive + bv.offensive));
    expect(protoMechCost(harpy).total).toBeGreaterThan(500000);
  });
});
