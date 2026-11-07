import { describe, expect, it } from 'vitest';
import {
  addEquipment, armorTonnage, autoAllocate, computeMech, engineWeight, internalStructureWeight,
  isEquipmentAvailable, getEquipment, mascWeight, newDesign, setArmorType, setEngineType,
  setHeatSinkTotal, setHeatSinkType, setStructureType, setTechBase, technicalReadout, validate,
  parseDesign, armorPointsPerTon, designStatus,
} from './index';
import type { MechDesign } from './types';
import { PRESETS } from '../data/canonical';

const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);
const preset = (key: string) => PRESETS.find((p) => p.key.startsWith(key))!.build();
const clanDesign = () => setTechBase(newDesign('3050', 'Clan'), 'Clan');

describe('3050 construction tables', () => {
  it('XL engine is half standard weight rounded up to the half ton', () => {
    expect(engineWeight('xl', 300)).toBe(9.5);
    expect(engineWeight('xl', 250)).toBe(6.5);
    expect(engineWeight('xl', 200)).toBe(4.5);
    expect(engineWeight('xl', 400)).toBe(26.5);
    expect(engineWeight('standard', 300)).toBe(19);
  });

  it('Endo Steel is 5% of tonnage rounded up to the half ton', () => {
    expect(internalStructureWeight('endo-steel', 20)).toBe(1);
    expect(internalStructureWeight('endo-steel', 55)).toBe(3);
    expect(internalStructureWeight('endo-steel', 75)).toBe(4);
    expect(internalStructureWeight('endo-steel', 100)).toBe(5);
  });

  it('Ferro-Fibrous armor points per ton', () => {
    expect(armorPointsPerTon('standard', 'IS')).toBe(16);
    const isFF = armorPointsPerTon('ferro-fibrous', 'IS');
    const clanFF = armorPointsPerTon('ferro-fibrous', 'Clan');
    expect(armorTonnage(179, isFF)).toBe(10); // 10 t × 17.92 = 179
    expect(armorTonnage(180, isFF)).toBe(10.5);
    expect(armorTonnage(192, clanFF)).toBe(10); // 10 t × 19.2 = 192
    expect(armorTonnage(193, clanFF)).toBe(10.5);
    expect(armorTonnage(8, isFF)).toBe(0.5); // 0.5 t = 8.96 → 8 points
    expect(armorTonnage(9, isFF)).toBe(1);
  });

  it('MASC weight', () => {
    expect(mascWeight(75, 'IS')).toBe(4);
    expect(mascWeight(45, 'IS')).toBe(2);
    expect(mascWeight(75, 'Clan')).toBe(3);
  });
});

describe('3050 sample designs', () => {
  for (const p of PRESETS.filter((x) => x.era === '3050')) {
    it(`${p.key} is exactly at tonnage and fully legal`, () => {
      const d = p.build();
      const s = computeMech(d);
      expect(s.weights.total).toBe(d.tonnage);
      expect(errors(d)).toEqual([]);
      expect(designStatus(validate(d))).toBe('legal');
    });
  }

  it('Grimfang derived values', () => {
    const d = preset('Grimfang');
    const s = computeMech(d);
    expect(s.engineWeight).toBe(12); // 325 XL
    expect(s.weights.structure).toBe(3.5);
    expect(s.armorTotal).toBe(211);
    expect(s.weights.armor).toBe(11);
    expect(s.heatSinks).toMatchObject({ total: 16, dissipation: 32 });
    expect(s.slots.LT.slots.slice(0, 2).map((x) => x.label)).toEqual(['XL Fusion Engine', 'XL Fusion Engine']);
    expect(technicalReadout(d)).toContain('Engine: 325 XL');
  });
});

describe('component rules', () => {
  it('IS XL takes 3 slots per side torso, Clan XL 2', () => {
    const is = setEngineType(newDesign('3050'), 'xl');
    // newDesign() already has one heat sink in each side torso.
    expect(computeMech(is).slots.LT.free).toBe(12 - 3 - 1);
    const clan = setEngineType(clanDesign(), 'xl');
    expect(computeMech(clan).slots.RT.free).toBe(12 - 2 - 1);
  });

  it('Endo Steel / Ferro-Fibrous add placeholders that must be placed', () => {
    let d = setStructureType(newDesign('3050'), 'endo-steel');
    d = setArmorType(d, 'ferro-fibrous');
    expect(d.equipment.filter((e) => e.equipmentId === 'endo-steel')).toHaveLength(14);
    expect(d.equipment.filter((e) => e.equipmentId === 'ferro-fibrous')).toHaveLength(14);
    expect(errors(d).some((m) => m.includes('not allocated'))).toBe(true);
    d = autoAllocate(d);
    expect(computeMech(d).unallocated).toHaveLength(0);
    expect(errors(d)).toEqual([]);
    // Switching back removes them.
    d = setArmorType(setStructureType(d, 'standard'), 'standard');
    expect(d.equipment.some((e) => e.equipmentId === 'endo-steel' || e.equipmentId === 'ferro-fibrous')).toBe(false);
  });

  it('Clan Endo Steel needs only 7 slots', () => {
    const d = setStructureType(clanDesign(), 'endo-steel');
    expect(d.equipment.filter((e) => e.equipmentId === 'endo-steel')).toHaveLength(7);
  });

  it('double heat sinks dissipate 2 each and take 3 (IS) / 2 (Clan) slots', () => {
    let d = setHeatSinkType(setHeatSinkTotal(newDesign('3050'), 12), 'double');
    const s = computeMech(d);
    expect(s.heatSinks.dissipation).toBe(24);
    const ext = d.equipment.filter((e) => e.equipmentId === 'double-heat-sink');
    expect(ext).toHaveLength(4); // engine 200 holds 8
    expect(ext.every((e) => e.location === null)).toBe(true); // re-sized, so unplaced
    d = autoAllocate(d);
    expect(computeMech(d).slots.LT.free).toBe(0); // 4 × 3 slots
    expect(computeMech(d).unallocated).toHaveLength(0);
    const clan = setHeatSinkType(setHeatSinkTotal(clanDesign(), 12), 'double');
    expect(clan.equipment.filter((e) => e.equipmentId === 'clan-double-heat-sink')).toHaveLength(4);
  });

  it('MASC raises running MP to walk × 2', () => {
    const d = addEquipment(newDesign('3050'), 'masc', 'CT');
    const s = computeMech(d);
    expect(s.mascRunMP).toBe(8);
    expect(s.slots.CT.overflow).toBe(1); // 50 t MASC: 3 tons, 3 slots; CT has 2 free
  });
});

describe('era and tech base availability', () => {
  it('3050 tech is illegal in 3025', () => {
    const d = setEngineType({ ...newDesign('3025') }, 'xl');
    expect(errors(d).some((m) => m.includes('XL engines cannot be used in the Succession Wars era'))).toBe(true);
    const w = addEquipment(newDesign('3025'), 'er-large-laser', 'RT');
    expect(errors(w).some((m) => m === 'ER Large Laser is not available in the Succession Wars era.')).toBe(true);
  });

  it('Clan cannot be built in 3025', () => {
    expect(errors(newDesign('3025', 'Clan')).some((m) => m.includes('cannot be built in the Succession Wars'))).toBe(true);
  });

  it('tech bases cannot mix', () => {
    const clanOnIS = addEquipment(newDesign('3050'), 'clan-er-large-laser', 'RT');
    expect(errors(clanOnIS).some((m) => m.includes('Clan ER Large Laser is not available to Inner Sphere'))).toBe(true);
    const isOnClan = addEquipment(clanDesign(), 'medium-laser', 'RT');
    expect(errors(isOnClan).some((m) => m.includes('Medium Laser is not available to Clan'))).toBe(true);
  });

  it('catalog filtering', () => {
    const eq = (id: string) => getEquipment(id)!;
    expect(isEquipmentAvailable(eq('medium-laser'), '3050', 'IS')).toBe(true);
    expect(isEquipmentAvailable(eq('gauss-rifle'), '3025', 'IS')).toBe(false);
    expect(isEquipmentAvailable(eq('clan-gauss-rifle'), '3050', 'Clan')).toBe(true);
    expect(isEquipmentAvailable(eq('clan-gauss-rifle'), '3050', 'IS')).toBe(false);
    expect(isEquipmentAvailable(eq('ammo-clan-lrm-20'), '3050', 'Clan')).toBe(true);
  });

  it('mixing single and double heat sinks is an error', () => {
    const d = addEquipment({ ...newDesign('3050'), heatSinkType: 'double' }, 'heat-sink', 'LT');
    expect(errors(d).some((m) => m.includes('cannot be mixed'))).toBe(true);
  });

  it('older saved files load as 3025 Inner Sphere standard tech', () => {
    const { techBase: _a, structureType: _b, engineType: _c, heatSinkType: _d, armorType: _e, ...old } =
      PRESETS[0].build();
    const d = parseDesign(JSON.parse(JSON.stringify(old)));
    expect(d).toMatchObject({ techBase: 'IS', structureType: 'standard', engineType: 'standard' });
  });
});
