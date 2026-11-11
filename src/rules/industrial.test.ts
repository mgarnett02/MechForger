import { describe, expect, it } from 'vitest';
import mechs from '../data/canon/mechs.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech } from '../data/canonFormat';
import {
  addEquipment, computeMech, engineWeight, freeHeatSinks, internalStructureWeight, mechBV, mechCost, newDesign, parseDesign,
  setCockpitType, setEngineType, setEnvironmentalSealing, setMyomer, setStructureType, validate,
} from './index';
import type { MechDesign } from './types';

const M = mechs as CanonEntry[];
const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);
const industrial = (d = newDesign('3025')) => setStructureType({ ...d, tonnage: 50, walkMP: 4 }, 'industrial');

describe('IndustrialMech construction', () => {
  it('industrial structure weighs twice standard; ICE, fuel cell and fission engines are heavier', () => {
    expect(internalStructureWeight('industrial', 50)).toBe(10);
    expect(engineWeight('ice', 150)).toBe(11); // 5.5 × 2
    expect(engineWeight('fuel-cell', 150)).toBe(7); // 5.5 × 1.2 → 6.6 → 7
    expect(engineWeight('fission', 60)).toBe(5); // at least 5 tons
    expect([freeHeatSinks('standard'), freeHeatSinks('fission'), freeHeatSinks('fuel-cell'), freeHeatSinks('ice')]).toEqual([10, 5, 1, 0]);
  });

  it('an ICE IndustrialMech pays for every heat sink and needs none', () => {
    const d = { ...setEngineType(industrial(), 'ice'), engineHeatSinks: 0, equipment: [] };
    expect(computeMech(d).weights.heatSinks).toBe(0);
    expect(errors(d).some((m) => /heat sinks/.test(m))).toBe(false);
  });

  it('allows 10- and 15-ton (ultralight) Mechs', () => {
    const d = { ...newDesign('3025'), tonnage: 15, walkMP: 6 };
    expect(computeMech(d).weightClass).toBe('Ultralight');
    expect(errors(d).some((m) => /Tonnage/.test(m))).toBe(false);
  });

  it('takes no movement heat and enforces the IndustrialMech restrictions', () => {
    const d = industrial();
    expect(computeMech(d).heat.running).toBe(0);
    expect(errors({ ...d, engineType: 'xl' })).toContain('IndustrialMechs can only use standard fusion, fission, fuel cell or internal combustion engines.');
    expect(errors({ ...d, heatSinkType: 'double' })).toContain('IndustrialMechs may only mount standard single heat sinks.');
    expect(errors(setCockpitType(newDesign('3025'), 'industrial'))).toContain('Only IndustrialMechs use an industrial cockpit.');
  });

  it('industrial equipment fits BattleMechs too; Industrial TSM is for IndustrialMechs only', () => {
    expect(errors(addEquipment(industrial(), 'lift-hoist', 'RA'))).toEqual([]);
    expect(errors(addEquipment(newDesign('3025'), 'lift-hoist', 'RA')).some((m) => /industrial equipment/.test(m))).toBe(false);
    const itsm = setMyomer(industrial(), 'industrial-tsm');
    expect(itsm.equipment.filter((e) => e.equipmentId === 'tsm')).toHaveLength(12);
  });

  it('environmental sealing takes a slot in every location and a tenth of the tonnage', () => {
    const d = setEnvironmentalSealing(industrial(), true);
    expect(d.equipment.filter((e) => e.equipmentId === 'environmental-sealing')).toHaveLength(8);
    expect(computeMech(d).weights.equipment).toBe(5);
    expect(errors(d).some((m) => /Environmental sealing needs one slot/.test(m))).toBe(true);
  });
});

describe('IndustrialMech Battle Value and cost', () => {
  it('structure BV is halved; no advanced fire control costs 10% of offensive BV', () => {
    const d = industrial();
    const line = (x: MechDesign) => mechBV(x).lines.find(([l]) => l === 'Internal structure')![1];
    expect(line(d)).toBe(line({ ...d, structureType: 'standard' }) / 2);
    const afc = mechBV(d).offensive;
    expect(mechBV(setCockpitType(d, 'industrial')).offensive).toBeCloseTo(afc * 0.9);
  });

  it('cost uses the (1 + tonnage/400) multiplier and the cheaper industrial cockpit', () => {
    const c = mechCost(setCockpitType(industrial(), 'industrial'));
    expect(Object.fromEntries(c.lines)['× (1 + tonnage/400)']).toBe(1 + 50 / 400);
    expect(Object.fromEntries(c.lines).Cockpit).toBe(100000);
  });
});

describe('canon IndustrialMechs', () => {
  it('are bundled and nearly all build exactly and legally', () => {
    const ind = M.filter((e) => decodeMech(e.d).structureType === 'industrial');
    expect(ind.length).toBeGreaterThan(100);
    expect(ind.filter((e) => e.w).length / ind.length).toBeGreaterThan(0.9);
    expect(ind.filter((e) => e.ok).length / ind.length).toBeGreaterThan(0.95);
  });

  it('keep advanced types when a design file is saved and loaded', () => {
    const e = M.find((x) => x.n === 'Carbine CON-1 ConstructionMech')!;
    const d = decodeMech(e.d);
    const back = parseDesign(JSON.parse(JSON.stringify(d)));
    expect([back.structureType, back.engineType, back.armorType]).toEqual([d.structureType, d.engineType, d.armorType]);
    expect(computeMech(back).weights.total).toBe(d.tonnage);
  });
});
