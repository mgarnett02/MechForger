import { describe, expect, it } from 'vitest';
import {
  ERAS, addEquipment, armorPointsPerTon, armorTonnage, autoAllocate, computeMech, designStatus, engineWeight,
  getEquipment, gyroWeightFor, isEquipmentAvailable, newDesign, setArmorType, setEngineType, setGyroType,
  setJumpJetType, setJumpMP, setTechBase, technicalReadout, validate,
} from './index';
import type { MechDesign } from './types';
import { PRESETS } from '../data/canonical';

const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);
const warnings = (d: MechDesign) => validate(d).filter((i) => i.severity === 'warning').map((i) => i.message);
const jihad = () => newDesign('3068');
const eq = (id: string) => getEquipment(id)!;

describe('all eras', () => {
  it('every era can be selected', () => {
    expect(ERAS.every((e) => e.available)).toBe(true);
    expect(ERAS.map((e) => e.id)).toEqual(['3025', '3050', '3062', '3068', '3081', '3101', '3131', '3151']);
  });

  it('later eras keep all earlier equipment', () => {
    for (const id of ['3081', '3101', '3131', '3151'] as const) {
      expect(isEquipmentAvailable(eq('mml-5'), id, 'IS')).toBe(true);
      expect(isEquipmentAvailable(eq('clan-hag-20'), id, 'Clan')).toBe(true);
      expect(isEquipmentAvailable(eq('medium-laser'), id, 'IS')).toBe(true);
    }
  });

  it('the 3025 Atlas is still legal in the ilClan era', () => {
    const atlas = { ...PRESETS.find((p) => p.key.startsWith('Atlas'))!.build(), era: '3151' as const };
    expect(errors(atlas)).toEqual([]);
  });
});

describe('Jihad construction', () => {
  it('compact engine: 150% weight, only 3 center-torso slots', () => {
    expect(engineWeight('compact', 300)).toBe(28.5); // 19 × 1.5
    expect(engineWeight('compact', 200)).toBe(13); // 8.5 × 1.5 = 12.75
    const s = computeMech(setEngineType(jihad(), 'compact'));
    expect(s.slots.CT.free).toBe(12 - 3 - 4);
    expect(s.slots.LT.slots[0].label).not.toContain('Engine');
  });

  it('compact gyro: 150% weight rounded up to the half ton, 2 slots', () => {
    expect(gyroWeightFor('compact', 300)).toBe(4.5);
    expect(gyroWeightFor('compact', 200)).toBe(3);
    const s = computeMech(setGyroType(setEngineType(jihad(), 'compact'), 'compact'));
    expect(s.slots.CT.free).toBe(12 - 3 - 2);
  });

  it('Heavy Ferro-Fibrous: ×1.24 points per ton, 21 slots', () => {
    const ppt = armorPointsPerTon('heavy-ferro', 'IS');
    expect(ppt).toBeCloseTo(19.84);
    expect(armorTonnage(198, ppt)).toBe(10);
    expect(armorTonnage(199, ppt)).toBe(10.5);
    expect(setArmorType(jihad(), 'heavy-ferro').equipment.filter((e) => e.equipmentId === 'ferro-fibrous')).toHaveLength(21);
  });

  it('improved jump jets: double weight and slots, jump up to running MP', () => {
    let d = setJumpMP(setJumpJetType(jihad(), 'improved'), 6); // walk 4, run 6
    let s = computeMech(d);
    expect(s.jumpMP).toBe(6);
    expect(s.weights.jumpJets).toBe(6); // 6 × 1 t at 50 tons
    expect(errors(d).some((m) => m.includes('cannot exceed'))).toBe(false);
    d = autoAllocate(d);
    expect(computeMech(d).unallocated).toHaveLength(0);
    d = setJumpMP(d, 7);
    expect(errors(d).some((m) => m.includes('cannot exceed running MP (6)'))).toBe(true);
    s = computeMech(setJumpJetType(d, 'standard'));
    expect(s.weights.jumpJets).toBe(3.5);
  });

  it('Clans had improved jump jets before the Jihad', () => {
    const clan = setJumpJetType(setTechBase(newDesign('3050', 'Clan'), 'Clan'), 'improved');
    expect(errors(clan).some((m) => m.includes('Improved jump jets'))).toBe(false);
    const is = setJumpJetType(newDesign('3062'), 'improved');
    expect(errors(is)).toContain('Improved jump jets cannot be used in the Civil War era.');
  });

  it('Jihad components are illegal earlier', () => {
    const d = setArmorType(setGyroType(setEngineType(newDesign('3062'), 'compact'), 'compact'), 'heavy-ferro');
    const e = errors(d);
    expect(e).toContain('Compact engines cannot be used in the Civil War era.');
    expect(e).toContain('Compact gyros cannot be used in the Civil War era.');
    expect(e).toContain('Heavy Ferro-Fibrous armor cannot be used in the Civil War era.');
  });
});

describe('Jihad equipment', () => {
  it('availability', () => {
    expect(isEquipmentAvailable(eq('mml-7'), '3062', 'IS')).toBe(false);
    expect(isEquipmentAvailable(eq('mml-7'), '3068', 'IS')).toBe(true);
    expect(isEquipmentAvailable(eq('clan-hag-40'), '3068', 'IS')).toBe(false);
    expect(isEquipmentAvailable(eq('heavy-ppc'), '3062', 'IS')).toBe(true); // 3067
    expect(isEquipmentAvailable(eq('clan-er-flamer'), '3062', 'Clan')).toBe(true);
  });

  it('MML takes either LRM or SRM ammunition', () => {
    const base = addEquipment(jihad(), 'mml-5', 'LT');
    expect(warnings(base).some((m) => m.includes('MML 5 has no ammunition'))).toBe(true);
    expect(warnings(addEquipment(base, 'ammo-mml-5-srm', 'LT')).some((m) => m.includes('MML 5 has no'))).toBe(false);
    expect(eq('ammo-mml-5-lrm').name).toBe('MML 5 LRM Ammo (24)');
    expect(eq('ammo-mml-9-srm').name).toBe('MML 9 SRM Ammo (11)');
  });
});

describe('Jihad samples', () => {
  for (const p of PRESETS.filter((x) => x.era === '3068')) {
    it(`${p.key} is exactly at tonnage and fully legal`, () => {
      const d = p.build();
      expect(computeMech(d).weights.total).toBe(d.tonnage);
      expect(errors(d)).toEqual([]);
      expect(designStatus(validate(d))).toBe('legal');
    });
  }

  it('Rampart readout', () => {
    const text = technicalReadout(PRESETS.find((p) => p.key.startsWith('Rampart'))!.build());
    expect(text).toContain('Gyro: Compact');
    expect(text).toContain('Improved Jump Jets');
    expect(text).toContain('Jumping MP: 6');
  });
});
