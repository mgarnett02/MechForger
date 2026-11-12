import { describe, expect, it } from 'vitest';
import { computeFighter, fighterEngineRating, newFighter, validateFighter } from './fighter';
import type { FighterDesign } from './fighter';
import {
  addVesselItem, bayWeight, computeVessel, newVessel, parseVessel, primitiveFactor, validateVessel,
  vesselEngineWeight, vesselFreeHeatSinks, vesselFuelPointsPerTon, vesselMaxArmor,
} from './vessel';
import type { VesselDesign } from './vessel';
import { vesselCost } from './battleValue';
import { computeInfantry, infantryBV, infantryCost, maxSecondary, newInfantry, parseInfantry } from './infantry';

const fErrors = (d: FighterDesign) => validateFighter(d).filter((i) => i.severity === 'error').map((i) => i.message);
const vErrors = (d: VesselDesign) => validateVessel(d).filter((i) => i.severity === 'error').map((i) => i.message);

describe('primitive aerospace fighters', () => {
  it('engine rating × 1.2 rounded up to 5, 5-ton cockpit, primitive armor', () => {
    expect(fighterEngineRating({ fighterType: 'aerospace', tonnage: 50, safeThrust: 6, cockpitType: 'primitive' })).toBe(240);
    expect(fighterEngineRating({ fighterType: 'aerospace', tonnage: 45, safeThrust: 5, cockpitType: 'primitive' })).toBe(165); // 162 → 165
    const d: FighterDesign = { ...newFighter('3025'), tonnage: 50, safeThrust: 6, cockpitType: 'primitive', armorType: 'primitive' };
    const s = computeFighter(d);
    expect(s.weights.controls).toBe(5);
    expect(s.rating).toBe(240);
    expect(s.armorPointsPerTon).toBeCloseTo(16 * 0.67, 1);
    expect(fErrors(d).filter((m) => /rimitive/.test(m))).toEqual([]);
  });

  it('primitive armor only on primitive fighters', () => {
    expect(fErrors({ ...newFighter('3025'), armorType: 'primitive' })).toContain('Primitive fighter armor is only for primitive fighters.');
    expect(fErrors({ ...newFighter('3025'), cockpitType: 'primitive', armorType: 'ferro-fibrous' }).some((m) => /primitive or standard armor/.test(m))).toBe(true);
  });
});

describe('primitive small craft and DropShips', () => {
  const ds = (year?: number): VesselDesign => ({ ...newVessel('3025', 'IS', 'dropship'), tonnage: 3000, safeThrust: 4, ...(year ? { primitiveYear: year } : {}) });

  it('year-based factors', () => {
    expect(primitiveFactor('engine', { vesselType: 'dropship', primitiveYear: 2320 })).toBe(0.0845);
    expect(primitiveFactor('engine', { vesselType: 'small-craft', primitiveYear: 2320 })).toBe(0.091);
    expect(primitiveFactor('fuel', { vesselType: 'dropship', primitiveYear: 2100 })).toBe(2.0);
    expect(primitiveFactor('controls', { vesselType: 'small-craft', primitiveYear: 2600 })).toBe(0.0075);
  });

  it('heavier engines and controls, less fuel per ton, 66% armor', () => {
    const modern = ds();
    const old = ds(2320);
    expect(vesselEngineWeight(old)).toBe(1014); // 3000 × 4 × 0.0845
    expect(vesselEngineWeight(modern)).toBe(780);
    expect(computeVessel(old).weights.controls).toBe(30); // 3000 × 0.00975 = 29.25 → 30
    expect(vesselFuelPointsPerTon(old)).toBeCloseTo(vesselFuelPointsPerTon(modern) / 1.4);
    expect(vesselMaxArmor(old)).toBe(Math.floor(vesselMaxArmor(modern) * 0.66));
    expect(vesselFreeHeatSinks({ ...old, shape: 'spheroid' })).toBe(Math.floor(Math.sqrt(1014 * 1.3)));
    expect(parseVessel(JSON.parse(JSON.stringify(old))).primitiveYear).toBe(2320);
  });

  it('only small craft and DropShips can be primitive', () => {
    const js = { ...newVessel('3025', 'IS', 'jumpship'), primitiveYear: 2300 };
    expect(vErrors(js)).toContain('Only small craft and DropShips can be built as primitive craft.');
  });
});

describe('mobile HPG and ARTS bays', () => {
  it('a mobile HPG weighs 50 tons and fits DropShips but not small craft', () => {
    const d = addVesselItem({ ...newVessel('3025', 'IS', 'dropship'), tonnage: 3000 }, 'mobile-hpg');
    expect(computeVessel(d).weights.equipment).toBe(50);
    expect(vErrors(d).some((m) => /Mobile HPG/.test(m))).toBe(false);
    const sc = addVesselItem(newVessel('3025', 'IS', 'small-craft'), 'mobile-hpg');
    expect(vErrors(sc).some((m) => /Mobile HPG cannot be mounted/.test(m))).toBe(true);
  });

  it('ARTS fighter bays weigh 25% more, need no bay crew and cost 1,000,000 more', () => {
    const plain = { ...newVessel('3025', 'IS', 'dropship'), tonnage: 3000, bays: [{ kind: 'fighter' as const, size: 6, doors: 2 }] };
    const arts = { ...plain, bays: [{ ...plain.bays[0], arts: true }] };
    expect(bayWeight(plain.bays[0])).toBe(900);
    expect(bayWeight(arts.bays[0])).toBe(1125);
    expect(computeVessel(arts).crewNeeded.bayPersonnel).toBe(0);
    expect(computeVessel(plain).crewNeeded.bayPersonnel).toBe(12);
    expect(vesselCost(arts).total).toBeGreaterThan(vesselCost(plain).total);
    expect(vErrors({ ...plain, bays: [{ kind: 'cargo' as const, size: 10, doors: 1, arts: true }] })).toContain('Cargo bays cannot use ARTS.');
  });
});

describe('infantry augmentations and disposable weapons', () => {
  const base = { ...newInfantry('3025'), armorKit: null };

  it('dermal armor adds one to the damage divisor; TSM implants halve it when unarmored', () => {
    expect(computeInfantry(base).damageDivisor).toBe(1);
    expect(computeInfantry({ ...base, augmentations: ['dermal_armor'] }).damageDivisor).toBe(2);
    expect(computeInfantry({ ...base, augmentations: ['tsm_implant'] }).damageDivisor).toBe(0.5);
    expect(computeInfantry({ ...base, augmentations: ['tsm_implant', 'dermal_armor'] }).damageDivisor).toBe(1.5);
  });

  it('dermal armor and TSM implants allow more secondary weapons', () => {
    expect(maxSecondary({ ...base, augmentations: ['dermal_armor', 'tsm_implant'] })).toBe(maxSecondary(base) + 2);
  });

  it('TSM and toxin implants add offensive BV', () => {
    expect(infantryBV({ ...base, augmentations: ['tsm_implant'] }).offensive).toBeGreaterThan(infantryBV(base).offensive);
    expect(infantryBV({ ...base, augmentations: ['gas_effuser_toxin'] }).offensive).toBeGreaterThan(infantryBV(base).offensive);
  });

  it('a disposable weapon adds 20% of its BV per trooper and its cost', () => {
    const law = { ...base, disposable: 'Rocket Launcher (LAW)' };
    expect(infantryBV(law).total).toBeGreaterThan(infantryBV(base).total);
    expect(infantryCost(law).total - infantryCost(base).total).toBe(28 * 350);
    const parsed = parseInfantry(JSON.parse(JSON.stringify({ ...law, augmentations: ['dermal_armor', 'bogus'] })));
    expect(parsed.disposable).toBe('Rocket Launcher (LAW)');
    expect(parsed.augmentations).toEqual(['dermal_armor']);
  });
});
